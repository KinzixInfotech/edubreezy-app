// app/(screens)/student/attendance.js
// Student Attendance Screen - Shows attendance calendar and stats
import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Dimensions,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
    ArrowLeft,
    ChevronLeft,
    ChevronRight,
    CheckCircle,
    XCircle,
    Flame,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_WIDTH = SCREEN_WIDTH - 64;
const CALENDAR_DAY_SIZE = CALENDAR_WIDTH / 7;

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

export default function StudentAttendanceScreen() {
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
    const month = currentMonth.getMonth() + 1;
    const year = currentMonth.getFullYear();

    // Fetch attendance stats - load 6 months at once to prevent refetch on month navigation
    const { data: statsData, isLoading, refetch } = useQuery({
        // Cache key uses only user/school - not month/year since we load 6 months at once
        queryKey: ['student-attendance-6months', schoolId, userId],
        queryFn: async () => {
            // Request 6 months of data in one API call
            const res = await api.get(`/schools/${schoolId}/attendance/stats?userId=${userId}&months=6`);
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 1000 * 60 * 10, // Cache for 10 minutes - no refetch on month navigation
        gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    });

    const monthlyStats = statsData?.monthlyStats || {};
    const yearlyAggregate = statsData?.yearlyAggregate || {};
    const attendanceRecords = statsData?.recentAttendance || [];
    const streak = statsData?.streak || { current: 0, longest: 0 };

    // Calendar days
    const calendarDays = useMemo(() => {
        const days = [];
        const firstDay = new Date(year, month - 1, 1);
        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push({ date: null, isOtherMonth: true });
        }
        const todayIST = getISTDateString();
        for (let i = 1; i <= new Date(year, month, 0).getDate(); i++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayData = attendanceRecords.find(record => getISTDateString(record.date) === dateStr);
            days.push({ date: i, fullDate: dateStr, isToday: dateStr === todayIST, attendance: dayData });
        }
        return days;
    }, [year, month, attendanceRecords]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const goToPrevMonth = () => setCurrentMonth(new Date(year, month - 2, 1));
    const goToNextMonth = () => setCurrentMonth(new Date(year, month, 1));
    const goToToday = () => {
        const now = new Date();
        setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    };

    // Overall stats (academic year)
    const overallPresent = yearlyAggregate.totalPresent || 0;
    const overallAbsent = yearlyAggregate.totalAbsent || 0;
    const overallWorkingDays = yearlyAggregate.totalWorkingDays || 1;
    const overallPercent = overallWorkingDays > 0 ? Math.round((overallPresent / overallWorkingDays) * 100) : 0;

    const getAttendanceStatusColor = (status) => {
        switch (status) {
            case 'PRESENT': return '#51CF66';
            case 'ABSENT': return '#FF6B6B';
            case 'LATE': return '#FFB020';
            case 'HALF_DAY': return '#FF8C42';
            case 'ON_LEAVE': return '#8B5CF6';
            default: return '#94A3B8';
        }
    };

    const getDayBorderColor = (dayData) => {
        if (!dayData?.attendance) return 'transparent';
        return getAttendanceStatusColor(dayData.attendance.status);
    };

    return (
        <View style={styles.container}>
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
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {/* Stats Row - Original style + Streak */}
                <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.statsRow}>
                    <View style={[styles.mainStatCard, { backgroundColor: '#D1FAE5' }]}>
                        <Text style={[styles.mainStatValue, { color: '#10B981' }]}>{overallPercent}%</Text>
                        <Text style={styles.mainStatLabel}>Overall</Text>
                    </View>
                    <View style={styles.statsColumn}>
                        <View style={[styles.smallStatCard, { backgroundColor: '#D1FAE5' }]}>
                            <CheckCircle size={16} color="#10B981" />
                            <Text style={[styles.smallStatValue, { color: '#10B981' }]}>{overallPresent}</Text>
                            <Text style={styles.smallStatLabel}>Present</Text>
                        </View>
                        <View style={[styles.smallStatCard, { backgroundColor: '#FEE2E2' }]}>
                            <XCircle size={16} color="#EF4444" />
                            <Text style={[styles.smallStatValue, { color: '#EF4444' }]}>{overallAbsent}</Text>
                            <Text style={styles.smallStatLabel}>Absent</Text>
                        </View>
                    </View>
                    <View style={[styles.streakCard, { backgroundColor: '#FEF3C7' }]}>
                        <Flame size={20} color="#F59E0B" />
                        <Text style={[styles.smallStatValue, { color: '#F59E0B' }]}>{streak.current}</Text>
                        <Text style={styles.smallStatLabel}>Streak</Text>
                    </View>
                </Animated.View>

                {/* Calendar Section */}
                <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.calendarCard}>
                    <View style={styles.calendarHeader}>
                        <Text style={styles.calendarTitle}>
                            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </Text>
                        <View style={styles.calendarControls}>
                            <HapticTouchable onPress={goToToday}>
                                <View style={styles.todayButton}>
                                    <Text style={styles.todayButtonText}>Today</Text>
                                </View>
                            </HapticTouchable>
                            <HapticTouchable onPress={goToPrevMonth}>
                                <View style={styles.navButton}>
                                    <ChevronLeft size={20} color="#666" />
                                </View>
                            </HapticTouchable>
                            <HapticTouchable onPress={goToNextMonth}>
                                <View style={styles.navButton}>
                                    <ChevronRight size={20} color="#666" />
                                </View>
                            </HapticTouchable>
                        </View>
                    </View>

                    {/* Weekday Headers */}
                    <View style={styles.weekdayHeader}>
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                            <View key={idx} style={[styles.weekdayCell, (idx === 0 || idx === 6) && styles.weekendHeader]}>
                                <Text style={styles.weekdayText}>{day}</Text>
                            </View>
                        ))}
                    </View>

                    {/* Calendar Grid */}
                    {isLoading ? (
                        <View style={styles.calendarLoader}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : (
                        <View style={styles.calendarGrid}>
                            {calendarDays.map((day, idx) => {
                                const isWeekend = day.fullDate && (new Date(day.fullDate).getDay() === 0 || new Date(day.fullDate).getDay() === 6);
                                const borderColor = day.isToday ? '#0469ff' : getDayBorderColor(day);
                                const bgColor = day.isToday ? '#E3F2FD' : (isWeekend && !day.isOtherMonth ? '#f8f9fa' : '#fff');

                                return (
                                    <View
                                        key={idx}
                                        style={[styles.dayCell, day.isOtherMonth && styles.otherMonthDay, { borderColor, backgroundColor: bgColor }]}
                                    >
                                        {!day.isOtherMonth && (
                                            <>
                                                <Text style={[styles.dayText, day.isToday && styles.todayText]}>{day.date}</Text>
                                                {day.attendance && (
                                                    <View style={styles.eventIndicators}>
                                                        <View style={[styles.eventDot, { backgroundColor: getAttendanceStatusColor(day.attendance.status) }]} />
                                                    </View>
                                                )}
                                            </>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    )}

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
                    </View>
                </Animated.View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
    content: { flex: 1, padding: 16 },

    // Stats Row - All in one row
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    mainStatCard: { flex: 1.2, alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 16 },
    mainStatValue: { fontSize: 32, fontWeight: '700' },
    mainStatLabel: { fontSize: 12, color: '#666', marginTop: 2 },
    statsColumn: { flex: 1, gap: 8 },
    smallStatCard: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10, borderRadius: 10 },
    smallStatValue: { fontSize: 16, fontWeight: '700' },
    smallStatLabel: { fontSize: 11, color: '#666' },
    streakCard: { alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 12, gap: 4 },

    // Calendar
    calendarCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
    calendarHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    calendarTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    calendarControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    todayButton: { backgroundColor: '#E3F2FD', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    todayButtonText: { fontSize: 12, fontWeight: '600', color: '#0469ff' },
    navButton: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },

    weekdayHeader: { flexDirection: 'row', marginBottom: 8 },
    weekdayCell: { width: CALENDAR_DAY_SIZE, alignItems: 'center', paddingVertical: 8 },
    weekendHeader: { backgroundColor: '#fef2f2' },
    weekdayText: { fontSize: 12, fontWeight: '600', color: '#666' },

    calendarLoader: { height: 200, alignItems: 'center', justifyContent: 'center' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell: { width: CALENDAR_DAY_SIZE, height: CALENDAR_DAY_SIZE, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent', borderRadius: 8, marginBottom: 4 },
    otherMonthDay: { opacity: 0 },
    dayText: { fontSize: 14, fontWeight: '600', color: '#111' },
    todayText: { color: '#0469ff', fontWeight: '700' },
    eventIndicators: { position: 'absolute', bottom: 4, flexDirection: 'row', gap: 2 },
    eventDot: { width: 6, height: 6, borderRadius: 3 },

    legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 16, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 12, color: '#666' },
});
