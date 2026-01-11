import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Modal,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, BellOff, FileText, X, Megaphone, Send, Inbox, Image as ImageIcon, Eye } from 'lucide-react-native';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import HapticTouchable from '../components/HapticTouch';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../contexts/NotificationContext';
import { useMarkNoticeRead } from '../../hooks/useMarkNoticeRead';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const categories = ['All', 'Unread', 'GENERAL', 'EMERGENCY', 'EXAM', 'HOLIDAY'];
const BROADCAST_ROLES = ['DIRECTOR', 'PRINCIPAL'];

// Empty State Component
const EmptyState = React.memo(({ isSentTab }) => (
  <View style={styles.emptyStateWrapper}>
    <View style={styles.emptyIconContainer}>
      {isSentTab ? (
        <Send size={56} color="#0469ff" strokeWidth={1.5} />
      ) : (
        <BellOff size={56} color="#0469ff" strokeWidth={1.5} />
      )}
    </View>
    <Text style={styles.emptyTitle}>
      {isSentTab ? 'No Broadcasts Yet' : 'No Notifications'}
    </Text>
    <Text style={styles.emptyMessage}>
      {isSentTab
        ? 'Tap the + button to send your first broadcast.'
        : "You're all caught up!\nCheck back later for updates."}
    </Text>
  </View>
));

// Helper to get initials from name
const getInitials = (name) => {
  if (!name) return '?';
  const words = name.trim().split(' ').filter(Boolean);
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
};

// Author Avatar Component
const AuthorAvatar = React.memo(({ profilePic, name, size = 40, isSent = false }) => {
  const initials = getInitials(name);
  const containerSize = size;
  const fontSize = size * 0.4;

  if (profilePic) {
    return (
      <Image
        source={{ uri: profilePic }}
        style={[styles.authorAvatar, { width: containerSize, height: containerSize, borderRadius: containerSize / 2 }]}
        contentFit="cover"
      />
    );
  }

  return (
    <View style={[
      styles.authorAvatarFallback,
      { width: containerSize, height: containerSize, borderRadius: containerSize / 2 },
      isSent && styles.sentAvatarFallback
    ]}>
      <Text style={[styles.authorAvatarInitials, { fontSize }]}>{initials}</Text>
    </View>
  );
});

const NoticeBoardScreen = () => {
  // User state (forcing refresh)
  const [schoolId, setSchoolId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isUserLoaded, setIsUserLoaded] = useState(false);

  const { clearNoticeBadge } = useNotification();
  const queryClient = useQueryClient();
  const markRead = useMarkNoticeRead();

  const canBroadcast = BROADCAST_ROLES.includes(userRole);

  // Clear badge on mount
  useEffect(() => {
    clearNoticeBadge();
  }, []);

  // Load user from SecureStore
  useEffect(() => {
    const loadUser = async () => {
      try {
        const raw = await SecureStore.getItemAsync('user');
        if (raw) {
          const cfg = JSON.parse(raw);
          setSchoolId(cfg?.schoolId ?? null);
          setUserId(cfg?.id ?? null);
          setUserRole(cfg?.role?.name ?? null);
        }
      } catch (e) {
        console.error('Error loading user:', e);
      } finally {
        setIsUserLoaded(true);
      }
    };
    loadUser();
  }, []);

  // Tab state
  const [activeTab, setActiveTab] = useState('received');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Fetch notices
  const {
    data: notices = [],
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['notices', schoolId, userId, selectedCategory, activeTab],
    queryFn: async () => {
      if (!schoolId || !userId) return [];

      if (activeTab === 'sent' && canBroadcast) {
        const res = await api.get(`/schools/${schoolId}/broadcast?limit=50`);
        return (res.data.broadcasts || []).map(b => ({
          ...b,
          read: true,
          isSent: true,
        }));
      }

      // Build query params based on selected filter
      // 'All' = no filters, 'Unread' = unread only, others = category filter
      let queryParams = `userId=${userId}&limit=50`;

      if (selectedCategory === 'Unread') {
        queryParams += '&unread=true';
      } else if (selectedCategory !== 'All') {
        queryParams += `&category=${selectedCategory}`;
      }

      const res = await api.get(`/notices/${schoolId}?${queryParams}`);
      return res.data.notices || [];
    },
    enabled: isUserLoaded && !!schoolId && !!userId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Reset category when tab changes
  useEffect(() => {
    if (activeTab === 'sent') {
      setSelectedCategory('All');
    }
  }, [activeTab]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // Modal state
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openNoticeDetail = useCallback((notice) => {
    setSelectedNotice(notice);
    setModalVisible(true);
    if (!notice.read && userId && !notice.isSent) {
      markRead.mutate({ noticeId: notice.id, userId, schoolId });
    }
  }, [userId, markRead, schoolId]);

  const closeModal = useCallback(() => {
    setModalVisible(false);
    setSelectedNotice(null);
  }, []);

  const openBroadcastScreen = useCallback(() => {
    router.push('/(screens)/director/broadcast');
  }, []);

  // Optimized render item
  const renderNoticeItem = useCallback(({ item }) => {
    const formatted = item.publishedAt
      ? new Date(item.publishedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })
      : '';

    const hasImage = !!item.fileUrl;
    const authorName = item.authorName || item.issuedBy || 'Unknown';
    const authorPic = item.authorProfilePic;

    return (
      <HapticTouchable onPress={() => openNoticeDetail(item)}>
        <View style={[styles.noticeItem, item.isSent && styles.sentNoticeItem]}>
          {/* Image Preview if exists */}
          {hasImage && (
            <Image
              source={{ uri: item.fileUrl }}
              style={styles.noticeThumb}
              contentFit="cover"
            />
          )}
          {/* Icon if no image */}
          {!hasImage && (
            <View style={[styles.noticeIconContainer, item.isSent && styles.sentIconContainer]}>
              {item.isSent ? <Send size={20} color="#10B981" /> : <FileText size={20} color="#0469ff" />}
            </View>
          )}
          <View style={styles.noticeContent}>
            <View style={styles.noticeHeaderRow}>
              <Text style={styles.noticeDate}>{formatted}</Text>
              {item.isSent && (
                <View style={styles.viewCountContainer}>
                  <Eye size={12} color="#6B7280" />
                  <Text style={styles.viewCountText}>{item.viewCount || 0}</Text>
                </View>
              )}
            </View>
            <Text style={styles.noticeTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.noticeSubtitle} numberOfLines={1}>
              {item.subtitle || item.description?.substring(0, 50)}
            </Text>
          </View>
          {!item.read && !item.isSent && <View style={styles.unreadDot} />}
        </View>
      </HapticTouchable>
    );
  }, [openNoticeDetail]);

  const keyExtractor = useCallback((item) => item.id, []);

  // Show loading only on initial load
  const showInitialLoader = !isUserLoaded || (isLoading && notices.length === 0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <HapticTouchable onPress={() => router.back()}>
          <ArrowLeft size={24} color="#111" />
        </HapticTouchable>
        <Text style={styles.headerTitle}>Notice Board</Text>
      </View>

      {/* Tabs for Director/Principal */}
      {canBroadcast && (
        <View style={styles.tabContainer}>
          <HapticTouchable
            style={[styles.tab, activeTab === 'received' && styles.activeTab]}
            onPress={() => setActiveTab('received')}
          >
            <Inbox size={16} color={activeTab === 'received' ? '#0469ff' : '#9CA3AF'} />
            <Text style={[styles.tabText, activeTab === 'received' && styles.activeTabText]}>
              Received
            </Text>
          </HapticTouchable>
          <HapticTouchable
            style={[styles.tab, activeTab === 'sent' && styles.activeTab]}
            onPress={() => setActiveTab('sent')}
          >
            <Send size={16} color={activeTab === 'sent' ? '#0469ff' : '#9CA3AF'} />
            <Text style={[styles.tabText, activeTab === 'sent' && styles.activeTabText]}>
              Sent
            </Text>
          </HapticTouchable>
        </View>
      )}

      {/* Category Pills (only for received tab) */}
      {activeTab === 'received' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryContainer}
          contentContainerStyle={styles.categoryContent}
        >
          {categories.map((cat) => (
            <HapticTouchable
              key={cat}
              onPress={() => setSelectedCategory(cat)}
            >
              <View style={[styles.categoryPill, selectedCategory === cat && styles.categoryPillActive]}>
                <Text style={[styles.categoryText, selectedCategory === cat && styles.categoryTextActive]}>
                  {cat}
                </Text>
              </View>
            </HapticTouchable>
          ))}
        </ScrollView>
      )}

      {/* Content */}
      {showInitialLoader ? (
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color="#0469ff" />
        </View>
      ) : (
        <FlatList
          data={notices}
          renderItem={renderNoticeItem}
          keyExtractor={keyExtractor}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.listContent,
            notices.length === 0 && styles.emptyListContent,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={onRefresh}
              tintColor="#0469ff"
            />
          }
          ListEmptyComponent={<EmptyState isSentTab={activeTab === 'sent'} />}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
        />
      )}

      {/* FAB */}
      {canBroadcast && (
        <HapticTouchable onPress={openBroadcastScreen} style={styles.fab}>
          <Megaphone size={24} color="#fff" />
        </HapticTouchable>
      )}

      {/* Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>
                {selectedNotice?.isSent ? 'Broadcast Details' : 'Notice Details'}
              </Text>
              <HapticTouchable onPress={closeModal}>
                <X size={24} color="#111" />
              </HapticTouchable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedNotice && (
                <>
                  {/* Image Display */}
                  {selectedNotice.fileUrl && (
                    <View style={styles.modalImageContainer}>
                      <Image
                        source={{ uri: selectedNotice.fileUrl }}
                        style={styles.modalImage}
                        contentFit="cover"
                      />
                    </View>
                  )}

                  {/* Issued By with Avatar */}
                  <View style={styles.issuedBySection}>
                    <View style={styles.issuedByRow}>
                      <AuthorAvatar
                        profilePic={selectedNotice.authorProfilePic}
                        name={selectedNotice.authorName || selectedNotice.issuedBy}
                        size={48}
                        isSent={selectedNotice.isSent}
                      />
                      <View style={styles.issuedByInfo}>
                        <Text style={styles.issuedByName}>
                          {selectedNotice.authorName || selectedNotice.issuedBy || 'You'}
                        </Text>
                        <Text style={styles.issuedByRole}>
                          {selectedNotice.issuerRole || 'Administration'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Content */}
                  <View style={styles.contentSection}>
                    <Text style={styles.contentTitle}>{selectedNotice.title}</Text>
                    <Text style={styles.contentDate}>
                      {selectedNotice.publishedAt
                        ? new Date(selectedNotice.publishedAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })
                        : ''}
                    </Text>
                    <Text style={styles.contentBody}>{selectedNotice.description}</Text>
                  </View>

                  {/* Important Dates */}
                  {selectedNotice.importantDates?.length > 0 && (
                    <View style={styles.datesSection}>
                      <Text style={styles.datesSectionTitle}>Important Dates</Text>
                      {selectedNotice.importantDates.map((d, i) => (
                        <View key={i} style={styles.dateRow}>
                          <Text style={styles.dateLabel}>{d.label}</Text>
                          <Text style={styles.dateValue}>{d.value}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Expiry */}
                  {selectedNotice.expiryDate && (
                    <View style={styles.expiryBadge}>
                      <Text style={styles.expiryText}>
                        Expires: {new Date(selectedNotice.expiryDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </Text>
                    </View>
                  )}

                  <HapticTouchable onPress={closeModal} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>Close</Text>
                  </HapticTouchable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
  },
  activeTab: {
    backgroundColor: '#E8F4FF',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  activeTabText: {
    color: '#0469ff',
  },
  categoryContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    maxHeight: 56,
  },
  categoryContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
  },
  categoryPillActive: {
    backgroundColor: '#0469ff',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },
  categoryTextActive: {
    color: '#fff',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyStateWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  noticeItem: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 12,
    alignItems: 'center',
  },
  sentNoticeItem: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  noticeThumb: {
    width: 50,
    height: 50,
    borderRadius: 10,
  },
  noticeIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentIconContainer: {
    backgroundColor: '#D1FAE5',
  },
  noticeContent: {
    flex: 1,
  },
  noticeDate: {
    fontSize: 11,
    color: '#999',
    marginBottom: 3,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  noticeSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0469ff',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0469ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0469ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111',
  },
  modalBody: {
    paddingHorizontal: 20,
  },
  modalImageContainer: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  issuedBySection: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  issuedByLabel: {
    fontSize: 14,
    color: '#666',
  },
  issuedByRole: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  contentSection: {
    paddingVertical: 16,
  },
  contentTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    marginBottom: 6,
  },
  contentDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  contentBody: {
    fontSize: 14,
    color: '#333',
    lineHeight: 22,
  },
  datesSection: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  datesSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    marginBottom: 10,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  dateLabel: {
    fontSize: 13,
    color: '#666',
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111',
  },
  expiryBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  expiryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
  },
  closeBtn: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 30,
  },
  closeBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  noticeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  viewCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    gap: 4,
  },
  viewCountText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#4B5563',
  },
  // Author Avatar styles
  authorAvatar: {
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  authorAvatarFallback: {
    backgroundColor: '#0469ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sentAvatarFallback: {
    backgroundColor: '#10B981',
  },
  authorAvatarInitials: {
    color: '#fff',
    fontWeight: '700',
  },
  noticeAuthorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111',
    flex: 1,
    marginRight: 8,
  },
  noticeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  hasImageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  hasImageText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#6B7280',
  },
  issuedByRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  issuedByInfo: {
    flex: 1,
  },
  issuedByName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },
});

export default NoticeBoardScreen;