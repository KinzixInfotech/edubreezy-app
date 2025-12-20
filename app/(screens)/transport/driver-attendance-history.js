// Driver Trip & Attendance History Screen
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Clock,
    Calendar,
    MapPin,
    RotateCcw,
    Users,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function DriverAttendanceHistoryScreen() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    // Get logged-in user
    const { data: user } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = user?.schoolId;
    const userId = user?.id;

    // Fetch Transport Staff ID first
    const { data: staffData } = useQuery({
        queryKey: ['transport-staff-details', schoolId, userId],
        queryFn: async () => {
            if (!schoolId || !userId) return null;
            const res = await api.get(`/schools/transport/staff?schoolId=${schoolId}&userId=${userId}`);
            return res.data?.staff?.[0];
        },
        enabled: !!schoolId && !!userId,
    });

    const driverId = staffData?.id; // This is the generic transport staff ID

    // Fetch Trips History
    const { data: tripsData, isLoading } = useQuery({
        queryKey: ['driver-trips-history', schoolId, driverId, user?.role],
        queryFn: async () => {
            if (!schoolId || !driverId) return null;
            // Determine filter based on role
            const roleFilter = user?.role === 'CONDUCTOR' ? `conductorId=${driverId}` : `driverId=${driverId}`;

            // Fetch last 50 trips
            const res = await api.get(`/schools/transport/trips?schoolId=${schoolId}&${roleFilter}&limit=50&sort=date:desc`);
            return res.data;
        },
        enabled: !!schoolId && !!driverId,
    });

    const trips = tripsData?.trips || [];

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['transport-staff-details']),
            queryClient.invalidateQueries(['driver-trips-history']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'COMPLETED': return '#10B981';
            case 'IN_PROGRESS': return '#3B82F6';
            case 'SCHEDULED': return '#F59E0B';
            case 'CANCELLED': return '#EF4444';
            default: return '#94A3B8';
        }
    };

    const getStatusIcon = (status) => {
        switch (status) {
            case 'COMPLETED': return CheckCircle2;
            case 'IN_PROGRESS': return RotateCcw;
            case 'SCHEDULED': return Clock;
            case 'CANCELLED': return XCircle;
            default: return Clock;
        }
    };

    if (isLoading && !refreshing) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Trip History</Text>
                    <Text style={styles.headerSubtitle}>{trips.length} Trips Record</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {trips.length > 0 ? (
                    trips.map((trip, index) => {
                        const StatusIcon = getStatusIcon(trip.status);
                        return (
                            <Animated.View
                                key={trip.id}
                                entering={FadeInDown.delay(index * 50).duration(400)}
                                style={styles.tripCard}
                            >
                                <View style={styles.tripHeader}>
                                    <View style={styles.dateRow}>
                                        <Calendar size={14} color="#64748B" />
                                        <Text style={styles.dateText}>
                                            {new Date(trip.date || trip.createdAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                                        </Text>
                                    </View>
                                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(trip.status) + '20' }]}>
                                        <StatusIcon size={12} color={getStatusColor(trip.status)} />
                                        <Text style={[styles.statusText, { color: getStatusColor(trip.status) }]}>{trip.status}</Text>
                                    </View>
                                </View>

                                <Text style={styles.routeName}>{trip.route?.name || 'Unnamed Route'}</Text>

                                <View style={styles.tripFooter}>
                                    <View style={styles.metaItem}>
                                        <Clock size={14} color="#94A3B8" />
                                        <Text style={styles.metaText}>
                                            {trip.startTime ? new Date(trip.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Start --:--'}
                                        </Text>
                                    </View>
                                    {trip.vehicle && (
                                        <View style={styles.metaItem}>
                                            <Users size={14} color="#94A3B8" />
                                            <Text style={styles.metaText}>{trip.vehicle.licensePlate}</Text>
                                        </View>
                                    )}
                                </View>
                            </Animated.View>
                        );
                    })
                ) : (
                    <View style={styles.emptyState}>
                        <Clock size={48} color="#cbd5e1" />
                        <Text style={styles.emptyText}>No trip history found</Text>
                    </View>
                )}
                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0f172a',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    tripCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    tripHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    dateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    dateText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748b',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    routeName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a',
        marginBottom: 12,
    },
    tripFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metaText: {
        fontSize: 13,
        color: '#64748b',
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#64748b',
    },
});
