import React, { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Dimensions, FlatList, TouchableOpacity, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';

const { width } = Dimensions.get('window');

const BannerCarousel = ({ schoolId, role }) => {
    const [images, setImages] = useState([]);
    const [activeIndex, setActiveIndex] = useState(0);
    const flatListRef = useRef(null);
    const [isAutoPlay, setIsAutoPlay] = useState(true);

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
        try {
            // Map app role to API role format if needed
            const apiRole = role === 'TEACHING_STAFF' ? 'TEACHERS' :
                role === 'NON_TEACHING_STAFF' ? 'STAFF' :
                    role; // STUDENTS, PARENTS, etc.

            const response = await api.get(`/schools/carousel?schoolId=${schoolId}&role=${apiRole}`);

            if (Array.isArray(response.data)) {
                setImages(response.data);
            }
        } catch (error) {
            console.error('Failed to fetch carousel images:', error);
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

    if (!images.length) return null;

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
                        <Image source={{ uri: item.imageUrl }} style={styles.image} resizeMode="cover" />
                        {item.caption && (
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
