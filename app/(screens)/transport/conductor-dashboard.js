// Conductor Dashboard Screen
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { stopBackgroundLocationTask } from '../../../lib/transport-location-task';

export default function ConductorDashboard() {
    const [user, setUser] = useState(null);
    const [staff, setStaff] = useState(null);
    const [trips, setTrips] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const userData = await SecureStore.getItemAsync('transportUser');
            const staffData = await SecureStore.getItemAsync('transportStaff');
            const tripsData = await SecureStore.getItemAsync('todayTrips');

            if (userData) setUser(JSON.parse(userData));
            if (staffData) setStaff(JSON.parse(staffData));
            if (tripsData) {
                const parsedTrips = JSON.parse(tripsData);
                // Filter to only today's trips + any IN_PROGRESS from past days
                const today = new Date().toISOString().split('T')[0];
                const todayTrips = parsedTrips.filter(t => {
                    const tripDate = new Date(t.date || t.createdAt).toISOString().split('T')[0];
                    return tripDate === today || t.status === 'IN_PROGRESS';
                });
                setTrips(todayTrips);
            }
        } catch (err) {
            console.error('Error loading data:', err);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    // Stop background location tracking first
                    try {
                        await stopBackgroundLocationTask();
                    } catch (e) {
                        console.warn('Could not stop location task:', e.message);
                    }
                    await SecureStore.deleteItemAsync('transportUser');
                    await SecureStore.deleteItemAsync('transportStaff');
                    await SecureStore.deleteItemAsync('transportToken');
                    await SecureStore.deleteItemAsync('todayTrips');
                    router.replace('/(screens)/transport/transport-login');
                },
            },
        ]);
    };

    const TripCard = ({ trip }) => {
        const isActive = trip.status === 'IN_PROGRESS';

        return (
            <TouchableOpacity
                style={[styles.tripCard, isActive && styles.tripCardActive]}
                onPress={() => isActive && router.push({ pathname: '/(screens)/transport/attendance-marking', params: { tripId: trip.id } })}
                disabled={!isActive}
            >
                <View style={styles.tripHeader}>
                    <View style={[styles.tripTypeBadge, trip.tripType === 'PICKUP' ? styles.pickupBadge : styles.dropBadge]}>
                        <Ionicons name={trip.tripType === 'PICKUP' ? 'sunny' : 'moon'} size={14} color="#fff" />
                        <Text style={styles.tripTypeBadgeText}>{trip.tripType}</Text>
                    </View>
                    <View style={[styles.statusBadge, styles[`status${trip.status}`]]}>
                        <Text style={styles.statusText}>{trip.status.replace('_', ' ')}</Text>
                    </View>
                </View>

                <Text style={styles.routeName}>{trip.route?.name}</Text>

                <View style={styles.tripDetails}>
                    <View style={styles.tripDetail}>
                        <Ionicons name="car" size={16} color="#64748B" />
                        <Text style={styles.tripDetailText}>{trip.vehicle?.licensePlate}</Text>
                    </View>
                    {(() => {
                        const stops = trip.route?.busStops || [];
                        const firstStop = stops[0];
                        const tripTime = firstStop ? (trip.tripType === 'PICKUP' ? firstStop.pickupTime : firstStop.dropTime) : null;
                        return tripTime ? (
                            <View style={styles.tripDetail}>
                                <Ionicons name="time" size={16} color="#64748B" />
                                <Text style={styles.tripDetailText}>{tripTime}</Text>
                            </View>
                        ) : null;
                    })()}
                    <View style={styles.tripDetail}>
                        <Ionicons name="person" size={16} color="#64748B" />
                        <Text style={styles.tripDetailText}>{trip.driver?.name}</Text>
                    </View>
                </View>

                {isActive && (
                    <View style={styles.actionHint}>
                        <Ionicons name="clipboard" size={18} color="#10b981" />
                        <Text style={styles.actionHintText}>Tap to mark attendance</Text>
                        <Ionicons name="chevron-forward" size={18} color="#10b981" />
                    </View>
                )}

                {trip.status === 'SCHEDULED' && (
                    <View style={styles.waitingHint}>
                        <Ionicons name="time" size={16} color="#f59e0b" />
                        <Text style={styles.waitingHintText}>Waiting for driver to start trip</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const activeTrip = trips.find(t => t.status === 'IN_PROGRESS');

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* StatusBar removed - using global */}
            <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.headerGradient}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] || 'Conductor'} 👋</Text>
                        <Text style={styles.subGreeting}>{staff?.school?.name}</Text>
                    </View>
                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                        <Ionicons name="log-out-outline" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            <ScrollView
                style={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Stats */}
                <View style={styles.statsRow}>
                    <View style={styles.statCard}>
                        <Ionicons name="bus" size={24} color="#6366f1" />
                        <Text style={styles.statValue}>{trips.length}</Text>
                        <Text style={styles.statLabel}>Today's Trips</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Ionicons name="checkmark-done" size={24} color="#10b981" />
                        <Text style={styles.statValue}>{trips.filter(t => t.status === 'COMPLETED').length}</Text>
                        <Text style={styles.statLabel}>Completed</Text>
                    </View>
                </View>

                {/* Active Trip Alert */}
                {activeTrip && (
                    <TouchableOpacity
                        style={styles.activeTripAlert}
                        onPress={() => router.push({ pathname: '/(screens)/transport/attendance-marking', params: { tripId: activeTrip.id } })}
                    >
                        <View style={styles.activeTripPulse} />
                        <Ionicons name="clipboard" size={24} color="#fff" />
                        <View style={styles.activeTripInfo}>
                            <Text style={styles.activeTripTitle}>Mark Attendance</Text>
                            <Text style={styles.activeTripRoute}>{activeTrip.route?.name} • {activeTrip.tripType}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={24} color="#fff" />
                    </TouchableOpacity>
                )}

                {/* Trips Section */}
                <Text style={styles.sectionTitle}>Today's Trips</Text>
                {trips.length > 0 ? (
                    trips.map(trip => <TripCard key={trip.id} trip={trip} />)
                ) : (
                    <View style={styles.emptyState}>
                        <Ionicons name="calendar-outline" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No trips assigned for today</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
    headerGradient: { paddingBottom: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16 },
    greeting: { fontSize: 22, fontWeight: '700', color: '#fff' },
    subGreeting: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
    logoutBtn: { padding: 8 },
    content: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    statValue: { fontSize: 28, fontWeight: '800', color: '#1E293B', marginTop: 8 },
    statLabel: { fontSize: 12, color: '#64748B', marginTop: 4 },
    activeTripAlert: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366f1', borderRadius: 16, padding: 16, marginBottom: 20, gap: 12,
    },
    activeTripPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', opacity: 0.7 },
    activeTripInfo: { flex: 1 },
    activeTripTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    activeTripRoute: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 16 },
    tripCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    tripCardActive: { borderWidth: 2, borderColor: '#6366f1' },
    tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    tripTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    pickupBadge: { backgroundColor: '#f59e0b' },
    dropBadge: { backgroundColor: '#6366f1' },
    tripTypeBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusSCHEDULED: { backgroundColor: '#FEF3C7' },
    statusIN_PROGRESS: { backgroundColor: '#DCFCE7' },
    statusCOMPLETED: { backgroundColor: '#F0FDF4' },
    statusText: { fontSize: 11, fontWeight: '600', color: '#1E293B' },
    routeName: { fontSize: 17, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
    tripDetails: { flexDirection: 'row', gap: 16 },
    tripDetail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tripDetailText: { fontSize: 13, color: '#64748B' },
    actionHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    actionHintText: { flex: 1, fontSize: 14, fontWeight: '600', color: '#10b981' },
    waitingHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    waitingHintText: { fontSize: 13, color: '#f59e0b' },
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 15, color: '#94A3B8', marginTop: 12 },
});
