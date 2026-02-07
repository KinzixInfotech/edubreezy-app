import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Video, ResizeMode } from 'expo-av';

// Time to hold on last frame after video ends (in milliseconds)
const HOLD_DURATION_MS = 1000;

/**
 * VideoSplash - Fullscreen video splash screen component
 * Plays the splash.mp4 video once, pauses on last frame to show logo,
 * then calls onComplete after a brief hold
 */
export default function VideoSplash({ onComplete }) {
    const videoRef = useRef(null);
    const hasCompletedRef = useRef(false);
    const [videoEnded, setVideoEnded] = useState(false);
    const [isReady, setIsReady] = useState(false);

    // Reset video to start and play when component mounts
    useEffect(() => {
        const initVideo = async () => {
            if (videoRef.current) {
                try {
                    // Always start from beginning
                    await videoRef.current.setPositionAsync(0);
                    await videoRef.current.playAsync();
                } catch (error) {
                    console.log('Video init error:', error);
                }
            }
        };

        // Small delay to ensure ref is ready
        const timer = setTimeout(initVideo, 100);
        return () => clearTimeout(timer);
    }, []);

    // Handle video playback status
    const handlePlaybackStatusUpdate = useCallback((status) => {
        // When video finishes, mark as ended (video stays on last frame)
        if (status.didJustFinish && !videoEnded) {
            setVideoEnded(true);
        }
    }, [videoEnded]);

    // Video is ready to display
    const handleReadyForDisplay = useCallback(() => {
        setIsReady(true);
    }, []);

    // After video ends, hold for a moment then complete
    useEffect(() => {
        if (videoEnded && !hasCompletedRef.current) {
            const timer = setTimeout(() => {
                hasCompletedRef.current = true;
                onComplete?.();
            }, HOLD_DURATION_MS);

            return () => clearTimeout(timer);
        }
    }, [videoEnded, onComplete]);

    const handleError = useCallback((error) => {
        console.error('Video splash error:', error);
        // On error, complete anyway so app isn't stuck
        if (!hasCompletedRef.current) {
            hasCompletedRef.current = true;
            onComplete?.();
        }
    }, [onComplete]);

    return (
        <View style={styles.container}>
            <View style={styles.videoWrapper}>
                <Video
                    ref={videoRef}
                    source={require('../../assets/splash.mp4')}
                    style={[styles.video, !isReady && styles.hidden]}
                    resizeMode={ResizeMode.CONTAIN}
                    shouldPlay={false}
                    isLooping={false}
                    onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
                    onReadyForDisplay={handleReadyForDisplay}
                    onError={handleError}
                    isMuted={true}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
    },
    videoWrapper: {
        width: '98%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    video: {
        width: '100%',
        height: '100%',
    },
    hidden: {
        opacity: 0,
    },
});
