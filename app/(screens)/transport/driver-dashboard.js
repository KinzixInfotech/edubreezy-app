// Driver Dashboard Screen
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
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../../lib/api';

export default function DriverDashboard() {
    const [user, setUser] = useState(null);
    const [staff, setStaff] = useState(null);
    const [trips, setTrips] = useState([]);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTrip, setActiveTrip] = useState(null);
    const [locationPermission, setLocationPermission] = useState(false);

    useEffect(() => {
        loadData();
        requestLocationPermission();
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
                setTrips(parsedTrips);
                // Check for active trip
                const inProgress = parsedTrips.find(t => t.status === 'IN_PROGRESS');
                if (inProgress) setActiveTrip(inProgress);
            }
        } catch (err) {
            console.error('Error loading data:', err);
        }
    };

    const requestLocationPermission = async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setLocationPermission(status === 'granted');
        if (status !== 'granted') {
            Alert.alert('Location Required', 'Location access is required for live tracking.');
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, []);

    const handleStartTrip = async (trip) => {
        if (!locationPermission) {
            Alert.alert('Location Required', 'Please enable location access to start the trip.');
            return;
        }

        try {
            const location = await Location.getCurrentPositionAsync({});
            const token = await SecureStore.getItemAsync('transportToken');

            const response = await fetch(`${API_BASE_URL}/api/schools/transport/trips/${trip.id}/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    driverId: staff?.id,
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                setActiveTrip(data.trip);
                router.push({ pathname: '/(screens)/transport/active-trip', params: { tripId: trip.id } });
            } else {
                const error = await response.json();
                Alert.alert('Error', error.error || 'Failed to start trip');
            }
        } catch (err) {
            Alert.alert('Error', 'Failed to start trip');
        }
    };

    const handleLogout = async () => {
        Alert.alert('Logout', 'Are you sure you want to logout?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Logout',
                style: 'destructive',
                onPress: async () => {
                    await SecureStore.deleteItemAsync('transportUser');
                    await SecureStore.deleteItemAsync('transportStaff');
                    await SecureStore.deleteItemAsync('transportToken');
                    await SecureStore.deleteItemAsync('todayTrips');
                    router.replace('/(screens)/transport/transport-login');
                },
            },
        ]);
    };

    const TripCard = ({ trip }) => (
        <View style={styles.tripCard}>
            <View style={styles.tripHeader}>
                <View style={[styles.tripTypeBadge, trip.tripType === 'PICKUP' ? styles.pickupBadge : styles.dropBadge]}>
                    <Ionicons name={trip.tripType === 'PICKUP' ? 'sunny' : 'moon'} size={14} color="#fff" />
                    <Text style={styles.tripTypeBadgeText}>{trip.tripType}</Text>
                </View>
                <View style={[styles.statusBadge, styles[`status${trip.status}`]]}>
                    <Text style={styles.statusText}>{trip.status}</Text>
                </View>
            </View>
            <Text style={styles.routeName}>{trip.route?.name}</Text>
            <View style={styles.tripDetails}>
                <View style={styles.tripDetail}>
                    <Ionicons name="car" size={16} color="#64748B" />
                    <Text style={styles.tripDetailText}>{trip.vehicle?.licensePlate}</Text>
                </View>
                {trip.route?.busStops?.length > 0 && (
                    <View style={styles.tripDetail}>
                        <Ionicons name="location" size={16} color="#64748B" />
                        <Text style={styles.tripDetailText}>{trip.route.busStops.length} stops</Text>
                    </View>
                )}
            </View>
            {trip.status === 'SCHEDULED' && (
                <TouchableOpacity style={styles.startButton} onPress={() => handleStartTrip(trip)}>
                    <LinearGradient colors={['#10b981', '#059669']} style={styles.startButtonGradient}>
                        <Ionicons name="play" size={18} color="#fff" />
                        <Text style={styles.startButtonText}>Start Trip</Text>
                    </LinearGradient>
                </TouchableOpacity>
            )}
            {trip.status === 'IN_PROGRESS' && (
                <TouchableOpacity style={styles.continueButton} onPress={() => router.push({ pathname: '/(screens)/transport/active-trip', params: { tripId: trip.id } })}>
                    <Text style={styles.continueButtonText}>Continue Trip →</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* StatusBar removed - using global */}
            <LinearGradient colors={['#1e3a5f', '#0f172a']} style={styles.headerGradient}>
                <View style={styles.header}>
                    <View>
                        <Text style={styles.greeting}>Hello, {user?.name?.split(' ')[0] || 'Driver'} 👋</Text>
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
                        <Text style={styles.statValue}>{trips.length}</Text>
                        <Text style={styles.statLabel}>Today's Trips</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statValue}>{trips.filter(t => t.status === 'COMPLETED').length}</Text>
                        <Text style={styles.statLabel}>Completed</Text>
                    </View>
                    <View style={[styles.statCard, !locationPermission && styles.statCardWarning]}>
                        <Ionicons name="location" size={20} color={locationPermission ? '#10b981' : '#f59e0b'} />
                        <Text style={styles.statLabel}>{locationPermission ? 'GPS On' : 'GPS Off'}</Text>
                    </View>
                </View>

                {/* Active Trip Alert */}
                {activeTrip && (
                    <TouchableOpacity
                        style={styles.activeTripAlert}
                        onPress={() => router.push({ pathname: '/(screens)/transport/active-trip', params: { tripId: activeTrip.id } })}
                    >
                        <View style={styles.activeTripPulse} />
                        <Ionicons name="car" size={24} color="#fff" />
                        <View style={styles.activeTripInfo}>
                            <Text style={styles.activeTripTitle}>Trip In Progress</Text>
                            <Text style={styles.activeTripRoute}>{activeTrip.route?.name}</Text>
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
                        <Text style={styles.emptyText}>No trips scheduled for today</Text>
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
    subGreeting: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
    logoutBtn: { padding: 8 },
    content: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },
    statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    statCardWarning: { borderWidth: 1, borderColor: '#f59e0b' },
    statValue: { fontSize: 24, fontWeight: '800', color: '#1E293B' },
    statLabel: { fontSize: 12, color: '#64748B', marginTop: 4 },
    activeTripAlert: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#10b981', borderRadius: 16, padding: 16, marginBottom: 20, gap: 12,
    },
    activeTripPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff', opacity: 0.7 },
    activeTripInfo: { flex: 1 },
    activeTripTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
    activeTripRoute: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1E293B', marginBottom: 16 },
    tripCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    tripHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    tripTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    pickupBadge: { backgroundColor: '#f59e0b' },
    dropBadge: { backgroundColor: '#6366f1' },
    tripTypeBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusSCHEDULED: { backgroundColor: '#E0E7FF' },
    statusIN_PROGRESS: { backgroundColor: '#DCFCE7' },
    statusCOMPLETED: { backgroundColor: '#F0FDF4' },
    statusText: { fontSize: 11, fontWeight: '600', color: '#1E293B' },
    routeName: { fontSize: 17, fontWeight: '700', color: '#1E293B', marginBottom: 8 },
    tripDetails: { flexDirection: 'row', gap: 16 },
    tripDetail: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    tripDetailText: { fontSize: 13, color: '#64748B' },
    startButton: { marginTop: 16, borderRadius: 12, overflow: 'hidden' },
    startButtonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
    startButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
    continueButton: { marginTop: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 12 },
    continueButtonText: { fontSize: 15, fontWeight: '700', color: '#3B82F6' },
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 15, color: '#94A3B8', marginTop: 12 },
});
