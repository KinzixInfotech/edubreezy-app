// app/(screens)/my-child/parent-timetable.js
// Parent view of child's class timetable
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
import Animated, { FadeInDown, FadeInRight, FadeIn } from 'react-native-reanimated';
import {
    Calendar,
    ArrowLeft,
    AlertCircle,
    Clock,
    User,
    BookOpen,
    MapPin,
    Coffee,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DAYS = [
    { id: 1, name: 'Mon', fullName: 'Monday' },
    { id: 2, name: 'Tue', fullName: 'Tuesday' },
    { id: 3, name: 'Wed', fullName: 'Wednesday' },
    { id: 4, name: 'Thu', fullName: 'Thursday' },
    { id: 5, name: 'Fri', fullName: 'Friday' },
    { id: 6, name: 'Sat', fullName: 'Saturday' },
];

// Distinct soft colors for subject cards — cycles through them by index
const SUBJECT_PALETTES = [
    { bg: '#EEF4FF', accent: '#0469ff', dot: '#0469ff' },
    { bg: '#F0FDF4', accent: '#16a34a', dot: '#16a34a' },
    { bg: '#FFF7ED', accent: '#ea580c', dot: '#ea580c' },
    { bg: '#FDF4FF', accent: '#9333ea', dot: '#9333ea' },
    { bg: '#FFF1F2', accent: '#e11d48', dot: '#e11d48' },
    { bg: '#F0F9FF', accent: '#0284c7', dot: '#0284c7' },
    { bg: '#FEFCE8', accent: '#ca8a04', dot: '#ca8a04' },
    { bg: '#F0FDFA', accent: '#0d9488', dot: '#0d9488' },
];

export default function ParentTimetableScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDay, setSelectedDay] = useState(() => {
        const today = new Date().getDay();
        return today === 0 ? 1 : today;
    });

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
    const classId = childData?.classId;
    const sectionId = childData?.sectionId;

    const { data: timetableData, isLoading } = useQuery({
        queryKey: ['parent-timetable', schoolId, classId, sectionId],
        queryFn: async () => {
            if (!schoolId || !classId) return { timeSlots: [], timetable: {} };
            let url = `/schools/${schoolId}/timetable/view/class/${classId}`;
            if (sectionId) url += `?sectionId=${sectionId}`;
            const res = await api.get(url);
            return res.data;
        },
        enabled: !!schoolId && !!classId,
        staleTime: 1000 * 60 * 5,
    });

    const timeSlots = timetableData?.timeSlots || [];
    const timetable = timetableData?.timetable || {};
    const dayEntries = timetable[selectedDay] || {};

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['parent-timetable']);
        setRefreshing(false);
    }, [queryClient]);

    // Count today's classes (non-break slots with entries)
    const classCount = timeSlots.filter(s => !s.isBreak && dayEntries[s.id]).length;

    if (!childData) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#111" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Timetable</Text>
                    </View>
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

    const selectedDayObj = DAYS.find(d => d.id === selectedDay);

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Timetable</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s schedule</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {/* Day selector strip — sticky outside ScrollView */}
            <Animated.View entering={FadeInDown.delay(150).duration(400)} style={styles.dayStrip}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.dayStripContent}
                >
                    {DAYS.map((day) => {
                        const isActive = selectedDay === day.id;
                        const isToday = new Date().getDay() === day.id;
                        return (
                            <HapticTouchable key={day.id} onPress={() => setSelectedDay(day.id)}>
                                <View style={[styles.dayPill, isActive && styles.dayPillActive]}>
                                    <Text style={[styles.dayPillText, isActive && styles.dayPillTextActive]}>
                                        {day.name}
                                    </Text>
                                    {isToday && (
                                        <View style={[styles.todayDot, isActive && styles.todayDotActive]} />
                                    )}
                                </View>
                            </HapticTouchable>
                        );
                    })}
                </ScrollView>
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 24 }]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
            >
                {/* Day header banner */}
                <Animated.View entering={FadeIn.duration(300)} style={styles.dayBanner}>
                    <View>
                        <Text style={styles.dayBannerDay}>{selectedDayObj?.fullName}</Text>
                        <Text style={styles.dayBannerCount}>
                            {isLoading ? '...' : `${classCount} class${classCount !== 1 ? 'es' : ''} scheduled`}
                        </Text>
                    </View>
                    <View style={styles.dayBannerBadge}>
                        <Calendar size={16} color="#0469ff" />
                        <Text style={styles.dayBannerBadgeText}>
                            Class {childData.class}-{childData.section}
                        </Text>
                    </View>
                </Animated.View>

                {/* Timetable */}
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                        <Text style={styles.loadingText}>Loading schedule...</Text>
                    </View>
                ) : timeSlots.length > 0 ? (
                    <View style={styles.timelineContainer}>
                        {timeSlots.map((slot, index) => {
                            const entry = dayEntries[slot.id];
                            const palette = SUBJECT_PALETTES[index % SUBJECT_PALETTES.length];

                            if (slot.isBreak) {
                                return (
                                    <Animated.View
                                        key={slot.id}
                                        entering={FadeInRight.delay(200 + index * 50).duration(400)}
                                        style={styles.timelineRow}
                                    >
                                        {/* Time column */}
                                        <View style={styles.timeColumn}>
                                            <Text style={styles.timeLabel}>{slot.startTime}</Text>
                                            <View style={styles.timelineDotBreak} />
                                            <View style={styles.timelineLineBreak} />
                                        </View>
                                        {/* Break card */}
                                        <View style={styles.breakCard}>
                                            <Coffee size={14} color="#B45309" />
                                            <Text style={styles.breakLabel}>{slot.label}</Text>
                                            <Text style={styles.breakDuration}>
                                                {slot.startTime}–{slot.endTime}
                                            </Text>
                                        </View>
                                    </Animated.View>
                                );
                            }

                            return (
                                <Animated.View
                                    key={slot.id}
                                    entering={FadeInRight.delay(200 + index * 50).duration(400)}
                                    style={styles.timelineRow}
                                >
                                    {/* Time column */}
                                    <View style={styles.timeColumn}>
                                        <Text style={styles.timeLabel}>{slot.startTime}</Text>
                                        <View style={[styles.timelineDot, entry && { backgroundColor: palette.dot }]} />
                                        {index < timeSlots.length - 1 && (
                                            <View style={styles.timelineLine} />
                                        )}
                                    </View>

                                    {/* Period card */}
                                    {entry ? (
                                        <View style={[styles.periodCard, { backgroundColor: palette.bg }]}>
                                            {/* Left accent bar */}
                                            <View style={[styles.accentBar, { backgroundColor: palette.accent }]} />
                                            <View style={styles.periodCardInner}>
                                                <View style={styles.periodTopRow}>
                                                    <View style={[styles.subjectIconBg, { backgroundColor: palette.accent + '22' }]}>
                                                        <BookOpen size={16} color={palette.accent} />
                                                    </View>
                                                    <View style={styles.periodTopMeta}>
                                                        <View style={[styles.slotBadge, { backgroundColor: palette.accent + '18' }]}>
                                                            <Text style={[styles.slotBadgeText, { color: palette.accent }]}>
                                                                {slot.label}
                                                            </Text>
                                                        </View>
                                                        <Text style={styles.periodTime}>
                                                            {slot.startTime} – {slot.endTime}
                                                        </Text>
                                                    </View>
                                                </View>

                                                <Text style={styles.subjectName}>
                                                    {entry.subject?.subjectName || 'Subject'}
                                                </Text>
                                                {entry.subject?.subjectCode && (
                                                    <Text style={[styles.subjectCode, { color: palette.accent }]}>
                                                        {entry.subject.subjectCode}
                                                    </Text>
                                                )}

                                                <View style={styles.periodFooter}>
                                                    <View style={styles.footerItem}>
                                                        <User size={12} color="#888" />
                                                        <Text style={styles.footerText} numberOfLines={1}>
                                                            {entry.teacher?.name || 'Teacher'}
                                                        </Text>
                                                    </View>
                                                    {entry.roomNumber && (
                                                        <View style={styles.footerItem}>
                                                            <MapPin size={12} color="#888" />
                                                            <Text style={styles.footerText}>
                                                                Room {entry.roomNumber}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        </View>
                                    ) : (
                                        <View style={styles.emptyPeriodCard}>
                                            <View style={[styles.accentBar, { backgroundColor: '#e5e7eb' }]} />
                                            <View style={styles.periodCardInner}>
                                                <View style={styles.periodTopRow}>
                                                    <View style={[styles.slotBadge, { backgroundColor: '#f3f4f6' }]}>
                                                        <Text style={[styles.slotBadgeText, { color: '#999' }]}>
                                                            {slot.label}
                                                        </Text>
                                                    </View>
                                                    <Text style={styles.periodTime}>
                                                        {slot.startTime} – {slot.endTime}
                                                    </Text>
                                                </View>
                                                <Text style={styles.freeSlotText}>No class scheduled</Text>
                                            </View>
                                        </View>
                                    )}
                                </Animated.View>
                            );
                        })}
                    </View>
                ) : (
                    <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                        <View style={styles.emptyState}>
                            <Calendar size={48} color="#ccc" />
                            <Text style={styles.emptyTitle}>No Timetable Found</Text>
                            <Text style={styles.emptySubtitle}>
                                Timetable has not been set up for this class yet
                            </Text>
                        </View>
                    </Animated.View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    // Header
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
        color: '#666',
        marginTop: 2,
    },
    // Day strip
    dayStrip: {
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    dayStripContent: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    dayPill: {
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        position: 'relative',
    },
    dayPillActive: {
        backgroundColor: '#0469ff',
    },
    dayPillText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#666',
    },
    dayPillTextActive: {
        color: '#fff',
    },
    todayDot: {
        position: 'absolute',
        bottom: 4,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#0469ff',
    },
    todayDotActive: {
        backgroundColor: '#fff',
    },
    // Content
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
    },
    // Day banner
    dayBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#EEF4FF',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 20,
    },
    dayBannerDay: {
        fontSize: 20,
        fontWeight: '800',
        color: '#111',
        letterSpacing: -0.3,
    },
    dayBannerCount: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    dayBannerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    dayBannerBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#0469ff',
    },
    // Timeline
    timelineContainer: {
        gap: 0,
    },
    timelineRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
        gap: 12,
    },
    timeColumn: {
        width: 48,
        alignItems: 'center',
        paddingTop: 14,
    },
    timeLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#999',
        marginBottom: 6,
    },
    timelineDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#e5e7eb',
    },
    timelineDotBreak: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FDE68A',
    },
    timelineLine: {
        width: 2,
        flex: 1,
        minHeight: 40,
        backgroundColor: '#f0f0f0',
        marginTop: 4,
    },
    timelineLineBreak: {
        width: 2,
        flex: 1,
        minHeight: 20,
        backgroundColor: '#FDE68A',
        marginTop: 4,
    },
    // Period card
    periodCard: {
        flex: 1,
        borderRadius: 14,
        flexDirection: 'row',
        overflow: 'hidden',
        minHeight: 100,
    },
    accentBar: {
        width: 4,
        borderTopLeftRadius: 14,
        borderBottomLeftRadius: 14,
    },
    periodCardInner: {
        flex: 1,
        padding: 12,
        gap: 4,
    },
    periodTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    subjectIconBg: {
        width: 30,
        height: 30,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    periodTopMeta: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    slotBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    slotBadgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    periodTime: {
        fontSize: 11,
        color: '#999',
        fontWeight: '500',
    },
    subjectName: {
        fontSize: 16,
        fontWeight: '800',
        color: '#111',
        letterSpacing: -0.2,
    },
    subjectCode: {
        fontSize: 11,
        fontWeight: '600',
        marginBottom: 4,
    },
    periodFooter: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 4,
        flexWrap: 'wrap',
    },
    footerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    footerText: {
        fontSize: 12,
        color: '#888',
        maxWidth: 120,
    },
    // Empty period
    emptyPeriodCard: {
        flex: 1,
        borderRadius: 14,
        flexDirection: 'row',
        overflow: 'hidden',
        backgroundColor: '#fafafa',
        borderWidth: 1,
        borderColor: '#f0f0f0',
        minHeight: 60,
    },
    freeSlotText: {
        fontSize: 13,
        color: '#bbb',
        fontStyle: 'italic',
        marginTop: 4,
    },
    // Break card
    breakCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#FFFBEB',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#FDE68A',
        minHeight: 40,
    },
    breakLabel: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: '#92400E',
    },
    breakDuration: {
        fontSize: 11,
        color: '#B45309',
        fontWeight: '500',
    },
    // Loading
    loadingContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: '#666',
    },
    // Empty state
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