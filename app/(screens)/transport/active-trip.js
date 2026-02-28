// Active Trip Screen with live tracking - Matching bus-tracking.js UI style
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Alert,
    AppState,
    Dimensions,
    ActivityIndicator,
    Linking,
    RefreshControl,
    Platform,
    Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import {
    ArrowLeft,
    RefreshCw,
    MapPin,
    Clock,
    Users,
    Square,
    Navigation,
    CheckCircle2,
    AlertCircle,
    Phone,
    Bus,
    Check,
    X,
    Target,
    User,
    Gauge,
} from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api, { API_BASE_URL } from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import Animated, { FadeInDown, ZoomIn, SlideInUp } from 'react-native-reanimated';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import {
    startForegroundLocationTracking,
    stopForegroundLocationTracking,
    flushLocationQueue,
    updateTripStops,
} from '../../../lib/transport-location-task';
import LocationDisclosureModal from '../../components/LocationDisclosureModal';
import {
    getDistanceMeters,
    checkStopProximity,
    markStopCompleted,
    getCompletedStops,
    clearCompletedStops,
    areAllStopsCompleted,
    getNextStop,
    formatDistance,
    getSchoolLocation,
    isNearSchool,
} from '../../../lib/geofence-service';
import { fetchRouteDirections, checkRouteDeviation, clearCachedRoute } from '../../../lib/google-maps-service';
import { calculateETA, resetETAState } from '../../../lib/eta-service';
import { animateMarkerMovement, calculateBearing } from '../../../lib/map-utils';
const { width, height } = Dimensions.get('window');
const STOP_GEOFENCE_RADIUS = 80;

// Blinkit-inspired bus marker — uses Text for guaranteed Android rendering (same as bus-tracking.js)
const BusMarkerView = ({ isTracking, licensePlate }) => (
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
        {/* Pin Circle with emoji — guaranteed to render on Android LEGACY renderer */}
        <View style={{
            width: 42, height: 42, borderRadius: 21,
            backgroundColor: isTracking ? '#22C55E' : '#F59E0B',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 3, borderColor: '#fff',
            elevation: 8,
        }}>
            <Text style={{ fontSize: 20 }}>🚌</Text>
        </View>
        {/* Pointer triangle */}
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

export default function ActiveTripScreen() {
    const { tripId } = useLocalSearchParams();
    const queryClient = useQueryClient();
    const mapRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);
    const [isTracking, setIsTracking] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [currentUser, setCurrentUser] = useState(null);
    const [currentLocation, setCurrentLocation] = useState(null);
    const [completedStopIds, setCompletedStopIds] = useState([]);
    const [showCompletionModal, setShowCompletionModal] = useState(false);
    const [tripStats, setTripStats] = useState({ duration: 0, stopsCompleted: 0 });
    const [showStopConfirmModal, setShowStopConfirmModal] = useState(false);
    const [pendingStopCompletion, setPendingStopCompletion] = useState(null);
    const [tracksViewChanges, setTracksViewChanges] = useState(true);
    const [isFocusedOnBus, setIsFocusedOnBus] = useState(true); // Track if map is centered on bus
    const [showCompleteReminder, setShowCompleteReminder] = useState(false); // Reminder when all stops done
    const [schoolLocation, setSchoolLocation] = useState(null); // School coordinates for geofencing
    const [isNearSchoolFlag, setIsNearSchoolFlag] = useState(false); // Flag for approaching school
    const [routePolyline, setRoutePolyline] = useState(null); // Google Directions polyline
    const [nextStopETA, setNextStopETA] = useState(null); // ETA to next stop
    const busMarkerRef = useRef(null); // For animated marker
    const isTrackingRef = useRef(false); // Ref to avoid stale closure in effects
    const isTripEndingRef = useRef(false); // Guard to prevent disclosure flash on trip end
    const prevLocationRef = useRef(null); // Previous location for animation
    const [busHeading, setBusHeading] = useState(0); // Bus heading for marker rotation
    const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);

    // Refs to keep location callback values current (avoids stale closure)
    const completedStopIdsRef = useRef([]);
    const pendingStopRef = useRef(null);
    const stopsRef = useRef([]);
    const schoolLocationRef = useRef(null);
    const isNearSchoolRef = useRef(false);
    const showStopModalRef = useRef(false);
    const locationSubRef = useRef(null); // Location watch subscription from disclosure flow

    // tracksViewChanges: true on mount so the bus marker renders correctly,
    // then false to stop re-rendering on every GPS update (prevents flashing).
    // Re-enables briefly when isTracking changes so the color update is captured.
    useEffect(() => {
        const t = setTimeout(() => setTracksViewChanges(false), 500);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        setTracksViewChanges(true);
        const t = setTimeout(() => setTracksViewChanges(false), 300);
        return () => clearTimeout(t);
    }, [isTracking]);

    // Keep refs in sync with state
    useEffect(() => { completedStopIdsRef.current = completedStopIds; }, [completedStopIds]);
    useEffect(() => { pendingStopRef.current = pendingStopCompletion; }, [pendingStopCompletion]);
    useEffect(() => { stopsRef.current = stops; }, [stops]);
    useEffect(() => { schoolLocationRef.current = schoolLocation; }, [schoolLocation]);
    useEffect(() => { isNearSchoolRef.current = isNearSchoolFlag; }, [isNearSchoolFlag]);
    useEffect(() => { showStopModalRef.current = showStopConfirmModal; }, [showStopConfirmModal]);

    // Get current user and school location
    useEffect(() => {
        const getUser = async () => {
            const userData = await SecureStore.getItemAsync('user');
            if (userData) {
                const user = JSON.parse(userData);
                setCurrentUser(user);
                // Fetch school location for geofencing
                if (user.schoolId) {
                    try {
                        const location = await getSchoolLocation(user.schoolId, API_BASE_URL);
                        setSchoolLocation(location);
                        console.log('Loaded school location for geofencing:', location);
                    } catch (e) {
                        console.error('Error loading school location:', e);
                    }
                }
            }
        };
        getUser();
    }, []);

    // Load completed stops on mount
    useEffect(() => {
        if (tripId) loadCompletedStops();
    }, [tripId]);

    const loadCompletedStops = async () => {
        const stops = await getCompletedStops(tripId);
        setCompletedStopIds(stops);
    };

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

    const nextStop = getNextStop(stops, completedStopIds);

    // Calculate elapsed time
    const getElapsedTime = useCallback(() => {
        if (!trip?.startedAt) return '0m';
        const start = new Date(trip.startedAt);
        const diff = Date.now() - start.getTime();

        // Handle negative diff (future startedAt due to timezone issues)
        if (diff < 0) return '0m';

        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m`;
    }, [trip?.startedAt]);

    // Pull to refresh
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        await loadCompletedStops();
        setRefreshing(false);
    }, [refetch]);

    // Location Tracking with Geofencing
    useEffect(() => {
        let locationSubscription = null;

        const setupTracking = async () => {
            // Skip if already tracking, trip is ending, or trip isn't in progress
            if (isTrackingRef.current || isTripEndingRef.current || trip?.status !== 'IN_PROGRESS') {
                return;
            }

            // Check if foreground permission is already granted
            // Google Play policy: show disclosure before using fine location
            // Show once per trip session (not permanently dismissed)
            const shownThisSession = await SecureStore.getItemAsync(`disclosure_shown_trip_${tripId}`);
            if (!shownThisSession) {
                // Show disclosure first, tracking starts after user accepts
                setShowLocationDisclosure(true);
            } else {
                // Already shown this session, start tracking
                const { status } = await Location.getForegroundPermissionsAsync();
                if (status === 'granted') {
                    await startLocationTracking();
                    locationSubscription = await Location.watchPositionAsync(
                        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
                        handleLocationUpdate
                    );
                } else {
                    // Request permission
                    const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
                    if (newStatus === 'granted') {
                        await startLocationTracking();
                        locationSubscription = await Location.watchPositionAsync(
                            { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
                            handleLocationUpdate
                        );
                    }
                }
            }
        };
        setupTracking();

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => {
            if (locationSubscription) locationSubscription.remove();
            if (locationSubRef.current) locationSubRef.current.remove();
            subscription.remove();
        };
    }, [trip?.status]);

    const handleAcceptDisclosure = async () => {
        setShowLocationDisclosure(false);
        // Mark disclosure as shown for this trip
        await SecureStore.setItemAsync(`disclosure_shown_trip_${tripId}`, 'true');
        // Request permission if not already granted
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
            const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
            if (newStatus !== 'granted') return;
        }
        await startLocationTracking();
        // Start watching location
        const sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
            handleLocationUpdate
        );
        // Store subscription ref for cleanup
        locationSubRef.current = sub;
    };

    const handleLocationUpdate = async (location) => {
        const { latitude, longitude, speed } = location.coords;
        setCurrentLocation({ latitude, longitude, speed });

        // Use refs for current values (avoids stale closure)
        const currentCompletedStops = completedStopIdsRef.current;
        const currentPendingStop = pendingStopRef.current;
        const currentStops = stopsRef.current;
        const currentSchoolLoc = schoolLocationRef.current;
        const currentIsNearSchool = isNearSchoolRef.current;
        const isModalShowing = showStopModalRef.current;

        // Check proximity to stops — skip if modal is already showing
        if (!isModalShowing && !currentPendingStop) {
            const nearStops = checkStopProximity(latitude, longitude, currentStops, currentCompletedStops, STOP_GEOFENCE_RADIUS);
            if (nearStops.length > 0) {
                const nearest = nearStops[0];
                setPendingStopCompletion(nearest.stop);
                setShowStopConfirmModal(true);
            }
        }

        // Check proximity to school (for PICKUP trips)
        if (currentSchoolLoc?.latitude && currentSchoolLoc?.longitude) {
            const nearSchool = isNearSchool(
                latitude,
                longitude,
                currentSchoolLoc.latitude,
                currentSchoolLoc.longitude,
                currentSchoolLoc.radiusMeters || 200
            );
            if (nearSchool && !currentIsNearSchool) {
                setIsNearSchoolFlag(true);
                console.log('📍 Driver approaching school location!');
            } else if (!nearSchool && currentIsNearSchool) {
                setIsNearSchoolFlag(false);
            }
        }

        // Map animation handled by auto-follow useEffect
    };

    const handleAppStateChange = async (nextAppState) => {
        if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
            refetch();
            await flushLocationQueue();
        }
        appStateRef.current = nextAppState;
    };

    const startLocationTracking = async () => {
        try {
            const routeName = trip?.route?.name || 'Unknown Route';
            const vehicleId = trip?.vehicleId;
            if (!vehicleId) return;

            await startForegroundLocationTracking(tripId, vehicleId, routeName, API_BASE_URL, {
                schoolId: currentUser?.schoolId,
                licensePlate: vehicle?.licensePlate,
                tripType: trip?.tripType,
                stops,
            });
            setIsTracking(true);
            isTrackingRef.current = true;
        } catch (err) {
            console.error('Error starting location tracking:', err);
        }
    };

    const stopLocationTracking = async () => {
        try {
            await stopForegroundLocationTracking();
            setIsTracking(false);
            isTrackingRef.current = false;
        } catch (err) {
            console.error('Error stopping location tracking:', err);
        }
    };

    // Zoom map to a specific stop (sets focus off bus)
    const zoomToStop = (stop) => {
        if (stop?.latitude && stop?.longitude && mapRef.current) {
            setTracksViewChanges(true);
            setIsFocusedOnBus(false); // No longer focused on bus
            mapRef.current.animateCamera({
                center: { latitude: stop.latitude, longitude: stop.longitude },
                zoom: 18,
            }, { duration: 500 });
        }
    };

    // Focus map back on bus location
    const focusOnBus = () => {
        if (currentLocation && mapRef.current) {
            setTracksViewChanges(true);
            setIsFocusedOnBus(true);
            mapRef.current.animateCamera({
                center: { latitude: currentLocation.latitude, longitude: currentLocation.longitude },
                zoom: 16,
            }, { duration: 500 });
        }
    };

    const handleMarkStopComplete = async (stop) => {
        try {
            const updatedStops = await markStopCompleted(tripId, stop.id);
            setCompletedStopIds(updatedStops);
            // Trigger marker re-render to show completion checkmark
            setTracksViewChanges(true);
            setShowStopConfirmModal(false);
            setPendingStopCompletion(null);

            // Sync completed stops to background task for notification dedup
            await updateTripStops(tripId, updatedStops);

            // Check if all stops are completed
            if (areAllStopsCompleted(stops, updatedStops)) {
                // Show reminder instead of auto-completing (in case driver forgot)
                setShowCompleteReminder(true);
            }
        } catch (err) {
            console.error('Error marking stop complete:', err);
        }
    };

    // Complete Trip Mutation
    const completeTripMutation = useMutation({
        mutationFn: async () => {
            const res = await api.post(`/schools/transport/trips/${tripId}/complete`);
            return res.data;
        },
        onSuccess: async () => {
            // Mark trip as ending BEFORE stopping tracking to prevent disclosure from re-showing
            isTripEndingRef.current = true;
            // Fire-and-forget: stop tracking in background (trip is already completed server-side)
            stopLocationTracking().catch(err => console.error('Error stopping tracking:', err));
            clearCompletedStops(tripId).catch(err => console.error('Error clearing stops:', err));

            // Force refetch home dashboard queries (MODERATE cache has refetchOnMount:false
            // so invalidateQueries alone won't trigger a re-fetch — must use refetchQueries)
            queryClient.refetchQueries({ queryKey: ['transport-trips-home'], exact: false });
            queryClient.refetchQueries({ queryKey: ['transport-staff-home'], exact: false });
            queryClient.invalidateQueries({ queryKey: ['trip-details'], exact: false });
            queryClient.invalidateQueries({ queryKey: ['transport-trips'], exact: false });

            if (trip?.startedAt) {
                const duration = Math.floor((Date.now() - new Date(trip.startedAt).getTime()) / 60000);
                setTripStats({ duration, stopsCompleted: completedStopIds.length });
            }
            setShowCompletionModal(true);
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || 'Failed to complete trip');
        },
    });

    const handleCompleteTrip = () => {
        Alert.alert(
            'End Trip',
            `Are you sure you want to end this trip?\n\n${completedStopIds.length}/${stops.length} stops completed`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'End Trip', style: 'destructive', onPress: () => completeTripMutation.mutate() },
            ]
        );
    };

    const handleNavigate = (stop) => {
        if (stop?.latitude && stop?.longitude) {
            const url = Platform.select({
                ios: `maps://app?daddr=${stop.latitude},${stop.longitude}`,
                android: `google.navigation:q=${stop.latitude},${stop.longitude}`,
            });
            Linking.openURL(url).catch(() => {
                Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`);
            });
        }
    };

    const handleCall = (phoneNumber) => {
        if (phoneNumber) Linking.openURL(`tel:${phoneNumber}`);
    };

    // Build route coordinates (fallback if Google Directions not available)
    const routeCoordinates = stops
        .filter(s => s.latitude && s.longitude)
        .map(s => ({ latitude: s.latitude, longitude: s.longitude }));

    // Choose polyline: Google Directions (accurate road-following) or straight-line fallback
    const displayPolyline = routePolyline || routeCoordinates;

    // Fetch Google Directions route once when trip starts (cached per trip)
    useEffect(() => {
        if (stops.length >= 2 && trip?.status === 'IN_PROGRESS') {
            const stopsWithCoords = stops.filter(s => s.latitude && s.longitude);
            if (stopsWithCoords.length >= 2) {
                fetchRouteDirections(stopsWithCoords, `trip_${tripId}`)
                    .then(result => {
                        if (result?.polyline?.length) {
                            setRoutePolyline(result.polyline);
                            console.log(`[Route] Fetched ${result.polyline.length} points for trip polyline`);
                        }
                    })
                    .catch(err => console.warn('[Route] Directions fetch failed, using straight-line:', err.message));
            }
        }
        return () => {
            // Cleanup ETA state when component unmounts
            resetETAState();
        };
    }, [trip?.status, stops.length]);

    // Calculate ETA to next stop (cost-optimized, uses cached data when possible)
    useEffect(() => {
        if (!currentLocation || !nextStop?.latitude) {
            setNextStopETA(null);
            return;
        }
        calculateETA(currentLocation, nextStop)
            .then(eta => setNextStopETA(eta))
            .catch(() => setNextStopETA(null));
    }, [currentLocation?.latitude, currentLocation?.longitude, nextStop?.id]);

    // Auto-follow bus: animate map to bus position on every GPS update (if driver hasn't panned away)
    useEffect(() => {
        if (currentLocation?.latitude && currentLocation?.longitude && isFocusedOnBus) {
            const timer = setTimeout(() => {
                if (mapRef.current) {
                    mapRef.current.animateToRegion({
                        latitude: currentLocation.latitude,
                        longitude: currentLocation.longitude,
                        latitudeDelta: 0.008,
                        longitudeDelta: 0.008,
                    }, 400);
                }
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [currentLocation?.latitude, currentLocation?.longitude]);


    // Initial map region — always include delta values (MapView requires them)
    const initialRegion = {
        latitude: currentLocation?.latitude ?? (stops[0]?.latitude ? parseFloat(stops[0].latitude) : 20.5937),
        longitude: currentLocation?.longitude ?? (stops[0]?.longitude ? parseFloat(stops[0].longitude) : 78.9629),
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
    };

    // Loading State
    if (isLoading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#2563EB" />
                    <Text style={styles.loadingText}>Loading trip...</Text>
                </View>
            </View>
        );
    }

    if (!trip) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}><ArrowLeft size={24} color="#111" /></View>
                    </HapticTouchable>
                    <Text style={styles.headerTitle}>Active Trip</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.centerContent}>
                    <AlertCircle size={48} color="#EF4444" />
                    <Text style={styles.errorText}>Trip not found</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            {/* Header - Matching bus-tracking.js */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}><ArrowLeft size={24} color="#111" /></View>
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
                    <View style={styles.liveBadge}>
                        <View style={styles.liveDot} />
                        <Text style={styles.liveText}>LIVE</Text>
                    </View>
                )}
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
                <View style={styles.statItem}>
                    <Gauge size={18} color="#10B981" />
                    <Text style={[styles.statValue, { color: '#10B981' }]}>
                        {currentLocation?.speed ? Math.round(currentLocation.speed * 3.6) : 0}
                    </Text>
                    <Text style={styles.statLabel}>km/h</Text>
                </View>
                <View style={styles.statItem}>
                    <CheckCircle2 size={18} color="#64748B" />
                    <Text style={styles.statValue}>{completedStopIds.length}/{stops.length}</Text>
                    <Text style={styles.statLabel}>Stops</Text>
                </View>
                <View style={styles.statItem}>
                    <Clock size={18} color="#64748B" />
                    <Text style={styles.statValue}>{getElapsedTime()}</Text>
                    <Text style={styles.statLabel}>Elapsed</Text>
                </View>
                <View style={styles.statItem}>
                    <Users size={18} color="#64748B" />
                    <Text style={styles.statValue}>{trip?._count?.attendanceRecords || 0}</Text>
                    <Text style={styles.statLabel}>Students</Text>
                </View>
            </View>

            {/* Map View */}
            <View style={styles.mapContainer}>
                <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    googleRenderer={'LEGACY'}
                    style={styles.map}
                    initialRegion={initialRegion}
                    showsUserLocation={false}
                    showsMyLocationButton={false}
                    zoomEnabled={true}
                    zoomControlEnabled={true}
                    scrollEnabled={true}
                    pitchEnabled={false}
                    rotateEnabled={false}
                    minZoomLevel={5}
                    maxZoomLevel={20}
                >
                    {/* Route Polyline — Google Directions (road-following) or straight-line fallback */}
                    {displayPolyline.length > 1 && (
                        <Polyline coordinates={displayPolyline} strokeColor="#3B82F6" strokeWidth={4} />
                    )}

                    {/* Stop Markers — use native pinColor for guaranteed Android rendering */}
                    {stops.map((stop, index) => {
                        const isCompleted = completedStopIds.includes(stop.id);
                        const isNext = nextStop?.id === stop.id;
                        if (!stop.latitude || !stop.longitude) return null;
                        return (
                            <Marker
                                key={stop.id}
                                coordinate={{ latitude: parseFloat(stop.latitude), longitude: parseFloat(stop.longitude) }}
                                tracksViewChanges={false}
                                title={`${isCompleted ? '✅' : isNext ? '⭐' : '📍'} ${index + 1}. ${stop.name}`}
                                description={isCompleted ? 'Completed ✓' : isNext ? 'Next stop' : trip?.tripType === 'PICKUP' ? stop.pickupTime : stop.dropTime}
                                pinColor={isCompleted ? 'green' : isNext ? 'yellow' : 'blue'}
                                onPress={() => zoomToStop(stop)}
                            />
                        );
                    })}

                    {/* Bus Marker — inline View, same as bus-tracking.js for guaranteed Android LEGACY rendering */}
                    {currentLocation && (
                        <Marker
                            coordinate={{
                                latitude: currentLocation.latitude,
                                longitude: currentLocation.longitude,
                            }}
                            anchor={{ x: 0.5, y: 0.5 }}
                            tracksViewChanges={Platform.OS === 'android' ? true : tracksViewChanges}
                            title={`🚌 ${vehicle?.licensePlate || 'Bus'}`}
                            description={isTracking ? 'Tracking live' : 'Idle'}
                        >
                            <View style={{
                                width: 36, height: 36, borderRadius: 18,
                                backgroundColor: isTracking ? '#22C55E' : '#F59E0B',
                                alignItems: 'center', justifyContent: 'center',
                                borderWidth: 2, borderColor: '#fff',
                                elevation: 5,
                            }}>
                                <Text style={{ fontSize: 18, lineHeight: 22, textAlign: 'center', textAlignVertical: 'center' }}>🚌</Text>
                            </View>
                        </Marker>
                    )}
                </MapView>

                {/* Status Overlay */}
                <View style={styles.statusOverlay}>
                    <View style={[styles.statusBadge, isTracking ? styles.statusBadgeMoving : styles.statusBadgeIdle]}>
                        <View style={[styles.statusDot, isTracking ? styles.statusDotMoving : styles.statusDotIdle]} />
                        <Text style={[styles.statusText, isTracking ? styles.statusTextMoving : styles.statusTextIdle]}>
                            {isTracking ? 'Tracking' : 'Idle'}
                        </Text>
                    </View>
                    {nextStop && (
                        <View style={styles.nextStopBadge}>
                            <Target size={12} color="#10B981" />
                            <Text style={styles.nextStopText}>Next: {nextStop.name}</Text>
                            {nextStopETA && nextStopETA.etaMinutes >= 0 && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                    <Clock size={10} color="#64748B" />
                                    <Text style={styles.nextStopDistance}>
                                        ~{nextStopETA.etaMinutes}m
                                    </Text>
                                </View>
                            )}
                            {currentLocation && (
                                <Text style={styles.nextStopDistance}>
                                    {formatDistance(getDistanceMeters(currentLocation.latitude, currentLocation.longitude, nextStop.latitude, nextStop.longitude))}
                                </Text>
                            )}
                        </View>
                    )}
                </View>

                {/* Focus on Bus Button - shows when not focused on bus */}
                {!isFocusedOnBus && currentLocation && (
                    <HapticTouchable onPress={focusOnBus} style={styles.focusOnBusBtn}>
                        <Bus size={18} color="#fff" />
                        <Text style={styles.focusOnBusBtnText}>Focus on Bus</Text>
                    </HapticTouchable>
                )}
            </View>

            {/* Details ScrollView */}
            <ScrollView
                style={styles.detailsContainer}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />}
            >
                {/* End Trip Button - Premium Design */}
                <View style={styles.endTripContainer}>
                    <HapticTouchable onPress={handleCompleteTrip} disabled={completeTripMutation.isPending}>
                        <View style={styles.endTripButton}>
                            {completeTripMutation.isPending ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <View style={styles.endTripIcon}>
                                    <Square size={18} color="#fff" fill="#fff" />
                                </View>
                            )}
                            <View style={styles.endTripTextContainer}>
                                <Text style={styles.endTripText}>{completeTripMutation.isPending ? 'Ending Trip...' : 'End Trip'}</Text>
                                <Text style={styles.endTripSubtext}>{completedStopIds.length}/{stops.length} stops completed</Text>
                            </View>
                        </View>
                    </HapticTouchable>
                </View>

                {/* Route Timeline Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <MapPin size={16} color="#64748B" />
                        <Text style={styles.cardTitle}>Route Timeline</Text>
                    </View>
                    {stops.map((stop, index) => {
                        const isCompleted = completedStopIds.includes(stop.id);
                        const isNext = nextStop?.id === stop.id;
                        const distance = currentLocation
                            ? getDistanceMeters(currentLocation.latitude, currentLocation.longitude, stop.latitude, stop.longitude)
                            : null;

                        return (
                            <HapticTouchable key={stop.id} onPress={() => zoomToStop(stop)} style={styles.stopItem}>
                                <View style={[styles.stopNumber,
                                isCompleted ? { backgroundColor: '#10B981' } :
                                    isNext ? { backgroundColor: '#F59E0B' } :
                                        { backgroundColor: '#3B82F6' }
                                ]}>
                                    {isCompleted ? <Check size={12} color="#fff" /> : <Text style={styles.stopNumberText}>{index + 1}</Text>}
                                </View>
                                <View style={styles.stopContent}>
                                    <View style={styles.stopHeader}>
                                        <Text style={[styles.stopName, isCompleted && styles.stopNameCompleted]}>{stop.name}</Text>
                                        {isCompleted && <View style={styles.doneBadge}><Text style={styles.doneBadgeText}>Done</Text></View>}
                                    </View>
                                    <View style={styles.stopMeta}>
                                        <Clock size={12} color="#64748B" />
                                        <Text style={styles.stopTime}>{trip?.tripType === 'PICKUP' ? stop.pickupTime : stop.dropTime}</Text>
                                        {distance && !isCompleted && (
                                            <>
                                                <MapPin size={12} color="#64748B" style={{ marginLeft: 8 }} />
                                                <Text style={styles.stopDistance}>{formatDistance(distance)}</Text>
                                            </>
                                        )}
                                    </View>
                                    {!isCompleted && (
                                        <View style={styles.stopActions}>
                                            <HapticTouchable style={styles.markCompleteBtn} onPress={() => handleMarkStopComplete(stop)}>
                                                <Check size={14} color="#10B981" />
                                                <Text style={styles.markCompleteBtnText}>Mark Complete</Text>
                                            </HapticTouchable>
                                            <HapticTouchable style={styles.navBtn} onPress={() => handleNavigate(stop)}>
                                                <Navigation size={14} color="#3B82F6" />
                                            </HapticTouchable>
                                        </View>
                                    )}
                                </View>
                            </HapticTouchable>
                        );
                    })}
                </View>

                {/* Crew Card */}
                {(driver || conductor) && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <User size={16} color="#64748B" />
                            <Text style={styles.cardTitle}>Crew</Text>
                        </View>
                        {driver && (
                            <View style={styles.driverRow}>
                                <View style={styles.driverAvatar}>
                                    <Text style={styles.driverInitials}>{driver.name?.charAt(0) || 'D'}</Text>
                                </View>
                                <View style={styles.driverInfo}>
                                    <Text style={styles.driverName}>{driver.name}</Text>
                                    <Text style={styles.driverRole}>Driver</Text>
                                </View>
                                {driver.contactNumber && currentUser?.userId !== driver.userId && (
                                    <HapticTouchable onPress={() => handleCall(driver.contactNumber)}>
                                        <View style={styles.callButton}><Phone size={18} color="#fff" /></View>
                                    </HapticTouchable>
                                )}
                            </View>
                        )}
                        {conductor && (
                            <View style={[styles.driverRow, { marginTop: 12 }]}>
                                <View style={[styles.driverAvatar, { backgroundColor: '#F3E8FF' }]}>
                                    <Text style={[styles.driverInitials, { color: '#9333EA' }]}>{conductor.name?.charAt(0) || 'C'}</Text>
                                </View>
                                <View style={styles.driverInfo}>
                                    <Text style={styles.driverName}>{conductor.name}</Text>
                                    <Text style={styles.driverRole}>Conductor</Text>
                                </View>
                                {conductor.contactNumber && currentUser?.userId !== conductor.userId && (
                                    <HapticTouchable onPress={() => handleCall(conductor.contactNumber)}>
                                        <View style={styles.callButton}><Phone size={18} color="#fff" /></View>
                                    </HapticTouchable>
                                )}
                            </View>
                        )}
                    </View>
                )}

                {/* Vehicle Card */}
                {vehicle && (
                    <View style={styles.card}>
                        <View style={styles.cardHeader}>
                            <Bus size={16} color="#64748B" />
                            <Text style={styles.cardTitle}>Vehicle Info</Text>
                        </View>
                        <View style={styles.vehicleGrid}>
                            <View style={styles.vehicleItem}>
                                <Text style={styles.vehicleLabel}>License</Text>
                                <Text style={styles.vehicleValue}>{vehicle.licensePlate}</Text>
                            </View>
                            <View style={styles.vehicleItem}>
                                <Text style={styles.vehicleLabel}>Model</Text>
                                <Text style={styles.vehicleValue}>{vehicle.model || 'N/A'}</Text>
                            </View>
                            <View style={styles.vehicleItem}>
                                <Text style={styles.vehicleLabel}>Capacity</Text>
                                <Text style={styles.vehicleValue}>{vehicle.capacity || 'N/A'} seats</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Tips Card */}
                <View style={styles.tipsCard}>
                    <Text style={styles.tipsTitle}>💡 Trip Tips</Text>
                    <Text style={styles.tipsText}>• Location updates automatically every 10 seconds</Text>
                    <Text style={styles.tipsText}>• Tap navigate buttons to open maps</Text>
                    <Text style={styles.tipsText}>• End trip when all students have been dropped</Text>
                </View>
            </ScrollView>

            {/* Stop Confirmation Modal */}
            <Modal visible={showStopConfirmModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.stopConfirmModal}>
                        <View style={styles.stopConfirmHeader}>
                            <Target size={24} color="#10B981" />
                            <Text style={styles.stopConfirmTitle}>You've arrived!</Text>
                        </View>
                        <Text style={styles.stopConfirmText}>
                            You're at <Text style={{ fontWeight: '700' }}>{pendingStopCompletion?.name}</Text>
                        </Text>
                        <View style={styles.stopConfirmButtons}>
                            <HapticTouchable style={styles.stopConfirmNo} onPress={() => { setShowStopConfirmModal(false); setPendingStopCompletion(null); }}>
                                <X size={18} color="#64748B" />
                                <Text style={styles.stopConfirmNoText}>Not Yet</Text>
                            </HapticTouchable>
                            <HapticTouchable style={styles.stopConfirmYes} onPress={() => pendingStopCompletion && handleMarkStopComplete(pendingStopCompletion)}>
                                <Check size={18} color="#fff" />
                                <Text style={styles.stopConfirmYesText}>Complete</Text>
                            </HapticTouchable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Trip Completion Modal */}
            <Modal visible={showCompletionModal} transparent animationType="fade">
                <View style={styles.modalOverlay}>
                    <Animated.View entering={ZoomIn.duration(400)} style={styles.completionModal}>
                        <CheckCircle2 size={64} color="#10B981" />
                        <Text style={styles.completionTitle}>Trip Completed! 🎉</Text>
                        <Text style={styles.completionSubtitle}>Great job driving safely</Text>
                        <View style={styles.completionStats}>
                            <View style={styles.completionStatItem}>
                                <Text style={styles.completionStatValue}>{tripStats.duration}m</Text>
                                <Text style={styles.completionStatLabel}>Duration</Text>
                            </View>
                            <View style={styles.completionStatDivider} />
                            <View style={styles.completionStatItem}>
                                <Text style={styles.completionStatValue}>{tripStats.stopsCompleted}</Text>
                                <Text style={styles.completionStatLabel}>Stops</Text>
                            </View>
                        </View>
                        <HapticTouchable style={styles.completionButton} onPress={() => { setShowCompletionModal(false); router.back(); }}>
                            <Text style={styles.completionButtonText}>Done</Text>
                        </HapticTouchable>
                    </Animated.View>
                </View>
            </Modal>

            {/* All Stops Complete Reminder Modal */}
            <Modal visible={showCompleteReminder} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.reminderModal}>
                        <View style={styles.reminderIcon}>
                            <CheckCircle2 size={32} color="#10B981" />
                        </View>
                        <Text style={styles.reminderTitle}>All Stops Completed! ✅</Text>
                        <Text style={styles.reminderText}>
                            You've completed all {stops.length} stops. Would you like to end the trip now?
                        </Text>
                        <View style={styles.reminderButtons}>
                            <HapticTouchable
                                style={styles.reminderBtnSecondary}
                                onPress={() => setShowCompleteReminder(false)}
                            >
                                <Text style={styles.reminderBtnSecondaryText}>Continue Trip</Text>
                            </HapticTouchable>
                            <HapticTouchable
                                style={styles.reminderBtnPrimary}
                                onPress={() => { setShowCompleteReminder(false); completeTripMutation.mutate(); }}
                            >
                                <Square size={16} color="#fff" />
                                <Text style={styles.reminderBtnPrimaryText}>End Trip</Text>
                            </HapticTouchable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Location Disclosure Modal for Google Play Compliance */}
            <LocationDisclosureModal
                visible={showLocationDisclosure}
                onAccept={handleAcceptDisclosure}
                onDecline={() => setShowLocationDisclosure(false)}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },

    // Header - matching bus-tracking.js
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: 16,
        paddingHorizontal: 20,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    backButton: { padding: 8, borderRadius: 20, backgroundColor: '#F1F5F9' },
    headerCenter: { flex: 1, marginLeft: 12 },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
    headerMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
    headerSubtitle: { fontSize: 12, color: '#64748B' },
    tripTypeBadge: { marginLeft: 8, backgroundColor: '#10B981', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    tripTypeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
    liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A', marginRight: 6 },
    liveText: { color: '#16A34A', fontSize: 11, fontWeight: '700' },

    // Stats Row
    statsRow: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    statItem: { alignItems: 'center' },
    statValue: { fontSize: 20, fontWeight: '800', color: '#0F172A', marginTop: 4 },
    statLabel: { fontSize: 11, color: '#64748B' },

    // Map
    mapContainer: { height: height * 0.35, width: '100%', position: 'relative', marginBottom: 20, },
    map: { ...StyleSheet.absoluteFillObject },
    statusOverlay: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    statusBadgeMoving: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#DCFCE7' },
    statusBadgeIdle: { backgroundColor: '#FEFCE8', borderWidth: 1, borderColor: '#FEF9C3' },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
    statusDotMoving: { backgroundColor: '#16A34A' },
    statusDotIdle: { backgroundColor: '#CA8A04' },
    statusText: { fontSize: 12, fontWeight: '600' },
    statusTextMoving: { color: '#16A34A' },
    statusTextIdle: { color: '#CA8A04' },
    nextStopBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    nextStopText: { fontSize: 12, fontWeight: '600', color: '#1E293B' },
    nextStopDistance: { fontSize: 12, fontWeight: '700', color: '#10B981' },

    // Details Container
    detailsContainer: { flex: 1, backgroundColor: '#F8FAFC', borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -20, paddingTop: 20, paddingHorizontal: 16 },

    // End Trip Button - Premium
    endTripContainer: { marginBottom: 16 },
    endTripButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#DC2626',
        paddingVertical: 18,
        paddingHorizontal: 20,
        borderRadius: 20,
        shadowColor: '#DC2626',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 8,
    },
    endTripIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    endTripTextContainer: { flex: 1, marginLeft: 14 },
    endTripText: { color: '#fff', fontSize: 18, fontWeight: '800' },
    endTripSubtext: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },

    // Cards
    card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 16, marginBottom: 16 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    cardTitle: { fontSize: 14, fontWeight: '600', color: '#475569', marginLeft: 8 },

    // Stops
    stopItem: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
    stopNumber: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    stopNumberText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
    stopContent: { flex: 1 },
    stopHeader: { flexDirection: 'row', alignItems: 'center' },
    stopName: { fontSize: 14, fontWeight: '600', color: '#1E293B', flex: 1 },
    stopNameCompleted: { color: '#64748B', textDecorationLine: 'line-through' },
    doneBadge: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    doneBadgeText: { color: '#16A34A', fontSize: 10, fontWeight: '700' },
    stopMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    stopTime: { marginLeft: 4, fontSize: 12, color: '#64748B' },
    stopDistance: { marginLeft: 4, fontSize: 12, color: '#10B981', fontWeight: '600' },
    stopActions: { flexDirection: 'row', marginTop: 10, gap: 8 },
    markCompleteBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, gap: 6 },
    markCompleteBtnText: { color: '#16A34A', fontSize: 12, fontWeight: '600' },
    navBtn: { width: 36, height: 36, borderRadius: 8, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },

    // Crew
    driverRow: { flexDirection: 'row', alignItems: 'center' },
    driverAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    driverInitials: { fontSize: 16, fontWeight: '700', color: '#2563EB' },
    driverInfo: { flex: 1 },
    driverName: { fontSize: 16, fontWeight: '600', color: '#0F172A' },
    driverRole: { fontSize: 12, color: '#64748B', marginTop: 2 },
    callButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' },

    // Vehicle
    vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    vehicleItem: { width: '50%', paddingVertical: 8 },
    vehicleLabel: { fontSize: 11, color: '#64748B', marginBottom: 2 },
    vehicleValue: { fontSize: 14, fontWeight: '600', color: '#0F172A' },

    // Tips
    tipsCard: { backgroundColor: '#EFF6FF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#DBEAFE' },
    tipsTitle: { fontSize: 14, fontWeight: '700', color: '#1E40AF', marginBottom: 8 },
    tipsText: { fontSize: 12, color: '#3B82F6', lineHeight: 20 },

    // Loading/Error
    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { marginTop: 12, color: '#64748B' },
    centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    errorText: { fontSize: 16, color: '#EF4444', marginTop: 12 },

    // Modals
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
    stopConfirmModal: { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, alignItems: 'center' },
    stopConfirmHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    stopConfirmTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginLeft: 8 },
    stopConfirmText: { fontSize: 15, color: '#475569', textAlign: 'center' },
    stopConfirmButtons: { flexDirection: 'row', marginTop: 20, gap: 12 },
    stopConfirmNo: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', gap: 6 },
    stopConfirmNoText: { color: '#64748B', fontWeight: '600' },
    stopConfirmYes: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, backgroundColor: '#10B981', gap: 6 },
    stopConfirmYesText: { color: '#fff', fontWeight: '600' },

    completionModal: { backgroundColor: '#fff', borderRadius: 28, padding: 32, width: '100%', maxWidth: 320, alignItems: 'center' },
    completionTitle: { fontSize: 24, fontWeight: '800', color: '#1E293B', marginTop: 16 },
    completionSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
    completionStats: { flexDirection: 'row', marginTop: 24, backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16 },
    completionStatItem: { flex: 1, alignItems: 'center' },
    completionStatValue: { fontSize: 28, fontWeight: '800', color: '#10B981' },
    completionStatLabel: { fontSize: 12, color: '#64748B', marginTop: 2 },
    completionStatDivider: { width: 1, backgroundColor: '#E2E8F0' },
    completionButton: { marginTop: 24, backgroundColor: '#10B981', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 14 },
    completionButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    // Focus on Bus Button
    focusOnBusBtn: {
        position: 'absolute',
        bottom: 40, // Higher up to avoid being covered by details overlay
        right: 16,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#2563EB',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 24,
        gap: 6,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
    },
    focusOnBusBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // Reminder Modal
    reminderModal: { backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, alignItems: 'center' },
    reminderIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    reminderTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B' },
    reminderText: { fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 8, lineHeight: 20 },
    reminderButtons: { flexDirection: 'row', marginTop: 24, gap: 12 },
    reminderBtnSecondary: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F1F5F9' },
    reminderBtnSecondaryText: { color: '#64748B', fontSize: 14, fontWeight: '600' },
    reminderBtnPrimary: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: '#DC2626', gap: 6 },
    reminderBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
