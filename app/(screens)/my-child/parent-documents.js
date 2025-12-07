import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    TouchableOpacity,
    Linking,
    Share,
    Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ArrowLeft,
    FileText,
    Award,
    IdCard,
    Download,
    Eye,
    Share2,
    Calendar,
    User,
    Clock,
    AlertCircle,
} from 'lucide-react-native';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';


export default function ParentDocumentsScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();

    const childData = params.childData ? JSON.parse(params.childData) : null;
    const [selectedChildId, setSelectedChildId] = useState(childData?.studentId || childData?.id || null);

    // Get user data
    const { data: userData } = useQuery({
        queryKey: ['user-data'], // Changed key to match parent-homework
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const parentId = userData?.id;

    useEffect(() => {
        console.warn('🔍 ParentDocuments Debug:', {
            hasUserData: !!userData,
            schoolId,
            parentId,
            token: SecureStore.getItem('token') ? 'Present' : 'Missing'
        });
    }, [userData, schoolId, parentId]);

    // Fetch documents for parent
    const {
        data: documentsData,
        isLoading,
        refetch,
        isRefetching
    } = useQuery({
        queryKey: ['parent-documents', schoolId, parentId, selectedChildId],
        queryFn: async () => {
            console.warn('🚀 Fetching documents...', { schoolId, parentId, selectedChildId });
            if (!schoolId || !parentId) {
                console.warn('❌ Missing credentials for documents fetch');
                return { documents: [], stats: {} };
            }
            try {
                const url = `/schools/${schoolId}/parents/${parentId}/documents${selectedChildId ? `?studentId=${selectedChildId}` : ''}`;
                const res = await api.get(url);
                console.warn('✅ Documents fetched:', res.data?.documents?.length);
                return res.data;
            } catch (err) {
                console.error('❌ Documents fetch failed:', err);
                throw err;
            }
        },
        staleTime: 1000 * 60 * 2,
    });

    const allDocuments = documentsData?.documents || [];
    const documents = selectedChildId
        ? allDocuments.filter(doc => doc.studentId === selectedChildId)
        : allDocuments;
    const stats = documentsData?.stats || {};

    const getDocIcon = (type) => {
        switch (type) {
            case 'certificate': return Award;
            case 'idcard': return IdCard;
            case 'admitcard': return FileText;
            default: return FileText;
        }
    };

    const getDocColor = (type) => {
        switch (type) {
            case 'certificate': return ['#8B5CF6', '#7C3AED'];
            case 'idcard': return ['#10B981', '#059669'];
            case 'admitcard': return ['#F59E0B', '#D97706'];
            default: return ['#6B7280', '#4B5563'];
        }
    };

    const getDocLabel = (type) => {
        switch (type) {
            case 'certificate': return 'Certificate';
            case 'idcard': return 'ID Card';
            case 'admitcard': return 'Admit Card';
            default: return 'Document';
        }
    };

    const handleView = (doc) => {
        if (doc.fileUrl) {
            Linking.openURL(doc.fileUrl).catch(() => {
                Alert.alert('Error', 'Unable to open document');
            });
        } else {
            Alert.alert('Not Available', 'Document file is not available');
        }
    };

    const handleShare = async (doc) => {
        try {
            await Share.share({
                message: `${doc.title} for ${doc.studentName}\n${doc.fileUrl || 'Document link not available'}`,
                title: doc.title,
            });
        } catch (error) {
            console.error('Share error:', error);
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    if (!childData && !parentId) {
        return (
            <View style={styles.centered}>
                <AlertCircle size={48} color="#999" />
                <Text style={styles.emptyText}>Unable to load documents</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <LinearGradient colors={['#0469ff', '#0347b8']} style={styles.header}>
                <View style={styles.headerContent}>
                    <HapticTouchable onPress={() => router.back()} style={styles.backBtn}>
                        <ArrowLeft size={24} color="#fff" />
                    </HapticTouchable>
                    <View style={styles.headerText}>
                        <Text style={styles.headerTitle}>Documents</Text>
                        <Text style={styles.headerSubtitle}>
                            Certificates, ID Cards & Admit Cards
                        </Text>
                    </View>
                </View>
            </LinearGradient>

            {/* Stats */}
            <Animated.View entering={FadeInDown.delay(100)} style={styles.statsRow}>
                <View style={[styles.statBadge, { backgroundColor: '#F3E8FF' }]}>
                    <Award size={16} color="#8B5CF6" />
                    <Text style={[styles.statText, { color: '#8B5CF6' }]}>
                        {stats.certificates || 0} Certificates
                    </Text>
                </View>
                <View style={[styles.statBadge, { backgroundColor: '#D1FAE5' }]}>
                    <IdCard size={16} color="#10B981" />
                    <Text style={[styles.statText, { color: '#10B981' }]}>
                        {stats.idCards || 0} ID Cards
                    </Text>
                </View>
                <View style={[styles.statBadge, { backgroundColor: '#FEF3C7' }]}>
                    <FileText size={16} color="#F59E0B" />
                    <Text style={[styles.statText, { color: '#F59E0B' }]}>
                        {stats.admitCards || 0} Admit Cards
                    </Text>
                </View>
            </Animated.View>

            {/* Child Filter */}
            {documentsData?.children?.length > 0 && (
                <View style={styles.filterContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterContent}>
                        <TouchableOpacity
                            style={[styles.filterChip, !selectedChildId && styles.filterChipActive]}
                            onPress={() => setSelectedChildId(null)}
                        >
                            <Text style={[styles.filterText, !selectedChildId && styles.filterTextActive]}>All Children</Text>
                        </TouchableOpacity>
                        {documentsData.children.map(child => (
                            <TouchableOpacity
                                key={child.studentId}
                                style={[styles.filterChip, selectedChildId === child.studentId && styles.filterChipActive]}
                                onPress={() => setSelectedChildId(child.studentId)}
                            >
                                <Text style={[styles.filterText, selectedChildId === child.studentId && styles.filterTextActive]}>
                                    {child.name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Documents List */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
                }
            >
                {isLoading ? (
                    <View style={styles.centered}>
                        <ActivityIndicator size="large" color="#0469ff" />
                        <Text style={styles.loadingText}>Loading documents...</Text>
                    </View>
                ) : documents.length === 0 ? (
                    <Animated.View entering={FadeInUp} style={styles.emptyContainer}>
                        <FileText size={64} color="#ddd" />
                        <Text style={styles.emptyTitle}>No Documents Yet</Text>
                        <Text style={styles.emptyText}>
                            Documents shared by school will appear here
                        </Text>
                    </Animated.View>
                ) : (
                    documents.map((doc, index) => {
                        const DocIcon = getDocIcon(doc.type);
                        const colors = getDocColor(doc.type);

                        return (
                            <Animated.View
                                key={doc.id}
                                entering={FadeInDown.delay(index * 80)}
                            >
                                <View style={styles.docCard}>
                                    <LinearGradient
                                        colors={colors}
                                        style={styles.docIconBg}
                                    >
                                        <DocIcon size={24} color="#fff" />
                                    </LinearGradient>

                                    <View style={styles.docInfo}>
                                        <Text style={styles.docTitle} numberOfLines={1}>
                                            {doc.title}
                                        </Text>
                                        <View style={styles.docMeta}>
                                            <User size={12} color="#888" />
                                            <Text style={styles.docMetaText}>
                                                {doc.studentName}
                                            </Text>
                                            <Text style={styles.docDot}>•</Text>
                                            <Text style={styles.docMetaText}>
                                                {doc.className}
                                            </Text>
                                        </View>
                                        <View style={styles.docMeta}>
                                            <Calendar size={12} color="#888" />
                                            <Text style={styles.docMetaText}>
                                                {formatDate(doc.sharedAt || doc.issueDate)}
                                            </Text>
                                        </View>
                                        <View style={styles.docTypeBadge}>
                                            <Text style={[styles.docTypeText, { color: colors[0] }]}>
                                                {getDocLabel(doc.type)}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.docActions}>
                                        <HapticTouchable
                                            style={styles.actionBtn}
                                            onPress={() => handleView(doc)}
                                        >
                                            <Eye size={18} color="#0469ff" />
                                        </HapticTouchable>
                                        <HapticTouchable
                                            style={styles.actionBtn}
                                            onPress={() => handleShare(doc)}
                                        >
                                            <Share2 size={18} color="#10B981" />
                                        </HapticTouchable>
                                    </View>
                                </View>
                            </Animated.View>
                        );
                    })
                )}
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
        paddingTop: 50,
        paddingBottom: 20,
        paddingHorizontal: 16,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerText: {
        marginLeft: 12,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#fff',
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
        flexWrap: 'wrap',
    },
    statBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 20,
    },
    statText: {
        fontSize: 12,
        fontWeight: '600',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 100,
    },
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    loadingText: {
        marginTop: 12,
        color: '#666',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginTop: 16,
    },
    emptyText: {
        fontSize: 14,
        color: '#888',
        marginTop: 8,
        textAlign: 'center',
    },
    docCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    docIconBg: {
        width: 50,
        height: 50,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    docInfo: {
        flex: 1,
        marginLeft: 12,
    },
    docTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1a1a1a',
    },
    docMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    docMetaText: {
        fontSize: 12,
        color: '#888',
    },
    docDot: {
        color: '#ccc',
        marginHorizontal: 2,
    },
    docTypeBadge: {
        marginTop: 6,
    },
    docTypeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    docActions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionBtn: {
        width: 36,
        height: 36,
        backgroundColor: '#f0f0f0',
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    filterContainer: {
        marginBottom: 10,
    },
    filterContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    filterChipActive: {
        backgroundColor: '#0469ff',
        borderColor: '#0469ff',
    },
    filterText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },
    filterTextActive: {
        color: '#fff',
    },
});
