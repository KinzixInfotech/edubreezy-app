// ============================================
// CHAT TAB - Conversation List
// ============================================

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    FlatList,
    TextInput,
    StyleSheet,
    Image,
    RefreshControl,
    Platform,
    ActivityIndicator,
    Animated as RNAnimated,
    Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { MessageCircle, Plus, BellOff, Search, Users, Trash2 } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import HapticTouchable from '../components/HapticTouch';
import { useConversations, chatKeys } from '../../hooks/useChat';
import { usePresenceStatus } from '../../hooks/usePresenceStatus';
import { useShimmer, Bone } from '../components/ScreenSkeleton';
import { deleteConversation, markConversationsReadBulk } from '../../services/chatService';

const CHAT_ROW_HEIGHT = 80;
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PAGE_SIZE = Math.max(12, Math.ceil(SCREEN_HEIGHT / CHAT_ROW_HEIGHT) + 2);
const READ_SYNC_DEBOUNCE_MS = 350;

function parseChatDate(dateStr) {
    if (!dateStr) return null;
    if (typeof dateStr !== 'string') return new Date(dateStr);
    return new Date(dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr) ? dateStr : `${dateStr}Z`);
}

// ── Skeleton ──
function ChatListSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 0 }}>
            {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={styles.conversationItem}>
                    <Bone animValue={anim} width={52} height={52} borderRadius={26} />
                    <View style={{ flex: 1, marginLeft: 14, gap: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                            <Bone animValue={anim} width={'55%'} height={15} borderRadius={5} />
                            <Bone animValue={anim} width={45} height={11} borderRadius={4} />
                        </View>
                        <Bone animValue={anim} width={'75%'} height={12} borderRadius={4} />
                    </View>
                </View>
            ))}
        </View>
    );
}

// ── Empty State ──
function EmptyState({ role }) {
    return (
        <View style={styles.emptyContainer}>
            <View style={styles.emptyIconWrap}>
                <MessageCircle size={48} color="#0469ff" strokeWidth={1.5} />
            </View>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
                {role === 'PARENT'
                    ? "Tap '+' to message your child's teacher"
                    : role === 'TEACHING_STAFF'
                        ? "Tap '+' to message parents, colleagues, or broadcast to a class"
                        : "Start a conversation by tapping the '+' button"}
            </Text>
        </View>
    );
}

// ── Conversation Item ──
function ConversationRow({ item, currentUserId, onPress, isOnline }) {
    const otherParticipant = item.participants?.[0];
    const isGroup =
        item.type === 'TEACHER_CLASS' ||
        item.type === 'COMMUNITY' ||
        (item.participants?.length || 0) > 1;
    const hasUnread = (item.unreadCount || 0) > 0;

    const timeStr = useMemo(() => {
        if (!item.lastMessageAt) return '';
        const d = parseChatDate(item.lastMessageAt);
        if (!d || Number.isNaN(d.getTime())) return '';
        const now = new Date();
        const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }, [item.lastMessageAt]);

    const avatarInitial = (() => {
        const n =
            typeof otherParticipant?.name === 'string'
                ? otherParticipant.name
                : otherParticipant?.name?.name ||
                (typeof item.title === 'string' ? item.title : '?');
        return (n || '?').charAt(0).toUpperCase();
    })();

    const roleLabel = (() => {
        if (isGroup) return null;
        const r =
            typeof otherParticipant?.role === 'string'
                ? otherParticipant.role
                : otherParticipant?.role?.name || '';
        const roleName = r === 'TEACHING_STAFF' ? 'Teacher' : r === 'PARENT' ? 'Parent' : r || null;
        const classSection = otherParticipant?.classSection;
        if (roleName && classSection) return `${roleName} · ${classSection}`;
        return roleName;
    })();

    return (
        <HapticTouchable
            style={[styles.conversationItem, hasUnread && styles.conversationItemUnread]}
            onPress={() => onPress(item)}
            activeOpacity={0.7}
        >
            {/* Avatar */}
            <View style={styles.avatarContainer}>
                {isGroup ? (
                    <View style={[styles.avatar, styles.groupAvatar]}>
                        <Users size={22} color="#0469ff" strokeWidth={2} />
                    </View>
                ) : otherParticipant?.profilePicture ? (
                    <Image source={{ uri: otherParticipant.profilePicture }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarInitial}>{avatarInitial}</Text>
                    </View>
                )}
                {!isGroup && item.type === 'DIRECT' && isOnline && (
                    <View style={styles.onlineBadge} />
                )}
                {hasUnread && <View style={styles.unreadDot} />}
            </View>

            {/* Content */}
            <View style={styles.conversationContent}>
                <View style={styles.conversationHeader}>
                    <Text
                        style={[styles.conversationName, hasUnread && styles.conversationNameUnread]}
                        numberOfLines={1}
                    >
                        {item.title || 'Chat'}
                    </Text>
                    <View style={styles.timeRow}>
                        {item.isMuted && (
                            <BellOff size={12} color="#9ca3af" strokeWidth={2} style={{ marginRight: 4 }} />
                        )}
                        <Text style={[styles.timeText, hasUnread && styles.timeTextUnread]}>
                            {timeStr}
                        </Text>
                    </View>
                </View>
                <View style={styles.previewRow}>
                    <Text
                        style={[styles.previewText, hasUnread && styles.previewTextUnread]}
                        numberOfLines={1}
                    >
                        {item.lastMessageText || 'No messages yet'}
                    </Text>
                    {hasUnread && item.unreadCount > 0 && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>
                                {item.unreadCount > 99 ? '99+' : item.unreadCount}
                            </Text>
                        </View>
                    )}
                </View>
                {roleLabel && <Text style={styles.roleTag}>{roleLabel}</Text>}
            </View>
        </HapticTouchable>
    );
}

// ── Main Screen ──
export default function ChatScreen() {
    const insets = useSafeAreaInsets();
    const [schoolId, setSchoolId] = useState(null);
    const [userId, setUserId] = useState(null);
    const [userRole, setUserRole] = useState(null);
    const [isUserLoaded, setIsUserLoaded] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const pendingReadIdsRef = useRef(new Set());
    const readFlushTimerRef = useRef(null);

    useEffect(() => {
        SecureStore.getItemAsync('user')
            .then((raw) => {
                if (raw) {
                    const cfg = JSON.parse(raw);
                    setSchoolId(cfg?.schoolId ?? null);
                    setUserId(cfg?.id ?? null);
                    setUserRole(
                        typeof cfg?.role === 'string' ? cfg.role : cfg?.role?.name ?? null
                    );
                }
            })
            .catch(console.error)
            .finally(() => setIsUserLoaded(true));
    }, []);

    const { data, isLoading, isRefetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversations(schoolId, { userId, limit: PAGE_SIZE });
    const qc = useQueryClient();

    const mergedConversations = useMemo(() => {
        const seen = new Set();
        const merged = [];

        (data?.pages || []).forEach((page) => {
            (page?.conversations || []).forEach((conversation) => {
                if (!conversation?.id || seen.has(conversation.id)) return;
                seen.add(conversation.id);
                merged.push(conversation);
            });
        });

        return merged;
    }, [data]);

    const { isUserOnline } = usePresenceStatus(schoolId, { id: userId });

    const markConversationsReadOptimistically = useCallback((conversationIds) => {
        if (!conversationIds?.length) return;

        const idSet = new Set(conversationIds);
        qc.setQueriesData({ queryKey: chatKeys.conversations(schoolId) }, (old) => {
            if (!old) return old;

            if (Array.isArray(old?.pages)) {
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        conversations: (page.conversations || []).map((conversation) => (
                            idSet.has(conversation.id)
                                ? { ...conversation, unreadCount: 0 }
                                : conversation
                        )),
                    })),
                };
            }

            if (Array.isArray(old?.conversations)) {
                return {
                    ...old,
                    conversations: old.conversations.map((conversation) => (
                        idSet.has(conversation.id)
                            ? { ...conversation, unreadCount: 0 }
                            : conversation
                    )),
                };
            }

            return old;
        });
    }, [qc, schoolId]);

    const bulkReadMutation = useMutation({
        mutationFn: (conversationIds) => markConversationsReadBulk(schoolId, { conversationIds }),
        onError: (error, conversationIds) => {
            console.error('Failed to sync chat read state:', error?.response?.data || error?.message || error);
            conversationIds?.forEach((id) => pendingReadIdsRef.current.add(id));
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: chatKeys.conversations(schoolId), refetchType: 'inactive' });
        },
    });

    const flushPendingReads = useCallback(() => {
        if (readFlushTimerRef.current) {
            clearTimeout(readFlushTimerRef.current);
            readFlushTimerRef.current = null;
        }

        if (!schoolId || pendingReadIdsRef.current.size === 0) return;

        const conversationIds = Array.from(pendingReadIdsRef.current);
        pendingReadIdsRef.current.clear();
        bulkReadMutation.mutate(conversationIds);
    }, [bulkReadMutation, schoolId]);

    const queueReadSync = useCallback((conversationIds) => {
        if (!conversationIds?.length) return;

        conversationIds.forEach((id) => pendingReadIdsRef.current.add(id));
        if (readFlushTimerRef.current) clearTimeout(readFlushTimerRef.current);
        readFlushTimerRef.current = setTimeout(() => {
            flushPendingReads();
        }, READ_SYNC_DEBOUNCE_MS);
    }, [flushPendingReads]);

    useEffect(() => {
        return () => {
            if (readFlushTimerRef.current) {
                clearTimeout(readFlushTimerRef.current);
                readFlushTimerRef.current = null;
            }
        };
    }, []);

    const conversations = useMemo(() => {
        const list = mergedConversations;
        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(
            (c) =>
                c.title?.toLowerCase().includes(q) ||
                c.lastMessageText?.toLowerCase().includes(q)
        );
    }, [mergedConversations, searchQuery]);

    // ── Delete conversation (swipe) ──
    const handleDeleteConversation = useCallback(async (convId) => {
        if (!schoolId) return;
        // Optimistic removal from cache
        qc.setQueriesData({ queryKey: chatKeys.conversations(schoolId) }, (old) => {
            if (!old) return old;
            if (Array.isArray(old?.pages)) {
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        conversations: (page.conversations || []).filter((c) => c.id !== convId),
                    })),
                };
            }
            if (!old?.conversations) return old;
            return {
                ...old,
                conversations: old.conversations.filter(c => c.id !== convId),
            };
        });
        try {
            await deleteConversation(schoolId, convId);
        } catch (e) {
            // Rollback on failure
            refetch();
        }
    }, [schoolId, qc, refetch]);

    // ── Navigate to conversation — includes profilePicture for the header avatar ──
    const handleConversationPress = useCallback((conv) => {
        if ((conv.unreadCount || 0) > 0) {
            markConversationsReadOptimistically([conv.id]);
            queueReadSync([conv.id]);
        }

        const isGroup =
            conv.type === 'TEACHER_CLASS' ||
            conv.type === 'COMMUNITY' ||
            (conv.participants?.length || 0) > 1;
        const otherParticipant = conv.participants?.[0];

        const r = typeof otherParticipant?.role === 'string'
            ? otherParticipant.role
            : otherParticipant?.role?.name || '';
        const roleName = r === 'TEACHING_STAFF' ? 'Teacher' : r === 'PARENT' ? 'Parent' : r || '';

        router.push({
            pathname: '/(screens)/chat/[conversationId]',
            params: {
                conversationId: conv.id,
                title: conv.title || 'Chat',
                schoolId,
                profilePicture:
                    !isGroup && otherParticipant?.profilePicture
                        ? otherParticipant.profilePicture
                        : undefined,
                otherRole: roleName || undefined,
                classSection: otherParticipant?.classSection || undefined,
                lastSeenAt: otherParticipant?.lastSeenAt || undefined,
            },
        });
    }, [markConversationsReadOptimistically, queueReadSync, schoolId]);

    const handleNewConversation = useCallback(() => {
        router.push({ pathname: '/(screens)/chat/new', params: { schoolId } });
    }, [schoolId]);

    const renderItem = useCallback(({ item }) => {
        const otherId = item.participants?.[0]?.id;
        const online = item.type === 'DIRECT' && otherId ? isUserOnline(otherId) : false;

        const renderRightActions = (progress) => {
            const trans = progress.interpolate({
                inputRange: [0, 1],
                outputRange: [80, 0],
            });
            return (
                <RNAnimated.View style={[styles.swipeDeleteContainer, { transform: [{ translateX: trans }] }]}>
                    <HapticTouchable
                        style={styles.swipeDeleteBtn}
                        onPress={() => handleDeleteConversation(item.id)}
                        haptic="medium"
                    >
                        <Trash2 size={20} color="#fff" strokeWidth={2} />
                        <Text style={styles.swipeDeleteText}>Delete</Text>
                    </HapticTouchable>
                </RNAnimated.View>
            );
        };

        return (
            <Swipeable
                renderRightActions={renderRightActions}
                overshootRight={false}
                friction={2}
                rightThreshold={40}
            >
                <ConversationRow
                    item={item}
                    currentUserId={userId}
                    onPress={handleConversationPress}
                    isOnline={online}
                />
            </Swipeable>
        );
    }, [userId, handleConversationPress, isUserOnline, handleDeleteConversation]);

    const keyExtractor = useCallback((item) => item.id, []);

    const handleEndReached = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage || searchQuery.trim()) return;
        fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage, searchQuery]);

    if (!isUserLoaded) return null;

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Messages</Text>
                <HapticTouchable
                    style={styles.composeButton}
                    onPress={handleNewConversation}
                    haptic="medium"
                >
                    <Plus size={22} color="#0469ff" strokeWidth={2.5} />
                </HapticTouchable>
            </View>
            {/* Search */}
            <View style={styles.searchSection}>
                <View style={styles.searchContainer}>
                    <Search size={18} color="#9ca3af" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search conversations..."
                        placeholderTextColor="#9ca3af"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        clearButtonMode="while-editing"
                    />
                </View>
            </View>
            {/* List */}
            {isLoading ? (
                <ChatListSkeleton />
            ) : conversations.length === 0 ? (
                <EmptyState role={userRole} />
            ) : (
                <FlatList
                    data={conversations}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={isRefetching}
                            onRefresh={refetch}
                            tintColor="#0469ff"
                            colors={['#0469ff']}
                        />
                    }
                    onEndReached={handleEndReached}
                    onEndReachedThreshold={0.35}
                    ListFooterComponent={
                        isFetchingNextPage ? (
                            <View style={styles.footerLoader}>
                                <ActivityIndicator size="small" color="#0469ff" />
                            </View>
                        ) : null
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f2f5',
    },
    headerTitle: { fontSize: 28, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
    composeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Search
    searchSection: {
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 10,
        backgroundColor: '#fff',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f3f4f6',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
    },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 15, color: '#111', height: '100%' },

    // List
    listContent: { paddingBottom: Platform.OS === 'ios' ? 100 : 80 },
    footerLoader: { paddingVertical: 16, alignItems: 'center' },

    // Conversation row
    conversationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#f0f2f5',
    },
    conversationItemUnread: { backgroundColor: '#fafbff' },

    // Avatar
    avatarContainer: { position: 'relative' },
    avatar: {
        width: 52, height: 52, borderRadius: 26,
        borderWidth: 1,
    },
    avatarPlaceholder: {
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        borderWidth: 1,
        justifyContent: 'center',
    },
    groupAvatar: {
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitial: { fontSize: 20, fontWeight: '700', color: '#0469ff' },
    onlineBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#22c55e',
        borderWidth: 2,
        borderColor: '#fff',
    },
    unreadDot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: '#0469ff',
        borderWidth: 2,
        borderColor: '#fff',
    },

    // Content
    conversationContent: { flex: 1, marginLeft: 14 },
    conversationHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    conversationName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1a1a2e',
        flex: 1,
        marginRight: 8,
    },
    conversationNameUnread: { fontWeight: '800', color: '#111' },
    timeRow: { flexDirection: 'row', alignItems: 'center' },
    timeText: { fontSize: 12, color: '#9ca3af' },
    timeTextUnread: { color: '#0469ff', fontWeight: '600' },
    previewRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 3,
    },
    previewText: { fontSize: 14, color: '#6b7280', flex: 1, marginRight: 8 },
    previewTextUnread: { color: '#374151', fontWeight: '500' },
    unreadBadge: {
        backgroundColor: '#0469ff',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 6,
    },
    unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
    roleTag: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

    // Empty state
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
        paddingBottom: 60,
    },
    emptyIconWrap: {
        width: 88,
        height: 88,
        borderRadius: 44,
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1a1a2e', marginBottom: 8 },
    emptySubtitle: { fontSize: 15, color: '#6b7280', textAlign: 'center', lineHeight: 22 },

    // Swipe delete
    swipeDeleteContainer: {
        width: 80,
        justifyContent: 'center',
        alignItems: 'center',
    },
    swipeDeleteBtn: {
        flex: 1,
        width: '100%',
        backgroundColor: '#ef4444',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4,
    },
    swipeDeleteText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
    },
});
