// Transport Attendance History Screen for Parents — Modern UI
import React, { useState, useCallback } from 'react';
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
    Bus,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = ({ icon: Icon, title, subtitle, color = '#0469ff' }) => (
    <Animated.View entering={FadeInDown.delay(200).duration(400)} style={emptyStyles.wrap}>
        <View style={[emptyStyles.iconBg, { backgroundColor: color + '15' }]}>
            <Icon size={36} color={color} />
        </View>
        <Text style={emptyStyles.title}>{title}</Text>
        <Text style={emptyStyles.subtitle}>{subtitle}</Text>
    </Animated.View>
);

const emptyStyles = StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 56, gap: 10 },
    iconBg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    title: { fontSize: 16, fontWeight: '700', color: '#111' },
    subtitle: { fontSize: 13, color: '#888', textAlign: 'center', paddingHorizontal: 40, lineHeight: 19 },
});

export default function AttendanceHistoryScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();
    const [refreshing, setRefreshing] = useState(false);
    const [dateFilter, setDateFilter] = useState('week');

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

    const { data: attendanceData, isLoading } = useQuery({
        queryKey: ['transport-attendance', schoolId, studentId, dateFilter],
        queryFn: async () => {
            const endDate = new Date();
            const startDate = new Date();
            if (dateFilter === 'week') startDate.setDate(startDate.getDate() - 7);
            else if (dateFilter === 'month') startDate.setMonth(startDate.getMonth() - 1);
            else startDate.setMonth(startDate.getMonth() - 3);

            const res = await api.get(
                `/schools/transport/attendance?schoolId=${schoolId}&studentId=${studentId}&startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`
            );
            return res.data;
        },
        enabled: !!schoolId && !!studentId,
        staleTime: 1000 * 60 * 2,
    });

    const attendance = attendanceData?.attendance || [];

    const stats = {
        present: attendance.filter(r => r.status === 'PRESENT').length,
        absent: attendance.filter(r => r.status === 'ABSENT').length,
        late: attendance.filter(r => r.status === 'LATE').length,
    };

    const total = stats.present + stats.absent + stats.late;
    const presentPct = total > 0 ? Math.round((stats.present / total) * 100) : 0;

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

    const getStatusCfg = (status) => {
        switch (status) {
            case 'PRESENT': return { icon: CheckCircle2, color: '#15803D', bg: '#ECFDF5', border: '#A7F3D0', label: 'Present' };
            case 'ABSENT': return { icon: XCircle, color: '#B91C1C', bg: '#FFF1F2', border: '#FECDD3', label: 'Absent' };
            case 'LATE': return { icon: Clock, color: '#B45309', bg: '#FFFBEB', border: '#FDE68A', label: 'Late' };
            default: return { icon: AlertCircle, color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', label: status };
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === today.toDateString()) return 'Today';
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return date.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    };

    if (!childData) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="dark" backgroundColor="#fff" />
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}><ArrowLeft size={22} color="#0D1117" /></View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Bus Attendance</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <EmptyState icon={AlertCircle} title="No Child Selected" subtitle="Please select a child from the home screen" color="#EF4444" />
            </SafeAreaView>
        );
    }

    const FILTERS = [
        { key: 'week', label: 'This Week' },
        { key: 'month', label: 'This Month' },
        { key: 'all', label: 'All Time' },
    ];

    return (
        <SafeAreaView style={styles.container}>
            {/* status bar explicitly white */}
            <StatusBar style="dark" backgroundColor="#fff" />

            {/* ── Header ─────────────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}><ArrowLeft size={22} color="#0D1117" /></View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Bus Attendance</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s history</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {/* ── Hero card ─────────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.delay(80).duration(500)}>
                    <LinearGradient
                        colors={['#0469ff', '#0347c4']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroBanner}
                    >
                        {/* Decorative circles */}
                        <View style={styles.heroDeco1} />
                        <View style={styles.heroDeco2} />

                        {/* Child info row */}
                        <View style={styles.heroTop}>
                            <View style={styles.heroAvatar}>
                                <User size={22} color="#0469ff" />
                            </View>
                            <View style={styles.heroText}>
                                <Text style={styles.heroName}>{childData.name}</Text>
                                <Text style={styles.heroClass}>Class {childData.class} · {childData.section}</Text>
                            </View>
                            <View style={styles.heroBusIcon}>
                                <Bus size={20} color="rgba(255,255,255,0.7)" />
                            </View>
                        </View>

                        {/* Attendance rate */}
                        <View style={styles.heroRateRow}>
                            <Text style={styles.heroRateVal}>{presentPct}%</Text>
                            <Text style={styles.heroRateLabel}>Attendance rate · {total} trips</Text>
                        </View>

                        {/* Stats strip */}
                        <View style={styles.heroStats}>
                            {[
                                { label: 'Present', val: stats.present, color: '#34D399' },
                                { label: 'Absent', val: stats.absent, color: '#FCA5A5' },
                                { label: 'Late', val: stats.late, color: '#FDE68A' },
                            ].map((s, i) => (
                                <React.Fragment key={s.label}>
                                    {i > 0 && <View style={styles.heroStatSep} />}
                                    <View style={styles.heroStat}>
                                        <Text style={[styles.heroStatVal, { color: s.color }]}>{s.val}</Text>
                                        <Text style={styles.heroStatLabel}>{s.label}</Text>
                                    </View>
                                </React.Fragment>
                            ))}
                        </View>
                    </LinearGradient>
                </Animated.View>

                {/* ── Filter tabs ───────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.delay(160).duration(400)}>
                    <View style={styles.filterTabs}>
                        {FILTERS.map(f => {
                            const active = dateFilter === f.key;
                            return (
                                <HapticTouchable key={f.key} onPress={() => setDateFilter(f.key)} style={{ flex: 1 }}>
                                    <View style={[styles.filterTab, active && styles.filterTabActive]}>
                                        <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                                            {f.label}
                                        </Text>
                                    </View>
                                </HapticTouchable>
                            );
                        })}
                    </View>
                </Animated.View>

                {/* ── Records ──────────────────────────────────────────────── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Attendance Records</Text>
                        <View style={styles.sectionBadge}>
                            <Text style={styles.sectionBadgeText}>{attendance.length}</Text>
                        </View>
                    </View>

                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                            <Text style={styles.loadingText}>Loading records…</Text>
                        </View>
                    ) : Object.keys(groupedAttendance).length > 0 ? (
                        Object.entries(groupedAttendance)
                            .sort((a, b) => new Date(b[0]) - new Date(a[0]))
                            .map(([date, records], groupIndex) => (
                                <Animated.View
                                    key={date}
                                    entering={FadeInRight.delay(220 + groupIndex * 80).duration(450)}
                                >
                                    <View style={styles.dayGroup}>
                                        {/* Day label */}
                                        <View style={styles.dayLabelRow}>
                                            <View style={styles.dayLabelDot} />
                                            <Text style={styles.dayLabel}>{formatDate(date)}</Text>
                                            <View style={styles.dayLabelLine} />
                                        </View>

                                        {records.map((record) => {
                                            const cfg = getStatusCfg(record.status);
                                            const StatusIcon = cfg.icon;
                                            const isPickup = record.trip?.tripType === 'PICKUP';

                                            return (
                                                <View
                                                    key={record.id}
                                                    style={[styles.attendanceCard, { borderColor: cfg.border }]}
                                                >
                                                    {/* Left accent */}
                                                    <View style={[styles.cardAccent, { backgroundColor: cfg.color }]} />

                                                    {/* Status icon */}
                                                    <View style={[styles.statusIconBox, { backgroundColor: cfg.bg }]}>
                                                        <StatusIcon size={20} color={cfg.color} />
                                                    </View>

                                                    {/* Info */}
                                                    <View style={styles.cardInfo}>
                                                        <View style={styles.tripTypeRow}>
                                                            {isPickup
                                                                ? <Sun size={13} color="#F59E0B" />
                                                                : <Moon size={13} color="#6366F1" />
                                                            }
                                                            <Text style={styles.tripTypeText}>
                                                                {isPickup ? 'Morning Pickup' : 'Afternoon Drop'}
                                                            </Text>
                                                        </View>
                                                        {record.stop?.name && (
                                                            <View style={styles.stopRow}>
                                                                <MapPin size={11} color="#94A3B8" />
                                                                <Text style={styles.stopText}>{record.stop.name}</Text>
                                                            </View>
                                                        )}
                                                    </View>

                                                    {/* Right */}
                                                    <View style={styles.cardRight}>
                                                        <View style={[styles.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                                                            <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
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
                        <EmptyState
                            icon={Calendar}
                            title="No Records Found"
                            subtitle="Attendance records will appear here once bus trips begin"
                            color="#0469ff"
                        />
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F7F9FC' },

    // ── Header ────────────────────────────────────────────────────────────────
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F0F3F8',
    },
    backButton: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#F3F6FA',
        alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#0D1117', letterSpacing: -0.3 },
    headerSubtitle: { fontSize: 12, color: '#8A97B0', marginTop: 1 },

    content: { flex: 1, paddingHorizontal: 16 },

    // ── Hero banner ───────────────────────────────────────────────────────────
    heroBanner: {
        borderRadius: 22,
        padding: 20,
        marginTop: 16,
        marginBottom: 16,
        overflow: 'hidden',
        position: 'relative',
    },
    heroDeco1: {
        position: 'absolute', width: 140, height: 140, borderRadius: 70,
        backgroundColor: 'rgba(255,255,255,0.07)', top: -40, right: -30,
    },
    heroDeco2: {
        position: 'absolute', width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.05)', bottom: -20, left: 40,
    },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
    heroAvatar: {
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    },
    heroText: { flex: 1 },
    heroName: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
    heroClass: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    heroBusIcon: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
    heroRateRow: { marginBottom: 16 },
    heroRateVal: { fontSize: 40, fontWeight: '900', color: '#fff', letterSpacing: -1 },
    heroRateLabel: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontWeight: '500' },
    heroStats: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderRadius: 14, padding: 14,
    },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatVal: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
    heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontWeight: '500' },
    heroStatSep: { width: 1, backgroundColor: 'rgba(255,255,255,0.18)' },

    // ── Filter tabs ───────────────────────────────────────────────────────────
    filterTabs: {
        flexDirection: 'row',
        backgroundColor: '#ECEEF2',
        borderRadius: 14,
        padding: 4,
        marginBottom: 20,
    },
    filterTab: {
        flex: 1, paddingVertical: 9,
        alignItems: 'center', borderRadius: 10,
    },
    filterTabActive: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
    },
    filterTabText: { fontSize: 13, fontWeight: '600', color: '#8A97B0' },
    filterTabTextActive: { color: '#0469ff' },

    // ── Section header ────────────────────────────────────────────────────────
    section: { marginBottom: 8 },
    sectionHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 14,
    },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0D1117', letterSpacing: -0.2 },
    sectionBadge: {
        backgroundColor: '#EEF4FF',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    },
    sectionBadgeText: { fontSize: 12, fontWeight: '700', color: '#0469ff' },

    loadingContainer: { padding: 40, alignItems: 'center', gap: 10 },
    loadingText: { fontSize: 14, color: '#8A97B0' },

    // ── Day group ─────────────────────────────────────────────────────────────
    dayGroup: { marginBottom: 18 },
    dayLabelRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
    },
    dayLabelDot: {
        width: 8, height: 8, borderRadius: 4, backgroundColor: '#0469ff',
    },
    dayLabel: { fontSize: 13, fontWeight: '700', color: '#4A5568' },
    dayLabelLine: { flex: 1, height: 1, backgroundColor: '#E8EEF4' },

    // ── Attendance card ───────────────────────────────────────────────────────
    attendanceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 8,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    cardAccent: { width: 4, alignSelf: 'stretch' },
    statusIconBox: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center', justifyContent: 'center',
        marginLeft: 12, marginVertical: 12,
    },
    cardInfo: { flex: 1, paddingVertical: 12, paddingLeft: 10 },
    tripTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tripTypeText: { fontSize: 13, fontWeight: '700', color: '#0D1117' },
    stopRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
    stopText: { fontSize: 12, color: '#8A97B0' },
    cardRight: { alignItems: 'flex-end', paddingRight: 14, paddingVertical: 12, gap: 6 },
    statusPill: {
        paddingHorizontal: 9, paddingVertical: 4,
        borderRadius: 20, borderWidth: 1,
    },
    statusPillText: { fontSize: 10, fontWeight: '800' },
    markedTime: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
});