// app/(screens)/gallery-album.js
// Album detail view with all images

import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Dimensions,
    ActivityIndicator,
    TouchableOpacity,
    Modal,
    Image,
    Share,
    Alert,
    Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Animated, {
    FadeInDown,
    FadeIn,
    ZoomIn,
} from 'react-native-reanimated';
import {
    ArrowLeft,
    Calendar,
    X,
    Download,
    Share2,
    Camera,
    Folder,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';

import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLUMN_GAP = 8;
const NUM_COLUMNS = 2;
const COLUMN_WIDTH = (SCREEN_WIDTH - 32 - COLUMN_GAP) / NUM_COLUMNS;

const CATEGORY_LABELS = {
    ANNUAL_DAY: 'Annual Day',
    SPORTS_DAY: 'Sports Day',
    CULTURAL: 'Cultural',
    GRADUATION: 'Graduation',
    FIELD_TRIP: 'Field Trip',
    CLASSROOM: 'Classroom',
    INFRASTRUCTURE: 'Infrastructure',
    AWARDS: 'Awards',
    GENERAL: 'General',
};

export default function GalleryAlbumScreen() {
    const { albumId } = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [imageModalVisible, setImageModalVisible] = useState(false);
    const [downloading, setDownloading] = useState(false);

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

    // Fetch album with images
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

    // Split images into two columns for masonry
    const masonryColumns = useMemo(() => {
        const col1 = [];
        const col2 = [];
        images.forEach((img, idx) => {
            if (idx % 2 === 0) {
                col1.push(img);
            } else {
                col2.push(img);
            }
        });
        return [col1, col2];
    }, [images]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['gallery-album', schoolId, albumId]);
        setRefreshing(false);
    }, [queryClient, schoolId, albumId]);

    const openImageModal = (image) => {
        setSelectedImage(image);
        setImageModalVisible(true);
    };

    const handleDownloadImage = async () => {
        if (!selectedImage) return;
        try {
            setDownloading(true);
            const imageUrl = selectedImage.optimizedUrl || selectedImage.originalUrl;
            const fileName = selectedImage.fileName || `gallery_${selectedImage.id}.jpg`;

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

                Alert.alert('Success! 📸', `${fileName} saved to your folder`);
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

                Alert.alert('Success! 📸', 'Image saved to School Gallery album');
            }
        } catch (error) {
            console.error('Download error:', error);
            Alert.alert('Download Failed', 'Could not save the image');
        } finally {
            setDownloading(false);
        }
    };

    const handleShareImage = async () => {
        if (!selectedImage) return;
        try {
            setDownloading(true);
            const imageUrl = selectedImage.optimizedUrl || selectedImage.originalUrl;
            const isAvailable = await Sharing.isAvailableAsync();
            if (!isAvailable) {
                await Share.share({ url: imageUrl });
                setDownloading(false);
                return;
            }

            const fileName = selectedImage.fileName || `gallery_${selectedImage.id}.jpg`;
            const fileUri = FileSystem.cacheDirectory + fileName;
            await FileSystem.downloadAsync(imageUrl, fileUri);
            await Sharing.shareAsync(fileUri);
        } catch (error) {
            console.error('Share error:', error);
            Alert.alert('Error', 'Failed to share image');
        } finally {
            setDownloading(false);
        }
    };

    // Masonry image item
    const MasonryItem = ({ image, delay = 0 }) => {
        const height = 150 + (image.id.charCodeAt(0) % 130);

        return (
            <Animated.View
                entering={FadeIn.delay(delay).duration(300)}
                style={[styles.masonryItem, { height }]}
            >
                <HapticTouchable onPress={() => openImageModal(image)} style={{ flex: 1 }}>
                    <Image
                        source={{ uri: image.thumbnailUrl || image.optimizedUrl || image.originalUrl }}
                        style={styles.masonryImage}
                        resizeMode="cover"
                    />
                    {image.caption && (
                        <View style={styles.imageOverlay}>
                            <Text style={styles.imageCaptionLabel} numberOfLines={1}>
                                {image.caption}
                            </Text>
                        </View>
                    )}
                </HapticTouchable>
            </Animated.View>
        );
    };

    // Image viewer modal
    const ImageModal = () => (
        <Modal
            visible={imageModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setImageModalVisible(false)}
        >
            <View style={styles.modalContainer}>
                <TouchableOpacity
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setImageModalVisible(false)}
                />
                <Animated.View entering={ZoomIn.duration(200)} style={styles.modalContent}>
                    {selectedImage && (
                        <>
                            <Image
                                source={{
                                    uri: selectedImage.optimizedUrl || selectedImage.originalUrl,
                                }}
                                style={styles.modalImage}
                                resizeMode="contain"
                            />
                            <View style={styles.modalInfo}>
                                {selectedImage.caption && (
                                    <Text style={styles.modalCaption}>{selectedImage.caption}</Text>
                                )}
                                <Text style={styles.modalDate}>
                                    {new Date(selectedImage.uploadedAt).toLocaleDateString('en-US', {
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                    })}
                                </Text>
                            </View>
                            <View style={styles.modalActions}>
                                <HapticTouchable onPress={handleDownloadImage} disabled={downloading}>
                                    <View style={styles.modalActionButton}>
                                        {downloading ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <Download size={22} color="#fff" />
                                        )}
                                        <Text style={styles.modalActionText}>Save</Text>
                                    </View>
                                </HapticTouchable>
                                <HapticTouchable onPress={handleShareImage} disabled={downloading}>
                                    <View style={styles.modalActionButton}>
                                        <Share2 size={22} color="#fff" />
                                        <Text style={styles.modalActionText}>Share</Text>
                                    </View>
                                </HapticTouchable>
                            </View>
                        </>
                    )}
                    <HapticTouchable
                        style={styles.modalCloseButton}
                        onPress={() => setImageModalVisible(false)}
                    >
                        <X size={24} color="#fff" />
                    </HapticTouchable>
                </Animated.View>
            </View>
        </Modal>
    );

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {album?.title || 'Album'}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {images.length} photos
                    </Text>
                </View>
                <View style={styles.headerPlaceholder} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                    />
                }
            >
                {/* Album Info */}
                {album && (
                    <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.albumInfo}>
                        <View style={styles.albumInfoRow}>
                            <View style={styles.albumInfoItem}>
                                <Folder size={16} color="#666" />
                                <Text style={styles.albumInfoText}>
                                    {CATEGORY_LABELS[album.category] || album.category}
                                </Text>
                            </View>
                            {album.eventDate && (
                                <View style={styles.albumInfoItem}>
                                    <Calendar size={16} color="#666" />
                                    <Text style={styles.albumInfoText}>
                                        {new Date(album.eventDate).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                        })}
                                    </Text>
                                </View>
                            )}
                        </View>
                        {album.description && (
                            <Text style={styles.albumDescription}>{album.description}</Text>
                        )}
                    </Animated.View>
                )}

                {/* Gallery Content */}
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                        <Text style={styles.loadingText}>Loading photos...</Text>
                    </View>
                ) : images.length > 0 ? (
                    <View style={styles.masonryContainer}>
                        <View style={styles.masonryColumn}>
                            {masonryColumns[0].map((img, idx) => (
                                <MasonryItem key={img.id} image={img} delay={idx * 50} />
                            ))}
                        </View>
                        <View style={styles.masonryColumn}>
                            {masonryColumns[1].map((img, idx) => (
                                <MasonryItem key={img.id} image={img} delay={idx * 50 + 25} />
                            ))}
                        </View>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <Camera size={48} color="#ccc" />
                        </View>
                        <Text style={styles.emptyTitle}>No Photos</Text>
                        <Text style={styles.emptySubtitle}>
                            This album doesn't have any photos yet
                        </Text>
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <ImageModal />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    headerPlaceholder: {
        width: 40,
    },
    content: {
        flex: 1,
        paddingHorizontal: 16,
    },
    albumInfo: {
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        marginBottom: 16,
    },
    albumInfoRow: {
        flexDirection: 'row',
        gap: 16,
    },
    albumInfoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    albumInfoText: {
        fontSize: 14,
        color: '#666',
    },
    albumDescription: {
        fontSize: 14,
        color: '#444',
        marginTop: 10,
        lineHeight: 20,
    },
    loadingContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: '#666',
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
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: '#f5f5f5',
    },
    masonryImage: {
        width: '100%',
        height: '100%',
    },
    imageOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    imageCaptionLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#fff',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 80,
        gap: 12,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#111',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    // Modal styles
    modalContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.9)',
    },
    modalContent: {
        width: SCREEN_WIDTH - 32,
        maxHeight: SCREEN_HEIGHT * 0.8,
        borderRadius: 16,
        overflow: 'hidden',
    },
    modalImage: {
        width: '100%',
        height: SCREEN_HEIGHT * 0.5,
        backgroundColor: '#000',
    },
    modalInfo: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 16,
        gap: 4,
    },
    modalCaption: {
        fontSize: 15,
        color: '#fff',
        fontWeight: '500',
    },
    modalDate: {
        fontSize: 13,
        color: '#aaa',
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 32,
        paddingVertical: 20,
        backgroundColor: 'rgba(0,0,0,0.8)',
    },
    modalActionButton: {
        alignItems: 'center',
        gap: 6,
    },
    modalActionText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '500',
    },
    modalCloseButton: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
