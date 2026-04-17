import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Dimensions,
    Image,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { Image as ExpoImage } from 'expo-image';
import Animated, {
    cancelAnimation,
    Easing,
    FadeIn,
    FadeInDown,
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useFrameCallback,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ONBOARDING_STORAGE_KEY = 'hasSeenOnboarding';
const NUM_COLS = 4;
const COLUMN_GAP = 8;
const CARD_GAP = 8;
const MARQUEE_DURATION_A = 200000;
const MARQUEE_DURATION_B = 160000;
const CARD_RADIUS = 24;

const PLACEHOLDER_PALETTES = [
    { bg: '#DBEAFE', fg: '#1D4ED8' },
    { bg: '#FCE7F3', fg: '#DB2777' },
    { bg: '#D1FAE5', fg: '#059669' },
    { bg: '#FEF3C7', fg: '#D97706' },
    { bg: '#EDE9FE', fg: '#7C3AED' },
    { bg: '#FEE2E2', fg: '#DC2626' },
];
function shuffle(array) {
    const copy = [...array];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
const IMAGE_SOURCES = [
    require('../../assets/images_screenshot/1.png'),
    require('../../assets/images_screenshot/2.png'),
    require('../../assets/images_screenshot/3.png'),
    require('../../assets/images_screenshot/4.png'),
    require('../../assets/images_screenshot/5.png'),
    require('../../assets/images_screenshot/6.png'),
    require('../../assets/images_screenshot/7.png'),
    require('../../assets/images_screenshot/8.png'),
    require('../../assets/images_screenshot/9.png'),
    require('../../assets/images_screenshot/10.png'),
    require('../../assets/images_screenshot/11.png'),
    require('../../assets/images_screenshot/12.png'),
    require('../../assets/images_screenshot/13.png'),
    require('../../assets/images_screenshot/14.png'),
    require('../../assets/images_screenshot/15.png'),
];
const ALL_IMAGES = IMAGE_SOURCES.map((source, index) => ({
    ...Image.resolveAssetSource(source),
    id: `img-${index + 1}`,
    source,
    label: `Screen ${index + 1}`,
}));

const BASE_COLUMNS = Array.from({ length: NUM_COLS }, (_, col) =>
    ALL_IMAGES.filter((_, idx) => idx % NUM_COLS === col)
);

function PlaceholderCard({ item, index }) {
    const palette = PLACEHOLDER_PALETTES[index % PLACEHOLDER_PALETTES.length];

    return (
        <LinearGradient
            colors={[palette.bg, '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.placeholderFill}
        >
            <View style={[styles.placeholderBadge, { backgroundColor: `${palette.fg}18` }]}>
                <Text style={[styles.placeholderBadgeText, { color: palette.fg }]}>EDUBREEZY</Text>
            </View>
            <Text style={[styles.placeholderText, { color: palette.fg }]}>{item.label}</Text>
        </LinearGradient>
    );
}

function MarqueeCard({ item, index, cardWidth, onInteract }) {
    const aspectRatio = item.width && item.height ? item.width / item.height : 0.48;
    const cardHeight = cardWidth / aspectRatio;
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const tapGesture = useMemo(
        () =>
            Gesture.Tap()
                .maxDuration(250)
                .onBegin(() => {
                    cancelAnimation(scale);
                    scale.value = withTiming(1.06, {
                        duration: 120,
                        easing: Easing.out(Easing.quad),
                    });
                    if (onInteract) {
                        runOnJS(onInteract)();
                    }
                })
                .onFinalize(() => {
                    scale.value = withTiming(1, {
                        duration: 180,
                        easing: Easing.out(Easing.quad),
                    });
                }),
        [onInteract, scale]
    );

    return (
        <GestureDetector gesture={tapGesture}>
            <Animated.View style={[styles.card, animatedStyle, { height: cardHeight, width: cardWidth }]}>
                {item.source ? (
                    <ExpoImage
                        source={item.source}
                        style={styles.cardImage}
                        contentFit="fill"
                        cachePolicy="memory-disk"
                        transition={0}
                    />
                ) : (
                    <PlaceholderCard item={item} index={index} />
                )}
            </Animated.View>
        </GestureDetector>
    );
}

function LoadingMarqueePreview() {
    const shimmer = useSharedValue(0);

    useEffect(() => {
        shimmer.value = withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }), -1, true);
    }, [shimmer]);

    const pulseStyle = useAnimatedStyle(() => ({
        opacity: interpolate(shimmer.value, [0, 1], [0.5, 1], Extrapolation.CLAMP),
        transform: [{ scale: interpolate(shimmer.value, [0, 1], [0.98, 1], Extrapolation.CLAMP) }],
    }));

    return (
        <View style={styles.loadingStage}>
            <Animated.View style={[styles.loadingCluster, pulseStyle]}>
                <View style={[styles.loadingCard, styles.loadingCardLeft]} />
                <View style={[styles.loadingCard, styles.loadingCardCenter]} />
                <View style={[styles.loadingCard, styles.loadingCardRight]} />
            </Animated.View>
            <Animated.View style={[styles.loadingLabel, pulseStyle]}>
                <Text style={styles.loadingEyebrow}>EDUBREEZY</Text>
                <Text style={styles.loadingTitle}>Preparing your preview</Text>
            </Animated.View>
        </View>
    );
}

function MarqueeColumn({ items, direction, duration, colIndex, cardWidth, isPaused, onInteract }) {
    const loopHeight = useMemo(
        () =>
            items.reduce((sum, item) => {
                const aspectRatio = item.width && item.height ? item.width / item.height : 0.48;
                return sum + cardWidth / aspectRatio;
            }, 0) + CARD_GAP * Math.max(items.length - 1, 0),
        [cardWidth, items]
    );
    const baseOffset = useSharedValue(direction === 'up' ? 0 : -loopHeight);

    useFrameCallback((frameInfo) => {
        if (isPaused.value) {
            return;
        }

        const delta = frameInfo.timeSincePreviousFrame ?? 16;
        const pixelsPerMs = loopHeight / duration;
        const step = pixelsPerMs * delta * (direction === 'up' ? -1 : 1);
        let next = baseOffset.value + step;

        if (direction === 'up') {
            if (next <= -loopHeight) {
                next += loopHeight;
            }
        } else if (next >= 0) {
            next -= loopHeight;
        }

        baseOffset.value = next;
    }, true);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: baseOffset.value }],
    }));

    const doubled = [...items, ...items];

    return (
        <View style={styles.columnMask}>
            <Animated.View style={[styles.columnTrack, animatedStyle]}>
                {doubled.map((item, idx) => (
                    <MarqueeCard
                        key={`${item.id}-${colIndex}-${idx}`}
                        item={item}
                        index={idx}
                        cardWidth={cardWidth}
                        onInteract={onInteract}
                    />
                ))}
            </Animated.View>
        </View>
    );
}

export default function OnboardingScreen() {
    const shuffledColumns = useMemo(() => BASE_COLUMNS.map((column) => shuffle(column)), []);
    const railWidth = SCREEN_WIDTH * 1.36;
    const cardWidth = (railWidth - COLUMN_GAP * (NUM_COLS - 1)) / NUM_COLS;
    const [assetsReady, setAssetsReady] = useState(false);
    const isPaused = useSharedValue(false);
    const resumeTimeoutRef = useRef(null);

    useEffect(() => {
        let isMounted = true;

        const preloadImages = async () => {
            try {
                await Asset.loadAsync(IMAGE_SOURCES);
            } catch (error) {
                console.warn('Failed to preload onboarding images:', error);
            } finally {
                if (isMounted) {
                    setAssetsReady(true);
                }
            }
        };

        preloadImages();

        return () => {
            isMounted = false;
        };
    }, []);

    const handleMarqueeInteract = () => {
        isPaused.value = true;

        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
        }

        resumeTimeoutRef.current = setTimeout(() => {
            isPaused.value = false;
            resumeTimeoutRef.current = null;
        }, 1200);
    };

    useEffect(() => () => {
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
        }
    }, []);

    const handleContinue = async () => {
        try {
            await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
        } catch (error) {
            console.warn('Failed to persist onboarding state:', error);
        } finally {
            router.replace('/(auth)/schoolcode');
        }
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" hidden={true} />

            <LinearGradient
                colors={['#F8FAFC', '#EEF2FF', '#F8FAFC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
            />

            {assetsReady ? (
                <View style={styles.marqueeStage}>
                    <Animated.View entering={FadeIn.duration(700)} style={[styles.rotatedRail, { width: railWidth }]}>
                        {shuffledColumns.map((column, index) => (
                            <MarqueeColumn
                                key={`column-${index}`}
                                items={column}
                                direction={index % 2 === 0 ? 'up' : 'down'}
                                duration={index % 2 === 0 ? MARQUEE_DURATION_A : MARQUEE_DURATION_B}
                                colIndex={index}
                                cardWidth={cardWidth}
                                isPaused={isPaused}
                                onInteract={handleMarqueeInteract}
                            />
                        ))}
                    </Animated.View>
                </View>
            ) : (
                <LoadingMarqueePreview />
            )}

            <LinearGradient
                colors={[
                    'rgba(248,250,252,0)',
                    'rgba(248,250,252,0.72)',
                    'rgba(248,250,252,0.94)',
                    '#F8FAFC',
                    '#F8FAFC',
                ]}
                locations={[0, 0.28, 0.52, 0.74, 1]}
                style={styles.bottomFade}
                pointerEvents="none"
            />

            <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
                <Pressable onPress={handleContinue} style={styles.skipButton}>
                    <Text style={styles.skipText}>Skip</Text>
                </Pressable>

                <Animated.View entering={FadeInDown.delay(120).duration(700)} style={styles.overlayWrap}>
                    {/* <View style={styles.kickerRow}>
                        <View style={styles.kickerDot} />
                        <Text style={styles.kickerText}>School life, all in one place</Text>
                    </View> */}

                    <Text style={styles.title}>Everything your school needs, right in your pocket.</Text>
                    <Text style={styles.description}>
                        Track attendance, homework, fees, notices, transport and classroom updates with one
                        simple experience for students, parents and staff.
                    </Text>

                    <Pressable onPress={handleContinue} style={styles.primaryButton}>
                        <LinearGradient
                            colors={['#0B5CDE', '#2563EB']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.primaryButtonFill}
                        >
                            <Text style={styles.primaryButtonText}>Continue</Text>
                        </LinearGradient>
                    </Pressable>

                    <Text style={styles.footerNote}>Your saved school and login flow will open next.</Text>
                </Animated.View>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    safeArea: {
        flex: 1,
        justifyContent: 'space-between',
    },
    marqueeStage: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
    },
    loadingStage: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
    },
    loadingCluster: {
        width: 220,
        height: 240,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingCard: {
        position: 'absolute',
        width: 92,
        height: 182,
        borderRadius: CARD_RADIUS,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderWidth: 2,
        borderColor: '#101828',
        shadowColor: '#0F172A',
        shadowOpacity: 0.1,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
    },
    loadingCardLeft: {
        left: 12,
        transform: [{ rotate: '-15deg' }],
    },
    loadingCardCenter: {
        width: 104,
        height: 196,
        backgroundColor: '#E9EFFD',
        zIndex: 2,
    },
    loadingCardRight: {
        right: 12,
        transform: [{ rotate: '15deg' }],
    },
    loadingLabel: {
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    loadingEyebrow: {
        fontSize: 12,
        fontWeight: '800',
        color: '#2563EB',
        letterSpacing: 1.2,
        marginBottom: 8,
    },
    loadingTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#0F172A',
    },
    rotatedRail: {
        position: 'absolute',
        top: -SCREEN_HEIGHT * 0.14,
        left: (SCREEN_WIDTH - SCREEN_WIDTH * 1.36) / 2,
        height: SCREEN_HEIGHT * 1.18,
        transform: [{ rotate: '-6deg' }],
        flexDirection: 'row',
        gap: COLUMN_GAP,
        alignItems: 'flex-start',
        justifyContent: 'center',
    },
    columnMask: {
        flex: 1,
        minWidth: 0,
        height: '100%',
        overflow: 'hidden',
    },
    columnTrack: {
        gap: CARD_GAP,
        alignItems: 'center',
    },
    card: {
        borderRadius: CARD_RADIUS,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#101828',
        shadowColor: '#0F172A',
        shadowOpacity: 0.14,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
        elevation: 6,
    },
    cardImage: {
        width: '100%',
        height: '100%',
    },
    placeholderFill: {
        flex: 1,
        paddingHorizontal: 12,
        paddingVertical: 14,
        justifyContent: 'space-between',
    },
    placeholderBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 999,
    },
    placeholderBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.8,
    },
    placeholderText: {
        fontSize: 16,
        fontWeight: '800',
        lineHeight: 20,
    },
    bottomFade: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: SCREEN_HEIGHT * 0.72,
    },
    skipButton: {
        alignSelf: 'flex-end',
        marginTop: 6,
        marginRight: 20,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.75)',
        borderWidth: 1,
        borderColor: 'rgba(148,163,184,0.25)',
    },
    skipText: {
        color: '#334155',
        fontSize: 14,
        fontWeight: '700',
    },
    overlayWrap: {
        paddingHorizontal: 22,
        paddingBottom: 18,
        paddingTop: 32,
    },
    kickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    kickerDot: {
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: '#0B5CDE',
    },
    kickerText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
    },
    title: {
        fontSize: SCREEN_WIDTH < 380 ? 31 : 36,
        lineHeight: SCREEN_WIDTH < 380 ? 38 : 43,
        fontWeight: '900',
        color: '#0F172A',
        letterSpacing: -0.8,
        maxWidth: 360,
    },
    description: {
        marginTop: 14,
        fontSize: 15,
        lineHeight: 24,
        color: '#475569',
        maxWidth: 360,
    },
    primaryButton: {
        marginTop: 24,
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: '#0B5CDE',
        shadowOpacity: 0.28,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 7,
    },
    primaryButtonFill: {
        paddingVertical: 17,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    footerNote: {
        marginTop: 14,
        fontSize: 13,
        lineHeight: 19,
        color: '#64748B',
        textAlign: 'center',
    },
});
