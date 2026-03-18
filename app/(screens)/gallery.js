// app/(screens)/gallery.js
// Pinterest-style school gallery with masonry layout, orientation support, and rich sharing

import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
    Modal,
    Share,
    useWindowDimensions,
} from 'react-native';
import { GallerySkeleton } from '../components/ScreenSkeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    FadeInDown,
    FadeInUp,
    FadeIn,
    ZoomIn,
} from 'react-native-reanimated';
import {
    ArrowLeft,
    Image as ImageIcon,
    Folder,
    Camera,
    Download,
    Share2,
    X,
    Calendar,
    Clock,
    MapPin,
    Info,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';

import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const COLUMN_GAP = 10;

const CATEGORIES = [
    { key: 'ALL', label: 'All' },
    { key: 'ANNUAL_DAY', label: 'Annual Day' },
    { key: 'SPORTS_DAY', label: 'Sports' },
    { key: 'CULTURAL', label: 'Cultural' },
    { key: 'GRADUATION', label: 'Graduation' },
    { key: 'FIELD_TRIP', label: 'Field Trip' },
    { key: 'CLASSROOM', label: 'Classroom' },
    { key: 'AWARDS', label: 'Awards' },
    { key: 'GENERAL', label: 'General' },
];

// ── Skeleton shimmer card ──────────────────────────────────────────────────────
const SkeletonCard = ({ height, delay = 0 }) => (
    <Animated.View entering={FadeIn.delay(delay).duration(400)} style={[styles.skeletonCard, { height }]} />
);

const GallerySkeletonCustom = ({ numColumns }) => {
    const heights1 = [200, 160, 230, 180, 210];
    const heights2 = [170, 220, 150, 240, 190];
    return (
        <View style={[styles.masonryContainer, { gap: COLUMN_GAP }]}>
            <View style={styles.masonryColumn}>
                {heights1.map((h, i) => <SkeletonCard key={i} height={h} delay={i * 60} />)}
            </View>
            <View style={styles.masonryColumn}>
                {heights2.map((h, i) => <SkeletonCard key={i} height={h} delay={i * 60 + 30} />)}
            </View>
            {numColumns === 3 && (
                <View style={styles.masonryColumn}>
                    {[190, 220, 160, 200, 230].map((h, i) => <SkeletonCard key={i} height={h} delay={i * 60 + 60} />)}
                </View>
            )}
        </View>
    );
};

const AlbumSkeletonCustom = ({ numColumns }) => {
    const cols = Array.from({ length: numColumns });
    return (
        <View style={styles.albumsContainer}>
            {Array.from({ length: 6 }).map((_, i) => (
                <Animated.View key={i} entering={FadeIn.delay(i * 60).duration(400)} style={[styles.skeletonAlbum, { width: `${Math.floor(96 / numColumns)}%` }]} />
            ))}
        </View>
    );
};

export default function GalleryScreen() {
    const { width: W, height: H } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isLandscape = W > H;
    const numColumns = isLandscape ? 3 : 2;
    const COLUMN_WIDTH = (W - 32 - COLUMN_GAP * (numColumns - 1)) / numColumns;

    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [downloadingId, setDownloadingId] = useState(null);
    const [viewMode, setViewMode] = useState('ALBUMS');
    const [selectedAlbum, setSelectedAlbum] = useState(null);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imageModalVisible, setImageModalVisible] = useState(false);

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const schoolName = userData?.schoolName || 'EduBreezy School';

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

    const { data: albumsData, isLoading: albumsLoading } = useQuery({
        queryKey: ['gallery-albums', schoolId, selectedCategory],
        queryFn: async () => {
            if (!schoolId) return { albums: [] };
            let url = `/schools/${schoolId}/gallery/albums?limit=50`;
            if (selectedCategory !== 'ALL') url += `&category=${selectedCategory}`;
            const res = await api.get(url);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 2,
    });

    const { data: imagesData, isLoading: imagesLoading } = useQuery({
        queryKey: ['gallery-images', schoolId],
        queryFn: async () => {
            if (!schoolId) return { images: [] };
            const res = await api.get(`/schools/${schoolId}/gallery/images?status=APPROVED&limit=100`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 2,
    });

    const albums = albumsData?.albums || [];

    const allImages = useMemo(() => {
        let images = imagesData?.images || [];
        if (selectedAlbum) return images.filter(img => img.albumId === selectedAlbum.id);
        if (selectedCategory !== 'ALL') images = images.filter(img => img.album?.category === selectedCategory);
        return images;
    }, [imagesData, selectedCategory, selectedAlbum]);

    const getAlbumImageCount = useCallback((albumId) => {
        return (imagesData?.images || []).filter(img => img.albumId === albumId).length;
    }, [imagesData]);

    // Split into N columns for masonry
    const masonryColumns = useMemo(() => {
        const cols = Array.from({ length: numColumns }, () => []);
        allImages.forEach((img, idx) => cols[idx % numColumns].push(img));
        return cols;
    }, [allImages, numColumns]);

    const filteredAlbums = useMemo(() => {
        if (selectedCategory === 'ALL') return albums;
        return albums.filter(a => a.category === selectedCategory);
    }, [albums, selectedCategory]);

    const handleAlbumPress = (album) => {
        setSelectedAlbum(album);
        setViewMode('PHOTOS');
    };

    const handleBack = () => {
        if (imageModalVisible) { setImageModalVisible(false); return; }
        if (selectedAlbum) { setSelectedAlbum(null); setViewMode('ALBUMS'); return; }
        if (viewMode === 'PHOTOS') { setViewMode('ALBUMS'); return; }
        router.back();
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

    const openImageViewer = (image) => {
        setSelectedImage(image);
        setImageModalVisible(true);
    };

    const handleDownload = async (image) => {
        if (downloadingId) return;
        try {
            setDownloadingId(image.id);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const imageUrl = image.optimizedUrl || image.originalUrl;
            const fileName = image.fileName || `edubreezy_gallery_${image.id}.jpg`;

            if (Platform.OS === 'android') {
                const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (!permissions.granted) {
                    Alert.alert('Permission Denied', 'Cannot save without storage permission');
                    return;
                }
                const tempUri = FileSystem.cacheDirectory + fileName;
                await FileSystem.downloadAsync(imageUrl, tempUri);
                const fileContent = await FileSystem.readAsStringAsync(tempUri, { encoding: FileSystem.EncodingType.Base64 });
                const newUri = await FileSystem.StorageAccessFramework.createFileAsync(permissions.directoryUri, fileName, 'image/jpeg');
                await FileSystem.writeAsStringAsync(newUri, fileContent, { encoding: FileSystem.EncodingType.Base64 });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Saved! 📸', 'Image saved to your folder');
            } else {
                const fileUri = FileSystem.cacheDirectory + fileName;
                await FileSystem.downloadAsync(imageUrl, fileUri);
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Save Image' });
                } else {
                    Alert.alert('Error', 'Sharing is not available on this device');
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch (error) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Download Failed', 'Could not save the image');
        } finally {
            setDownloadingId(null);
        }
    };

    const handleShare = async (image) => {
        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            const imageUrl = image.optimizedUrl || image.originalUrl;
            const fileName = image.fileName || `edubreezy_gallery_${image.id}.jpg`;
            const fileUri = FileSystem.cacheDirectory + fileName;
            await FileSystem.downloadAsync(imageUrl, fileUri);

            const albumTitle = image.album?.title || selectedAlbum?.title || 'School Gallery';
            const eventDate = image.album?.eventDate
                ? new Date(image.album.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                : null;
            const caption = image.caption ? `\n📝 ${image.caption}` : '';
            const dateStr = eventDate ? `\n📅 ${eventDate}` : '';
            const uploadedStr = image.uploadedAt
                ? `\nUploaded: ${new Date(image.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : '';

            const shareMessage = `📸 ${albumTitle}${caption}${dateStr}${uploadedStr}\n\nShared via EduBreezy School ERP — ${schoolName}`;

            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'image/jpeg',
                    UTI: 'public.jpeg',
                    dialogTitle: shareMessage,
                });
            } else {
                await Share.share({ message: shareMessage, url: imageUrl });
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to share image');
        }
    };

    const formatDate = (str) => {
        if (!str) return null;
        return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const formatTime = (str) => {
        if (!str) return null;
        return new Date(str).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    };

    // ── Image detail modal ───────────────────────────────────────────────────
    const ImageDetailModal = () => {
        const { width: mW, height: mH } = useWindowDimensions();
        const mLandscape = mW > mH;
        const imgHeight = mLandscape ? mH * 0.55 : mH * 0.45;

        return (
            <Modal
                visible={imageModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setImageModalVisible(false)}
                statusBarTranslucent
            >
                <View style={styles.modalBackdrop}>
                    <StatusBar style="light" />
                    <Animated.View
                        entering={ZoomIn.duration(250)}
                        style={[
                            styles.modalSheet,
                            mLandscape && { flexDirection: 'row', maxHeight: mH * 0.95 }
                        ]}
                    >
                        {selectedImage && (
                            <>
                                {/* Image */}
                                <Image
                                    source={{ uri: selectedImage.optimizedUrl || selectedImage.originalUrl }}
                                    style={[
                                        styles.modalImage,
                                        { height: imgHeight },
                                        mLandscape && { width: mW * 0.5, height: '100%', borderTopRightRadius: 0, borderBottomLeftRadius: 20 }
                                    ]}
                                    resizeMode="cover"
                                />

                                {/* Info panel */}
                                <ScrollView
                                    style={mLandscape ? { flex: 1 } : undefined}
                                    showsVerticalScrollIndicator={false}
                                >
                                    <View style={[styles.modalInfo, { paddingBottom: 20 + insets.bottom }]}>
                                        {/* Album / event name */}
                                        {(selectedImage.album?.title || selectedAlbum?.title) && (
                                            <View style={styles.modalEventBadge}>
                                                <Folder size={13} color="#EC4899" />
                                                <Text style={styles.modalEventText}>
                                                    {selectedImage.album?.title || selectedAlbum?.title}
                                                </Text>
                                            </View>
                                        )}

                                        {/* Caption */}
                                        {selectedImage.caption && (
                                            <Text style={styles.modalCaption}>{selectedImage.caption}</Text>
                                        )}

                                        {/* Meta rows */}
                                        <View style={styles.modalMetaGrid}>
                                            {selectedImage.album?.eventDate && (
                                                <View style={styles.modalMetaRow}>
                                                    <View style={styles.modalMetaIcon}><Calendar size={14} color="#EC4899" /></View>
                                                    <View>
                                                        <Text style={styles.modalMetaLabel}>Event Date</Text>
                                                        <Text style={styles.modalMetaValue}>{formatDate(selectedImage.album.eventDate)}</Text>
                                                    </View>
                                                </View>
                                            )}
                                            {selectedImage.uploadedAt && (
                                                <View style={styles.modalMetaRow}>
                                                    <View style={styles.modalMetaIcon}><Clock size={14} color="#EC4899" /></View>
                                                    <View>
                                                        <Text style={styles.modalMetaLabel}>Uploaded</Text>
                                                        <Text style={styles.modalMetaValue}>
                                                            {formatDate(selectedImage.uploadedAt)} · {formatTime(selectedImage.uploadedAt)}
                                                        </Text>
                                                    </View>
                                                </View>
                                            )}
                                            {selectedImage.album?.category && (
                                                <View style={styles.modalMetaRow}>
                                                    <View style={styles.modalMetaIcon}><Info size={14} color="#EC4899" /></View>
                                                    <View>
                                                        <Text style={styles.modalMetaLabel}>Category</Text>
                                                        <Text style={styles.modalMetaValue}>
                                                            {CATEGORIES.find(c => c.key === selectedImage.album.category)?.label || selectedImage.album.category}
                                                        </Text>
                                                    </View>
                                                </View>
                                            )}
                                        </View>

                                        {/* EduBreezy watermark */}
                                        <View style={styles.modalBrandRow}>
                                            <Text style={styles.modalBrandText}>📚 Shared via EduBreezy School ERP</Text>
                                        </View>

                                        {/* Actions */}
                                        <View style={styles.modalActions}>
                                            <HapticTouchable onPress={() => handleDownload(selectedImage)} disabled={!!downloadingId}>
                                                <View style={styles.modalActionBtn}>
                                                    {downloadingId === selectedImage.id
                                                        ? <ActivityIndicator size="small" color="#fff" />
                                                        : <Download size={20} color="#fff" />
                                                    }
                                                    <Text style={styles.modalActionText}>Save</Text>
                                                </View>
                                            </HapticTouchable>
                                            <HapticTouchable onPress={() => handleShare(selectedImage)} disabled={!!downloadingId}>
                                                <View style={[styles.modalActionBtn, { backgroundColor: '#EC4899' }]}>
                                                    <Share2 size={20} color="#fff" />
                                                    <Text style={styles.modalActionText}>Share</Text>
                                                </View>
                                            </HapticTouchable>
                                        </View>
                                    </View>
                                </ScrollView>
                            </>
                        )}

                        {/* Close */}
                        <HapticTouchable onPress={() => setImageModalVisible(false)} style={styles.modalClose}>
                            <View style={styles.modalCloseBtn}><X size={20} color="#fff" /></View>
                        </HapticTouchable>
                    </Animated.View>
                </View>
            </Modal>
        );
    };

    // ── Masonry item ─────────────────────────────────────────────────────────
    const MasonryItem = ({ image, delay = 0, colIdx }) => {
        const charSum = image.id.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
        const heights = [200, 240, 180, 260, 220, 280, 190, 250];
        const height = heights[(charSum + colIdx) % heights.length];

        return (
            <Animated.View entering={FadeIn.delay(delay).duration(400)} style={[styles.masonryItem, { height }]}>
                <HapticTouchable onPress={() => openImageViewer(image)} style={{ flex: 1 }}>
                    <Image
                        source={{ uri: image.thumbnailUrl || image.optimizedUrl || image.originalUrl }}
                        style={styles.masonryImage}
                        resizeMode="cover"
                    />
                    <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.imageGradient} />
                    <HapticTouchable onPress={() => handleDownload(image)} style={styles.downloadFab}>
                        {downloadingId === image.id
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Download size={15} color="#fff" />
                        }
                    </HapticTouchable>
                    {(image.caption || image.album?.title) && (
                        <View style={styles.imageOverlay}>
                            {image.caption
                                ? <Text style={styles.imageCaption} numberOfLines={2}>{image.caption}</Text>
                                : <Text style={styles.imageAlbumLabel} numberOfLines={1}>{image.album.title}</Text>
                            }
                        </View>
                    )}
                </HapticTouchable>
            </Animated.View>
        );
    };

    const totalPhotos = allImages.length;
    const totalAlbums = galleryData?.albums?.length || 0;

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Gradient Header */}
            <LinearGradient
                colors={['#EC4899', '#DB2777', '#BE185D']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={[styles.header, { paddingTop: insets.top + 12 }]}
            >
                <View style={styles.headerDecor}>
                    <Text style={styles.decorIcon1}>📸</Text>
                    <Text style={styles.decorIcon2}>✨</Text>
                    <Text style={styles.decorIcon3}>🎨</Text>
                    <View style={styles.decorCircle1} />
                    <View style={styles.decorCircle2} />
                </View>

                <View style={styles.headerRow}>
                    <HapticTouchable onPress={handleBack}>
                        <View style={styles.backButton}><ArrowLeft size={24} color="#fff" /></View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>School Gallery</Text>
                        <Text style={styles.headerSubtitle}>Memories & Moments</Text>
                    </View>
                    <View style={styles.headerPlaceholder} />
                </View>

                {!isLandscape && (
                    <>
                        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.statsRow}>
                            <View style={styles.statCard}>
                                <ImageIcon size={18} color="#fff" />
                                <Text style={styles.statValue}>{totalPhotos}</Text>
                                <Text style={styles.statLabel}>Photos</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statCard}>
                                <Folder size={18} color="#fff" />
                                <Text style={styles.statValue}>{totalAlbums}</Text>
                                <Text style={styles.statLabel}>Albums</Text>
                            </View>
                        </Animated.View>

                        {!selectedAlbum && (
                            <View style={styles.viewToggleContainer}>
                                <View style={styles.viewToggle}>
                                    <HapticTouchable onPress={() => { setViewMode('ALBUMS'); setSelectedAlbum(null); }}>
                                        <View style={[styles.toggleBtn, viewMode === 'ALBUMS' && styles.toggleBtnActive]}>
                                            <Text style={[styles.toggleText, viewMode === 'ALBUMS' && styles.toggleTextActive]}>Albums</Text>
                                        </View>
                                    </HapticTouchable>
                                    <HapticTouchable onPress={() => { setViewMode('PHOTOS'); setSelectedAlbum(null); }}>
                                        <View style={[styles.toggleBtn, viewMode === 'PHOTOS' && styles.toggleBtnActive]}>
                                            <Text style={[styles.toggleText, viewMode === 'PHOTOS' && styles.toggleTextActive]}>All Photos</Text>
                                        </View>
                                    </HapticTouchable>
                                </View>
                            </View>
                        )}
                    </>
                )}
            </LinearGradient>

            {/* In landscape: show toggle in a compact bar */}
            {isLandscape && !selectedAlbum && (
                <View style={styles.landscapeBar}>
                    <View style={styles.landscapeToggle}>
                        <HapticTouchable onPress={() => { setViewMode('ALBUMS'); setSelectedAlbum(null); }}>
                            <View style={[styles.toggleBtn, viewMode === 'ALBUMS' && styles.toggleBtnLandscapeActive]}>
                                <Text style={[styles.toggleText, { color: viewMode === 'ALBUMS' ? '#DB2777' : '#666' }]}>Albums</Text>
                            </View>
                        </HapticTouchable>
                        <HapticTouchable onPress={() => { setViewMode('PHOTOS'); setSelectedAlbum(null); }}>
                            <View style={[styles.toggleBtn, viewMode === 'PHOTOS' && styles.toggleBtnLandscapeActive]}>
                                <Text style={[styles.toggleText, { color: viewMode === 'PHOTOS' ? '#DB2777' : '#666' }]}>All Photos</Text>
                            </View>
                        </HapticTouchable>
                    </View>
                    <Text style={styles.landscapeStats}>{totalPhotos} photos · {totalAlbums} albums</Text>
                </View>
            )}

            {/* Category filter
            {!selectedAlbum && !isLoading && !imagesLoading && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.categoryScroll}
                    contentContainerStyle={styles.categoryScrollContent}
                >
                    {CATEGORIES.map((cat) => (
                        <HapticTouchable key={cat.key} onPress={() => setSelectedCategory(cat.key)}>
                            <View style={[styles.categoryPill, selectedCategory === cat.key && styles.categoryPillActive]}>
                                <Text style={[styles.categoryPillText, selectedCategory === cat.key && styles.categoryPillTextActive]}>
                                    {cat.label}
                                </Text>
                            </View>
                        </HapticTouchable>
                    ))}
                </ScrollView>
            )} */}

            {/* Selected album header */}
            {selectedAlbum && (
                <View style={styles.albumHeader}>
                    <HapticTouchable onPress={handleBack} style={styles.albumHeaderBack}>
                        <ArrowLeft size={20} color="#333" />
                        <Text style={styles.albumHeaderTitle} numberOfLines={1}>{selectedAlbum.title}</Text>
                    </HapticTouchable>
                    <Text style={styles.albumHeaderCount}>{allImages.length} Photos</Text>
                </View>
            )}

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EC4899" />}
            >
                {isLoading || imagesLoading || albumsLoading ? (
                    viewMode === 'ALBUMS' ? <AlbumSkeletonCustom numColumns={numColumns} /> : <GallerySkeletonCustom numColumns={numColumns} />
                ) : (
                    <>
                        {viewMode === 'ALBUMS' && !selectedAlbum ? (
                            filteredAlbums.length > 0 ? (
                                <View style={styles.albumsContainer}>
                                    {filteredAlbums.map((album, idx) => (
                                        <Animated.View
                                            key={album.id}
                                            entering={FadeInUp.delay(idx * 50).duration(400)}
                                            style={[styles.albumCardWrapper, { width: `${Math.floor(96 / numColumns)}%` }]}
                                        >
                                            <HapticTouchable onPress={() => handleAlbumPress(album)} style={styles.albumCard}>
                                                <Image
                                                    source={{ uri: album.coverImage || 'https://via.placeholder.com/300?text=Album' }}
                                                    style={styles.albumCover}
                                                    resizeMode="cover"
                                                />
                                                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={styles.albumGradient} />
                                                <View style={styles.albumInfo}>
                                                    <Text style={styles.albumTitle} numberOfLines={2}>{album.title}</Text>
                                                    {album.eventDate && (
                                                        <Text style={styles.albumDate}>
                                                            {new Date(album.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                        </Text>
                                                    )}
                                                    <View style={styles.albumMeta}>
                                                        <ImageIcon size={11} color="rgba(255,255,255,0.8)" />
                                                        <Text style={styles.albumCount}>{getAlbumImageCount(album.id)} Photos</Text>
                                                    </View>
                                                </View>
                                            </HapticTouchable>
                                        </Animated.View>
                                    ))}
                                </View>
                            ) : (
                                <View style={styles.emptyContainer}>
                                    <Text style={styles.emptyText}>No albums found</Text>
                                </View>
                            )
                        ) : (
                            allImages.length > 0 ? (
                                <View style={[styles.masonryContainer, { gap: COLUMN_GAP }]}>
                                    {masonryColumns.map((col, colIdx) => (
                                        <View key={colIdx} style={styles.masonryColumn}>
                                            {col.map((img, idx) => (
                                                <MasonryItem
                                                    key={img.id}
                                                    image={img}
                                                    delay={idx * 40 + colIdx * 20}
                                                    colIdx={colIdx}
                                                />
                                            ))}
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <Animated.View entering={FadeInUp.delay(200).duration(400)} style={styles.emptyState}>
                                    <View style={styles.emptyIcon}><Camera size={48} color="#EC4899" /></View>
                                    <Text style={styles.emptyTitle}>No Photos Yet</Text>
                                    <Text style={styles.emptySubtitle}>
                                        {selectedAlbum ? `No photos in ${selectedAlbum.title}` : 'Photos from school events will appear here'}
                                    </Text>
                                </Animated.View>
                            )
                        )}
                    </>
                )}
            </ScrollView>

            <ImageDetailModal />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa', overflow: 'hidden' },
    // Header
    header: { paddingHorizontal: 16, paddingBottom: 20, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
    headerDecor: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
    decorIcon1: { position: 'absolute', top: 25, right: 60, fontSize: 24, opacity: 0.15 },
    decorIcon2: { position: 'absolute', top: 70, right: 20, fontSize: 18, opacity: 0.12 },
    decorIcon3: { position: 'absolute', bottom: 50, right: 100, fontSize: 20, opacity: 0.1 },
    decorCircle1: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)' },
    decorCircle2: { position: 'absolute', bottom: -30, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.04)' },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    backButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
    headerSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    headerPlaceholder: { width: 44 },
    statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 24, marginBottom: 16 },
    statCard: { alignItems: 'center', flex: 1 },
    statValue: { fontSize: 22, fontWeight: '700', color: '#fff', marginTop: 4 },
    statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    statDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 24 },
    viewToggleContainer: { alignItems: 'center' },
    viewToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 4 },
    toggleBtn: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 16 },
    toggleBtnActive: { backgroundColor: '#fff', borderRadius: 20, },
    toggleBtnLandscapeActive: { backgroundColor: '#FCE7F3' },
    toggleText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
    toggleTextActive: { color: '#DB2777' },

    // Landscape bar
    landscapeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    landscapeToggle: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 16, padding: 3, gap: 2 },
    landscapeStats: { fontSize: 12, color: '#999', fontWeight: '500' },

    // Category
    categoryScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    categoryScrollContent: { paddingHorizontal: 16, gap: 8, flexDirection: 'row', },
    categoryPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f5f5f5', borderWidth: 1.5, borderColor: 'transparent' },
    categoryPillActive: { backgroundColor: '#FCE7F3', borderColor: '#EC4899' },
    categoryPillText: { fontSize: 13, fontWeight: '600', color: '#666' },
    categoryPillTextActive: { color: '#EC4899' },

    // Album header
    albumHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    albumHeaderBack: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    albumHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#111', flex: 1 },
    albumHeaderCount: { fontSize: 13, color: '#999', fontWeight: '500' },

    content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },

    // Masonry
    masonryContainer: { flexDirection: 'row' },
    masonryColumn: { flex: 1, gap: COLUMN_GAP },
    masonryItem: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#f0f0f0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 5, marginBottom: 10 },
    masonryImage: { width: '100%', height: '100%' },
    imageGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70 },
    downloadFab: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
    imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 10, paddingBottom: 10, paddingTop: 4 },
    imageCaption: { fontSize: 11, color: '#fff', fontWeight: '600', lineHeight: 15 },
    imageAlbumLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },

    // Albums grid
    albumsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingBottom: 20, justifyContent: 'space-between' },
    albumCardWrapper: {},
    albumCard: { borderRadius: 18, overflow: 'hidden', height: 190, backgroundColor: '#f0f0f0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
    albumCover: { width: '100%', height: '100%' },
    albumGradient: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 },
    albumInfo: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12 },
    albumTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 3, textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
    albumDate: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
    albumMeta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    albumCount: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },

    // Empty
    emptyContainer: { flex: 1, alignItems: 'center', paddingVertical: 32 },
    emptyText: { fontSize: 16, color: '#999' },
    emptyState: { alignItems: 'center', paddingVertical: 80, gap: 12 },
    emptyIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FCE7F3', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 },

    // Skeleton
    skeletonCard: { borderRadius: 18, backgroundColor: '#e8e8e8', marginBottom: 10, overflow: 'hidden' },
    skeletonAlbum: { height: 190, borderRadius: 18, backgroundColor: '#e8e8e8' },

    // Modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', overflow: 'hidden' },
    modalImage: { width: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
    modalInfo: { padding: 20 },
    modalEventBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FCE7F3', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginBottom: 10 },
    modalEventText: { fontSize: 12, fontWeight: '700', color: '#EC4899' },
    modalCaption: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 14, lineHeight: 22 },
    modalMetaGrid: { gap: 12, marginBottom: 14 },
    modalMetaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    modalMetaIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FCE7F3', alignItems: 'center', justifyContent: 'center' },
    modalMetaLabel: { fontSize: 11, color: '#999', fontWeight: '600' },
    modalMetaValue: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 1 },
    modalBrandRow: { backgroundColor: '#f8f9fa', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
    modalBrandText: { fontSize: 12, color: '#888', textAlign: 'center', fontWeight: '500' },
    modalActions: { flexDirection: 'row', gap: 12 },
    modalActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#333', paddingVertical: 14, borderRadius: 14 },
    modalActionText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    modalClose: { position: 'absolute', top: 16, right: 16 },
    modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});