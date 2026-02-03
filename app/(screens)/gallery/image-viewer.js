// app/(screens)/gallery/image-viewer.js
// iOS-style full-screen image viewer with horizontal slider

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    FlatList,
    Image,
    ActivityIndicator,
    Share,
    Alert,
    Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    FadeIn,
    FadeInDown,
    FadeInUp,
    SlideInDown,
    SlideInUp,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    interpolate,
} from 'react-native-reanimated';
import {
    ArrowLeft,
    Download,
    Share2,
    Heart,
    Info,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ImageViewerScreen() {
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const flatListRef = useRef(null);

    // Parse params
    const images = params.images ? JSON.parse(params.images) : [];
    const initialIndex = params.initialIndex ? parseInt(params.initialIndex) : 0;

    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [downloading, setDownloading] = useState(false);
    const [showControls, setShowControls] = useState(true);

    const controlsOpacity = useSharedValue(1);
    const translateY = useSharedValue(0);
    const imageOpacity = useSharedValue(1);

    const currentImage = images[currentIndex] || {};
    const thumbnailListRef = useRef(null);

    // Sync thumbnail strip when main slide changes
    useEffect(() => {
        if (thumbnailListRef.current) {
            // Scroll thumbnail strip to keep active item in view
            // We use a small timeout to ensure layout is ready
            setTimeout(() => {
                thumbnailListRef.current?.scrollToIndex({
                    index: currentIndex,
                    animated: true,
                    viewPosition: 0.5
                });
            }, 50);
        }
    }, [currentIndex]);

    // Go back helper for runOnJS
    const goBack = () => {
        router.back();
    };

    // Pan Gesture for swipe-to-dismiss
    const panGesture = Gesture.Pan()
        .onUpdate((e) => {
            translateY.value = e.translationY;
            // Reduce opacity as we drag away
            imageOpacity.value = interpolate(
                Math.abs(e.translationY),
                [0, 200],
                [1, 0.5],
                'clamp'
            );
        })
        .onEnd((e) => {
            if (Math.abs(e.translationY) > 100) {
                // Swipe threshold met - close
                runOnJS(goBack)();
            } else {
                // Spring back
                translateY.value = withTiming(0);
                imageOpacity.value = withTiming(1);
            }
        });

    const animatedImageStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
        opacity: imageOpacity.value,
    }));

    // Toggle controls visibility
    const toggleControls = useCallback(() => {
        const newValue = !showControls;
        setShowControls(newValue);
        controlsOpacity.value = withTiming(newValue ? 1 : 0, { duration: 200 });
    }, [showControls]);

    // Handle scroll end
    const onViewableItemsChanged = useRef(({ viewableItems }) => {
        if (viewableItems.length > 0) {
            const newIndex = viewableItems[0].index;
            if (newIndex !== undefined) {
                setCurrentIndex(newIndex);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
        }
    }).current;

    const viewabilityConfig = useRef({
        itemVisiblePercentThreshold: 50,
    }).current;

    // Scroll to initial index on mount
    useEffect(() => {
        if (flatListRef.current && initialIndex > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index: initialIndex, animated: false });
            }, 100);
        }
    }, []);

    // Download image
    const handleDownload = async () => {
        try {
            setDownloading(true);
            const imageUrl = currentImage.optimizedUrl || currentImage.originalUrl;
            const fileName = currentImage.fileName || `gallery_${currentImage.id}.jpg`;

            if (Platform.OS === 'android') {
                const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (!permissions.granted) {
                    Alert.alert('Permission Denied', 'Cannot save without storage permission');
                    setDownloading(false);
                    return;
                }

                const tempUri = FileSystem.cacheDirectory + fileName;
                await FileSystem.downloadAsync(imageUrl, tempUri);
                const fileContent = await FileSystem.readAsStringAsync(tempUri, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
                    permissions.directoryUri,
                    fileName,
                    'image/jpeg'
                );

                await FileSystem.writeAsStringAsync(newUri, fileContent, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Saved! 📸', `${fileName} saved to your folder`);
            } else {
                const { status } = await MediaLibrary.requestPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission Required', 'Please grant photo library access');
                    setDownloading(false);
                    return;
                }

                const fileUri = FileSystem.documentDirectory + fileName;
                await FileSystem.downloadAsync(imageUrl, fileUri);
                const asset = await MediaLibrary.createAssetAsync(fileUri);
                await MediaLibrary.createAlbumAsync('School Gallery', asset, false);

                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Saved! 📸', 'Image saved to School Gallery album');
            }
        } catch (error) {
            console.error('Download error:', error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Download Failed', 'Could not save the image');
        } finally {
            setDownloading(false);
        }
    };

    // Share image
    const handleShare = async () => {
        try {
            setDownloading(true);
            const imageUrl = currentImage.optimizedUrl || currentImage.originalUrl;
            const isAvailable = await Sharing.isAvailableAsync();

            if (!isAvailable) {
                await Share.share({ url: imageUrl });
                setDownloading(false);
                return;
            }

            // Ensure filename has extension
            let fileName = currentImage.fileName || `gallery_${currentImage.id}.jpg`;
            if (!fileName.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)$/)) {
                fileName += '.jpg';
            }

            const fileUri = FileSystem.cacheDirectory + fileName;
            await FileSystem.downloadAsync(imageUrl, fileUri);

            await Sharing.shareAsync(fileUri, {
                mimeType: 'image/jpeg',
                UTI: 'public.jpeg',
                dialogTitle: 'Share Image'
            });

            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (error) {
            console.error('Share error:', error);
            Alert.alert('Error', 'Failed to share image');
        } finally {
            setDownloading(false);
        }
    };

    // Navigate to specific index
    const goToIndex = (index) => {
        if (index >= 0 && index < images.length) {
            flatListRef.current?.scrollToIndex({ index, animated: true }); // Main slider
            setCurrentIndex(index);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    // Render single image with Gesture Detector
    const renderImage = ({ item, index }) => (
        <GestureDetector gesture={panGesture}>
            <View style={styles.imageContainer}>
                <HapticTouchable
                    onPress={toggleControls}
                    activeOpacity={1}
                    style={styles.imageInnerContainer}
                >
                    <Animated.Image
                        source={{ uri: item.optimizedUrl || item.originalUrl }}
                        style={[styles.fullImage, animatedImageStyle]}
                        resizeMode="contain"
                    />
                </HapticTouchable>
            </View>
        </GestureDetector>
    );

    // Top controls
    const topControlsStyle = useAnimatedStyle(() => ({
        opacity: controlsOpacity.value,
        transform: [{ translateY: interpolate(controlsOpacity.value, [0, 1], [-20, 0]) }],
    }));

    // Bottom controls
    const bottomControlsStyle = useAnimatedStyle(() => ({
        opacity: controlsOpacity.value,
        transform: [{ translateY: interpolate(controlsOpacity.value, [0, 1], [20, 0]) }],
    }));

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Image Slider */}
            <FlatList
                ref={flatListRef}
                data={images}
                renderItem={renderImage}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                getItemLayout={(data, index) => ({
                    length: SCREEN_WIDTH,
                    offset: SCREEN_WIDTH * index,
                    index,
                })}
                initialScrollIndex={initialIndex}
                decelerationRate="fast"
                bounces={false}
            />

            {/* Top Bar */}
            <Animated.View
                style={[
                    styles.topBar,
                    { paddingTop: insets.top + 10 },
                    topControlsStyle,
                ]}
                entering={SlideInUp.duration(300)}
            >
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.iconButton}>
                        <ArrowLeft size={24} color="#fff" />
                    </View>
                </HapticTouchable>

                <View style={styles.counterContainer}>
                    <Text style={styles.counterText}>
                        {currentIndex + 1} / {images.length}
                    </Text>
                </View>

                <View style={{ width: 44 }} />
            </Animated.View>

            {/* Pagination Dots */}
            {images.length <= 10 && (
                <Animated.View
                    style={[styles.dotsContainer, topControlsStyle]}
                    entering={FadeIn.delay(200)}
                >
                    {images.map((_, index) => (
                        <View
                            key={index}
                            style={[
                                styles.dot,
                                index === currentIndex && styles.dotActive,
                            ]}
                        />
                    ))}
                </Animated.View>
            )}

            {/* Navigation Arrows (for desktop/tablet feel) */}
            {showControls && images.length > 1 && (
                <>
                    {currentIndex > 0 && (
                        <Animated.View
                            style={styles.navArrowLeft}
                            entering={FadeIn.delay(100)}
                        >
                            <HapticTouchable onPress={() => goToIndex(currentIndex - 1)}>
                                <View style={styles.navArrowButton}>
                                    <ChevronLeft size={28} color="#fff" />
                                </View>
                            </HapticTouchable>
                        </Animated.View>
                    )}
                    {currentIndex < images.length - 1 && (
                        <Animated.View
                            style={styles.navArrowRight}
                            entering={FadeIn.delay(100)}
                        >
                            <HapticTouchable onPress={() => goToIndex(currentIndex + 1)}>
                                <View style={styles.navArrowButton}>
                                    <ChevronRight size={28} color="#fff" />
                                </View>
                            </HapticTouchable>
                        </Animated.View>
                    )}
                </>
            )}

            {/* Bottom Bar */}
            <Animated.View
                style={[
                    styles.bottomBar,
                    { paddingBottom: insets.bottom + 16 },
                    bottomControlsStyle,
                ]}
                entering={SlideInDown.duration(300)}
            >
                {/* Image Info */}
                <View style={styles.imageInfo}>
                    {currentImage.caption && (
                        <Text style={styles.imageCaption} numberOfLines={2}>
                            {currentImage.caption}
                        </Text>
                    )}
                    {currentImage.album && (
                        <Text style={styles.imageAlbum}>
                            📁 {currentImage.album.title}
                        </Text>
                    )}
                </View>

                {/* Thumbnail Strip */}
                {images.length > 1 && (
                    <View style={styles.thumbnailStrip}>
                        <FlatList
                            ref={thumbnailListRef}
                            data={images}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            keyExtractor={item => `thumb-${item.id}`}
                            contentContainerStyle={styles.thumbnailContent}
                            renderItem={({ item, index }) => (
                                <HapticTouchable
                                    onPress={() => goToIndex(index)}
                                    style={[
                                        styles.thumbnailItem,
                                        index === currentIndex && styles.thumbnailItemActive
                                    ]}
                                >
                                    <Image
                                        source={{ uri: item.thumbnailUrl || item.optimizedUrl || item.originalUrl }}
                                        style={styles.thumbnailImage}
                                        resizeMode="cover"
                                    />
                                </HapticTouchable>
                            )}
                        />
                    </View>
                )}

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                    <HapticTouchable onPress={handleDownload} disabled={downloading}>
                        <View style={styles.actionButton}>
                            {downloading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Download size={22} color="#fff" />
                            )}
                            <Text style={styles.actionButtonText}>Save</Text>
                        </View>
                    </HapticTouchable>

                    <HapticTouchable onPress={handleShare} disabled={downloading}>
                        <View style={styles.actionButton}>
                            <Share2 size={22} color="#fff" />
                            <Text style={styles.actionButtonText}>Share</Text>
                        </View>
                    </HapticTouchable>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    imageContainer: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageInnerContainer: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fullImage: {
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT * 0.7,
    },
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    counterContainer: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    counterText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    dotsContainer: {
        position: 'absolute',
        top: 110,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    dotActive: {
        backgroundColor: '#fff',
        width: 18,
    },
    navArrowLeft: {
        position: 'absolute',
        left: 12,
        top: '50%',
        marginTop: -24,
    },
    navArrowRight: {
        position: 'absolute',
        right: 12,
        top: '50%',
        marginTop: -24,
    },
    navArrowButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    imageInfo: {
        marginBottom: 12,
    },
    imageCaption: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 4,
    },
    imageAlbum: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.7)',
    },
    thumbnailStrip: {
        marginBottom: 16,
        height: 60,
    },
    thumbnailContent: {
        gap: 10,
        paddingHorizontal: 4,
        alignItems: 'center',
    },
    thumbnailItem: {
        width: 50,
        height: 50,
        borderRadius: 8,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        opacity: 0.7,
    },
    thumbnailItemActive: {
        borderColor: '#EC4899',
        opacity: 1,
        transform: [{ scale: 1.15 }],
    },
    thumbnailImage: {
        width: '100%',
        height: '100%',
    },
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 50,
        paddingVertical: 8,
    },
    actionButton: {
        alignItems: 'center',
        gap: 6,
    },
    actionButtonText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '500',
    },
});
