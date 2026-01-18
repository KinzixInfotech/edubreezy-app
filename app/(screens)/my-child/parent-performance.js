// app/(screens)/my-child/parent-performance.js
// Parent view of child's overall performance (exams + attendance)
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    AlertCircle,
    Award,
    TrendingUp,
    CheckCircle,
    XCircle,
    Clock,
    BookOpen,
    BarChart3,
    Target,
    Star,
    User,
    Calendar,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ParentPerformanceScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

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

    // Fetch attendance stats
    const { data: attendanceData, isLoading: attendanceLoading } = useQuery({
        queryKey: ['parent-performance-attendance', schoolId, childId],
        queryFn: async () => {
            if (!schoolId || !childId) return null;
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();
            const res = await api.get(`/schools/${schoolId}/attendance/stats?userId=${childId}&month=${month}&year=${year}`);
            return res.data;
        },
        enabled: !!schoolId && !!childId,
        staleTime: 1000 * 60 * 5,
    });

    // Fetch exam results
    const { data: examData, isLoading: examLoading } = useQuery({
        queryKey: ['parent-performance-exams', schoolId, childId],
        queryFn: async () => {
            if (!schoolId || !childId) return { results: [], stats: {} };
            const res = await api.get(`/schools/${schoolId}/examination/student-results?studentId=${childId}`);
            return res.data;
        },
        enabled: !!schoolId && !!childId,
        staleTime: 1000 * 60 * 5,
    });

    const isLoading = attendanceLoading || examLoading;

    // Extract stats
    const monthlyStats = attendanceData?.monthlyStats || {};
    const yearlyAggregate = attendanceData?.yearlyAggregate || {};
    const examStats = examData?.stats || {};
    const recentExams = (examData?.results || []).slice(0, 5);

    // Calculate overall performance score (weighted average)
    const calculateOverallScore = () => {
        let score = 0;
        let weight = 0;

        // Attendance component (40% weight)
        if (monthlyStats.attendancePercentage !== undefined) {
            score += (monthlyStats.attendancePercentage || 0) * 0.4;
            weight += 0.4;
        }

        // Exam component (60% weight)
        if (examStats.avgPercentage !== undefined) {
            score += (examStats.avgPercentage || 0) * 0.6;
            weight += 0.6;
        }

        return weight > 0 ? Math.round(score / weight) : 0;
    };

    const overallScore = calculateOverallScore();

    const getScoreColor = (score) => {
        if (score >= 80) return '#10B981';
        if (score >= 60) return '#3B82F6';
        if (score >= 40) return '#F59E0B';
        return '#EF4444';
    };

    const getScoreLabel = (score) => {
        if (score >= 90) return 'Excellent';
        if (score >= 80) return 'Very Good';
        if (score >= 70) return 'Good';
        if (score >= 60) return 'Above Average';
        if (score >= 50) return 'Average';
        if (score >= 40) return 'Below Average';
        return 'Needs Improvement';
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['parent-performance-attendance']),
            queryClient.invalidateQueries(['parent-performance-exams']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

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
                        <Text style={styles.headerTitle}>Performance</Text>
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
                    <Text style={styles.headerTitle}>Performance</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}</Text>
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
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                    </View>
                ) : (
                    <>
                        {/* Overall Score Card */}
                        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                            <LinearGradient
                                colors={[getScoreColor(overallScore), getScoreColor(overallScore) + 'DD']}
                                style={styles.overallScoreCard}
                            >
                                <View style={styles.scoreCircle}>
                                    <Text style={styles.scoreValue}>{overallScore}</Text>
                                    <Text style={styles.scoreMax}>/100</Text>
                                </View>
                                <View style={styles.scoreMeta}>
                                    <Text style={styles.scoreLabel}>{getScoreLabel(overallScore)}</Text>
                                    <Text style={styles.scoreDescription}>Overall Performance Score</Text>
                                </View>
                                <Star size={48} color="rgba(255,255,255,0.3)" style={styles.scoreIcon} />
                            </LinearGradient>
                        </Animated.View>

                        {/* Child Info */}
                        <Animated.View entering={FadeInDown.delay(150).duration(500)}>
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

                        {/* Attendance Section */}
                        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <Calendar size={18} color="#0469ff" />
                                    <Text style={styles.sectionTitle}>Attendance (This Month)</Text>
                                </View>

                                <View style={styles.statsRow}>
                                    <View style={[styles.statBox, { backgroundColor: '#E3F2FD' }]}>
                                        <BarChart3 size={20} color="#3B82F6" />
                                        <Text style={[styles.statBoxValue, { color: '#3B82F6' }]}>
                                            {Math.round(monthlyStats.attendancePercentage || 0)}%
                                        </Text>
                                        <Text style={styles.statBoxLabel}>Attendance</Text>
                                    </View>
                                    <View style={[styles.statBox, { backgroundColor: '#D1FAE5' }]}>
                                        <CheckCircle size={20} color="#10B981" />
                                        <Text style={[styles.statBoxValue, { color: '#10B981' }]}>
                                            {monthlyStats.totalPresent || 0}
                                        </Text>
                                        <Text style={styles.statBoxLabel}>Present</Text>
                                    </View>
                                    <View style={[styles.statBox, { backgroundColor: '#FEE2E2' }]}>
                                        <XCircle size={20} color="#EF4444" />
                                        <Text style={[styles.statBoxValue, { color: '#EF4444' }]}>
                                            {monthlyStats.totalAbsent || 0}
                                        </Text>
                                        <Text style={styles.statBoxLabel}>Absent</Text>
                                    </View>
                                    <View style={[styles.statBox, { backgroundColor: '#FEF3C7' }]}>
                                        <Clock size={20} color="#F59E0B" />
                                        <Text style={[styles.statBoxValue, { color: '#F59E0B' }]}>
                                            {monthlyStats.totalLate || 0}
                                        </Text>
                                        <Text style={styles.statBoxLabel}>Late</Text>
                                    </View>
                                </View>

                                {/* Working Days */}
                                <View style={styles.workingDaysRow}>
                                    <Text style={styles.workingDaysLabel}>Working Days:</Text>
                                    <Text style={styles.workingDaysValue}>
                                        {monthlyStats.totalWorkingDays || 0} days
                                    </Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* Yearly Attendance Aggregate */}
                        {yearlyAggregate.totalWorkingDays > 0 && (
                            <Animated.View entering={FadeInDown.delay(250).duration(500)}>
                                <View style={styles.section}>
                                    <View style={styles.sectionHeader}>
                                        <Target size={18} color="#9C27B0" />
                                        <Text style={styles.sectionTitle}>Yearly Summary</Text>
                                    </View>
                                    <View style={styles.yearlyStatsRow}>
                                        <View style={styles.yearlyStat}>
                                            <Text style={styles.yearlyStatValue}>{yearlyAggregate.totalPresent || 0}</Text>
                                            <Text style={styles.yearlyStatLabel}>Present Days</Text>
                                        </View>
                                        <View style={styles.yearlyDivider} />
                                        <View style={styles.yearlyStat}>
                                            <Text style={styles.yearlyStatValue}>{yearlyAggregate.totalAbsent || 0}</Text>
                                            <Text style={styles.yearlyStatLabel}>Absent Days</Text>
                                        </View>
                                        <View style={styles.yearlyDivider} />
                                        <View style={styles.yearlyStat}>
                                            <Text style={styles.yearlyStatValue}>{yearlyAggregate.totalWorkingDays || 0}</Text>
                                            <Text style={styles.yearlyStatLabel}>Working Days</Text>
                                        </View>
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* Exam Performance Section */}
                        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                            <View style={styles.section}>
                                <View style={styles.sectionHeader}>
                                    <BookOpen size={18} color="#FF6B6B" />
                                    <Text style={styles.sectionTitle}>Exam Performance</Text>
                                </View>

                                <View style={styles.examStatsRow}>
                                    <View style={[styles.examStatBox, { backgroundColor: '#E3F2FD' }]}>
                                        <Text style={styles.examStatValue}>{examStats.totalExams || 0}</Text>
                                        <Text style={styles.examStatLabel}>Exams Taken</Text>
                                    </View>
                                    <View style={[styles.examStatBox, { backgroundColor: '#D1FAE5' }]}>
                                        <Text style={[styles.examStatValue, { color: '#10B981' }]}>
                                            {examStats.avgPercentage || 0}%
                                        </Text>
                                        <Text style={styles.examStatLabel}>Avg Score</Text>
                                    </View>
                                    <View style={[styles.examStatBox, { backgroundColor: '#FEF3C7' }]}>
                                        <Text style={[styles.examStatValue, { color: '#F59E0B' }]}>
                                            {examStats.passRate || 0}%
                                        </Text>
                                        <Text style={styles.examStatLabel}>Pass Rate</Text>
                                    </View>
                                </View>

                                {/* Recent Exams */}
                                {recentExams.length > 0 && (
                                    <View style={styles.recentExams}>
                                        <Text style={styles.recentExamsTitle}>Recent Exams</Text>
                                        {recentExams.map((exam, idx) => (
                                            <Animated.View
                                                key={exam.examId + (exam.attemptId || '')}
                                                entering={FadeInRight.delay(350 + idx * 50).duration(400)}
                                            >
                                                <View style={styles.recentExamCard}>
                                                    <View style={styles.recentExamLeft}>
                                                        <Text style={styles.recentExamTitle} numberOfLines={1}>
                                                            {exam.examTitle}
                                                        </Text>
                                                        <Text style={styles.recentExamType}>
                                                            {exam.examType} • {exam.subjects?.length || 0} subjects
                                                        </Text>
                                                    </View>
                                                    <View style={[
                                                        styles.recentExamScore,
                                                        { backgroundColor: getScoreColor(exam.percentage) + '20' }
                                                    ]}>
                                                        <Text style={[
                                                            styles.recentExamScoreText,
                                                            { color: getScoreColor(exam.percentage) }
                                                        ]}>
                                                            {exam.percentage}%
                                                        </Text>
                                                    </View>
                                                </View>
                                            </Animated.View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </Animated.View>

                        {/* Performance Insights */}
                        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                            <View style={styles.insightsCard}>
                                <View style={styles.insightsHeader}>
                                    <Award size={20} color="#FFB020" />
                                    <Text style={styles.insightsTitle}>Performance Insights</Text>
                                </View>
                                <View style={styles.insightsList}>
                                    {monthlyStats.attendancePercentage >= 90 && (
                                        <View style={styles.insightItem}>
                                            <View style={[styles.insightDot, { backgroundColor: '#10B981' }]} />
                                            <Text style={styles.insightText}>Excellent attendance this month! 🌟</Text>
                                        </View>
                                    )}
                                    {monthlyStats.attendancePercentage < 75 && monthlyStats.attendancePercentage > 0 && (
                                        <View style={styles.insightItem}>
                                            <View style={[styles.insightDot, { backgroundColor: '#FF6B6B' }]} />
                                            <Text style={styles.insightText}>Attendance needs improvement (below 75%)</Text>
                                        </View>
                                    )}
                                    {examStats.avgPercentage >= 80 && (
                                        <View style={styles.insightItem}>
                                            <View style={[styles.insightDot, { backgroundColor: '#10B981' }]} />
                                            <Text style={styles.insightText}>Great exam performance! Keep it up! 📚</Text>
                                        </View>
                                    )}
                                    {examStats.passRate < 100 && examStats.totalExams > 0 && (
                                        <View style={styles.insightItem}>
                                            <View style={[styles.insightDot, { backgroundColor: '#F59E0B' }]} />
                                            <Text style={styles.insightText}>
                                                Passed {examStats.totalPassed}/{examStats.totalExams} exams - room for improvement
                                            </Text>
                                        </View>
                                    )}
                                    {examStats.totalExams === 0 && (
                                        <View style={styles.insightItem}>
                                            <View style={[styles.insightDot, { backgroundColor: '#3B82F6' }]} />
                                            <Text style={styles.insightText}>No exam results available yet</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </Animated.View>

                        <View style={{ height: 40 }} />
                    </>
                )}
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
    loadingContainer: {
        padding: 60,
        alignItems: 'center',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
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
    },
    // Overall Score Card
    overallScoreCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
        borderRadius: 20,
        marginBottom: 16,
        overflow: 'hidden',
    },
    scoreCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    scoreValue: {
        fontSize: 28,
        fontWeight: '800',
        color: '#fff',
    },
    scoreMax: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.8)',
        marginTop: -4,
    },
    scoreMeta: {
        flex: 1,
        marginLeft: 16,
    },
    scoreLabel: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    scoreDescription: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        marginTop: 4,
    },
    scoreIcon: {
        position: 'absolute',
        right: 16,
        top: 16,
    },
    // Child Info Card
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
    // Section
    section: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111',
    },
    // Stats Row
    statsRow: {
        flexDirection: 'row',
        gap: 8,
    },
    statBox: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        alignItems: 'center',
        gap: 6,
    },
    statBoxValue: {
        fontSize: 18,
        fontWeight: '700',
    },
    statBoxLabel: {
        fontSize: 10,
        color: '#666',
        fontWeight: '600',
    },
    // Working Days
    workingDaysRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    workingDaysLabel: {
        fontSize: 13,
        color: '#666',
    },
    workingDaysValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#111',
    },
    // Yearly Stats
    yearlyStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: 8,
    },
    yearlyStat: {
        alignItems: 'center',
    },
    yearlyStatValue: {
        fontSize: 22,
        fontWeight: '700',
        color: '#111',
    },
    yearlyStatLabel: {
        fontSize: 11,
        color: '#666',
        marginTop: 4,
    },
    yearlyDivider: {
        width: 1,
        height: 40,
        backgroundColor: '#e5e7eb',
    },
    // Exam Stats
    examStatsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    examStatBox: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
        gap: 4,
    },
    examStatValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#3B82F6',
    },
    examStatLabel: {
        fontSize: 11,
        color: '#666',
        fontWeight: '500',
    },
    // Recent Exams
    recentExams: {
        marginTop: 16,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    recentExamsTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
        marginBottom: 10,
    },
    recentExamCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    recentExamLeft: {
        flex: 1,
    },
    recentExamTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    recentExamType: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    recentExamScore: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    recentExamScoreText: {
        fontSize: 14,
        fontWeight: '700',
    },
    // Insights Card
    insightsCard: {
        backgroundColor: '#FFFBEB',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#FEF3C7',
    },
    insightsHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    insightsTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#92400E',
    },
    insightsList: {
        gap: 10,
    },
    insightItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    insightDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    insightText: {
        fontSize: 13,
        color: '#78350F',
        flex: 1,
    },
});
