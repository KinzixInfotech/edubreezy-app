// app/(screens)/my-child/parent-homework.js
// Parent view of child's homework assignments
import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Linking,
    Alert,
    Modal,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    BookOpen,
    Calendar,
    ArrowLeft,
    FileText,
    AlertCircle,
    Clock,
    CheckCircle2,
    AlertTriangle,
    X,
    Filter,
    User,
} from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

const HOMEWORK_LAST_VIEWED_KEY = 'homework_last_viewed';

export default function ParentHomeworkScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [statusFilter, setStatusFilter] = useState('all'); // all, pending, overdue, submitted

    // Parse child data from params
    const childData = params.childData ? JSON.parse(params.childData) : null;

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const childId = childData?.studentId || childData?.id;

    // Fetch homework for child
    const { data: homeworkData, isLoading } = useQuery({
        queryKey: ['parent-homework', schoolId, childId],
        queryFn: async () => {
            if (!schoolId || !childId) return { homework: [], total: 0 };

            const res = await api.get(`/schools/homework?schoolId=${schoolId}&studentId=${childId}`);
            return res.data;
        },
        enabled: !!schoolId && !!childId,
        staleTime: 1000 * 60 * 2,
    });

    const homework = homeworkData?.homework || [];

    // Mark homework as viewed when screen is focused (clears badge on home screen)
    useFocusEffect(
        useCallback(() => {
            const markAsViewed = async () => {
                if (childId) {
                    // Save timestamp per child
                    const key = `${HOMEWORK_LAST_VIEWED_KEY}_${childId}`;
                    await SecureStore.setItemAsync(key, new Date().toISOString());
                    // No query invalidation needed - home uses useFocusEffect to refresh timestamps
                }
            };
            markAsViewed();
        }, [childId])
    );

    // Filter homework
    const filteredHomework = homework.filter(hw => {
        const now = new Date();
        const dueDate = new Date(hw.dueDate);
        const isOverdue = dueDate < now;
        const submission = hw.mySubmission;

        if (statusFilter === 'pending') {
            return !submission || submission.status === 'PENDING';
        }
        if (statusFilter === 'overdue') {
            return isOverdue && (!submission || submission.status === 'PENDING');
        }
        if (statusFilter === 'submitted') {
            return submission && (submission.status === 'SUBMITTED' || submission.status === 'EVALUATED');
        }
        return true; // all
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['parent-homework']);
        setRefreshing(false);
    }, [queryClient]);

    const handleViewAttachment = async (fileUrl) => {
        try {
            const supported = await Linking.canOpenURL(fileUrl);
            if (supported) {
                await Linking.openURL(fileUrl);
            } else {
                Alert.alert("Error", "Cannot open this file");
            }
        } catch (error) {
            console.error('Error opening file:', error);
            Alert.alert("Error", "Failed to open file");
        }
    };

    const getStatusInfo = (hw) => {
        const now = new Date();
        const dueDate = new Date(hw.dueDate);
        const isOverdue = dueDate < now;
        const submission = hw.mySubmission;

        if (submission?.status === 'EVALUATED') {
            return {
                label: 'Evaluated',
                color: '#10B981',
                bgColor: '#D1FAE5',
                icon: CheckCircle2
            };
        }
        if (submission?.status === 'SUBMITTED') {
            return {
                label: 'Submitted',
                color: '#3B82F6',
                bgColor: '#DBEAFE',
                icon: CheckCircle2
            };
        }
        if (isOverdue) {
            return {
                label: 'Overdue',
                color: '#EF4444',
                bgColor: '#FEE2E2',
                icon: AlertTriangle
            };
        }
        return {
            label: 'Pending',
            color: '#F59E0B',
            bgColor: '#FEF3C7',
            icon: Clock
        };
    };

    const getDaysLeft = (dueDate) => {
        const days = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        if (days < 0) return `${Math.abs(days)} days overdue`;
        if (days === 0) return 'Due today';
        if (days === 1) return 'Due tomorrow';
        return `${days} days left`;
    };

    // Stats
    const stats = {
        total: homework.length,
        pending: homework.filter(hw => !hw.mySubmission || hw.mySubmission.status === 'PENDING').length,
        overdue: homework.filter(hw => {
            const isOverdue = new Date(hw.dueDate) < new Date();
            const submission = hw.mySubmission;
            return isOverdue && (!submission || submission.status === 'PENDING');
        }).length,
        submitted: homework.filter(hw => hw.mySubmission?.status === 'SUBMITTED' || hw.mySubmission?.status === 'EVALUATED').length,
    };

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
                        <Text style={styles.modalTitle}>Filter Homework</Text>
                        <HapticTouchable onPress={() => setFilterModalVisible(false)}>
                            <View style={styles.modalCloseButton}>
                                <X size={20} color="#666" />
                            </View>
                        </HapticTouchable>
                    </View>

                    <View style={styles.filterOptions}>
                        {[
                            { id: 'all', label: 'All Homework', count: stats.total },
                            { id: 'pending', label: 'Pending', count: stats.pending },
                            { id: 'overdue', label: 'Overdue', count: stats.overdue },
                            { id: 'submitted', label: 'Submitted', count: stats.submitted },
                        ].map((filter) => (
                            <HapticTouchable
                                key={filter.id}
                                onPress={() => {
                                    setStatusFilter(filter.id);
                                    setFilterModalVisible(false);
                                }}
                            >
                                <View style={[
                                    styles.filterOption,
                                    statusFilter === filter.id && styles.filterOptionActive
                                ]}>
                                    <View style={styles.filterOptionLeft}>
                                        <Text style={[
                                            styles.filterOptionText,
                                            statusFilter === filter.id && styles.filterOptionTextActive
                                        ]}>
                                            {filter.label}
                                        </Text>
                                        <Text style={styles.filterOptionCount}>
                                            {filter.count}
                                        </Text>
                                    </View>
                                    {statusFilter === filter.id && (
                                        <CheckCircle2 size={20} color="#0469ff" />
                                    )}
                                </View>
                            </HapticTouchable>
                        ))}
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );

    // No child data error state
    if (!childData) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#111" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Homework</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyState}>
                    <AlertCircle size={48} color="#ccc" />
                    <Text style={styles.emptyTitle}>No Child Selected</Text>
                    <Text style={styles.emptySubtitle}>
                        Please select a child from the home screen
                    </Text>
                </View>
            </View>
        );
    }

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
                    <Text style={styles.headerTitle}>Homework</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s assignments</Text>
                </View>
                <HapticTouchable onPress={() => setFilterModalVisible(true)}>
                    <View style={styles.filterButton}>
                        <Filter size={20} color="#0469ff" />
                        {statusFilter !== 'all' && <View style={styles.filterBadge} />}
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
                {/* Child Info Card */}
                <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                    <View style={styles.childInfoCard}>
                        <View style={styles.childInfoIcon}>
                            <User size={20} color="#0469ff" />
                        </View>
                        <View style={styles.childInfoContent}>
                            <Text style={styles.childInfoName}>{childData.name}</Text>
                            <Text style={styles.childInfoClass}>
                                Class {childData.class} - {childData.section} • Roll: {childData.rollNo}
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Stats Cards */}
                <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                    <View style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
                            <Text style={styles.statValue}>{stats.pending}</Text>
                            <Text style={styles.statLabel}>Pending</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
                            <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.overdue}</Text>
                            <Text style={styles.statLabel}>Overdue</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
                            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.submitted}</Text>
                            <Text style={styles.statLabel}>Submitted</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Active Filter Info */}
                {statusFilter !== 'all' && (
                    <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                        <View style={styles.filterInfo}>
                            <Text style={styles.filterInfoText}>
                                Showing: {statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                            </Text>
                            <HapticTouchable onPress={() => setStatusFilter('all')}>
                                <Text style={styles.clearFilter}>Clear</Text>
                            </HapticTouchable>
                        </View>
                    </Animated.View>
                )}

                {/* Homework List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        Assignments ({filteredHomework.length})
                    </Text>

                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : filteredHomework.length > 0 ? (
                        filteredHomework.map((hw, index) => {
                            const statusInfo = getStatusInfo(hw);
                            const StatusIcon = statusInfo.icon;

                            return (
                                <Animated.View
                                    key={hw.id}
                                    entering={FadeInRight.delay(400 + index * 80).duration(500)}
                                >
                                    <View style={styles.homeworkCard}>
                                        <View style={styles.homeworkHeader}>
                                            <View style={styles.homeworkIconContainer}>
                                                <BookOpen size={20} color="#0469ff" />
                                            </View>
                                            <View style={[
                                                styles.statusBadge,
                                                { backgroundColor: statusInfo.bgColor }
                                            ]}>
                                                <StatusIcon size={12} color={statusInfo.color} />
                                                <Text style={[
                                                    styles.statusText,
                                                    { color: statusInfo.color }
                                                ]}>
                                                    {statusInfo.label}
                                                </Text>
                                            </View>
                                        </View>

                                        <Text style={styles.homeworkTitle}>{hw.title}</Text>

                                        {hw.subject && (
                                            <View style={styles.subjectBadge}>
                                                <Text style={styles.subjectText}>
                                                    {hw.subject.subjectName}
                                                </Text>
                                            </View>
                                        )}

                                        <Text style={styles.homeworkDescription} numberOfLines={2}>
                                            {hw.description}
                                        </Text>

                                        <View style={styles.homeworkMeta}>
                                            <View style={styles.metaItem}>
                                                <Calendar size={14} color="#666" />
                                                <Text style={styles.metaText}>
                                                    {getDaysLeft(hw.dueDate)}
                                                </Text>
                                            </View>
                                            <Text style={styles.metaDivider}>•</Text>
                                            <Text style={styles.metaText}>
                                                {hw.teacher?.name || 'Teacher'}
                                            </Text>
                                        </View>

                                        {hw.mySubmission?.grade && (
                                            <View style={styles.gradeContainer}>
                                                <Text style={styles.gradeLabel}>Grade:</Text>
                                                <Text style={styles.gradeValue}>
                                                    {hw.mySubmission.grade}
                                                </Text>
                                            </View>
                                        )}

                                        {hw.fileUrl && (
                                            <HapticTouchable
                                                onPress={() => handleViewAttachment(hw.fileUrl)}
                                            >
                                                <View style={styles.attachmentButton}>
                                                    <FileText size={16} color="#0469ff" />
                                                    <Text style={styles.attachmentText}>
                                                        View Attachment
                                                    </Text>
                                                </View>
                                            </HapticTouchable>
                                        )}
                                    </View>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                            <View style={styles.emptyState}>
                                <AlertCircle size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Homework Found</Text>
                                <Text style={styles.emptySubtitle}>
                                    {statusFilter !== 'all'
                                        ? `No ${statusFilter} homework at the moment`
                                        : 'No homework assigned yet'
                                    }
                                </Text>
                            </View>
                        </Animated.View>
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            <FilterModal />
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
    childInfoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 16,
        gap: 12,
    },
    childInfoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    childInfoContent: {
        flex: 1,
    },
    childInfoName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    childInfoClass: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#0469ff',
    },
    statLabel: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
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
    homeworkCard: {
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
    },
    homeworkHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    homeworkIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        gap: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    homeworkTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 8,
    },
    subjectBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#fff',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    subjectText: {
        fontSize: 12,
        color: '#0469ff',
        fontWeight: '600',
    },
    homeworkDescription: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
        marginBottom: 12,
    },
    homeworkMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 13,
        color: '#666',
    },
    metaDivider: {
        fontSize: 13,
        color: '#ccc',
    },
    gradeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        marginTop: 8,
    },
    gradeLabel: {
        fontSize: 14,
        color: '#666',
        fontWeight: '600',
    },
    gradeValue: {
        fontSize: 18,
        color: '#10B981',
        fontWeight: '700',
    },
    attachmentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        backgroundColor: '#E3F2FD',
        borderRadius: 8,
        marginTop: 12,
    },
    attachmentText: {
        fontSize: 14,
        color: '#0469ff',
        fontWeight: '600',
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '60%',
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
    filterOptions: {
        padding: 20,
        gap: 8,
    },
    filterOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
    },
    filterOptionActive: {
        backgroundColor: '#E3F2FD',
        borderWidth: 1,
        borderColor: '#0469ff',
    },
    filterOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    filterOptionText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    filterOptionTextActive: {
        color: '#0469ff',
    },
    filterOptionCount: {
        fontSize: 13,
        color: '#666',
        fontWeight: '500',
    },
});
