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
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    Calendar,
    ArrowLeft,
    AlertCircle,
    Clock,
    User,
    BookOpen,
    MapPin,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

const DAYS = [
    { id: 1, name: 'Mon', fullName: 'Monday' },
    { id: 2, name: 'Tue', fullName: 'Tuesday' },
    { id: 3, name: 'Wed', fullName: 'Wednesday' },
    { id: 4, name: 'Thu', fullName: 'Thursday' },
    { id: 5, name: 'Fri', fullName: 'Friday' },
    { id: 6, name: 'Sat', fullName: 'Saturday' },
];

export default function ParentTimetableScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [selectedDay, setSelectedDay] = useState(() => {
        // Default to current day (1=Mon, 6=Sat, Sun defaults to Mon)
        const today = new Date().getDay();
        return today === 0 ? 1 : today;
    });

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
    const classId = childData?.classId;
    const sectionId = childData?.sectionId;

    // Fetch timetable for child's class
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
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    const timeSlots = timetableData?.timeSlots || [];
    const timetable = timetableData?.timetable || {};

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['parent-timetable']);
        setRefreshing(false);
    }, [queryClient]);

    // Get entries for selected day
    const dayEntries = timetable[selectedDay] || {};

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
                        <Text style={styles.headerTitle}>Timetable</Text>
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

                {/* Day Tabs */}
                <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.dayTabsContainer}
                        contentContainerStyle={styles.dayTabsContent}
                    >
                        {DAYS.map((day) => (
                            <HapticTouchable
                                key={day.id}
                                onPress={() => setSelectedDay(day.id)}
                            >
                                <View style={[
                                    styles.dayTab,
                                    selectedDay === day.id && styles.dayTabActive
                                ]}>
                                    <Text style={[
                                        styles.dayTabText,
                                        selectedDay === day.id && styles.dayTabTextActive
                                    ]}>
                                        {day.name}
                                    </Text>
                                </View>
                            </HapticTouchable>
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* Current Day Title */}
                <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                    <Text style={styles.sectionTitle}>
                        {DAYS.find(d => d.id === selectedDay)?.fullName}'s Schedule
                    </Text>
                </Animated.View>

                {/* Timetable List */}
                <View style={styles.section}>
                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : timeSlots.length > 0 ? (
                        timeSlots.map((slot, index) => {
                            const entry = dayEntries[slot.id];

                            // Skip rendering if it's a break time slot
                            if (slot.isBreak) {
                                return (
                                    <Animated.View
                                        key={slot.id}
                                        entering={FadeInRight.delay(400 + index * 60).duration(500)}
                                    >
                                        <View style={styles.breakCard}>
                                            <View style={styles.breakIconContainer}>
                                                <Clock size={16} color="#F59E0B" />
                                            </View>
                                            <Text style={styles.breakText}>{slot.label}</Text>
                                            <Text style={styles.breakTime}>
                                                {slot.startTime} - {slot.endTime}
                                            </Text>
                                        </View>
                                    </Animated.View>
                                );
                            }

                            return (
                                <Animated.View
                                    key={slot.id}
                                    entering={FadeInRight.delay(400 + index * 60).duration(500)}
                                >
                                    <View style={[
                                        styles.periodCard,
                                        !entry && styles.periodCardEmpty
                                    ]}>
                                        <View style={styles.periodHeader}>
                                            <View style={styles.timeContainer}>
                                                <Clock size={14} color="#666" />
                                                <Text style={styles.timeText}>
                                                    {slot.startTime} - {slot.endTime}
                                                </Text>
                                            </View>
                                            <View style={styles.periodBadge}>
                                                <Text style={styles.periodBadgeText}>
                                                    {slot.label}
                                                </Text>
                                            </View>
                                        </View>

                                        {entry ? (
                                            <>
                                                <View style={styles.subjectRow}>
                                                    <View style={styles.subjectIconContainer}>
                                                        <BookOpen size={18} color="#0469ff" />
                                                    </View>
                                                    <View style={styles.subjectInfo}>
                                                        <Text style={styles.subjectName}>
                                                            {entry.subject?.subjectName || 'Subject'}
                                                        </Text>
                                                        {entry.subject?.subjectCode && (
                                                            <Text style={styles.subjectCode}>
                                                                {entry.subject.subjectCode}
                                                            </Text>
                                                        )}
                                                    </View>
                                                </View>

                                                <View style={styles.periodMeta}>
                                                    <View style={styles.metaItem}>
                                                        <User size={14} color="#666" />
                                                        <Text style={styles.metaText}>
                                                            {entry.teacher?.name || 'Teacher'}
                                                        </Text>
                                                    </View>
                                                    {entry.roomNumber && (
                                                        <>
                                                            <Text style={styles.metaDivider}>•</Text>
                                                            <View style={styles.metaItem}>
                                                                <MapPin size={14} color="#666" />
                                                                <Text style={styles.metaText}>
                                                                    Room {entry.roomNumber}
                                                                </Text>
                                                            </View>
                                                        </>
                                                    )}
                                                </View>
                                            </>
                                        ) : (
                                            <View style={styles.freeSlot}>
                                                <Text style={styles.freeSlotText}>No class scheduled</Text>
                                            </View>
                                        )}
                                    </View>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                            <View style={styles.emptyState}>
                                <Calendar size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Timetable Found</Text>
                                <Text style={styles.emptySubtitle}>
                                    Timetable has not been set up for this class yet
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
    dayTabsContainer: {
        marginBottom: 16,
    },
    dayTabsContent: {
        gap: 8,
    },
    dayTab: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#f5f5f5',
        borderRadius: 20,
    },
    dayTabActive: {
        backgroundColor: '#0469ff',
    },
    dayTabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    dayTabTextActive: {
        color: '#fff',
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
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
    periodCard: {
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#0469ff',
    },
    periodCardEmpty: {
        borderLeftColor: '#e5e7eb',
        opacity: 0.7,
    },
    periodHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    timeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    timeText: {
        fontSize: 13,
        color: '#666',
        fontWeight: '500',
    },
    periodBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: '#E3F2FD',
        borderRadius: 6,
    },
    periodBadgeText: {
        fontSize: 12,
        color: '#0469ff',
        fontWeight: '600',
    },
    subjectRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
    },
    subjectIconContainer: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    subjectInfo: {
        flex: 1,
    },
    subjectName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    subjectCode: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    periodMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 13,
        color: '#666',
    },
    metaDivider: {
        fontSize: 13,
        color: '#ccc',
    },
    breakCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#FEF3C7',
        borderRadius: 8,
        marginBottom: 12,
        gap: 10,
    },
    breakIconContainer: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    breakText: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: '#92400E',
    },
    breakTime: {
        fontSize: 12,
        color: '#B45309',
    },
    freeSlot: {
        paddingVertical: 8,
    },
    freeSlotText: {
        fontSize: 14,
        color: '#999',
        fontStyle: 'italic',
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
