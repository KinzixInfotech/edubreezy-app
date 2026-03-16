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
import {
    ArrowLeft,
    FileText,
    Award,
    IdCard,
    Eye,
    Share2,
    Calendar,
    User,
    AlertCircle,
} from 'lucide-react-native';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ParentDocumentsScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();

    const childData = params.childData ? JSON.parse(params.childData) : null;
    const [selectedChildId, setSelectedChildId] = useState(childData?.studentId || childData?.id || null);

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const parentId = userData?.id;

    const {
        data: documentsData,
        isLoading,
        refetch,
        isRefetching
    } = useQuery({
        queryKey: ['parent-documents', schoolId, parentId, selectedChildId],
        queryFn: async () => {
            if (!schoolId || !parentId) return { documents: [], stats: {} };
            const url = `/schools/${schoolId}/parents/${parentId}/documents${selectedChildId ? `?studentId=${selectedChildId}` : ''}`;
            const res = await api.get(url);
            return res.data;
        },
        enabled: !!schoolId && !!parentId,
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
            case 'certificate': return '#8B5CF6';
            case 'idcard': return '#10B981';
            case 'admitcard': return '#F59E0B';
            default: return '#6B7280';
        }
    };

    const getDocBgColor = (type) => {
        switch (type) {
            case 'certificate': return '#F3E8FF';
            case 'idcard': return '#D1FAE5';
            case 'admitcard': return '#FEF3C7';
            default: return '#F3F4F6';
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
            <SafeAreaView style={styles.container}>
                <View style={styles.centered}>
                    <AlertCircle size={48} color="#999" />
                    <Text style={styles.emptyText}>Unable to load documents</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />

            {/* Header — consistent with other screens */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Documents</Text>
                    <Text style={styles.headerSubtitle}>Certificates, ID Cards & Admit Cards</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {/* Stats row */}
            <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.statsRow}>
                <View style={[styles.statBadge, { backgroundColor: '#F3E8FF' }]}>
                    <Award size={14} color="#8B5CF6" />
                    <Text style={[styles.statText, { color: '#8B5CF6' }]}>
                        {stats.certificates || 0} Certificates
                    </Text>
                </View>
                <View style={[styles.statBadge, { backgroundColor: '#D1FAE5' }]}>
                    <IdCard size={14} color="#10B981" />
                    <Text style={[styles.statText, { color: '#10B981' }]}>
                        {stats.idCards || 0} ID Cards
                    </Text>
                </View>
                <View style={[styles.statBadge, { backgroundColor: '#FEF3C7' }]}>
                    <FileText size={14} color="#F59E0B" />
                    <Text style={[styles.statText, { color: '#F59E0B' }]}>
                        {stats.admitCards || 0} Admit Cards
                    </Text>
                </View>
            </Animated.View>

            {/* Child filter chips */}
            {documentsData?.children?.length > 0 && (
                <View style={styles.filterContainer}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.filterContent}
                    >
                        <TouchableOpacity
                            style={[styles.filterChip, !selectedChildId && styles.filterChipActive]}
                            onPress={() => setSelectedChildId(null)}
                        >
                            <Text style={[styles.filterText, !selectedChildId && styles.filterTextActive]}>
                                All Children
                            </Text>
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

            {/* Documents list */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 24 }
                ]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefetching}
                        onRefresh={refetch}
                        tintColor="#0469ff"
                    />
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
                        <Text style={styles.emptySubtitle}>
                            Documents shared by school will appear here
                        </Text>
                    </Animated.View>
                ) : (
                    documents.map((doc, index) => {
                        const DocIcon = getDocIcon(doc.type);
                        const color = getDocColor(doc.type);
                        const bgColor = getDocBgColor(doc.type);

                        return (
                            <Animated.View
                                key={doc.id}
                                entering={FadeInDown.delay(index * 80).duration(500)}
                            >
                                <View style={styles.docCard}>
                                    <View style={[styles.docIconBg, { backgroundColor: bgColor }]}>
                                        <DocIcon size={22} color={color} />
                                    </View>

                                    <View style={styles.docInfo}>
                                        <Text style={styles.docTitle} numberOfLines={1}>
                                            {doc.title}
                                        </Text>
                                        <View style={styles.docMeta}>
                                            <User size={12} color="#888" />
                                            <Text style={styles.docMetaText}>{doc.studentName}</Text>
                                            <Text style={styles.docDot}>•</Text>
                                            <Text style={styles.docMetaText}>{doc.className}</Text>
                                        </View>
                                        <View style={styles.docMeta}>
                                            <Calendar size={12} color="#888" />
                                            <Text style={styles.docMetaText}>
                                                {formatDate(doc.sharedAt || doc.issueDate)}
                                            </Text>
                                        </View>
                                        <View style={[styles.docTypeBadge, { backgroundColor: bgColor }]}>
                                            <Text style={[styles.docTypeText, { color }]}>
                                                {getDocLabel(doc.type)}
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={styles.docActions}>
                                        <HapticTouchable onPress={() => handleView(doc)}>
                                            <View style={styles.actionBtn}>
                                                <Eye size={18} color="#0469ff" />
                                            </View>
                                        </HapticTouchable>
                                        <HapticTouchable onPress={() => handleShare(doc)}>
                                            <View style={styles.actionBtn}>
                                                <Share2 size={18} color="#10B981" />
                                            </View>
                                        </HapticTouchable>
                                    </View>
                                </View>
                            </Animated.View>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    // Header — matches all other screens
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
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
    // Stats
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
    // Filter chips
    filterContainer: {
        marginBottom: 8,
    },
    filterContent: {
        paddingHorizontal: 16,
        gap: 8,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
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
    // Scroll
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
    },
    // States
    centered: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    loadingText: {
        marginTop: 12,
        color: '#666',
        fontSize: 14,
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
    emptySubtitle: {
        fontSize: 14,
        color: '#888',
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 32,
    },
    emptyText: {
        fontSize: 14,
        color: '#888',
        marginTop: 8,
        textAlign: 'center',
    },
    // Doc card
    docCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
    },
    docIconBg: {
        width: 48,
        height: 48,
        borderRadius: 24,
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
        color: '#111',
        marginBottom: 4,
    },
    docMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 2,
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
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        marginTop: 6,
    },
    docTypeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    docActions: {
        flexDirection: 'row',
        gap: 8,
        marginLeft: 8,
    },
    actionBtn: {
        width: 36,
        height: 36,
        backgroundColor: '#fff',
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
});