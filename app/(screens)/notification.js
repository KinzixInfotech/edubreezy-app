import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    PanResponder,
    Dimensions,
    TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import { ArrowLeft, Bell, BellOff } from 'lucide-react-native';
import Animated, {
    FadeInDown,
    FadeOutRight,
    Layout,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
    runOnJS,
    FadeIn
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import HapticTouchable from '../components/HapticTouch';
import { dataUi } from '../data/uidata';
import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';

const { width } = Dimensions.get('window');

// Swipeable Notification Item Component with Reanimated
const SwipeableNotificationItem = ({ item, onDelete, onMarkRead, index }) => {
    const translateX = useSharedValue(0);
    const itemHeight = useSharedValue(80);

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
                            onPress={() => !item.read && onMarkRead(item.id)}
                            activeOpacity={0.7}
                        >
                            <View style={styles.notificationLeft}>
                                <Animated.View
                                    entering={FadeInDown.delay(index * 50 + 100).springify()}
                                    style={[
                                        styles.notificationIcon,
                                        !item.read && styles.unreadIcon,
                                    ]}
                                >
                                    <Text style={styles.notificationEmoji}>{item.icon}</Text>
                                </Animated.View>
                                <View style={styles.notificationText}>
                                    <Text
                                        style={[
                                            styles.notificationTitle,
                                            !item.read && styles.unreadText,
                                        ]}
                                    >
                                        {item.title}
                                    </Text>
                                    <Text style={styles.notificationMessage} numberOfLines={2}>
                                        {item.message}
                                    </Text>
                                </View>
                            </View>
                            <Text style={styles.notificationTime}>{item.time}</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </GestureDetector>
                <View style={styles.deleteBackground}>
                    <Text style={styles.deleteText}>Delete</Text>
                </View>
            </Animated.View>
        </Animated.View>
    );
};

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

export default function NotificationScreen() {
    
  
    const uiData = dataUi;
    const [notifications, setNotifications] = useState(uiData.notifications);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);

    const handleDelete = (id) => {
        setNotifications((prev) => ({
            today: prev.today.filter((n) => n.id !== id),
            yesterday: prev.yesterday.filter((n) => n.id !== id),
        }));
    };

    const handleMarkRead = (id) => {
        setNotifications((prev) => ({
            today: prev.today.map((n) => (n.id === id ? { ...n, read: true } : n)),
            yesterday: prev.yesterday.map((n) =>
                n.id === id ? { ...n, read: true } : n
            ),
        }));
    };

    const handleMarkAllRead = () => {
        setNotifications((prev) => ({
            today: prev.today.map((n) => ({ ...n, read: true })),
            yesterday: prev.yesterday.map((n) => ({ ...n, read: true })),
        }));
    };

    const loadMore = () => {
        if (loading) return;
        setLoading(true);
        // Simulate API call
        setTimeout(() => {
            setPage((prev) => prev + 1);
            setLoading(false);
        }, 1000);
    };

    // Check if there are any notifications
    const hasNotifications = notifications.today.length > 0 || notifications.yesterday.length > 0;

    const allNotifications = [
        { type: 'header', title: 'TODAY' },
        ...notifications.today.map((item, idx) => ({ ...item, itemIndex: idx })),
        { type: 'header', title: 'YESTERDAY' },
        ...notifications.yesterday.map((item, idx) => ({ ...item, itemIndex: notifications.today.length + idx })),
    ];

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
                onMarkRead={handleMarkRead}
                index={item.itemIndex}
            />
        );
    };

    return (
        <GestureHandlerRootView style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <View style={styles.headerLeft}>
                    <HapticTouchable onPress={() => router.back()} style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </HapticTouchable>
                    <Text style={styles.headerTitle}>Notifications</Text>
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
                    onEndReached={loadMore}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={
                        loading ? (
                            <ActivityIndicator style={{ padding: 20 }} color="#0469ff" />
                        ) : null
                    }
                    showsVerticalScrollIndicator={false}
                />
            ) : (
                <EmptyState />
            )}
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
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
    backButton: {
        // padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111',
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
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    unreadIcon: {
        backgroundColor: '#E8F4FF',
    },
    notificationEmoji: {
        fontSize: 20,
    },
    notificationText: {
        flex: 1,
    },
    notificationTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#333',
        marginBottom: 4,
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
    notificationTime: {
        fontSize: 12,
        color: '#999',
        marginLeft: 8,
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
    deleteText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    // Empty State Styles
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