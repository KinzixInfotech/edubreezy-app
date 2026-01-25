// app/(screens)/my-child/parent-exams.js
// Parent view of child's examination results
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Modal,
    TouchableOpacity,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    AlertCircle,
    Award,
    TrendingUp,
    CheckCircle2,
    Clock,
    X,
    ChevronDown,
    ChevronUp,
    BookOpen,
    FileText,
    User,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

const EXAM_LAST_VIEWED_KEY = 'exam_last_viewed';

export default function ParentExamsScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [expandedExam, setExpandedExam] = useState(null);

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

    // Fetch exam results for child
    const { data: examData, isLoading } = useQuery({
        queryKey: ['parent-exams', schoolId, childId],
        queryFn: async () => {
            if (!schoolId || !childId) return { results: [], stats: {} };

            const res = await api.get(`/schools/${schoolId}/examination/student-results?studentId=${childId}`);
            return res.data;
        },
        enabled: !!schoolId && !!childId,
        staleTime: 1000 * 60 * 2,
    });

    const results = examData?.results || [];
    const stats = examData?.stats || {};

    // Mark exams as viewed when screen is focused (clears badge on home screen)
    useFocusEffect(
        useCallback(() => {
            const markAsViewed = async () => {
                if (childId) {
                    const key = `${EXAM_LAST_VIEWED_KEY}_${childId}`;
                    await SecureStore.setItemAsync(key, new Date().toISOString());
                }
            };
            markAsViewed();
        }, [childId])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['parent-exams']);
        setRefreshing(false);
    }, [queryClient]);

    const getGradeColor = (percentage) => {
        if (percentage >= 90) return '#10B981';
        if (percentage >= 75) return '#3B82F6';
        if (percentage >= 60) return '#F59E0B';
        if (percentage >= 33) return '#EF4444';
        return '#6B7280';
    };

    const getGradeLabel = (percentage) => {
        if (percentage >= 90) return 'Excellent';
        if (percentage >= 75) return 'Good';
        if (percentage >= 60) return 'Average';
        if (percentage >= 33) return 'Pass';
        return 'Needs Improvement';
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

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
                        <Text style={styles.headerTitle}>Exam Results</Text>
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
                    <Text style={styles.headerTitle}>Exam Results</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s performance</Text>
                </View>
                <View style={{ width: 40 }} />
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

                {/* Stats Overview */}
                <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                    <View style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
                            <FileText size={20} color="#0469ff" />
                            <Text style={styles.statValue}>{stats.totalExams || 0}</Text>
                            <Text style={styles.statLabel}>Exams</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
                            <TrendingUp size={20} color="#10B981" />
                            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.avgPercentage || 0}%</Text>
                            <Text style={styles.statLabel}>Average</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
                            <Award size={20} color="#F59E0B" />
                            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.passRate || 0}%</Text>
                            <Text style={styles.statLabel}>Pass Rate</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Results List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        Examination History ({results.length})
                    </Text>

                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : results.length > 0 ? (
                        results.map((exam, index) => {
                            const isExpanded = expandedExam === exam.examId;
                            const gradeColor = getGradeColor(exam.percentage);
                            const isOnline = exam.examType === 'ONLINE';

                            return (
                                <Animated.View
                                    key={exam.examId + (exam.attemptId || '')}
                                    entering={FadeInRight.delay(300 + index * 80).duration(500)}
                                >
                                    <View style={styles.examCard}>
                                        <HapticTouchable
                                            onPress={() => setExpandedExam(isExpanded ? null : exam.examId)}
                                        >
                                            <View style={styles.examHeader}>
                                                <View style={styles.examLeft}>
                                                    <View style={[styles.examIconContainer, { backgroundColor: gradeColor + '20' }]}>
                                                        {isOnline ? (
                                                            <BookOpen size={20} color={gradeColor} />
                                                        ) : (
                                                            <FileText size={20} color={gradeColor} />
                                                        )}
                                                    </View>
                                                    <View style={styles.examInfo}>
                                                        <Text style={styles.examTitle} numberOfLines={1}>
                                                            {exam.examTitle}
                                                        </Text>
                                                        <View style={styles.examMeta}>
                                                            <Text style={styles.examDate}>
                                                                {formatDate(exam.examDate)}
                                                            </Text>
                                                            <View style={[styles.typeBadge, { backgroundColor: isOnline ? '#DBEAFE' : '#F3E5F5' }]}>
                                                                <Text style={[styles.typeText, { color: isOnline ? '#3B82F6' : '#9C27B0' }]}>
                                                                    {isOnline ? 'Online' : 'Offline'}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                </View>
                                                <View style={styles.examRight}>
                                                    <View style={[styles.scoreBadge, { backgroundColor: gradeColor + '20' }]}>
                                                        <Text style={[styles.scoreText, { color: gradeColor }]}>
                                                            {exam.percentage}%
                                                        </Text>
                                                    </View>
                                                    {isExpanded ? (
                                                        <ChevronUp size={20} color="#666" />
                                                    ) : (
                                                        <ChevronDown size={20} color="#666" />
                                                    )}
                                                </View>
                                            </View>
                                        </HapticTouchable>

                                        {isExpanded && (
                                            <Animated.View entering={FadeInDown.duration(300)}>
                                                <View style={styles.examDetails}>
                                                    {/* Overall Result */}
                                                    <View style={styles.resultSummary}>
                                                        <View style={styles.resultRow}>
                                                            <Text style={styles.resultLabel}>Status</Text>
                                                            <View style={[styles.statusBadge, { backgroundColor: exam.isPassed ? '#D1FAE5' : '#FEE2E2' }]}>
                                                                {exam.isPassed ? (
                                                                    <CheckCircle2 size={14} color="#10B981" />
                                                                ) : (
                                                                    <AlertCircle size={14} color="#EF4444" />
                                                                )}
                                                                <Text style={[styles.statusText, { color: exam.isPassed ? '#10B981' : '#EF4444' }]}>
                                                                    {exam.isPassed ? 'Passed' : 'Needs Improvement'}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                        <View style={styles.resultRow}>
                                                            <Text style={styles.resultLabel}>Performance</Text>
                                                            <Text style={[styles.resultValue, { color: gradeColor }]}>
                                                                {getGradeLabel(exam.percentage)}
                                                            </Text>
                                                        </View>
                                                        {isOnline ? (
                                                            <>
                                                                <View style={styles.resultRow}>
                                                                    <Text style={styles.resultLabel}>Score</Text>
                                                                    <Text style={styles.resultValue}>
                                                                        {exam.score} / {exam.maxScore}
                                                                    </Text>
                                                                </View>
                                                                <View style={styles.resultRow}>
                                                                    <Text style={styles.resultLabel}>Questions</Text>
                                                                    <Text style={styles.resultValue}>
                                                                        {exam.questionsCorrect} / {exam.questionsTotal} correct
                                                                    </Text>
                                                                </View>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <View style={styles.resultRow}>
                                                                    <Text style={styles.resultLabel}>Total Marks</Text>
                                                                    <Text style={styles.resultValue}>
                                                                        {exam.totalMarksObtained} / {exam.totalMaxMarks}
                                                                    </Text>
                                                                </View>
                                                                <View style={styles.resultRow}>
                                                                    <Text style={styles.resultLabel}>Subjects</Text>
                                                                    <Text style={styles.resultValue}>
                                                                        {exam.subjectsPassed} / {exam.subjectsAttempted} passed
                                                                    </Text>
                                                                </View>
                                                            </>
                                                        )}
                                                    </View>

                                                    {/* Subject-wise breakdown (for offline exams) */}
                                                    {!isOnline && exam.subjects && exam.subjects.length > 0 && (
                                                        <View style={styles.subjectsSection}>
                                                            <Text style={styles.subjectsTitle}>Subject-wise Marks</Text>
                                                            {exam.subjects.map((subject, idx) => (
                                                                <View key={subject.subjectId} style={styles.subjectRow}>
                                                                    <View style={styles.subjectLeft}>
                                                                        <Text style={styles.subjectName}>
                                                                            {subject.subjectName}
                                                                        </Text>
                                                                        {subject.isAbsent && (
                                                                            <View style={styles.absentBadge}>
                                                                                <Text style={styles.absentText}>Absent</Text>
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                    <View style={styles.subjectRight}>
                                                                        {subject.isAbsent ? (
                                                                            <Text style={styles.subjectAbsentMarks}>--</Text>
                                                                        ) : (
                                                                            <>
                                                                                <Text style={[
                                                                                    styles.subjectMarks,
                                                                                    { color: subject.isPassed ? '#10B981' : '#EF4444' }
                                                                                ]}>
                                                                                    {subject.marksObtained}
                                                                                </Text>
                                                                                <Text style={styles.subjectMaxMarks}>
                                                                                    / {subject.maxMarks}
                                                                                </Text>
                                                                                {subject.grade && (
                                                                                    <View style={[styles.gradeBadge, { backgroundColor: getGradeColor(subject.percentage) + '20' }]}>
                                                                                        <Text style={[styles.gradeText, { color: getGradeColor(subject.percentage) }]}>
                                                                                            {subject.grade}
                                                                                        </Text>
                                                                                    </View>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </View>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    )}
                                                </View>
                                            </Animated.View>
                                        )}
                                    </View>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                            <View style={styles.emptyState}>
                                <AlertCircle size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Exam Results</Text>
                                <Text style={styles.emptySubtitle}>
                                    No examination results available yet
                                </Text>
                            </View>
                        </Animated.View>
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
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
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    statCard: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
        gap: 6,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#0469ff',
    },
    statLabel: {
        fontSize: 11,
        color: '#666',
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
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    examCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
    },
    examHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
    },
    examLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    examIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    examInfo: {
        flex: 1,
    },
    examTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    examMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 4,
    },
    examDate: {
        fontSize: 12,
        color: '#666',
    },
    typeBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    typeText: {
        fontSize: 10,
        fontWeight: '600',
    },
    examRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    scoreBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    scoreText: {
        fontSize: 14,
        fontWeight: '700',
    },
    examDetails: {
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        padding: 14,
    },
    resultSummary: {
        gap: 10,
    },
    resultRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    resultLabel: {
        fontSize: 13,
        color: '#666',
    },
    resultValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#111',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        gap: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    subjectsSection: {
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    subjectsTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#111',
        marginBottom: 10,
    },
    subjectRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    subjectLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    subjectName: {
        fontSize: 13,
        color: '#333',
    },
    absentBadge: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    absentText: {
        fontSize: 10,
        color: '#EF4444',
        fontWeight: '600',
    },
    subjectRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    subjectMarks: {
        fontSize: 14,
        fontWeight: '700',
    },
    subjectMaxMarks: {
        fontSize: 13,
        color: '#666',
    },
    subjectAbsentMarks: {
        fontSize: 14,
        color: '#999',
    },
    gradeBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 6,
    },
    gradeText: {
        fontSize: 11,
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
});
