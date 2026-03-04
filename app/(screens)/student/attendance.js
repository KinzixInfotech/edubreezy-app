// app/(screens)/student/attendance.js
// Student Attendance Screen - Matches parent child attendance UI
// Uses fullYear=true API for accurate real-time data
import React, { useState, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Dimensions,
} from 'react-native';
import { AttendanceSkeleton } from '../../components/ScreenSkeleton';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
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
    Flame,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

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

const formatIST = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

const formatISTTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_WIDTH = SCREEN_WIDTH - 32;
const CALENDAR_DAY_SIZE = CALENDAR_WIDTH / 7;

export default function StudentAttendanceScreen() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        const offset = 5.5 * 60 * 60 * 1000;
        const ist = new Date(now.getTime() + offset);
        return new Date(ist.getFullYear(), ist.getMonth(), 1);
    });

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
    const userId = userData?.studentData?.userId || userData?.studentdatafull?.userId || userData?.id;

    // Single API call for entire academic year
    const { data: fullYearData, isLoading } = useQuery({
        queryKey: ['student-attendance-full', userId, schoolId],
        queryFn: async () => {
            if (!userId || !schoolId) return null;
            const res = await api.get(
                `/schools/${schoolId}/attendance/stats?userId=${userId}&fullYear=true`
            );
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 0,
        gcTime: 1000 * 60 * 5,
    });

    const overallStats = fullYearData?.overallStats;
    const allAttendance = fullYearData?.allAttendance || [];
    const streak = fullYearData?.streak;

    // Filter attendance for current month view (client-side)
    const monthlyAttendance = useMemo(() => {
        if (!allAttendance.length) return [];
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const monthStart = new Date(year, month, 1);
        const monthEnd = new Date(year, month + 1, 0);
        return allAttendance.filter(record => {
            const recordDate = new Date(record.date);
            return recordDate >= monthStart && recordDate <= monthEnd;
        });
    }, [allAttendance, currentMonth]);

    // Get monthly stats from API data
    const currentMonthStats = useMemo(() => {
        if (!fullYearData?.monthlyStats) return null;
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth() + 1;
        return fullYearData.monthlyStats.find(
            stat => stat.month === month && stat.year === year
        ) || null;
    }, [fullYearData?.monthlyStats, currentMonth]);

    // Calendar days generation
    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const days = [];
        const firstDay = new Date(year, month, 1);

        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push({ date: null, isOtherMonth: true });
        }

        const todayIST = getISTDateString();

        for (let i = 1; i <= new Date(year, month + 1, 0).getDate(); i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayData = monthlyAttendance.find(record => {
                const serverDate = record.date;
                if (!serverDate) return false;
                if (serverDate === dateStr) return true;
                if (typeof serverDate === 'string' && serverDate.includes('T')) {
                    return getISTDateString(serverDate) === dateStr;
                }
                try {
                    return getISTDateString(serverDate) === dateStr;
                } catch (e) {
                    return false;
                }
            });

            days.push({
                date: i,
                fullDate: dateStr,
                isToday: dateStr === todayIST,
                attendance: dayData
            });
        }

        return days;
    }, [currentMonth, monthlyAttendance]);

    // Recent activity (last 7 records)
    const recentActivity = useMemo(() => {
        return allAttendance.slice(0, 7);
    }, [allAttendance]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: ['student-attendance-full'] });
        setRefreshing(false);
    }, [queryClient]);

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

    // Check if we can go back
    const canGoBack = useMemo(() => {
        if (!fullYearData?.academicYear?.startDate) return true;
        const minDate = new Date(fullYearData.academicYear.startDate);
        const minMonthStart = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        return currentMonth > minMonthStart;
    }, [currentMonth, fullYearData]);

    const handlePrevMonth = () => {
        if (!canGoBack) return;
        const newDate = new Date(currentMonth);
        newDate.setMonth(newDate.getMonth() - 1);
        setCurrentMonth(newDate);
    };

    const handleNextMonth = () => {
        const newDate = new Date(currentMonth);
        newDate.setMonth(newDate.getMonth() + 1);
        setCurrentMonth(newDate);
    };

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
                    <Text style={styles.headerTitle}>My Attendance</Text>
                    <Text style={styles.headerSubtitle}>
                        {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
            >
                {isLoading && !refreshing ? (
                    <AttendanceSkeleton />
                ) : !fullYearData?.overallStats ? (
                    <Animated.View entering={FadeInDown.delay(300)} style={styles.noDataCard}>
                        <AlertCircle size={48} color="#999" />
                        <Text style={styles.noDataText}>No attendance data available</Text>
                    </Animated.View>
                ) : (
                    <>
                        {/* Overall Stats Cards */}
                        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                            <Text style={styles.statsLabel}>Overall (Academic Year)</Text>
                            <View style={styles.summaryGrid}>
                                <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
                                    <TrendingUp size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>
                                        {Math.round(overallStats.attendancePercentage)}%
                                    </Text>
                                    <Text style={styles.summaryLabel}>Attendance</Text>
                                </LinearGradient>

                                <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
                                    <CheckCircle size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>{overallStats.totalPresent}</Text>
                                    <Text style={styles.summaryLabel}>Present</Text>
                                </LinearGradient>

                                <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
                                    <XCircle size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>{overallStats.totalAbsent}</Text>
                                    <Text style={styles.summaryLabel}>Absent</Text>
                                </LinearGradient>
                            </View>
                        </Animated.View>

                        {/* Streak Card */}
                        {streak && streak.current > 0 && (
                            <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.streakCard}>
                                <LinearGradient colors={['#FFB020', '#FF8C42']} style={styles.streakGradient}>
                                    <Award size={32} color="#fff" />
                                    <View style={styles.streakInfo}>
                                        <Text style={styles.streakValue}>{streak.current} Days</Text>
                                        <Text style={styles.streakLabel}>Current Streak 🔥</Text>
                                    </View>
                                    <View style={styles.streakBadge}>
                                        <Sparkles size={14} color="#92400E" />
                                        <Text style={styles.streakBadgeText}>Best: {streak.longest}</Text>
                                    </View>
                                </LinearGradient>
                            </Animated.View>
                        )}

                        {/* Low Attendance Warning */}
                        {overallStats.attendancePercentage < 75 && (
                            <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.warningCard}>
                                <View style={styles.warningIconContainer}>
                                    <AlertCircle size={24} color="#FF6B6B" />
                                </View>
                                <View style={styles.warningContent}>
                                    <Text style={styles.warningTitle}>Low Attendance Alert</Text>
                                    <Text style={styles.warningMessage}>
                                        Overall attendance is {Math.round(overallStats.attendancePercentage)}%, below the required 75%
                                    </Text>
                                </View>
                            </Animated.View>
                        )}

                        {/* Calendar Section */}
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Monthly Overview</Text>
                            {currentMonthStats && (
                                <Text style={styles.monthStats}>
                                    {currentMonthStats.totalPresent}P / {currentMonthStats.totalAbsent}A
                                </Text>
                            )}
                        </View>

                        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.calendarCard}>
                            <View style={styles.calendarHeader}>
                                <Text style={styles.calendarTitle}>
                                    {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </Text>

                                <View style={styles.calendarControls}>
                                    <HapticTouchable onPress={() => {
                                        const newDate = new Date();
                                        setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
                                    }}>
                                        <View style={styles.todayButton}>
                                            <Text style={styles.todayButtonText}>Today</Text>
                                        </View>
                                    </HapticTouchable>

                                    <HapticTouchable style={{ opacity: canGoBack ? 1 : 0.3 }} onPress={handlePrevMonth}>
                                        <View style={styles.navButton}>
                                            <ChevronLeft size={20} color="#666" />
                                        </View>
                                    </HapticTouchable>

                                    <HapticTouchable onPress={handleNextMonth}>
                                        <View style={styles.navButton}>
                                            <ChevronRight size={20} color="#666" />
                                        </View>
                                    </HapticTouchable>
                                </View>
                            </View>

                            {/* Weekday Headers */}
                            <View style={styles.weekdayHeader}>
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                    <View
                                        key={idx}
                                        style={[
                                            styles.weekdayCell,
                                            (idx === 0 || idx === 6) && styles.weekendHeader
                                        ]}
                                    >
                                        <Text style={styles.weekdayText}>{day}</Text>
                                    </View>
                                ))}
                            </View>

                            {/* Calendar Grid */}
                            <View style={styles.calendarGrid}>
                                {calendarDays.map((day, idx) => {
                                    const isWeekend = day.fullDate && (new Date(day.fullDate).getDay() === 0 || new Date(day.fullDate).getDay() === 6);
                                    const borderColor = day.isToday ? '#0469ff' : getDayBorderColor(day);
                                    const bgColor = day.isToday ? '#E3F2FD' : (isWeekend && !day.isOtherMonth ? '#f8f9fa' : '#fff');
                                    const isFuture = day.fullDate && day.fullDate > getISTDateString();

                                    return (
                                        <View
                                            key={idx}
                                            style={[
                                                styles.dayCell,
                                                day.isOtherMonth && styles.otherMonthDay,
                                                {
                                                    borderColor: borderColor,
                                                    backgroundColor: bgColor,
                                                    opacity: isFuture ? 0.6 : 1
                                                }
                                            ]}
                                        >
                                            {!day.isOtherMonth && (
                                                <>
                                                    <Text style={[
                                                        styles.dayText,
                                                        day.isToday && styles.todayText,
                                                        isFuture && {
                                                            textDecorationLine: 'line-through',
                                                            color: '#cbd5e1'
                                                        }
                                                    ]}>
                                                        {day.date}
                                                    </Text>
                                                    {day.attendance && (
                                                        <View style={styles.eventIndicators}>
                                                            <View style={[
                                                                styles.eventDot,
                                                                { backgroundColor: getStatusColor(day.attendance.status) }
                                                            ]} />
                                                        </View>
                                                    )}
                                                </>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Legend */}
                            <View style={styles.legend}>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#51CF66' }]} />
                                    <Text style={styles.legendText}>Present</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
                                    <Text style={styles.legendText}>Absent</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#FFB020' }]} />
                                    <Text style={styles.legendText}>Late</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
                                    <Text style={styles.legendText}>Leave</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#9CA3AF' }]} />
                                    <Text style={styles.legendText}>Holiday</Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* Recent Activity */}
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Recent Activity</Text>
                            <Text style={styles.activityCount}>{recentActivity.length} Records</Text>
                        </View>

                        {recentActivity.map((record, idx) => {
                            const statusConfig = getStatusConfig(record.status);
                            const StatusIcon = statusConfig.icon;

                            return (
                                <Animated.View key={record.id} entering={FadeInRight.delay(500 + idx * 50)}>
                                    <View style={styles.activityCard}>
                                        <View style={[styles.activityIcon, { backgroundColor: statusConfig.bg }]}>
                                            <StatusIcon size={20} color={statusConfig.color} />
                                        </View>
                                        <View style={styles.activityContent}>
                                            <Text style={styles.activityDate}>
                                                {formatIST(record.date)}
                                            </Text>
                                            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                                                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                                    {record.status}
                                                </Text>
                                            </View>
                                        </View>
                                        {record.checkInTime && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <Clock size={12} color="#666" />
                                                <Text style={styles.activityTime}>
                                                    {formatISTTime(record.checkInTime)}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </Animated.View>
                            );
                        })}
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
        paddingTop: 60,
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
        padding: 40,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: '#666',
    },
    noDataCard: {
        padding: 40,
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        marginTop: 20,
    },
    noDataText: {
        fontSize: 16,
        color: '#999',
    },
    statsLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    summaryGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    summaryCard: {
        flex: 1,
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
        gap: 8,
    },
    summaryValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    summaryLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '600',
    },
    streakCard: {
        marginBottom: 16,
        borderRadius: 16,
        overflow: 'hidden',
    },
    streakGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
    },
    streakInfo: {
        flex: 1,
        marginLeft: 12,
    },
    streakValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
    },
    streakLabel: {
        fontSize: 13,
        color: '#fff',
        marginTop: 2,
        opacity: 0.9,
    },
    streakBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#FDE047',
        borderRadius: 12,
    },
    streakBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#92400E',
    },
    warningCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
        padding: 16,
        backgroundColor: '#FFE9E9',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FFD6D6',
    },
    warningIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    warningContent: {
        flex: 1,
        marginLeft: 12,
    },
    warningTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#991B1B',
        marginBottom: 4,
    },
    warningMessage: {
        fontSize: 13,
        color: '#991B1B',
        lineHeight: 18,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
    },
    monthStats: {
        fontSize: 13,
        color: '#0469ff',
        backgroundColor: '#E3F2FD',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        fontWeight: '600',
    },
    activityCount: {
        fontSize: 13,
        color: '#666',
        backgroundColor: '#f5f5f5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        fontWeight: '600',
    },
    calendarCard: {
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 16,
        marginBottom: 16,
    },
    calendarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    calendarTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    calendarControls: {
        flexDirection: 'row',
        gap: 8,
    },
    todayButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#E3F2FD',
        borderRadius: 8,
    },
    todayButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0469ff',
    },
    navButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekdayHeader: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    weekdayCell: {
        width: CALENDAR_DAY_SIZE,
        alignItems: 'center',
        paddingVertical: 8,
    },
    weekendHeader: {
        backgroundColor: '#f8f9fa',
    },
    weekdayText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    dayCell: {
        width: CALENDAR_DAY_SIZE - 5,
        height: CALENDAR_DAY_SIZE * 0.85,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderRadius: 7,
        borderColor: 'transparent',
    },
    otherMonthDay: {
        opacity: 0,
    },
    dayText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
        marginBottom: 4,
    },
    todayText: {
        color: '#0469ff',
        fontWeight: '700',
    },
    eventIndicators: {
        flexDirection: 'row',
        gap: 2,
        marginTop: 2,
    },
    eventDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    legendText: {
        fontSize: 11,
        color: '#666',
        fontWeight: '600',
    },
    activityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 8,
    },
    activityIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    activityContent: {
        flex: 1,
        marginLeft: 12,
        gap: 4,
    },
    activityDate: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    statusBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    activityTime: {
        fontSize: 12,
        color: '#666',
        fontWeight: '600',
    },
});
