// app/(screens)/gallery-album.js
// Album detail view with masonry, orientation support, rich sharing

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
    Share,
    Alert,
    Platform,
    Modal,
    useWindowDimensions,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown, FadeIn, ZoomIn } from 'react-native-reanimated';
import {
    ArrowLeft,
    Calendar,
    X,
    Download,
    Share2,
    Camera,
    Folder,
    Clock,
    Info,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const COLUMN_GAP = 8;

const CATEGORY_LABELS = {
    ANNUAL_DAY: 'Annual Day', SPORTS_DAY: 'Sports Day', CULTURAL: 'Cultural',
    GRADUATION: 'Graduation', FIELD_TRIP: 'Field Trip', CLASSROOM: 'Classroom',
    INFRASTRUCTURE: 'Infrastructure', AWARDS: 'Awards', GENERAL: 'General',
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
const SkeletonCard = ({ height, delay = 0 }) => (
    <Animated.View entering={FadeIn.delay(delay).duration(400)} style={[styles.skeletonCard, { height }]} />
);

const AlbumDetailSkeleton = ({ numColumns }) => {
    const heights = [[200, 160, 230, 175, 210], [170, 215, 155, 240, 190], [185, 225, 165, 200, 235]];
    return (
        <View style={[styles.masonryContainer, { gap: COLUMN_GAP }]}>
            {Array.from({ length: numColumns }).map((_, colIdx) => (
                <View key={colIdx} style={styles.masonryColumn}>
                    {(heights[colIdx] || heights[0]).map((h, i) => (
                        <SkeletonCard key={i} height={h} delay={i * 55 + colIdx * 25} />
                    ))}
                </View>
            ))}
        </View>
    );
};

export default function GalleryAlbumScreen() {
    const { albumId } = useLocalSearchParams();
    const { width: W, height: H } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isLandscape = W > H;
    const numColumns = isLandscape ? 3 : 2;

    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imageModalVisible, setImageModalVisible] = useState(false);
    const [downloading, setDownloading] = useState(false);

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

    const { data: albumData, isLoading } = useQuery({
        queryKey: ['gallery-album', schoolId, albumId],
        queryFn: async () => {
            if (!schoolId || !albumId) return null;
            const res = await api.get(`/schools/${schoolId}/gallery/albums/${albumId}?limit=100`);
            return res.data;
        },
        enabled: !!schoolId && !!albumId,
        staleTime: 1000 * 60 * 2,
    });

    const album = albumData?.album;
    const images = albumData?.images || [];

    const masonryColumns = useMemo(() => {
        const cols = Array.from({ length: numColumns }, () => []);
        images.forEach((img, idx) => cols[idx % numColumns].push(img));
        return cols;
    }, [images, numColumns]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['gallery-album', schoolId, albumId]);
        setRefreshing(false);
    }, [queryClient, schoolId, albumId]);

    const openImageModal = (image) => {
        setSelectedImage(image);
        setImageModalVisible(true);
    };

    const formatDate = (str) => {
        if (!str) return null;
        return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    };

    const formatTime = (str) => {
        if (!str) return null;
        return new Date(str).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    };

    const handleDownloadImage = async (image = selectedImage) => {
        if (!image || downloading) return;
        try {
            setDownloading(true);
            const imageUrl = image.optimizedUrl || image.originalUrl;
            const fileName = image.fileName || `edubreezy_${albumId}_${image.id}.jpg`;

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
                Alert.alert('Saved! 📸', `${fileName} saved to your folder`);
            } else {
                const fileUri = FileSystem.cacheDirectory + fileName;
                await FileSystem.downloadAsync(imageUrl, fileUri);
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(fileUri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Save Image' });
                } else {
                    Alert.alert('Error', 'Sharing is not available on this device');
                }
            }
        } catch (error) {
            Alert.alert('Download Failed', 'Could not save the image');
        } finally {
            setDownloading(false);
        }
    };

    const handleShareImage = async (image = selectedImage) => {
        if (!image || downloading) return;
        try {
            setDownloading(true);
            const imageUrl = image.optimizedUrl || image.originalUrl;
            const fileName = image.fileName || `edubreezy_${albumId}_${image.id}.jpg`;
            const fileUri = FileSystem.cacheDirectory + fileName;
            await FileSystem.downloadAsync(imageUrl, fileUri);

            const caption = image.caption ? `\n📝 ${image.caption}` : '';
            const eventDate = album?.eventDate ? `\n📅 Event: ${formatDate(album.eventDate)}` : '';
            const uploadedStr = image.uploadedAt
                ? `\n🕐 Uploaded: ${formatDate(image.uploadedAt)} at ${formatTime(image.uploadedAt)}`
                : '';
            const albumTitle = album?.title || 'School Gallery';
            const category = album?.category ? `\n🏷 Category: ${CATEGORY_LABELS[album.category] || album.category}` : '';

            const shareMessage = `📸 ${albumTitle}${caption}${eventDate}${category}${uploadedStr}\n\n📚 Shared via EduBreezy School ERP — ${schoolName}`;

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
        } finally {
            setDownloading(false);
        }
    };

    // ── Image detail modal ───────────────────────────────────────────────────
    const ImageModal = () => {
        const { width: mW, height: mH } = useWindowDimensions();
        const mLandscape = mW > mH;
        const imgH = mLandscape ? mH * 0.6 : mH * 0.42;

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
                            mLandscape && { flexDirection: 'row', maxHeight: mH * 0.94 }
                        ]}
                    >
                        {selectedImage && (
                            <>
                                <Image
                                    source={{ uri: selectedImage.optimizedUrl || selectedImage.originalUrl }}
                                    style={[
                                        styles.modalImage,
                                        { height: imgH },
                                        mLandscape && { width: mW * 0.5, height: '100%', borderTopRightRadius: 0, borderBottomLeftRadius: 24 }
                                    ]}
                                    resizeMode="cover"
                                />

                                <ScrollView
                                    style={mLandscape ? { flex: 1 } : undefined}
                                    showsVerticalScrollIndicator={false}
                                    bounces={false}
                                >
                                    <View style={[styles.modalInfo, { paddingBottom: 20 + insets.bottom }]}>
                                        {/* Album badge */}
                                        {album?.title && (
                                            <View style={styles.modalAlbumBadge}>
                                                <Folder size={12} color="#0469ff" />
                                                <Text style={styles.modalAlbumText}>{album.title}</Text>
                                            </View>
                                        )}

                                        {/* Caption */}
                                        {selectedImage.caption && (
                                            <Text style={styles.modalCaption}>{selectedImage.caption}</Text>
                                        )}

                                        {/* Metadata */}
                                        <View style={styles.metaGrid}>
                                            {album?.eventDate && (
                                                <View style={styles.metaRow}>
                                                    <View style={styles.metaIconBg}><Calendar size={14} color="#0469ff" /></View>
                                                    <View>
                                                        <Text style={styles.metaLabel}>Event Date</Text>
                                                        <Text style={styles.metaValue}>{formatDate(album.eventDate)}</Text>
                                                    </View>
                                                </View>
                                            )}
                                            {selectedImage.uploadedAt && (
                                                <View style={styles.metaRow}>
                                                    <View style={styles.metaIconBg}><Clock size={14} color="#0469ff" /></View>
                                                    <View>
                                                        <Text style={styles.metaLabel}>Uploaded</Text>
                                                        <Text style={styles.metaValue}>{formatDate(selectedImage.uploadedAt)} · {formatTime(selectedImage.uploadedAt)}</Text>
                                                    </View>
                                                </View>
                                            )}
                                            {album?.category && (
                                                <View style={styles.metaRow}>
                                                    <View style={styles.metaIconBg}><Info size={14} color="#0469ff" /></View>
                                                    <View>
                                                        <Text style={styles.metaLabel}>Category</Text>
                                                        <Text style={styles.metaValue}>{CATEGORY_LABELS[album.category] || album.category}</Text>
                                                    </View>
                                                </View>
                                            )}
                                        </View>

                                        {/* EduBreezy brand */}
                                        <View style={styles.brandRow}>
                                            <Text style={styles.brandText}>📚 Shared via EduBreezy School ERP</Text>
                                        </View>

                                        {/* Actions */}
                                        <View style={styles.modalActions}>
                                            <HapticTouchable onPress={() => handleDownloadImage(selectedImage)} disabled={downloading}>
                                                <View style={styles.actionBtn}>
                                                    {downloading ? <ActivityIndicator size="small" color="#fff" /> : <Download size={20} color="#fff" />}
                                                    <Text style={styles.actionText}>Save</Text>
                                                </View>
                                            </HapticTouchable>
                                            <HapticTouchable onPress={() => handleShareImage(selectedImage)} disabled={downloading}>
                                                <View style={[styles.actionBtn, { backgroundColor: '#0469ff' }]}>
                                                    <Share2 size={20} color="#fff" />
                                                    <Text style={styles.actionText}>Share</Text>
                                                </View>
                                            </HapticTouchable>
                                        </View>
                                    </View>
                                </ScrollView>
                            </>
                        )}
                        <HapticTouchable onPress={() => setImageModalVisible(false)} style={styles.modalCloseTouch}>
                            <View style={styles.modalCloseBtn}><X size={20} color="#fff" /></View>
                        </HapticTouchable>
                    </Animated.View>
                </View>
            </Modal>
        );
    };

    // ── Masonry item ─────────────────────────────────────────────────────────
    const MasonryItem = ({ image, delay = 0, colIdx = 0 }) => {
        const height = 150 + (image.id.charCodeAt(0) % 130);
        return (
            <Animated.View entering={FadeIn.delay(delay).duration(300)} style={[styles.masonryItem, { height }]}>
                <HapticTouchable onPress={() => openImageModal(image)} style={{ flex: 1 }}>
                    <Image
                        source={{ uri: image.thumbnailUrl || image.optimizedUrl || image.originalUrl }}
                        style={styles.masonryImage}
                        resizeMode="cover"
                    />
                    {image.caption && (
                        <View style={styles.imageOverlay}>
                            <Text style={styles.imageCaptionLabel} numberOfLines={2}>{image.caption}</Text>
                        </View>
                    )}
                </HapticTouchable>
            </Animated.View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}><ArrowLeft size={24} color="#111" /></View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{album?.title || 'Album'}</Text>
                    <Text style={styles.headerSubtitle}>{images.length} photos</Text>
                </View>
                <View style={styles.headerPlaceholder} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {/* Album metadata card */}
                {album && (
                    <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.albumMetaCard}>
                        <View style={styles.albumMetaRow}>
                            {album.category && (
                                <View style={styles.albumMetaChip}>
                                    <Folder size={13} color="#0469ff" />
                                    <Text style={styles.albumMetaChipText}>{CATEGORY_LABELS[album.category] || album.category}</Text>
                                </View>
                            )}
                            {album.eventDate && (
                                <View style={styles.albumMetaChip}>
                                    <Calendar size={13} color="#10B981" />
                                    <Text style={[styles.albumMetaChipText, { color: '#10B981' }]}>
                                        {new Date(album.eventDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </Text>
                                </View>
                            )}
                        </View>
                        {album.description && (
                            <Text style={styles.albumDescription}>{album.description}</Text>
                        )}
                    </Animated.View>
                )}

                {/* Gallery */}
                {isLoading ? (
                    <AlbumDetailSkeleton numColumns={numColumns} />
                ) : images.length > 0 ? (
                    <View style={[styles.masonryContainer, { gap: COLUMN_GAP }]}>
                        {masonryColumns.map((col, colIdx) => (
                            <View key={colIdx} style={styles.masonryColumn}>
                                {col.map((img, idx) => (
                                    <MasonryItem key={img.id} image={img} delay={idx * 45 + colIdx * 20} colIdx={colIdx} />
                                ))}
                            </View>
                        ))}
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}><Camera size={48} color="#ccc" /></View>
                        <Text style={styles.emptyTitle}>No Photos</Text>
                        <Text style={styles.emptySubtitle}>This album doesn't have any photos yet</Text>
                    </View>
                )}
            </ScrollView>

            <ImageModal />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 16 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
    headerPlaceholder: { width: 40 },

    content: { flex: 1, paddingHorizontal: 16 },

    // Album meta card
    albumMetaCard: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', marginBottom: 16 },
    albumMetaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 8 },
    albumMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EEF4FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    albumMetaChipText: { fontSize: 12, fontWeight: '600', color: '#0469ff' },
    albumDescription: { fontSize: 14, color: '#555', lineHeight: 20 },

    // Masonry
    masonryContainer: { flexDirection: 'row' },
    masonryColumn: { flex: 1, gap: COLUMN_GAP },
    masonryItem: { borderRadius: 14, overflow: 'hidden', backgroundColor: '#f5f5f5', marginBottom: COLUMN_GAP },
    masonryImage: { width: '100%', height: '100%' },
    imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 8, paddingVertical: 7, backgroundColor: 'rgba(0,0,0,0.5)' },
    imageCaptionLabel: { fontSize: 11, fontWeight: '600', color: '#fff', lineHeight: 15 },

    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 80, gap: 12 },
    emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
    emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 40 },

    // Skeleton
    skeletonCard: { borderRadius: 14, backgroundColor: '#e8e8e8', marginBottom: COLUMN_GAP },

    // Modal
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
    modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', overflow: 'hidden' },
    modalImage: { width: '100%', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
    modalInfo: { padding: 20 },
    modalAlbumBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EEF4FF', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, marginBottom: 10 },
    modalAlbumText: { fontSize: 12, fontWeight: '700', color: '#0469ff' },
    modalCaption: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 14, lineHeight: 22 },
    metaGrid: { gap: 12, marginBottom: 14 },
    metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    metaIconBg: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' },
    metaLabel: { fontSize: 11, color: '#999', fontWeight: '600' },
    metaValue: { fontSize: 13, fontWeight: '600', color: '#333', marginTop: 1 },
    brandRow: { backgroundColor: '#f8f9fa', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 16 },
    brandText: { fontSize: 12, color: '#888', textAlign: 'center', fontWeight: '500' },
    modalActions: { flexDirection: 'row', gap: 12 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#333', paddingVertical: 14, borderRadius: 14 },
    actionText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    modalCloseTouch: { position: 'absolute', top: 16, right: 16 },
    modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
});