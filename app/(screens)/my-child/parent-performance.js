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
    Star,
    User,
    Calendar,
    TrendingUp,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// 16px padding each side, 18px card padding each side, 3 gaps × 8px
const PILL_WIDTH = (SCREEN_WIDTH - 32 - 36 - 24) / 4;

// ─── Helpers ────────────────────────────────────────────────────────────────

const getScoreColor = (score) => {
    if (score >= 80) return '#00C48C';
    if (score >= 60) return '#2563EB';
    if (score >= 40) return '#F59E0B';
    return '#EF4444';
};

const getScoreGradient = (score) => {
    if (score >= 80) return ['#00C48C', '#00A37A'];
    if (score >= 60) return ['#2563EB', '#1D4ED8'];
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

const ScoreRing = ({ score, size = 96 }) => {
    const color = getScoreColor(score);
    const r = (size / 2) - 6;
    const circumference = 2 * Math.PI * r;
    const dash = (score / 100) * circumference;

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Background ring */}
            <View style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 6,
                borderColor: 'rgba(255,255,255,0.2)',
            }} />
            {/* Score text */}
            <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -1 }}>
                    {score}
                </Text>
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginTop: -2 }}>
                    / 100
                </Text>
            </View>
        </View>
    );
};

const AttendancePill = ({ icon: Icon, value, label, bg, color }) => (
    <View style={[pillStyles.container, { backgroundColor: bg, width: PILL_WIDTH }]}>
        <View style={[pillStyles.iconWrap, { backgroundColor: color + '25' }]}>
            <Icon size={18} color={color} />
        </View>
        <Text style={[pillStyles.value, { color }]}>{value}</Text>
        <Text style={pillStyles.label}>{label}</Text>
    </View>
);

const pillStyles = StyleSheet.create({
    container: {
        borderRadius: 16,
        paddingVertical: 16,
        paddingHorizontal: 8,
        alignItems: 'center',
        gap: 7,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.04)',
    },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    value: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    label: {
        fontSize: 10,
        color: '#9CA3AF',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },
});

const SectionCard = ({ children, style }) => (
    <View style={[sectionStyles.card, style]}>{children}</View>
);

const SectionTitle = ({ icon: Icon, iconColor, label }) => (
    <View style={sectionStyles.titleRow}>
        <View style={[sectionStyles.iconBadge, { backgroundColor: iconColor + '18' }]}>
            <Icon size={15} color={iconColor} />
        </View>
        <Text style={sectionStyles.titleText}>{label}</Text>
    </View>
);

const sectionStyles = StyleSheet.create({
    card: {
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
    },
    iconBadge: {
        width: 30,
        height: 30,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0F172A',
        letterSpacing: -0.2,
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

    const isLoading = attendanceLoading || examLoading;

    const monthlyStats = attendanceData?.monthlyStats || {};
    const yearlyAggregate = attendanceData?.yearlyAggregate || {};
    const examStats = examData?.stats || {};
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

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['parent-performance-attendance']),
            queryClient.invalidateQueries(['parent-performance-exams']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    // ── Error state ──
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

            {/* ── Header ── */}
            <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Performance</Text>
                    <Text style={styles.headerSub}>{childData.name}</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[
                    styles.scrollContent,
                    { paddingBottom: insets.bottom + 24 }
                ]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#2563EB"
                    />
                }
            >
                {isLoading ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={styles.loadingText}>Loading performance…</Text>
                    </View>
                ) : (
                    <>
                        {/* ── Hero Score Card ── */}
                        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
                            <LinearGradient
                                colors={getScoreGradient(overallScore)}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.heroCard}
                            >
                                {/* Decorative circles */}
                                <View style={styles.heroBubble1} />
                                <View style={styles.heroBubble2} />

                                <View style={styles.heroTop}>
                                    <ScoreRing score={overallScore} />
                                    <View style={styles.heroMeta}>
                                        <View style={styles.heroBadge}>
                                            <Star size={11} color="#fff" fill="#fff" />
                                            <Text style={styles.heroBadgeText}>Overall Score</Text>
                                        </View>
                                        <Text style={styles.heroLabel}>{getScoreLabel(overallScore)}</Text>
                                        <Text style={styles.heroDesc}>
                                            Attendance 40% · Exams 60%
                                        </Text>
                                    </View>
                                </View>

                                {/* Mini stats row */}
                                <View style={styles.heroStatsRow}>
                                    <View style={styles.heroStat}>
                                        <Text style={styles.heroStatVal}>
                                            {Math.round(monthlyStats.attendancePercentage || 0)}%
                                        </Text>
                                        <Text style={styles.heroStatLabel}>Attendance</Text>
                                    </View>
                                    <View style={styles.heroStatDivider} />
                                    <View style={styles.heroStat}>
                                        <Text style={styles.heroStatVal}>
                                            {examStats.avgPercentage || 0}%
                                        </Text>
                                        <Text style={styles.heroStatLabel}>Avg Exam</Text>
                                    </View>
                                    <View style={styles.heroStatDivider} />
                                    <View style={styles.heroStat}>
                                        <Text style={styles.heroStatVal}>
                                            {examStats.passRate || 0}%
                                        </Text>
                                        <Text style={styles.heroStatLabel}>Pass Rate</Text>
                                    </View>
                                </View>
                            </LinearGradient>
                        </Animated.View>

                        {/* ── Child Info ── */}
                        <Animated.View entering={FadeInDown.delay(140).duration(450)}>
                            <View style={styles.childCard}>
                                <View style={styles.childAvatar}>
                                    <User size={18} color="#2563EB" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.childName}>{childData.name}</Text>
                                    <Text style={styles.childMeta}>
                                        Class {childData.class} – {childData.section}
                                        {'  ·  '}
                                        Roll #{childData.rollNo}
                                    </Text>
                                </View>
                                <View style={styles.childChip}>
                                    <TrendingUp size={12} color="#2563EB" />
                                    <Text style={styles.childChipText}>Active</Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* ── Attendance This Month ── */}
                        <Animated.View entering={FadeInDown.delay(200).duration(450)}>
                            <SectionCard>
                                <SectionTitle icon={Calendar} iconColor="#2563EB" label="Attendance — This Month" />
                                <View style={styles.pillsRow}>
                                    <AttendancePill
                                        icon={BarChart3}
                                        value={`${Math.round(monthlyStats.attendancePercentage || 0)}%`}
                                        label="Rate"
                                        bg="#EFF6FF"
                                        color="#2563EB"
                                    />
                                    <AttendancePill
                                        icon={CheckCircle}
                                        value={monthlyStats.totalPresent || 0}
                                        label="Present"
                                        bg="#F0FDF4"
                                        color="#16A34A"
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
                                <View style={styles.dividerRow}>
                                    <Text style={styles.dividerLabel}>Total Working Days</Text>
                                    <View style={styles.dividerChip}>
                                        <Text style={styles.dividerChipText}>
                                            {monthlyStats.totalWorkingDays || 0} days
                                        </Text>
                                    </View>
                                </View>
                            </SectionCard>
                        </Animated.View>

                        {/* ── Yearly Summary ── */}
                        {yearlyAggregate.totalWorkingDays > 0 && (
                            <Animated.View entering={FadeInDown.delay(260).duration(450)}>
                                <SectionCard>
                                    <SectionTitle icon={Target} iconColor="#7C3AED" label="Yearly Summary" />
                                    <View style={styles.yearlyRow}>
                                        {[
                                            { val: yearlyAggregate.totalPresent || 0, label: 'Present', color: '#16A34A' },
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
                                </SectionCard>
                            </Animated.View>
                        )}

                        {/* ── Exam Performance ── */}
                        <Animated.View entering={FadeInDown.delay(320).duration(450)}>
                            <SectionCard>
                                <SectionTitle icon={BookOpen} iconColor="#EA580C" label="Exam Performance" />

                                <View style={styles.examRow}>
                                    {[
                                        { val: examStats.totalExams || 0, label: 'Exams Taken', color: '#2563EB', bg: '#EFF6FF' },
                                        { val: `${examStats.avgPercentage || 0}%`, label: 'Avg Score', color: '#16A34A', bg: '#F0FDF4' },
                                        { val: `${examStats.passRate || 0}%`, label: 'Pass Rate', color: '#D97706', bg: '#FFFBEB' },
                                    ].map((item) => (
                                        <View key={item.label} style={[styles.examBox, { backgroundColor: item.bg }]}>
                                            <Text style={[styles.examVal, { color: item.color }]}>{item.val}</Text>
                                            <Text style={styles.examLabel}>{item.label}</Text>
                                        </View>
                                    ))}
                                </View>

                                {recentExams.length > 0 && (
                                    <View style={styles.recentWrap}>
                                        <Text style={styles.recentHeading}>Recent Exams</Text>
                                        {recentExams.map((exam, idx) => (
                                            <Animated.View
                                                key={exam.examId + (exam.attemptId || '')}
                                                entering={FadeInRight.delay(370 + idx * 55).duration(400)}
                                            >
                                                <View style={[
                                                    styles.examRow2,
                                                    idx === recentExams.length - 1 && { borderBottomWidth: 0 }
                                                ]}>
                                                    <View style={[
                                                        styles.examIndexBadge,
                                                        { backgroundColor: getScoreColor(exam.percentage) + '18' }
                                                    ]}>
                                                        <Text style={[
                                                            styles.examIndexText,
                                                            { color: getScoreColor(exam.percentage) }
                                                        ]}>
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
                                                    <View style={[
                                                        styles.scorePill,
                                                        { backgroundColor: getScoreColor(exam.percentage) + '15' }
                                                    ]}>
                                                        <Text style={[
                                                            styles.scorePillText,
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
                            </SectionCard>
                        </Animated.View>

                        {/* ── Insights ── */}
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
                                            <View style={[styles.insightDot, { backgroundColor: '#16A34A' }]} />
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
                                            <View style={[styles.insightDot, { backgroundColor: '#16A34A' }]} />
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
                                            <View style={[styles.insightDot, { backgroundColor: '#2563EB' }]} />
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
        backgroundColor: '#FFFFFF',
    },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 14,
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
    headerSub: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },

    // Scroll
    scrollContent: {
        padding: 16,
        gap: 0,
    },

    // Loading
    loadingWrap: {
        paddingVertical: 80,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 13,
        color: '#94A3B8',
        fontWeight: '500',
    },

    // Empty
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

    // Hero card
    heroCard: {
        borderRadius: 24,
        padding: 20,
        marginBottom: 14,
        overflow: 'hidden',
    },
    heroBubble1: {
        position: 'absolute',
        width: 160,
        height: 160,
        borderRadius: 80,
        backgroundColor: 'rgba(255,255,255,0.08)',
        top: -40,
        right: -40,
    },
    heroBubble2: {
        position: 'absolute',
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.06)',
        bottom: -20,
        left: 20,
    },
    heroTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
        marginBottom: 18,
    },
    heroMeta: {
        flex: 1,
        gap: 5,
    },
    heroBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        alignSelf: 'flex-start',
    },
    heroBadgeText: {
        fontSize: 10,
        color: '#fff',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    heroLabel: {
        fontSize: 22,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -0.5,
    },
    heroDesc: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.75)',
        fontWeight: '500',
    },
    heroStatsRow: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0,0,0,0.12)',
        borderRadius: 16,
        padding: 14,
    },
    heroStat: {
        flex: 1,
        alignItems: 'center',
        gap: 3,
    },
    heroStatVal: {
        fontSize: 17,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -0.5,
    },
    heroStatLabel: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    heroStatDivider: {
        width: 1,
        height: 30,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },

    // Child card
    childCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        backgroundColor: '#F8FAFC',
        borderRadius: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
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
        color: '#0F172A',
        letterSpacing: -0.2,
    },
    childMeta: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 2,
        fontWeight: '500',
    },
    childChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
    },
    childChipText: {
        fontSize: 11,
        color: '#2563EB',
        fontWeight: '700',
    },

    // Pills row (attendance)
    pillsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 14,
    },

    // Divider row
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    dividerLabel: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    dividerChip: {
        backgroundColor: '#E2E8F0',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    dividerChipText: {
        fontSize: 12,
        color: '#0F172A',
        fontWeight: '700',
    },

    // Yearly
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
        fontSize: 24,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    yearlyLabel: {
        fontSize: 11,
        color: '#94A3B8',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    yearlyDivider: {
        width: 1,
        height: 36,
        backgroundColor: '#E2E8F0',
    },

    // Exam boxes
    examRow: {
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
    examVal: {
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    examLabel: {
        fontSize: 10,
        color: '#94A3B8',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.3,
        textAlign: 'center',
    },

    // Recent exams list
    recentWrap: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
    },
    recentHeading: {
        fontSize: 11,
        fontWeight: '700',
        color: '#94A3B8',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 12,
    },
    examRow2: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    examIndexBadge: {
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
        color: '#0F172A',
    },
    examMeta: {
        fontSize: 11,
        color: '#94A3B8',
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

    // Insights
    insightCard: {
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: '#FDE68A',
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