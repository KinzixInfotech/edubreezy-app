// app/(screens)/gallery.js
// Pinterest-style school gallery with masonry layout and gradient header

import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Dimensions,
    ActivityIndicator,
    Image,
    Alert,
    Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    FadeInDown,
    FadeInUp,
    FadeIn,
    FadeInRight,
} from 'react-native-reanimated';
import {
    ArrowLeft,
    Image as ImageIcon,
    Folder,
    Camera,
    Sparkles,
    Download,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Haptics from 'expo-haptics';

import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLUMN_GAP = 10;
const NUM_COLUMNS = 2;
const COLUMN_WIDTH = (SCREEN_WIDTH - 32 - COLUMN_GAP) / NUM_COLUMNS;

// Category configuration
const CATEGORIES = [
    { key: 'ALL', label: 'All', icon: Folder },
    { key: 'ANNUAL_DAY', label: 'Annual Day', icon: Camera },
    { key: 'SPORTS_DAY', label: 'Sports', icon: Camera },
    { key: 'CULTURAL', label: 'Cultural', icon: Camera },
    { key: 'GRADUATION', label: 'Graduation', icon: Camera },
    { key: 'FIELD_TRIP', label: 'Field Trip', icon: Camera },
    { key: 'CLASSROOM', label: 'Classroom', icon: Camera },
    { key: 'AWARDS', label: 'Awards', icon: Camera },
    { key: 'GENERAL', label: 'General', icon: Camera },
];

export default function GalleryScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [downloadingId, setDownloadingId] = useState(null);
    const [viewMode, setViewMode] = useState('ALBUMS'); // 'ALBUMS' or 'PHOTOS'
    const [selectedAlbum, setSelectedAlbum] = useState(null);

    // Get user data
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;

    // Fetch gallery data
    const { data: galleryData, isLoading } = useQuery({
        queryKey: ['school-gallery', schoolId],
        queryFn: async () => {
            if (!schoolId) return null;
            const res = await api.get(`/schools/${schoolId}/gallery`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 2,
    });

    // Fetch albums with category filter
    const { data: albumsData, isLoading: albumsLoading } = useQuery({
        queryKey: ['gallery-albums', schoolId, selectedCategory],
        queryFn: async () => {
            if (!schoolId) return { albums: [] };
            let url = `/schools/${schoolId}/gallery/albums?limit=50`;
            if (selectedCategory !== 'ALL') {
                url += `&category=${selectedCategory}`;
            }
            const res = await api.get(url);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 2,
    });

    const albums = albumsData?.albums || [];

    // Fetch images for masonry grid
    const { data: imagesData, isLoading: imagesLoading } = useQuery({
        queryKey: ['gallery-images', schoolId, selectedCategory],
        queryFn: async () => {
            if (!schoolId) return { images: [] };
            let url = `/schools/${schoolId}/gallery/images?status=APPROVED&limit=100`;
            const res = await api.get(url);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 2,
    });

    // Filter images by selected category (via albums) AND selected album
    const allImages = useMemo(() => {
        let images = imagesData?.images || [];

        // 1. Filter by specific Album if selected
        if (selectedAlbum) {
            return images.filter(img => img.albumId === selectedAlbum.id);
        }

        // 2. Filter by Category if no album selected
        if (selectedCategory !== 'ALL') {
            images = images.filter(img => img.album?.category === selectedCategory);
        }

        return images;
    }, [imagesData, selectedCategory, selectedAlbum]);

    // Helper to get actual image count per album (fixes "0 images" bug)
    const getAlbumImageCount = useCallback((albumId) => {
        const images = imagesData?.images || [];
        return images.filter(img => img.albumId === albumId).length;
    }, [imagesData]);

    // Split images into two columns for masonry effect
    const masonryColumns = useMemo(() => {
        const col1 = [];
        const col2 = [];
        allImages.forEach((img, idx) => {
            if (idx % 2 === 0) {
                col1.push(img);
            } else {
                col2.push(img);
            }
        });
        return [col1, col2];
    }, [allImages]);

    // Filter albums by category
    const filteredAlbums = useMemo(() => {
        if (selectedCategory === 'ALL') return albums;
        return albums.filter(album => album.category === selectedCategory);
    }, [albums, selectedCategory]);

    // Handle Album Click
    const handleAlbumPress = (album) => {
        setSelectedAlbum(album);
        setViewMode('PHOTOS');
    };

    // Handle Back Button (Custom logic)
    const handleBack = () => {
        if (selectedAlbum) {
            setSelectedAlbum(null);
            setViewMode('ALBUMS');
        } else if (viewMode === 'PHOTOS') {
            setViewMode('ALBUMS');
        } else {
            router.back();
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['school-gallery']),
            queryClient.invalidateQueries(['gallery-albums']),
            queryClient.invalidateQueries(['gallery-images']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    // Navigate to image viewer with all images
    const openImageViewer = (image) => {
        const imageIndex = allImages.findIndex(img => img.id === image.id);
        router.push({
            pathname: '/(screens)/gallery/image-viewer',
            params: {
                images: JSON.stringify(allImages),
                initialIndex: imageIndex >= 0 ? imageIndex : 0,
            },
        });
    };

    // Download image handler
    const handleDownload = async (image, e) => {
        e?.stopPropagation?.();
        if (downloadingId) return;

        try {
            setDownloadingId(image.id);
            const imageUrl = image.optimizedUrl || image.originalUrl;
            const fileName = image.fileName || `gallery_${image.id}.jpg`;

            if (Platform.OS === 'android') {
                const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (!permissions.granted) {
                    Alert.alert('Permission Denied', 'Cannot save without storage permission');
                    setDownloadingId(null);
                    return;
                }

                const tempUri = FileSystem.cacheDirectory + fileName;
                await FileSystem.downloadAsync(imageUrl, tempUri);
                const fileContent = await FileSystem.readAsStringAsync(tempUri, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                await FileSystem.StorageAccessFramework.createFileAsync(
                    permissions.directoryUri,
                    fileName,
                    'image/jpeg'
                ).then(async (uri) => {
                    await FileSystem.writeAsStringAsync(uri, fileContent, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                });

                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Saved! 📸', 'Image saved to your folder');
            } else {
                const { status } = await MediaLibrary.requestPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert('Permission Required', 'Please grant photo library access');
                    setDownloadingId(null);
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
            setDownloadingId(null);
        }
    };

    // Category pill component
    const CategoryPill = ({ category, isSelected, onPress }) => (
        <HapticTouchable onPress={onPress}>
            <View style={[styles.categoryPill, isSelected && styles.categoryPillActive]}>
                <Text style={[styles.categoryPillText, isSelected && styles.categoryPillTextActive]}>
                    {category.label}
                </Text>
            </View>
        </HapticTouchable>
    );

    // Masonry image item with enhanced styling
    const MasonryItem = ({ image, delay = 0, columnIndex }) => {
        // Varied heights for Pinterest effect - more variation for visual interest
        const charSum = image.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const heights = [200, 240, 180, 260, 220, 280, 190, 250];
        const height = heights[(charSum + columnIndex) % heights.length];

        return (
            <Animated.View
                entering={FadeIn.delay(delay).duration(400)}
                style={[styles.masonryItem, { height }]}
            >
                <HapticTouchable onPress={() => openImageViewer(image)} style={{ flex: 1 }}>
                    <Image
                        source={{ uri: image.thumbnailUrl || image.optimizedUrl || image.originalUrl }}
                        style={styles.masonryImage}
                        resizeMode="cover"
                    />
                    {/* Gradient overlay */}
                    <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.5)']}
                        style={styles.imageGradient}
                    />
                    {/* Download button */}
                    <HapticTouchable
                        onPress={(e) => handleDownload(image, e)}
                        style={styles.downloadButton}
                    >
                        {downloadingId === image.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Download size={16} color="#fff" />
                        )}
                    </HapticTouchable>
                    {image.album && (
                        <View style={styles.imageOverlay}>
                            <Text style={styles.imageAlbumLabel} numberOfLines={1}>
                                {image.album.title}
                            </Text>
                        </View>
                    )}
                </HapticTouchable>
            </Animated.View>
        );
    };

    // Stats calculation
    const totalPhotos = allImages.length;
    const totalAlbums = galleryData?.albums?.length || 0;

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Gradient Header */}
            <LinearGradient
                colors={['#EC4899', '#DB2777', '#BE185D']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                {/* Decorative background patterns */}
                <View style={styles.headerDecor}>
                    <Text style={styles.decorIcon1}>📸</Text>
                    <Text style={styles.decorIcon2}>✨</Text>
                    <Text style={styles.decorIcon3}>🎨</Text>
                    <View style={styles.decorCircle1} />
                    <View style={styles.decorCircle2} />
                </View>

                <View style={styles.headerRow}>
                    <HapticTouchable onPress={handleBack}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>School Gallery</Text>
                        <Text style={styles.headerSubtitle}>Memories & Moments</Text>
                    </View>
                    <View style={styles.headerPlaceholder} />
                </View>

                {/* Stats Cards */}
                <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <ImageIcon size={20} color="#fff" />
                        <Text style={styles.statValue}>{totalPhotos}</Text>
                        <Text style={styles.statLabel}>Photos</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statCard}>
                        <Folder size={20} color="#fff" />
                        <Text style={styles.statValue}>{totalAlbums}</Text>
                        <Text style={styles.statLabel}>Albums</Text>
                    </View>
                </Animated.View>

                {/* View Mode Toggle */}
                {!selectedAlbum && (
                    <View style={styles.viewToggleContainer}>
                        <View style={styles.viewToggle}>
                            <HapticTouchable
                                style={[styles.toggleBtn, viewMode === 'ALBUMS' && styles.toggleBtnActive]}
                                onPress={() => {
                                    setViewMode('ALBUMS');
                                    setSelectedAlbum(null);
                                }}
                            >
                                <Text style={[styles.toggleText, viewMode === 'ALBUMS' && styles.toggleTextActive]}>Albums</Text>
                            </HapticTouchable>
                            <HapticTouchable
                                style={[styles.toggleBtn, viewMode === 'PHOTOS' && styles.toggleBtnActive]}
                                onPress={() => {
                                    setViewMode('PHOTOS');
                                    setSelectedAlbum(null);
                                }}
                            >
                                <Text style={[styles.toggleText, viewMode === 'PHOTOS' && styles.toggleTextActive]}>All Photos</Text>
                            </HapticTouchable>
                        </View>
                    </View>
                )}
            </LinearGradient>

            {/* Category Filter - Only show if not in album detail view */}
            {!selectedAlbum && (
                <Animated.View entering={FadeInDown.delay(100).duration(400)}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.categoryScroll}
                        contentContainerStyle={styles.categoryScrollContent}
                    >
                        {CATEGORIES.map((cat) => (
                            <CategoryPill
                                key={cat.key}
                                category={cat}
                                isSelected={selectedCategory === cat.key}
                                onPress={() => setSelectedCategory(cat.key)}
                            />
                        ))}
                    </ScrollView>
                </Animated.View>
            )}

            {/* Selected Album Header */}
            {selectedAlbum && (
                <Animated.View entering={FadeInDown.duration(300)} style={styles.albumHeader}>
                    <HapticTouchable onPress={handleBack} style={styles.albumHeaderBack}>
                        <ArrowLeft size={20} color="#333" />
                        <Text style={styles.albumHeaderTitle}>{selectedAlbum.title}</Text>
                    </HapticTouchable>
                    <Text style={styles.albumHeaderCount}>{String(allImages.length)} Photos</Text>
                </Animated.View>
            )}

            {/* Gallery Content */}
            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#EC4899"
                    />
                }
            >
                {isLoading || imagesLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#EC4899" />
                        <Text style={styles.loadingText}>Loading gallery...</Text>
                    </View>
                ) : (
                    <>
                        {viewMode === 'ALBUMS' && !selectedAlbum ? (
                            /* ALBUMS GRID */
                            <View style={styles.albumsContainer}>
                                {filteredAlbums.length > 0 ? (
                                    filteredAlbums.map((album, idx) => (
                                        <Animated.View
                                            key={album.id}
                                            entering={FadeInUp.delay(idx * 50).duration(400)}
                                            style={styles.albumCardWrapper}
                                        >
                                            <HapticTouchable onPress={() => handleAlbumPress(album)} style={styles.albumCard}>
                                                <Image
                                                    source={{ uri: album.coverImage || 'https://via.placeholder.com/300?text=Album' }}
                                                    style={styles.albumCover}
                                                    resizeMode="cover"
                                                />
                                                <LinearGradient
                                                    colors={['transparent', 'rgba(0,0,0,0.8)']}
                                                    style={styles.albumGradient}
                                                />
                                                <View style={styles.albumInfo}>
                                                    <Text style={styles.albumTitle} numberOfLines={2}>{album.title}</Text>
                                                    <View style={styles.albumMeta}>
                                                        <ImageIcon size={12} color="rgba(255,255,255,0.8)" />
                                                        <Text style={styles.albumCount}>{getAlbumImageCount(album.id)} Photos</Text>
                                                    </View>
                                                </View>
                                            </HapticTouchable>
                                        </Animated.View>
                                    ))
                                ) : (
                                    <View style={styles.emptyContainer}>
                                        <Text style={styles.emptyText}>No albums found</Text>
                                    </View>
                                )}
                            </View>
                        ) : (
                            /* PHOTOS MASONRY GRID */
                            allImages.length > 0 ? (
                                <View style={styles.masonryContainer}>
                                    {/* Column 1 */}
                                    <View style={styles.masonryColumn}>
                                        {masonryColumns[0].map((img, idx) => (
                                            <MasonryItem
                                                key={img.id}
                                                image={img}
                                                delay={idx * 50}
                                                columnIndex={0}
                                            />
                                        ))}
                                    </View>
                                    {/* Column 2 */}
                                    <View style={styles.masonryColumn}>
                                        {masonryColumns[1].map((img, idx) => (
                                            <MasonryItem
                                                key={img.id}
                                                image={img}
                                                delay={idx * 50 + 25}
                                                columnIndex={1}
                                            />
                                        ))}
                                    </View>
                                </View>
                            ) : (
                                <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.emptyState}>
                                    <View style={styles.emptyIcon}>
                                        <Camera size={48} color="#EC4899" />
                                    </View>
                                    <Text style={styles.emptyTitle}>No Photos Yet</Text>
                                    <Text style={styles.emptySubtitle}>
                                        {selectedAlbum
                                            ? `No photos in ${selectedAlbum.title}`
                                            : 'Photos from school events will appear here'}
                                    </Text>
                                </Animated.View>
                            )
                        )}
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 20,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        overflow: 'hidden',
    },
    headerDecor: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    decorIcon1: {
        position: 'absolute',
        top: 25,
        right: 60,
        fontSize: 24,
        opacity: 0.15,
    },
    decorIcon2: {
        position: 'absolute',
        top: 70,
        right: 20,
        fontSize: 18,
        opacity: 0.12,
    },
    decorIcon3: {
        position: 'absolute',
        bottom: 50,
        right: 100,
        fontSize: 20,
        opacity: 0.1,
    },
    decorCircle1: {
        position: 'absolute',
        top: -40,
        right: -40,
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    decorCircle2: {
        position: 'absolute',
        bottom: -30,
        left: -20,
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.04)',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    backButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    headerPlaceholder: {
        width: 44,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 24,
    },
    statCard: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
        marginTop: 4,
    },
    statLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    statDivider: {
        width: 1,
        height: 40,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginHorizontal: 24,
    },
    categoryScroll: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    categoryScrollContent: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 10,
        flexDirection: 'row',
        alignItems: 'center',
    },
    categoryPill: {
        paddingHorizontal: 18,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: '#f5f5f5',
        borderWidth: 1.5,
        borderColor: 'transparent',
    },
    categoryPillActive: {
        backgroundColor: '#FCE7F3',
        borderColor: '#EC4899',
    },
    categoryPillText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    categoryPillTextActive: {
        color: '#EC4899',
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
        paddingTop: 16,
    },
    loadingContainer: {
        paddingVertical: 80,
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 15,
        color: '#666',
        fontWeight: '500',
    },
    masonryContainer: {
        flexDirection: 'row',
        gap: COLUMN_GAP,
    },
    masonryColumn: {
        flex: 1,
        gap: COLUMN_GAP,
    },
    masonryItem: {
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#f0f0f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 5,
        marginBottom: 10,
    },
    viewToggleContainer: {
        marginTop: 20,
        alignItems: 'center',
    },
    viewToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
        padding: 4,
    },
    toggleBtn: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 16,
    },
    toggleBtnActive: {
        backgroundColor: '#fff',
    },
    toggleText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 13,
        fontWeight: '600',
    },
    toggleTextActive: {
        color: '#DB2777',
    },
    albumsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        paddingBottom: 20,
    },
    albumCardWrapper: {
        width: (SCREEN_WIDTH - 32 - 12) / 2, // 2 columns
    },
    albumCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        height: 180,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    albumCover: {
        width: '100%',
        height: '100%',
    },
    albumGradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 100,
    },
    albumInfo: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 12,
    },
    albumTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    albumMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    albumCount: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '500',
    },
    albumHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    albumHeaderBack: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    albumHeaderTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    albumHeaderCount: {
        fontSize: 13,
        color: '#666',
        fontWeight: '500',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
    masonryImage: {
        width: '100%',
        height: '100%',
    },
    imageGradient: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
    },
    downloadButton: {
        position: 'absolute',
        top: 10,
        right: 10,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    imageOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    imageAlbumLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#fff',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 100,
        gap: 12,
    },
    emptyIcon: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#FCE7F3',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111',
    },
    emptySubtitle: {
        fontSize: 15,
        color: '#666',
        textAlign: 'center',
        paddingHorizontal: 40,
        lineHeight: 22,
    },
    viewToggleContainer: {
        marginTop: 20,
        alignItems: 'center',
    },
    viewToggle: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
        padding: 4,
    },
    toggleBtn: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 16,
    },
    toggleBtnActive: {
        backgroundColor: '#fff',
    },
    toggleText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 13,
        fontWeight: '600',
    },
    toggleTextActive: {
        color: '#DB2777',
    },
    albumsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        paddingBottom: 20,
    },
    albumCardWrapper: {
        width: (SCREEN_WIDTH - 32 - 12) / 2, // 2 columns
    },
    albumCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        overflow: 'hidden',
        height: 180,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    albumCover: {
        width: '100%',
        height: '100%',
    },
    albumGradient: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 100,
    },
    albumInfo: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 12,
    },
    albumTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
        textShadowColor: 'rgba(0,0,0,0.5)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    albumMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    albumCount: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '500',
    },
    albumHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    albumHeaderBack: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    albumHeaderTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    albumHeaderCount: {
        fontSize: 13,
        color: '#666',
        fontWeight: '500',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
});
