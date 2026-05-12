import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Animated, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WifiOff, RefreshCw, Cloud, CloudOff } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const NoInternetScreen = ({ onRetry }) => {
    // Animation values
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const floatAnim = useRef(new Animated.Value(0)).current;
    const rotateAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Pulse animation for the main icon
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );

        // Float animation for decorative clouds
        const float = Animated.loop(
            Animated.sequence([
                Animated.timing(floatAnim, {
                    toValue: 10,
                    duration: 2000,
                    useNativeDriver: true,
                }),
                Animated.timing(floatAnim, {
                    toValue: 0,
                    duration: 2000,
                    useNativeDriver: true,
                }),
            ])
        );

        pulse.start();
        float.start();

        return () => {
            pulse.stop();
            float.stop();
        };
    }, []);

    const handleRetry = () => {
        // Call onRetry immediately — don't wait for animation
        if (onRetry) onRetry();

        // Play spin animation concurrently for visual feedback
        Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
        }).start(() => {
            rotateAnim.setValue(0);
        });
    };

    const spin = rotateAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    return (
        <LinearGradient
            colors={['#F8FBFF', '#EEF5FF', '#FFFFFF']}
            style={styles.container}
        >
            {/* Decorative Background Elements */}
            <View style={styles.backgroundPattern}>
                {/* Animated Cloud 1 */}
                <Animated.View
                    style={[
                        styles.floatingCloud,
                        { top: '15%', left: '10%', transform: [{ translateY: floatAnim }] }
                    ]}
                >
                    <Cloud size={40} color="rgba(4,105,255,0.12)" />
                </Animated.View>

                {/* Animated Cloud 2 */}
                <Animated.View
                    style={[
                        styles.floatingCloud,
                        { top: '25%', right: '15%', transform: [{ translateY: Animated.multiply(floatAnim, -1) }] }
                    ]}
                >
                    <CloudOff size={30} color="rgba(239,68,68,0.12)" />
                </Animated.View>

                {/* Animated Cloud 3 */}
                <Animated.View
                    style={[
                        styles.floatingCloud,
                        { bottom: '30%', left: '20%', transform: [{ translateY: floatAnim }] }
                    ]}
                >
                    <Cloud size={50} color="rgba(4,105,255,0.08)" />
                </Animated.View>

                {/* Decorative circles */}
                <View style={[styles.decorCircle, { top: -80, right: -80, width: 200, height: 200 }]} />
                <View style={[styles.decorCircle, { bottom: -100, left: -50, width: 250, height: 250 }]} />
                <View style={[styles.decorCircle, { top: '40%', right: -30, width: 100, height: 100 }]} />
            </View>

            {/* Main Content */}
            <View style={styles.content}>
                {/* Animated Icon Container */}
                <Animated.View
                    style={[
                        styles.iconContainer,
                        { transform: [{ scale: pulseAnim }] }
                    ]}
                >
                    <LinearGradient
                        colors={['#ff6b6b', '#ee5a5a', '#dc4444']}
                        style={styles.iconGradient}
                    >
                        <WifiOff size={64} color="#fff" strokeWidth={1.5} />
                    </LinearGradient>

                    {/* Glowing ring effect */}
                    <View style={styles.glowRing} />
                    <View style={styles.glowRingOuter} />
                </Animated.View>

                {/* Text Content */}
                <View style={styles.textContainer}>
                    <Text style={styles.title}>No Internet Connection</Text>
                    <Text style={styles.subtitle}>
                        Oops! It seems you're offline.{'\n'}
                        Please check your connection and try again.
                    </Text>
                </View>

                {/* Connection Status Indicators */}
                <View style={styles.statusContainer}>
                    <View style={styles.statusItem}>
                        <View style={[styles.statusDot, styles.statusDotRed]} />
                        <Text style={styles.statusText}>WiFi Disconnected</Text>
                    </View>
                    <View style={styles.statusItem}>
                        <View style={[styles.statusDot, styles.statusDotRed]} />
                        <Text style={styles.statusText}>Mobile Data Off</Text>
                    </View>
                </View>

                {/* Retry Button */}
                <TouchableOpacity
                    onPress={handleRetry}
                    activeOpacity={0.8}
                    style={styles.retryButtonWrapper}
                >
                    <LinearGradient
                        colors={['#0469ff', '#0256d0']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.retryButton}
                    >
                        <Animated.View style={{ transform: [{ rotate: spin }] }}>
                            <RefreshCw size={22} color="#fff" />
                        </Animated.View>
                        <Text style={styles.retryButtonText}>Try Again</Text>
                    </LinearGradient>
                </TouchableOpacity>

                <View style={styles.tipsContainer}>
                    <Text style={styles.tipsTitle}>Quick Tips</Text>
                    <Text style={styles.tipItem}>Check if WiFi or Mobile Data is enabled</Text>
                    <Text style={styles.tipItem}>Try moving closer to your router</Text>
                    <Text style={styles.tipItem}>Restart your device if the issue persists</Text>
                </View>
            </View>

            {/* Bottom Wave Decoration */}
            <View style={styles.bottomWave}>
                <LinearGradient
                    colors={['transparent', 'rgba(4, 105, 255, 0.1)']}
                    style={styles.waveGradient}
                />
            </View>
        </LinearGradient>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backgroundPattern: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
    },
    floatingCloud: {
        position: 'absolute',
    },
    decorCircle: {
        position: 'absolute',
        borderRadius: 999,
        backgroundColor: 'rgba(4,105,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(4,105,255,0.08)',
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 32,
        zIndex: 10,
    },
    iconContainer: {
        position: 'relative',
        marginBottom: 32,
    },
    iconGradient: {
        width: 140,
        height: 140,
        borderRadius: 70,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#ff6b6b',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.22,
        shadowRadius: 20,
        elevation: 20,
    },
    glowRing: {
        position: 'absolute',
        top: -10,
        left: -10,
        right: -10,
        bottom: -10,
        borderRadius: 80,
        borderWidth: 2,
        borderColor: 'rgba(255, 107, 107, 0.3)',
    },
    glowRingOuter: {
        position: 'absolute',
        top: -20,
        left: -20,
        right: -20,
        bottom: -20,
        borderRadius: 90,
        borderWidth: 1,
        borderColor: 'rgba(255, 107, 107, 0.15)',
    },
    textContainer: {
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 12,
        textAlign: 'center',
        letterSpacing: 0,
    },
    subtitle: {
        fontSize: 16,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 24,
    },
    statusContainer: {
        flexDirection: 'row',
        gap: 24,
        marginBottom: 32,
    },
    statusItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    statusDotRed: {
        backgroundColor: '#ff6b6b',
    },
    statusDotGreen: {
        backgroundColor: '#4ECDC4',
    },
    statusText: {
        fontSize: 13,
        color: '#334155',
        fontWeight: '500',
    },
    retryButtonWrapper: {
        marginBottom: 40,
    },
    retryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: 40,
        paddingVertical: 16,
        borderRadius: 30,
        shadowColor: '#0469ff',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    retryButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    tipsContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 20,
        width: SCREEN_WIDTH - 64,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.06,
        shadowRadius: 18,
        elevation: 4,
    },
    tipsTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 12,
    },
    tipItem: {
        fontSize: 13,
        color: '#64748B',
        marginBottom: 6,
        lineHeight: 20,
    },
    bottomWave: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 150,
    },
    waveGradient: {
        flex: 1,
    },
});

export default NoInternetScreen;
