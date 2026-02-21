import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import {
    View, Text, StyleSheet, Dimensions, ActivityIndicator, Modal
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue, useAnimatedStyle, runOnJS, withTiming,
    clamp
} from 'react-native-reanimated';
import { X, Check, Scissors } from 'lucide-react-native';
import HapticTouchable from './HapticTouch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TIMELINE_PADDING = 24;
const TIMELINE_WIDTH = SCREEN_WIDTH - TIMELINE_PADDING * 2;
const HANDLE_WIDTH = 16;
const MIN_TRIM_DURATION = 3; // minimum 3 seconds
const MAX_TRIM_DURATION = 30; // maximum 30 seconds
const THUMBNAIL_COUNT = 10;
const THUMBNAIL_HEIGHT = 56;

/**
 * VideoTrimmer — WhatsApp-style video trim UI
 * Shows thumbnail timeline with draggable start/end handles
 */
const VideoTrimmer = ({ visible, uri, totalDuration, onConfirm, onCancel }) => {
    const insets = useSafeAreaInsets();
    const [thumbnails, setThumbnails] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const videoRef = React.useRef(null);

    // Total duration in seconds
    const duration = totalDuration || 60;

    // Pixels per second
    const pxPerSec = TIMELINE_WIDTH / duration;

    // Shared values for handle positions (in pixels)
    const leftHandleX = useSharedValue(0);
    const rightHandleX = useSharedValue(Math.min(MAX_TRIM_DURATION, duration) * pxPerSec);

    // Context for gesture tracking
    const leftStartX = useSharedValue(0);
    const rightStartX = useSharedValue(0);

    // Derive trim times from pixel positions
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(Math.min(MAX_TRIM_DURATION, duration));

    // Generate thumbnails
    useEffect(() => {
        if (!visible || !uri) return;

        let cancelled = false;
        setLoading(true);

        const generateThumbnails = async () => {
            const thumbs = [];
            const interval = (duration * 1000) / THUMBNAIL_COUNT;

            for (let i = 0; i < THUMBNAIL_COUNT; i++) {
                if (cancelled) return;
                try {
                    const { uri: thumbUri } = await VideoThumbnails.getThumbnailAsync(uri, {
                        time: Math.floor(i * interval),
                        quality: 0.3,
                    });
                    thumbs.push(thumbUri);
                } catch (e) {
                    thumbs.push(null);
                }
            }

            if (!cancelled) {
                setThumbnails(thumbs);
                setLoading(false);
            }
        };

        generateThumbnails();
        return () => { cancelled = true; };
    }, [visible, uri, duration]);

    // Reset on open
    useEffect(() => {
        if (visible) {
            const maxEnd = Math.min(MAX_TRIM_DURATION, duration);
            leftHandleX.value = 0;
            rightHandleX.value = maxEnd * pxPerSec;
            setTrimStart(0);
            setTrimEnd(maxEnd);
        }
    }, [visible]);

    // Update trim state from JS
    const updateTrimStart = useCallback((px) => {
        const t = Math.max(0, px / pxPerSec);
        setTrimStart(parseFloat(t.toFixed(1)));
    }, [pxPerSec]);

    const updateTrimEnd = useCallback((px) => {
        const t = Math.min(duration, px / pxPerSec);
        setTrimEnd(parseFloat(t.toFixed(1)));
    }, [pxPerSec, duration]);

    // Left handle gesture
    const leftGesture = Gesture.Pan()
        .onStart(() => {
            leftStartX.value = leftHandleX.value;
        })
        .onUpdate((e) => {
            const newX = leftStartX.value + e.translationX;
            const maxX = rightHandleX.value - MIN_TRIM_DURATION * pxPerSec;
            const minRight = newX + MAX_TRIM_DURATION * pxPerSec;

            leftHandleX.value = clamp(newX, 0, maxX);

            // If range would exceed MAX_TRIM_DURATION, push right handle
            if ((rightHandleX.value - leftHandleX.value) > MAX_TRIM_DURATION * pxPerSec) {
                rightHandleX.value = leftHandleX.value + MAX_TRIM_DURATION * pxPerSec;
                runOnJS(updateTrimEnd)(rightHandleX.value);
            }

            runOnJS(updateTrimStart)(leftHandleX.value);
        })
        .onEnd(() => {
            // Seek video to trim start
            runOnJS(seekToTrimStart)();
        });

    // Right handle gesture
    const rightGesture = Gesture.Pan()
        .onStart(() => {
            rightStartX.value = rightHandleX.value;
        })
        .onUpdate((e) => {
            const newX = rightStartX.value + e.translationX;
            const minX = leftHandleX.value + MIN_TRIM_DURATION * pxPerSec;
            const maxPx = duration * pxPerSec;

            rightHandleX.value = clamp(newX, minX, maxPx);

            // If range would exceed MAX_TRIM_DURATION, push left handle
            if ((rightHandleX.value - leftHandleX.value) > MAX_TRIM_DURATION * pxPerSec) {
                leftHandleX.value = rightHandleX.value - MAX_TRIM_DURATION * pxPerSec;
                runOnJS(updateTrimStart)(leftHandleX.value);
            }

            runOnJS(updateTrimEnd)(rightHandleX.value);
        })
        .onEnd(() => {
            runOnJS(seekToTrimStart)();
        });

    const seekToTrimStart = useCallback(async () => {
        try {
            await videoRef.current?.setPositionAsync(trimStart * 1000);
        } catch (e) { }
    }, [trimStart]);

    // Animated styles
    const leftHandleStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: leftHandleX.value }],
    }));

    const rightHandleStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: rightHandleX.value - HANDLE_WIDTH }],
    }));

    const selectionOverlayStyle = useAnimatedStyle(() => ({
        left: leftHandleX.value + HANDLE_WIDTH,
        width: rightHandleX.value - leftHandleX.value - HANDLE_WIDTH,
    }));

    const leftDimStyle = useAnimatedStyle(() => ({
        width: leftHandleX.value,
    }));

    const rightDimStyle = useAnimatedStyle(() => ({
        left: rightHandleX.value,
        width: TIMELINE_WIDTH - rightHandleX.value,
    }));

    // Playback monitoring — stop at trimEnd
    const onPlaybackUpdate = useCallback((status) => {
        if (status.isLoaded && status.isPlaying) {
            const posSec = status.positionMillis / 1000;
            setCurrentTime(posSec);
            if (posSec >= trimEnd) {
                videoRef.current?.pauseAsync();
                videoRef.current?.setPositionAsync(trimStart * 1000);
                setIsPlaying(false);
            }
        }
    }, [trimEnd, trimStart]);

    const togglePlayback = useCallback(async () => {
        if (isPlaying) {
            await videoRef.current?.pauseAsync();
            setIsPlaying(false);
        } else {
            await videoRef.current?.setPositionAsync(trimStart * 1000);
            await videoRef.current?.playAsync();
            setIsPlaying(true);
        }
    }, [isPlaying, trimStart]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const trimDuration = trimEnd - trimStart;

    const handleConfirm = useCallback(() => {
        onConfirm?.({
            uri,
            trimStart,
            trimEnd,
            duration: Math.ceil(trimDuration),
        });
    }, [uri, trimStart, trimEnd, trimDuration, onConfirm]);

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <View style={[styles.container, { paddingTop: insets.top }]}>
                    {/* Header */}
                    <View style={styles.header}>
                        <HapticTouchable onPress={onCancel} style={styles.headerBtn}>
                            <X size={22} color="#333" />
                        </HapticTouchable>
                        <View style={styles.headerCenter}>
                            <Scissors size={16} color="#0469ff" />
                            <Text style={styles.headerTitle}>Trim Video</Text>
                        </View>
                        <HapticTouchable onPress={handleConfirm} style={styles.confirmBtn}>
                            <Check size={18} color="#fff" />
                            <Text style={styles.confirmText}>Done</Text>
                        </HapticTouchable>
                    </View>

                    {/* Video Preview */}
                    <HapticTouchable onPress={togglePlayback} style={styles.videoContainer}>
                        <Video
                            ref={videoRef}
                            source={{ uri }}
                            style={styles.video}
                            resizeMode={ResizeMode.CONTAIN}
                            shouldPlay={false}
                            isLooping={false}
                            onPlaybackStatusUpdate={onPlaybackUpdate}
                        />
                        {!isPlaying && (
                            <View style={styles.playOverlay}>
                                <View style={styles.playButton}>
                                    <Text style={styles.playIcon}>▶</Text>
                                </View>
                            </View>
                        )}
                    </HapticTouchable>

                    {/* Duration Info */}
                    <View style={styles.durationInfo}>
                        <Text style={styles.durationText}>
                            {formatTime(trimStart)} — {formatTime(trimEnd)}
                        </Text>
                        <View style={[
                            styles.durationBadge,
                            trimDuration > MAX_TRIM_DURATION && styles.durationBadgeWarn
                        ]}>
                            <Text style={[
                                styles.durationBadgeText,
                                trimDuration > MAX_TRIM_DURATION && styles.durationBadgeTextWarn
                            ]}>
                                {formatTime(trimDuration)} / 0:30
                            </Text>
                        </View>
                    </View>

                    {/* Thumbnail Timeline */}
                    <View style={styles.timelineContainer}>
                        {loading ? (
                            <View style={styles.timelineLoading}>
                                <ActivityIndicator size="small" color="#0469ff" />
                                <Text style={styles.loadingText}>Generating thumbnails...</Text>
                            </View>
                        ) : (
                            <View style={styles.timeline}>
                                {/* Thumbnail strip */}
                                <View style={styles.thumbnailStrip}>
                                    {thumbnails.map((thumb, idx) => (
                                        <View key={idx} style={[styles.thumbnailSlot, { width: TIMELINE_WIDTH / THUMBNAIL_COUNT }]}>
                                            {thumb ? (
                                                <Image
                                                    source={{ uri: thumb }}
                                                    style={styles.thumbnail}
                                                    contentFit="cover"
                                                />
                                            ) : (
                                                <View style={[styles.thumbnail, styles.thumbnailPlaceholder]} />
                                            )}
                                        </View>
                                    ))}
                                </View>

                                {/* Left dim overlay */}
                                <Animated.View style={[styles.dimOverlay, styles.leftDim, leftDimStyle]} />

                                {/* Right dim overlay */}
                                <Animated.View style={[styles.dimOverlay, styles.rightDim, rightDimStyle]} />

                                {/* Selection border */}
                                <Animated.View style={[styles.selectionBorder, selectionOverlayStyle]} />

                                {/* Left Handle */}
                                <GestureDetector gesture={leftGesture}>
                                    <Animated.View style={[styles.handle, styles.leftHandle, leftHandleStyle]}>
                                        <View style={styles.handleBar} />
                                        <View style={styles.handleBar} />
                                    </Animated.View>
                                </GestureDetector>

                                {/* Right Handle */}
                                <GestureDetector gesture={rightGesture}>
                                    <Animated.View style={[styles.handle, styles.rightHandle, rightHandleStyle]}>
                                        <View style={styles.handleBar} />
                                        <View style={styles.handleBar} />
                                    </Animated.View>
                                </GestureDetector>
                            </View>
                        )}
                    </View>

                    {/* Hint */}
                    <Text style={styles.hint}>
                        Drag the handles to select up to 30 seconds
                    </Text>
                </View>
            </GestureHandlerRootView>
        </Modal>
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
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    headerBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    confirmBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#0469ff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    confirmText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    videoContainer: {
        flex: 1,
        backgroundColor: '#000',
        margin: 16,
        borderRadius: 16,
        overflow: 'hidden',
    },
    video: {
        flex: 1,
    },
    playOverlay: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    playButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    playIcon: {
        fontSize: 22,
        marginLeft: 4,
        color: '#333',
    },
    durationInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: TIMELINE_PADDING,
        marginBottom: 8,
    },
    durationText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    durationBadge: {
        backgroundColor: '#e8f4fd',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    durationBadgeWarn: {
        backgroundColor: '#fef2f2',
    },
    durationBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#0469ff',
    },
    durationBadgeTextWarn: {
        color: '#ef4444',
    },
    timelineContainer: {
        paddingHorizontal: TIMELINE_PADDING,
        marginBottom: 16,
    },
    timelineLoading: {
        height: THUMBNAIL_HEIGHT + 20,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    loadingText: {
        fontSize: 12,
        color: '#888',
    },
    timeline: {
        height: THUMBNAIL_HEIGHT,
        borderRadius: 8,
        overflow: 'hidden',
        position: 'relative',
    },
    thumbnailStrip: {
        flexDirection: 'row',
        height: THUMBNAIL_HEIGHT,
    },
    thumbnailSlot: {
        height: THUMBNAIL_HEIGHT,
        overflow: 'hidden',
    },
    thumbnail: {
        width: '100%',
        height: '100%',
    },
    thumbnailPlaceholder: {
        backgroundColor: '#e0e0e0',
    },
    dimOverlay: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.55)',
    },
    leftDim: {
        left: 0,
    },
    rightDim: {},
    selectionBorder: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        borderTopWidth: 3,
        borderBottomWidth: 3,
        borderColor: '#0469ff',
    },
    handle: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: HANDLE_WIDTH,
        backgroundColor: '#0469ff',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
    },
    leftHandle: {
        borderTopLeftRadius: 6,
        borderBottomLeftRadius: 6,
    },
    rightHandle: {
        borderTopRightRadius: 6,
        borderBottomRightRadius: 6,
    },
    handleBar: {
        width: 3,
        height: 16,
        borderRadius: 1.5,
        backgroundColor: '#fff',
    },
    hint: {
        textAlign: 'center',
        fontSize: 13,
        color: '#888',
        paddingBottom: 24,
    },
});

export default memo(VideoTrimmer);
