// Bus Tracking Screen for Parents - Modern UI, same logic
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
import Animated, { FadeInDown, FadeInRight, FadeIn } from 'react-native-reanimated';
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
    ZoomIn,
    ZoomOut,
    Locate,
    ChevronRight,
    Radio,
    Gauge,
    Route,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

const { height, width } = Dimensions.get('window');

// Clean map style — minimal, roads only
const CLEAN_MAP_STYLE = [
    { featureType: "all", elementType: "labels.text", stylers: [{ visibility: "off" }] },
    { featureType: 'transit', elementType: 'all', stylers: [{ visibility: 'off' }] },
    { featureType: 'road', elementType: 'labels', stylers: [{ visibility: 'on' }] },
    { featureType: 'administrative', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', elementType: 'labels', stylers: [{ visibility: 'on' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#e0e0e0' }] },
    { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#d0d0d0' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ebebeb' }] },
    { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#f4f4f4' }] },
    { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#f8f8f8' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#dbeafe' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#e8f5e9' }] },
];

// Bus marker
const BusMarkerView = memo(({ status, isStale, licensePlate }) => {
    const bgColor = isStale ? '#F97316' :
        status === 'MOVING' ? '#22C55E' :
            status === 'IDLE' ? '#F59E0B' : '#EF4444';

    return (
        <View style={{ width: 120, height: 85, alignItems: 'center', justifyContent: 'flex-end' }}>
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
            <View style={{
                width: 42, height: 42, borderRadius: 21,
                backgroundColor: bgColor,
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 3, borderColor: '#fff',
                elevation: 8,
            }}>
                <Text style={{ fontSize: 20 }}>🚌</Text>
            </View>
            <View style={{
                width: 0, height: 0,
                borderLeftWidth: 7, borderRightWidth: 7, borderTopWidth: 8,
                borderLeftColor: 'transparent', borderRightColor: 'transparent',
                borderTopColor: '#fff', marginTop: -2,
            }} />
            <View style={{
                width: 14, height: 5, borderRadius: 7,
                backgroundColor: 'rgba(0,0,0,0.15)',
                marginTop: 1,
            }} />
        </View>
    );
});

// ── Section card wrapper ──────────────────────────────────────────────────────
const Card = ({ children, style }) => (
    <View style={[styles.card, style]}>{children}</View>
);

// ── Info row inside card ──────────────────────────────────────────────────────
const InfoRow = ({ icon: Icon, iconColor = '#64748B', label, value, valueStyle }) => (
    <View style={styles.infoRow}>
        <View style={[styles.infoIconBox, { backgroundColor: iconColor + '15' }]}>
            <Icon size={15} color={iconColor} />
        </View>
        <View style={styles.infoRowText}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={[styles.infoValue, valueStyle]}>{value}</Text>
        </View>
    </View>
);

export default function BusTrackingScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();
    const [refreshing, setRefreshing] = useState(false);
    const mapRef = useRef(null);
    const markerRef = useRef(null);
    const [routePolyline, setRoutePolyline] = useState(null);
    const [googleETA, setGoogleETA] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(0.015);
    const [schoolLocation, setSchoolLocation] = useState(null);
    const [tracksViewChanges, setTracksViewChanges] = useState(true);

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

    const { data: assignmentData, isLoading: assignmentLoading } = useQuery({
        queryKey: ['child-transport', schoolId, childData?.studentId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/student-assignments?schoolId=${schoolId}&studentId=${childData?.studentId}`);
            return res.data;
        },
        enabled: !!schoolId && !!childData?.studentId,
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
    });

    const assignment = assignmentData?.assignments?.[0];
    const vehicleId = assignment?.vehicle?.id || assignment?.route?.vehicle?.id;

    useEffect(() => {
        if (schoolId) {
            getSchoolLocation(schoolId, API_BASE_URL)
                .then(loc => {
                    if (loc?.latitude && loc?.longitude) setSchoolLocation(loc);
                })
                .catch(() => { });
        }
    }, [schoolId]);

    useEffect(() => {
        const t = setTimeout(() => setTracksViewChanges(false), 500);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        setTracksViewChanges(true);
        const t = setTimeout(() => setTracksViewChanges(false), 300);
        return () => clearTimeout(t);
    }, [status]);

    const { data: locationData, isLoading: locationLoading, refetch } = useQuery({
        queryKey: ['bus-location-meta', vehicleId],
        queryFn: async () => {
            if (!vehicleId) return null;
            const res = await api.get(`/schools/transport/location/${vehicleId}?history=false`);
            return res.data;
        },
        enabled: !!vehicleId && vehicleId !== 'undefined',
        staleTime: 1000 * 60 * 5,
    });

    const {
        location: realtimeLocation,
        isConnected: isRealtimeConnected,
        secondsAgo: realtimeSecondsAgo,
    } = useRealtimeLocation(vehicleId, { enabled: !!vehicleId && vehicleId !== 'undefined' });

    const vehicle = locationData?.vehicle || assignment?.vehicle || assignment?.route?.vehicle;
    const location = realtimeLocation || locationData?.currentLocation;
    const activeTrip = locationData?.activeTrip;
    const status = isRealtimeConnected && realtimeLocation ? 'LIVE' : (locationData?.status || 'OFFLINE');
    const secondsAgo = realtimeSecondsAgo ?? locationData?.secondsAgo;
    const stops = activeTrip?.route?.busStops || [];

    const driver = locationData?.driver || activeTrip?.driver || assignment?.route?.vehicle?.routeAssignments?.[0]?.driver;
    const conductor = locationData?.conductor || activeTrip?.conductor || assignment?.route?.vehicle?.routeAssignments?.[0]?.conductor;

    const isStale = secondsAgo > 60 && status === 'MOVING';
    const busIsActive = status === 'MOVING' || status === 'IDLE';

    const getDistanceKm = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const childStop = assignment?.stop;
    const distanceToStop = (location?.latitude && childStop?.latitude)
        ? getDistanceKm(location.latitude, location.longitude, childStop.latitude, childStop.longitude)
        : null;

    const realtimeSpeed = location?.speed;
    const speedKmh = realtimeSpeed && realtimeSpeed > 0.5 ? realtimeSpeed * 3.6 : 25;
    const roadDistance = distanceToStop ? distanceToStop * 1.3 : null;
    const inlineEtaMinutes = (roadDistance && speedKmh > 0)
        ? Math.round((roadDistance / speedKmh) * 60)
        : null;
    const etaMinutes = googleETA?.etaMinutes ?? inlineEtaMinutes;
    const arrivalTime = etaMinutes
        ? new Date(Date.now() + etaMinutes * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : null;

    useEffect(() => {
        if (!mapRef.current) return;
        if (busIsActive && location?.latitude && childStop?.latitude) {
            const coords = [
                { latitude: location.latitude, longitude: location.longitude },
                { latitude: childStop.latitude, longitude: childStop.longitude },
            ];
            if (schoolLocation?.latitude) coords.push({ latitude: schoolLocation.latitude, longitude: schoolLocation.longitude });
            setTimeout(() => {
                mapRef.current?.fitToCoordinates(coords, {
                    edgePadding: { top: 80, right: 60, bottom: 60, left: 60 },
                    animated: true,
                });
            }, 500);
        } else if (childStop?.latitude) {
            const coords = [{ latitude: childStop.latitude, longitude: childStop.longitude }];
            if (schoolLocation?.latitude) coords.push({ latitude: schoolLocation.latitude, longitude: schoolLocation.longitude });
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
        if (phoneNumber) Linking.openURL(`tel:${phoneNumber}`);
    };

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

    const formatTimeAgo = (seconds, busStatus) => {
        if (!seconds && seconds !== 0) return busStatus === 'OFFLINE' ? 'No data' : 'N/A';
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    };

    useEffect(() => {
        if (!busIsActive || !location?.latitude || !childStop?.latitude) {
            setRoutePolyline(null);
            return;
        }
        const origin = { latitude: location.latitude, longitude: location.longitude };
        const destination = { latitude: childStop.latitude, longitude: childStop.longitude };
        const cacheKey = `route_${Math.round(origin.latitude * 100)}_${Math.round(origin.longitude * 100)}_${Math.round(destination.latitude * 100)}`;
        fetchRouteDirections([origin, destination], cacheKey)
            .then(result => { if (result?.polyline?.length) setRoutePolyline(result.polyline); })
            .catch(() => { });
        return () => resetETAState();
    }, [busIsActive, location?.latitude, location?.longitude, childStop?.latitude]);

    useEffect(() => {
        if (!location?.latitude || !childStop?.latitude) { setGoogleETA(null); return; }
        calculateETA(
            { latitude: location.latitude, longitude: location.longitude, speed: location.speed },
            childStop
        ).then(eta => setGoogleETA(eta)).catch(() => setGoogleETA(null));
    }, [location?.latitude, location?.longitude, childStop?.id]);

    // Status config
    const getStatusCfg = () => {
        if (isStale) return { label: 'Delayed', color: '#F97316', bg: '#FFF7ED', border: '#FED7AA', dot: '#F97316' };
        if (status === 'MOVING') return { label: 'Moving', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', dot: '#16A34A' };
        if (status === 'IDLE') return { label: 'Idle', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dot: '#D97706' };
        return { label: 'Offline', color: '#DC2626', bg: '#FFF1F2', border: '#FECDD3', dot: '#DC2626' };
    };
    const statusCfg = getStatusCfg();

    if (!childData) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="dark" />
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}><ArrowLeft size={22} color="#111" /></View>
                    </HapticTouchable>
                    <Text style={styles.headerTitle}>Bus Tracking</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.centerContent}>
                    <AlertCircle size={48} color="#EF4444" />
                    <Text style={styles.emptyTitle}>No student selected</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar style="dark" />

            {/* ── Header ─────────────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}><ArrowLeft size={22} color="#0D1117" /></View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>{childData.name}'s Bus</Text>
                    {vehicle && <Text style={styles.headerSubtitle}>{vehicle.licensePlate}</Text>}
                </View>
                <HapticTouchable onPress={onRefresh} disabled={refreshing}>
                    <View style={[styles.refreshButton, refreshing && { backgroundColor: '#DBEAFE' }]}>
                        {refreshing
                            ? <ActivityIndicator size="small" color="#0469ff" />
                            : <RefreshCw size={18} color="#0469ff" />}
                    </View>
                </HapticTouchable>
            </Animated.View>

            {isLoading && !locationData ? (
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#0469ff" />
                    <Text style={styles.loadingText}>Locating bus…</Text>
                </View>
            ) : !assignment && !isLoading ? (
                <View style={styles.centerContent}>
                    <View style={styles.emptyIconWrap}>
                        <Bus size={40} color="#CBD5E1" />
                    </View>
                    <Text style={styles.emptyTitle}>No Bus Assigned</Text>
                    <Text style={styles.emptyText}>{childData.name} doesn't have an assigned bus route yet.</Text>
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
                >
                    {/* ── Map ──────────────────────────────────────────────── */}
                    <View style={styles.mapWrapper}>
                        {!location ? (
                            <View style={styles.mapPlaceholder}>
                                <View style={styles.mapPlaceholderInner}>
                                    <MapPin size={30} color="#94A3B8" />
                                    <Text style={styles.mapPlaceholderTitle}>Awaiting location…</Text>
                                    <Text style={styles.mapPlaceholderSub}>Bus hasn't sent data yet</Text>
                                </View>
                            </View>
                        ) : (
                            <MapView
                                ref={mapRef}
                                provider={PROVIDER_GOOGLE}
                                googleRenderer={'LEGACY'}
                                style={StyleSheet.absoluteFill}
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
                                {busIsActive && (
                                    <Marker
                                        ref={markerRef}
                                        coordinate={{ latitude: location.latitude, longitude: location.longitude }}
                                        anchor={{ x: 0.5, y: 0.5 }}
                                        tracksViewChanges={tracksViewChanges}
                                        title={`🚌 ${vehicle?.licensePlate || 'Bus'}`}
                                        description={status === 'MOVING' ? 'On the way' : 'Idle'}
                                    >
                                        <View style={{
                                            width: 36, height: 36, borderRadius: 18,
                                            backgroundColor: isStale ? '#F97316' : status === 'MOVING' ? '#22C55E' : '#F59E0B',
                                            alignItems: 'center', justifyContent: 'center',
                                            borderWidth: 2.5, borderColor: '#fff', elevation: 6,
                                        }}>
                                            <Text style={{ fontSize: 18, lineHeight: 22, textAlign: 'center', textAlignVertical: 'center' }}>🚌</Text>
                                        </View>
                                    </Marker>
                                )}

                                {childStop?.latitude && childStop?.longitude && (
                                    <Marker
                                        coordinate={{ latitude: childStop.latitude, longitude: childStop.longitude }}
                                        tracksViewChanges={false}
                                        pinColor="blue"
                                        title={`🏠 ${childStop.name || 'Stop'}`}
                                        description="Child's bus stop"
                                    />
                                )}

                                {busIsActive && routePolyline?.length > 1 && (
                                    <Polyline coordinates={routePolyline} strokeColor="rgba(4,105,255,0.15)" strokeWidth={14} />
                                )}
                                {busIsActive && routePolyline?.length > 1 && (
                                    <Polyline coordinates={routePolyline} strokeColor="#0469ff" strokeWidth={4} />
                                )}
                                {busIsActive && !routePolyline && childStop?.latitude && (
                                    <Polyline
                                        coordinates={[
                                            { latitude: location.latitude, longitude: location.longitude },
                                            { latitude: childStop.latitude, longitude: childStop.longitude },
                                        ]}
                                        strokeColor="#0469ff" strokeWidth={4}
                                    />
                                )}
                                {!busIsActive && childStop?.latitude && schoolLocation?.latitude && (
                                    <Polyline
                                        coordinates={[
                                            { latitude: schoolLocation.latitude, longitude: schoolLocation.longitude },
                                            { latitude: childStop.latitude, longitude: childStop.longitude },
                                        ]}
                                        strokeColor="#94A3B8" strokeWidth={3} lineDashPattern={[12, 6]}
                                    />
                                )}

                                {schoolLocation?.latitude && schoolLocation?.longitude && (
                                    <Marker
                                        coordinate={{ latitude: Number(schoolLocation.latitude), longitude: Number(schoolLocation.longitude) }}
                                        tracksViewChanges={false}
                                        pinColor="black"
                                        title={`🏫 ${userData?.school?.name || 'School'}`}
                                        description="School location"
                                    />
                                )}
                            </MapView>
                        )}

                        {/* Status pill — top left */}
                        <View style={styles.mapTopRow}>
                            <View style={[styles.statusPill, { backgroundColor: statusCfg.bg, borderColor: statusCfg.border }]}>
                                <View style={[styles.statusDot, { backgroundColor: statusCfg.dot }]} />
                                <Text style={[styles.statusPillText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                            </View>
                            <View style={styles.timePill}>
                                <Clock size={11} color="#64748B" />
                                <Text style={styles.timePillText}>{formatTimeAgo(secondsAgo, status)}</Text>
                            </View>
                        </View>

                        {/* Map controls — bottom right */}
                        <View style={styles.mapControls}>
                            <HapticTouchable onPress={handleZoomIn}>
                                <View style={styles.mapCtrlBtn}><ZoomIn size={17} color="#334155" /></View>
                            </HapticTouchable>
                            <HapticTouchable onPress={handleZoomOut}>
                                <View style={styles.mapCtrlBtn}><ZoomOut size={17} color="#334155" /></View>
                            </HapticTouchable>
                            {location && (
                                <HapticTouchable onPress={focusOnBus}>
                                    <View style={[styles.mapCtrlBtn, { backgroundColor: '#EEF4FF', borderColor: '#BFDBFE' }]}>
                                        <Locate size={17} color="#0469ff" />
                                    </View>
                                </HapticTouchable>
                            )}
                        </View>
                    </View>

                    {/* ── ETA Banner ─────────────────────────────────────────── */}
                    {status === 'MOVING' && (googleETA || etaMinutes !== null) && (
                        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
                            <LinearGradient
                                colors={['#0469ff', '#0347c4']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.etaBanner}
                            >
                                <View style={styles.etaBannerDeco} />
                                <View style={styles.etaRow}>
                                    <View style={styles.etaCell}>
                                        <Text style={styles.etaCellVal}>
                                            {googleETA ? `${(googleETA.distance / 1000).toFixed(1)}` : distanceToStop?.toFixed(1)}
                                            <Text style={styles.etaCellUnit}> km</Text>
                                        </Text>
                                        <Text style={styles.etaCellLabel}>Distance</Text>
                                    </View>
                                    <View style={styles.etaSep} />
                                    <View style={styles.etaCell}>
                                        <Text style={styles.etaCellVal}>
                                            {googleETA ? googleETA.etaMinutes : etaMinutes}
                                            <Text style={styles.etaCellUnit}> min</Text>
                                        </Text>
                                        <Text style={styles.etaCellLabel}>ETA</Text>
                                    </View>
                                    <View style={styles.etaSep} />
                                    <View style={styles.etaCell}>
                                        <Text style={styles.etaCellVal}>{arrivalTime}</Text>
                                        <Text style={styles.etaCellLabel}>Arrives at</Text>
                                    </View>
                                </View>
                                <View style={styles.etaFooter}>
                                    <MapPin size={11} color="rgba(255,255,255,0.7)" />
                                    <Text style={styles.etaFooterText}>
                                        To: {childStop?.name || 'Your Stop'}
                                    </Text>
                                    {googleETA?.source && (
                                        <View style={styles.etaSourceBadge}>
                                            <Text style={styles.etaSourceText}>
                                                {googleETA.source === 'google' ? '🚦 Traffic' : googleETA.source === 'speed' ? '📡 GPS' : '📏 Est.'}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </LinearGradient>
                        </Animated.View>
                    )}

                    {/* ── Cards ─────────────────────────────────────────────── */}
                    <View style={styles.cardsArea}>

                        {/* Driver */}
                        {driver ? (
                            <Animated.View entering={FadeInDown.delay(140).duration(400)}>
                                <Card>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.cardHeaderLeft}>
                                            <View style={[styles.cardIconBg, { backgroundColor: '#EEF4FF' }]}>
                                                <User size={15} color="#0469ff" />
                                            </View>
                                            <Text style={styles.cardTitle}>Driver</Text>
                                        </View>
                                        {!activeTrip && (
                                            <View style={styles.assignedBadge}>
                                                <Text style={styles.assignedBadgeText}>Assigned</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.personRow}>
                                        <View style={styles.personAvatar}>
                                            {driver.profilePicture && driver.profilePicture !== 'default.png' ? (
                                                <Image source={{ uri: driver.profilePicture }} style={styles.personAvatarImg} />
                                            ) : (
                                                <Text style={styles.personInitial}>{driver.name?.charAt(0) || 'D'}</Text>
                                            )}
                                        </View>
                                        <View style={styles.personInfo}>
                                            <Text style={styles.personName}>{driver.name}</Text>
                                            <Text style={styles.personSub}>Lic: {driver.licenseNumber || 'N/A'}</Text>
                                        </View>
                                        {driver.contactNumber && (
                                            <HapticTouchable onPress={() => handleCall(driver.contactNumber)}>
                                                <LinearGradient colors={['#0469ff', '#0347c4']} style={styles.callBtn}>
                                                    <Phone size={18} color="#fff" />
                                                </LinearGradient>
                                            </HapticTouchable>
                                        )}
                                    </View>
                                </Card>
                            </Animated.View>
                        ) : (
                            <Animated.View entering={FadeInDown.delay(140).duration(400)}>
                                <Card style={styles.warningCard}>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.cardHeaderLeft}>
                                            <View style={[styles.cardIconBg, { backgroundColor: '#FEF9C3' }]}>
                                                <AlertCircle size={15} color="#CA8A04" />
                                            </View>
                                            <Text style={[styles.cardTitle, { color: '#92400E' }]}>No Driver Assigned</Text>
                                        </View>
                                    </View>
                                    <Text style={styles.warningText}>No driver details available for this vehicle yet.</Text>
                                </Card>
                            </Animated.View>
                        )}

                        {/* Conductor */}
                        {conductor && (
                            <Animated.View entering={FadeInDown.delay(180).duration(400)}>
                                <Card>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.cardHeaderLeft}>
                                            <View style={[styles.cardIconBg, { backgroundColor: '#F3EEFF' }]}>
                                                <User size={15} color="#8B5CF6" />
                                            </View>
                                            <Text style={styles.cardTitle}>Conductor</Text>
                                        </View>
                                    </View>
                                    <View style={styles.personRow}>
                                        <View style={[styles.personAvatar, { backgroundColor: '#F3E8FF' }]}>
                                            {conductor.profilePicture && conductor.profilePicture !== 'default.png' ? (
                                                <Image source={{ uri: conductor.profilePicture }} style={styles.personAvatarImg} />
                                            ) : (
                                                <Text style={[styles.personInitial, { color: '#9333EA' }]}>{conductor.name?.charAt(0) || 'C'}</Text>
                                            )}
                                        </View>
                                        <View style={styles.personInfo}>
                                            <Text style={styles.personName}>{conductor.name}</Text>
                                            <Text style={styles.personSub}>Conductor</Text>
                                        </View>
                                        {conductor.contactNumber && (
                                            <HapticTouchable onPress={() => handleCall(conductor.contactNumber)}>
                                                <LinearGradient colors={['#8B5CF6', '#7C3AED']} style={styles.callBtn}>
                                                    <Phone size={18} color="#fff" />
                                                </LinearGradient>
                                            </HapticTouchable>
                                        )}
                                    </View>
                                </Card>
                            </Animated.View>
                        )}

                        {/* Active Trip */}
                        {activeTrip && (
                            <Animated.View entering={FadeInDown.delay(220).duration(400)}>
                                <Card>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.cardHeaderLeft}>
                                            <View style={[styles.cardIconBg, { backgroundColor: '#ECFDF5' }]}>
                                                <Route size={15} color="#10B981" />
                                            </View>
                                            <Text style={styles.cardTitle}>Active Trip</Text>
                                        </View>
                                        <View style={[styles.tripTypeBadge]}>
                                            <Text style={styles.tripTypeBadgeText}>{activeTrip.tripType}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.tripMetaRow}>
                                        <View style={styles.tripMeta}>
                                            <Text style={styles.tripMetaLabel}>Started</Text>
                                            <Text style={styles.tripMetaVal}>
                                                {activeTrip.startedAt
                                                    ? new Date(activeTrip.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : 'N/A'}
                                            </Text>
                                        </View>
                                    </View>
                                </Card>
                            </Animated.View>
                        )}

                        {/* Route stops */}
                        {stops.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(260).duration(400)}>
                                <Card>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.cardHeaderLeft}>
                                            <View style={[styles.cardIconBg, { backgroundColor: '#FFF7ED' }]}>
                                                <MapPin size={15} color="#F97316" />
                                            </View>
                                            <Text style={styles.cardTitle}>Route Stops</Text>
                                        </View>
                                        <View style={styles.countBadge}>
                                            <Text style={styles.countBadgeText}>{stops.length}</Text>
                                        </View>
                                    </View>
                                    <View>
                                        {stops.map((stop, index) => (
                                            <View key={stop.id} style={styles.stopItem}>
                                                <View style={[
                                                    styles.stopDot,
                                                    index === 0 ? { backgroundColor: '#10B981' } :
                                                        index === stops.length - 1 ? { backgroundColor: '#EF4444' } :
                                                            { backgroundColor: '#0469ff' }
                                                ]}>
                                                    <Text style={styles.stopDotText}>{index + 1}</Text>
                                                </View>
                                                {index < stops.length - 1 && <View style={styles.stopLine} />}
                                                <View style={styles.stopContent}>
                                                    <Text style={styles.stopName}>{stop.name}</Text>
                                                    <Text style={styles.stopTime}>
                                                        {activeTrip?.tripType === 'PICKUP' ? stop.pickupTime : stop.dropTime}
                                                    </Text>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                </Card>
                            </Animated.View>
                        )}

                        {/* Vehicle Info */}
                        {vehicle && (
                            <Animated.View entering={FadeInDown.delay(300).duration(400)}>
                                <Card>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.cardHeaderLeft}>
                                            <View style={[styles.cardIconBg, { backgroundColor: '#F0F9FF' }]}>
                                                <Bus size={15} color="#0284C7" />
                                            </View>
                                            <Text style={styles.cardTitle}>Vehicle Info</Text>
                                        </View>
                                        <View style={[styles.tripTypeBadge, {
                                            backgroundColor: status === 'MOVING' ? '#DCFCE7' : status === 'IDLE' ? '#FEF9C3' : '#FEE2E2',
                                        }]}>
                                            <Text style={[styles.tripTypeBadgeText, {
                                                color: status === 'MOVING' ? '#16A34A' : status === 'IDLE' ? '#CA8A04' : '#DC2626'
                                            }]}>{status}</Text>
                                        </View>
                                    </View>
                                    <View style={styles.vehicleGrid}>
                                        {[
                                            { label: 'Model', value: vehicle.model || 'N/A' },
                                            { label: 'Capacity', value: vehicle.capacity ? `${vehicle.capacity} seats` : 'N/A' },
                                            { label: 'License', value: vehicle.licensePlate || 'N/A' },
                                        ].map(item => (
                                            <View key={item.label} style={styles.vehicleCell}>
                                                <Text style={styles.vehicleCellLabel}>{item.label}</Text>
                                                <Text style={styles.vehicleCellVal}>{item.value}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </Card>
                            </Animated.View>
                        )}

                        {/* Route summary */}
                        {assignment && (
                            <Animated.View entering={FadeInDown.delay(340).duration(400)}>
                                <Card>
                                    <View style={styles.cardHeader}>
                                        <View style={styles.cardHeaderLeft}>
                                            <View style={[styles.cardIconBg, { backgroundColor: '#EEF4FF' }]}>
                                                <Navigation size={15} color="#0469ff" />
                                            </View>
                                            <Text style={styles.cardTitle}>Route Information</Text>
                                        </View>
                                    </View>
                                    {[
                                        { icon: MapPin, color: '#0469ff', label: 'Stop', value: assignment.stop?.name || 'Not Assigned' },
                                        { icon: Clock, color: '#10B981', label: 'Pickup Time', value: assignment.stop?.pickupTime || 'N/A' },
                                        { icon: Clock, color: '#EF4444', label: 'Drop Time', value: assignment.stop?.dropTime || 'N/A' },
                                    ].map(item => (
                                        <InfoRow key={item.label} icon={item.icon} iconColor={item.color} label={item.label} value={item.value} />
                                    ))}
                                </Card>
                            </Animated.View>
                        )}

                        {/* Tips */}
                        <Animated.View entering={FadeInDown.delay(380).duration(400)}>
                            <View style={styles.tipsCard}>
                                <View style={styles.tipsHeader}>
                                    <Radio size={14} color="#0469ff" />
                                    <Text style={styles.tipsTitle}>Live Tracking</Text>
                                </View>
                                {[
                                    'Location updates every 10s when bus is moving',
                                    'Tap the call button to contact driver directly',
                                    'Pull down to refresh for latest location',
                                ].map((tip, i) => (
                                    <View key={i} style={styles.tipRow}>
                                        <View style={styles.tipDot} />
                                        <Text style={styles.tipText}>{tip}</Text>
                                    </View>
                                ))}
                            </View>
                        </Animated.View>

                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const MAP_HEIGHT = height * 0.46;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F7F9FC' },

    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#F0F3F8',
    },
    backButton: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#F3F6FA',
        alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#0D1117', letterSpacing: -0.3 },
    headerSubtitle: { fontSize: 12, color: '#8A97B0', marginTop: 1 },
    refreshButton: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#EEF4FF',
        alignItems: 'center', justifyContent: 'center',
    },

    centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
    emptyIconWrap: {
        width: 88, height: 88, borderRadius: 44,
        backgroundColor: '#F1F5F9',
        alignItems: 'center', justifyContent: 'center',
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: '#334155' },
    emptyText: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20 },
    loadingText: { fontSize: 14, color: '#8A97B0', marginTop: 8 },

    // Map
    mapWrapper: {
        height: MAP_HEIGHT, width: '100%',
        backgroundColor: '#E8EEF4',
        position: 'relative',
        overflow: 'hidden',
    },
    mapPlaceholder: {
        flex: 1, alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#EEF2F8',
    },
    mapPlaceholderInner: {
        backgroundColor: '#fff', borderRadius: 18,
        padding: 24, alignItems: 'center', gap: 8,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
    },
    mapPlaceholderTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
    mapPlaceholderSub: { fontSize: 12, color: '#94A3B8' },

    // Status pill
    mapTopRow: {
        position: 'absolute', top: 14, left: 14, right: 14,
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, borderWidth: 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
    },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusPillText: { fontSize: 12, fontWeight: '700' },
    timePill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(255,255,255,0.92)',
        paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
    },
    timePillText: { fontSize: 11, color: '#475569', fontWeight: '500' },

    // Map controls
    mapControls: {
        position: 'absolute', right: 12, bottom: 16, gap: 8,
    },
    mapCtrlBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1, shadowRadius: 3, elevation: 3,
        marginTop: 6,
    },

    // ETA Banner
    etaBanner: {
        marginHorizontal: 16, marginTop: 16,
        borderRadius: 22, padding: 20,
        overflow: 'hidden', position: 'relative',
    },
    etaBannerDeco: {
        position: 'absolute', width: 120, height: 120, borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.07)',
        top: -30, right: -20,
    },
    etaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 14 },
    etaCell: { flex: 1, alignItems: 'center' },
    etaCellVal: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
    etaCellUnit: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.75)' },
    etaCellLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 3, fontWeight: '500' },
    etaSep: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)' },
    etaFooter: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    etaFooterText: { fontSize: 12, color: 'rgba(255,255,255,0.75)', flex: 1 },
    etaSourceBadge: {
        backgroundColor: 'rgba(255,255,255,0.18)',
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    },
    etaSourceText: { fontSize: 10, color: '#fff', fontWeight: '600' },

    // Cards area
    cardsArea: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },

    card: {
        backgroundColor: '#fff',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#F0F3F8',
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
    },
    warningCard: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },

    cardHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 14,
    },
    cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardIconBg: {
        width: 32, height: 32, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    cardTitle: { fontSize: 14, fontWeight: '700', color: '#0D1117' },

    assignedBadge: {
        backgroundColor: '#F1F5F9', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10,
    },
    assignedBadgeText: { fontSize: 10, fontWeight: '600', color: '#64748B' },

    // Person (driver / conductor)
    personRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    personAvatar: {
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: '#DBEAFE',
        alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
    },
    personAvatarImg: { width: 46, height: 46, borderRadius: 23 },
    personInitial: { fontSize: 18, fontWeight: '800', color: '#2563EB' },
    personInfo: { flex: 1 },
    personName: { fontSize: 15, fontWeight: '700', color: '#0D1117' },
    personSub: { fontSize: 12, color: '#8A97B0', marginTop: 2 },
    callBtn: {
        width: 42, height: 42, borderRadius: 21,
        alignItems: 'center', justifyContent: 'center',
    },
    warningText: { fontSize: 13, color: '#92400E', lineHeight: 18 },

    // Trip
    tripTypeBadge: {
        backgroundColor: '#ECFDF5',
        paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    },
    tripTypeBadgeText: { fontSize: 11, fontWeight: '700', color: '#15803D' },
    tripMetaRow: { flexDirection: 'row', gap: 16 },
    tripMeta: {},
    tripMetaLabel: { fontSize: 11, color: '#8A97B0', marginBottom: 2 },
    tripMetaVal: { fontSize: 14, fontWeight: '600', color: '#0D1117' },

    // Stops
    stopItem: {
        flexDirection: 'row', alignItems: 'flex-start',
        marginBottom: 14, position: 'relative',
    },
    stopDot: {
        width: 26, height: 26, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
        marginRight: 12, marginTop: 1,
        flexShrink: 0,
    },
    stopDotText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    stopLine: {
        position: 'absolute', left: 12, top: 28,
        width: 2, height: 12, backgroundColor: '#E2E8F0',
    },
    stopContent: { flex: 1 },
    stopName: { fontSize: 13, fontWeight: '600', color: '#0D1117' },
    stopTime: { fontSize: 11, color: '#8A97B0', marginTop: 2 },

    countBadge: {
        backgroundColor: '#FFF7ED', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10,
    },
    countBadgeText: { fontSize: 11, fontWeight: '700', color: '#F97316' },

    // Vehicle grid
    vehicleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
    vehicleCell: { width: '50%', paddingVertical: 8, paddingRight: 8 },
    vehicleCellLabel: { fontSize: 11, color: '#8A97B0', marginBottom: 2 },
    vehicleCellVal: { fontSize: 13, fontWeight: '700', color: '#0D1117' },

    // Info row
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
    infoIconBox: {
        width: 32, height: 32, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
    },
    infoRowText: { flex: 1 },
    infoLabel: { fontSize: 11, color: '#8A97B0' },
    infoValue: { fontSize: 14, fontWeight: '600', color: '#0D1117', marginTop: 1 },

    // Tips
    tipsCard: {
        backgroundColor: '#EEF4FF',
        borderRadius: 18, padding: 16,
        borderWidth: 1, borderColor: '#DBEAFE',
    },
    tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    tipsTitle: { fontSize: 13, fontWeight: '800', color: '#1E40AF' },
    tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
    tipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#93C5FD', marginTop: 5, flexShrink: 0 },
    tipText: { fontSize: 12, color: '#3B82F6', lineHeight: 18, flex: 1 },
});