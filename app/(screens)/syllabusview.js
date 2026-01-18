// app/(screens)/syllabus/index.js
// MINIMAL CHANGES - Keeping your original UI
import React, { useState, useMemo, useCallback } from 'react';
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
    Linking,
    Alert,
    Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    BookOpen,
    Download,
    Calendar,
    ChevronRight,
    ArrowLeft,
    Filter,
    FileText,
    CheckCircle2,
    AlertCircle,
    Eye,
    X,
    Share2,
    MoreVertical,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
// Use legacy API to avoid deprecation warnings
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';

import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SyllabusScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [selectedClass, setSelectedClass] = useState('');
    const [actionModalVisible, setActionModalVisible] = useState(false);
    const [selectedSyllabus, setSelectedSyllabus] = useState(null);
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
    const userRole = userData?.role?.name?.toLowerCase();

    // Fetch classes for filter
    const { data: classesData } = useQuery({
        queryKey: ['classes', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/classes`);
            return res.data;
        },
        enabled: !!schoolId,
    });

    const classes = classesData || [];

    // Fetch statistics
    const { data: statsData, isLoading: statsLoading } = useQuery({
        queryKey: ['syllabus-stats', schoolId],
        queryFn: async () => {
            if (!schoolId) return null;
            const res = await api.get(`/schools/syllabus/stats?schoolId=${schoolId}`);
            return res.data.stats;
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 2,
    });

    // Fetch syllabi
    const { data: syllabusData, isLoading } = useQuery({
        queryKey: ['syllabi', schoolId, selectedClass],
        queryFn: async () => {
            if (!schoolId) return { syllabi: [], total: 0 };

            let url = `/schools/syllabus?schoolId=${schoolId}`;
            if (selectedClass) url += `&classId=${selectedClass}`;

            const res = await api.get(url);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 2,
    });

    const syllabi = syllabusData?.syllabi || [];
    const stats = statsData || {};

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['syllabi']),
            queryClient.invalidateQueries(['syllabus-stats']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    const handleViewSyllabus = async (fileUrl) => {
        try {
            const supported = await Linking.canOpenURL(fileUrl);
            if (supported) {
                await Linking.openURL(fileUrl);
            } else {
                Alert.alert("Error", "Cannot open this PDF");
            }
        } catch (error) {
            console.error('Error opening PDF:', error);
            Alert.alert("Error", "Failed to open PDF");
        }
    };
    const handleDownloadSyllabus = async (syllabus) => {
        try {
            setDownloading(true);

            // Create file name
            const fileName = syllabus.filename || `Syllabus_${syllabus.Class?.className || 'Unknown'}.pdf`;

            if (Platform.OS === 'android') {
                // For Android: Use Storage Access Framework (works on all versions)
                const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

                if (!permissions.granted) {
                    Alert.alert('Permission Denied', 'Cannot save file without storage permission');
                    setDownloading(false);
                    return;
                }

                // Download to temp location first
                const tempUri = FileSystem.cacheDirectory + fileName;
                const downloadResult = await FileSystem.downloadAsync(syllabus.fileUrl, tempUri);

                // Read file as base64
                const fileContent = await FileSystem.readAsStringAsync(downloadResult.uri, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                // Save to user-selected directory (usually Downloads)
                const newUri = await FileSystem.StorageAccessFramework.createFileAsync(
                    permissions.directoryUri,
                    fileName,
                    'application/pdf'
                );

                await FileSystem.writeAsStringAsync(newUri, fileContent, {
                    encoding: FileSystem.EncodingType.Base64,
                });

                setDownloading(false);
                setActionModalVisible(false);

                Alert.alert(
                    'Success! 📁',
                    `${fileName} saved to your selected folder`,
                    [
                        { text: 'OK' },
                        {
                            text: 'Open PDF',
                            onPress: () => handleViewSyllabus(syllabus.fileUrl)
                        }
                    ]
                );

            } else {
                // For iOS: Use MediaLibrary
                const { status } = await MediaLibrary.requestPermissionsAsync();
                if (status !== 'granted') {
                    Alert.alert(
                        'Permission Required',
                        'Please grant photo library access to save files'
                    );
                    setDownloading(false);
                    return;
                }

                const fileUri = FileSystem.documentDirectory + fileName;
                await FileSystem.downloadAsync(syllabus.fileUrl, fileUri);

                const asset = await MediaLibrary.createAssetAsync(fileUri);
                await MediaLibrary.createAlbumAsync('School Syllabus', asset, false);

                setDownloading(false);
                setActionModalVisible(false);

                Alert.alert(
                    'Success! 📁',
                    'Syllabus saved to School Syllabus album',
                    [
                        { text: 'OK' },
                        {
                            text: 'Open PDF',
                            onPress: () => handleViewSyllabus(syllabus.fileUrl)
                        }
                    ]
                );
            }

        } catch (error) {
            console.error('Download error:', error);
            setDownloading(false);
            setActionModalVisible(false);

            Alert.alert(
                'Download Failed',
                'Could not save the file. Please try again or use the Share option instead.',
                [{ text: 'OK' }]
            );
        }
    };
    const handleShareSyllabus = async (syllabus) => {
        try {
            setDownloading(true);

            const isAvailable = await Sharing.isAvailableAsync();
            if (!isAvailable) {
                Alert.alert('Error', 'Sharing is not available on this device');
                setDownloading(false);
                return;
            }

            // Download to temp location first
            const fileName = syllabus.filename || `Syllabus_${syllabus.Class?.className}.pdf`;
            const fileUri = FileSystem.cacheDirectory + fileName;

            await FileSystem.downloadAsync(syllabus.fileUrl, fileUri);
            await Sharing.shareAsync(fileUri);

            setDownloading(false);
            setActionModalVisible(false);
        } catch (error) {
            console.error('Share error:', error);
            setDownloading(false);
            Alert.alert('Error', 'Failed to share syllabus');
        }
    };

    const openActionModal = (syllabus) => {
        setSelectedSyllabus(syllabus);
        setActionModalVisible(true);
    };

    const ActionModal = () => (
        <Modal
            visible={actionModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setActionModalVisible(false)}
        >
            <TouchableOpacity
                style={styles.actionModalOverlay}
                activeOpacity={1}
                onPress={() => setActionModalVisible(false)}
            >
                <Animated.View
                    entering={FadeInDown.duration(300)}
                    style={styles.actionModalContent}
                >
                    <View style={styles.actionModalHeader}>
                        <Text style={styles.actionModalTitle}>Choose Action</Text>
                        <Text style={styles.actionModalSubtitle} numberOfLines={1}>
                            {selectedSyllabus?.filename || 'Syllabus'}
                        </Text>
                    </View>

                    <View style={styles.actionModalButtons}>
                        <HapticTouchable
                            onPress={() => {
                                setActionModalVisible(false);
                                handleViewSyllabus(selectedSyllabus?.fileUrl);
                            }}
                            disabled={downloading}
                        >
                            <View style={styles.actionModalButton}>
                                <View style={[styles.actionModalIcon, { backgroundColor: '#E3F2FD' }]}>
                                    <Eye size={22} color="#0469ff" />
                                </View>
                                <Text style={styles.actionModalButtonText}>View PDF</Text>
                            </View>
                        </HapticTouchable>

                        <HapticTouchable
                            onPress={() => handleDownloadSyllabus(selectedSyllabus)}
                            disabled={downloading}
                        >
                            <View style={styles.actionModalButton}>
                                <View style={[styles.actionModalIcon, { backgroundColor: '#E8F5E9' }]}>
                                    {downloading ? (
                                        <ActivityIndicator size="small" color="#4CAF50" />
                                    ) : (
                                        <Download size={22} color="#4CAF50" />
                                    )}
                                </View>
                                <Text style={styles.actionModalButtonText}>
                                    {downloading ? 'Downloading...' : 'Download'}
                                </Text>
                            </View>
                        </HapticTouchable>

                        <HapticTouchable
                            onPress={() => handleShareSyllabus(selectedSyllabus)}
                            disabled={downloading}
                        >
                            <View style={styles.actionModalButton}>
                                <View style={[styles.actionModalIcon, { backgroundColor: '#FFF3E0' }]}>
                                    <Share2 size={22} color="#FF9800" />
                                </View>
                                <Text style={styles.actionModalButtonText}>Share</Text>
                            </View>
                        </HapticTouchable>
                    </View>

                    <HapticTouchable onPress={() => setActionModalVisible(false)}>
                        <View style={styles.actionModalCancel}>
                            <Text style={styles.actionModalCancelText}>Cancel</Text>
                        </View>
                    </HapticTouchable>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );

    const FilterModal = () => (
        <Modal
            visible={filterModalVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={() => setFilterModalVisible(false)}
        >
            <View style={styles.modalOverlay}>
                <Animated.View entering={FadeInDown.duration(300)} style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Filter by Class</Text>
                        <HapticTouchable onPress={() => setFilterModalVisible(false)}>
                            <View style={styles.modalCloseButton}>
                                <X size={20} color="#666" />
                            </View>
                        </HapticTouchable>
                    </View>

                    <ScrollView style={styles.modalScroll}>
                        <HapticTouchable onPress={() => {
                            setSelectedClass('');
                            setFilterModalVisible(false);
                        }}>
                            <View style={[
                                styles.filterOption,
                                !selectedClass && styles.filterOptionActive
                            ]}>
                                <Text style={[
                                    styles.filterOptionText,
                                    !selectedClass && styles.filterOptionTextActive
                                ]}>
                                    All Classes
                                </Text>
                                {!selectedClass && (
                                    <CheckCircle2 size={20} color="#0469ff" />
                                )}
                            </View>
                        </HapticTouchable>

                        {classes.map((cls) => (
                            <HapticTouchable
                                key={cls.id}
                                onPress={() => {
                                    setSelectedClass(cls.id.toString());
                                    setFilterModalVisible(false);
                                }}
                            >
                                <View style={[
                                    styles.filterOption,
                                    selectedClass === cls.id.toString() && styles.filterOptionActive
                                ]}>
                                    <Text style={[
                                        styles.filterOptionText,
                                        selectedClass === cls.id.toString() && styles.filterOptionTextActive
                                    ]}>
                                        {cls.className}
                                    </Text>
                                    {selectedClass === cls.id.toString() && (
                                        <CheckCircle2 size={20} color="#0469ff" />
                                    )}
                                </View>
                            </HapticTouchable>
                        ))}
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            {/* Header - UNCHANGED */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Syllabus</Text>
                    <Text style={styles.headerSubtitle}>View class syllabi</Text>
                </View>
                <HapticTouchable onPress={() => setFilterModalVisible(true)}>
                    <View style={styles.filterButton}>
                        <Filter size={20} color="#0469ff" />
                        {selectedClass && <View style={styles.filterBadge} />}
                    </View>
                </HapticTouchable>
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
                {/* Academic Year Info - UNCHANGED */}
                {stats.academicYear && (
                    <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                        <View style={styles.infoCard}>
                            <View style={styles.infoIcon}>
                                <Calendar size={20} color="#0469ff" />
                            </View>
                            <View style={styles.infoContent}>
                                <Text style={styles.infoLabel}>Academic Year</Text>
                                <Text style={styles.infoValue}>{stats.academicYear}</Text>
                            </View>
                        </View>
                    </Animated.View>
                )}

                {/* Filter Info - UNCHANGED */}
                {selectedClass && (
                    <Animated.View entering={FadeInDown.delay(350).duration(500)}>
                        <View style={styles.filterInfo}>
                            <Text style={styles.filterInfoText}>
                                Showing: {classes.find(c => c.id.toString() === selectedClass)?.className}
                            </Text>
                            <HapticTouchable onPress={() => setSelectedClass('')}>
                                <Text style={styles.clearFilter}>Clear</Text>
                            </HapticTouchable>
                        </View>
                    </Animated.View>
                )}

                {/* Syllabi List - MINIMAL CHANGE: Added more icon */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        Available Syllabi ({syllabi.length})
                    </Text>

                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : syllabi.length > 0 ? (
                        syllabi.map((syllabus, index) => (
                            <Animated.View
                                key={syllabus.id}
                                entering={FadeInRight.delay(400 + index * 80).duration(500)}
                            >
                                <View style={styles.syllabusCard}>
                                    <HapticTouchable
                                        onPress={() => handleViewSyllabus(syllabus.fileUrl)}
                                        style={styles.syllabusMainContent}
                                    >
                                        <View style={styles.syllabusIcon}>
                                            <FileText size={24} color="#0469ff" />
                                        </View>

                                        <View style={styles.syllabusContent}>
                                            <View style={{ flexDirection: 'row', gap: 5, }}>
                                                <Text style={styles.syllabusClass}>
                                                    {syllabus.Class?.className || 'N/A'}
                                                </Text>

                                                {syllabus.Class?.sections?.length > 0 && (
                                                    <View style={styles.sectionsContainer}>
                                                        {syllabus.Class.sections.map((section) => (
                                                            <View key={section.id} style={styles.sectionBadge}>
                                                                <Text style={styles.sectionText}>
                                                                    {section.name}
                                                                </Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>
                                            <Text
                                                numberOfLines={1}
                                                ellipsizeMode="tail"
                                                style={styles.syllabusFileName}>
                                                {syllabus?.filename || 'N/A'}
                                            </Text>

                                            <View style={styles.syllabusMetaRow}>
                                                <View style={styles.metaItem}>
                                                    <Calendar size={12} color="#666" />
                                                    <Text style={styles.metaText}>
                                                        {new Date(syllabus.uploadedAt).toLocaleDateString('en-US', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            year: 'numeric'
                                                        })}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    </HapticTouchable>

                                    {/* NEW: More Options Button */}
                                    <HapticTouchable
                                        onPress={() => openActionModal(syllabus)}
                                        style={styles.syllabusAction}
                                    >
                                        <View style={styles.viewButton}>
                                            <MoreVertical size={18} color="#0469ff" />
                                        </View>
                                    </HapticTouchable>
                                </View>
                            </Animated.View>
                        ))
                    ) : (
                        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                            <View style={styles.emptyState}>
                                <AlertCircle size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Syllabi Found</Text>
                                <Text style={styles.emptySubtitle}>
                                    {selectedClass
                                        ? 'No syllabus available for this class'
                                        : 'Syllabi will appear here once uploaded'
                                    }
                                </Text>
                            </View>
                        </Animated.View>
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            <FilterModal />
            <ActionModal />
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
        paddingBottom: 16,
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
    filterButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    filterBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#0469ff',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
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
    content: {
        flex: 1,
        padding: 16,
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 16,
        gap: 12,
    },
    infoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoContent: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 12,
        color: '#666',
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    filterInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 12,
        backgroundColor: '#E3F2FD',
        borderRadius: 8,
        marginBottom: 16,
    },
    filterInfoText: {
        fontSize: 14,
        color: '#0469ff',
        fontWeight: '600',
    },
    clearFilter: {
        fontSize: 14,
        color: '#0469ff',
        fontWeight: '600',
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
        marginBottom: 12,
    },
    syllabusCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 10,
        gap: 12,
    },
    syllabusMainContent: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    syllabusIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    syllabusContent: {
        flex: 1,
    },
    syllabusClass: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111',
        marginBottom: 6,
    },
    syllabusFileName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
        marginBottom: 6,
        maxWidth: '90%',
    },
    sectionsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginBottom: 6,
    },
    sectionBadge: {
        backgroundColor: '#fff',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    sectionText: {
        fontSize: 11,
        color: '#666',
        fontWeight: '600',
    },
    syllabusMetaRow: {
        flexDirection: 'row',
        gap: 12,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 12,
        color: '#666',
    },
    syllabusAction: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    // Filter Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    modalCloseButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalScroll: {
        padding: 20,
    },
    filterOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 8,
    },
    filterOptionActive: {
        backgroundColor: '#E3F2FD',
        borderWidth: 1,
        borderColor: '#0469ff',
    },
    filterOptionText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    filterOptionTextActive: {
        color: '#0469ff',
    },
    // NEW: Action Modal Styles
    actionModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
        padding: 16,
    },
    actionModalContent: {
        backgroundColor: '#fff',
        borderRadius: 16,
        paddingBottom: 16,
    },
    actionModalHeader: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    actionModalTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 4,
    },
    actionModalSubtitle: {
        fontSize: 13,
        color: '#666',
    },
    actionModalButtons: {
        padding: 16,
        gap: 8,
    },
    actionModalButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        gap: 12,
    },
    actionModalIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionModalButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    actionModalCancel: {
        marginHorizontal: 16,
        padding: 16,
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        alignItems: 'center',
    },
    actionModalCancelText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#666',
    },
});