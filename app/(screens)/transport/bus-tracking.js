// Bus Tracking Screen for Parents - with Live Google Maps
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
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
    Image,
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
    ZoomIn,
    ZoomOut,
    Locate,
    School,
    Home,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import HapticTouchable from '../../components/HapticTouch';
import api, { API_BASE_URL } from '../../../lib/api';
import { fetchRouteDirections } from '../../../lib/google-maps-service';
import { calculateETA, resetETAState } from '../../../lib/eta-service';
import { getSchoolLocation } from '../../../lib/geofence-service';
import { useRealtimeLocation } from '../../../hooks/useRealtimeLocation';
import { StatusBar } from 'expo-status-bar';

const { height, width } = Dimensions.get('window');

// Blinkit-style clean map — hides EVERYTHING except roads
const CLEAN_MAP_STYLE = [
    // Hide ALL points of interest
    {
        featureType: "all",
        elementType: "labels.text",
        stylers: [{ visibility: "off" }]
    },
    // Hide ALL transit
    { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
    // Hide ALL road labels and icons
    { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'on' }] },
    // Hide ALL administrative labels (city names, neighborhoods, etc.)
    { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    // Hide water labels
    { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'on' }] },
    // Subtle road colors
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#dadada' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#cfcfcf' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#e8e8e8' }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#f0f0f0' }] },
    // Very light landscape
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f7f7f7' }] },
    // Subtle water
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbeafe' }] },
    // Subtle parks
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#e8f5e9' }] },
];

// Blinkit-inspired bus marker — uses Text for guaranteed Android rendering
const BusMarkerView = memo(({ status, isStale, licensePlate }) => {
    const bgColor = isStale ? '#F97316' :
        status === 'MOVING' ? '#22C55E' :
            status === 'IDLE' ? '#F59E0B' : '#EF4444';

    return (
        <View style={{ width: 120, height: 85, alignItems: 'center', justifyContent: 'flex-end' }}>
            {/* License Plate Badge */}
            {licensePlate ? (
                <View style={{
                    backgroundColor: '#1E293B',
                    paddingHorizontal: 8, paddingVertical: 3,
                    borderRadius: 8, borderWidth: 2, borderColor: '#fff',
                    marginBottom: 2, elevation: 5,
                }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 }}>
                        {licensePlate}
                    </Text>
                </View>
            ) : null}
            {/* Pin Circle with emoji (guaranteed to render on Android) */}
            <View style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: bgColor,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 3, borderColor: '#fff',
                elevation: 8,
            }}>
                <Text style={{ fontSize: 20 }}>🚌</Text>
            </View>
            {/* Pointer */}
            <View style={{
                width: 0, height: 0,
                borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 8,
                borderLeftColor: 'transparent', borderRightColor: 'transparent',
                borderTopColor: '#fff', marginTop: -2,
            }} />
            {/* Shadow dot */}
            <View style={{
                width: 14, height: 5, borderRadius: 7,
                backgroundColor: 'rgba(0,0,0,0.15)',
                marginTop: 1,
            }} />
        </View>
    );
});

export default function BusTrackingScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const [routePolyline, setRoutePolyline] = useState(null);
    const [googleETA, setGoogleETA] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(0.015);
    const [schoolLocation, setSchoolLocation] = useState(null); // Cost-optimized ETA result
    // true on mount so marker renders, then false to stop flashing on every GPS tick
    const [tracksViewChanges, setTracksViewChanges] = useState(true);

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
    console.log("profile", userData);

    const schoolId = userData?.schoolId;

    // Fetch child's transport assignment - cached for 5 mins (doesn't change often)
    const { data: assignmentData, isLoading: assignmentLoading } = useQuery({
        queryKey: ['child-transport', schoolId, childData?.studentId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/student-assignments?schoolId=${schoolId}&studentId=${childData?.studentId}`);
            return res.data;
        },
        enabled: !!schoolId && !!childData?.studentId,
        staleTime: 1000 * 60 * 5, // 5 minutes - route assignments rarely change
        gcTime: 1000 * 60 * 30, // Keep in cache 30 mins
    });

    const assignment = assignmentData?.assignments?.[0];
    const vehicleId = assignment?.vehicle?.id || assignment?.route?.vehicle?.id;

    // Fetch school location for map marker
    useEffect(() => {
        if (schoolId) {
            console.log('[BusTracking] Fetching school location for schoolId:', schoolId);
            getSchoolLocation(schoolId, API_BASE_URL)
                .then(loc => {
                    console.log('[BusTracking] School location result:', JSON.stringify(loc));
                    if (loc?.latitude && loc?.longitude) setSchoolLocation(loc);
                    else console.warn('[BusTracking] School location missing lat/lng:', loc);
                })
                .catch((err) => {
                    console.error('[BusTracking] School location fetch failed:', err);
                });
        }
    }, [schoolId]);

    // tracksViewChanges: true on mount → false after render to stop flashing.
    // Re-enable briefly when status changes so color update is captured.
    useEffect(() => {
        const t = setTimeout(() => setTracksViewChanges(false), 500);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        setTracksViewChanges(true);
        const t = setTimeout(() => setTracksViewChanges(false), 300);
        return () => clearTimeout(t);
    }, [status]);

    // Fetch bus location metadata once (no polling — Realtime handles updates)
    const { data: locationData, isLoading: locationLoading, refetch } = useQuery({
        queryKey: ['bus-location-meta', vehicleId],
        queryFn: async () => {
            if (!vehicleId) return null;
            const res = await api.get(`/schools/transport/location/${vehicleId}?history=false`);
            return res.data;
        },
        enabled: !!vehicleId && vehicleId !== 'undefined',
        staleTime: 1000 * 60 * 5, // Cache for 5 min (metadata doesn't change often)
        // NO refetchInterval — Supabase Realtime handles live location
    });

    // 🔴 REALTIME: Subscribe to live vehicle location via Supabase
    const {
        location: realtimeLocation,
        isConnected: isRealtimeConnected,
        secondsAgo: realtimeSecondsAgo,
    } = useRealtimeLocation(vehicleId, { enabled: !!vehicleId && vehicleId !== 'undefined' });

    const vehicle = locationData?.vehicle || assignment?.vehicle || assignment?.route?.vehicle;
    // Use realtime location if available, fall back to API-fetched location
    const location = realtimeLocation || locationData?.currentLocation;
    const activeTrip = locationData?.activeTrip;
    const status = isRealtimeConnected && realtimeLocation ? 'LIVE' : (locationData?.status || 'OFFLINE');
    const secondsAgo = realtimeSecondsAgo ?? locationData?.secondsAgo;
    const stops = activeTrip?.route?.busStops || [];

    // EDGE CASE: Driver/Conductor from permanent assignment if no active trip
    const driver = locationData?.driver || activeTrip?.driver || assignment?.route?.vehicle?.routeAssignments?.[0]?.driver;
    const conductor = locationData?.conductor || activeTrip?.conductor || assignment?.route?.vehicle?.routeAssignments?.[0]?.conductor;
    const schoolProfilePicture = locationData?.schoolProfilePicture;

    // Edge Case #19: Detect stale data despite "MOVING" status
    const isStale = secondsAgo > 60 && status === 'MOVING';

    // Haversine formula to calculate distance in km
    const getDistanceKm = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Calculate ETA to child's stop
    const childStop = assignment?.stop;
    console.log('[BusTracking] childStop:', childStop?.name, childStop?.latitude, childStop?.longitude);
    console.log('[BusTracking] assignment:', assignment?.id, 'vehicle:', vehicle?.licensePlate);
    const distanceToStop = (location?.latitude && childStop?.latitude)
        ? getDistanceKm(location.latitude, location.longitude, childStop.latitude, childStop.longitude)
        : null;

    // Estimate arrival time — prefer calculateETA result (googleETA), fall back to inline
    const realtimeSpeed = location?.speed; // m/s from GPS / Realtime
    const speedKmh = realtimeSpeed && realtimeSpeed > 0.5 ? realtimeSpeed * 3.6 : 25; // Default 25 km/h
    const roadDistance = distanceToStop ? distanceToStop * 1.3 : null; // 1.3x road factor
    const inlineEtaMinutes = (roadDistance && speedKmh > 0)
        ? Math.round((roadDistance / speedKmh) * 60)
        : null;
    // Use googleETA (from calculateETA with 3-tier logic) when available, else inline
    const etaMinutes = googleETA?.etaMinutes ?? inlineEtaMinutes;

    // Calculate arrival time
    const arrivalTime = etaMinutes
        ? new Date(Date.now() + etaMinutes * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;

    // Auto-fit map to show relevant markers on initial load
    useEffect(() => {
        if (!mapRef.current) return;

        if (busIsActive && location?.latitude && childStop?.latitude) {
            // Active: fit to bus + child stop + optional school
            const coords = [
                { latitude: location.latitude, longitude: location.longitude },
                { latitude: childStop.latitude, longitude: childStop.longitude },
            ];
            if (schoolLocation?.latitude) {
                coords.push({ latitude: schoolLocation.latitude, longitude: schoolLocation.longitude });
            }
            setTimeout(() => {
                mapRef.current?.fitToCoordinates(coords, {
                    edgePadding: { top: 80, right: 60, bottom: 60, left: 60 },
                    animated: true,
                });
            }, 500);
        } else if (childStop?.latitude) {
            // Offline: fit to home + school (if available), else just center on home
            const coords = [{ latitude: childStop.latitude, longitude: childStop.longitude }];
            if (schoolLocation?.latitude) {
                coords.push({ latitude: schoolLocation.latitude, longitude: schoolLocation.longitude });
            }
            setTimeout(() => {
                if (coords.length > 1) {
                    mapRef.current?.fitToCoordinates(coords, {
                        edgePadding: { top: 100, right: 60, bottom: 60, left: 60 },
                        animated: true,
                    });
                } else {
                    mapRef.current?.animateToRegion({
                        latitude: childStop.latitude,
                        longitude: childStop.longitude,
                        latitudeDelta: 0.008,
                        longitudeDelta: 0.008,
                    }, 500);
                }
            }, 500);
        }
    }, [!!location, !!childStop, !!schoolLocation, busIsActive]);

    // Track bus position only when active
    useEffect(() => {
        if (busIsActive && location?.latitude && location?.longitude && mapRef.current) {
            mapRef.current.animateToRegion({
                latitude: location.latitude,
                longitude: location.longitude,
                latitudeDelta: 0.008,
                longitudeDelta: 0.008,
            }, 500);
        }
    }, [busIsActive, location?.latitude, location?.longitude]);

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

    // Zoom controls
    const handleZoomIn = async () => {
        if (!mapRef.current) return;
        try {
            const camera = await mapRef.current.getCamera();
            mapRef.current.animateCamera({ ...camera, zoom: (camera.zoom || 14) + 1 }, { duration: 300 });
        } catch (e) { }
    };

    const handleZoomOut = async () => {
        if (!mapRef.current) return;
        try {
            const camera = await mapRef.current.getCamera();
            mapRef.current.animateCamera({ ...camera, zoom: Math.max((camera.zoom || 14) - 1, 5) }, { duration: 300 });
        } catch (e) { }
    };

    // Focus on bus
    const focusOnBus = () => {
        if (!location?.latitude || !mapRef.current) return;
        mapRef.current.animateToRegion({
            latitude: location.latitude,
            longitude: location.longitude,
            latitudeDelta: 0.005,
            longitudeDelta: 0.005,
        }, 500);
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

    // ====== BLINKIT-STYLE POLYLINE LOGIC ======
    // When bus is ACTIVE (MOVING/IDLE) → solid blue road-following polyline from bus → child stop
    // When bus is OFFLINE → dashed line from school → child stop
    const busIsActive = status === 'MOVING' || status === 'IDLE';

    // Fetch Google Directions route (only when bus is active)
    useEffect(() => {
        if (!busIsActive || !location?.latitude || !childStop?.latitude) {
            setRoutePolyline(null);
            return;
        }

        const origin = { latitude: location.latitude, longitude: location.longitude };
        const destination = { latitude: childStop.latitude, longitude: childStop.longitude };
        const cacheKey = `route_${Math.round(origin.latitude * 100)}_${Math.round(origin.longitude * 100)}_${Math.round(destination.latitude * 100)}`;

        fetchRouteDirections([origin, destination], cacheKey)
            .then(result => {
                if (result?.polyline?.length) {
                    setRoutePolyline(result.polyline);
                }
            })
            .catch(() => { });

        return () => resetETAState();
    }, [busIsActive, location?.latitude, location?.longitude, childStop?.latitude]);

    // Cost-optimized ETA calculation (Google Distance Matrix within 3km, speed/haversine fallback)
    useEffect(() => {
        if (!location?.latitude || !childStop?.latitude) {
            setGoogleETA(null);
            return;
        }
        calculateETA(
            { latitude: location.latitude, longitude: location.longitude, speed: location.speed },
            childStop
        )
            .then(eta => setGoogleETA(eta))
            .catch(() => setGoogleETA(null));
    }, [location?.latitude, location?.longitude, childStop?.id]);

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




    return (
        <View style={styles.container}>
            <StatusBar style='dark' />
            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
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
                    <ScrollView
                        style={styles.detailsContainer}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 40 }}
                    >
                        <View style={{ borderRadius: 10, marginBottom: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' }}>
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
                                        googleRenderer={'LEGACY'}
                                        style={styles.map}
                                        mapType="standard"
                                        customMapStyle={CLEAN_MAP_STYLE}
                                        showsPointsOfInterest={false}
                                        showsBuildings={false}
                                        showsTraffic={false}
                                        showsIndoors={false}
                                        toolbarEnabled={false}
                                        initialRegion={{
                                            latitude: location.latitude,
                                            longitude: location.longitude,
                                            latitudeDelta: 0.015,
                                            longitudeDelta: 0.015,
                                        }}
                                        showsUserLocation={false}
                                        showsMyLocationButton={false}
                                        rotateEnabled={false}
                                        onRegionChangeComplete={(region) => setZoomLevel(region.latitudeDelta)}
                                    >
                                        {/* ====== BUS MARKER ====== */}
                                        {busIsActive && (
                                            <Marker
                                                ref={markerRef}
                                                coordinate={{
                                                    latitude: location.latitude,
                                                    longitude: location.longitude,
                                                }}
                                                anchor={{ x: 0.5, y: 0.5 }}
                                                tracksViewChanges={tracksViewChanges}
                                                title={`🚌 ${vehicle?.licensePlate || 'Bus'}`}
                                                description={status === 'MOVING' ? 'On the way' : 'Idle'}
                                            >
                                                <View style={{
                                                    width: 36, height: 36, borderRadius: 18,
                                                    backgroundColor: isStale ? '#F97316' : status === 'MOVING' ? '#22C55E' : status === 'IDLE' ? '#F59E0B' : '#EF4444',
                                                    alignItems: 'center', justifyContent: 'center',
                                                    borderWidth: 2, borderColor: '#fff',
                                                    elevation: 5,
                                                }}>
                                                    <Text style={{ fontSize: 18, lineHeight: 22, textAlign: 'center', textAlignVertical: 'center' }}>🚌</Text>
                                                </View>
                                            </Marker>
                                        )}

                                        {/* ====== HOME / STOP MARKER (native pin) ====== */}
                                        {childStop?.latitude && childStop?.longitude && (
                                            <Marker
                                                coordinate={{ latitude: childStop.latitude, longitude: childStop.longitude }}
                                                tracksViewChanges={false}
                                                pinColor="blue"
                                                title={`🏠 ${childStop.name || 'Stop'}`}
                                                description="Child's bus stop"
                                            />
                                        )}

                                        {/* ====== POLYLINES ====== */}
                                        {busIsActive && routePolyline?.length > 1 && (
                                            <Polyline
                                                coordinates={routePolyline}
                                                strokeColor="rgba(0,0,0,0.08)"
                                                strokeWidth={12}
                                            />
                                        )}
                                        {busIsActive && routePolyline?.length > 1 && (
                                            <Polyline
                                                coordinates={routePolyline}
                                                strokeColor="#2563EB"
                                                strokeWidth={5}
                                            />
                                        )}
                                        {busIsActive && !routePolyline && childStop?.latitude && (
                                            <Polyline
                                                coordinates={[
                                                    { latitude: location.latitude, longitude: location.longitude },
                                                    { latitude: childStop.latitude, longitude: childStop.longitude },
                                                ]}
                                                strokeColor="#2563EB"
                                                strokeWidth={4}
                                            />
                                        )}
                                        {!busIsActive && childStop?.latitude && schoolLocation?.latitude && (
                                            <Polyline
                                                coordinates={[
                                                    { latitude: schoolLocation.latitude, longitude: schoolLocation.longitude },
                                                    { latitude: childStop.latitude, longitude: childStop.longitude },
                                                ]}
                                                strokeColor="#94A3B8"
                                                strokeWidth={3}
                                                lineDashPattern={[12, 6]}
                                            />
                                        )}

                                        {/* ====== SCHOOL MARKER (native pin) ====== */}
                                        {schoolLocation?.latitude && schoolLocation?.longitude && (
                                            <Marker
                                                coordinate={{
                                                    latitude: Number(schoolLocation.latitude),
                                                    longitude: Number(schoolLocation.longitude),
                                                }}
                                                tracksViewChanges={false}
                                                pinColor="black"
                                                title={`🏫 ${userData?.school?.name || 'School'}`}
                                                description="School location"
                                            />
                                        )}
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

                                {/* Map Controls — Zoom In/Out + Focus on Bus */}
                                <View style={styles.mapControlsContainer}>
                                    <HapticTouchable onPress={handleZoomIn} style={styles.mapControlBtn}>
                                        <ZoomIn size={18} color="#334155" />
                                    </HapticTouchable>
                                    <HapticTouchable onPress={handleZoomOut} style={styles.mapControlBtn}>
                                        <ZoomOut size={18} color="#334155" />
                                    </HapticTouchable>
                                    {location && (
                                        <HapticTouchable onPress={focusOnBus} style={[styles.mapControlBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                                            <Locate size={18} color="#2563EB" />
                                        </HapticTouchable>
                                    )}
                                </View>
                            </View>
                        </View>

                        {/* Info Cards ScrollView */}

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
                                        {driver.profilePicture && driver.profilePicture !== 'default.png' ? (
                                            <Image
                                                source={{ uri: driver.profilePicture }}
                                                style={styles.driverAvatarImage}
                                            />
                                        ) : (
                                            <Text style={styles.driverInitials}>{driver.name?.charAt(0) || 'D'}</Text>
                                        )}
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

                        {/* ETA Card - Show when bus is moving and we have ETA data */}
                        {status === 'MOVING' && (googleETA || etaMinutes !== null) && (
                            <View style={styles.etaCard}>
                                <View style={styles.etaHeader}>
                                    <Clock size={20} color="#2563EB" />
                                    <Text style={styles.etaTitle}>Arriving Soon!</Text>
                                    {googleETA?.source && (
                                        <View style={{ backgroundColor: googleETA.source === 'google' ? '#DBEAFE' : '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 'auto' }}>
                                            <Text style={{ fontSize: 9, fontWeight: '600', color: googleETA.source === 'google' ? '#2563EB' : '#6B7280' }}>
                                                {googleETA.source === 'google' ? '🚦 Traffic' : googleETA.source === 'speed' ? '📡 GPS' : '📏 Est.'}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <View style={styles.etaContent}>
                                    <View style={styles.etaItem}>
                                        <Text style={styles.etaValue}>
                                            {googleETA ? `${(googleETA.distance / 1000).toFixed(1)} km` : `${distanceToStop?.toFixed(1)} km`}
                                        </Text>
                                        <Text style={styles.etaLabel}>Distance</Text>
                                    </View>
                                    <View style={styles.etaDivider} />
                                    <View style={styles.etaItem}>
                                        <Text style={styles.etaValue}>
                                            {googleETA ? `${googleETA.etaMinutes} min` : `${etaMinutes} min`}
                                        </Text>
                                        <Text style={styles.etaLabel}>ETA</Text>
                                    </View>
                                    <View style={styles.etaDivider} />
                                    <View style={styles.etaItem}>
                                        <Text style={styles.etaValue}>{arrivalTime}</Text>
                                        <Text style={styles.etaLabel}>Arrives</Text>
                                    </View>
                                </View>
                                <Text style={styles.etaNote}>📍 To: {childStop?.name || 'Your Stop'}</Text>
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
                                    <View style={[styles.driverAvatar, { backgroundColor: conductor.profilePicture && conductor.profilePicture !== 'default.png' ? 'transparent' : '#F3E8FF' }]}>
                                        {conductor.profilePicture && conductor.profilePicture !== 'default.png' ? (
                                            <Image
                                                source={{ uri: conductor.profilePicture }}
                                                style={styles.driverAvatarImage}
                                            />
                                        ) : (
                                            <Text style={[styles.driverInitials, { color: '#9333EA' }]}>{conductor.name?.charAt(0) || 'C'}</Text>
                                        )}
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

                        {/* Vehicle Info Card */}
                        {vehicle && (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Bus size={16} color="#64748B" />
                                    <Text style={styles.cardTitle}>Vehicle Info</Text>
                                </View>
                                <View style={styles.vehicleInfoGrid}>
                                    <View style={styles.vehicleInfoItem}>
                                        <Text style={styles.vehicleInfoLabel}>Model</Text>
                                        <Text style={styles.vehicleInfoValue}>{vehicle.model || 'N/A'}</Text>
                                    </View>
                                    <View style={styles.vehicleInfoItem}>
                                        <Text style={styles.vehicleInfoLabel}>Capacity</Text>
                                        <Text style={styles.vehicleInfoValue}>{vehicle.capacity ? `${vehicle.capacity} seats` : 'N/A'}</Text>
                                    </View>
                                    <View style={styles.vehicleInfoItem}>
                                        <Text style={styles.vehicleInfoLabel}>License</Text>
                                        <Text style={styles.vehicleInfoValue}>{vehicle.licensePlate || 'N/A'}</Text>
                                    </View>
                                    <View style={styles.vehicleInfoItem}>
                                        <Text style={styles.vehicleInfoLabel}>Status</Text>
                                        <View style={[styles.tripBadge,
                                        status === 'MOVING' ? { backgroundColor: '#DCFCE7' } :
                                            status === 'IDLE' ? { backgroundColor: '#FEF9C3' } :
                                                { backgroundColor: '#FEE2E2' }
                                        ]}>
                                            <Text style={[styles.tripBadgeText,
                                            status === 'MOVING' ? { color: '#16A34A' } :
                                                status === 'IDLE' ? { color: '#CA8A04' } :
                                                    { color: '#DC2626' }
                                            ]}>{status}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Route Summary Card - show even without active trip */}
                        {assignment && (
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <Navigation size={16} color="#64748B" />
                                    <Text style={styles.cardTitle}>Route Information</Text>
                                </View>
                                <View style={styles.routeSummary}>
                                    <View style={styles.routeSummaryItem}>
                                        <MapPin size={18} color="#3B82F6" />
                                        <View style={styles.routeSummaryText}>
                                            <Text style={styles.routeSummaryLabel}>Stop</Text>
                                            <Text style={styles.routeSummaryValue}>{assignment.stop?.name || 'Not Assigned'}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.routeSummaryItem}>
                                        <Clock size={18} color="#10B981" />
                                        <View style={styles.routeSummaryText}>
                                            <Text style={styles.routeSummaryLabel}>Pickup Time</Text>
                                            <Text style={styles.routeSummaryValue}>{assignment.stop?.pickupTime || 'N/A'}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.routeSummaryItem}>
                                        <Clock size={18} color="#EF4444" />
                                        <View style={styles.routeSummaryText}>
                                            <Text style={styles.routeSummaryLabel}>Drop Time</Text>
                                            <Text style={styles.routeSummaryValue}>{assignment.stop?.dropTime || 'N/A'}</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Helpful Tips */}
                        <View style={styles.tipsCard}>
                            <Text style={styles.tipsTitle}>💡 Tracking Tips</Text>
                            <Text style={styles.tipsText}>• Location updates every 10 seconds when bus is moving</Text>
                            <Text style={styles.tipsText}>• Tap the call button to contact driver directly</Text>
                            <Text style={styles.tipsText}>• Pull down to refresh for latest location</Text>
                        </View>
                    </ScrollView>
                </View >
            )
            }
        </View >
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
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 65 : 48,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    backButton: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
    },
    headerCenter: {
        flex: 1,
        marginLeft: 12,
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
        height: height * 0.50,
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
    mapControlsContainer: {
        position: 'absolute',
        right: 12,
        bottom: 16,
        gap: 8,
    },
    mapControlBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.15,
        shadowRadius: 3,
        elevation: 3,
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
        backgroundColor: '#F8FAFC',
        paddingTop: 12,
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 16,
        marginBottom: 12,
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
        overflow: 'hidden',
    },
    driverAvatarImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
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

    // Vehicle Info Grid
    vehicleInfoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    vehicleInfoItem: {
        width: '50%',
        paddingVertical: 8,
    },
    vehicleInfoLabel: {
        fontSize: 11,
        color: '#64748B',
        marginBottom: 2,
    },
    vehicleInfoValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0F172A',
    },

    // Route Summary
    routeSummary: {
        gap: 12,
    },
    routeSummaryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
    },
    routeSummaryText: {
        marginLeft: 12,
    },
    routeSummaryLabel: {
        fontSize: 11,
        color: '#64748B',
    },
    routeSummaryValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0F172A',
    },

    // Tips Card
    tipsCard: {
        backgroundColor: '#EFF6FF',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    tipsTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1E40AF',
        marginBottom: 8,
    },
    tipsText: {
        fontSize: 12,
        color: '#3B82F6',
        lineHeight: 20,
    },

    // ETA Card Styles
    etaCard: {
        backgroundColor: '#F5F5F5',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    etaHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    etaTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E40AF',
        marginLeft: 8,
    },
    etaContent: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        paddingVertical: 16,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    etaItem: {
        alignItems: 'center',
        flex: 1,
    },
    etaValue: {
        fontSize: 24,
        fontWeight: '900',
        color: '#1E40AF',
    },
    etaLabel: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 4,
        fontWeight: '500',
    },
    etaDivider: {
        width: 1,
        height: 30,
        backgroundColor: '#E5E7EB',
    },
    etaNote: {
        fontSize: 12,
        color: '#374151',
        marginTop: 12,
        textAlign: 'center',
        fontWeight: '500',
    },
});

