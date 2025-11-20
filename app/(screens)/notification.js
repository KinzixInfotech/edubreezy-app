import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    Dimensions,
    TouchableOpacity,
    Modal,
    ScrollView,
    RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Bell, BellOff, X, ExternalLink, Trash2 } from 'lucide-react-native';
import Animated, {
    FadeInDown,
    FadeOutRight,
    Layout,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
    FadeIn,
    SlideInRight,
    SlideOutRight
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import HapticTouchable from '../components/HapticTouch';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';

const { width } = Dimensions.get('window');

// Notification Type Icons & Colors
const getNotificationStyle = (type) => {
    const styles = {
        SYLLABUS: { icon: '📚', color: '#3B82F6', bg: '#EFF6FF' },
        ASSIGNMENT: { icon: '📝', color: '#8B5CF6', bg: '#F5F3FF' },
        FEE: { icon: '💰', color: '#10B981', bg: '#ECFDF5' },
        EXAM: { icon: '📋', color: '#EF4444', bg: '#FEF2F2' },
        ATTENDANCE: { icon: '✅', color: '#F59E0B', bg: '#FEF3C7' },
        NOTICE: { icon: '📌', color: '#EC4899', bg: '#FCE7F3' },
        LEAVE: { icon: '🏖️', color: '#06B6D4', bg: '#ECFEFF' },
        EVENT: { icon: '🎉', color: '#F97316', bg: '#FFF7ED' },
        GENERAL: { icon: '📢', color: '#6B7280', bg: '#F9FAFB' },
    };
    return styles[type] || styles.GENERAL;
};

// Priority Badge Component
const PriorityBadge = ({ priority }) => {
    if (priority === 'NORMAL' || priority === 'LOW') return null;

    const colors = {
        HIGH: { bg: '#FEF3C7', text: '#F59E0B' },
        URGENT: { bg: '#FEE2E2', text: '#EF4444' },
    };

    const style = colors[priority];

    return (
        <View style={[styles.priorityBadge, { backgroundColor: style.bg }]}>
            <Text style={[styles.priorityText, { color: style.text }]}>
                {priority}
            </Text>
        </View>
    );
};

// Swipeable Notification Item
const SwipeableNotificationItem = ({ item, onDelete, onPress, index }) => {
    const translateX = useSharedValue(0);
    const itemHeight = useSharedValue(80);
    const notifStyle = getNotificationStyle(item.type);

    const panGesture = Gesture.Pan()
        .onUpdate((event) => {
            if (event.translationX < 0) {
                translateX.value = event.translationX;
            }
        })
        .onEnd((event) => {
            if (event.translationX < -100) {
                translateX.value = withTiming(-width, { duration: 300 });
                itemHeight.value = withTiming(0, { duration: 300 }, () => {
                    runOnJS(onDelete)(item.id);
                });
            } else {
                translateX.value = withSpring(0);
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    const containerStyle = useAnimatedStyle(() => ({
        height: itemHeight.value,
        overflow: 'hidden',
    }));

    return (
        <Animated.View style={containerStyle}>
            <Animated.View
                entering={FadeInDown.delay(index * 50).duration(400)}
                layout={Layout.springify()}
                style={styles.notificationItemWrapper}
            >
                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[styles.notificationItem, animatedStyle]}>
                        <TouchableOpacity
                            style={styles.notificationContent}
                            onPress={() => onPress(item)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.notificationLeft}>
                                <Animated.View
                                    entering={FadeInDown.delay(index * 50 + 100).springify()}
                                    style={[
                                        styles.notificationIcon,
                                        { backgroundColor: notifStyle.bg },
                                        !item.isRead && styles.unreadIcon,
                                    ]}
                                >
                                    <Text style={styles.notificationEmoji}>{notifStyle.icon}</Text>
                                </Animated.View>
                                <View style={styles.notificationText}>
                                    <View style={styles.titleRow}>
                                        <Text
                                            style={[
                                                styles.notificationTitle,
                                                !item.isRead && styles.unreadText,
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {item.title}
                                        </Text>
                                        <PriorityBadge priority={item.priority} />
                                    </View>
                                    <Text style={styles.notificationMessage} numberOfLines={2}>
                                        {item.message}
                                    </Text>
                                    {item.sender && (
                                        <Text style={styles.senderText}>
                                            From: {item.sender.name}
                                        </Text>
                                    )}
                                </View>
                            </View>
                            <View style={styles.rightSection}>
                                <Text style={styles.notificationTime}>{item.time}</Text>
                                {!item.isRead && <View style={styles.unreadDot} />}
                            </View>
                        </TouchableOpacity>
                    </Animated.View>
                </GestureDetector>
                <View style={styles.deleteBackground}>
                    <Trash2 size={24} color="#fff" />
                </View>
            </Animated.View>
        </Animated.View>
    );
};

// Notification Detail Modal
const NotificationDetailModal = ({ visible, notification, onClose, onDelete }) => {
    if (!notification) return null;

    const notifStyle = getNotificationStyle(notification.type);

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <Animated.View
                    entering={SlideInRight.duration(300)}
                    exiting={SlideOutRight.duration(300)}
                    style={styles.modalContent}
                >
                    {/* Modal Header */}
                    <View style={styles.modalHeader}>
                        <View style={styles.modalHeaderLeft}>
                            <View style={[styles.modalIcon, { backgroundColor: notifStyle.bg }]}>
                                <Text style={styles.modalEmoji}>{notifStyle.icon}</Text>
                            </View>
                            <Text style={styles.modalType}>{notification.type}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <X size={24} color="#111" />
                        </TouchableOpacity>
                    </View>

                    {/* Modal Body */}
                    <ScrollView
                        style={styles.modalBody}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.modalTitle}>{notification.title}</Text>

                        <View style={styles.metaRow}>
                            <Text style={styles.metaText}>{notification.time}</Text>
                            {notification.sender && (
                                <Text style={styles.metaText}>
                                    By {notification.sender.name}
                                </Text>
                            )}
                        </View>

                        <Text style={styles.modalMessage}>{notification.message}</Text>

                        {/* {notification.metadata  && Object.keys(notification.metadata).length > 0 && (
                            <View style={styles.metadataCard}>
                                <Text style={styles.metadataTitle}>Details</Text>
                                {Object.entries(notification.metadata).map(([key, value]) => (
                                    <View key={key} style={styles.metadataRow}>
                                        <Text style={styles.metadataKey}>{key}:</Text>
                                        <Text style={styles.metadataValue}>
                                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )} */}
                    </ScrollView>

                    {/* Modal Footer */}
                    <View style={styles.modalFooter}>
                        {notification.actionUrl && (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => {
                                    onClose();
                                    router.push(notification.actionUrl);
                                }}
                            >
                                <ExternalLink size={18} color="#fff" />
                                <Text style={styles.actionButtonText}>View Details</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={styles.deleteButton}
                            onPress={() => {
                                onDelete(notification.id);
                                onClose();
                            }}
                        >
                            <Trash2 size={18} color="#EF4444" />
                            <Text style={styles.deleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
};

// Empty State Component
const EmptyState = () => (
    <Animated.View entering={FadeIn.duration(600)} style={styles.emptyContainer}>
        <Animated.View
            entering={FadeInDown.delay(100).duration(600).springify()}
            style={styles.emptyIconContainer}
        >
            <BellOff size={64} color="#0469ff" strokeWidth={1.5} />
        </Animated.View>
        <Animated.Text entering={FadeInDown.delay(200).duration(600)} style={styles.emptyTitle}>
            No Notifications
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(300).duration(600)} style={styles.emptyMessage}>
            You're all caught up! {'\n'}
            Check back later for new updates.
        </Animated.Text>
    </Animated.View>
);

// Main Component
export default function NotificationScreen() {
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const queryClient = useQueryClient();
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const userId = userData?.id;
    // Fetch notifications
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['notifications'],
        queryFn: async () => {
            // const userId = await SecureStore.getItemAsync('userId');
            // const schoolId = await SecureStore.getItemAsync('schoolId');
            const response = await api.get(`/notifications?userId=${userId}&schoolId=${schoolId}`);
            return response.data;
        },
    });

    // Mark as read mutation
    const markAsReadMutation = useMutation({
        mutationFn: async (notificationIds) => {
            await api.put('/notifications', { notificationIds });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['notifications']);
        },
    });

    // Mark all as read mutation
    const markAllAsReadMutation = useMutation({
        mutationFn: async () => {
            const userId = await SecureStore.getItemAsync('userId');
            await api.put('/notifications', { markAllAsRead: true, userId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['notifications']);
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: async (notificationIds) => {
            await api.delete('/notifications', { data: { notificationIds } });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['notifications']);
        },
    });

    const handleDelete = (id) => {
        deleteMutation.mutate([id]);
    };

    const handlePress = (item) => {
        if (!item.isRead) {
            markAsReadMutation.mutate([item.id]);
        }
        setSelectedNotification(item);
        setModalVisible(true);
    };

    const handleMarkAllRead = () => {
        markAllAsReadMutation.mutate();
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const allNotifications = [
        ...(data?.notifications?.today?.length > 0 ? [{ type: 'header', title: 'TODAY' }] : []),
        ...(data?.notifications?.today?.map((item, idx) => ({ ...item, itemIndex: idx })) || []),
        ...(data?.notifications?.yesterday?.length > 0 ? [{ type: 'header', title: 'YESTERDAY' }] : []),
        ...(data?.notifications?.yesterday?.map((item, idx) => ({
            ...item,
            itemIndex: (data?.notifications?.today?.length || 0) + idx
        })) || []),
        ...(data?.notifications?.earlier?.length > 0 ? [{ type: 'header', title: 'EARLIER' }] : []),
        ...(data?.notifications?.earlier?.map((item, idx) => ({
            ...item,
            itemIndex: (data?.notifications?.today?.length || 0) + (data?.notifications?.yesterday?.length || 0) + idx
        })) || []),
    ];

    const hasNotifications = allNotifications.some(item => item.type !== 'header');

    const renderItem = ({ item, index }) => {
        if (item.type === 'header') {
            return (
                <Animated.View
                    entering={FadeInDown.delay(index * 30).duration(400)}
                    style={styles.sectionHeader}
                >
                    <Text style={styles.sectionHeaderText}>{item.title}</Text>
                </Animated.View>
            );
        }
        return (
            <SwipeableNotificationItem
                item={item}
                onDelete={handleDelete}
                onPress={handlePress}
                index={item.itemIndex}
            />
        );
    };

    if (isLoading) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color="#0469ff" />
            </View>
        );
    }

    return (
        <GestureHandlerRootView style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <View style={styles.headerLeft}>
                    <HapticTouchable onPress={() => router.back()} style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </HapticTouchable>
                    <View>
                        <Text style={styles.headerTitle}>Notifications</Text>
                        {data?.unreadCount > 0 && (
                            <Text style={styles.unreadCount}>
                                {data.unreadCount} unread
                            </Text>
                        )}
                    </View>
                </View>
                {hasNotifications && (
                    <HapticTouchable onPress={handleMarkAllRead}>
                        <Text style={styles.markAllRead}>Mark all as read</Text>
                    </HapticTouchable>
                )}
            </Animated.View>

            {/* Notification List or Empty State */}
            {hasNotifications ? (
                <FlatList
                    data={allNotifications}
                    renderItem={renderItem}
                    keyExtractor={(item, index) => item.id || `header-${index}`}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#0469ff"
                        />
                    }
                />
            ) : (
                <EmptyState />
            )}

            {/* Detail Modal */}
            <NotificationDetailModal
                visible={modalVisible}
                notification={selectedNotification}
                onClose={() => setModalVisible(false)}
                onDelete={handleDelete}
            />
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingTop: 50,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 20,
        flex: 1,
    },
    backButton: {},
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111',
    },
    unreadCount: {
        fontSize: 12,
        color: '#0469ff',
        marginTop: 2,
    },
    markAllRead: {
        fontSize: 14,
        color: '#0469ff',
        fontWeight: '500',
    },
    sectionHeader: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#f9f9f9',
    },
    sectionHeaderText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#999',
        letterSpacing: 0.5,
    },
    notificationItemWrapper: {
        position: 'relative',
        overflow: 'hidden',
    },
    notificationItem: {
        backgroundColor: '#fff',
        zIndex: 1,
    },
    notificationContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    notificationLeft: {
        flexDirection: 'row',
        flex: 1,
        gap: 12,
        alignItems: 'flex-start',
    },
    notificationIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    unreadIcon: {
        borderWidth: 2,
        borderColor: '#0469ff',
    },
    notificationEmoji: {
        fontSize: 20,
    },
    notificationText: {
        flex: 1,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    notificationTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#333',
        flex: 1,
    },
    unreadText: {
        fontWeight: '600',
        color: '#111',
    },
    notificationMessage: {
        fontSize: 13,
        color: '#666',
        lineHeight: 18,
    },
    senderText: {
        fontSize: 11,
        color: '#999',
        marginTop: 4,
    },
    rightSection: {
        alignItems: 'flex-end',
        gap: 8,
    },
    notificationTime: {
        fontSize: 12,
        color: '#999',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#0469ff',
    },
    priorityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    priorityText: {
        fontSize: 10,
        fontWeight: '600',
    },
    deleteBackground: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: '#ff4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
    },
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
        paddingBottom: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    modalIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalEmoji: {
        fontSize: 20,
    },
    modalType: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    closeButton: {
        padding: 4,
    },
    modalBody: {
        padding: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111',
        marginBottom: 12,
    },
    metaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    metaText: {
        fontSize: 12,
        color: '#999',
    },
    modalMessage: {
        fontSize: 15,
        color: '#333',
        lineHeight: 22,
        marginBottom: 20,
    },
    metadataCard: {
        backgroundColor: '#f9f9f9',
        borderRadius: 12,
        padding: 16,
    },
    metadataTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
        marginBottom: 12,
    },
    metadataRow: {
        flexDirection: 'row',
        paddingVertical: 6,
    },
    metadataKey: {
        fontSize: 13,
        fontWeight: '500',
        color: '#666',
        width: 100,
    },
    metadataValue: {
        fontSize: 13,
        color: '#111',
        flex: 1,
    },
    modalFooter: {
        flexDirection: 'row',
        gap: 12,
        marginBottom:20,
        paddingHorizontal: 20,
        paddingTop: 16,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#0469ff',
        paddingVertical: 14,
        borderRadius: 12,
    },
    actionButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    deleteButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderRadius: 12,
    },
    deleteButtonText: {
        color: '#EF4444',
        fontSize: 15,
        fontWeight: '600',
    },
});