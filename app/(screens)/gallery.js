// app/(screens)/gallery.js
// Pinterest-style school gallery with masonry layout, orientation support, and rich sharing

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    FlatList,
    RefreshControl,
    Dimensions,
    ActivityIndicator,
    Image,
    Alert,
    Platform,
    Modal,
    Share,
    TouchableOpacity,
    useWindowDimensions,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    FadeInDown,
    FadeInUp,
    FadeIn,
    FadeOut,
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    runOnJS,
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
    ChevronLeft,
    ChevronRight,
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
const FILMSTRIP_SIZE = 64;
const FILMSTRIP_GAP = 6;

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
    return (
        <View style={styles.albumsContainer}>
            {Array.from({ length: 6 }).map((_, i) => (
                <Animated.View key={i} entering={FadeIn.delay(i * 60).duration(400)} style={[styles.skeletonAlbum, { width: `${Math.floor(96 / numColumns)}%` }]} />
            ))}
        </View>
    );
};

// ── Full-screen iOS-style Image Viewer ────────────────────────────────────────
const ImageViewer = ({ visible, images, initialIndex, onClose, onDownload, onShare, downloadingId, insets }) => {
    const { width: W, height: H } = useWindowDimensions();
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [infoVisible, setInfoVisible] = useState(false);
    const filmstripRef = useRef(null);

    // Sync initialIndex when viewer opens
    React.useEffect(() => {
        if (visible) {
            setCurrentIndex(initialIndex);
            setInfoVisible(false);
        }
    }, [visible, initialIndex]);

    // Auto-scroll filmstrip to keep selected thumb visible
    React.useEffect(() => {
        if (filmstripRef.current && images.length > 0) {
            const offset = currentIndex * (FILMSTRIP_SIZE + FILMSTRIP_GAP) - W / 2 + FILMSTRIP_SIZE / 2;
            filmstripRef.current.scrollToOffset({ offset: Math.max(0, offset), animated: true });
        }
    }, [currentIndex, W]);

    const image = images[currentIndex];
    if (!image) return null;

    const goNext = () => { if (currentIndex < images.length - 1) setCurrentIndex(i => i + 1); };
    const goPrev = () => { if (currentIndex > 0) setCurrentIndex(i => i - 1); };

    const formatDate = (str) => str ? new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
    const formatTime = (str) => str ? new Date(str).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null;

    return (
        <Modal
            visible={visible}
            transparent={false}
            animationType="fade"
            onRequestClose={onClose}
            statusBarTranslucent
        >
            <StatusBar style="light" />
            <View style={viewer.root}>

                {/* ── Top bar ── */}
                <View style={[viewer.topBar, { paddingTop: insets.top + 8 }]}>
                    <TouchableOpacity onPress={onClose} style={viewer.topBtn} activeOpacity={0.7}>
                        <X size={22} color="#fff" />
                    </TouchableOpacity>

                    <View style={viewer.topCenter}>
                        <Text style={viewer.topCounter}>{currentIndex + 1} / {images.length}</Text>
                        {image.album?.title && (
                            <Text style={viewer.topAlbum} numberOfLines={1}>{image.album.title}</Text>
                        )}
                    </View>

                    <TouchableOpacity onPress={() => setInfoVisible(v => !v)} style={viewer.topBtn} activeOpacity={0.7}>
                        <Info size={22} color={infoVisible ? '#EC4899' : '#fff'} />
                    </TouchableOpacity>
                </View>

                {/* ── Main image ── */}
                <View style={viewer.imageContainer}>
                    <Image
                        key={image.id}
                        source={{ uri: image.optimizedUrl || image.originalUrl }}
                        style={viewer.mainImage}
                        resizeMode="contain"
                    />

                    {/* Prev / Next arrows */}
                    {currentIndex > 0 && (
                        <TouchableOpacity style={[viewer.arrowBtn, viewer.arrowLeft]} onPress={goPrev} activeOpacity={0.7}>
                            <ChevronLeft size={26} color="#fff" />
                        </TouchableOpacity>
                    )}
                    {currentIndex < images.length - 1 && (
                        <TouchableOpacity style={[viewer.arrowBtn, viewer.arrowRight]} onPress={goNext} activeOpacity={0.7}>
                            <ChevronRight size={26} color="#fff" />
                        </TouchableOpacity>
                    )}
                </View>

                {/* ── Info overlay ── */}
                {infoVisible && (
                    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)} style={viewer.infoOverlay}>
                        {image.caption && (
                            <Text style={viewer.infoCaption}>{image.caption}</Text>
                        )}
                        <View style={viewer.infoMeta}>
                            {image.album?.eventDate && (
                                <View style={viewer.infoMetaRow}>
                                    <Calendar size={13} color="#EC4899" />
                                    <Text style={viewer.infoMetaText}>{formatDate(image.album.eventDate)}</Text>
                                </View>
                            )}
                            {image.uploadedAt && (
                                <View style={viewer.infoMetaRow}>
                                    <Clock size={13} color="#EC4899" />
                                    <Text style={viewer.infoMetaText}>
                                        {formatDate(image.uploadedAt)} · {formatTime(image.uploadedAt)}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                )}

                {/* ── Bottom: actions + filmstrip ── */}
                <View style={[viewer.bottomBar, { paddingBottom: insets.bottom + 10 }]}>

                    {/* Action buttons row */}
                    <View style={viewer.actionRow}>
                        <TouchableOpacity
                            style={viewer.actionBtn}
                            onPress={() => onDownload(image)}
                            disabled={!!downloadingId}
                            activeOpacity={0.7}
                        >
                            {downloadingId === image.id
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Download size={20} color="#fff" />
                            }
                            <Text style={viewer.actionText}>Save</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[viewer.actionBtn, viewer.actionBtnPink]}
                            onPress={() => onShare(image)}
                            disabled={!!downloadingId}
                            activeOpacity={0.7}
                        >
                            <Share2 size={20} color="#fff" />
                            <Text style={viewer.actionText}>Share</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Filmstrip */}
                    <FlatList
                        ref={filmstripRef}
                        data={images}
                        keyExtractor={item => item.id}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={viewer.filmstripContent}
                        getItemLayout={(_, index) => ({
                            length: FILMSTRIP_SIZE + FILMSTRIP_GAP,
                            offset: (FILMSTRIP_SIZE + FILMSTRIP_GAP) * index,
                            index,
                        })}
                        renderItem={({ item, index }) => {
                            const isActive = index === currentIndex;
                            return (
                                <TouchableOpacity
                                    onPress={() => setCurrentIndex(index)}
                                    activeOpacity={0.8}
                                    style={[
                                        viewer.filmThumb,
                                        isActive && viewer.filmThumbActive,
                                    ]}
                                >
                                    <Image
                                        source={{ uri: item.thumbnailUrl || item.optimizedUrl || item.originalUrl }}
                                        style={viewer.filmThumbImage}
                                        resizeMode="cover"
                                    />
                                    {!isActive && <View style={viewer.filmThumbDim} />}
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </View>
        </Modal>
    );
};

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function GalleryScreen() {
    const { width: W, height: H } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isLandscape = W > H;
    const numColumns = isLandscape ? 3 : 2;

    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('ALL');
    const [downloadingId, setDownloadingId] = useState(null);
    const [viewMode, setViewMode] = useState('ALBUMS');
    const [selectedAlbum, setSelectedAlbum] = useState(null);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerIndex, setViewerIndex] = useState(0);

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
        if (viewerVisible) { setViewerVisible(false); return; }
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
        const idx = allImages.findIndex(img => img.id === image.id);
        setViewerIndex(idx >= 0 ? idx : 0);
        setViewerVisible(true);
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
            const shareMessage = `📸 ${albumTitle}${caption}${dateStr}\n\nShared via EduBreezy School ERP — ${schoolName}`;

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

    // ── Masonry item ──────────────────────────────────────────────────────────
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

            {/* Full-screen viewer */}
            <ImageViewer
                visible={viewerVisible}
                images={allImages}
                initialIndex={viewerIndex}
                onClose={() => setViewerVisible(false)}
                onDownload={handleDownload}
                onShare={handleShare}
                downloadingId={downloadingId}
                insets={insets}
            />
        </View>
    );
}

// ── Viewer styles ─────────────────────────────────────────────────────────────
const viewer = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: '#000',
    },
    // Top bar
    topBar: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingBottom: 12,
        background: 'transparent',
    },
    topBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    topCenter: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    topCounter: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    topAlbum: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.6)',
        marginTop: 2,
    },
    // Main image
    imageContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mainImage: {
        width: '100%',
        height: '100%',
    },
    // Arrows
    arrowBtn: {
        position: 'absolute',
        top: '50%',
        marginTop: -24,
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
    },
    arrowLeft: { left: 12 },
    arrowRight: { right: 12 },
    // Info overlay (above filmstrip)
    infoOverlay: {
        position: 'absolute',
        bottom: 160,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingVertical: 14,
        backgroundColor: 'rgba(0,0,0,0.65)',
        zIndex: 6,
    },
    infoCaption: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 8,
        lineHeight: 22,
    },
    infoMeta: {
        gap: 6,
    },
    infoMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    infoMetaText: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        fontWeight: '500',
    },
    // Bottom bar
    bottomBar: {
        backgroundColor: 'rgba(0,0,0,0.85)',
        paddingTop: 14,
        gap: 14,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.08)',
    },
    // Action row
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
    },
    actionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingVertical: 11,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
    },
    actionBtnPink: {
        backgroundColor: '#EC4899',
        borderColor: '#EC4899',
    },
    actionText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#fff',
    },
    // Filmstrip
    filmstripContent: {
        paddingHorizontal: 16,
        gap: FILMSTRIP_GAP,
        alignItems: 'center',
    },
    filmThumb: {
        width: FILMSTRIP_SIZE,
        height: FILMSTRIP_SIZE,
        borderRadius: 10,
        overflow: 'hidden',
        marginRight: FILMSTRIP_GAP,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    filmThumbActive: {
        borderColor: '#EC4899',
        borderWidth: 2.5,
    },
    filmThumbImage: {
        width: '100%',
        height: '100%',
    },
    filmThumbDim: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
});

// ── Gallery styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa', overflow: 'hidden' },
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
    toggleBtnActive: { backgroundColor: '#fff', borderRadius: 20 },
    toggleBtnLandscapeActive: { backgroundColor: '#FCE7F3' },
    toggleText: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
    toggleTextActive: { color: '#DB2777' },
    landscapeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    landscapeToggle: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 16, padding: 3, gap: 2 },
    landscapeStats: { fontSize: 12, color: '#999', fontWeight: '500' },
    albumHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    albumHeaderBack: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    albumHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#111', flex: 1 },
    albumHeaderCount: { fontSize: 13, color: '#999', fontWeight: '500' },
    content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    masonryContainer: { flexDirection: 'row' },
    masonryColumn: { flex: 1, gap: COLUMN_GAP },
    masonryItem: { borderRadius: 18, overflow: 'hidden', backgroundColor: '#f0f0f0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 5, marginBottom: 10 },
    masonryImage: { width: '100%', height: '100%' },
    imageGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 70 },
    downloadFab: { position: 'absolute', top: 10, right: 10, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
    imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 10, paddingBottom: 10, paddingTop: 4 },
    imageCaption: { fontSize: 11, color: '#fff', fontWeight: '600', lineHeight: 15 },
    imageAlbumLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
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
    emptyContainer: { flex: 1, alignItems: 'center', paddingVertical: 32 },
    emptyText: { fontSize: 16, color: '#999' },
    emptyState: { alignItems: 'center', paddingVertical: 80, gap: 12 },
    emptyIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: '#FCE7F3', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 40, lineHeight: 22 },
    skeletonCard: { borderRadius: 18, backgroundColor: '#e8e8e8', marginBottom: 10, overflow: 'hidden' },
    skeletonAlbum: { height: 190, borderRadius: 18, backgroundColor: '#e8e8e8' },
});