// Active Trip Screen with live tracking
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../../lib/api';

export default function ActiveTripScreen() {
    const { tripId } = useLocalSearchParams();
    const [trip, setTrip] = useState(null);
    const [loading, setLoading] = useState(true);
    const [completing, setCompleting] = useState(false);
    const locationWatchRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);

    useEffect(() => {
        loadTripDetails();
        startLocationTracking();

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            if (locationWatchRef.current) {
                locationWatchRef.current.remove();
            }
            subscription.remove();
        };
    }, []);

    const handleAppStateChange = (nextAppState) => {
        if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
            loadTripDetails();
        }
        appStateRef.current = nextAppState;
    };

    const loadTripDetails = async () => {
        try {
            const token = await SecureStore.getItemAsync('transportToken');
            const response = await fetch(`${API_BASE_URL}/api/schools/transport/trips/${tripId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const data = await response.json();
                setTrip(data.trip);
            }
        } catch (err) {
            console.error('Error loading trip:', err);
        } finally {
            setLoading(false);
        }
    };

    const startLocationTracking = async () => {
        try {
            const staffData = await SecureStore.getItemAsync('transportStaff');
            const staff = staffData ? JSON.parse(staffData) : null;
            const token = await SecureStore.getItemAsync('transportToken');

            locationWatchRef.current = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 50 },
                async (location) => {
                    try {
                        await fetch(`${API_BASE_URL}/api/schools/transport/location/update`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                                vehicleId: trip?.vehicleId,
                                tripId,
                                transportStaffId: staff?.id,
                                latitude: location.coords.latitude,
                                longitude: location.coords.longitude,
                                speed: location.coords.speed,
                                heading: location.coords.heading,
                            }),
                        });
                    } catch (err) {
                        console.error('Error updating location:', err);
                    }
                }
            );
        } catch (err) {
            console.error('Error starting location tracking:', err);
        }
    };

    const handleCompleteTrip = async () => {
        Alert.alert('Complete Trip', 'Are you sure you want to complete this trip?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Complete',
                onPress: async () => {
                    setCompleting(true);
                    try {
                        const token = await SecureStore.getItemAsync('transportToken');
                        const staffData = await SecureStore.getItemAsync('transportStaff');
                        const staff = staffData ? JSON.parse(staffData) : null;

                        const response = await fetch(`${API_BASE_URL}/api/schools/transport/trips/${tripId}/complete`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`,
                            },
                            body: JSON.stringify({ driverId: staff?.id }),
                        });

                        if (response.ok) {
                            if (locationWatchRef.current) {
                                locationWatchRef.current.remove();
                            }
                            Alert.alert('Success', 'Trip completed successfully!');
                            router.replace('/(screens)/transport/driver-dashboard');
                        } else {
                            const error = await response.json();
                            Alert.alert('Error', error.error || 'Failed to complete trip');
                        }
                    } catch (err) {
                        Alert.alert('Error', 'Failed to complete trip');
                    } finally {
                        setCompleting(false);
                    }
                },
            },
        ]);
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.loadingContainer}>
                    <Text>Loading trip details...</Text>
                </View>
            </SafeAreaView>
        );
    }

    const stops = trip?.route?.busStops || [];

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="light" />
            <LinearGradient colors={['#10b981', '#059669']} style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerContent}>
                    <View style={styles.liveIndicator}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveText}>LIVE</Text>
                    </View>
                    <Text style={styles.headerTitle}>{trip?.route?.name}</Text>
                    <Text style={styles.headerSubtitle}>{trip?.vehicle?.licensePlate} • {trip?.tripType}</Text>
                </View>
            </LinearGradient>

            <ScrollView style={styles.content}>
                {/* Trip Info */}
                <View style={styles.infoCard}>
                    <View style={styles.infoRow}>
                        <View style={styles.infoItem}>
                            <Ionicons name="people" size={20} color="#10b981" />
                            <Text style={styles.infoValue}>{trip?._count?.attendanceRecords || 0}</Text>
                            <Text style={styles.infoLabel}>Attended</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Ionicons name="location" size={20} color="#6366f1" />
                            <Text style={styles.infoValue}>{stops.length}</Text>
                            <Text style={styles.infoLabel}>Stops</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Ionicons name="time" size={20} color="#f59e0b" />
                            <Text style={styles.infoValue}>
                                {trip?.startedAt ? new Date(trip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                            </Text>
                            <Text style={styles.infoLabel}>Started</Text>
                        </View>
                    </View>
                </View>

                {/* Crew Info */}
                {trip?.conductor && (
                    <View style={styles.crewCard}>
                        <Ionicons name="person" size={20} color="#64748B" />
                        <Text style={styles.crewLabel}>Conductor:</Text>
                        <Text style={styles.crewName}>{trip.conductor.name}</Text>
                    </View>
                )}

                {/* Stops List */}
                <Text style={styles.sectionTitle}>Route Stops</Text>
                {stops.map((stop, index) => (
                    <View key={stop.id} style={styles.stopItem}>
                        <View style={styles.stopIndicator}>
                            <View style={[styles.stopDot, index === 0 && styles.stopDotFirst, index === stops.length - 1 && styles.stopDotLast]} />
                            {index < stops.length - 1 && <View style={styles.stopLine} />}
                        </View>
                        <View style={styles.stopInfo}>
                            <Text style={styles.stopName}>{stop.name}</Text>
                            <Text style={styles.stopTime}>
                                {trip?.tripType === 'PICKUP' ? stop.pickupTime : stop.dropTime}
                            </Text>
                        </View>
                        <View style={styles.stopOrder}>
                            <Text style={styles.stopOrderText}>{stop.orderIndex}</Text>
                        </View>
                    </View>
                ))}

                {/* Complete Button */}
                <TouchableOpacity
                    style={styles.completeBtn}
                    onPress={handleCompleteTrip}
                    disabled={completing}
                >
                    <LinearGradient colors={['#ef4444', '#dc2626']} style={styles.completeBtnGradient}>
                        <Ionicons name="checkmark-circle" size={22} color="#fff" />
                        <Text style={styles.completeBtnText}>{completing ? 'Completing...' : 'Complete Trip'}</Text>
                    </LinearGradient>
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { paddingHorizontal: 16, paddingVertical: 20, flexDirection: 'row', alignItems: 'center' },
    backBtn: { padding: 8, marginRight: 12 },
    headerContent: { flex: 1 },
    liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
    liveText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 1 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
    headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    content: { flex: 1, padding: 16 },
    infoCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-around' },
    infoItem: { alignItems: 'center' },
    infoValue: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginTop: 6 },
    infoLabel: { fontSize: 12, color: '#64748B', marginTop: 2 },
    crewCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16 },
    crewLabel: { fontSize: 14, color: '#64748B' },
    crewName: { fontSize: 14, fontWeight: '600', color: '#1E293B' },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12 },
    stopItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 0 },
    stopIndicator: { width: 24, alignItems: 'center' },
    stopDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#E2E8F0', borderWidth: 2, borderColor: '#CBD5E1', zIndex: 1 },
    stopDotFirst: { backgroundColor: '#10b981', borderColor: '#10b981' },
    stopDotLast: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
    stopLine: { width: 2, height: 40, backgroundColor: '#E2E8F0', marginTop: -2 },
    stopInfo: { flex: 1, backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, marginLeft: 12, marginBottom: 8 },
    stopName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
    stopTime: { fontSize: 13, color: '#64748B', marginTop: 2 },
    stopOrder: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
    stopOrderText: { fontSize: 12, fontWeight: '700', color: '#3B82F6' },
    completeBtn: { marginTop: 24, marginBottom: 32, borderRadius: 14, overflow: 'hidden' },
    completeBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
    completeBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
