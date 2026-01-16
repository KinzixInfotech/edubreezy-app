// Active Trip Screen with live tracking - Premium UI
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, AppState, Dimensions, ActivityIndicator, Linking, RefreshControl, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, MapPin, Clock, Users, Play, Square, Navigation, CheckCircle2, AlertTriangle, Phone, Bus, RefreshCw } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { API_BASE_URL } from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import Animated, { FadeInDown, FadeInUp, FadeIn } from 'react-native-reanimated';
import {
    startBackgroundLocationTask,
    stopBackgroundLocationTask,
    isBackgroundTaskRunning,
    flushLocationQueue,
} from '../../../lib/transport-location-task';

const { width } = Dimensions.get('window');

export default function ActiveTripScreen() {
    const { tripId } = useLocalSearchParams();
    const queryClient = useQueryClient();
    const locationWatchRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);
    const [isTracking, setIsTracking] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);

    // Get current user for comparison
    useEffect(() => {
        const getUser = async () => {
            const userData = await SecureStore.getItemAsync('user');
            if (userData) setCurrentUser(JSON.parse(userData));
        };
        getUser();
    }, []);

    // Fetch Trip Details
    const { data: tripData, isLoading, refetch } = useQuery({
        queryKey: ['trip-details', tripId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/trips/${tripId}`);
            return res.data;
        },
        enabled: !!tripId,
        staleTime: 1000 * 30,
        refetchInterval: 10000,
    });

    const trip = tripData?.trip;
    const stops = trip?.route?.busStops || [];
    const driver = trip?.driver;
    const conductor = trip?.conductor;
    const vehicle = trip?.vehicle;

    // Pull to refresh
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    // Location Tracking Logic - now uses background task
    useEffect(() => {
        const setupTracking = async () => {
            if (trip?.status === 'IN_PROGRESS' && !isTracking) {
                await startLocationTracking();
            }
        };
        setupTracking();

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            // Don't stop tracking when component unmounts - that's the point!
            // Only stop when trip is completed
            subscription.remove();
        };
    }, [trip?.status]);

    const handleAppStateChange = async (nextAppState) => {
        if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
            refetch();
            // Flush any queued location updates when app comes back
            await flushLocationQueue();
        }
        appStateRef.current = nextAppState;
    };

    const startLocationTracking = async () => {
        try {
            const routeName = trip?.route?.name || 'Unknown Route';
            const vehicleId = trip?.vehicleId;

            if (!vehicleId) {
                console.error('No vehicle ID for tracking');
                return;
            }

            // Start background location task with foreground service
            await startBackgroundLocationTask(
                tripId,
                vehicleId,
                routeName,
                API_BASE_URL
            );

            setIsTracking(true);
            console.log('Background location tracking started for trip:', tripId);
        } catch (err) {
            console.error('Error starting location tracking:', err);
            Alert.alert(
                'Location Error',
                'Could not start location tracking. Please ensure location permissions are granted.'
            );
        }
    };

    const stopLocationTracking = async () => {
        try {
            await stopBackgroundLocationTask();
            setIsTracking(false);
            console.log('Background location tracking stopped');
        } catch (err) {
            console.error('Error stopping location tracking:', err);
        }
    };

    // Complete Trip Mutation
    const completeTripMutation = useMutation({
        mutationFn: async () => {
            console.log('Completing trip:', tripId, 'Status:', trip?.status);
            const response = await api.post(`/schools/transport/trips/${tripId}/complete`);
            console.log('Complete trip response:', response.data);
            return response;
        },
        onSuccess: (response) => {
            console.log('Trip completed successfully:', response.data);
            stopLocationTracking();
            Alert.alert('Success', 'Trip completed successfully!', [
                { text: 'OK', onPress: () => router.replace('/(tabs)/home') }
            ]);
            queryClient.invalidateQueries(['driver-trips']);
            queryClient.invalidateQueries(['trip-details']);
        },
        onError: (error) => {
            console.error('Complete trip error:', error?.response?.data || error.message);
            Alert.alert(
                'Error',
                error?.response?.data?.error || 'Failed to complete trip. Please try again.'
            );
        }
    });

    const handleCompleteTrip = () => {
        Alert.alert('Complete Trip', 'Are you sure you want to end this trip?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'End Trip', style: 'destructive', onPress: () => completeTripMutation.mutate() },
        ]);
    };

    const handleCall = (phone) => {
        if (phone) Linking.openURL(`tel:${phone}`);
    };

    const handleNavigate = (stop) => {
        if (stop.latitude && stop.longitude) {
            const url = Platform.select({
                ios: `maps:0,0?q=${stop.name}@${stop.latitude},${stop.longitude}`,
                android: `geo:0,0?q=${stop.latitude},${stop.longitude}(${stop.name})`,
            });
            Linking.openURL(url);
        } else {
            Alert.alert('Navigation', `No coordinates available for ${stop.name}`);
        }
    };

    // Calculate elapsed time
    const getElapsedTime = () => {
        if (!trip?.startedAt) return '--:--';
        const start = new Date(trip.startedAt);
        const now = new Date();
        const diff = Math.floor((now - start) / 60000); // minutes
        if (diff < 60) return `${diff}m`;
        return `${Math.floor(diff / 60)}h ${diff % 60}m`;
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#10B981" />
                    <Text style={styles.loadingText}>Loading trip details...</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (!trip) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centerContent}>
                    <AlertTriangle size={48} color="#EF4444" />
                    <Text style={styles.errorTitle}>Trip Not Found</Text>
                    <Text style={styles.errorText}>Unable to load trip details</Text>
                    <HapticTouchable onPress={() => router.back()} style={styles.backLink}>
                        <Text style={styles.backLinkText}>Go Back</Text>
                    </HapticTouchable>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <View style={styles.container}>
            {/* Gradient Header */}
            <LinearGradient colors={['#10B981', '#059669']} style={styles.header}>
                <SafeAreaView edges={['top']}>
                    <View style={styles.headerContent}>
                        <HapticTouchable onPress={() => router.back()} style={styles.backButton}>
                            <ChevronLeft size={24} color="#fff" />
                        </HapticTouchable>
                        <View style={styles.headerCenter}>
                            <Text style={styles.headerTitle}>{trip?.route?.name || 'Active Trip'}</Text>
                            <View style={styles.headerMeta}>
                                <Text style={styles.headerSubtitle}>{vehicle?.licensePlate}</Text>
                                <View style={styles.tripTypeBadge}>
                                    <Text style={styles.tripTypeText}>{trip?.tripType}</Text>
                                </View>
                            </View>
                        </View>
                        {isTracking && (
                            <Animated.View entering={FadeIn.duration(400)} style={styles.liveBadge}>
                                <View style={styles.livePulse} />
                                <Text style={styles.liveText}>LIVE</Text>
                            </Animated.View>
                        )}
                    </View>

                    {/* Stats Row */}
                    <Animated.View entering={FadeInUp.delay(100).duration(500)} style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Users size={18} color="#fff" />
                            <Text style={styles.statValue}>{trip?._count?.attendanceRecords || 0}</Text>
                            <Text style={styles.statLabel}>Students</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                            <MapPin size={18} color="#fff" />
                            <Text style={styles.statValue}>{stops.length}</Text>
                            <Text style={styles.statLabel}>Stops</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statBox}>
                            <Clock size={18} color="#fff" />
                            <Text style={styles.statValue}>{getElapsedTime()}</Text>
                            <Text style={styles.statLabel}>Elapsed</Text>
                        </View>
                    </Animated.View>
                </SafeAreaView>
            </LinearGradient>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
                }
            >
                {/* End Trip Button */}
                <Animated.View entering={FadeInDown.delay(200).duration(600)}>
                    <HapticTouchable
                        style={styles.endTripButton}
                        onPress={handleCompleteTrip}
                        disabled={completeTripMutation.isPending}
                    >
                        <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.endTripGradient}>
                            {completeTripMutation.isPending ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Square size={22} color="#fff" />
                            )}
                            <Text style={styles.endTripText}>
                                {completeTripMutation.isPending ? 'Ending Trip...' : 'End Trip'}
                            </Text>
                        </LinearGradient>
                    </HapticTouchable>
                </Animated.View>

                {/* Driver & Conductor Cards */}
                {(driver || conductor) && (
                    <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.crewSection}>
                        <Text style={styles.sectionTitle}>Crew</Text>
                        <View style={styles.crewCards}>
                            {driver && (
                                <View style={styles.crewCard}>
                                    <View style={[styles.crewAvatar, { backgroundColor: '#DBEAFE' }]}>
                                        <Text style={[styles.crewInitials, { color: '#2563EB' }]}>{driver.name?.charAt(0)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.crewName}>{driver.name}</Text>
                                        <Text style={styles.crewRole}>Driver {driver.userId === currentUser?.id ? '(You)' : ''}</Text>
                                    </View>
                                    {/* Only show call button if not the current user */}
                                    {driver.contactNumber && driver.userId !== currentUser?.id && (
                                        <HapticTouchable onPress={() => handleCall(driver.contactNumber)} style={styles.callBtn}>
                                            <Phone size={18} color="#fff" />
                                        </HapticTouchable>
                                    )}
                                </View>
                            )}
                            {conductor && (
                                <View style={styles.crewCard}>
                                    <View style={[styles.crewAvatar, { backgroundColor: '#F3E8FF' }]}>
                                        <Text style={[styles.crewInitials, { color: '#9333EA' }]}>{conductor.name?.charAt(0)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.crewName}>{conductor.name}</Text>
                                        <Text style={styles.crewRole}>Conductor {conductor.userId === currentUser?.id ? '(You)' : ''}</Text>
                                    </View>
                                    {/* Only show call button if not the current user */}
                                    {conductor.contactNumber && conductor.userId !== currentUser?.id && (
                                        <HapticTouchable onPress={() => handleCall(conductor.contactNumber)} style={styles.callBtn}>
                                            <Phone size={18} color="#fff" />
                                        </HapticTouchable>
                                    )}
                                </View>
                            )}
                        </View>
                    </Animated.View>
                )}

                {/* Vehicle Info */}
                <Animated.View entering={FadeInDown.delay(350).duration(600)} style={styles.vehicleCard}>
                    <View style={styles.vehicleHeader}>
                        <Bus size={20} color="#10B981" />
                        <Text style={styles.vehicleTitle}>Vehicle</Text>
                    </View>
                    <View style={styles.vehicleInfo}>
                        <View style={styles.vehicleInfoItem}>
                            <Text style={styles.vehicleLabel}>License</Text>
                            <Text style={styles.vehicleValue}>{vehicle?.licensePlate || 'N/A'}</Text>
                        </View>
                        <View style={styles.vehicleInfoItem}>
                            <Text style={styles.vehicleLabel}>Model</Text>
                            <Text style={styles.vehicleValue}>{vehicle?.model || 'N/A'}</Text>
                        </View>
                        <View style={styles.vehicleInfoItem}>
                            <Text style={styles.vehicleLabel}>Capacity</Text>
                            <Text style={styles.vehicleValue}>{vehicle?.capacity || 0} seats</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Route Timeline */}
                <View style={styles.timelineSection}>
                    <Text style={styles.sectionTitle}>Route Timeline</Text>
                    {stops.length === 0 ? (
                        <View style={styles.emptyStops}>
                            <MapPin size={32} color="#CBD5E1" />
                            <Text style={styles.emptyStopsText}>No stops assigned to this route</Text>
                        </View>
                    ) : (
                        <View style={styles.timeline}>
                            {stops.map((stop, index) => (
                                <Animated.View
                                    key={stop.id}
                                    entering={FadeInDown.delay(400 + (index * 50)).duration(500)}
                                    style={styles.timelineItem}
                                >
                                    <View style={styles.timelineLeft}>
                                        {index < stops.length - 1 && <View style={styles.timelineLine} />}
                                        <View style={[
                                            styles.timelineDot,
                                            index === 0 && styles.startDot,
                                            index === stops.length - 1 && styles.endDot
                                        ]}>
                                            <Text style={styles.dotNumber}>{index + 1}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.timelineContent}>
                                        <View style={styles.stopCard}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.stopName}>{stop.name}</Text>
                                                <View style={styles.stopMeta}>
                                                    <Clock size={12} color="#64748B" />
                                                    <Text style={styles.stopTime}>
                                                        {trip?.tripType === 'PICKUP' ? stop.pickupTime : stop.dropTime}
                                                    </Text>
                                                    {stop.students?.length > 0 && (
                                                        <>
                                                            <View style={styles.stopMetaDivider} />
                                                            <Users size={12} color="#64748B" />
                                                            <Text style={styles.stopTime}>{stop.students.length}</Text>
                                                        </>
                                                    )}
                                                </View>
                                            </View>
                                            <HapticTouchable
                                                style={styles.navButton}
                                                onPress={() => handleNavigate(stop)}
                                            >
                                                <Navigation size={16} color="#10B981" />
                                            </HapticTouchable>
                                        </View>
                                    </View>
                                </Animated.View>
                            ))}
                        </View>
                    )}
                </View>

                {/* Tips */}
                <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.tipsCard}>
                    <Text style={styles.tipsTitle}>💡 Trip Tips</Text>
                    <Text style={styles.tipsText}>• Location updates automatically every 5 seconds</Text>
                    <Text style={styles.tipsText}>• Tap navigate buttons to open maps</Text>
                    <Text style={styles.tipsText}>• End trip when all students have been dropped</Text>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: 16,
        color: '#64748B',
        fontSize: 15,
    },
    errorTitle: {
        marginTop: 16,
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
    },
    errorText: {
        marginTop: 4,
        color: '#64748B',
    },
    backLink: {
        marginTop: 24,
        paddingVertical: 12,
        paddingHorizontal: 24,
        backgroundColor: '#F1F5F9',
        borderRadius: 12,
    },
    backLinkText: {
        color: '#2563EB',
        fontWeight: '600',
    },
    header: {
        paddingBottom: 20,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'android' ? 16 : 8,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
        marginLeft: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#fff',
    },
    headerMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '600',
    },
    tripTypeBadge: {
        marginLeft: 8,
        backgroundColor: 'rgba(255,255,255,0.25)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    tripTypeText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#fff',
    },
    liveBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
    },
    livePulse: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#EF4444',
        marginRight: 6,
    },
    liveText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#EF4444',
    },
    statsRow: {
        flexDirection: 'row',
        marginHorizontal: 16,
        marginTop: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 16,
        padding: 16,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '800',
        color: '#fff',
        marginTop: 6,
    },
    statLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 40,
    },
    endTripButton: {
        marginBottom: 20,
        borderRadius: 16,
        overflow: 'hidden',
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    endTripGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        gap: 10,
    },
    endTripText: {
        fontSize: 17,
        fontWeight: '800',
        color: '#fff',
    },
    crewSection: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 12,
    },
    crewCards: {
        gap: 10,
    },
    crewCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    crewAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    crewInitials: {
        fontSize: 18,
        fontWeight: '700',
    },
    crewName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1E293B',
    },
    crewRole: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 2,
    },
    callBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#10B981',
        alignItems: 'center',
        justifyContent: 'center',
    },
    vehicleCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    vehicleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    vehicleTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#475569',
    },
    vehicleInfo: {
        flexDirection: 'row',
    },
    vehicleInfoItem: {
        flex: 1,
    },
    vehicleLabel: {
        fontSize: 11,
        color: '#94A3B8',
        marginBottom: 4,
    },
    vehicleValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1E293B',
    },
    timelineSection: {
        marginBottom: 20,
    },
    emptyStops: {
        alignItems: 'center',
        padding: 40,
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    emptyStopsText: {
        marginTop: 12,
        color: '#64748B',
    },
    timeline: {
        position: 'relative',
    },
    timelineItem: {
        flexDirection: 'row',
    },
    timelineLeft: {
        width: 32,
        alignItems: 'center',
    },
    timelineLine: {
        position: 'absolute',
        top: 28,
        bottom: -16,
        width: 2,
        backgroundColor: '#E2E8F0',
        zIndex: -1,
    },
    timelineDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#10B981',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    startDot: {
        backgroundColor: '#DCFCE7',
        borderColor: '#10B981',
    },
    endDot: {
        backgroundColor: '#FEE2E2',
        borderColor: '#EF4444',
    },
    dotNumber: {
        fontSize: 11,
        fontWeight: '700',
        color: '#10B981',
    },
    timelineContent: {
        flex: 1,
        paddingBottom: 14,
        paddingLeft: 10,
    },
    stopCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    stopName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1E293B',
    },
    stopMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 4,
    },
    stopTime: {
        fontSize: 12,
        color: '#64748B',
    },
    stopMetaDivider: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#CBD5E1',
        marginHorizontal: 6,
    },
    navButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#DCFCE7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tipsCard: {
        backgroundColor: '#EFF6FF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    tipsTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E40AF',
        marginBottom: 10,
    },
    tipsText: {
        fontSize: 13,
        color: '#3B82F6',
        lineHeight: 22,
    },
});
