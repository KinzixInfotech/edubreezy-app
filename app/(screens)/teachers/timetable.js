// app/(screens)/teachers/timetable.js
// Teacher Timetable Screen - Shows teacher's schedule AND class schedule
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
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    Calendar,
    Clock,
    BookOpen,
    Users,
    MapPin,
    AlertCircle,
    User,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL_DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TABS = ['My Schedule', 'Class Schedule'];

export default function TeacherTimetableScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDay, setSelectedDay] = useState(new Date().getDay() || 1);
    const [activeTab, setActiveTab] = useState(0); // 0 = My Schedule, 1 = Class Schedule

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
    const userId = userData?.id;

    // Fetch teacher data (to get assigned classId/sectionId)
    const { data: teacherData } = useQuery({
        queryKey: ['teacher-data', schoolId, userId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/teachers/${userId}`);
            const teachers = res.data?.teacher || res.data;
            return Array.isArray(teachers) ? teachers[0] : teachers;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 1000 * 60 * 5,
    });

    const classId = teacherData?.classId;
    const sectionId = teacherData?.sectionId;

    // Fetch teacher's timetable
    const { data: myTimetableData, isLoading: myLoading, refetch: refetchMy } = useQuery({
        queryKey: ['teacher-timetable', schoolId, userId],
        queryFn: async () => {
            if (!schoolId || !userId) return null;
            const res = await api.get(`/schools/${schoolId}/timetable/view/teacher/${userId}`);
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 1000 * 60 * 5,
    });

    // Fetch class timetable
    const { data: classTimetableData, isLoading: classLoading, refetch: refetchClass } = useQuery({
        queryKey: ['class-timetable', schoolId, classId, sectionId],
        queryFn: async () => {
            if (!schoolId || !classId) return null;
            let url = `/schools/${schoolId}/timetable/view/class/${classId}`;
            if (sectionId) url += `?sectionId=${sectionId}`;
            const res = await api.get(url);
            return res.data;
        },
        enabled: !!schoolId && !!classId && activeTab === 1,
        staleTime: 1000 * 60 * 5,
    });

    // Use data based on active tab
    const timetableData = activeTab === 0 ? myTimetableData : classTimetableData;
    const isLoading = activeTab === 0 ? myLoading : classLoading;

    const timeSlots = timetableData?.timeSlots || [];
    const timetable = timetableData?.timetable || {};

    // Get today's schedule
    const todayDay = new Date().getDay() || 7;
    const todaySchedule = timetable[todayDay] || {};

    // Find next/current period (only for My Schedule)
    const getNextPeriod = useMemo(() => {
        if (activeTab !== 0) return null;

        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

        for (const slot of timeSlots) {
            if (slot.isBreak) continue;
            const entry = todaySchedule[slot.id];
            if (!entry) continue;

            if (slot.startTime >= currentTimeStr || (slot.startTime <= currentTimeStr && slot.endTime >= currentTimeStr)) {
                return {
                    slot,
                    entry,
                    isCurrent: slot.startTime <= currentTimeStr && slot.endTime >= currentTimeStr,
                };
            }
        }
        return null;
    }, [timeSlots, todaySchedule, activeTab]);

    // Get selected day's schedule
    const selectedDaySchedule = timetable[selectedDay] || {};

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (activeTab === 0) await refetchMy();
        else await refetchClass();
        setRefreshing(false);
    }, [activeTab, refetchMy, refetchClass]);

    // Count periods for today
    const periodCount = useMemo(() => {
        return Object.keys(todaySchedule).filter(slotId => {
            const slot = timeSlots.find(s => s.id === parseInt(slotId));
            return slot && !slot.isBreak;
        }).length;
    }, [todaySchedule, timeSlots]);

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
                    <Text style={styles.headerTitle}>Timetable</Text>
                    <Text style={styles.headerSubtitle}>
                        {teacherData?.class?.className
                            ? `${teacherData.class.className}${teacherData.section?.name ? ` - ${teacherData.section.name}` : ''}`
                            : FULL_DAYS[todayDay]}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                {TABS.map((tab, index) => (
                    <HapticTouchable key={tab} onPress={() => setActiveTab(index)} style={{ flex: 1 }}>
                        <View style={[styles.tab, activeTab === index && styles.tabActive]}>
                            {index === 0 ? <User size={16} color={activeTab === index ? '#fff' : '#666'} /> : <Users size={16} color={activeTab === index ? '#fff' : '#666'} />}
                            <Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>
                                {tab}
                            </Text>
                        </View>
                    </HapticTouchable>
                ))}
            </View>

            {isLoading ? (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color="#0469ff" />
                    <Text style={styles.loadingText}>Loading timetable...</Text>
                </View>
            ) : (
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
                >
                    {/* Next Period Card (My Schedule only) */}
                    {activeTab === 0 && getNextPeriod && (
                        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
                            <View
                                style={[
                                    styles.nextPeriodCard,
                                    { backgroundColor: getNextPeriod.isCurrent ? '#10B981' : '#0469ff' }
                                ]}
                            >
                                <View style={styles.nextPeriodHeader}>
                                    <View style={styles.nextPeriodBadge}>
                                        <Text style={styles.nextPeriodBadgeText}>
                                            {getNextPeriod.isCurrent ? '🔴 NOW' : '⏰ NEXT'}
                                        </Text>
                                    </View>
                                    <Text style={styles.nextPeriodTime}>
                                        {getNextPeriod.slot.startTime} - {getNextPeriod.slot.endTime}
                                    </Text>
                                </View>
                                <Text style={styles.nextPeriodSubject}>
                                    {getNextPeriod.entry.subject?.subjectName || 'No Subject'}
                                </Text>
                                <View style={styles.nextPeriodMeta}>
                                    <View style={styles.metaItem}>
                                        <Users size={16} color="#fff" />
                                        <Text style={styles.metaTextWhite}>
                                            {getNextPeriod.entry.class?.className}
                                            {getNextPeriod.entry.section?.name && ` - ${getNextPeriod.entry.section.name}`}
                                        </Text>
                                    </View>
                                    {getNextPeriod.entry.roomNumber && (
                                        <View style={styles.metaItem}>
                                            <MapPin size={16} color="#fff" />
                                            <Text style={styles.metaTextWhite}>{getNextPeriod.entry.roomNumber}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </Animated.View>
                    )}

                    {/* Stats Row */}
                    <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
                            <BookOpen size={24} color="#0469ff" />
                            <Text style={[styles.statValue, { color: '#0469ff' }]}>{periodCount}</Text>
                            <Text style={styles.statLabel}>
                                {activeTab === 0 ? 'My Periods' : 'Class Periods'}
                            </Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
                            <Clock size={24} color="#10B981" />
                            <Text style={[styles.statValue, { color: '#10B981' }]}>
                                {timeSlots.filter(s => !s.isBreak).length}
                            </Text>
                            <Text style={styles.statLabel}>Total Slots</Text>
                        </View>
                    </Animated.View>

                    {/* Day Selector */}
                    <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.daySelector}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.dayChips}>
                                {[1, 2, 3, 4, 5, 6].map((day) => (
                                    <HapticTouchable key={day} onPress={() => setSelectedDay(day)}>
                                        <View style={[
                                            styles.dayChip,
                                            selectedDay === day && styles.dayChipActive,
                                            day === todayDay && styles.dayChipToday
                                        ]}>
                                            <Text style={[
                                                styles.dayChipText,
                                                selectedDay === day && styles.dayChipTextActive
                                            ]}>
                                                {DAYS[day]}
                                            </Text>
                                            {day === todayDay && <View style={styles.todayDot} />}
                                        </View>
                                    </HapticTouchable>
                                ))}
                            </View>
                        </ScrollView>
                    </Animated.View>

                    {/* Schedule for Selected Day */}
                    <Text style={styles.sectionTitle}>{FULL_DAYS[selectedDay]}'s Schedule</Text>

                    {timeSlots.length > 0 ? (
                        timeSlots.map((slot, index) => {
                            const entry = selectedDaySchedule[slot.id];

                            if (slot.isBreak) {
                                return (
                                    <Animated.View
                                        key={slot.id}
                                        entering={FadeInRight.delay(index * 50).duration(300)}
                                        style={styles.breakCard}
                                    >
                                        <Text style={styles.breakText}>☕ {slot.label}</Text>
                                        <Text style={styles.breakTime}>{slot.startTime} - {slot.endTime}</Text>
                                    </Animated.View>
                                );
                            }

                            return (
                                <Animated.View
                                    key={slot.id}
                                    entering={FadeInRight.delay(index * 50).duration(300)}
                                >
                                    <View style={[
                                        styles.periodCard,
                                        !entry && styles.periodCardEmpty
                                    ]}>
                                        <View style={styles.periodTimeContainer}>
                                            <Text style={styles.periodTime}>{slot.startTime}</Text>
                                            <View style={styles.timeDivider} />
                                            <Text style={styles.periodTime}>{slot.endTime}</Text>
                                        </View>

                                        <View style={styles.periodContent}>
                                            {entry ? (
                                                <>
                                                    <Text style={styles.periodSubject}>
                                                        {entry.subject?.subjectName || 'No Subject'}
                                                    </Text>
                                                    <View style={styles.periodMeta}>
                                                        {activeTab === 0 ? (
                                                            // My Schedule - show class
                                                            <View style={styles.classBadge}>
                                                                <Users size={12} color="#0469ff" />
                                                                <Text style={styles.classText}>
                                                                    {entry.class?.className}
                                                                    {entry.section?.name && ` - ${entry.section.name}`}
                                                                </Text>
                                                            </View>
                                                        ) : (
                                                            // Class Schedule - show teacher
                                                            <View style={styles.classBadge}>
                                                                <User size={12} color="#0469ff" />
                                                                <Text style={styles.classText}>
                                                                    {entry.teacher?.name || 'Teacher'}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {entry.roomNumber && (
                                                            <View style={styles.roomBadge}>
                                                                <MapPin size={12} color="#666" />
                                                                <Text style={styles.roomText}>{entry.roomNumber}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </>
                                            ) : (
                                                <Text style={styles.freeText}>
                                                    {activeTab === 0 ? 'Free Period' : 'No Class'}
                                                </Text>
                                            )}
                                        </View>

                                        <View style={styles.periodLabel}>
                                            <Text style={styles.periodLabelText}>{slot.label}</Text>
                                        </View>
                                    </View>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <View style={styles.emptyState}>
                            <AlertCircle size={48} color="#ccc" />
                            <Text style={styles.emptyTitle}>No Timetable</Text>
                            <Text style={styles.emptySubtitle}>
                                {activeTab === 0
                                    ? 'No schedule assigned to you yet'
                                    : classId
                                        ? 'No class schedule configured yet'
                                        : 'No class assigned to you'}
                            </Text>
                        </View>
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    loadingText: { fontSize: 16, fontWeight: '600', color: '#666' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },

    // Tabs
    tabContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    tab: { flex: 1, flexDirection: 'row', paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, backgroundColor: '#f5f5f5' },
    tabActive: { backgroundColor: '#0469ff' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#666' },
    tabTextActive: { color: '#fff' },

    content: { flex: 1, padding: 16 },

    // Next Period Card
    nextPeriodCard: { padding: 20, borderRadius: 16, marginBottom: 16 },
    nextPeriodHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    nextPeriodBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    nextPeriodBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    nextPeriodTime: { fontSize: 14, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
    nextPeriodSubject: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 12 },
    nextPeriodMeta: { flexDirection: 'row', gap: 16 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    metaTextWhite: { fontSize: 14, color: '#fff', fontWeight: '500' },

    // Stats
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    statCard: { flex: 1, alignItems: 'center', padding: 16, borderRadius: 12, gap: 8 },
    statValue: { fontSize: 24, fontWeight: '700' },
    statLabel: { fontSize: 12, color: '#666' },

    // Day Selector
    daySelector: { marginBottom: 16 },
    dayChips: { flexDirection: 'row', gap: 8 },
    dayChip: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    dayChipActive: { backgroundColor: '#0469ff' },
    dayChipToday: { borderWidth: 2, borderColor: '#0469ff' },
    dayChipText: { fontSize: 14, fontWeight: '600', color: '#666' },
    dayChipTextActive: { color: '#fff' },
    todayDot: { position: 'absolute', bottom: 6, width: 4, height: 4, borderRadius: 2, backgroundColor: '#0469ff' },

    sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 12 },

    // Period Card
    periodCard: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 8, overflow: 'hidden' },
    periodCardEmpty: { opacity: 0.6 },
    periodTimeContainer: { width: 70, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3F2FD' },
    periodTime: { fontSize: 12, fontWeight: '600', color: '#0469ff' },
    timeDivider: { width: 20, height: 1, backgroundColor: '#0469ff', marginVertical: 4, opacity: 0.3 },
    periodContent: { flex: 1, padding: 12, justifyContent: 'center' },
    periodSubject: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 6 },
    periodMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
    classBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    classText: { fontSize: 12, color: '#0469ff', fontWeight: '600' },
    roomBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    roomText: { fontSize: 12, color: '#666' },
    periodLabel: { width: 32, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
    periodLabelText: { fontSize: 10, fontWeight: '600', color: '#999', transform: [{ rotate: '90deg' }] },
    freeText: { fontSize: 14, color: '#999', fontStyle: 'italic' },

    // Break Card
    breakCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#FEF3C7', borderRadius: 8, marginBottom: 8 },
    breakText: { fontSize: 14, fontWeight: '600', color: '#B45309' },
    breakTime: { fontSize: 12, color: '#B45309' },

    // Empty State
    emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center' },
});
