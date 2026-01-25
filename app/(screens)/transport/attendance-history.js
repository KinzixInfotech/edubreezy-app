// Transport Attendance History Screen for Parents
import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Clock,
    Calendar,
    User,
    Sun,
    Moon,
    MapPin,
    AlertCircle,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

export default function AttendanceHistoryScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [dateFilter, setDateFilter] = useState('week');

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
    const studentId = childData?.studentId || childData?.id;

    // Fetch attendance records
    const { data: attendanceData, isLoading } = useQuery({
        queryKey: ['transport-attendance', schoolId, studentId, dateFilter],
        queryFn: async () => {
            const endDate = new Date();
            const startDate = new Date();
            if (dateFilter === 'week') {
                startDate.setDate(startDate.getDate() - 7);
            } else if (dateFilter === 'month') {
                startDate.setMonth(startDate.getMonth() - 1);
            } else {
                startDate.setMonth(startDate.getMonth() - 3);
            }

            const res = await api.get(`/schools/transport/attendance?schoolId=${schoolId}&studentId=${studentId}&startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`);
            return res.data;
        },
        enabled: !!schoolId && !!studentId,
        staleTime: 1000 * 60 * 2,
    });

    const attendance = attendanceData?.attendance || [];

    // Calculate stats
    const stats = {
        present: attendance.filter(r => r.status === 'PRESENT').length,
        absent: attendance.filter(r => r.status === 'ABSENT').length,
        late: attendance.filter(r => r.status === 'LATE').length,
    };

    // Group attendance by date
    const groupedAttendance = attendance.reduce((groups, record) => {
        const date = record.trip?.tripDate || record.createdAt?.split('T')[0];
        if (!groups[date]) groups[date] = [];
        groups[date].push(record);
        return groups;
    }, {});

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['transport-attendance']);
        setRefreshing(false);
    }, [queryClient]);

    const getStatusInfo = (status) => {
        switch (status) {
            case 'PRESENT': return { icon: CheckCircle2, color: '#10B981', bg: '#D1FAE5' };
            case 'ABSENT': return { icon: XCircle, color: '#EF4444', bg: '#FEE2E2' };
            case 'LATE': return { icon: Clock, color: '#F59E0B', bg: '#FEF3C7' };
            default: return { icon: AlertCircle, color: '#94A3B8', bg: '#F1F5F9' };
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) return 'Today';
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    };

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
                        <Text style={styles.headerTitle}>Bus Attendance</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyState}>
                    <AlertCircle size={48} color="#ccc" />
                    <Text style={styles.emptyTitle}>No Child Selected</Text>
                    <Text style={styles.emptySubtitle}>Please select a child from home screen</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style='dark' />
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Bus Attendance</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s history</Text>
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
                                Class {childData.class} - {childData.section}
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Stats Cards */}
                <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                    <View style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
                            <CheckCircle2 size={22} color="#10B981" />
                            <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.present}</Text>
                            <Text style={styles.statLabel}>Present</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
                            <XCircle size={22} color="#EF4444" />
                            <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.absent}</Text>
                            <Text style={styles.statLabel}>Absent</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
                            <Clock size={22} color="#F59E0B" />
                            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.late}</Text>
                            <Text style={styles.statLabel}>Late</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Date Filter */}
                <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                    <View style={styles.filterRow}>
                        {['week', 'month', 'all'].map(filter => (
                            <HapticTouchable
                                key={filter}
                                onPress={() => setDateFilter(filter)}

                            >
                                <View style={[
                                    styles.filterBtn,
                                    dateFilter === filter && styles.filterBtnActive
                                ]}>
                                    <Text style={[
                                        styles.filterBtnText,
                                        dateFilter === filter && styles.filterBtnTextActive
                                    ]}>
                                        {filter === 'week' ? 'This Week' : filter === 'month' ? 'This Month' : 'All Time'}
                                    </Text>
                                </View>
                            </HapticTouchable>
                        ))}
                    </View>
                </Animated.View>

                {/* Attendance Records */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Attendance Records</Text>

                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : Object.keys(groupedAttendance).length > 0 ? (
                        Object.entries(groupedAttendance)
                            .sort((a, b) => new Date(b[0]) - new Date(a[0]))
                            .map(([date, records], groupIndex) => (
                                <Animated.View
                                    key={date}
                                    entering={FadeInRight.delay(400 + groupIndex * 100).duration(500)}
                                >
                                    <View style={styles.daySection}>
                                        <Text style={styles.dayTitle}>{formatDate(date)}</Text>
                                        {records.map((record) => {
                                            const statusInfo = getStatusInfo(record.status);
                                            const StatusIcon = statusInfo.icon;

                                            return (
                                                <View key={record.id} style={styles.attendanceCard}>
                                                    <View style={[styles.statusIconContainer, { backgroundColor: statusInfo.bg }]}>
                                                        <StatusIcon size={20} color={statusInfo.color} />
                                                    </View>
                                                    <View style={styles.attendanceInfo}>
                                                        <View style={styles.tripTypeRow}>
                                                            {record.trip?.tripType === 'PICKUP' ? (
                                                                <Sun size={14} color="#F59E0B" />
                                                            ) : (
                                                                <Moon size={14} color="#6366F1" />
                                                            )}
                                                            <Text style={styles.tripType}>
                                                                {record.trip?.tripType === 'PICKUP' ? 'Morning Pickup' : 'Afternoon Drop'}
                                                            </Text>
                                                        </View>
                                                        {record.stop?.name && (
                                                            <View style={styles.stopRow}>
                                                                <MapPin size={12} color="#94A3B8" />
                                                                <Text style={styles.stopName}>{record.stop.name}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <View style={styles.attendanceRight}>
                                                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                                                            <Text style={[styles.statusText, { color: statusInfo.color }]}>
                                                                {record.status}
                                                            </Text>
                                                        </View>
                                                        {record.markedAt && (
                                                            <Text style={styles.markedTime}>
                                                                {new Date(record.markedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </Text>
                                                        )}
                                                    </View>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </Animated.View>
                            ))
                    ) : (
                        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                            <View style={styles.emptyState}>
                                <Calendar size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Attendance Records</Text>
                                <Text style={styles.emptySubtitle}>
                                    Records will appear here once bus trips begin
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
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        marginTop: 6,
    },
    statLabel: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    filterRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    filterBtn: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: '#f8f9fa',
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    filterBtnActive: {
        backgroundColor: '#E3F2FD',
        borderColor: '#0469ff',
    },
    filterBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },
    filterBtnTextActive: {
        color: '#0469ff',
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
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    daySection: {
        marginBottom: 16,
    },
    dayTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#666',
        marginBottom: 10,
    },
    attendanceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        gap: 12,
    },
    statusIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    attendanceInfo: {
        flex: 1,
    },
    tripTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    tripType: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    stopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    stopName: {
        fontSize: 13,
        color: '#666',
    },
    attendanceRight: {
        alignItems: 'flex-end',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    markedTime: {
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 4,
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
