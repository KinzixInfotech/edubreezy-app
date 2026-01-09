// Bus Tracking Screen for Parents - with Live Google Maps
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Dimensions,
    ActivityIndicator,
    RefreshControl,
    Linking,
    Platform,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    RefreshCw,
    Bus,
    MapPin,
    Clock,
    Phone,
    User,
    Navigation,
    CheckCircle2,
    AlertCircle,
    Sun,
    Moon,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

const { height, width } = Dimensions.get('window');

// Bus marker images based on status
const BusMarkerView = ({ status, isStale }) => (
    <View style={[styles.busMarker,
    isStale ? styles.busMarkerStale :
        status === 'MOVING' ? styles.busMarkerMoving :
            status === 'IDLE' ? styles.busMarkerIdle :
                styles.busMarkerOffline
    ]}>
        <Bus size={20} color="#fff" />
    </View>
);

export default function BusTrackingScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const mapRef = useRef(null);
    const markerRef = useRef(null);

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

    // Fetch child's transport assignment
    const { data: assignmentData, isLoading: assignmentLoading } = useQuery({
        queryKey: ['child-transport', schoolId, childData?.studentId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/student-assignments?schoolId=${schoolId}&studentId=${childData?.studentId}`);
            return res.data;
        },
        enabled: !!schoolId && !!childData?.studentId,
    });

    const assignment = assignmentData?.assignments?.[0];
    const vehicleId = assignment?.vehicle?.id || assignment?.route?.vehicle?.id;

    // Fetch bus location - poll every 10 seconds
    const { data: locationData, isLoading: locationLoading, refetch } = useQuery({
        queryKey: ['bus-location', vehicleId],
        queryFn: async () => {
            if (!vehicleId) return null;
            // Also fetch history to smooth movement if needed
            const res = await api.get(`/schools/transport/location/${vehicleId}?history=false`);
            return res.data;
        },
        enabled: !!vehicleId && vehicleId !== 'undefined',
        staleTime: 1000 * 10,
        refetchInterval: vehicleId ? 10000 : false, // Poll every 10 seconds
    });

    const vehicle = locationData?.vehicle || assignment?.vehicle || assignment?.route?.vehicle;
    const location = locationData?.currentLocation;
    const activeTrip = locationData?.activeTrip;
    const status = locationData?.status || 'OFFLINE';
    const secondsAgo = locationData?.secondsAgo;
    const stops = activeTrip?.route?.busStops || [];

    // EDGE CASE: Driver/Conductor from permanent assignment if no active trip
    const driver = locationData?.driver || activeTrip?.driver || assignment?.route?.vehicle?.routeAssignments?.[0]?.driver;
    const conductor = locationData?.conductor || activeTrip?.conductor || assignment?.route?.vehicle?.routeAssignments?.[0]?.conductor;

    // Edge Case #19: Detect stale data despite "MOVING" status
    const isStale = secondsAgo > 60 && status === 'MOVING';

    // Animate map to bus location when it updates
    useEffect(() => {
        if (location?.latitude && location?.longitude && mapRef.current) {
            // Only maximize zoom if it's the first load or user hasn't moved map much
            // For now, just animate smoothly
            mapRef.current.animateCamera({
                center: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                },
                zoom: 15,
            }, { duration: 1000 }); // Slower duration for smoother feel
        }
    }, [location?.latitude, location?.longitude]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const handleCall = (phoneNumber) => {
        if (phoneNumber) {
            Linking.openURL(`tel:${phoneNumber}`);
        }
    };

    const isLoading = assignmentLoading || locationLoading;

    // Format time ago with helpful messages for offline status
    const formatTimeAgo = (seconds, busStatus) => {
        if (!seconds && seconds !== 0) {
            return busStatus === 'OFFLINE' ? 'No data yet' : 'N/A';
        }
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    };

    // Build route polyline
    const routeCoordinates = stops
        .filter(s => s.latitude && s.longitude)
        .map(s => ({ latitude: s.latitude, longitude: s.longitude }));

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
                    <Text style={styles.headerTitle}>Bus Tracking</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.centerContent}>
                    <AlertCircle size={48} color="#EF4444" />
                    <Text style={styles.errorText}>No student selected</Text>
                </View>
            </View>
        );
    }

    const [tracksViewChanges, setTracksViewChanges] = useState(true);

    // Optimization: Stop tracking view changes after render to save memory/battery
    useEffect(() => {
        if (tracksViewChanges) {
            const timer = setTimeout(() => {
                setTracksViewChanges(false);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [tracksViewChanges]);

    // Restart tracking when visual state changes
    useEffect(() => {
        setTracksViewChanges(true);
    }, [status, isStale]);

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View>
                    <Text style={styles.headerTitle}>{childData.name}'s Bus</Text>
                    {vehicle && <Text style={styles.headerSubtitle}>{vehicle.licensePlate}</Text>}
                </View>
                <HapticTouchable onPress={onRefresh} disabled={refreshing}>
                    <View style={styles.refreshButton}>
                        {refreshing ? (
                            <ActivityIndicator size="small" color="#2563EB" />
                        ) : (
                            <RefreshCw size={20} color="#2563EB" />
                        )}
                    </View>
                </HapticTouchable>
            </View>

            {isLoading && !locationData ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingText}>Locating bus...</Text>
                </View>
            ) : !assignment && !isLoading ? (
                <View style={styles.centerContent}>
                    <Bus size={64} color="#CBD5E1" />
                    <Text style={styles.emptyTitle}>No Bus Assigned</Text>
                    <Text style={styles.emptyText}>
                        {childData.name} does not have an assigned bus route yet.
                    </Text>
                </View>
            ) : (
                <View style={styles.contentContainer}>
                    {/* Map View */}
                    <View style={styles.mapContainer}>
                        {!location ? (
                            <View style={styles.mapPlaceholder}>
                                <View style={styles.mapOverlay}>
                                    <MapPin size={32} color="#64748B" />
                                    <Text style={styles.mapOverlayTitle}>Waiting for live location...</Text>
                                    <Text style={styles.mapOverlayText}>Bus has not sent location data yet.</Text>
                                </View>
                            </View>
                        ) : (
                            <MapView
                                ref={mapRef}
                                provider={PROVIDER_GOOGLE}
                                style={styles.map}
                                initialRegion={{
                                    latitude: location.latitude,
                                    longitude: location.longitude,
                                    latitudeDelta: 0.015,
                                    longitudeDelta: 0.015,
                                }}
                                showsUserLocation={true}
                                showsMyLocationButton={true}
                                rotateEnabled={false} // Keep north up for less confusion
                            >
                                <Marker
                                    ref={markerRef}
                                    coordinate={{
                                        latitude: location.latitude,
                                        longitude: location.longitude,
                                    }}
                                    title={vehicle?.licensePlate}
                                    anchor={{ x: 0.5, y: 0.5 }}
                                    tracksViewChanges={tracksViewChanges}
                                >
                                    <BusMarkerView status={status} isStale={isStale} />
                                </Marker>

                                {/* Route Line */}
                                {routeCoordinates.length > 1 && (
                                    <Polyline
                                        coordinates={routeCoordinates}
                                        strokeColor="#3B82F6"
                                        strokeWidth={4}
                                    />
                                )}

                                {/* Stop Markers */}
                                {stops.map((stop, index) => (
                                    stop.latitude && stop.longitude && (
                                        <Marker
                                            key={stop.id}
                                            coordinate={{
                                                latitude: stop.latitude,
                                                longitude: stop.longitude,
                                            }}
                                            title={stop.name}
                                            pinColor={index === 0 ? 'green' : index === stops.length - 1 ? 'red' : 'blue'}
                                        />
                                    )
                                ))}
                            </MapView>
                        )}

                        {/* Status Overlay */}
                        <View style={styles.statusOverlay}>
                            <View style={[styles.statusBadge,
                            isStale ? styles.statusBadgeOffline :
                                status === 'MOVING' ? styles.statusBadgeMoving :
                                    status === 'IDLE' ? styles.statusBadgeIdle :
                                        styles.statusBadgeOffline
                            ]}>
                                <View style={[styles.statusDot,
                                isStale ? styles.statusDotOffline :
                                    status === 'MOVING' ? styles.statusDotMoving :
                                        status === 'IDLE' ? styles.statusDotIdle :
                                            styles.statusDotOffline
                                ]} />
                                <Text style={[styles.statusText,
                                isStale ? styles.statusTextOffline :
                                    status === 'MOVING' ? styles.statusTextMoving :
                                        status === 'IDLE' ? styles.statusTextIdle :
                                            styles.statusTextOffline
                                ]}>
                                    {isStale ? 'Delayed Update' :
                                        status === 'MOVING' ? 'Moving' :
                                            status === 'IDLE' ? 'Idle' : 'Offline'}
                                </Text>
                            </View>
                            <View style={styles.timeBadge}>
                                <Clock size={12} color="#64748B" />
                                <Text style={styles.timeText}>Updated: {formatTimeAgo(secondsAgo, status)}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Info Cards ScrollView */}
                    <ScrollView
                        style={styles.detailsContainer}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 40 }}
                    >
                        {/* Driver Card */}
                        {driver && (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <User size={16} color="#64748B" />
                                    <Text style={styles.cardTitle}>Driver</Text>
                                    {!activeTrip && <Text style={styles.badgeText}>Assigned</Text>}
                                </View>
                                <View style={styles.driverRow}>
                                    <View style={styles.driverAvatar}>
                                        <Text style={styles.driverInitials}>{driver.name?.charAt(0) || 'D'}</Text>
                                    </View>
                                    <View style={styles.driverInfo}>
                                        <Text style={styles.driverName}>{driver.name}</Text>
                                        <Text style={styles.driverLicense}>Lic: {driver.licenseNumber || 'N/A'}</Text>
                                    </View>
                                    {driver.contactNumber && (
                                        <HapticTouchable onPress={() => handleCall(driver.contactNumber)}>
                                            <View style={styles.callButton}>
                                                <Phone size={20} color="#fff" />
                                            </View>
                                        </HapticTouchable>
                                    )}
                                </View>
                            </View>
                        )}

                        {!driver && (
                            <View style={[styles.card, styles.warningCard]}>
                                <View style={styles.cardHeader}>
                                    <AlertCircle size={16} color="#EAB308" />
                                    <Text style={[styles.cardTitle, { color: '#B45309' }]}>No Driver Assigned</Text>
                                </View>
                                <Text style={styles.warningText}>No driver details available for this vehicle yet.</Text>
                            </View>
                        )}

                        {/* Conductor Card */}
                        {conductor && (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <User size={16} color="#64748B" />
                                    <Text style={styles.cardTitle}>Conductor</Text>
                                </View>
                                <View style={styles.driverRow}>
                                    <View style={[styles.driverAvatar, { backgroundColor: '#F3E8FF' }]}>
                                        <Text style={[styles.driverInitials, { color: '#9333EA' }]}>{conductor.name?.charAt(0) || 'C'}</Text>
                                    </View>
                                    <View style={styles.driverInfo}>
                                        <Text style={styles.driverName}>{conductor.name}</Text>
                                        <Text style={styles.driverLicense}>Conductor</Text>
                                    </View>
                                    {conductor.contactNumber && (
                                        <HapticTouchable onPress={() => handleCall(conductor.contactNumber)}>
                                            <View style={styles.callButton}>
                                                <Phone size={20} color="#fff" />
                                            </View>
                                        </HapticTouchable>
                                    )}
                                </View>
                            </View>
                        )}

                        {/* Trip Info */}
                        {activeTrip && (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Navigation size={16} color="#64748B" />
                                    <Text style={styles.cardTitle}>Active Trip</Text>
                                </View>
                                <View style={styles.tripRow}>
                                    <View style={styles.tripInfoItem}>
                                        <Text style={styles.tripLabel}>Type</Text>
                                        <View style={styles.tripBadge}>
                                            <Text style={styles.tripBadgeText}>{activeTrip.tripType}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.tripInfoItem}>
                                        <Text style={styles.tripLabel}>Started</Text>
                                        <Text style={styles.tripValue}>
                                            {activeTrip.startedAt ? new Date(activeTrip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Route Stops */}
                        {stops.length > 0 && (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <MapPin size={16} color="#64748B" />
                                    <Text style={styles.cardTitle}>Route Stops ({stops.length})</Text>
                                </View>
                                <View style={styles.stopsList}>
                                    {stops.map((stop, index) => (
                                        <View key={stop.id} style={styles.stopItem}>
                                            <View style={[styles.stopNumber,
                                            index === 0 ? { backgroundColor: '#10B981' } :
                                                index === stops.length - 1 ? { backgroundColor: '#EF4444' } :
                                                    { backgroundColor: '#3B82F6' }
                                            ]}>
                                                <Text style={styles.stopNumberText}>{index + 1}</Text>
                                            </View>
                                            <View style={styles.stopContent}>
                                                <Text style={styles.stopName}>{stop.name}</Text>
                                                <Text style={styles.stopTime}>
                                                    {activeTrip?.tripType === 'PICKUP' ? stop.pickupTime : stop.dropTime}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    backButton: {
        padding: 8,
        marginRight: 12,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#64748B',
    },
    refreshButton: {
        marginLeft: 'auto',
        padding: 8,
        borderRadius: 20,
        backgroundColor: '#EFF6FF',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#64748B',
    },
    centerContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#334155',
        marginTop: 16,
    },
    emptyText: {
        textAlign: 'center',
        color: '#64748B',
        marginTop: 8,
        lineHeight: 20,
    },
    errorText: {
        fontSize: 16,
        color: '#EF4444',
        marginTop: 12,
    },
    contentContainer: {
        flex: 1,
    },
    mapContainer: {
        height: height * 0.45,
        width: '100%',
        position: 'relative',
    },
    map: {
        ...StyleSheet.absoluteFillObject,
    },
    mapPlaceholder: {
        flex: 1,
        backgroundColor: '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    mapOverlay: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    mapOverlayTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#334155',
        marginTop: 12,
    },
    mapOverlayText: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 4,
    },
    statusOverlay: {
        position: 'absolute',
        top: 16,
        left: 16,
        right: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    statusBadgeMoving: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7' },
    statusBadgeIdle: { backgroundColor: '#FEFCE8', borderWidth: 1, borderColor: '#FEF9C3' },
    statusBadgeOffline: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FEE2E2' },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    statusDotMoving: { backgroundColor: '#16A34A' },
    statusDotIdle: { backgroundColor: '#CA8A04' },
    statusDotOffline: { backgroundColor: '#DC2626' },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    statusTextMoving: { color: '#16A34A' },
    statusTextIdle: { color: '#CA8A04' },
    statusTextOffline: { color: '#DC2626' },
    timeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        gap: 6,
    },
    timeText: {
        fontSize: 11,
        color: '#334155',
        fontWeight: '500',
    },
    detailsContainer: {
        flex: 1,
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        marginTop: -20,
        padding: 20,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 16,
        marginBottom: 16,
    },
    warningCard: {
        backgroundColor: '#FEFCE8',
        borderColor: '#FEF9C3',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#475569',
        marginLeft: 8,
    },
    badgeText: {
        marginLeft: 'auto',
        fontSize: 10,
        backgroundColor: '#E2E8F0',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        color: '#64748B',
        overflow: 'hidden',
    },
    driverRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    driverAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    driverInitials: {
        fontSize: 16,
        fontWeight: '700',
        color: '#2563EB',
    },
    driverInfo: {
        flex: 1,
    },
    driverName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0F172A',
    },
    driverLicense: {
        fontSize: 12,
        color: '#64748B',
        marginTop: 2,
    },
    callButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#2563EB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tripRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    tripInfoItem: {
        flex: 1,
    },
    tripLabel: {
        fontSize: 12,
        color: '#64748B',
        marginBottom: 4,
    },
    tripBadge: {
        backgroundColor: '#DBEAFE',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    tripBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#1E40AF',
    },
    tripValue: {
        fontSize: 14,
        fontWeight: '500',
        color: '#0F172A',
    },
    stopsList: {
        maxHeight: 200,
    },
    stopItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    stopNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    stopNumberText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    stopContent: {
        flex: 1,
    },
    stopName: {
        fontSize: 14,
        color: '#1E293B',
        fontWeight: '500',
    },
    stopTime: {
        fontSize: 12,
        color: '#64748B',
    },
    warningText: {
        fontSize: 13,
        color: '#B45309',
    },
    busMarker: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 5,
    },
    busMarkerMoving: { backgroundColor: '#10B981' },
    busMarkerIdle: { backgroundColor: '#EAB308' },
    busMarkerOffline: { backgroundColor: '#EF4444' },
    busMarkerStale: { backgroundColor: '#F97316' }, // Orange for stale data
});
