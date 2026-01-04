import React, { useState, useCallback } from 'react';
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
    StatusBar,
    SafeAreaView
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, CheckCheck, Trash2, X, Bell, BellOff, Calendar, AlertCircle } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown, Layout } from 'react-native-reanimated';
import { format } from 'date-fns';

// Helper to get icon props based on type
const getNotificationTypeStyles = (type) => {
    switch (type) {
        case 'URGENT':
        case 'EMERGENCY':
            return { color: '#EF4444', bg: '#FEE2E2', icon: AlertCircle };
        case 'ACADEMIC':
            return { color: '#3B82F6', bg: '#DBEAFE', icon: Calendar };
        case 'FEE':
            return { color: '#10B981', bg: '#D1FAE5', icon: CheckCheck }; // Or Money icon
        default:
            return { color: '#6366F1', bg: '#E0E7FF', icon: Bell };
    }
};

const NotificationCard = ({ item, onPress, index }) => {
    const { color, bg, icon: Icon } = getNotificationTypeStyles(item.type || item.priority);

    return (
        <Animated.View
            entering={FadeInDown.delay(index * 50).springify()}
            layout={Layout.springify()}
            style={[styles.cardContainer, !item.isRead && styles.unreadCard]}
        >
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => onPress(item)}
                style={styles.cardContent}
            >
                <View style={[styles.iconContainer, { backgroundColor: bg }]}>
                    <Icon size={20} color={color} strokeWidth={2} />
                </View>

                <View style={styles.textContainer}>
                    <View style={styles.cardHeader}>
                        <Text style={[styles.cardTitle, !item.isRead && styles.unreadText]} numberOfLines={1}>
                            {item.title}
                        </Text>
                        <Text style={styles.timeText}>
                            {item.createdAt ? format(new Date(item.createdAt), 'MMM d, h:mm a') : item.time}
                        </Text>
                    </View>

                    <Text style={styles.cardMessage} numberOfLines={2}>
                        {item.message}
                    </Text>

                    {item.sender && (
                        <Text style={styles.senderText}>
                            From: {item.sender.name} • {item.sender.role}
                        </Text>
                    )}
                </View>

                {!item.isRead && <View style={styles.unreadDot} />}
            </TouchableOpacity>
        </Animated.View>
    );
};

export default function NotificationScreen() {
    const [selectedNotification, setSelectedNotification] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const queryClient = useQueryClient();

    // Fetch User Data from SecureStore
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const json = await SecureStore.getItemAsync('user');
            return json ? JSON.parse(json) : null;
        },
    });

    const userId = userData?.id;
    const schoolId = userData?.schoolId;

    // Fetch Notifications
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['notifications', userId],
        queryFn: async () => {
            if (!userId) return { notifications: { today: [], yesterday: [], earlier: [] }, unreadCount: 0 };
            const res = await api.get(`/notifications?userId=${userId}&schoolId=${schoolId}&limit=50`);
            return res.data;
        },
        enabled: !!userId,
    });

    // Mutations
    const markReadMutation = useMutation({
        mutationFn: (ids) => api.put('/notifications', { notificationIds: ids, userId }),
        onSuccess: () => queryClient.invalidateQueries(['notifications'])
    });

    const markAllReadMutation = useMutation({
        mutationFn: () => api.put('/notifications', { markAllAsRead: true, userId }),
        onSuccess: () => queryClient.invalidateQueries(['notifications'])
    });

    const handlePress = (item) => {
        if (!item.isRead) {
            markReadMutation.mutate([item.id]);
        }
        setSelectedNotification(item);
        setModalVisible(true);
    };

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    // Flatten data for FlatList
    const flatData = [
        ...(data?.notifications?.today?.length ? [{ type: 'header', title: 'Today' }, ...data.notifications.today] : []),
        ...(data?.notifications?.yesterday?.length ? [{ type: 'header', title: 'Yesterday' }, ...data.notifications.yesterday] : []),
        ...(data?.notifications?.earlier?.length ? [{ type: 'header', title: 'Earlier' }, ...data.notifications.earlier] : []),
    ];

    if (isLoading && !refreshing) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#4F46E5" />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#fff" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#1F2937" />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Notifications</Text>
                    {data?.unreadCount > 0 && (
                        <View style={styles.badgeContainer}>
                            <Text style={styles.badgeText}>{data.unreadCount} new</Text>
                        </View>
                    )}
                </View>
                <TouchableOpacity onPress={() => markAllReadMutation.mutate()} disabled={!data?.unreadCount}>
                    <CheckCheck size={24} color={data?.unreadCount ? "#4F46E5" : "#D1D5DB"} />
                </TouchableOpacity>
            </View>

            {/* List */}
            <FlatList
                data={flatData}
                keyExtractor={(item, index) => item.id || `header-${index}`}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={["#4F46E5"]} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <BellOff size={48} color="#9CA3AF" />
                        <Text style={styles.emptyText}>No notifications yet</Text>
                    </View>
                }
                renderItem={({ item, index }) => {
                    if (item.type === 'header') {
                        return (
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionHeaderText}>{item.title}</Text>
                            </View>
                        );
                    }
                    return <NotificationCard item={item} onPress={handlePress} index={index} />;
                }}
            />

            {/* Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalType}>{selectedNotification?.type || 'Notification'}</Text>
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <X size={24} color="#6B7280" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.modalTitle}>{selectedNotification?.title}</Text>

                        <View style={styles.modalMeta}>
                            <Calendar size={14} color="#6B7280" />
                            <Text style={styles.modalTime}>
                                {selectedNotification?.createdAt ? format(new Date(selectedNotification.createdAt), 'PPP p') : ''}
                            </Text>
                        </View>

                        <View style={styles.divider} />

                        <Text style={styles.modalMessage}>{selectedNotification?.message}</Text>

                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={() => setModalVisible(false)}
                        >
                            <Text style={styles.closeButtonText}>Close</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB', // Light gray background for professional look
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        marginTop: Platform.OS === 'android' ? 30 : 0,
    },
    headerTitleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
    },
    badgeContainer: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#C7D2FE',
    },
    badgeText: {
        color: '#4F46E5',
        fontSize: 12,
        fontWeight: '600',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    sectionHeader: {
        marginTop: 24,
        marginBottom: 12,
    },
    sectionHeaderText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardContainer: {
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        overflow: 'hidden',
    },
    unreadCard: {
        backgroundColor: '#fff',
        borderColor: '#E0E7FF',
        borderLeftWidth: 4,
        borderLeftColor: '#4F46E5',
    },
    cardContent: {
        padding: 16,
        flexDirection: 'row',
        gap: 16,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    textContainer: {
        flex: 1,
        gap: 4,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        flex: 1,
        marginRight: 8,
    },
    unreadText: {
        color: '#111827',
        fontWeight: '700',
    },
    timeText: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    cardMessage: {
        fontSize: 14,
        color: '#6B7280',
        lineHeight: 20,
    },
    senderText: {
        fontSize: 12,
        color: '#4F46E5',
        fontWeight: '500',
        marginTop: 4,
    },
    unreadDot: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#4F46E5',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 100,
        gap: 12,
    },
    emptyText: {
        fontSize: 16,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        minHeight: '40%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalType: {
        fontSize: 12,
        fontWeight: '700',
        color: '#4F46E5',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        overflow: 'hidden',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        marginBottom: 8,
    },
    modalMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 20,
    },
    modalTime: {
        fontSize: 14,
        color: '#6B7280',
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginBottom: 20,
    },
    modalMessage: {
        fontSize: 16,
        color: '#374151',
        lineHeight: 24,
        marginBottom: 32,
    },
    closeButton: {
        backgroundColor: '#F3F4F6',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    closeButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
    },
});