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
import Animated, {
    useSharedValue, useAnimatedStyle, withTiming,
    runOnJS, withSpring, cancelAnimation
} from 'react-native-reanimated';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system';
import api from '../../lib/api';
import { useQueryClient } from '@tanstack/react-query';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PROGRESS_BAR_HEIGHT = 3;
const IMAGE_DURATION = 5000; // 5 seconds for images
const DEFAULT_VIDEO_DURATION = 15000; // 15 seconds fallback for video
const VIDEO_CACHE_DIR = `${FileSystem.cacheDirectory}status_videos/`;

// In-memory map: remote URL -> local cached URI (persists across mounts)
const videoCacheMap = {};

/**
 * StatusViewer — Fullscreen modal for viewing statuses
 * Features: auto-progress, tap navigation, long-press to pause, swipe-to-dismiss,
 *           swipe-up to open viewers, seen tracking, view count + viewer details,
 *           delete own statuses, blurred background for correct aspect ratio, media caching
 */
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
    const loadedMediaRef = useRef(new Set()); // Track URLs already loaded to skip wait on revisit

    // Long-press state
    const [longPressing, setLongPressing] = useState(false);

    // Viewer details state
    const [showViewers, setShowViewers] = useState(false);
    const [viewers, setViewers] = useState([]);
    const [viewersLoading, setViewersLoading] = useState(false);
    const [viewCount, setViewCount] = useState(0);

    // Deleting state
    const [deleting, setDeleting] = useState(false);

    const isOwnStatus = viewerId === statusGroup?.userId;
    const posterName = statusGroup?.userName || 'Unknown';
    const posterAvatar = statusGroup?.userAvatar;

    const statuses = localStatuses;
    const currentStatus = statuses[currentIndex];

    // Sync localStatuses from statusGroup when it changes or modal opens
    useEffect(() => {
        if (visible && statusGroup?.statuses?.length > 0) {
            setLocalStatuses([...statusGroup.statuses]);
            setCurrentIndex(0);
            progressAnim.value = 0;
            translateY.value = 0;
            setShowViewers(false);
            setViewers([]);
            setLongPressing(false);
            setMediaReady(false);
            setCachedVideoUri(null);
            // Initialize viewCount from feed data (comes from _count in API)
            const firstStatus = statusGroup.statuses[0];
            setViewCount(firstStatus?.viewCount || 0);
        }
    }, [visible, statusGroup]);

    // Record view
    const recordView = useCallback(async (statusId) => {
        try {
            await api.post(`/schools/${schoolId}/status/${statusId}/view`, { viewerId });
        } catch (err) {
            console.warn('Failed to record status view:', err?.message || err);
        }
    }, [schoolId, viewerId]);

    // Fetch view count for own statuses
    const fetchViewCount = useCallback(async (statusId) => {
        if (!isOwnStatus || !statusId) return;
        try {
            const res = await api.get(`/schools/${schoolId}/status/${statusId}/view`);
            const count = res.data?.count;
            if (count != null) setViewCount(count);
        } catch (err) {
            console.warn('Failed to fetch view count:', err?.message || err);
            // Don't reset to 0 on error — keep the feed-provided value
        }
    }, [schoolId, isOwnStatus]);

    // Fetch viewer details
    const fetchViewers = useCallback(async (statusId) => {
        if (!statusId) return;
        setViewersLoading(true);
        try {
            const res = await api.get(`/schools/${schoolId}/status/${statusId}/view`);
            setViewers(res.data?.viewers || []);
            setViewCount(res.data?.count || 0);
        } catch (err) {
            setViewers([]);
        } finally {
            setViewersLoading(false);
        }
    }, [schoolId]);

    // Pre-cache video to local disk so re-views don't re-download
    useEffect(() => {
        if (!visible || !currentStatus) return;
        if (currentStatus.type !== 'video' || !currentStatus.mediaUrl) return;

        const url = currentStatus.mediaUrl;

        // Already resolved from memory map?
        if (videoCacheMap[url]) {
            setCachedVideoUri(videoCacheMap[url]);
            return;
        }

        let cancelled = false;

        (async () => {
            try {
                // Create cache directory if needed
                const dirInfo = await FileSystem.getInfoAsync(VIDEO_CACHE_DIR);
                if (!dirInfo.exists) {
                    await FileSystem.makeDirectoryAsync(VIDEO_CACHE_DIR, { intermediates: true });
                }

                // Derive a stable filename from URL
                const filename = url.split('/').pop().split('?')[0] || `video_${Date.now()}.mp4`;
                const localPath = VIDEO_CACHE_DIR + filename;

                // Check if already on disk
                const fileInfo = await FileSystem.getInfoAsync(localPath);
                if (fileInfo.exists) {
                    videoCacheMap[url] = localPath;
                    if (!cancelled) setCachedVideoUri(localPath);
                    return;
                }

                // Download to disk
                const download = await FileSystem.downloadAsync(url, localPath);
                videoCacheMap[url] = download.uri;
                if (!cancelled) setCachedVideoUri(download.uri);
            } catch (e) {
                // Failed to cache — fall through to remote URL (already wired as fallback)
                console.warn('Video cache failed:', e.message);
            }
        })();

        return () => { cancelled = true; };
    }, [visible, currentStatus?.id]);

    // Start timer for current status
    useEffect(() => {
        // Wait for media to finish loading before starting the timer
        if (!visible || !currentStatus || paused || showViewers || longPressing) return;
        if (currentStatus.type === 'video' && !mediaReady) {
            // Videos always need to buffer — never skip the wait
            progressAnim.value = 0;
            return;
        }
        if (currentStatus.type === 'image' && !mediaReady) {
            // Images cache locally — check if we've loaded this before
            if (currentStatus.mediaUrl && loadedMediaRef.current.has(currentStatus.mediaUrl)) {
                setMediaReady(true);
            }
            progressAnim.value = 0;
            return;
        }
        // Text statuses are immediately ready
        if (currentStatus.type === 'text' && !mediaReady) {
            setMediaReady(true);
            return;
        }

        // Record view (not for own statuses)
        if (!isOwnStatus) {
            recordView(currentStatus.id);
        }

        // For own statuses: set count from feed data, then fetch latest from API
        if (isOwnStatus) {
            setViewCount(currentStatus.viewCount || 0); // immediate from feed
            fetchViewCount(currentStatus.id); // then fetch latest
        }

        // Determine duration — respect trim boundaries for video
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

        // Check if we're resuming from a pause/long-press (progress is mid-way)
        const currentProgress = progressAnim.value;
        if (currentProgress > 0.01 && currentProgress < 0.99) {
            // Resume: animate remaining portion from current position
            const remaining = duration * (1 - currentProgress);
            progressAnim.value = withTiming(1, { duration: remaining });
            timerRef.current = setTimeout(() => {
                goNext();
            }, remaining + 500);
        } else {
            // Fresh start: reset and animate full duration
            progressAnim.value = 0;
            progressAnim.value = withTiming(1, { duration });
            timerRef.current = setTimeout(() => {
                goNext();
            }, duration + 500);
        }

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            cancelAnimation(progressAnim); // Freeze progress bar at current position
        };
    }, [currentIndex, visible, paused, currentStatus?.id, showViewers, longPressing, mediaReady]);

    const goNext = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setMediaReady(false); // Reset for next status
        setCachedVideoUri(null);
        if (currentIndex < statuses.length - 1) {
            setCurrentIndex(prev => prev + 1);
            progressAnim.value = 0;
        } else {
            // All statuses viewed
            onAllViewed?.();
            onClose?.();
        }
    }, [currentIndex, statuses.length, onClose, onAllViewed]);

    const goPrev = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        setMediaReady(false); // Reset for prev status
        setCachedVideoUri(null);
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
            progressAnim.value = 0;
        }
    }, [currentIndex]);

    // Tap handler — if viewers panel open, close it; otherwise navigate
    const handleTap = useCallback((x) => {
        if (showViewers) {
            // Tap anywhere closes viewers panel
            setShowViewers(false);
            setPaused(false);
            return;
        }
        if (x < SCREEN_WIDTH * 0.3) {
            goPrev();
        } else {
            goNext();
        }
    }, [goPrev, goNext, showViewers]);

    // Long-press to pause
    const handleLongPressStart = useCallback(() => {
        setLongPressing(true);
        setPaused(true);
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const handleLongPressEnd = useCallback(() => {
        setLongPressing(false);
        setPaused(false);
    }, []);

    // Gesture: Tap for navigation, LongPress for pause
    const tapGesture = Gesture.Tap()
        .onEnd((e) => {
            runOnJS(handleTap)(e.x);
        });

    const longPressGesture = Gesture.LongPress()
        .minDuration(300)
        .onStart(() => {
            runOnJS(handleLongPressStart)();
        })
        .onEnd(() => {
            runOnJS(handleLongPressEnd)();
        });

    // Long press takes priority over tap
    const composedTapGesture = Gesture.Exclusive(longPressGesture, tapGesture);

    // Swipe down gesture to dismiss
    const panGesture = Gesture.Pan()
        .onUpdate((e) => {
            if (e.translationY > 0) {
                translateY.value = e.translationY;
            }
        })
        .onEnd((e) => {
            if (e.translationY > 100) {
                runOnJS(onClose)();
            } else {
                translateY.value = withSpring(0);
            }
        });

    // Swipe-up gesture on the view count footer area to open viewers
    const swipeUpGesture = Gesture.Pan()
        .onEnd((e) => {
            if (e.translationY < -60) {
                runOnJS(handleOpenViewers)();
            }
        });

    const swipeStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: 1 - (translateY.value / (SCREEN_HEIGHT * 0.5)),
    }));

    // Handle delete status
    const handleDelete = useCallback(() => {
        if (!currentStatus || deleting) return;

        // Pause the timer during confirmation
        if (timerRef.current) clearTimeout(timerRef.current);
        setPaused(true);

        Alert.alert(
            'Delete Status',
            'Are you sure you want to delete this status?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                    onPress: () => setPaused(false),
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setDeleting(true);
                        try {
                            await api.delete(
                                `/schools/${schoolId}/status/${currentStatus.id}?userId=${viewerId}`
                            );

                            // Remove from local state
                            const newStatuses = localStatuses.filter(s => s.id !== currentStatus.id);
                            setLocalStatuses(newStatuses);

                            // Invalidate feed cache
                            queryClient.invalidateQueries({ queryKey: ['statusFeed'] });

                            if (newStatuses.length === 0) {
                                // No more statuses, close viewer
                                onClose?.();
                            } else if (currentIndex >= newStatuses.length) {
                                // Was last status, go to new last
                                setCurrentIndex(newStatuses.length - 1);
                            }
                            // else currentIndex stays the same, new status at that index loads

                            setPaused(false);
                        } catch (err) {
                            console.error('Delete status error:', err);
                            Alert.alert('Error', 'Failed to delete status. Please try again.');
                            setPaused(false);
                        } finally {
                            setDeleting(false);
                        }
                    },
                },
            ]
        );
    }, [currentStatus, deleting, localStatuses, currentIndex, schoolId, viewerId, onClose, queryClient]);

    // Open viewers panel
    const handleOpenViewers = useCallback(() => {
        if (!currentStatus) return;
        // Pause progress
        if (timerRef.current) clearTimeout(timerRef.current);
        setPaused(true);
        setShowViewers(true);
        fetchViewers(currentStatus.id);
    }, [currentStatus, fetchViewers]);

    // Close viewers panel
    const handleCloseViewers = useCallback(() => {
        setShowViewers(false);
        setPaused(false);
    }, []);

    // Progress bar segments
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

    // Render media content with blurred background for correct aspect ratio
    const renderMediaContent = () => {
        if (currentStatus.type === 'image' && currentStatus.mediaUrl) {
            return (
                <View style={StyleSheet.absoluteFill}>
                    {/* Blurred background fill */}
                    <Image
                        source={{ uri: currentStatus.mediaUrl }}
                        style={StyleSheet.absoluteFill}
                        contentFit="cover"
                        blurRadius={25}
                        cachePolicy="memory-disk"
                    />
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
                    {/* Actual image — contained for proper aspect ratio */}
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
                    {/* Blurred background fill for video */}
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
                    {/* Actual video — contained for proper aspect ratio */}
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
                            // Set initial position only ONCE on load (not on every render)
                            if (currentStatus.trimStart && videoRef.current) {
                                try {
                                    await videoRef.current.setPositionAsync(currentStatus.trimStart * 1000);
                                } catch (e) { }
                            }
                        }}
                        onPlaybackStatusUpdate={(status) => {
                            if (status.isLoaded) {
                                setVideoLoading(false);
                                // Mark video as ready so the timer can start
                                if (!mediaReady && status.isPlaying) {
                                    loadedMediaRef.current.add(currentStatus.mediaUrl);
                                    setMediaReady(true);
                                }
                                // Stop at trimEnd if set
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
                        <Text style={styles.textStatusContent}>
                            {currentStatus.text}
                        </Text>
                        {currentStatus.caption && (
                            <Text style={styles.textCaption}>
                                {currentStatus.caption}
                            </Text>
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
                <GestureDetector gesture={panGesture}>
                    <Animated.View style={[styles.viewerContainer, swipeStyle]}>
                        <GestureDetector gesture={composedTapGesture}>
                            <View style={styles.contentContainer}>
                                {/* Background with blurred fill + contained media */}
                                <View style={styles.backgroundFill}>
                                    {renderMediaContent()}
                                </View>

                                {/* Overlay gradient */}
                                <LinearGradient
                                    colors={['rgba(0,0,0,0.5)', 'transparent', 'transparent', 'rgba(0,0,0,0.3)']}
                                    locations={[0, 0.2, 0.8, 1]}
                                    style={StyleSheet.absoluteFill}
                                    pointerEvents="none"
                                />

                                {/* Long-press pause indicator */}
                                {longPressing && (
                                    <View style={styles.pauseIndicator} pointerEvents="none">
                                        <Text style={styles.pauseIndicatorText}>Paused</Text>
                                    </View>
                                )}

                                {/* Progress Bars */}
                                <ProgressBars />

                                {/* Header */}
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
                                        {/* Delete button (own statuses only) */}
                                        {isOwnStatus && (
                                            <HapticTouchable onPress={handleDelete} style={styles.headerButton}>
                                                {deleting ? (
                                                    <ActivityIndicator size={16} color="#fff" />
                                                ) : (
                                                    <Trash2 size={18} color="#fff" />
                                                )}
                                            </HapticTouchable>
                                        )}
                                        {/* Close button */}
                                        <HapticTouchable onPress={onClose} style={styles.closeButton}>
                                            <X size={22} color="#fff" />
                                        </HapticTouchable>
                                    </View>
                                </View>

                                {/* Caption overlay at bottom */}
                                {currentStatus.type !== 'text' && currentStatus.caption && (
                                    <View style={[styles.captionContainer, { bottom: isOwnStatus ? insets.bottom + 60 : insets.bottom + 20 }]}>
                                        <Text style={styles.caption}>{currentStatus.caption}</Text>
                                    </View>
                                )}

                                {/* View count footer (own statuses only) — swipeable to open viewers */}
                                {isOwnStatus && (
                                    <GestureDetector gesture={swipeUpGesture}>
                                        <View style={[styles.viewCountFooter, { bottom: insets.bottom + 10 }]}>
                                            <TouchableOpacity
                                                onPress={handleOpenViewers}
                                                activeOpacity={0.7}
                                                style={styles.viewCountTouchable}
                                            >
                                                <Eye size={16} color="#fff" />
                                                <Text style={styles.viewCountText}>
                                                    {viewCount} {viewCount === 1 ? 'view' : 'views'}
                                                </Text>
                                                <ChevronUp size={14} color="rgba(255,255,255,0.6)" style={{ marginLeft: 4 }} />
                                            </TouchableOpacity>
                                        </View>
                                    </GestureDetector>
                                )}
                            </View>
                        </GestureDetector>

                        {/* Viewers Panel (overlay) */}
                        {showViewers && (
                            <View style={[styles.viewersPanel, { paddingBottom: insets.bottom + 10 }]}>
                                {/* Panel header */}
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

                                {/* Viewers list */}
                                {viewersLoading ? (
                                    <View style={styles.viewersLoadingContainer}>
                                        <ActivityIndicator size="small" color="#0469ff" />
                                        <Text style={styles.viewersLoadingText}>Loading viewers...</Text>
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

    // Pause indicator
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

    // View count footer
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

    // Viewers panel (bottom sheet style)
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
        alignItems: 'center',
        paddingVertical: 30,
        gap: 8,
    },
    viewersLoadingText: {
        fontSize: 13,
        color: '#888',
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
