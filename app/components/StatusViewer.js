import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
    View, Text, StyleSheet, Dimensions, Modal, TouchableWithoutFeedback,
    ActivityIndicator, Platform, Alert, FlatList, TouchableOpacity
} from 'react-native';
import { Image } from 'expo-image';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { X, ChevronLeft, ChevronRight, Eye, Trash2, ChevronUp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HapticTouchable from './HapticTouch';
import { useShimmer, Bone } from './ScreenSkeleton';
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming,
    runOnJS, withSpring, cancelAnimation
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system';
import api from '../../lib/api';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PROGRESS_BAR_HEIGHT = 3;
const IMAGE_DURATION = 5000;
const DEFAULT_VIDEO_DURATION = 15000;
const VIDEO_CACHE_DIR = `${FileSystem.cacheDirectory}status_videos/`;

const videoCacheMap = {};

const StatusViewer = ({ visible, statusGroup, schoolId, viewerId, onClose, onAllViewed }) => {
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [videoLoading, setVideoLoading] = useState(false);
    const [mediaReady, setMediaReady] = useState(false);
    const [cachedVideoUri, setCachedVideoUri] = useState(null);
    const [localStatuses, setLocalStatuses] = useState([]);
    const progressAnim = useSharedValue(0);
    const timerRef = useRef(null);
    const videoRef = useRef(null);
    const translateY = useSharedValue(0);
    const loadedMediaRef = useRef(new Set());

    // FIX 2: track when a blocking UI action (delete confirm / viewers panel) is open
    // so that tap gesture is suppressed and doesn't navigate
    const [isActionActive, setIsActionActive] = useState(false);
    const [longPressing, setLongPressing] = useState(false);
    const [showViewers, setShowViewers] = useState(false);
    const shimmerAnim = useShimmer();

    const isOwnStatus = viewerId === statusGroup?.userId;
    const posterName = statusGroup?.userName || 'Unknown';
    const posterAvatar = statusGroup?.userAvatar;

    const statuses = localStatuses;
    const currentStatus = statuses[currentIndex];

    useEffect(() => {
        if (visible && statusGroup?.statuses?.length > 0) {
            setLocalStatuses([...statusGroup.statuses]);
            setCurrentIndex(0);
            progressAnim.value = 0;
            translateY.value = 0;
            setShowViewers(false);
            setLongPressing(false);
            setMediaReady(false);
            setCachedVideoUri(null);
            setIsActionActive(false);
        }
    }, [visible, statusGroup]);

    const recordViewMutation = useMutation({
        mutationFn: (statusId) => api.post(`/schools/${schoolId}/status/${statusId}/view`, { viewerId }),
        onError: (err) => console.warn('Failed to record status view:', err?.message || err),
    });

    const {
        data: viewData,
        isFetching: viewDataFetching,
        refetch: refetchViewData,
    } = useQuery({
        queryKey: ['statusViews', schoolId, currentStatus?.id],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/status/${currentStatus.id}/view`);
            return { count: res.data?.count ?? 0, viewers: res.data?.viewers ?? [] };
        },
        enabled: isOwnStatus && !!currentStatus?.id && visible,
        placeholderData: { count: currentStatus?.viewCount || 0, viewers: [] },
        staleTime: 15000,
    });

    // FIX 3: optimistic delete — remove from local state immediately, roll back on error
    const deleteStatusMutation = useMutation({
        mutationFn: (statusId) => api.delete(`/schools/${schoolId}/status/${statusId}?userId=${viewerId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['statusFeed'] });
            queryClient.invalidateQueries({ queryKey: ['statusViews'] });
        },
    });

    const viewCount = viewData?.count ?? currentStatus?.viewCount ?? 0;
    const viewers = viewData?.viewers ?? [];
    const viewersLoading = showViewers && viewDataFetching && !viewers.length;
    const deleting = deleteStatusMutation.isPending;

    useEffect(() => {
        if (!visible || !currentStatus) return;
        if (currentStatus.type !== 'video' || !currentStatus.mediaUrl) return;

        const url = currentStatus.mediaUrl;

        if (videoCacheMap[url]) {
            setCachedVideoUri(videoCacheMap[url]);
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                const dirInfo = await FileSystem.getInfoAsync(VIDEO_CACHE_DIR);
                if (!dirInfo.exists) {
                    await FileSystem.makeDirectoryAsync(VIDEO_CACHE_DIR, { intermediates: true });
                }
                const filename = url.split('/').pop().split('?')[0] || `video_${Date.now()}.mp4`;
                const localPath = VIDEO_CACHE_DIR + filename;
                const fileInfo = await FileSystem.getInfoAsync(localPath);
                if (fileInfo.exists) {
                    videoCacheMap[url] = localPath;
                    if (!cancelled) setCachedVideoUri(localPath);
                    return;
                }
                const download = await FileSystem.downloadAsync(url, localPath);
                videoCacheMap[url] = download.uri;
                if (!cancelled) setCachedVideoUri(download.uri);
            } catch (e) {
                console.warn('Video cache failed:', e.message);
            }
        })();

        return () => { cancelled = true; };
    }, [visible, currentStatus?.id]);

    useEffect(() => {
        if (!visible || !currentStatus || paused || showViewers || longPressing || isActionActive) return;
        if (currentStatus.type === 'video' && !mediaReady) {
            progressAnim.value = 0;
            return;
        }
        if (currentStatus.type === 'image' && !mediaReady) {
            if (currentStatus.mediaUrl && loadedMediaRef.current.has(currentStatus.mediaUrl)) {
                setMediaReady(true);
            }
            progressAnim.value = 0;
            return;
        }
        if (currentStatus.type === 'text' && !mediaReady) {
            setMediaReady(true);
            return;
        }

        if (!isOwnStatus) {
            recordViewMutation.mutate(currentStatus.id);
        }

        let duration;
        if (currentStatus.type === 'video') {
            if (currentStatus.trimStart != null && currentStatus.trimEnd != null) {
                duration = (currentStatus.trimEnd - currentStatus.trimStart) * 1000;
            } else {
                duration = (currentStatus.duration || 15) * 1000;
            }
        } else {
            duration = IMAGE_DURATION;
        }

        const currentProgress = progressAnim.value;
        if (currentProgress > 0.01 && currentProgress < 0.99) {
            const remaining = duration * (1 - currentProgress);
            progressAnim.value = withTiming(1, { duration: remaining });
            timerRef.current = setTimeout(() => { goNext(); }, remaining + 500);
        } else {
            progressAnim.value = 0;
            progressAnim.value = withTiming(1, { duration });
            timerRef.current = setTimeout(() => { goNext(); }, duration + 500);
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            cancelAnimation(progressAnim);
        };
    }, [currentIndex, visible, paused, currentStatus?.id, showViewers, longPressing, mediaReady, isActionActive]);

    const goNext = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setMediaReady(false);
        setCachedVideoUri(null);
        if (currentIndex < statuses.length - 1) {
            setCurrentIndex(prev => prev + 1);
            progressAnim.value = 0;
        } else {
            onAllViewed?.();
            onClose?.();
        }
    }, [currentIndex, statuses.length, onClose, onAllViewed]);

    const goPrev = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setMediaReady(false);
        setCachedVideoUri(null);
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            progressAnim.value = 0;
        }
    }, [currentIndex]);

    const handleTap = useCallback((x, y) => {
        // FIX 2: don't navigate if any blocking action is active
        if (showViewers || isActionActive) {
            if (showViewers) {
                setShowViewers(false);
                setPaused(false);
            }
            return;
        }

        // Ignore taps in the top header area or bottom footer area
        const topSafeZone = insets.top + 90;
        const bottomSafeZone = SCREEN_HEIGHT - insets.bottom - 80;
        if (y < topSafeZone || y > bottomSafeZone) {
            return;
        }

        if (x < SCREEN_WIDTH * 0.3) {
            goPrev();
        } else {
            goNext();
        }
    }, [goPrev, goNext, showViewers, isActionActive, insets.top, insets.bottom]);

    const handleLongPressStart = useCallback(() => {
        setLongPressing(true);
        setPaused(true);
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const handleLongPressEnd = useCallback(() => {
        setLongPressing(false);
        setPaused(false);
    }, []);

    const tapGesture = Gesture.Tap()
        .onEnd((e) => {
            runOnJS(handleTap)(e.x, e.y);
        });

    const longPressGesture = Gesture.LongPress()
        .minDuration(300)
        .onStart(() => { runOnJS(handleLongPressStart)(); })
        .onEnd(() => { runOnJS(handleLongPressEnd)(); });

    const composedTapGesture = Gesture.Exclusive(longPressGesture, tapGesture);

    const safeDismiss = useCallback(() => {
        onClose?.();
    }, [onClose]);

    // FIX 1a: pan gesture only handles swipe-DOWN to dismiss
    const panGesture = Gesture.Pan()
        .activeOffsetY(15)
        .failOffsetY(-5)
        .onUpdate((e) => {
            if (e.translationY > 0) {
                translateY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            if (e.translationY > 100) {
                runOnJS(safeDismiss)();
            } else {
                translateY.value = withSpring(0);
            }
        });

    // FIX 1b: swipe-up gesture is now a separate Tap/Press on a TouchableOpacity — 
    // no competing Pan gesture, which was causing the crash.
    // The handleOpenViewers is called directly via onPress instead.

    const swipeStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: 1 - (translateY.value / (SCREEN_HEIGHT * 0.5)),
    }));

    // FIX 2 + 3: delete with optimistic UI and tap suppression
    const handleDelete = useCallback(() => {
        if (!currentStatus || deleteStatusMutation.isPending) return;

        if (timerRef.current) clearTimeout(timerRef.current);
        cancelAnimation(progressAnim);
        // Mark action active BEFORE Alert so tap gesture is already suppressed
        setIsActionActive(true);
        setPaused(true);

        Alert.alert(
            'Delete Status',
            'Are you sure you want to delete this status?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => {
                        setIsActionActive(false);
                        setPaused(false);
                    },
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        const deletedId = currentStatus.id;

                        // FIX 3: Optimistic update — remove from local state immediately
                        const newStatuses = localStatuses.filter(s => s.id !== deletedId);
                        setLocalStatuses(newStatuses);

                        // Optimistically update the statusFeed cache to remove this status immediately from the home screen
                        queryClient.setQueryData(['statusFeed'], (oldData) => {
                            if (!oldData) return oldData;
                            return oldData.map(group => {
                                if (group.userId === statusGroup?.userId) {
                                    return {
                                        ...group,
                                        statuses: group.statuses.filter(s => s.id !== deletedId)
                                    };
                                }
                                return group;
                            }).filter(group => group.statuses.length > 0);
                        });

                        // Fire the API call in background — roll back on error
                        deleteStatusMutation.mutate(deletedId, {
                            onError: (err) => {
                                console.error('Delete status error:', err);
                                // Roll back optimistic update in the feed
                                queryClient.invalidateQueries({ queryKey: ['statusFeed'] });

                                // Roll back local state
                                setLocalStatuses(prev => {
                                    const deleted = localStatuses.find(s => s.id === deletedId);
                                    if (!deleted) return prev;
                                    const restored = [...prev];
                                    restored.splice(currentIndex, 0, deleted);
                                    return restored;
                                });
                                setCurrentIndex(currentIndex);
                                Alert.alert('Error', 'Failed to delete status. Please try again.');
                            },
                        });

                        if (newStatuses.length === 0) {
                            // No statuses left — close viewer right away
                            setIsActionActive(false);
                            onClose?.();
                            return;
                        }

                        // Stay at same index or clamp to last
                        const nextIndex = Math.min(currentIndex, newStatuses.length - 1);
                        setCurrentIndex(nextIndex);
                        progressAnim.value = 0;
                        setMediaReady(false);
                        setCachedVideoUri(null);
                        setIsActionActive(false);
                        setPaused(false);
                    },
                },
            ]
        );
    }, [currentStatus, deleteStatusMutation, localStatuses, currentIndex, onClose, progressAnim]);

    const handleOpenViewers = useCallback(() => {
        if (!currentStatus) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        cancelAnimation(progressAnim);
        setPaused(true);
        setShowViewers(true);
        refetchViewData();
    }, [currentStatus, refetchViewData]);

    const handleCloseViewers = useCallback(() => {
        setShowViewers(false);
        setPaused(false);
    }, []);

    const ProgressBars = memo(() => (
        <View style={[styles.progressContainer, { top: insets.top + 8 }]}>
            {statuses.map((_, idx) => {
                const progressWidth = useAnimatedStyle(() => {
                    if (idx < currentIndex) return { width: '100%' };
                    if (idx > currentIndex) return { width: '0%' };
                    return { width: `${progressAnim.value * 100}%` };
                });
                return (
                    <View key={idx} style={styles.progressTrack}>
                        <Animated.View style={[styles.progressFill, progressWidth]} />
                    </View>
                );
            })}
        </View>
    ));

    const formatTime = (dateStr) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now - d;
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        return `${hours}h ago`;
    };

    const formatViewTime = (dateStr) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diff = now - d;
        const hours = Math.floor(diff / 3600000);
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    };

    if (!visible || !currentStatus) return null;

    const renderMediaContent = () => {
        if (currentStatus.type === 'image' && currentStatus.mediaUrl) {
            return (
                <View style={StyleSheet.absoluteFill}>
                    <Image
                        source={{ uri: currentStatus.mediaUrl }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        blurRadius={25}
                        cachePolicy="memory-disk"
                    />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
                    <Image
                        source={{ uri: currentStatus.mediaUrl }}
                        style={StyleSheet.absoluteFill}
                        contentFit="contain"
                        transition={300}
                        onLoad={() => {
                            loadedMediaRef.current.add(currentStatus.mediaUrl);
                            setMediaReady(true);
                        }}
                        cachePolicy="memory-disk"
                    />
                </View>
            );
        }

        if (currentStatus.type === 'video' && currentStatus.mediaUrl) {
            return (
                <View style={StyleSheet.absoluteFill}>
                    {currentStatus.thumbnailUrl && (
                        <>
                            <Image
                                source={{ uri: currentStatus.thumbnailUrl }}
                                style={StyleSheet.absoluteFill}
                                contentFit="cover"
                                blurRadius={25}
                                cachePolicy="memory-disk"
                            />
                            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
                        </>
                    )}
                    <ExpoVideo
                        ref={videoRef}
                        key={currentStatus.mediaUrl}
                        source={{ uri: cachedVideoUri || currentStatus.mediaUrl }}
                        style={StyleSheet.absoluteFill}
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay={!paused && !longPressing}
                        isLooping={false}
                        onLoad={async (status) => {
                            setVideoLoading(false);
                            if (currentStatus.trimStart && videoRef.current) {
                                try {
                                    await videoRef.current.setPositionAsync(currentStatus.trimStart * 1000);
                                } catch (e) { }
                            }
                        }}
                        onPlaybackStatusUpdate={(status) => {
                            if (status.isLoaded) {
                                setVideoLoading(false);
                                if (!mediaReady && status.isPlaying) {
                                    loadedMediaRef.current.add(currentStatus.mediaUrl);
                                    setMediaReady(true);
                                }
                                if (currentStatus.trimEnd && status.positionMillis >= currentStatus.trimEnd * 1000) {
                                    goNext();
                                }
                            }
                            if (status.didJustFinish) {
                                goNext();
                            }
                        }}
                        onLoadStart={() => setVideoLoading(true)}
                    />
                    {videoLoading && (
                        <View style={styles.videoLoading}>
                            <ActivityIndicator size="large" color="#fff" />
                        </View>
                    )}
                </View>
            );
        }

        if (currentStatus.type === 'text') {
            return (
                <LinearGradient
                    colors={['#667eea', '#764ba2']}
                    style={StyleSheet.absoluteFill}
                >
                    <View style={styles.textStatusContainer}>
                        <Text style={styles.textStatusContent}>{currentStatus.text}</Text>
                        {currentStatus.caption && (
                            <Text style={styles.textCaption}>{currentStatus.caption}</Text>
                        )}
                    </View>
                </LinearGradient>
            );
        }

        return null;
    };

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent={false}
            statusBarTranslucent
            onRequestClose={onClose}
        >
            <GestureHandlerRootView style={{ flex: 1 }}>
                {/* FIX 1a: outer pan only handles swipe-down dismiss */}
                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[styles.viewerContainer, swipeStyle]}>
                        <GestureDetector gesture={composedTapGesture}>
                            <View style={styles.contentContainer}>
                                <View style={styles.backgroundFill}>
                                    {renderMediaContent()}
                                </View>

                                <LinearGradient
                                    colors={['rgba(0,0,0,0.5)', 'transparent', 'transparent', 'rgba(0,0,0,0.3)']}
                                    locations={[0, 0.2, 0.8, 1]}
                                    style={StyleSheet.absoluteFill}
                                    pointerEvents="none"
                                />

                                {longPressing && (
                                    <View style={styles.pauseIndicator} pointerEvents="none">
                                        <Text style={styles.pauseIndicatorText}>Paused</Text>
                                    </View>
                                )}

                                <ProgressBars />

                                {/* Header — FIX 2: delete button wrapped in its own gesture stopper */}
                                <View style={[styles.header, { top: insets.top + 20 }]}>
                                    <View style={styles.headerLeft}>
                                        <View style={styles.posterAvatar}>
                                            {posterAvatar && posterAvatar !== 'default.png' ? (
                                                <Image
                                                    source={{ uri: posterAvatar }}
                                                    style={styles.posterAvatarImg}
                                                    contentFit="cover"
                                                    cachePolicy="memory-disk"
                                                />
                                            ) : (
                                                <Text style={styles.posterInitial}>
                                                    {posterName[0]?.toUpperCase()}
                                                </Text>
                                            )}
                                        </View>
                                        <View>
                                            <Text style={styles.posterName}>{posterName}</Text>
                                            <Text style={styles.posterTime}>
                                                {formatTime(currentStatus.createdAt)}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.headerRight}>
                                        {isOwnStatus && (
                                            // FIX 2: TouchableOpacity with onStartShouldSetResponder
                                            // stops the tap from propagating to the GestureDetector beneath
                                            <TouchableOpacity
                                                onPress={handleDelete}
                                                style={styles.headerButton}
                                                activeOpacity={0.7}
                                                // This is the key fix — consume the touch event here
                                                onStartShouldSetResponder={() => true}
                                            >
                                                {deleting ? (
                                                    <ActivityIndicator size={16} color="#fff" />
                                                ) : (
                                                    <Trash2 size={18} color="#fff" />
                                                )}
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity
                                            onPress={onClose}
                                            style={styles.closeButton}
                                            activeOpacity={0.7}
                                            onStartShouldSetResponder={() => true}
                                        >
                                            <X size={22} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {currentStatus.type !== 'text' && currentStatus.caption && (
                                    <View style={[styles.captionContainer, { bottom: isOwnStatus ? insets.bottom + 60 : insets.bottom + 20 }]}>
                                        <Text style={styles.caption}>{currentStatus.caption}</Text>
                                    </View>
                                )}
                            </View>
                        </GestureDetector>

                        {/* FIX 1b: view count footer — plain TouchableOpacity, NO swipeUpGesture Pan.
                            The competing Pan on the footer was crashing on iOS/Android.
                            A simple onPress is sufficient and crash-free. */}
                        {isOwnStatus && (
                            <TouchableOpacity
                                onPress={handleOpenViewers}
                                activeOpacity={0.7}
                                onStartShouldSetResponder={() => true}
                                style={[styles.viewCountFooter, { bottom: insets.bottom + 10 }]}
                            >
                                <View style={styles.viewCountTouchable}>
                                    <Eye size={16} color="#fff" />
                                    <Text style={styles.viewCountText}>
                                        {viewCount} {viewCount === 1 ? 'view' : 'views'}
                                    </Text>
                                    <ChevronUp size={14} color="rgba(255,255,255,0.6)" style={{ marginLeft: 4 }} />
                                </View>
                            </TouchableOpacity>
                        )}

                        {/* Viewers Panel */}
                        {showViewers && (
                            <View style={[styles.viewersPanel, { paddingBottom: insets.bottom + 10 }]}>
                                <View style={styles.viewersPanelHeader}>
                                    <View style={styles.viewersPanelDragHandle} />
                                    <View style={styles.viewersPanelTitleRow}>
                                        <Text style={styles.viewersPanelTitle}>
                                            Viewed by {viewCount}
                                        </Text>
                                        <HapticTouchable onPress={handleCloseViewers} style={styles.viewersPanelClose}>
                                            <X size={18} color="#333" />
                                        </HapticTouchable>
                                    </View>
                                </View>

                                {viewersLoading ? (
                                    <View style={styles.viewersLoadingContainer}>
                                        {Array.from({ length: 3 }).map((_, i) => (
                                            <View key={i} style={styles.viewerItem}>
                                                <Bone animValue={shimmerAnim} width={40} height={40} borderRadius={20} />
                                                <View style={{ flex: 1, gap: 6 }}>
                                                    <Bone animValue={shimmerAnim} width={i % 2 === 0 ? '60%' : '45%'} height={14} borderRadius={5} />
                                                    <Bone animValue={shimmerAnim} width={i % 2 === 0 ? '35%' : '50%'} height={11} borderRadius={4} />
                                                </View>
                                                <Bone animValue={shimmerAnim} width={45} height={11} borderRadius={4} />
                                            </View>
                                        ))}
                                    </View>
                                ) : viewers.length === 0 ? (
                                    <View style={styles.viewersEmptyContainer}>
                                        <Eye size={24} color="#ccc" />
                                        <Text style={styles.viewersEmptyText}>No views yet</Text>
                                    </View>
                                ) : (
                                    <FlatList
                                        data={viewers}
                                        keyExtractor={(item) => item.id || item.viewerId}
                                        showsVerticalScrollIndicator={false}
                                        style={styles.viewersList}
                                        renderItem={({ item }) => (
                                            <View style={styles.viewerItem}>
                                                <View style={styles.viewerAvatar}>
                                                    {item.viewerAvatar && item.viewerAvatar !== 'default.png' ? (
                                                        <Image
                                                            source={{ uri: item.viewerAvatar }}
                                                            style={styles.viewerAvatarImg}
                                                            contentFit="cover"
                                                            cachePolicy="memory-disk"
                                                        />
                                                    ) : (
                                                        <Text style={styles.viewerInitial}>
                                                            {(item.viewerName || '?')[0].toUpperCase()}
                                                        </Text>
                                                    )}
                                                </View>
                                                <View style={styles.viewerInfo}>
                                                    <Text style={styles.viewerName} numberOfLines={1}>
                                                        {item.viewerName}
                                                    </Text>
                                                    {item.viewerRole === 'PARENT' && item.childInfo && item.childInfo.length > 0 ? (
                                                        <Text style={styles.viewerChildInfo} numberOfLines={2}>
                                                            {item.childInfo.map(c => {
                                                                let info = c.name || '';
                                                                if (c.class) info += ` • ${c.class}`;
                                                                if (c.section) info += ` - ${c.section}`;
                                                                return info;
                                                            }).join(', ')}
                                                        </Text>
                                                    ) : (
                                                        <Text style={styles.viewerRole}>
                                                            {(item.viewerRole || '').replace(/_/g, ' ')}
                                                        </Text>
                                                    )}
                                                </View>
                                                <Text style={styles.viewerTime}>
                                                    {formatViewTime(item.viewedAt)}
                                                </Text>
                                            </View>
                                        )}
                                    />
                                )}
                            </View>
                        )}
                    </Animated.View>
                </GestureDetector>
            </GestureHandlerRootView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    viewerContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    contentContainer: {
        flex: 1,
    },
    backgroundFill: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#111',
    },
    progressContainer: {
        position: 'absolute',
        left: 8,
        right: 8,
        flexDirection: 'row',
        gap: 3,
        zIndex: 10,
    },
    progressTrack: {
        flex: 1,
        height: PROGRESS_BAR_HEIGHT,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#fff',
        borderRadius: 2,
    },
    header: {
        position: 'absolute',
        left: 12,
        right: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    posterAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#0469ff',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    posterAvatarImg: {
        width: '100%',
        height: '100%',
    },
    posterInitial: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    posterName: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    posterTime: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 11,
    },
    headerButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    closeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    textStatusContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
    },
    textStatusContent: {
        color: '#fff',
        fontSize: 28,
        fontWeight: '700',
        textAlign: 'center',
        lineHeight: 38,
    },
    textCaption: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 16,
    },
    captionContainer: {
        position: 'absolute',
        left: 16,
        right: 16,
        zIndex: 10,
    },
    caption: {
        color: '#fff',
        fontSize: 15,
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
    },
    videoLoading: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.3)',
    },
    pauseIndicator: {
        position: 'absolute',
        top: '50%',
        alignSelf: 'center',
        marginTop: -15,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        zIndex: 15,
    },
    pauseIndicatorText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    viewCountFooter: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 10,
    },
    viewCountTouchable: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
    },
    viewCountText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
    viewersPanel: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: SCREEN_HEIGHT * 0.55,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        zIndex: 20,
    },
    viewersPanelHeader: {
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    viewersPanelDragHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#ddd',
        marginBottom: 10,
    },
    viewersPanelTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 10,
        width: '100%',
    },
    viewersPanelTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    viewersPanelClose: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewersList: {
        paddingHorizontal: 16,
    },
    viewerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        gap: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: '#f0f0f0',
    },
    viewerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#0469ff',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    viewerAvatarImg: {
        width: '100%',
        height: '100%',
    },
    viewerInitial: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    viewerInfo: {
        flex: 1,
    },
    viewerName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    viewerRole: {
        fontSize: 12,
        color: '#888',
        marginTop: 1,
        textTransform: 'capitalize',
    },
    viewerChildInfo: {
        fontSize: 12,
        color: '#0469ff',
        marginTop: 1,
        fontWeight: '500',
    },
    viewerTime: {
        fontSize: 11,
        color: '#aaa',
    },
    viewersLoadingContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    viewersEmptyContainer: {
        alignItems: 'center',
        paddingVertical: 30,
        gap: 8,
    },
    viewersEmptyText: {
        fontSize: 14,
        color: '#aaa',
    },
});

export default memo(StatusViewer);