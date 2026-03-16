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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const EXAM_LAST_VIEWED_KEY = 'exam_last_viewed';

// ── Circular progress ring ────────────────────────────────────────────────────
const ScoreRing = ({ percentage, size = 64, color }) => {
    const r = (size - 8) / 2;
    const circ = 2 * Math.PI * r;
    const filled = (percentage / 100) * circ;
    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Background ring */}
            <View style={{
                position: 'absolute', width: size, height: size, borderRadius: size / 2,
                borderWidth: 4, borderColor: color + '20',
            }} />
            {/* Filled arc approximation via gradient border trick */}
            <View style={{
                position: 'absolute', width: size, height: size, borderRadius: size / 2,
                borderWidth: 4, borderColor: 'transparent',
                borderTopColor: percentage > 25 ? color : 'transparent',
                borderRightColor: percentage > 50 ? color : 'transparent',
                borderBottomColor: percentage > 75 ? color : 'transparent',
                borderLeftColor: percentage > 12 ? color : 'transparent',
                transform: [{ rotate: '-45deg' }],
            }} />
            <Text style={{ fontSize: size * 0.22, fontWeight: '800', color }}>{percentage}%</Text>
        </View>
    );
};

export default function ParentExamsScreen() {
    const params = useLocalSearchParams();
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [expandedExam, setExpandedExam] = useState(null);

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

    const { data: examData, isLoading } = useQuery({
        queryKey: ['parent-exams', schoolId, childId],
        queryFn: async () => {
            if (!schoolId || !childId) return { results: [], stats: {} };
            const res = await api.get(`/schools/${schoolId}/examination/student-results?studentId=${childId}`);
            return res.data;
        },
        enabled: !!schoolId && !!childId,
        staleTime: 0,
    });

    const results = examData?.results || [];
    const stats = examData?.stats || {};

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
            day: 'numeric', month: 'short', year: 'numeric',
        });
    };

    if (!childData) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}><ArrowLeft size={24} color="#111" /></View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}><Text style={styles.headerTitle}>Exam Results</Text></View>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyState}>
                    <AlertCircle size={48} color="#ccc" />
                    <Text style={styles.emptyTitle}>No Child Selected</Text>
                    <Text style={styles.emptySubtitle}>Please select a child from the home screen</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}><ArrowLeft size={24} color="#111" /></View>
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
                contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {/* Child info */}
                <Animated.View entering={FadeInDown.delay(80).duration(400)}>
                    <View style={styles.childInfoCard}>
                        <View style={styles.childAvatar}>
                            <Text style={styles.childAvatarText}>
                                {childData.name?.charAt(0)?.toUpperCase() || 'S'}
                            </Text>
                        </View>
                        <View style={styles.childInfoContent}>
                            <Text style={styles.childInfoName}>{childData.name}</Text>
                            <Text style={styles.childInfoClass}>
                                Class {childData.class} – {childData.section} · Roll {childData.rollNo}
                            </Text>
                        </View>
                        {/* Overall avg ring */}
                        {stats.avgPercentage !== undefined && (
                            <ScoreRing
                                percentage={stats.avgPercentage}
                                size={60}
                                color={getGradeColor(stats.avgPercentage)}
                            />
                        )}
                    </View>
                </Animated.View>

                {/* Stats row */}
                <Animated.View entering={FadeInDown.delay(160).duration(400)}>
                    <View style={styles.statsRow}>
                        <View style={styles.statCard}>
                            <View style={[styles.statIconBg, { backgroundColor: '#EEF4FF' }]}>
                                <FileText size={16} color="#0469ff" />
                            </View>
                            <Text style={[styles.statValue, { color: '#0469ff' }]}>{stats.totalExams || 0}</Text>
                            <Text style={styles.statLabel}>Exams</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statCard}>
                            <View style={[styles.statIconBg, { backgroundColor: '#D1FAE5' }]}>
                                <TrendingUp size={16} color="#10B981" />
                            </View>
                            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.avgPercentage || 0}%</Text>
                            <Text style={styles.statLabel}>Average</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statCard}>
                            <View style={[styles.statIconBg, { backgroundColor: '#FEF3C7' }]}>
                                <Award size={16} color="#F59E0B" />
                            </View>
                            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.passRate || 0}%</Text>
                            <Text style={styles.statLabel}>Pass Rate</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Section title */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Examination History</Text>
                    <Text style={styles.sectionCount}>{results.length} exams</Text>
                </View>

                {/* Results */}
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                        <Text style={styles.loadingText}>Loading results…</Text>
                    </View>
                ) : results.length > 0 ? (
                    results.map((exam, index) => {
                        const isExpanded = expandedExam === exam.examId;
                        const gradeColor = getGradeColor(exam.percentage);
                        const isOnline = exam.examType === 'ONLINE';

                        return (
                            <Animated.View
                                key={exam.examId + (exam.attemptId || '')}
                                entering={FadeInRight.delay(240 + index * 70).duration(400)}
                            >
                                <View style={styles.examCard}>
                                    {/* Left accent bar */}
                                    <View style={[styles.examAccent, { backgroundColor: gradeColor }]} />

                                    <View style={styles.examBody}>
                                        <HapticTouchable onPress={() => setExpandedExam(isExpanded ? null : exam.examId)}>
                                            <View style={styles.examHeader}>
                                                {/* Icon */}
                                                <View style={[styles.examIconBg, { backgroundColor: gradeColor + '18' }]}>
                                                    {isOnline
                                                        ? <BookOpen size={18} color={gradeColor} />
                                                        : <FileText size={18} color={gradeColor} />
                                                    }
                                                </View>

                                                {/* Title + meta */}
                                                <View style={styles.examInfo}>
                                                    <Text style={styles.examTitle} numberOfLines={1}>{exam.examTitle}</Text>
                                                    <View style={styles.examMetaRow}>
                                                        <Text style={styles.examDate}>{formatDate(exam.examDate)}</Text>
                                                        <View style={[styles.typeBadge, { backgroundColor: isOnline ? '#DBEAFE' : '#F3E8FF' }]}>
                                                            <Text style={[styles.typeText, { color: isOnline ? '#3B82F6' : '#9333EA' }]}>
                                                                {isOnline ? 'Online' : 'Offline'}
                                                            </Text>
                                                        </View>
                                                        <View style={[styles.passBadge, { backgroundColor: exam.isPassed ? '#D1FAE5' : '#FEE2E2' }]}>
                                                            <Text style={[styles.passText, { color: exam.isPassed ? '#10B981' : '#EF4444' }]}>
                                                                {exam.isPassed ? 'Pass' : 'Fail'}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>

                                                {/* Score + chevron */}
                                                <View style={styles.examRight}>
                                                    <View style={[styles.scorePill, { backgroundColor: gradeColor + '18' }]}>
                                                        <Text style={[styles.scorePillText, { color: gradeColor }]}>{exam.percentage}%</Text>
                                                    </View>
                                                    {isExpanded
                                                        ? <ChevronUp size={18} color="#999" />
                                                        : <ChevronDown size={18} color="#999" />
                                                    }
                                                </View>
                                            </View>
                                        </HapticTouchable>

                                        {/* Expanded details */}
                                        {isExpanded && (
                                            <Animated.View entering={FadeInDown.duration(250)}>
                                                <View style={styles.examDetails}>
                                                    {/* Summary grid */}
                                                    <View style={styles.summaryGrid}>
                                                        <View style={styles.summaryItem}>
                                                            <Text style={styles.summaryLabel}>Performance</Text>
                                                            <Text style={[styles.summaryValue, { color: gradeColor }]}>
                                                                {getGradeLabel(exam.percentage)}
                                                            </Text>
                                                        </View>
                                                        {isOnline ? (
                                                            <>
                                                                <View style={styles.summaryItem}>
                                                                    <Text style={styles.summaryLabel}>Score</Text>
                                                                    <Text style={styles.summaryValue}>{exam.score}/{exam.maxScore}</Text>
                                                                </View>
                                                                <View style={styles.summaryItem}>
                                                                    <Text style={styles.summaryLabel}>Correct</Text>
                                                                    <Text style={styles.summaryValue}>{exam.questionsCorrect}/{exam.questionsTotal}</Text>
                                                                </View>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <View style={styles.summaryItem}>
                                                                    <Text style={styles.summaryLabel}>Total Marks</Text>
                                                                    <Text style={styles.summaryValue}>{exam.totalMarksObtained}/{exam.totalMaxMarks}</Text>
                                                                </View>
                                                                <View style={styles.summaryItem}>
                                                                    <Text style={styles.summaryLabel}>Subjects</Text>
                                                                    <Text style={styles.summaryValue}>{exam.subjectsPassed}/{exam.subjectsAttempted} passed</Text>
                                                                </View>
                                                            </>
                                                        )}
                                                    </View>

                                                    {/* Progress bar */}
                                                    <View style={styles.progressContainer}>
                                                        <View style={styles.progressTrack}>
                                                            <View style={[styles.progressFill, {
                                                                width: `${Math.min(exam.percentage, 100)}%`,
                                                                backgroundColor: gradeColor,
                                                            }]} />
                                                        </View>
                                                        <Text style={[styles.progressLabel, { color: gradeColor }]}>{exam.percentage}%</Text>
                                                    </View>

                                                    {/* Subject breakdown */}
                                                    {!isOnline && exam.subjects?.length > 0 && (
                                                        <View style={styles.subjectsSection}>
                                                            <Text style={styles.subjectsTitle}>Subject-wise Marks</Text>
                                                            {exam.subjects.map((subject) => {
                                                                const subColor = getGradeColor(subject.percentage || 0);
                                                                return (
                                                                    <View key={subject.subjectId} style={styles.subjectRow}>
                                                                        <View style={styles.subjectLeft}>
                                                                            <View style={[styles.subjectDot, { backgroundColor: subject.isAbsent ? '#ccc' : subColor }]} />
                                                                            <Text style={styles.subjectName}>{subject.subjectName}</Text>
                                                                            {subject.isAbsent && (
                                                                                <View style={styles.absentBadge}>
                                                                                    <Text style={styles.absentText}>Absent</Text>
                                                                                </View>
                                                                            )}
                                                                        </View>
                                                                        <View style={styles.subjectRight}>
                                                                            {subject.isAbsent ? (
                                                                                <Text style={styles.subjectAbsent}>–</Text>
                                                                            ) : (
                                                                                <>
                                                                                    <Text style={[styles.subjectMarks, { color: subColor }]}>
                                                                                        {subject.marksObtained}
                                                                                    </Text>
                                                                                    <Text style={styles.subjectMax}>/{subject.maxMarks}</Text>
                                                                                    {subject.grade && (
                                                                                        <View style={[styles.gradePill, { backgroundColor: subColor + '18' }]}>
                                                                                            <Text style={[styles.gradeText, { color: subColor }]}>{subject.grade}</Text>
                                                                                        </View>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </View>
                                                                    </View>
                                                                );
                                                            })}
                                                        </View>
                                                    )}
                                                </View>
                                            </Animated.View>
                                        )}
                                    </View>
                                </View>
                            </Animated.View>
                        );
                    })
                ) : (
                    <Animated.View entering={FadeInDown.delay(300).duration(400)}>
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconBg}>
                                <FileText size={36} color="#ccc" />
                            </View>
                            <Text style={styles.emptyTitle}>No Exam Results</Text>
                            <Text style={styles.emptySubtitle}>No examination results available yet</Text>
                        </View>
                    </Animated.View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff',
    },
    backButton: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },

    content: { flex: 1, paddingHorizontal: 16 },

    // Child info
    childInfoCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#EEF4FF', borderRadius: 16,
        padding: 14, marginTop: 16, marginBottom: 14, gap: 12,
    },
    childAvatar: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#0469ff', alignItems: 'center', justifyContent: 'center',
    },
    childAvatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
    childInfoContent: { flex: 1 },
    childInfoName: { fontSize: 16, fontWeight: '700', color: '#111' },
    childInfoClass: { fontSize: 12, color: '#666', marginTop: 2 },

    // Stats
    statsRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#f8f9fa', borderRadius: 16,
        paddingVertical: 16, marginBottom: 20,
    },
    statCard: { flex: 1, alignItems: 'center', gap: 4 },
    statDivider: { width: 1, height: 40, backgroundColor: '#e5e7eb' },
    statIconBg: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    statValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    statLabel: { fontSize: 11, color: '#888', fontWeight: '500' },

    // Section header
    sectionHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
    sectionCount: {
        fontSize: 13, color: '#666', backgroundColor: '#f5f5f5',
        paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
    },

    // Loading
    loadingContainer: { paddingVertical: 48, alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, color: '#666' },

    // Exam card
    examCard: {
        flexDirection: 'row', backgroundColor: '#f8f9fa',
        borderRadius: 14, marginBottom: 10, overflow: 'hidden',
    },
    examAccent: { width: 4 },
    examBody: { flex: 1 },
    examHeader: {
        flexDirection: 'row', alignItems: 'center',
        padding: 14, gap: 12,
    },
    examIconBg: {
        width: 38, height: 38, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    examInfo: { flex: 1 },
    examTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 5 },
    examMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    examDate: { fontSize: 11, color: '#888' },
    typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    typeText: { fontSize: 10, fontWeight: '700' },
    passBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    passText: { fontSize: 10, fontWeight: '700' },
    examRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    scorePill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
    scorePillText: { fontSize: 13, fontWeight: '800' },

    // Expanded details
    examDetails: {
        borderTopWidth: 1, borderTopColor: '#ebebeb',
        padding: 14, gap: 14,
    },
    summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    summaryItem: {
        backgroundColor: '#fff', borderRadius: 10,
        paddingHorizontal: 12, paddingVertical: 8, minWidth: '30%',
    },
    summaryLabel: { fontSize: 11, color: '#999', fontWeight: '600', marginBottom: 3 },
    summaryValue: { fontSize: 14, fontWeight: '700', color: '#111' },

    // Progress bar
    progressContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    progressTrack: {
        flex: 1, height: 8, backgroundColor: '#e5e7eb',
        borderRadius: 4, overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 4 },
    progressLabel: { fontSize: 12, fontWeight: '700', minWidth: 38, textAlign: 'right' },

    // Subjects
    subjectsSection: { gap: 0 },
    subjectsTitle: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 8 },
    subjectRow: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    subjectLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    subjectDot: { width: 8, height: 8, borderRadius: 4 },
    subjectName: { fontSize: 13, color: '#333', flex: 1 },
    absentBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    absentText: { fontSize: 10, color: '#EF4444', fontWeight: '600' },
    subjectRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    subjectMarks: { fontSize: 14, fontWeight: '700' },
    subjectMax: { fontSize: 12, color: '#999' },
    subjectAbsent: { fontSize: 14, color: '#bbb' },
    gradePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 4 },
    gradeText: { fontSize: 10, fontWeight: '700' },

    // Empty
    emptyState: { alignItems: 'center', paddingVertical: 56, gap: 12 },
    emptyIconBg: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center', paddingHorizontal: 32 },
});