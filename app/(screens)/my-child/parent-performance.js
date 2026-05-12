// app/(screens)/my-child/parent-performance.js
// Parent view of child's overall performance (exams + attendance)
// Redesigned to match enterprise-grade PayFees UI quality

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
import Animated, { FadeInDown, FadeInRight, FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft,
    AlertCircle,
    Award,
    CheckCircle,
    XCircle,
    Clock,
    BookOpen,
    BarChart3,
    Target,
    Sparkles,
    User,
    Calendar,
    TrendingUp,
    GraduationCap,
    Activity,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PILL_WIDTH = (SCREEN_WIDTH - 32 - 36 - 24) / 4;

// ─── Helpers ────────────────────────────────────────────────────────────────

const getScoreColor = (score) => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#0469ff';
    if (score >= 40) return '#F59E0B';
    return '#EF4444';
};

const getScoreGradient = (score) => {
    if (score >= 80) return ['#10B981', '#059669'];
    if (score >= 60) return ['#0469ff', '#0347b8'];
    if (score >= 40) return ['#F59E0B', '#D97706'];
    return ['#EF4444', '#DC2626'];
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

// ─── Sub-components ─────────────────────────────────────────────────────────

const AttendancePill = ({ icon: Icon, value, label, bg, color }) => (
    <View style={[pillStyles.container, { backgroundColor: bg, width: PILL_WIDTH }]}>
        <View style={[pillStyles.iconWrap, { backgroundColor: color + '20' }]}>
            <Icon size={16} color={color} />
        </View>
        <Text style={[pillStyles.value, { color }]}>{value}</Text>
        <Text style={pillStyles.label}>{label}</Text>
    </View>
);

const pillStyles = StyleSheet.create({
    container: {
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 6,
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    iconWrap: {
        width: 36,
        height: 36,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
    },
    value: {
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    label: {
        fontSize: 9,
        color: '#9CA3AF',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
});

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ParentPerformanceScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const insets = useSafeAreaInsets();

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

    const { data: dashboardData, isLoading: dashboardLoading } = useQuery({
        queryKey: ['parent-performance-dashboard', schoolId, userData?.parentData?.id, childId],
        queryFn: async () => {
            if (!schoolId || !userData?.parentData?.id || !childId) return null;
            const res = await api.get(
                `/mobile/dashboard/parent?schoolId=${schoolId}&parentId=${userData.parentData.id}&userId=${userData.id}&childId=${childId}`
            );
            return res.data?.data || res.data;
        },
        enabled: !!schoolId && !!userData?.parentData?.id && !!childId,
        staleTime: 1000 * 60 * 5,
    });

    const isLoading = attendanceLoading || examLoading || dashboardLoading;

    const dashboardChildStats = dashboardData?.childStats || {};
    const monthlyStats = dashboardChildStats?.attendance?.monthlyStats || attendanceData?.monthlyStats || {};
    const yearlyAggregate = dashboardChildStats?.attendance?.yearlyAggregate || attendanceData?.yearlyAggregate || {};
    const examStats = dashboardChildStats?.exams?.stats || examData?.stats || {};
    const recentExams = (examData?.results || []).slice(0, 5);

    const calculateOverallScore = () => {
        let score = 0;
        let weight = 0;
        if (monthlyStats.attendancePercentage !== undefined) {
            score += (monthlyStats.attendancePercentage || 0) * 0.4;
            weight += 0.4;
        }
        if (examStats.avgPercentage !== undefined) {
            score += (examStats.avgPercentage || 0) * 0.6;
            weight += 0.6;
        }
        return weight > 0 ? Math.round(score / weight) : 0;
    };

    const overallScore = calculateOverallScore();
    const scoreColor = getScoreColor(overallScore);
    const scoreGradient = getScoreGradient(overallScore);

    // Progress bar pct (same pattern as PayFees)
    const attendancePct = Math.round(monthlyStats.attendancePercentage || 0);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['parent-performance-attendance']),
            queryClient.invalidateQueries(['parent-performance-exams']),
            queryClient.invalidateQueries(['parent-performance-dashboard']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    // ── No child state ──
    if (!childData) {
        return (
            <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
                <StatusBar style="dark" />
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
                    <View style={styles.emptyIconWrap}>
                        <AlertCircle size={32} color="#94A3B8" />
                    </View>
                    <Text style={styles.emptyTitle}>No Child Selected</Text>
                    <Text style={styles.emptySubtitle}>Please select a child from the home screen</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />

            {/* ── Header — matches PayFees exactly ── */}
            <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
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
                contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
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
                        <Text style={styles.loadingText}>Loading performance…</Text>
                    </View>
                ) : (
                    <>
                        {/* ── Hero Score Card — mirrors PayFees hero exactly ── */}
                        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
                            <LinearGradient
                                colors={scoreGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.heroCard}
                            >
                                {/* Decorative circles (same as PayFees) */}
                                <View style={styles.heroCircle1} />
                                <View style={styles.heroCircle2} />

                                <View style={styles.heroTop}>
                                    <View>
                                        <Text style={styles.heroLabel}>Overall Score</Text>
                                        <Text style={styles.heroAmount}>{overallScore}</Text>
                                        <Text style={styles.heroScoreSubtext}>out of 100</Text>
                                    </View>
                                    <View style={styles.heroBadge}>
                                        <Sparkles size={14} color="#fff" />
                                        <Text style={styles.heroBadgeText}>{getScoreLabel(overallScore)}</Text>
                                    </View>
                                </View>

                                {/* Attendance progress bar — mirrors PayFees progressWrap */}
                                <View style={styles.progressWrap}>
                                    <View style={styles.progressTrack}>
                                        <Animated.View
                                            entering={FadeIn.delay(400).duration(600)}
                                            style={[styles.progressFill, { width: `${attendancePct}%` }]}
                                        />
                                    </View>
                                    <Text style={styles.progressPct}>{attendancePct}% attend.</Text>
                                </View>

                                {/* Stats row — same glass card as PayFees heroRow */}
                                <View style={styles.heroRow}>
                                    <View style={styles.heroStat}>
                                        <Activity size={14} color="rgba(255,255,255,0.7)" />
                                        <View>
                                            <Text style={styles.heroStatLabel}>Attendance</Text>
                                            <Text style={styles.heroStatValue}>{attendancePct}%</Text>
                                        </View>
                                    </View>
                                    <View style={styles.heroDivider} />
                                    <View style={styles.heroStat}>
                                        <GraduationCap size={14} color="rgba(255,255,255,0.7)" />
                                        <View>
                                            <Text style={styles.heroStatLabel}>Avg Exam</Text>
                                            <Text style={styles.heroStatValue}>{examStats.avgPercentage || 0}%</Text>
                                        </View>
                                    </View>
                                    <View style={styles.heroDivider} />
                                    <View style={styles.heroStat}>
                                        <Target size={14} color="rgba(255,255,255,0.7)" />
                                        <View>
                                            <Text style={styles.heroStatLabel}>Pass Rate</Text>
                                            <Text style={styles.heroStatValue}>{examStats.passRate || 0}%</Text>
                                        </View>
                                    </View>
                                </View>
                            </LinearGradient>
                        </Animated.View>

                        {/* ── Child Info Card ── */}
                        <Animated.View entering={FadeInDown.delay(140).duration(450)}>
                            <View style={styles.childCard}>
                                <View style={styles.childAvatar}>
                                    <User size={18} color="#0469ff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.childName}>{childData.name}</Text>
                                    <Text style={styles.childMeta}>
                                        Class {childData.class} – {childData.section}{'  ·  '}Roll #{childData.rollNo}
                                    </Text>
                                </View>
                                <View style={styles.activeBadge}>
                                    <TrendingUp size={12} color="#0469ff" />
                                    <Text style={styles.activeBadgeText}>Active</Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* ── Info note — mirrors PayFees infoCard ── */}
                        <Animated.View entering={FadeInDown.delay(160).duration(400)}>
                            <View style={styles.infoCard}>
                                <View style={styles.infoIconBg}>
                                    <BarChart3 size={16} color="#0469ff" />
                                </View>
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoTitle}>Score Calculation</Text>
                                    <Text style={styles.infoText}>Overall score is weighted: 40% attendance + 60% exam performance.</Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* ── Attendance This Month ── */}
                        <Animated.View entering={FadeInDown.delay(200).duration(450)}>
                            <View style={styles.sectionCard}>
                                <View style={styles.sectionTitleRow}>
                                    <View style={[styles.sectionIconBadge, { backgroundColor: '#EFF6FF' }]}>
                                        <Calendar size={15} color="#0469ff" />
                                    </View>
                                    <Text style={styles.sectionTitle}>Attendance — This Month</Text>
                                </View>

                                <View style={styles.pillsRow}>
                                    <AttendancePill
                                        icon={BarChart3}
                                        value={`${attendancePct}%`}
                                        label="Rate"
                                        bg="#EFF6FF"
                                        color="#0469ff"
                                    />
                                    <AttendancePill
                                        icon={CheckCircle}
                                        value={monthlyStats.totalPresent || 0}
                                        label="Present"
                                        bg="#F0FDF4"
                                        color="#10B981"
                                    />
                                    <AttendancePill
                                        icon={XCircle}
                                        value={monthlyStats.totalAbsent || 0}
                                        label="Absent"
                                        bg="#FFF1F2"
                                        color="#EF4444"
                                    />
                                    <AttendancePill
                                        icon={Clock}
                                        value={monthlyStats.totalLate || 0}
                                        label="Late"
                                        bg="#FFFBEB"
                                        color="#D97706"
                                    />
                                </View>

                                <View style={styles.footerRow}>
                                    <Text style={styles.footerLabel}>Total Working Days</Text>
                                    <View style={styles.footerChip}>
                                        <Text style={styles.footerChipText}>
                                            {monthlyStats.totalWorkingDays || 0} days
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </Animated.View>

                        {/* ── Yearly Summary ── */}
                        {yearlyAggregate.totalWorkingDays > 0 && (
                            <Animated.View entering={FadeInDown.delay(260).duration(450)}>
                                <View style={styles.sectionCard}>
                                    <View style={styles.sectionTitleRow}>
                                        <View style={[styles.sectionIconBadge, { backgroundColor: '#F5F3FF' }]}>
                                            <Target size={15} color="#7C3AED" />
                                        </View>
                                        <Text style={styles.sectionTitle}>Yearly Summary</Text>
                                    </View>

                                    <View style={styles.yearlyRow}>
                                        {[
                                            { val: yearlyAggregate.totalPresent || 0, label: 'Present', color: '#10B981' },
                                            { val: yearlyAggregate.totalAbsent || 0, label: 'Absent', color: '#EF4444' },
                                            { val: yearlyAggregate.totalWorkingDays || 0, label: 'Working Days', color: '#7C3AED' },
                                        ].map((item, i, arr) => (
                                            <React.Fragment key={item.label}>
                                                <View style={styles.yearlyStat}>
                                                    <Text style={[styles.yearlyVal, { color: item.color }]}>
                                                        {item.val}
                                                    </Text>
                                                    <Text style={styles.yearlyLabel}>{item.label}</Text>
                                                </View>
                                                {i < arr.length - 1 && <View style={styles.yearlyDivider} />}
                                            </React.Fragment>
                                        ))}
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* ── Exam Performance ── */}
                        <Animated.View entering={FadeInDown.delay(320).duration(450)}>
                            <View style={styles.sectionCard}>
                                <View style={styles.sectionTitleRow}>
                                    <View style={[styles.sectionIconBadge, { backgroundColor: '#FFF7ED' }]}>
                                        <BookOpen size={15} color="#EA580C" />
                                    </View>
                                    <Text style={styles.sectionTitle}>Exam Performance</Text>
                                </View>

                                {/* Stat boxes — same pattern as PayFees examRow */}
                                <View style={styles.examBoxRow}>
                                    {[
                                        { val: examStats.totalExams || 0, label: 'Exams Taken', color: '#0469ff', bg: '#EFF6FF' },
                                        { val: `${examStats.avgPercentage || 0}%`, label: 'Avg Score', color: '#10B981', bg: '#F0FDF4' },
                                        { val: `${examStats.passRate || 0}%`, label: 'Pass Rate', color: '#D97706', bg: '#FFFBEB' },
                                    ].map((item) => (
                                        <View key={item.label} style={[styles.examBox, { backgroundColor: item.bg }]}>
                                            <Text style={[styles.examBoxVal, { color: item.color }]}>{item.val}</Text>
                                            <Text style={styles.examBoxLabel}>{item.label}</Text>
                                        </View>
                                    ))}
                                </View>

                                {/* Recent exams list */}
                                {recentExams.length > 0 && (
                                    <View style={styles.recentWrap}>
                                        <Text style={styles.recentHeading}>Recent Exams</Text>
                                        {recentExams.map((exam, idx) => {
                                            const color = getScoreColor(exam.percentage);
                                            return (
                                                <Animated.View
                                                    key={exam.examId + (exam.attemptId || '')}
                                                    entering={FadeInRight.delay(370 + idx * 55).duration(400)}
                                                >
                                                    <View style={[
                                                        styles.examRow,
                                                        idx === recentExams.length - 1 && { borderBottomWidth: 0 }
                                                    ]}>
                                                        <View style={[styles.examIndex, { backgroundColor: color + '18' }]}>
                                                            <Text style={[styles.examIndexText, { color }]}>
                                                                {String(idx + 1).padStart(2, '0')}
                                                            </Text>
                                                        </View>
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.examName} numberOfLines={1}>
                                                                {exam.examTitle}
                                                            </Text>
                                                            <Text style={styles.examMeta}>
                                                                {exam.examType} · {exam.subjects?.length || 0} subjects
                                                            </Text>
                                                        </View>
                                                        <View style={[styles.scorePill, { backgroundColor: color + '15' }]}>
                                                            <Text style={[styles.scorePillText, { color }]}>
                                                                {exam.percentage}%
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </Animated.View>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        </Animated.View>

                        {/* ── Insights — yellow gradient card ── */}
                        <Animated.View entering={FadeInDown.delay(400).duration(450)}>
                            <LinearGradient
                                colors={['#FFFBEB', '#FEF3C7']}
                                style={styles.insightCard}
                            >
                                <View style={styles.insightHeader}>
                                    <View style={styles.insightIconWrap}>
                                        <Award size={16} color="#D97706" />
                                    </View>
                                    <Text style={styles.insightTitle}>Performance Insights</Text>
                                </View>

                                <View style={styles.insightList}>
                                    {monthlyStats.attendancePercentage >= 90 && (
                                        <View style={styles.insightRow}>
                                            <View style={[styles.insightDot, { backgroundColor: '#10B981' }]} />
                                            <Text style={styles.insightText}>Excellent attendance this month! 🌟</Text>
                                        </View>
                                    )}
                                    {monthlyStats.attendancePercentage < 75 && monthlyStats.attendancePercentage > 0 && (
                                        <View style={styles.insightRow}>
                                            <View style={[styles.insightDot, { backgroundColor: '#EF4444' }]} />
                                            <Text style={styles.insightText}>Attendance below 75% — needs attention</Text>
                                        </View>
                                    )}
                                    {examStats.avgPercentage >= 80 && (
                                        <View style={styles.insightRow}>
                                            <View style={[styles.insightDot, { backgroundColor: '#10B981' }]} />
                                            <Text style={styles.insightText}>Great exam performance! Keep it up! 📚</Text>
                                        </View>
                                    )}
                                    {examStats.passRate < 100 && examStats.totalExams > 0 && (
                                        <View style={styles.insightRow}>
                                            <View style={[styles.insightDot, { backgroundColor: '#F59E0B' }]} />
                                            <Text style={styles.insightText}>
                                                Passed {examStats.totalPassed}/{examStats.totalExams} exams — room to grow
                                            </Text>
                                        </View>
                                    )}
                                    {examStats.totalExams === 0 && (
                                        <View style={styles.insightRow}>
                                            <View style={[styles.insightDot, { backgroundColor: '#0469ff' }]} />
                                            <Text style={styles.insightText}>No exam results available yet</Text>
                                        </View>
                                    )}
                                </View>
                            </LinearGradient>
                        </Animated.View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FAFAFA',
    },

    // ── Header — exact match to PayFees ──
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
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
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#888',
        marginTop: 2,
    },

    // ── Scroll ──
    content: {
        flex: 1,
        paddingHorizontal: 16,
    },

    // ── Loading ──
    loadingContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: '#888',
    },

    // ── Empty ──
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingHorizontal: 40,
    },
    emptyIconWrap: {
        width: 72,
        height: 72,
        borderRadius: 24,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    emptySubtitle: {
        fontSize: 13,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 20,
    },

    // ── Hero card — mirrors PayFees heroCard exactly ──
    heroCard: {
        borderRadius: 24,
        padding: 22,
        marginTop: 20,
        marginBottom: 16,
        overflow: 'hidden',
        elevation: 8,
        shadowColor: '#0469ff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
    },
    heroCircle1: {
        position: 'absolute',
        top: -50,
        right: -50,
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: 'rgba(255,255,255,0.07)',
    },
    heroCircle2: {
        position: 'absolute',
        bottom: -40,
        left: -30,
        width: 130,
        height: 130,
        borderRadius: 65,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    heroTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    heroLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.75)',
        fontWeight: '500',
    },
    heroAmount: {
        fontSize: 52,
        fontWeight: '800',
        color: '#fff',
        marginTop: 2,
        letterSpacing: -2,
        lineHeight: 56,
    },
    heroScoreSubtext: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '500',
        marginTop: 2,
    },
    heroBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    heroBadgeText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '700',
    },

    // Progress bar — exact PayFees match
    progressWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
    },
    progressTrack: {
        flex: 1,
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#fff',
        borderRadius: 3,
    },
    progressPct: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        fontWeight: '600',
        minWidth: 72,
        textAlign: 'right',
    },

    // Stats row — exact PayFees heroRow match
    heroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: 14,
        borderRadius: 16,
    },
    heroStat: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    heroDivider: {
        width: 1,
        height: 30,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginHorizontal: 4,
    },
    heroStatLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        marginBottom: 2,
    },
    heroStatValue: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },

    // ── Child info card ──
    childCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    childAvatar: {
        width: 40,
        height: 40,
        borderRadius: 14,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    childName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111',
        letterSpacing: -0.2,
    },
    childMeta: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 2,
        fontWeight: '500',
    },
    activeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    activeBadgeText: {
        fontSize: 11,
        color: '#0469ff',
        fontWeight: '700',
    },

    // ── Info card — exact PayFees match ──
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        backgroundColor: '#EFF6FF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#DBEAFE',
        marginBottom: 14,
    },
    infoIconBg: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoContent: { flex: 1 },
    infoTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1E3A8A',
    },
    infoText: {
        fontSize: 12,
        color: '#1E40AF',
        marginTop: 2,
        lineHeight: 16,
    },

    // ── Section card — matches PayFees monthCard style ──
    sectionCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 18,
        marginBottom: 14,
        overflow: 'hidden',
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
    },
    sectionIconBadge: {
        width: 30,
        height: 30,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111',
        letterSpacing: -0.2,
    },

    // Attendance pills row
    pillsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 14,
    },

    // Footer row — matches PayFees monthFooter
    footerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
    },
    footerLabel: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
    },
    footerChip: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    footerChipText: {
        fontSize: 12,
        color: '#111',
        fontWeight: '700',
    },

    // ── Yearly ──
    yearlyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: 6,
    },
    yearlyStat: {
        alignItems: 'center',
        gap: 4,
    },
    yearlyVal: {
        fontSize: 26,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    yearlyLabel: {
        fontSize: 11,
        color: '#9CA3AF',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    yearlyDivider: {
        width: 1,
        height: 36,
        backgroundColor: '#E5E7EB',
    },

    // ── Exam boxes — matches PayFees examBox ──
    examBoxRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 2,
    },
    examBox: {
        flex: 1,
        borderRadius: 14,
        padding: 14,
        alignItems: 'center',
        gap: 5,
    },
    examBoxVal: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    examBoxLabel: {
        fontSize: 10,
        color: '#9CA3AF',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        textAlign: 'center',
    },

    // Recent exam list — matches PayFees feeItemRow
    recentWrap: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    recentHeading: {
        fontSize: 11,
        fontWeight: '700',
        color: '#9CA3AF',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    examRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    examIndex: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    examIndexText: {
        fontSize: 12,
        fontWeight: '800',
    },
    examName: {
        fontSize: 13,
        fontWeight: '700',
        color: '#111',
    },
    examMeta: {
        fontSize: 11,
        color: '#9CA3AF',
        marginTop: 2,
        fontWeight: '500',
    },
    scorePill: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 10,
    },
    scorePillText: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: -0.3,
    },

    // ── Insights card ──
    insightCard: {
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: '#FDE68A',
        marginBottom: 4,
    },
    insightHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    insightIconWrap: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#FEF3C7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    insightTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#92400E',
        letterSpacing: -0.2,
    },
    insightList: {
        gap: 10,
    },
    insightRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    insightDot: {
        width: 7,
        height: 7,
        borderRadius: 4,
    },
    insightText: {
        fontSize: 13,
        color: '#78350F',
        flex: 1,
        fontWeight: '500',
        lineHeight: 18,
    },
});