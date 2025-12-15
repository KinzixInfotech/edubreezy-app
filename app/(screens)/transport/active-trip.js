// Active Trip Screen with live tracking
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, AppState, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, MapPin, Clock, Users, Play, Square, Navigation, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function ActiveTripScreen() {
    const { tripId } = useLocalSearchParams();
    const queryClient = useQueryClient();
    const locationWatchRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);
    const [isTracking, setIsTracking] = useState(false);

    // Fetch Trip Details
    const { data: tripData, isLoading, refetch } = useQuery({
        queryKey: ['trip-details', tripId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/trips/${tripId}`);
            return res.data;
        },
        enabled: !!tripId,
        staleTime: 1000 * 30,
        refetchInterval: 10000, // Poll every 10s for updates
    });

    const trip = tripData?.trip;
    const stops = trip?.route?.busStops || [];

    // Location Tracking Logic
    useEffect(() => {
        const setupTracking = async () => {
            if (trip?.status === 'IN_PROGRESS' && !isTracking) {
                await startLocationTracking();
            }
        };
        setupTracking();

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            stopLocationTracking();
            subscription.remove();
        };
    }, [trip?.status]); // Re-run if status changes

    const handleAppStateChange = (nextAppState) => {
        if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
            refetch();
        }
        appStateRef.current = nextAppState;
    };

    const startLocationTracking = async () => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Denied', 'Location permission is required for live tracking.');
                return;
            }

            const staffData = await SecureStore.getItemAsync('user');
            const staff = staffData ? JSON.parse(staffData) : null;

            locationWatchRef.current = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 20 },
                async (location) => {
                    try {
                        await api.post('/schools/transport/location/update', {
                            vehicleId: trip?.vehicleId,
                            tripId,
                            transportStaffId: staff?.id, // Assuming user ID is staff ID
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            speed: location.coords.speed,
                            heading: location.coords.heading,
                        });
                        setIsTracking(true);
                    } catch (err) {
                        console.error('Error updating location:', err);
                    }
                }
            );
        } catch (err) {
            console.error('Error starting location tracking:', err);
        }
    };

    const stopLocationTracking = () => {
        if (locationWatchRef.current) {
            locationWatchRef.current.remove();
            locationWatchRef.current = null;
        }
        setIsTracking(false);
    };

    // Complete Trip Mutation
    const completeTripMutation = useMutation({
        mutationFn: async () => {
            return await api.post(`/schools/transport/trips/${tripId}/complete`);
        },
        onSuccess: () => {
            stopLocationTracking();
            Alert.alert('Success', 'Trip completed successfully!');
            router.replace('/(tabs)/home'); // Navigate back to home
            queryClient.invalidateQueries(['driver-trips']);
        },
        onError: (error) => {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to complete trip');
        }
    });

    const handleCompleteTrip = () => {
        Alert.alert('Complete Trip', 'Are you sure you want to end this trip?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'End Trip',
                style: 'destructive',
                onPress: () => completeTripMutation.mutate(),
            },
        ]);
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centerContent}>
                    <Text>Loading trip details...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color="#111" />
                </HapticTouchable>
                <View>
                    <Text style={styles.headerTitle}>{trip?.route?.name || 'Active Trip'}</Text>
                    <Text style={styles.headerSubtitle}>
                        {trip?.vehicle?.licensePlate} • {trip?.tripType}
                    </Text>
                </View>
                {isTracking && (
                    <View style={styles.liveBadge}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveText}>LIVE</Text>
                    </View>
                )}
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Trip Stats */}
                <Animated.View entering={FadeInDown.duration(600)} style={styles.statsCard}>
                    <View style={styles.statItem}>
                        <View style={[styles.statIcon, { backgroundColor: '#DBEAFE' }]}>
                            <Users size={20} color="#2563EB" />
                        </View>
                        <Text style={styles.statValue}>{trip?._count?.attendanceRecords || 0}</Text>
                        <Text style={styles.statLabel}>Students</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <View style={[styles.statIcon, { backgroundColor: '#DCFCE7' }]}>
                            <MapPin size={20} color="#16A34A" />
                        </View>
                        <Text style={styles.statValue}>{stops.length}</Text>
                        <Text style={styles.statLabel}>Stops</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
                            <Clock size={20} color="#D97706" />
                        </View>
                        <Text style={styles.statValue}>
                            {trip?.startedAt ? new Date(trip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                        </Text>
                        <Text style={styles.statLabel}>Started</Text>
                    </View>
                </Animated.View>

                {/* Status Banner */}
                {trip?.conductor && (
                    <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.conductorBanner}>
                        <Users size={18} color="#475569" />
                        <Text style={styles.conductorText}>Conductor: <Text style={{ fontWeight: '600' }}>{trip.conductor.name}</Text></Text>
                    </Animated.View>
                )}

                {/* Current Action Button */}
                <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.actionSection}>
                    <HapticTouchable
                        style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
                        onPress={handleCompleteTrip}
                        disabled={completeTripMutation.isPending}
                    >
                        {completeTripMutation.isPending ? (
                            <Text style={styles.actionButtonText}>Ending Trip...</Text>
                        ) : (
                            <>
                                <Square size={20} color="#fff" fill="currentColor" />
                                <Text style={styles.actionButtonText}>End Trip</Text>
                            </>
                        )}
                    </HapticTouchable>
                </Animated.View>

                {/* Route Timeline */}
                <View style={styles.timelineSection}>
                    <Text style={styles.sectionTitle}>Route Timeline</Text>
                    <View style={styles.timeline}>
                        {stops.map((stop, index) => (
                            <Animated.View
                                key={stop.id}
                                entering={FadeInDown.delay(300 + (index * 50)).duration(500)}
                                style={styles.timelineItem}
                            >
                                <View style={styles.timelineLeft}>
                                    <View style={[styles.timelineLine, index === stops.length - 1 && { height: 0 }]} />
                                    <View style={[
                                        styles.timelineDot,
                                        index === 0 && styles.startDot,
                                        index === stops.length - 1 && styles.endDot
                                    ]}>
                                        <Text style={styles.orderIndex}>{stop.orderIndex}</Text>
                                    </View>
                                </View>
                                <View style={styles.timelineContent}>
                                    <View style={styles.stopCard}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.stopName}>{stop.name}</Text>
                                            <Text style={styles.stopTime}>
                                                {trip?.tripType === 'PICKUP' ? `Pickup: ${stop.pickupTime}` : `Drop: ${stop.dropTime}`}
                                            </Text>
                                        </View>
                                        <HapticTouchable
                                            style={styles.navButton}
                                            onPress={() => Alert.alert('Navigation', 'Opening maps...')}
                                        >
                                            <Navigation size={16} color="#2563EB" />
                                        </HapticTouchable>
                                    </View>
                                </View>
                            </Animated.View>
                        ))}
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        backgroundColor: '#fff',
    },
    backButton: {
        padding: 8,
        marginRight: 8,
        borderRadius: 20,
        backgroundColor: '#F8FAFC',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#64748B',
    },
    liveBadge: {
        marginLeft: 'auto',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: '#DCFCE7',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#86EFAC',
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#16A34A',
        marginRight: 6,
    },
    liveText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#166534',
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 40,
    },
    statsCard: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 12,
        elevation: 3,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        height: '80%',
        backgroundColor: '#F1F5F9',
        alignSelf: 'center',
    },
    statIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
    },
    statLabel: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 2,
    },
    conductorBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
        gap: 8,
    },
    conductorText: {
        fontSize: 14,
        color: '#475569',
    },
    actionSection: {
        marginBottom: 24,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 16,
        gap: 8,
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    actionButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 16,
    },
    timeline: {
        position: 'relative',
    },
    timelineItem: {
        flexDirection: 'row',
        marginBottom: 0,
    },
    timelineLeft: {
        width: 40,
        alignItems: 'center',
    },
    timelineLine: {
        position: 'absolute',
        top: 24,
        bottom: -24,
        width: 2,
        backgroundColor: '#E2E8F0',
        zIndex: -1,
    },
    timelineDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#CBD5E1',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    startDot: { borderColor: '#16A34A', backgroundColor: '#DCFCE7' },
    endDot: { borderColor: '#EF4444', backgroundColor: '#FEE2E2' },
    orderIndex: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748B',
    },
    timelineContent: {
        flex: 1,
        paddingBottom: 16,
    },
    stopCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        marginLeft: 8,
    },
    stopName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#0F172A',
        marginBottom: 2,
    },
    stopTime: {
        fontSize: 13,
        color: '#64748B',
    },
    navButton: {
        padding: 8,
        backgroundColor: '#DBEAFE',
        borderRadius: 8,
    },
});
