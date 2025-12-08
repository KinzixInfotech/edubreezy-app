// app/(screens)/student/certificates.js
// Student Certificates Screen - Shows documents and certificates with view/download
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Modal,
    Image,
    Alert,
    Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    FileText,
    Download,
    Award,
    CreditCard,
    AlertCircle,
    Eye,
    X,
    Share2,
    Calendar,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DOC_TYPE_CONFIG = {
    CERTIFICATE: { label: 'Certificate', icon: Award, color: '#F59E0B', bg: '#FEF3C7' },
    ADMIT_CARD: { label: 'Admit Card', icon: CreditCard, color: '#0469ff', bg: '#DBEAFE' },
    ID_CARD: { label: 'ID Card', icon: CreditCard, color: '#10B981', bg: '#D1FAE5' },
    OTHER: { label: 'Document', icon: FileText, color: '#6B7280', bg: '#F3F4F6' },
};

export default function StudentCertificatesScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [downloading, setDownloading] = useState(false);

    // Load user data
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const studentId = userData?.studentData?.userId || userData?.studentdatafull?.userId || userData?.id;

    // Fetch certificates and documents
    const { data: docsData, isLoading, refetch } = useQuery({
        queryKey: ['student-documents', schoolId, studentId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/students/${studentId}/documents`);
            return res.data;
        },
        enabled: !!schoolId && !!studentId,
        staleTime: 1000 * 60 * 5,
    });

    const documents = docsData?.documents || [];

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const viewDocument = async (doc) => {
        // Priority: pdfUrl > fileUrl > webViewUrl (for web dashboard)
        const url = doc.pdfUrl || doc.fileUrl;
        if (url) {
            try {
                await WebBrowser.openBrowserAsync(url);
            } catch (error) {
                console.error('Failed to open document:', error);
                Alert.alert('Error', 'Failed to open document');
            }
        } else if (doc.webViewUrl) {
            // Open web dashboard view for documents without direct PDF
            try {
                // Replace with your actual web domain
                const webUrl = `https://edubreezy.com${doc.webViewUrl}`;
                await WebBrowser.openBrowserAsync(webUrl);
            } catch (error) {
                console.error('Failed to open web view:', error);
                Alert.alert('Error', 'Failed to open document preview');
            }
        } else {
            Alert.alert('Not Available', 'This document is not available for viewing yet. Please contact your school administrator.');
        }
    };

    const downloadDocument = async (doc) => {
        const url = doc.pdfUrl || doc.fileUrl;
        if (!url) {
            Alert.alert('Error', 'Document URL not available');
            return;
        }

        setDownloading(true);
        try {
            const filename = `${doc.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'document'}_${Date.now()}.pdf`;
            const fileUri = FileSystem.documentDirectory + filename;

            const downloadResult = await FileSystem.downloadAsync(url, fileUri);

            if (downloadResult.status === 200) {
                const canShare = await Sharing.isAvailableAsync();
                if (canShare) {
                    await Sharing.shareAsync(downloadResult.uri, {
                        mimeType: 'application/pdf',
                        dialogTitle: doc.title || 'Document',
                    });
                } else {
                    Alert.alert('Success', `Document saved to ${filename}`);
                }
            } else {
                throw new Error('Download failed');
            }
        } catch (error) {
            console.error('Download error:', error);
            Alert.alert('Error', 'Failed to download document');
        } finally {
            setDownloading(false);
        }
    };

    const openDocDetails = (doc) => {
        setSelectedDoc(doc);
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>My Documents</Text>
                    <Text style={styles.headerSubtitle}>Certificates & Cards</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {isLoading ? (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color="#0469ff" />
                </View>
            ) : (
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
                >
                    {/* Stats Row */}
                    <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
                            <Award size={24} color="#F59E0B" />
                            <Text style={[styles.statValue, { color: '#F59E0B' }]}>
                                {documents.filter(d => d.docType === 'CERTIFICATE').length}
                            </Text>
                            <Text style={styles.statLabel}>Certificates</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#DBEAFE' }]}>
                            <CreditCard size={24} color="#0469ff" />
                            <Text style={[styles.statValue, { color: '#0469ff' }]}>
                                {documents.filter(d => d.docType === 'ADMIT_CARD').length}
                            </Text>
                            <Text style={styles.statLabel}>Admit Cards</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
                            <CreditCard size={24} color="#10B981" />
                            <Text style={[styles.statValue, { color: '#10B981' }]}>
                                {documents.filter(d => d.docType === 'ID_CARD').length}
                            </Text>
                            <Text style={styles.statLabel}>ID Cards</Text>
                        </View>
                    </Animated.View>

                    {/* Documents List */}
                    <Text style={styles.sectionTitle}>All Documents</Text>

                    {documents.length > 0 ? (
                        documents.map((doc, index) => {
                            const config = DOC_TYPE_CONFIG[doc.docType] || DOC_TYPE_CONFIG.OTHER;
                            const DocIcon = config.icon;
                            const hasUrl = doc.pdfUrl || doc.fileUrl;

                            return (
                                <Animated.View
                                    key={doc.id || index}
                                    entering={FadeInRight.delay(index * 80).duration(400)}
                                >
                                    <HapticTouchable onPress={() => openDocDetails(doc)}>
                                        <View style={styles.docCard}>
                                            <View style={[styles.docIcon, { backgroundColor: config.bg }]}>
                                                <DocIcon size={24} color={config.color} />
                                            </View>
                                            <View style={styles.docInfo}>
                                                <Text style={styles.docTitle} numberOfLines={2}>
                                                    {doc.title || config.label}
                                                </Text>
                                                <Text style={[styles.docType, { color: config.color }]}>{config.label}</Text>
                                                {doc.createdAt && (
                                                    <Text style={styles.docDate}>
                                                        {formatDate(doc.createdAt)}
                                                    </Text>
                                                )}
                                            </View>
                                            <View style={styles.actionButtons}>
                                                {hasUrl && (
                                                    <>
                                                        <HapticTouchable onPress={() => viewDocument(doc)}>
                                                            <View style={styles.actionBtn}>
                                                                <Eye size={18} color="#0469ff" />
                                                            </View>
                                                        </HapticTouchable>
                                                        <HapticTouchable onPress={() => downloadDocument(doc)}>
                                                            <View style={[styles.actionBtn, { backgroundColor: '#D1FAE5' }]}>
                                                                <Download size={18} color="#10B981" />
                                                            </View>
                                                        </HapticTouchable>
                                                    </>
                                                )}
                                            </View>
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <View style={styles.emptyState}>
                            <AlertCircle size={48} color="#ccc" />
                            <Text style={styles.emptyTitle}>No Documents</Text>
                            <Text style={styles.emptySubtitle}>
                                Your certificates and documents will appear here
                            </Text>
                        </View>
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}

            {/* Document Details Modal */}
            <Modal
                visible={!!selectedDoc}
                transparent
                animationType="slide"
                onRequestClose={() => setSelectedDoc(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Document Details</Text>
                            <HapticTouchable onPress={() => setSelectedDoc(null)}>
                                <View style={styles.closeBtn}>
                                    <X size={20} color="#666" />
                                </View>
                            </HapticTouchable>
                        </View>

                        {selectedDoc && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {/* Doc Type Banner */}
                                <View style={[styles.docBanner, { backgroundColor: DOC_TYPE_CONFIG[selectedDoc.docType]?.bg || '#F3F4F6' }]}>
                                    {React.createElement(DOC_TYPE_CONFIG[selectedDoc.docType]?.icon || FileText, {
                                        size: 48,
                                        color: DOC_TYPE_CONFIG[selectedDoc.docType]?.color || '#666'
                                    })}
                                    <Text style={[styles.docBannerTitle, { color: DOC_TYPE_CONFIG[selectedDoc.docType]?.color || '#666' }]}>
                                        {DOC_TYPE_CONFIG[selectedDoc.docType]?.label || 'Document'}
                                    </Text>
                                </View>

                                {/* Doc Info */}
                                <Text style={styles.modalDocTitle}>{selectedDoc.title}</Text>

                                <View style={styles.detailsGrid}>
                                    {selectedDoc.createdAt && (
                                        <View style={styles.detailItem}>
                                            <Calendar size={16} color="#666" />
                                            <Text style={styles.detailLabel}>Date</Text>
                                            <Text style={styles.detailValue}>{formatDate(selectedDoc.createdAt)}</Text>
                                        </View>
                                    )}
                                    {selectedDoc.examTitle && (
                                        <View style={styles.detailItem}>
                                            <FileText size={16} color="#666" />
                                            <Text style={styles.detailLabel}>Exam</Text>
                                            <Text style={styles.detailValue}>{selectedDoc.examTitle}</Text>
                                        </View>
                                    )}
                                    {selectedDoc.seatNumber && (
                                        <View style={styles.detailItem}>
                                            <CreditCard size={16} color="#666" />
                                            <Text style={styles.detailLabel}>Seat No.</Text>
                                            <Text style={styles.detailValue}>{selectedDoc.seatNumber}</Text>
                                        </View>
                                    )}
                                    {selectedDoc.certificateNumber && (
                                        <View style={styles.detailItem}>
                                            <Award size={16} color="#666" />
                                            <Text style={styles.detailLabel}>Certificate No.</Text>
                                            <Text style={styles.detailValue}>{selectedDoc.certificateNumber}</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Action Buttons - show if any view option available */}
                                {(selectedDoc.pdfUrl || selectedDoc.fileUrl || selectedDoc.webViewUrl) && (
                                    <View style={styles.modalActions}>
                                        <HapticTouchable onPress={() => viewDocument(selectedDoc)} style={{ flex: 1 }}>
                                            <View style={styles.primaryBtn}>
                                                <Eye size={20} color="#fff" />
                                                <Text style={styles.primaryBtnText}>View Document</Text>
                                            </View>
                                        </HapticTouchable>
                                        {(selectedDoc.pdfUrl || selectedDoc.fileUrl) && (
                                            <HapticTouchable onPress={() => downloadDocument(selectedDoc)}>
                                                <View style={styles.secondaryBtn}>
                                                    {downloading ? (
                                                        <ActivityIndicator size="small" color="#10B981" />
                                                    ) : (
                                                        <Download size={20} color="#10B981" />
                                                    )}
                                                </View>
                                            </HapticTouchable>
                                        )}
                                    </View>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
    content: { flex: 1, padding: 16 },

    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    statCard: { flex: 1, alignItems: 'center', padding: 16, borderRadius: 12, gap: 6 },
    statValue: { fontSize: 24, fontWeight: '700' },
    statLabel: { fontSize: 10, color: '#666' },

    sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 12 },

    docCard: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderRadius: 12, padding: 12, marginBottom: 10, alignItems: 'center' },
    docIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    docInfo: { flex: 1 },
    docTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 2 },
    docType: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
    docDate: { fontSize: 11, color: '#999' },
    actionButtons: { flexDirection: 'row', gap: 8 },
    actionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },

    emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '80%', padding: 20, paddingBottom: 40 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },

    docBanner: { alignItems: 'center', justifyContent: 'center', padding: 24, borderRadius: 16, marginBottom: 16, gap: 8 },
    docBannerTitle: { fontSize: 16, fontWeight: '700' },
    modalDocTitle: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 20 },

    detailsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
    detailItem: { flex: 1, minWidth: '45%', backgroundColor: '#f8f9fa', padding: 12, borderRadius: 12, alignItems: 'center', gap: 4 },
    detailLabel: { fontSize: 11, color: '#666' },
    detailValue: { fontSize: 14, fontWeight: '600', color: '#111', textAlign: 'center' },

    modalActions: { flexDirection: 'row', gap: 12 },
    primaryBtn: { flex: 1, flexDirection: 'row', backgroundColor: '#0469ff', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
    primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    secondaryBtn: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
});
