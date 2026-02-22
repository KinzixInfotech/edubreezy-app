import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, Animated as RNAnimated, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus } from 'lucide-react-native';
import HapticTouchable from './HapticTouch';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import Svg, { Circle } from 'react-native-svg';

const AVATAR_SIZE = 64;
const RING_SIZE = AVATAR_SIZE + 8;
const STROKE_WIDTH = 2.5;
const RADIUS = (RING_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ALLOWED_POSTER_ROLES = ['ADMIN', 'DIRECTOR', 'PRINCIPAL', 'TEACHING_STAFF'];

// Gradient pairs for text statuses
const TEXT_GRADIENTS = [
    ['#667eea', '#764ba2'],
    ['#f093fb', '#f5576c'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'],
    ['#a18cd1', '#fbc2eb'],
];

/**
 * Skeleton placeholder with shimmer animation
 */
const SkeletonItem = memo(({ index }) => {
    const shimmer = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        const loop = RNAnimated.loop(
            RNAnimated.sequence([
                RNAnimated.timing(shimmer, { toValue: 1, duration: 800, useNativeDriver: true, delay: index * 100 }),
                RNAnimated.timing(shimmer, { toValue: 0, duration: 800, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

    return (
        <View style={styles.statusItem}>
            <View style={styles.avatarContainer}>
                <RNAnimated.View style={[styles.skeletonCircle, { opacity }]} />
            </View>
            <RNAnimated.View style={[styles.skeletonText, { opacity }]} />
        </View>
    );
});

/**
 * Segmented ring component — each segment corresponds to one status
 * Unseen = blue, Seen = gray
 */
const SegmentedRing = memo(({ statuses, size = RING_SIZE }) => {
    const radius = (size - STROKE_WIDTH) / 2;
    const circumference = 2 * Math.PI * radius;
    const count = statuses.length;
    if (count === 0) return null;

    const gap = count > 1 ? 4 : 0;
    const gapLength = (gap / 360) * circumference;
    const totalGaps = gapLength * count;
    const segmentLength = (circumference - totalGaps) / count;

    const segments = statuses.map((status, index) => {
        const dashOffset = circumference - (segmentLength + gapLength) * index;
        return (
            <Circle
                key={index}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={status.isSeen ? '#ccc' : '#0469ff'}
                strokeWidth={STROKE_WIDTH}
                fill="none"
                strokeDasharray={`${segmentLength} ${circumference - segmentLength}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                rotation={-90}
                origin={`${size / 2}, ${size / 2}`}
            />
        );
    });

    return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {segments}
        </Svg>
    );
});

/**
 * Get the latest status thumbnail for avatar overlay
 */
const getLatestStatus = (statuses) => {
    if (!statuses || statuses.length === 0) return null;
    return statuses[statuses.length - 1]; // most recent
};

/**
 * Small shimmer that pulses inside avatar while thumbnail loads
 */
const AvatarShimmer = memo(() => {
    const shimmer = useRef(new RNAnimated.Value(0)).current;

    useEffect(() => {
        const loop = RNAnimated.loop(
            RNAnimated.sequence([
                RNAnimated.timing(shimmer, { toValue: 1, duration: 600, useNativeDriver: true }),
                RNAnimated.timing(shimmer, { toValue: 0, duration: 600, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, []);

    const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.35] });

    return (
        <RNAnimated.View style={[styles.avatar, styles.avatarShimmer, { opacity }]} />
    );
});

/**
 * Individual status avatar item
 */
const StatusItem = memo(({ item, onPress, onAddPress, isMyStatus, canPost }) => {
    const hasUnseen = item.hasUnseen;
    const statusCount = item.statuses?.length || 0;
    const latestStatus = getLatestStatus(item.statuses);
    const [thumbLoading, setThumbLoading] = useState(true);

    // Determine avatar content: show latest status thumbnail if available
    const renderAvatar = () => {
        // If latest status is text type, show gradient
        if (latestStatus?.type === 'text') {
            const gradIdx = Math.abs((item.userName || '').charCodeAt(0) || 0) % TEXT_GRADIENTS.length;
            return (
                <LinearGradient colors={TEXT_GRADIENTS[gradIdx]} style={styles.avatarGradient}>
                    <Text style={styles.avatarTextPreview} numberOfLines={2}>
                        {(latestStatus.text || '').slice(0, 20)}
                    </Text>
                </LinearGradient>
            );
        }

        // If latest status has a thumbnail or media URL (image/video), show it
        if (latestStatus?.thumbnailUrl || (latestStatus?.type === 'image' && latestStatus?.mediaUrl)) {
            return (
                <View style={styles.avatar}>
                    {thumbLoading && <AvatarShimmer />}
                    <Image
                        source={{ uri: latestStatus.thumbnailUrl || latestStatus.mediaUrl }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        transition={200}
                        cachePolicy="memory-disk"
                        onLoadStart={() => setThumbLoading(true)}
                        onLoad={() => setThumbLoading(false)}
                    />
                </View>
            );
        }

        // Default: user avatar or initial
        if (item.userAvatar && item.userAvatar !== 'default.png' && item.userAvatar !== 'N/A') {
            return (
                <Image
                    source={{ uri: item.userAvatar }}
                    style={styles.avatar}
                    contentFit="cover"
                    transition={200}
                    cachePolicy="memory-disk"
                />
            );
        }

        return (
            <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>
                    {(item.userName || '?')[0].toUpperCase()}
                </Text>
            </View>
        );
    };

    return (
        <HapticTouchable onPress={() => onPress(item)} style={styles.statusItem}>
            <View style={styles.avatarContainer}>
                {/* Segmented Ring */}
                {statusCount > 0 && (
                    <View style={styles.ringContainer}>
                        <SegmentedRing statuses={item.statuses} />
                    </View>
                )}

                {/* Avatar */}
                <View style={[styles.avatarWrapper, statusCount === 0 && styles.noRingAvatar]}>
                    {renderAvatar()}
                </View>

                {/* Add button for own status — separately tappable */}
                {isMyStatus && canPost && (
                    <HapticTouchable
                        onPress={() => onAddPress?.()}
                        style={styles.addBadge}
                    >
                        <Plus size={12} color="#fff" strokeWidth={3} />
                    </HapticTouchable>
                )}
            </View>

            <Text style={styles.statusName} numberOfLines={1}>
                {isMyStatus ? 'My Status' : (item.userName || 'Unknown').split(' ').slice(0, 2).join(' ')}
            </Text>
        </HapticTouchable>
    );
});

/**
 * StatusRow — Horizontal scrollable row of status avatars
 */
const StatusRow = ({ schoolId, userId, userRole, userName, userAvatar, onStatusPress, onMyStatusPress }) => {
    const canPost = ALLOWED_POSTER_ROLES.includes(userRole);

    const { data: feedData, isLoading, isFetching } = useQuery({
        queryKey: ['statusFeed', schoolId, userId],
        queryFn: async () => {
            const res = await api.get(
                `/schools/${schoolId}/status/feed?viewerId=${userId}&viewerRole=${userRole}`
            );
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 1000 * 30, // 30s — shorter so invalidation triggers a real refetch quickly
        refetchOnMount: true, // Always refetch when component mounts (e.g., after upload)
        refetchOnWindowFocus: false,
    });

    // Show if background re-fetching (not initial load)
    const isRefreshing = isFetching && !isLoading;

    // ALL hooks must be called before any conditional returns
    const handlePress = useCallback((item) => {
        if (item.userId === userId && item.statuses?.length === 0) {
            onMyStatusPress?.();
        } else if (item.userId === userId && item.statuses?.length > 0) {
            onStatusPress?.(item);
        } else {
            onStatusPress?.(item);
        }
    }, [userId, onStatusPress, onMyStatusPress]);

    const feed = feedData?.feed || [];

    // Show skeleton while loading
    if (isLoading) {
        return (
            <View style={styles.container}>
                <FlatList
                    data={[0, 1, 2, 3]}
                    keyExtractor={(item) => `skeleton-${item}`}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item, index }) => <SkeletonItem index={index} />}
                />
            </View>
        );
    }

    // If no feed and user can't post, don't show the row
    if (feed.length === 0 && !canPost) return null;

    // Ensure "My Status" is always first for posters
    const myStatus = feed.find(f => f.userId === userId);
    const otherStatuses = feed.filter(f => f.userId !== userId);

    const data = [];

    if (canPost) {
        data.push(myStatus || {
            userId,
            userName: 'My Status',
            userAvatar,
            statuses: [],
            hasUnseen: false,
            isPlaceholder: true,
        });
    }

    data.push(...otherStatuses);

    if (data.length === 0) return null;

    return (
        <View style={styles.container}>
            <FlatList
                data={data}
                keyExtractor={(item) => item.userId}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <StatusItem
                        item={item}
                        onPress={handlePress}
                        onAddPress={onMyStatusPress}
                        isMyStatus={item.userId === userId}
                        canPost={canPost}
                    />
                )}
            />
            {/* Subtle refreshing indicator */}
            {isRefreshing && (
                <View style={styles.refreshIndicator}>
                    <ActivityIndicator size="small" color="#0469ff" />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 8,
        position: 'relative',
    },
    refreshIndicator: {
        position: 'absolute',
        top: 2,
        right: 16,
    },
    listContent: {
        paddingHorizontal: 16,
        gap: 12,
    },
    statusItem: {
        alignItems: 'center',
        width: RING_SIZE + 4,
    },
    avatarContainer: {
        width: RING_SIZE,
        height: RING_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    avatarWrapper: {
        width: AVATAR_SIZE - 4,
        height: AVATAR_SIZE - 4,
        borderRadius: (AVATAR_SIZE - 4) / 2,
        overflow: 'hidden',
        backgroundColor: '#e8e8e8',
    },
    noRingAvatar: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        borderWidth: 2,
        borderColor: '#ddd',
    },
    avatar: {
        width: '100%',
        height: '100%',
    },
    avatarShimmer: {
        position: 'absolute',
        backgroundColor: '#ddd',
        borderRadius: 999,
        zIndex: 0,
    },
    avatarGradient: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 4,
    },
    avatarTextPreview: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '700',
        textAlign: 'center',
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        backgroundColor: '#0469ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitial: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
    },
    addBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: '#0469ff',
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    statusName: {
        fontSize: 11,
        color: '#555',
        marginTop: 4,
        textAlign: 'center',
        fontWeight: '500',
    },
    // Skeleton styles
    skeletonCircle: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        backgroundColor: '#e0e0e0',
    },
    skeletonText: {
        width: 40,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#e0e0e0',
        marginTop: 6,
    },
});

export default memo(StatusRow);
