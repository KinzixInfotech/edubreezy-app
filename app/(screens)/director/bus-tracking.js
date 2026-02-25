// Director Bus Tracking Screen - View individual bus with map and details
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { Bus, ChevronLeft, MapPin, Users, Navigation, Clock, Phone, User, RefreshCw, AlertCircle, Gauge, Compass } from 'lucide-react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { useRealtimeLocation } from '../../../hooks/useRealtimeLocation';
import { StatusBar } from 'expo-status-bar';

const { height, width } = Dimensions.get('window');

// Bus marker component
const BusMarkerView = ({ status }) => (
    <View style={[styles.busMarker,
    status === 'MOVING' ? styles.busMarkerMoving :
        status === 'IDLE' ? styles.busMarkerIdle :
            styles.busMarkerOffline
    ]}>
        <Text style={{ fontSize: 18 }}>🚌</Text>
    </View>
);

export default function DirectorBusTrackingScreen() {
    const params = useLocalSearchParams();
    const { vehicleId, schoolId, busData } = params;
    const [refreshing, setRefreshing] = useState(false);
    const [tracksViewChanges, setTracksViewChanges] = useState(true);
    const mapRef = useRef(null);

    // Optimization: Stop tracking view changes after initial render
    useEffect(() => {
        if (tracksViewChanges) {
            const timer = setTimeout(() => setTracksViewChanges(false), 500);
            return () => clearTimeout(timer);
        }
    }, [tracksViewChanges]);

    // Parse initial bus data if passed
    const initialBusData = busData ? JSON.parse(busData) : null;

    // Fetch bus metadata once (no polling — Realtime handles live location)
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['director-bus-location-meta', vehicleId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/location/${vehicleId}`);
            return res.data;
        },
        enabled: !!vehicleId,
        staleTime: 1000 * 60 * 5,
        // NO refetchInterval — Supabase Realtime handles live location
    });

    // 🔴 REALTIME: Subscribe to live vehicle location via Supabase
    const {
        location: realtimeLocation,
        isConnected: isRealtimeConnected,
        secondsAgo: realtimeSecondsAgo,
    } = useRealtimeLocation(vehicleId, { enabled: !!vehicleId });

    const vehicle = data?.vehicle || initialBusData;
    // Use realtime location if available, fall back to API-fetched location
    const location = realtimeLocation || data?.currentLocation;
    const activeTrip = data?.activeTrip;
    const driver = data?.driver;
    const conductor = data?.conductor;
    const stops = data?.stops || [];
    const status = isRealtimeConnected && realtimeLocation ? 'LIVE' : (data?.status || 'OFFLINE');
    const secondsAgo = realtimeSecondsAgo ?? data?.secondsAgo;
    const routeName = data?.routeName || initialBusData?.routeName;
    const assignedStudents = data?.assignedStudents || 0;

    // Animate map to bus location when it updates
    useEffect(() => {
        if (location?.latitude && location?.longitude && mapRef.current) {
            mapRef.current.animateCamera({
                center: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                },
                zoom: 16,
            }, { duration: 800 });
        }
    }, [location?.latitude, location?.longitude]);

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    const handleCall = (phoneNumber) => {
        if (phoneNumber) {
            Linking.openURL(`tel:${phoneNumber}`);
        }
    };

    const formatTimeAgo = (seconds) => {
        if (!seconds && seconds !== 0) return 'No data';
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    };

    const getStatusColor = (s) => {
        switch (s) {
            case 'MOVING': return { bg: '#DCFCE7', text: '#16A34A', dot: '#16A34A' };
            case 'IDLE': return { bg: '#FEF3C7', text: '#D97706', dot: '#EAB308' };
            default: return { bg: '#FEE2E2', text: '#DC2626', dot: '#DC2626' };
        }
    };

    const statusColor = getStatusColor(status);

    // Format speed (m/s to km/h) - Ensure no negative speed
    const speedKmh = location?.speed ? Math.max(0, Math.round(location.speed * 3.6)) : 0;

    // Ensure properly formatted heading
    const heading = location?.heading && location.heading >= 0 ? Math.round(location.heading) : null;

    // Get heading direction
    const getHeadingDirection = (deg) => {
        if (deg === null) return 'N/A';
        if (deg >= 337.5 || deg < 22.5) return 'N';
        if (deg >= 22.5 && deg < 67.5) return 'NE';
        if (deg >= 67.5 && deg < 112.5) return 'E';
        if (deg >= 112.5 && deg < 157.5) return 'SE';
        if (deg >= 157.5 && deg < 202.5) return 'S';
        if (deg >= 202.5 && deg < 247.5) return 'SW';
        if (deg >= 247.5 && deg < 292.5) return 'W';
        return 'NW';
    };

    // Route polyline
    const routeCoordinates = stops
        .filter(s => s.latitude && s.longitude)
        .map(s => ({ latitude: s.latitude, longitude: s.longitude }));

    if (isLoading && !initialBusData) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#F59E0B" />
                    <Text style={styles.loadingText}>Loading bus data...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>{vehicle?.licensePlate || 'Bus Tracking'}</Text>
                    {routeName && <Text style={styles.headerSubtitle}>{routeName}</Text>}
                </View>
                <HapticTouchable onPress={onRefresh} disabled={refreshing}>
                    <View style={styles.refreshButton}>
                        {refreshing ? (
                            <ActivityIndicator size="small" color="#F59E0B" />
                        ) : (
                            <RefreshCw size={20} color="#F59E0B" />
                        )}
                    </View>
                </HapticTouchable>
            </View>

            <ScrollView
                style={styles.scrollContainer}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
            >
                {/* Map */}
                <View style={styles.mapContainer}>
                    {!location ? (
                        <View style={styles.mapPlaceholder}>
                            <MapPin size={32} color="#9CA3AF" />
                            <Text style={styles.mapPlaceholderText}>No live location</Text>
                            <Text style={styles.mapPlaceholderSubtext}>Bus hasn't started transmitting yet</Text>
                        </View>
                    ) : (
                        <MapView
                            ref={mapRef}
                            provider={PROVIDER_GOOGLE}
                            googleRenderer={'LEGACY'}
                            style={styles.map}
                            mapType="standard"
                            initialRegion={{
                                latitude: location.latitude,
                                longitude: location.longitude,
                                latitudeDelta: 0.01,
                                longitudeDelta: 0.01,
                            }}
                            showsUserLocation={false}
                            rotateEnabled={false}
                            zoomEnabled={true}
                            zoomControlEnabled={true}
                        >
                            {/* Bus Marker */}
                            <Marker
                                coordinate={{
                                    latitude: location.latitude,
                                    longitude: location.longitude,
                                }}
                                tracksViewChanges={tracksViewChanges}
                                title={vehicle?.licensePlate}
                            >
                                <BusMarkerView status={status} />
                            </Marker>

                            {/* Route Line */}
                            {routeCoordinates.length > 1 && (
                                <Polyline
                                    coordinates={routeCoordinates}
                                    strokeColor="#3B82F6"
                                    strokeWidth={3}
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
                                        tracksViewChanges={false}
                                        title={stop.name}
                                        pinColor={index === 0 ? 'green' : index === stops.length - 1 ? 'red' : 'blue'}
                                    />
                                )
                            ))}
                        </MapView>
                    )}

                    {/* Status Overlay - only show if location exists */}
                    {location && (
                        <View style={styles.statusOverlay}>
                            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                                <View style={[styles.statusDot, { backgroundColor: statusColor.dot }]} />
                                <Text style={[styles.statusText, { color: statusColor.text }]}>{status}</Text>
                            </View>
                            <View style={styles.timeBadge}>
                                <Clock size={12} color="#64748B" />
                                <Text style={styles.timeText}>{formatTimeAgo(secondsAgo)}</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Live Stats Card - Speed & Heading */}
                {location && (
                    <View style={styles.liveStatsCard}>
                        <View style={styles.liveStatItem}>
                            <Gauge size={20} color="#3B82F6" />
                            <View style={styles.liveStatContent}>
                                <Text style={styles.liveStatValue}>{speedKmh !== null ? `${speedKmh}` : '--'}</Text>
                                <Text style={styles.liveStatUnit}>km/h</Text>
                            </View>
                        </View>
                        <View style={styles.liveStatDivider} />
                        <View style={styles.liveStatItem}>
                            <Compass size={20} color="#8B5CF6" />
                            <View style={styles.liveStatContent}>
                                <Text style={styles.liveStatValue}>{getHeadingDirection(heading)}</Text>
                                <Text style={styles.liveStatUnit}>{heading !== null ? `${heading}°` : 'N/A'}</Text>
                            </View>
                        </View>
                        <View style={styles.liveStatDivider} />
                        <View style={styles.liveStatItem}>
                            <Clock size={20} color="#10B981" />
                            <View style={styles.liveStatContent}>
                                <Text style={styles.liveStatValue}>{formatTimeAgo(secondsAgo).replace(' ago', '')}</Text>
                                <Text style={styles.liveStatUnit}>ago</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Vehicle Info Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <Bus size={16} color="#F59E0B" />
                        <Text style={styles.cardTitle}>Vehicle Info</Text>
                    </View>
                    <View style={styles.vehicleGrid}>
                        <View style={styles.vehicleGridItem}>
                            <Text style={styles.gridLabel}>License Plate</Text>
                            <Text style={styles.gridValue}>{vehicle?.licensePlate || 'N/A'}</Text>
                        </View>
                        <View style={styles.vehicleGridItem}>
                            <Text style={styles.gridLabel}>Model</Text>
                            <Text style={styles.gridValue}>{vehicle?.model || 'N/A'}</Text>
                        </View>
                        <View style={styles.vehicleGridItem}>
                            <Text style={styles.gridLabel}>Capacity</Text>
                            <Text style={styles.gridValue}>{vehicle?.capacity ? `${vehicle.capacity} seats` : 'N/A'}</Text>
                        </View>
                        <View style={styles.vehicleGridItem}>
                            <Text style={styles.gridLabel}>Students</Text>
                            <Text style={styles.gridValue}>{assignedStudents}</Text>
                        </View>
                    </View>
                </View>

                {/* Active Trip Card */}
                {activeTrip && (
                    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: '#16A34A' }]}>
                        <View style={styles.cardHeader}>
                            <Navigation size={16} color="#16A34A" />
                            <Text style={styles.cardTitle}>Active Trip</Text>
                            <View style={styles.tripTypeBadge}>
                                <Text style={styles.tripTypeText}>{activeTrip.tripType}</Text>
                            </View>
                        </View>
                        <View style={styles.tripInfo}>
                            <Text style={styles.tripRoute}>{activeTrip.route?.name || routeName || 'Route'}</Text>
                            <Text style={styles.tripStarted}>
                                Started: {activeTrip.startedAt ? new Date(activeTrip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Driver Card */}
                {driver ? (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <User size={16} color="#3B82F6" />
                            <Text style={styles.cardTitle}>Driver</Text>
                        </View>
                        <View style={styles.personRow}>
                            <View style={styles.personAvatar}>
                                <Text style={styles.personInitials}>{driver.name?.charAt(0) || 'D'}</Text>
                            </View>
                            <View style={styles.personInfo}>
                                <Text style={styles.personName}>{driver.name}</Text>
                                <Text style={styles.personSub}>License: {driver.licenseNumber || driver.license || 'N/A'}</Text>
                            </View>
                            {(driver.contactNumber || driver.phone) && (
                                <HapticTouchable onPress={() => handleCall(driver.contactNumber || driver.phone)}>
                                    <View style={styles.callButton}>
                                        <Phone size={18} color="#fff" />
                                    </View>
                                </HapticTouchable>
                            )}
                        </View>
                    </View>
                ) : (
                    <View style={[styles.card, styles.warningCard]}>
                        <View style={styles.cardHeader}>
                            <AlertCircle size={16} color="#D97706" />
                            <Text style={[styles.cardTitle, { color: '#92400E' }]}>No Driver Assigned</Text>
                        </View>
                        <Text style={styles.warningText}>No driver is currently assigned to this vehicle.</Text>
                    </View>
                )}

                {/* Conductor Card */}
                {conductor && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <User size={16} color="#8B5CF6" />
                            <Text style={styles.cardTitle}>Conductor</Text>
                        </View>
                        <View style={styles.personRow}>
                            <View style={[styles.personAvatar, { backgroundColor: '#F3E8FF' }]}>
                                <Text style={[styles.personInitials, { color: '#8B5CF6' }]}>{conductor.name?.charAt(0) || 'C'}</Text>
                            </View>
                            <View style={styles.personInfo}>
                                <Text style={styles.personName}>{conductor.name}</Text>
                                <Text style={styles.personSub}>Conductor</Text>
                            </View>
                            {(conductor.contactNumber || conductor.phone) && (
                                <HapticTouchable onPress={() => handleCall(conductor.contactNumber || conductor.phone)}>
                                    <View style={styles.callButton}>
                                        <Phone size={18} color="#fff" />
                                    </View>
                                </HapticTouchable>
                            )}
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
                                            {activeTrip?.tripType === 'PICKUP' ? stop.pickupTime : stop.dropTime || stop.pickupTime}
                                        </Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerCenter: { flex: 1, marginLeft: 12 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#1F2937' },
    headerSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
    refreshButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FEF3C7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
    scrollContainer: { flex: 1 },
    mapContainer: {
        height: height * 0.35,
        backgroundColor: '#E5E7EB',
        position: 'relative',
    },
    map: { flex: 1 },
    mapPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
    },
    mapPlaceholderText: { fontSize: 14, fontWeight: '600', color: '#6B7280', marginTop: 12 },
    mapPlaceholderSubtext: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
    statusOverlay: {
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        gap: 6,
    },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 12, fontWeight: '600' },
    timeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.95)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 16,
        gap: 6,
    },
    timeText: { fontSize: 11, color: '#374151', fontWeight: '500' },
    card: {
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    warningCard: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    cardTitle: { fontSize: 14, fontWeight: '600', color: '#374151', marginLeft: 8, flex: 1 },
    vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    vehicleGridItem: { width: '50%', paddingVertical: 6 },
    gridLabel: { fontSize: 11, color: '#9CA3AF' },
    gridValue: { fontSize: 14, fontWeight: '600', color: '#1F2937', marginTop: 2 },
    tripTypeBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    tripTypeText: { fontSize: 11, fontWeight: '600', color: '#16A34A' },
    tripInfo: { marginTop: 4 },
    tripRoute: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    tripStarted: { fontSize: 12, color: '#6B7280', marginTop: 4 },
    personRow: { flexDirection: 'row', alignItems: 'center' },
    personAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#DBEAFE',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    personInitials: { fontSize: 16, fontWeight: '700', color: '#3B82F6' },
    personInfo: { flex: 1 },
    personName: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    personSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
    callButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#3B82F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    warningText: { fontSize: 13, color: '#92400E' },
    stopsList: { maxHeight: 200 },
    stopItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    stopNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    stopNumberText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    stopContent: { flex: 1 },
    stopName: { fontSize: 14, fontWeight: '500', color: '#1F2937' },
    stopTime: { fontSize: 12, color: '#6B7280' },
    // Bus Markers
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
    busMarkerMoving: { backgroundColor: '#16A34A' },
    busMarkerIdle: { backgroundColor: '#EAB308' },
    busMarkerOffline: { backgroundColor: '#DC2626' },
    // Live Stats Card
    liveStatsCard: {
        flexDirection: 'row',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        justifyContent: 'space-around',
    },
    liveStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    liveStatContent: {
        alignItems: 'flex-start',
    },
    liveStatValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
    },
    liveStatUnit: {
        fontSize: 11,
        color: '#6B7280',
    },
    liveStatDivider: {
        width: 1,
        height: 32,
        backgroundColor: '#E5E7EB',
    },
});
