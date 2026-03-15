// Parent view for child's attendance with Monthly Trend Graph
// Optimized: Single API call for full year, client-side filtering
import React, { useState, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Dimensions,
    ActivityIndicator,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Calendar as CalendarIcon,
    TrendingUp,
    Award,
    AlertCircle,
    CheckCircle,
    XCircle,
    Clock,
    ChevronLeft,
    ChevronRight,
    ArrowLeft,
    Sparkles,
    BarChart3
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

// ─── Date Helpers (unchanged) ────────────────────────────────────────────────

const getISTDateString = (dateInput = new Date()) => {
    let date;
    if (typeof dateInput === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
        date = new Date(dateInput);
    } else {
        date = new Date(dateInput);
    }
    if (isNaN(date.getTime())) return null;
    const offset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + offset);
    return istDate.toISOString().split('T')[0];
};

const formatIST = (dateString) =>
    new Date(dateString).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });

const formatISTTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Status Helpers ──────────────────────────────────────────────────────────

const getStatusColor = (status) => {
    switch (status) {
        case 'PRESENT': return '#51CF66';
        case 'ABSENT': return '#FF6B6B';
        case 'LATE': return '#FFB020';
        case 'HALF_DAY': return '#FF8C42';
        case 'ON_LEAVE': return '#8B5CF6';
        default: return '#94A3B8';
    }
};

const getStatusConfig = (status) => {
    const configs = {
        PRESENT: { color: '#51CF66', icon: CheckCircle, bg: '#E7F5E9' },
        ABSENT: { color: '#FF6B6B', icon: XCircle, bg: '#FFE9E9' },
        LATE: { color: '#FFB020', icon: Clock, bg: '#FFF9E0' },
        HALF_DAY: { color: '#FF8C42', icon: Clock, bg: '#FFE9D6' },
        ON_LEAVE: { color: '#8B5CF6', icon: AlertCircle, bg: '#F3E8FF' },
        HOLIDAY: { color: '#9CA3AF', icon: Sparkles, bg: '#F3F4F6' },
    };
    return configs[status] || { color: '#94A3B8', icon: AlertCircle, bg: '#F1F5F9' };
};

const getDayBorderColor = (dayData) => {
    if (!dayData?.attendance) return 'transparent';
    return getStatusColor(dayData.attendance.status);
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const SectionCard = ({ children, style }) => (
    <View style={[cardStyle.card, style]}>{children}</View>
);

const cardStyle = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
});

const SectionHeader = ({ title, right }) => (
    <View style={shStyle.row}>
        <Text style={shStyle.title}>{title}</Text>
        {right}
    </View>
);

const shStyle = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        marginTop: 4,
    },
    title: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
        letterSpacing: -0.2,
    },
});

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ParentAttendanceView() {
    const params = useLocalSearchParams();
    const childData = params.childData ? JSON.parse(params.childData) : null;
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();

    const [refreshing, setRefreshing] = useState(false);
    const [graphPeriod, setGraphPeriod] = useState('30d');
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        const offset = 5.5 * 60 * 60 * 1000;
        const ist = new Date(now.getTime() + offset);
        return new Date(ist.getFullYear(), ist.getMonth(), 1);
    });

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const studentId = childData?.studentId;

    const { data: fullYearData, isLoading } = useQuery({
        queryKey: ['child-attendance-full', studentId, schoolId],
        queryFn: async () => {
            if (!studentId || !schoolId) return null;
            const res = await api.get(
                `/schools/${schoolId}/attendance/stats?userId=${studentId}&fullYear=true`
            );
            return res.data;
        },
        enabled: !!studentId && !!schoolId,
        staleTime: 0,
        cacheTime: 1000 * 60 * 5,
    });

    const overallStats = fullYearData?.overallStats;
    const allAttendance = fullYearData?.allAttendance || [];

    const monthlyAttendance = useMemo(() => {
        if (!allAttendance.length) return [];
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        return allAttendance.filter(record => {
            const d = new Date(record.date);
            return d >= new Date(year, month, 1) && d <= new Date(year, month + 1, 0);
        });
    }, [allAttendance, currentMonth]);

    const currentMonthStats = useMemo(() => {
        if (!fullYearData?.monthlyStats) return null;
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth() + 1;
        return fullYearData.monthlyStats.find(s => s.month === month && s.year === year) || null;
    }, [fullYearData?.monthlyStats, currentMonth]);

    const weeklyData = useMemo(() => {
        if (!allAttendance.length) return null;
        const days = graphPeriod === '7d' ? 7 : graphPeriod === '30d' ? 30 : 90;
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - days + 1);

        const periodRecords = allAttendance
            .filter(r => { const d = new Date(r.date); return d >= startDate && d <= today; })
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        let presentCount = 0, absentCount = 0, lateCount = 0, leaveCount = 0;

        const dailyStatus = periodRecords.map(record => {
            const d = new Date(record.date);
            let status = 'none';
            if (record.status === 'PRESENT') { status = 'present'; presentCount++; }
            else if (record.status === 'ABSENT') { status = 'absent'; absentCount++; }
            else if (record.status === 'LATE' || record.status === 'HALF_DAY') { status = 'late'; lateCount++; }
            else if (record.status === 'ON_LEAVE') { status = 'leave'; leaveCount++; }
            return {
                date: d,
                dayName: d.toLocaleDateString('en-US', { weekday: 'short' }),
                dayNum: d.getDate(),
                month: d.toLocaleDateString('en-US', { month: 'short' }),
                status,
            };
        });

        return {
            days: dailyStatus.slice(-7),
            totalDays: periodRecords.length,
            presentCount,
            absentCount,
            lateCount,
            leaveCount,
            percentage: periodRecords.length > 0
                ? Math.round((presentCount + lateCount) / periodRecords.length * 100)
                : 0,
            periodLabel: graphPeriod === '7d' ? 'Last 7 Days' : graphPeriod === '30d' ? 'Last 30 Days' : 'Last 90 Days',
        };
    }, [allAttendance, graphPeriod]);

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const days = [];
        const firstDay = new Date(year, month, 1);
        for (let i = 0; i < firstDay.getDay(); i++) days.push({ date: null, isOtherMonth: true });
        const todayIST = getISTDateString();
        for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayData = monthlyAttendance.find(record => {
                const s = record.date;
                if (!s) return false;
                if (s === dateStr) return true;
                try { return getISTDateString(s) === dateStr; } catch { return false; }
            });
            days.push({ date: i, fullDate: dateStr, isToday: dateStr === todayIST, attendance: dayData });
        }
        return days;
    }, [currentMonth, monthlyAttendance]);

    const recentActivity = useMemo(() => allAttendance.slice(0, 7), [allAttendance]);

    const canGoBack = useMemo(() => {
        if (!fullYearData?.academicYear?.startDate) return true;
        const minDate = new Date(fullYearData.academicYear.startDate);
        return currentMonth > new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    }, [currentMonth, fullYearData]);

    const handlePrevMonth = () => {
        if (!canGoBack) return;
        const d = new Date(currentMonth);
        d.setMonth(d.getMonth() - 1);
        setCurrentMonth(d);
    };

    const handleNextMonth = () => {
        const d = new Date(currentMonth);
        d.setMonth(d.getMonth() + 1);
        setCurrentMonth(d);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: ['child-attendance-full'] });
        setRefreshing(false);
    }, [queryClient]);

    // Calendar day size based on insets
    const calendarWidth = SCREEN_WIDTH - 32 - insets.left - insets.right;
    const DAY_SIZE = calendarWidth / 7;

    // ── Error state ──────────────────────────────────────────────────────────
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
                        <Text style={styles.headerTitle}>Attendance</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyState}>
                    <View style={styles.emptyIconWrap}>
                        <AlertCircle size={32} color="#94A3B8" />
                    </View>
                    <Text style={styles.emptyTitle}>No child selected</Text>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.goBackBtn}>
                            <Text style={styles.goBackText}>Go Back</Text>
                        </View>
                    </HapticTouchable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            <StatusBar style="dark" />

            {/* ── Header ── */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Attendance</Text>
                    <Text style={styles.headerSubtitle}>
                        {childData.name} · {childData.class?.className}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[
                    styles.scrollContent,
                    {
                        paddingBottom: insets.bottom + 32,
                        paddingLeft: insets.left + 16,
                        paddingRight: insets.right + 16,
                    }
                ]}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
                }
            >
                {isLoading && !refreshing ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator size="large" color="#2563EB" />
                        <Text style={styles.loadingText}>Loading attendance…</Text>
                    </View>
                ) : !fullYearData?.overallStats ? (
                    <Animated.View entering={FadeInDown.delay(300)} style={styles.noDataCard}>
                        <View style={styles.emptyIconWrap}>
                            <AlertCircle size={28} color="#94A3B8" />
                        </View>
                        <Text style={styles.noDataText}>No attendance data available</Text>
                    </Animated.View>
                ) : (
                    <>
                        {/* ── Overall Stats ── */}
                        <Animated.View entering={FadeInDown.delay(80).duration(500)}>
                            <Text style={styles.eyebrow}>Academic Year Overview</Text>
                            <View style={styles.statsRow}>
                                <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.statCard}>
                                    <View style={styles.statIconWrap}>
                                        <TrendingUp size={18} color="rgba(255,255,255,0.9)" />
                                    </View>
                                    <Text style={styles.statValue}>
                                        {Math.round(fullYearData.overallStats.attendancePercentage)}%
                                    </Text>
                                    <Text style={styles.statLabel}>Attendance</Text>
                                </LinearGradient>

                                <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.statCard}>
                                    <View style={styles.statIconWrap}>
                                        <CheckCircle size={18} color="rgba(255,255,255,0.9)" />
                                    </View>
                                    <Text style={styles.statValue}>{fullYearData.overallStats.totalPresent}</Text>
                                    <Text style={styles.statLabel}>Present</Text>
                                </LinearGradient>

                                <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.statCard}>
                                    <View style={styles.statIconWrap}>
                                        <XCircle size={18} color="rgba(255,255,255,0.9)" />
                                    </View>
                                    <Text style={styles.statValue}>{fullYearData.overallStats.totalAbsent}</Text>
                                    <Text style={styles.statLabel}>Absent</Text>
                                </LinearGradient>
                            </View>
                        </Animated.View>

                        {/* ── Streak Card ── */}
                        {fullYearData.streak?.current > 0 && (
                            <Animated.View entering={FadeInDown.delay(150).duration(500)}>
                                <LinearGradient
                                    colors={['#FFB020', '#FF8C42']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.streakCard}
                                >
                                    <View style={styles.streakBubble} />
                                    <View style={styles.streakIconWrap}>
                                        <Award size={26} color="#fff" />
                                    </View>
                                    <View style={styles.streakInfo}>
                                        <Text style={styles.streakValue}>{fullYearData.streak.current} Days</Text>
                                        <Text style={styles.streakLabel}>Current Streak 🔥</Text>
                                    </View>
                                    <View style={styles.streakBadge}>
                                        <Sparkles size={12} color="#92400E" />
                                        <Text style={styles.streakBadgeText}>Best: {fullYearData.streak.longest}</Text>
                                    </View>
                                </LinearGradient>
                            </Animated.View>
                        )}

                        {/* ── Low Attendance Warning ── */}
                        {fullYearData.overallStats.attendancePercentage < 75 && (
                            <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                                <View style={styles.warningCard}>
                                    <View style={styles.warningIconWrap}>
                                        <AlertCircle size={22} color="#EF4444" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.warningTitle}>Low Attendance Alert</Text>
                                        <Text style={styles.warningMessage}>
                                            Overall attendance is {Math.round(fullYearData.overallStats.attendancePercentage)}%, below the required 75%
                                        </Text>
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* ── Calendar Section ── */}
                        <SectionHeader
                            title="Monthly Overview"
                            right={currentMonthStats && (
                                <View style={styles.monthStatChip}>
                                    <Text style={styles.monthStatText}>
                                        {currentMonthStats.totalPresent}P · {currentMonthStats.totalAbsent}A
                                    </Text>
                                </View>
                            )}
                        />

                        <Animated.View entering={FadeInDown.delay(280).duration(500)}>
                            <SectionCard style={styles.calendarCard}>
                                {/* Calendar header */}
                                <View style={styles.calendarHeader}>
                                    <Text style={styles.calendarTitle}>
                                        {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </Text>
                                    <View style={styles.calendarControls}>
                                        <HapticTouchable onPress={() => {
                                            const now = new Date();
                                            setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
                                        }}>
                                            <View style={styles.todayBtn}>
                                                <Text style={styles.todayBtnText}>Today</Text>
                                            </View>
                                        </HapticTouchable>
                                        <HapticTouchable style={{ opacity: canGoBack ? 1 : 0.3 }} onPress={handlePrevMonth}>
                                            <View style={styles.navBtn}>
                                                <ChevronLeft size={18} color="#64748B" />
                                            </View>
                                        </HapticTouchable>
                                        <HapticTouchable onPress={handleNextMonth}>
                                            <View style={styles.navBtn}>
                                                <ChevronRight size={18} color="#64748B" />
                                            </View>
                                        </HapticTouchable>
                                    </View>
                                </View>

                                {/* Weekday headers */}
                                <View style={styles.weekdayRow}>
                                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                                        <View
                                            key={i}
                                            style={[
                                                styles.weekdayCell,
                                                { width: DAY_SIZE },
                                                (i === 0 || i === 6) && styles.weekendHeader,
                                            ]}
                                        >
                                            <Text style={[
                                                styles.weekdayText,
                                                (i === 0 || i === 6) && styles.weekendText,
                                            ]}>{d}</Text>
                                        </View>
                                    ))}
                                </View>

                                {/* Calendar grid */}
                                <View style={styles.calendarGrid}>
                                    {calendarDays.map((day, idx) => {
                                        const isWeekend = day.fullDate &&
                                            ([0, 6].includes(new Date(day.fullDate).getDay()));
                                        const borderColor = day.isToday
                                            ? '#2563EB'
                                            : getDayBorderColor(day);
                                        const bgColor = day.isToday
                                            ? '#EFF6FF'
                                            : (isWeekend && !day.isOtherMonth ? '#F8FAFC' : '#fff');
                                        const isFuture = day.fullDate && day.fullDate > getISTDateString();

                                        return (
                                            <View
                                                key={idx}
                                                style={[
                                                    styles.dayCell,
                                                    {
                                                        width: DAY_SIZE - 4,
                                                        height: DAY_SIZE * 0.88,
                                                        borderColor,
                                                        backgroundColor: bgColor,
                                                        opacity: isFuture ? 0.45 : 1,
                                                    },
                                                    day.isOtherMonth && { opacity: 0 },
                                                ]}
                                            >
                                                {!day.isOtherMonth && (
                                                    <>
                                                        <Text style={[
                                                            styles.dayText,
                                                            day.isToday && styles.dayTextToday,
                                                            isFuture && styles.dayTextFuture,
                                                        ]}>
                                                            {day.date}
                                                        </Text>
                                                        {day.attendance && (
                                                            <View style={[
                                                                styles.eventDot,
                                                                { backgroundColor: getStatusColor(day.attendance.status) }
                                                            ]} />
                                                        )}
                                                    </>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>

                                {/* Legend */}
                                <View style={styles.legend}>
                                    {[
                                        { label: 'Present', color: '#51CF66' },
                                        { label: 'Absent', color: '#FF6B6B' },
                                        { label: 'Late', color: '#FFB020' },
                                        { label: 'Leave', color: '#8B5CF6' },
                                        { label: 'Holiday', color: '#9CA3AF' },
                                    ].map(item => (
                                        <View key={item.label} style={styles.legendItem}>
                                            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                                            <Text style={styles.legendText}>{item.label}</Text>
                                        </View>
                                    ))}
                                </View>
                            </SectionCard>
                        </Animated.View>

                        {/* ── Recent Activity ── */}
                        <SectionHeader
                            title="Recent Activity"
                            right={
                                <View style={styles.activityCountChip}>
                                    <Text style={styles.activityCountText}>{recentActivity.length} records</Text>
                                </View>
                            }
                        />

                        {recentActivity.map((record, idx) => {
                            const cfg = getStatusConfig(record.status);
                            const StatusIcon = cfg.icon;
                            return (
                                <Animated.View key={record.id} entering={FadeInRight.delay(350 + idx * 50)}>
                                    <View style={[styles.activityCard, { borderLeftColor: cfg.color }]}>
                                        <View style={[styles.activityIconWrap, { backgroundColor: cfg.bg }]}>
                                            <StatusIcon size={18} color={cfg.color} />
                                        </View>
                                        <View style={styles.activityContent}>
                                            <Text style={styles.activityDate}>{formatIST(record.date)}</Text>
                                            <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                                                <Text style={[styles.statusText, { color: cfg.color }]}>
                                                    {record.status}
                                                </Text>
                                            </View>
                                        </View>
                                        {record.checkInTime && (
                                            <View style={styles.timeWrap}>
                                                <Clock size={11} color="#94A3B8" />
                                                <Text style={styles.activityTime}>
                                                    {formatISTTime(record.checkInTime)}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </Animated.View>
                            );
                        })}
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
        backgroundColor: '#fff',
    },

    // Header (matches performance screen exactly)
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
    headerSubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },

    // Scroll
    scrollContent: {
        paddingTop: 16,
    },

    // Loading / empty
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
    noDataCard: {
        padding: 40,
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        marginTop: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    noDataText: {
        fontSize: 14,
        color: '#94A3B8',
        fontWeight: '500',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
    },
    emptyIconWrap: {
        width: 64,
        height: 64,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0F172A',
    },
    goBackBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#2563EB',
        borderRadius: 14,
    },
    goBackText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '700',
    },

    // Eyebrow label
    eyebrow: {
        fontSize: 11,
        fontWeight: '700',
        color: '#94A3B8',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 10,
    },

    // Overall stats row
    statsRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 14,
    },
    statCard: {
        flex: 1,
        borderRadius: 18,
        padding: 14,
        alignItems: 'center',
        gap: 7,
    },
    statIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -0.5,
    },
    statLabel: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.85)',
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
    },

    // Streak card
    streakCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 20,
        padding: 18,
        marginBottom: 14,
        overflow: 'hidden',
        gap: 14,
    },
    streakBubble: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.08)',
        top: -30,
        right: -20,
    },
    streakIconWrap: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    streakInfo: {
        flex: 1,
        gap: 3,
    },
    streakValue: {
        fontSize: 22,
        fontWeight: '800',
        color: '#fff',
        letterSpacing: -0.5,
    },
    streakLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        fontWeight: '600',
    },
    streakBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: '#FDE047',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
    },
    streakBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#92400E',
    },

    // Warning
    warningCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 16,
        backgroundColor: '#FFE9E9',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FFD6D6',
        marginBottom: 14,
    },
    warningIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    warningTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#991B1B',
        marginBottom: 3,
    },
    warningMessage: {
        fontSize: 12,
        color: '#991B1B',
        lineHeight: 18,
        fontWeight: '500',
    },

    // Month stat chip
    monthStatChip: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    monthStatText: {
        fontSize: 12,
        color: '#2563EB',
        fontWeight: '700',
    },

    // Activity count chip
    activityCountChip: {
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
    },
    activityCountText: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '600',
    },

    // Calendar card overrides
    calendarCard: {
        padding: 16,
    },
    calendarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    calendarTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
        letterSpacing: -0.2,
    },
    calendarControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    todayBtn: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: '#EFF6FF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    todayBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#2563EB',
    },
    navBtn: {
        width: 30,
        height: 30,
        borderRadius: 10,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },

    // Weekday row
    weekdayRow: {
        flexDirection: 'row',
        marginBottom: 6,
    },
    weekdayCell: {
        alignItems: 'center',
        paddingVertical: 7,
    },
    weekendHeader: {
        backgroundColor: '#F8FAFC',
        borderRadius: 6,
    },
    weekdayText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#94A3B8',
        textTransform: 'uppercase',
    },
    weekendText: {
        color: '#CBD5E1',
    },

    // Calendar grid
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    dayCell: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderRadius: 8,
        gap: 2,
    },
    dayText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0F172A',
    },
    dayTextToday: {
        color: '#2563EB',
        fontWeight: '800',
    },
    dayTextFuture: {
        color: '#CBD5E1',
        textDecorationLine: 'line-through',
    },
    eventDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
    },

    // Legend
    legend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-around',
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: '#E2E8F0',
        gap: 8,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    legendText: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '600',
    },

    // Activity cards
    activityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 8,
        gap: 12,
    },
    activityIconWrap: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activityContent: {
        flex: 1,
        gap: 5,
    },
    activityDate: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0F172A',
    },
    statusBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 7,
    },
    statusText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    timeWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#F1F5F9',
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 8,
    },
    activityTime: {
        fontSize: 11,
        color: '#64748B',
        fontWeight: '600',
    },
});