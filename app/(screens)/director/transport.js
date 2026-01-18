import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, FlatList, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { Bus, ChevronLeft, MapPin, Users, Wrench, CheckCircle, Navigation, Clock, Phone, AlertCircle, Map } from 'lucide-react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

const { height, width } = Dimensions.get('window');

// Bus marker component
const BusMarkerView = ({ status }) => (
    <View style={[styles.busMarker,
    status === 'MOVING' ? styles.busMarkerMoving :
        status === 'IDLE' ? styles.busMarkerIdle :
            styles.busMarkerOffline
    ]}>
        <Bus size={16} color="#fff" />
    </View>
);

export default function TransportScreen() {
    const { schoolId } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);
    const [showMap, setShowMap] = useState(true);
    const mapRef = useRef(null);

    // Fetch all buses with locations
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['director-transport-all', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/location/all?schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 10 * 1000, // 10 seconds
        refetchInterval: 15000, // Poll every 15 seconds for live updates
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    const stats = data?.stats || { total: 0, active: 0, online: 0, offline: 0 };
    const buses = data?.buses || [];

    // Filter buses with locations for map
    const busesWithLocation = buses.filter(b => b.location?.latitude && b.location?.longitude);

    // Calculate map region to fit all buses
    useEffect(() => {
        if (busesWithLocation.length > 0 && mapRef.current && showMap) {
            const coords = busesWithLocation.map(b => ({
                latitude: b.location.latitude,
                longitude: b.location.longitude,
            }));
            mapRef.current.fitToCoordinates(coords, {
                edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
                animated: true,
            });
        }
    }, [busesWithLocation.length, showMap]);

    const getStatusColor = (status) => {
        switch (status?.toUpperCase()) {
            case 'MOVING': return { bg: '#DCFCE7', text: '#16A34A' };
            case 'IDLE': return { bg: '#FEF3C7', text: '#D97706' };
            case 'OFFLINE': return { bg: '#FEE2E2', text: '#DC2626' };
            default: return { bg: '#F3F4F6', text: '#6B7280' };
        }
    };

    const formatTimeAgo = (seconds) => {
        if (!seconds && seconds !== 0) return 'N/A';
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    };

    const renderVehicle = ({ item }) => {
        const statusColor = getStatusColor(item.status);
        const speedKmh = item.location?.speed ? Math.round(item.location.speed * 3.6) : null;
        const hasCrew = item.driver || item.conductor;

        return (
            <HapticTouchable onPress={() => router.push({
                pathname: '/director/bus-tracking',
                params: { vehicleId: item.id, schoolId, busData: JSON.stringify(item) }
            })}>
                <View style={styles.vehicleCard}>
                    <View style={[styles.vehicleIcon, { backgroundColor: statusColor.bg }]}>
                        <Bus size={24} color={statusColor.text} />
                    </View>
                    <View style={styles.vehicleInfo}>
                        <Text style={styles.vehiclePlate}>{item.licensePlate}</Text>
                        <Text style={styles.vehicleModel}>{item.model || 'Bus'}</Text>
                        <View style={styles.vehicleDetails}>
                            {item.routeName && (
                                <>
                                    <Navigation size={12} color="#9CA3AF" />
                                    <Text style={styles.detailText}>{item.routeName}</Text>
                                </>
                            )}
                            {hasCrew && (
                                <>
                                    <Users size={12} color="#9CA3AF" style={{ marginLeft: item.routeName ? 8 : 0 }} />
                                    <Text style={styles.detailText}>
                                        {item.driver?.name || 'No driver'}
                                        {item.conductor ? ` + ${item.conductor.name?.split(' ')[0] || 'Cond'}` : ''}
                                    </Text>
                                </>
                            )}
                        </View>
                    </View>
                    <View style={styles.vehicleRight}>
                        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                            <View style={[styles.statusDot, { backgroundColor: statusColor.text }]} />
                            <Text style={[styles.statusText, { color: statusColor.text }]}>
                                {item.status}
                            </Text>
                        </View>
                        {speedKmh !== null && item.status === 'MOVING' ? (
                            <Text style={styles.speedText}>{speedKmh} km/h</Text>
                        ) : item.secondsAgo !== null ? (
                            <Text style={styles.timeAgo}>{formatTimeAgo(item.secondsAgo)}</Text>
                        ) : null}
                    </View>
                </View>
            </HapticTouchable>
        );
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#F59E0B" />
                    <Text style={styles.loadingText}>Loading transport data...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style='dark' />
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Transport</Text>
                <HapticTouchable onPress={() => setShowMap(!showMap)}>
                    <View style={[styles.mapToggle, showMap && styles.mapToggleActive]}>
                        <Map size={20} color={showMap ? '#FFFFFF' : '#6B7280'} />
                    </View>
                </HapticTouchable>
            </View>

            {/* Stats Cards */}
            <View style={styles.statsContainer}>
                <View style={[styles.statCard, { backgroundColor: '#F3F4F6' }]}>
                    <Bus size={18} color="#6B7280" />
                    <Text style={styles.statValue}>{stats.total}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#DCFCE7' }]}>
                    <Navigation size={18} color="#16A34A" />
                    <Text style={styles.statValue}>{stats.active}</Text>
                    <Text style={styles.statLabel}>Active</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
                    <CheckCircle size={18} color="#3B82F6" />
                    <Text style={styles.statValue}>{stats.online}</Text>
                    <Text style={styles.statLabel}>Online</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
                    <AlertCircle size={18} color="#DC2626" />
                    <Text style={styles.statValue}>{stats.offline}</Text>
                    <Text style={styles.statLabel}>Offline</Text>
                </View>
            </View>

            {/* Global Map View */}
            {showMap && (
                <View style={styles.mapContainer}>
                    {busesWithLocation.length === 0 ? (
                        <View style={styles.mapPlaceholder}>
                            <MapPin size={32} color="#9CA3AF" />
                            <Text style={styles.mapPlaceholderText}>No buses with live location</Text>
                            <Text style={styles.mapPlaceholderSubtext}>Buses will appear here once they start trips</Text>
                        </View>
                    ) : (
                        <MapView
                            ref={mapRef}
                            provider={PROVIDER_GOOGLE}
                            style={styles.map}
                            mapType="standard"
                            showsPointsOfInterest={false}
                            showsBuildings={false}
                            zoomEnabled={true}
                            zoomControlEnabled={true}
                            initialRegion={{
                                latitude: busesWithLocation[0]?.location?.latitude || 20.5937,
                                longitude: busesWithLocation[0]?.location?.longitude || 78.9629,
                                latitudeDelta: 0.1,
                                longitudeDelta: 0.1,
                            }}
                        >
                            {busesWithLocation.map((bus) => (
                                <Marker
                                    key={bus.id}
                                    coordinate={{
                                        latitude: bus.location.latitude,
                                        longitude: bus.location.longitude,
                                    }}
                                    title={bus.licensePlate}
                                    description={`${bus.status} • ${bus.routeName || 'No route'}`}
                                    onCalloutPress={() => router.push({
                                        pathname: '/director/bus-tracking',
                                        params: { vehicleId: bus.id, schoolId, busData: JSON.stringify(bus) }
                                    })}
                                >
                                    <BusMarkerView status={bus.status} />
                                </Marker>
                            ))}
                        </MapView>
                    )}

                    {/* Map Legend */}
                    <View style={styles.mapLegend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#16A34A' }]} />
                            <Text style={styles.legendText}>Moving</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#EAB308' }]} />
                            <Text style={styles.legendText}>Idle</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#DC2626' }]} />
                            <Text style={styles.legendText}>Offline</Text>
                        </View>
                    </View>
                </View>
            )}

            {/* Vehicles List */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>All Vehicles ({buses.length})</Text>
            </View>
            <FlatList
                data={buses}
                renderItem={renderVehicle}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Bus size={48} color="#D1D5DB" />
                        <Text style={styles.emptyText}>No vehicles found</Text>
                        <Text style={styles.emptySubtext}>Add vehicles to start tracking</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
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
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1F2937',
    },
    mapToggle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    mapToggleActive: {
        backgroundColor: '#3B82F6',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#6B7280',
        fontSize: 14,
    },
    statsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    statCard: {
        flex: 1,
        padding: 10,
        borderRadius: 12,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
        marginTop: 4,
    },
    statLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 2,
    },
    mapContainer: {
        height: height * 0.28,
        marginHorizontal: 16,
        marginBottom: 12,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#E5E7EB',
    },
    map: {
        flex: 1,
    },
    mapPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
    },
    mapPlaceholderText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
        marginTop: 12,
    },
    mapPlaceholderSubtext: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 4,
    },
    mapLegend: {
        position: 'absolute',
        bottom: 10,
        left: 10,
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.95)',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 12,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendText: {
        fontSize: 10,
        color: '#374151',
    },
    section: {
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 8,
    },
    listContainer: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    vehicleCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 14,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    vehicleIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    vehicleInfo: {
        flex: 1,
        marginLeft: 12,
    },
    vehiclePlate: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1F2937',
    },
    vehicleModel: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    vehicleDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 4,
    },
    detailText: {
        fontSize: 11,
        color: '#9CA3AF',
    },
    vehicleRight: {
        alignItems: 'flex-end',
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        gap: 4,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
    },
    timeAgo: {
        fontSize: 10,
        color: '#9CA3AF',
        marginTop: 4,
    },
    speedText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#16A34A',
        marginTop: 4,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        fontSize: 16,
        color: '#6B7280',
        marginTop: 12,
        fontWeight: '500',
    },
    emptySubtext: {
        fontSize: 13,
        color: '#9CA3AF',
        marginTop: 4,
    },
    // Bus Markers
    busMarker: {
        width: 32,
        height: 32,
        borderRadius: 16,
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
});
