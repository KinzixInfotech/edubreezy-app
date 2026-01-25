import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, FlatList, TouchableOpacity, Text, Animated } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';

const { width } = Dimensions.get('window');

// Skeleton component with shimmer animation
const SkeletonLoader = () => {
    const animatedValue = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(animatedValue, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(animatedValue, {
                    toValue: 0,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, [animatedValue]);

    const opacity = animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0.4, 0.8],
    });

    return (
        <View style={styles.skeleton}>
            {/* Shimmer overlay for the image area */}
            <Animated.View style={[styles.skeletonImageArea, { opacity }]} />

            {/* Caption skeleton at bottom - matches captionContainer position */}
            <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.5)']}
                style={styles.skeletonCaptionContainer}
            >
                <Animated.View style={[styles.skeletonCaptionLine, { opacity }]} />
            </LinearGradient>
        </View>
    );
};

const BannerCarousel = ({ schoolId, role }) => {
    const [images, setImages] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const flatListRef = useRef(null);
    const [isAutoPlay, setIsAutoPlay] = useState(true);
    const [loadedImages, setLoadedImages] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [hasData, setHasData] = useState(true); // Assume we have data initially

    useEffect(() => {
        if (schoolId) {
            fetchImages();
        }
    }, [schoolId]);

    // Auto-slide effect
    useEffect(() => {
        let interval;
        if (isAutoPlay && images.length > 1) {
            interval = setInterval(() => {
                let nextIndex = activeIndex + 1;
                if (nextIndex >= images.length) {
                    nextIndex = 0;
                }
                flatListRef.current?.scrollToIndex({
                    index: nextIndex,
                    animated: true,
                });
                setActiveIndex(nextIndex);
            }, 5000); // 5 seconds
        }
        return () => clearInterval(interval);
    }, [isAutoPlay, images, activeIndex]);

    const fetchImages = async () => {
        setIsLoading(true);

        // Map app role to API role format
        const apiRole = role === 'TEACHING_STAFF' ? 'TEACHERS' :
            role === 'NON_TEACHING_STAFF' ? 'STAFF' :
                role; // STUDENTS, PARENTS, etc.

        console.log('🎠 Carousel: Fetching for', { schoolId, role, apiRole });

        try {
            // Always fetch fresh from API
            const response = await api.get(`/schools/carousel?schoolId=${schoolId}&role=${apiRole}`);
            console.log('🎠 Carousel: API response', response.data);

            if (Array.isArray(response.data)) {
                if (response.data.length > 0) {
                    setImages(response.data);
                    setHasData(true);
                    console.log('🎠 Carousel: Found', response.data.length, 'images');
                } else {
                    setHasData(false);
                    console.log('🎠 Carousel: No images found');
                }
            }
        } catch (error) {
            console.error('🎠 Carousel: Failed to fetch', error);
            setHasData(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleScroll = (event) => {
        const scrollPosition = event.nativeEvent.contentOffset.x;
        const index = Math.round(scrollPosition / width);
        setActiveIndex(index);
    };

    // Pause on touch
    const onTouchStart = () => setIsAutoPlay(false);
    const onTouchEnd = () => setIsAutoPlay(true);

    // Handle image load completion
    const handleImageLoad = (imageId) => {
        setLoadedImages(prev => ({ ...prev, [imageId]: true }));
    };

    // Don't render if no data after loading completes
    if (!isLoading && !hasData) return null;

    // Show skeleton while API is loading
    if (isLoading) {
        return (
            <View style={styles.container}>
                <View style={styles.slide}>
                    <SkeletonLoader />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                ref={flatListRef}
                data={images}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(item) => item.id}
                onScroll={handleScroll}
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
                renderItem={({ item }) => (
                    <View style={styles.slide}>
                        {/* Show skeleton while image is loading */}
                        {!loadedImages[item.id] && <SkeletonLoader />}
                        <Image
                            source={item.imageUrl}
                            style={[styles.image, !loadedImages[item.id] && styles.hiddenImage]}
                            contentFit="cover"
                            transition={300}
                            cachePolicy="memory-disk"
                            onLoad={() => handleImageLoad(item.id)}
                        />
                        {item.caption && loadedImages[item.id] && (
                            <LinearGradient
                                colors={['transparent', 'rgba(0,0,0,0.7)']}
                                style={styles.captionContainer}
                            >
                                <Text style={styles.captionText}>{item.caption}</Text>
                            </LinearGradient>
                        )}
                    </View>
                )}
            />

            {/* Dots Indicator */}
            {images.length > 1 && (
                <View style={styles.pagination}>
                    {images.map((_, index) => (
                        <View
                            key={index}
                            style={[
                                styles.dot,
                                activeIndex === index ? styles.activeDot : styles.inactiveDot,
                            ]}
                        />
                    ))}
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginTop: 16,
        marginBottom: 8,
    },
    slide: {
        width: width - 32, // Padding 16 on each side
        height: 180,
        marginHorizontal: 16,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#f1f5f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    hiddenImage: {
        position: 'absolute',
        opacity: 0,
    },
    skeleton: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#e2e8f0',
    },
    skeletonImageArea: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#cbd5e1',
    },
    skeletonCaptionContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 12,
        paddingTop: 30,
    },
    skeletonCaptionLine: {
        width: '60%',
        height: 14,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    captionContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 12,
        paddingTop: 30,
    },
    captionText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '500',
    },
    pagination: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 12,
    },
    dot: {
        height: 6,
        borderRadius: 3,
        marginHorizontal: 4,
    },
    activeDot: {
        width: 20,
        backgroundColor: '#2563eb', // Primary Blue
    },
    inactiveDot: {
        width: 6,
        backgroundColor: '#cbd5e1', // Slate 300
    },
});

export default BannerCarousel;
