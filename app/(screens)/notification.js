import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    Modal,
    RefreshControl,
    Platform,
    Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { ArrowLeft, CheckCheck, X, Bell, BellOff, AlertCircle, Megaphone, CreditCard, GraduationCap } from 'lucide-react-native';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, Easing } from 'react-native-reanimated';
import { format, formatDistanceToNow } from 'date-fns';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { homeQueryKeys } from '../../features/home-modules/queryKeys';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const ESTIMATED_ROW_HEIGHT = 72;
const PAGE_SIZE = Math.max(12, Math.ceil(SCREEN_HEIGHT / ESTIMATED_ROW_HEIGHT) + 2);
const VIEWABILITY_CONFIG = {
    itemVisiblePercentThreshold: 60,
    minimumViewTime: 120,
};
const READ_SYNC_DEBOUNCE_MS = 350;

const getNotificationImageUrl = (item) => {
    if (!item) return null;
    return item.imageUrl || item.image || item.fileUrl || item.file_url || item.mediaUrl || item.media_url || null;
};

// Helper to get icon based on type
const getNotificationIcon = (type) => {
    switch (type) {
        case 'URGENT':
        case 'EMERGENCY':
            return { icon: AlertCircle, color: '#EF4444', bg: '#FEF2F2' };
        case 'ACADEMIC':
            return { icon: GraduationCap, color: '#3B82F6', bg: '#EFF6FF' };
        case 'FEE':
            return { icon: CreditCard, color: '#10B981', bg: '#ECFDF5' };
        case 'ANNOUNCEMENT':
            return { icon: Megaphone, color: '#F59E0B', bg: '#FFFBEB' };
        default:
            return { icon: Bell, color: '#6366F1', bg: '#EEF2FF' };
    }
};

// Format time like Instagram (e.g., "2h", "3d", "1w")
const formatTimeAgo = (date) => {
    if (!date) return '';
    try {
        const distance = formatDistanceToNow(new Date(date), { addSuffix: false });
        // Shorten the format
        return distance
            .replace(' seconds', 's')
            .replace(' second', 's')
            .replace(' minutes', 'm')
            .replace(' minute', 'm')
            .replace(' hours', 'h')
            .replace(' hour', 'h')
            .replace(' days', 'd')
            .replace(' day', 'd')
            .replace(' weeks', 'w')
            .replace(' week', 'w')
            .replace(' months', 'mo')
            .replace(' month', 'mo')
            .replace('about ', '')
            .replace('less than a', '1');
    } catch {
        return '';
    }
};

const EMPTY_NOTIFICATION_GROUPS = { today: [], yesterday: [], earlier: [] };

const flattenNotificationGroups = (notifications = EMPTY_NOTIFICATION_GROUPS) => {
    return ['today', 'yesterday', 'earlier'].flatMap((section) =>
        (notifications?.[section] || []).map((notification) => ({
            ...notification,
            __section: section,
        }))
    );
};

const mergeUniqueNotifications = (pages = []) => {
    const seen = new Set();
    const merged = [];

    pages.forEach((page) => {
        page.forEach((notification) => {
            if (!notification?.id || seen.has(notification.id)) return;
            seen.add(notification.id);
            merged.push(notification);
        });
    });

    return merged;
};

const groupNotifications = (notifications = []) => {
    return notifications.reduce((groups, notification) => {
        const section = notification.__section || 'earlier';
        if (!groups[section]) groups[section] = [];
        groups[section].push(notification);
        return groups;
    }, { today: [], yesterday: [], earlier: [] });
};

const updatePagedNotifications = (oldData, updater) => {
    if (!oldData?.pages?.length) return oldData;

    return {
        ...oldData,
        pages: oldData.pages.map((page) => page.map((notification) => updater(notification))),
    };
};

const updateSummaryNotifications = (oldData, updater) => {
    if (!oldData?.notifications) return oldData;

    return {
        ...oldData,
        notifications: {
            today: (oldData.notifications.today || []).map(updater),
            yesterday: (oldData.notifications.yesterday || []).map(updater),
            earlier: (oldData.notifications.earlier || []).map(updater),
        },
    };
};

const NotificationItem = ({ item, onPress, isLast }) => {
    const { icon: Icon, color, bg } = getNotificationIcon(item.type || item.priority);
    const imageUrl = getNotificationImageUrl(item);

    return (
        <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => onPress(item)}
            style={[
                styles.notificationItem,
                !item.isRead && styles.unreadItem,
                !isLast && styles.itemBorder
            ]}
        >
            {/* Icon */}
            {imageUrl ? (
                <Image
                    source={{ uri: imageUrl }}
                    style={styles.notificationThumb}
                    contentFit="cover"
                />
            ) : (
                <View style={[styles.iconWrapper, { backgroundColor: bg }]}>
                    <Icon size={20} color={color} strokeWidth={2} />
                </View>
            )}

            {/* Content */}
            <View style={styles.contentWrapper}>
                <Text style={styles.notificationText} numberOfLines={2}>
                    <Text style={[styles.titleText, !item.isRead && styles.unreadTitle]}>
                        {item.title}
                    </Text>
                    {item.message ? ` ${item.message}` : ''}
                </Text>

                {item.sender && (
                    <Text style={styles.senderText} numberOfLines={1}>
                        {item.sender.name}
                    </Text>
                )}
            </View>

            {/* Time */}
            <View style={styles.timeWrapper}>
                <Text style={styles.timeText}>{formatTimeAgo(item.createdAt)}</Text>
                {!item.isRead && <View style={styles.unreadDot} />}
            </View>
        </TouchableOpacity>
    );
};

export default function NotificationScreen() {
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const queryClient = useQueryClient();
    const pendingReadIdsRef = useRef(new Set());
    const readFlushTimerRef = useRef(null);

    const syncStoredUser = useCallback(async () => {
        try {
            const json = await SecureStore.getItemAsync('user');
            const parsed = json ? JSON.parse(json) : null;
            setCurrentUser((prev) => {
                if (
                    prev?.id === parsed?.id &&
                    (prev?.schoolId || prev?.school?.id) === (parsed?.schoolId || parsed?.school?.id)
                ) {
                    return prev;
                }
                return parsed;
            });
        } catch (error) {
            console.error('Failed to load stored user for notifications:', error);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            syncStoredUser();
        }, [syncStoredUser])
    );

    useEffect(() => {
        syncStoredUser();
    }, [syncStoredUser]);

    const userId = currentUser?.id;
    const schoolId = currentUser?.schoolId || currentUser?.school?.id;
    const notificationsQueryKey = homeQueryKeys.notificationsFeed(userId, schoolId);
    const notificationsSummaryQueryKey = homeQueryKeys.notificationsSummary(userId, schoolId);

    const setNotificationsCache = useCallback((updater) => {
        queryClient.setQueryData(notificationsQueryKey, updater);
    }, [queryClient, notificationsQueryKey]);

    const markNotificationsReadOptimistically = useCallback((ids) => {
        if (!ids?.length) return;

        const idSet = new Set(ids);
        setNotificationsCache((old) =>
            updatePagedNotifications(old, (notification) => (
                idSet.has(notification.id) ? { ...notification, isRead: true } : notification
            ))
        );
        queryClient.setQueryData(notificationsSummaryQueryKey, (old) =>
            updateSummaryNotifications(old, (notification) => (
                idSet.has(notification.id) ? { ...notification, isRead: true } : notification
            ))
        );
    }, [notificationsSummaryQueryKey, queryClient, setNotificationsCache]);

    const flushPendingReads = useCallback(() => {
        if (readFlushTimerRef.current) {
            clearTimeout(readFlushTimerRef.current);
            readFlushTimerRef.current = null;
        }

        if (!userId || pendingReadIdsRef.current.size === 0) return;

        const ids = Array.from(pendingReadIdsRef.current);
        pendingReadIdsRef.current.clear();
        markReadMutation.mutate(ids);
    }, [userId]);

    const queueReadSync = useCallback((ids) => {
        if (!ids?.length) return;

        ids.forEach((id) => pendingReadIdsRef.current.add(id));
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

    // Fetch notifications one screenful at a time.
    const {
        data,
        isLoading,
        refetch,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isRefetching,
    } = useInfiniteQuery({
        queryKey: notificationsQueryKey,
        queryFn: async ({ pageParam = 0 }) => {
            if (!userId || !schoolId) return [];
            const res = await api.get(
                `/notifications?userId=${userId}&schoolId=${schoolId}&limit=${PAGE_SIZE}&offset=${pageParam}`
            );
            return flattenNotificationGroups(res.data?.notifications);
        },
        enabled: !!userId && !!schoolId,
        initialPageParam: 0,
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage?.length || lastPage.length < PAGE_SIZE) return undefined;
            const loadedCount = allPages.reduce((total, page) => total + page.length, 0);
            return loadedCount;
        },
        staleTime: 1000 * 60 * 2, // 2 min stale time - prevents refetch on remount
        gcTime: 1000 * 60 * 30, // 30 min garbage collection
        refetchOnMount: false, // Don't refetch on every mount
        refetchOnWindowFocus: false, // Don't refetch on app focus
    });

    const markReadMutation = useMutation({
        mutationFn: (ids) => api.put('/notifications', { notificationIds: ids, userId }),
        onError: (error, ids) => {
            console.error('Failed to sync notification read state:', error?.response?.data || error?.message || error);
            if (ids?.length) {
                ids.forEach((id) => pendingReadIdsRef.current.add(id));
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notificationsQueryKey, refetchType: 'inactive' });
            queryClient.invalidateQueries({ queryKey: notificationsSummaryQueryKey, refetchType: 'inactive' });
        }
    });

    const markAllReadMutation = useMutation({
        mutationFn: (ids) => api.put('/notifications', { notificationIds: ids, userId }),
        onError: (error) => {
            console.error('Failed to mark all loaded notifications as read:', error?.response?.data || error?.message || error);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: notificationsQueryKey, refetchType: 'inactive' });
            queryClient.invalidateQueries({ queryKey: notificationsSummaryQueryKey, refetchType: 'inactive' });
        }
    });

    // State for inner content visibility to handle exit animations
    const [innerVisible, setInnerVisible] = useState(false);

    const handlePress = (item) => {
        if (!item.isRead) {
            markNotificationsReadOptimistically([item.id]);
            queueReadSync([item.id]);
        }
        setSelectedNotification(item);
        setModalVisible(true);
        // Small delay to ensure Modal renders before starting animation
        requestAnimationFrame(() => setInnerVisible(true));
    };

    const handleCloseModal = useCallback(() => {
        setInnerVisible(false);
        // Wait for exit animation to finish before hiding Modal
        setTimeout(() => {
            setModalVisible(false);
            setSelectedNotification(null);
        }, 300); // Matches exit animation duration
    }, []);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    // Filter out notifications sent by the current user
    const filterSentByMe = (notifications) => {
        if (!notifications || !userId) return notifications || [];
        return notifications.filter(n => n.sender?.id !== userId);
    };

    const groupedNotifications = useMemo(() => {
        const mergedNotifications = mergeUniqueNotifications(data?.pages || []);
        return groupNotifications(mergedNotifications);
    }, [data]);

    const todayFiltered = filterSentByMe(groupedNotifications.today);
    const yesterdayFiltered = filterSentByMe(groupedNotifications.yesterday);
    const earlierFiltered = filterSentByMe(groupedNotifications.earlier);

    const visibleNotifications = useMemo(() => [
        ...todayFiltered,
        ...yesterdayFiltered,
        ...earlierFiltered,
    ], [todayFiltered, yesterdayFiltered, earlierFiltered]);

    const filteredUnreadIds = useMemo(() => (
        visibleNotifications.filter((notification) => !notification.isRead).map((notification) => notification.id)
    ), [visibleNotifications]);

    const filteredUnreadCount = filteredUnreadIds.length;

    const selectedNotificationImage = getNotificationImageUrl(selectedNotification);

    const onViewableItemsChanged = useCallback(({ viewableItems }) => {
        const idsToMark = viewableItems
            .map((entry) => entry.item)
            .filter((item) => item?.id && !item.type && !item.isRead)
            .map((item) => item.id);

        if (!idsToMark.length) return;

        markNotificationsReadOptimistically(idsToMark);
        queueReadSync(idsToMark);
    }, [markNotificationsReadOptimistically, queueReadSync]);

    const handleEndReached = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return;
        fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    const handleMarkAllRead = useCallback(() => {
        if (!filteredUnreadIds.length || markAllReadMutation.isPending) return;

        flushPendingReads();
        markNotificationsReadOptimistically(filteredUnreadIds);
        markAllReadMutation.mutate(filteredUnreadIds);
    }, [filteredUnreadIds, flushPendingReads, markAllReadMutation, markNotificationsReadOptimistically]);

    // Flatten data for FlatList
    const flatData = [
        ...(todayFiltered.length ? [{ type: 'header', title: 'Today' }, ...todayFiltered.map((n, i) => ({ ...n, isLastInSection: i === todayFiltered.length - 1 }))] : []),
        ...(yesterdayFiltered.length ? [{ type: 'header', title: 'Yesterday' }, ...yesterdayFiltered.map((n, i) => ({ ...n, isLastInSection: i === yesterdayFiltered.length - 1 }))] : []),
        ...(earlierFiltered.length ? [{ type: 'header', title: 'Earlier' }, ...earlierFiltered.map((n, i) => ({ ...n, isLastInSection: i === earlierFiltered.length - 1 }))] : []),
    ];

    if (isLoading && !refreshing) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#000" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* StatusBar removed - using global */}
            <StatusBar style='dark' />
            {/* Header - Instagram style */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <ArrowLeft size={24} color="#000" />
                </TouchableOpacity>

                <Text style={styles.headerTitle}>Notifications</Text>

                <TouchableOpacity
                    onPress={handleMarkAllRead}
                    disabled={!filteredUnreadCount || markAllReadMutation.isPending}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <CheckCheck size={24} color={filteredUnreadCount ? "#000" : "#C7C7CC"} />
                </TouchableOpacity>
            </View>

            {/* List */}
            <FlatList
                data={flatData}
                keyExtractor={(item, index) => item.id || `header-${index}`}
                contentContainerStyle={styles.listContent}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={VIEWABILITY_CONFIG}
                onEndReached={handleEndReached}
                onEndReachedThreshold={0.35}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing || isRefetching}
                        onRefresh={handleRefresh}
                        tintColor="#000"
                    />
                }
                ListFooterComponent={
                    isFetchingNextPage ? (
                        <View style={styles.footerLoader}>
                            <ActivityIndicator size="small" color="#8E8E93" />
                        </View>
                    ) : null
                }
                ListEmptyComponent={
                    <Animated.View entering={FadeIn.delay(200)} style={styles.emptyContainer}>
                        <View style={styles.emptyIconWrapper}>
                            <BellOff size={32} color="#8E8E93" />
                        </View>
                        <Text style={styles.emptyTitle}>No Notifications</Text>
                        <Text style={styles.emptySubtitle}>
                            When you get notifications, they'll show up here
                        </Text>
                    </Animated.View>
                }
                renderItem={({ item, index }) => {
                    if (item.type === 'header') {
                        return (
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionHeaderText}>{item.title}</Text>
                            </View>
                        );
                    }
                    return (
                        <NotificationItem
                            item={item}
                            onPress={handlePress}
                            isLast={item.isLastInSection}
                        />
                    );
                }}
            />

            {/* Detail Modal - Custom Reanimated Bottom Sheet */}
            <Modal
                animationType="none"
                transparent={true}
                visible={modalVisible}
                onRequestClose={handleCloseModal}
            >
                {innerVisible && (
                    <Animated.View
                        entering={FadeIn.duration(200)}
                        exiting={FadeOut.duration(200)}
                        style={styles.modalOverlay}
                    >
                        <TouchableOpacity
                            style={StyleSheet.absoluteFill}
                            activeOpacity={1}
                            onPress={handleCloseModal}
                        />

                        <Animated.View
                            entering={SlideInDown.duration(400).easing(Easing.out(Easing.cubic))}
                            exiting={SlideOutDown.duration(300).easing(Easing.in(Easing.cubic))}
                            style={styles.modalContent}
                        >
                            <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
                                {/* Handle bar */}
                                <View style={styles.modalHandle} />

                                {/* Header */}
                                <View style={styles.modalHeader}>
                                    <View style={styles.modalTypeContainer}>
                                        {(() => {
                                            const { icon: Icon, color, bg } = getNotificationIcon(selectedNotification?.type);
                                            return (
                                                <View style={[styles.modalIconWrapper, { backgroundColor: bg }]}>
                                                    <Icon size={18} color={color} />
                                                </View>
                                            );
                                        })()}
                                        <Text style={styles.modalType}>
                                            {selectedNotification?.type || 'Notification'}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={handleCloseModal}
                                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    >
                                        <X size={24} color="#8E8E93" />
                                    </TouchableOpacity>
                                </View>

                                {/* Title */}
                                <Text style={styles.modalTitle}>{selectedNotification?.title}</Text>

                                {/* Time */}
                                <Text style={styles.modalTime}>
                                    {selectedNotification?.createdAt
                                        ? format(new Date(selectedNotification.createdAt), 'MMMM d, yyyy • h:mm a')
                                        : ''
                                    }
                                </Text>

                                {selectedNotificationImage && (
                                    <View style={styles.modalImageContainer}>
                                        <Image
                                            source={{ uri: selectedNotificationImage }}
                                            style={styles.modalImage}
                                            contentFit="cover"
                                        />
                                    </View>
                                )}

                                {/* Message */}
                                <Text style={styles.modalMessage}>{selectedNotification?.message}</Text>

                                {/* Sender */}
                                {selectedNotification?.sender && (
                                    <View style={styles.modalSender}>
                                        <Text style={styles.modalSenderLabel}>From</Text>
                                        <Text style={styles.modalSenderName}>
                                            {selectedNotification.sender.name}
                                            {selectedNotification.sender.role?.name && (
                                                <Text style={styles.modalSenderRole}>
                                                    {' '}• {selectedNotification.sender.role.name}
                                                </Text>
                                            )}
                                        </Text>
                                    </View>
                                )}

                                {/* Close Button */}
                                <TouchableOpacity
                                    style={styles.closeButton}
                                    onPress={handleCloseModal}
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.closeButtonText}>Done</Text>
                                </TouchableOpacity>
                            </TouchableOpacity>
                        </Animated.View>
                    </Animated.View>
                )}
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },

    // Header - Clean Instagram style
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 0.5,
        borderBottomColor: '#E5E5EA',
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#000',
        letterSpacing: -0.4,
    },

    // List
    listContent: {
        paddingBottom: 40,
    },
    footerLoader: {
        paddingVertical: 20,
    },

    // Section Header
    sectionHeader: {
        paddingHorizontal: 16,
        paddingTop: 24,
        paddingBottom: 8,
        backgroundColor: '#fff',
    },
    sectionHeaderText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#000',
    },

    // Notification Item - Instagram style
    notificationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
    },
    unreadItem: {
        backgroundColor: '#F2F8FF',
    },
    itemBorder: {
        borderBottomWidth: 0.5,
        borderBottomColor: '#E5E5EA',
    },
    iconWrapper: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    notificationThumb: {
        width: 44,
        height: 44,
        borderRadius: 12,
        marginRight: 12,
        backgroundColor: '#F2F2F7',
    },
    contentWrapper: {
        flex: 1,
        marginRight: 8,
    },
    notificationText: {
        fontSize: 14,
        color: '#3C3C43',
        lineHeight: 18,
    },
    titleText: {
        fontWeight: '400',
        color: '#000',
    },
    unreadTitle: {
        fontWeight: '600',
    },
    senderText: {
        fontSize: 13,
        color: '#8E8E93',
        marginTop: 2,
    },
    timeWrapper: {
        alignItems: 'flex-end',
        gap: 4,
    },
    timeText: {
        fontSize: 13,
        color: '#8E8E93',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#007AFF',
    },

    // Empty State
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 120,
        paddingHorizontal: 40,
    },
    emptyIconWrapper: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#F2F2F7',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#000',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 15,
        color: '#8E8E93',
        textAlign: 'center',
        lineHeight: 20,
    },

    // Modal - Bottom Sheet
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingHorizontal: 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 24,
        minHeight: 300,
    },
    modalHandle: {
        width: 36,
        height: 5,
        borderRadius: 3,
        backgroundColor: '#E5E5EA',
        alignSelf: 'center',
        marginTop: 8,
        marginBottom: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTypeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    modalIconWrapper: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalType: {
        fontSize: 13,
        fontWeight: '600',
        color: '#8E8E93',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#000',
        marginBottom: 4,
        letterSpacing: -0.4,
    },
    modalTime: {
        fontSize: 13,
        color: '#8E8E93',
        marginBottom: 20,
    },
    modalImageContainer: {
        marginBottom: 20,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#F2F2F7',
    },
    modalImage: {
        width: '100%',
        height: 220,
    },
    modalMessage: {
        fontSize: 16,
        color: '#3C3C43',
        lineHeight: 24,
        marginBottom: 24,
    },
    modalSender: {
        paddingTop: 16,
        borderTopWidth: 0.5,
        borderTopColor: '#E5E5EA',
        marginBottom: 24,
    },
    modalSenderLabel: {
        fontSize: 12,
        color: '#8E8E93',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    modalSenderName: {
        fontSize: 15,
        color: '#000',
        fontWeight: '500',
    },
    modalSenderRole: {
        color: '#8E8E93',
        fontWeight: '400',
    },
    closeButton: {
        backgroundColor: '#F2F2F7',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    closeButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#007AFF',
    },
});
