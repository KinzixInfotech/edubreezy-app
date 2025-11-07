import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, BellOff, FileText, X } from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn, FadeOut } from 'react-native-reanimated';
import HapticTouchable from '../components/HapticTouch';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNotification } from '../../contexts/NotificationContext';
import { useMarkNoticeRead } from '../../hooks/useMarkNoticeRead';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const categories = ['All', 'Unread', 'GENERAL', 'EMERGENCY', 'EXAM', 'HOLIDAY'];
// Empty State Component
const EmptyState = () => {
  return (
    <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
      <Animated.View
        entering={FadeInDown.delay(100).duration(600).springify()}
        style={styles.emptyIconContainer}
      >
        <BellOff size={64} color="#0469ff" strokeWidth={1.5} />
      </Animated.View>
      <Animated.Text
        entering={FadeInDown.delay(200).duration(600)}
        style={styles.emptyTitle}
      >
        No Notifications
      </Animated.Text>
      <Animated.Text
        entering={FadeInDown.delay(300).duration(600)}
        style={styles.emptyMessage}
      >
        You're all caught up! {'\n'}
        Check back later for new updates.
      </Animated.Text>
    </Animated.View>
  );
};

const NoticeBoardScreen = () => {
  // ──────────────────────────────────────────────────────
  // 1. User / school ids
  // ──────────────────────────────────────────────────────
  const [schoolId, setSchoolId] = useState(null);
  const [userId, setUserId] = useState(null);

  const { clearNoticeBadge } = useNotification();
  const queryClient = useQueryClient();
  const markRead = useMarkNoticeRead();          // ← NEW

  // Clear badge when screen opens
  useEffect(() => {
    clearNoticeBadge();
  }, [clearNoticeBadge]);

  // Load user from SecureStore (once)
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync('user');
        if (raw) {
          const cfg = JSON.parse(raw);
          setSchoolId(cfg?.schoolId ?? null);
          setUserId(cfg?.id ?? null);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // ──────────────────────────────────────────────────────
  // 2. Category & pagination state
  // ──────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [page, setPage] = useState(1);
  const [allNotices, setAllNotices] = useState([]);
  const [hasMore, setHasMore] = useState(true);

  // ──────────────────────────────────────────────────────
  // 3. Modal state
  // ──────────────────────────────────────────────────────
  const [selectedNotice, setSelectedNotice] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  // ──────────────────────────────────────────────────────
  // 4. React-Query: fetch notices
  // ──────────────────────────────────────────────────────
  const {
    data,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['notices', schoolId, userId, selectedCategory, page],
    queryFn: async () => {
      if (!schoolId || !userId) return { notices: [], pagination: {} };

      const cat = selectedCategory === 'All' ? '' : `&category=${selectedCategory}`;
      const unread = selectedCategory === 'Unread' ? '&unread=true' : '';

      const res = await api.get(
        `/notices/${schoolId}?userId=${userId}${cat}${unread}&limit=20&page=${page}`
      );
      return res.data; // { notices: [], pagination: { totalPages, currentPage } }
    },
    enabled: !!schoolId && !!userId,
    keepPreviousData: true,
    staleTime: 0,               // ← force fresh data on mount / category change
  });

  // ──────────────────────────────────────────────────────
  // 5. Merge pages into a single array
  // ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!data?.notices) return;

    if (page === 1) {
      setAllNotices(data.notices);
    } else {
      setAllNotices(prev => [...prev, ...data.notices]);
    }
    setHasMore((data.pagination?.currentPage ?? 0) < (data.pagination?.totalPages ?? 0));
  }, [data, page]);

  // ──────────────────────────────────────────────────────
  // 6. Pull-to-refresh & load-more
  // ──────────────────────────────────────────────────────
  const onRefresh = useCallback(() => {
    setPage(1);
    refetch();
  }, [refetch]);

  const loadMore = useCallback(() => {
    if (!isFetching && hasMore) setPage(p => p + 1);
  }, [isFetching, hasMore]);

  // ──────────────────────────────────────────────────────
  // 7. Open modal → mark as read (background)
  // ──────────────────────────────────────────────────────
  // ────── Open modal & mark read ──────
  const openNoticeDetail = useCallback(
    (notice) => {
      setSelectedNotice(notice);
      setModalVisible(true);

      // <-- ONLY FIRE WHEN IT IS UNREAD
      if (!notice.read && userId) {
        markRead.mutate({ noticeId: notice.id, userId, schoolId });
      }
    },
    [userId, markRead, schoolId]   // <-- include markRead in deps
  );
  const closeModal = () => {
    setModalVisible(false);
    setTimeout(() => setSelectedNotice(null), 300);
  };

  // ──────────────────────────────────────────────────────
  // 8. Render item
  // ──────────────────────────────────────────────────────
  const renderNoticeItem = ({ item, index }) => {
    const formatted = item.publishedAt
      ? new Date(item.publishedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      : '';

    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(400)}>
        <HapticTouchable onPress={() => openNoticeDetail(item)}>
          <View style={styles.noticeItem}>
            <View style={styles.noticeIconContainer}>
              <FileText size={22} color="#0469ff" />
            </View>
            <View style={styles.noticeContent}>
              <Text style={styles.noticeDate}>{formatted}</Text>
              <Text style={styles.noticeTitle}>{item.title}</Text>
              <Text style={styles.noticeSubtitle}>{item.subtitle}</Text>
            </View>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
        </HapticTouchable>
      </Animated.View>
    );
  };

  // ──────────────────────────────────────────────────────
  // 9. UI
  // ──────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <HapticTouchable onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color="#111" />
        </HapticTouchable>
        <Text style={styles.headerTitle}>Notice Board</Text>
      </Animated.View>

      {/* Category Pills */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryContainer}
          contentContainerStyle={styles.categoryContent}
        >
          {categories.map((cat, i) => (
            <HapticTouchable
              key={cat}
              onPress={() => {
                setSelectedCategory(cat);
                setPage(1);               // reset pagination when category changes
                queryClient.invalidateQueries({ queryKey: ['notices'] });
              }}
            >
              <Animated.View
                entering={FadeInDown.delay(150 + i * 50).duration(400)}
                style={[
                  styles.categoryPill,
                  selectedCategory === cat && styles.categoryPillActive,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    selectedCategory === cat && styles.categoryTextActive,
                  ]}
                >
                  {cat}
                </Text>
              </Animated.View>
            </HapticTouchable>
          ))}
        </ScrollView>
      </Animated.View>

      {/* Loading / List */}
      {isLoading && page === 1 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0469ff" />
        </View>
      ) : (
        <FlatList
          data={allNotices}
          renderItem={renderNoticeItem}
          keyExtractor={item => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isFetching && page === 1} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            isFetching && page > 1 ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator size="small" color="#0469ff" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState />

          }
        />
      )}

      {/* ──────────────────────── Modal ──────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(300)} style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>Notice Details</Text>
              <HapticTouchable onPress={closeModal}>
                <View style={styles.closeButton}>
                  <X size={24} color="#111" />
                </View>
              </HapticTouchable>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedNotice && (
                <>
                  {/* Issued By */}
                  <View style={styles.issuedBySection}>
                    <Text style={styles.issuedByLabel}>Issued by: {selectedNotice.issuedBy}</Text>
                    <Text style={styles.issuedByRole}>{selectedNotice.issuerRole}</Text>
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
                    <View style={styles.datesSection}>
                      <Text style={styles.datesSectionTitle}>Expiry Date</Text>
                      <Text style={styles.dateValue}>
                        {new Date(selectedNotice.expiryDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.actionButtons}>
                    {/* You can keep "Mark as Read" if you want a manual button */}
                    {/* <HapticTouchable ...>Mark As Read</HapticTouchable> */}
                    <HapticTouchable onPress={closeModal} style={styles.actionButtonSecondary}>
                      <View style={styles.actionButtonSecondaryInner}>
                        <Text style={styles.actionButtonSecondaryText}>Close</Text>
                      </View>
                    </HapticTouchable>
                  </View>
                </>
              )}
            </ScrollView>
          </Animated.View>
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
    backgroundColor: '#fff',
    gap: 20,
  },
  backButton: {
    // padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
  },
  categoryContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  categoryContent: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    marginRight: 8,
  },
  categoryPillActive: {
    backgroundColor: '#0469ff',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  categoryTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  listContent: {
    padding: 16,
  },
  noticeItem: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
  },
  noticeIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F4FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeContent: {
    flex: 1,
  },
  noticeDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  noticeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 4,
  },
  noticeSubtitle: {
    fontSize: 13,
    color: '#666',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0469ff',
    alignSelf: 'center',
  },
  // Modal Styles
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
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    paddingHorizontal: 20,
  },
  issuedBySection: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  issuedByLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  issuedByRole: {
    fontSize: 13,
    color: '#999',
  },
  contentSection: {
    paddingVertical: 20,
  },
  contentTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111',
    marginBottom: 8,
  },
  contentDate: {
    fontSize: 13,
    color: '#999',
    marginBottom: 16,
  },
  contentBody: {
    fontSize: 15,
    color: '#333',
    lineHeight: 24,
  },
  datesSection: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  datesSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  dateLabel: {
    fontSize: 14,
    color: '#666',
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111',
  },
  actionButtons: {
    gap: 12,
    paddingBottom: 30,
  },
  actionButtonPrimary: {
    width: '100%',
  },
  actionButtonPrimaryInner: {
    backgroundColor: '#0469ff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonPrimaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionButtonSecondary: {
    width: '100%',
  },
  actionButtonSecondaryInner: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  actionButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  // / Empty State Styles
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',

    paddingHorizontal: 40,
    paddingBottom: 100,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f8ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  emptyMessage: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default NoticeBoardScreen;