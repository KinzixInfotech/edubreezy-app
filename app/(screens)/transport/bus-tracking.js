// Bus Tracking Screen for Parents
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
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

const { height } = Dimensions.get('window');

export default function BusTrackingScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const intervalRef = useRef(null);

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

    // Fetch bus location - only when we have a valid vehicleId
    const { data: locationData, isLoading: locationLoading, refetch } = useQuery({
        queryKey: ['bus-location', vehicleId],
        queryFn: async () => {
            if (!vehicleId) return null;
            const res = await api.get(`/schools/transport/location/${vehicleId}?history=false`);
            return res.data;
        },
        enabled: !!vehicleId && vehicleId !== 'undefined',
        staleTime: 1000 * 15,
        refetchInterval: vehicleId ? 15000 : false, // Poll every 15 seconds only if we have vehicleId
    });

    const vehicle = locationData?.vehicle || assignment?.vehicle || assignment?.route?.vehicle;
    const location = locationData?.currentLocation;
    const activeTrip = locationData?.activeTrip;

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
    const lastUpdate = location?.timestamp ? new Date(location.timestamp) : null;
    const timeSinceUpdate = lastUpdate ? Math.round((Date.now() - lastUpdate.getTime()) / 60000) : null;

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
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Track Bus</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyState}>
                    <AlertCircle size={48} color="#ccc" />
                    <Text style={styles.emptyTitle}>No Child Selected</Text>
                    <Text style={styles.emptySubtitle}>Please select a child from home screen</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Track Bus</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s transport</Text>
                </View>
                <HapticTouchable onPress={onRefresh} disabled={refreshing}>
                    <View style={styles.refreshButton}>
                        <RefreshCw size={20} color="#0469ff" />
                    </View>
                </HapticTouchable>
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                    />
                }
            >
                {/* Child Info Card */}
                <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                    <View style={styles.childInfoCard}>
                        <View style={styles.childInfoIcon}>
                            <User size={20} color="#0469ff" />
                        </View>
                        <View style={styles.childInfoContent}>
                            <Text style={styles.childInfoName}>{childData.name}</Text>
                            <Text style={styles.childInfoClass}>
                                Class {childData.class} - {childData.section}
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                        <Text style={styles.loadingText}>Loading bus location...</Text>
                    </View>
                ) : !assignment ? (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.noAssignmentCard}>
                            <Bus size={48} color="#ccc" />
                            <Text style={styles.noAssignmentTitle}>No Transport Assigned</Text>
                            <Text style={styles.noAssignmentText}>
                                {childData.name} is not assigned to any bus service.
                            </Text>
                            <Text style={styles.noAssignmentSubtext}>
                                Request bus service from the Bus Request section.
                            </Text>
                        </View>
                    </Animated.View>
                ) : (
                    <>
                        {/* Map Placeholder */}
                        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                            <View style={styles.mapContainer}>
                                <View style={styles.mapPlaceholder}>
                                    <Navigation size={48} color="#CBD5E1" />
                                    <Text style={styles.mapPlaceholderText}>Map View</Text>
                                    {location && (
                                        <View style={styles.locationBadge}>
                                            <MapPin size={14} color="#10B981" />
                                            <Text style={styles.locationText}>
                                                {location.latitude?.toFixed(4)}, {location.longitude?.toFixed(4)}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </Animated.View>

                        {/* Status Cards */}
                        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                            <View style={[
                                styles.statusCard,
                                activeTrip ? styles.statusCardLive : styles.statusCardOffline
                            ]}>
                                <View style={styles.statusIndicator}>
                                    <View style={[
                                        styles.statusDot,
                                        activeTrip ? styles.statusDotLive : styles.statusDotOffline
                                    ]} />
                                    <Text style={styles.statusLabel}>
                                        {activeTrip ? 'LIVE' : 'OFFLINE'}
                                    </Text>
                                </View>
                                <Text style={styles.statusDesc}>
                                    {activeTrip
                                        ? `${activeTrip.tripType} trip in progress`
                                        : 'Bus is not on a trip currently'
                                    }
                                </Text>
                            </View>

                            {location && (
                                <View style={styles.updateCard}>
                                    <Clock size={18} color="#64748B" />
                                    <Text style={styles.updateText}>
                                        Last updated: {timeSinceUpdate === 0 ? 'Just now' : `${timeSinceUpdate} min ago`}
                                    </Text>
                                </View>
                            )}
                        </Animated.View>

                        {/* Vehicle Info */}
                        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                            <View style={styles.vehicleCard}>
                                <View style={styles.vehicleHeader}>
                                    <Bus size={22} color="#0469ff" />
                                    <Text style={styles.vehicleTitle}>Vehicle Details</Text>
                                </View>
                                <View style={styles.vehicleInfo}>
                                    <View style={styles.vehicleItem}>
                                        <Text style={styles.vehicleLabel}>License Plate</Text>
                                        <Text style={styles.vehicleValue}>{vehicle?.licensePlate || 'N/A'}</Text>
                                    </View>
                                    <View style={styles.vehicleItem}>
                                        <Text style={styles.vehicleLabel}>Model</Text>
                                        <Text style={styles.vehicleValue}>{vehicle?.model || 'N/A'}</Text>
                                    </View>
                                </View>
                            </View>
                        </Animated.View>

                        {/* Trip Info */}
                        {activeTrip && (
                            <Animated.View entering={FadeInRight.delay(500).duration(500)}>
                                <View style={styles.tripCard}>
                                    <View style={styles.tripHeader}>
                                        {activeTrip.tripType === 'PICKUP' ? (
                                            <Sun size={22} color="#F59E0B" />
                                        ) : (
                                            <Moon size={22} color="#6366F1" />
                                        )}
                                        <Text style={styles.tripTitle}>{activeTrip.route?.name}</Text>
                                    </View>

                                    {/* Crew Info */}
                                    <View style={styles.crewInfo}>
                                        <View style={styles.crewItem}>
                                            <Text style={styles.crewLabel}>Driver</Text>
                                            <Text style={styles.crewValue}>{activeTrip.driver?.name || 'N/A'}</Text>
                                            {activeTrip.driver?.contactNumber && (
                                                <HapticTouchable onPress={() => handleCall(activeTrip.driver.contactNumber)}>
                                                    <View style={styles.callBtn}>
                                                        <Phone size={14} color="#10B981" />
                                                        <Text style={styles.callBtnText}>{activeTrip.driver.contactNumber}</Text>
                                                    </View>
                                                </HapticTouchable>
                                            )}
                                        </View>
                                        {activeTrip.conductor && (
                                            <View style={styles.crewItem}>
                                                <Text style={styles.crewLabel}>Conductor</Text>
                                                <Text style={styles.crewValue}>{activeTrip.conductor?.name}</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Route Stops */}
                                    {activeTrip.route?.busStops?.length > 0 && (
                                        <View style={styles.stopsSection}>
                                            <Text style={styles.stopsTitle}>Route Stops</Text>
                                            {activeTrip.route.busStops.slice(0, 5).map((stop, index) => (
                                                <View key={stop.id} style={styles.stopRow}>
                                                    <View style={styles.stopNumber}>
                                                        <Text style={styles.stopNumberText}>{index + 1}</Text>
                                                    </View>
                                                    <Text style={styles.stopName}>{stop.name}</Text>
                                                    <Text style={styles.stopTime}>
                                                        {activeTrip.tripType === 'PICKUP' ? stop.pickupTime : stop.dropTime}
                                                    </Text>
                                                </View>
                                            ))}
                                            {activeTrip.route.busStops.length > 5 && (
                                                <Text style={styles.moreStops}>
                                                    +{activeTrip.route.busStops.length - 5} more stops
                                                </Text>
                                            )}
                                        </View>
                                    )}
                                </View>
                            </Animated.View>
                        )}

                        {/* Stop Assignment */}
                        {assignment?.stop && (
                            <Animated.View entering={FadeInDown.delay(600).duration(500)}>
                                <View style={styles.stopAssignmentCard}>
                                    <View style={styles.stopAssignmentHeader}>
                                        <MapPin size={20} color="#10B981" />
                                        <Text style={styles.stopAssignmentTitle}>Your Stop</Text>
                                    </View>
                                    <Text style={styles.stopAssignmentName}>{assignment.stop.name}</Text>
                                    <View style={styles.stopTimes}>
                                        <View style={styles.stopTimeItem}>
                                            <Sun size={16} color="#F59E0B" />
                                            <Text style={styles.stopTimeLabel}>Pickup:</Text>
                                            <Text style={styles.stopTimeValue}>{assignment.stop.pickupTime || 'N/A'}</Text>
                                        </View>
                                        <View style={styles.stopTimeItem}>
                                            <Moon size={16} color="#6366F1" />
                                            <Text style={styles.stopTimeLabel}>Drop:</Text>
                                            <Text style={styles.stopTimeValue}>{assignment.stop.dropTime || 'N/A'}</Text>
                                        </View>
                                    </View>
                                </View>
                            </Animated.View>
                        )}
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    refreshButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    childInfoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 16,
        gap: 12,
    },
    childInfoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    childInfoContent: {
        flex: 1,
    },
    childInfoName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    childInfoClass: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    loadingContainer: {
        padding: 60,
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 15,
        color: '#666',
    },
    noAssignmentCard: {
        alignItems: 'center',
        padding: 40,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
    },
    noAssignmentTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
        marginTop: 16,
    },
    noAssignmentText: {
        fontSize: 14,
        color: '#666',
        marginTop: 8,
        textAlign: 'center',
    },
    noAssignmentSubtext: {
        fontSize: 13,
        color: '#94A3B8',
        marginTop: 4,
    },
    mapContainer: {
        height: height * 0.25,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        marginBottom: 16,
        overflow: 'hidden',
    },
    mapPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mapPlaceholderText: {
        fontSize: 16,
        color: '#94A3B8',
        marginTop: 8,
    },
    locationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    locationText: {
        fontSize: 12,
        color: '#64748B',
        fontFamily: 'monospace',
    },
    statusCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        marginBottom: 10,
    },
    statusCardLive: {
        backgroundColor: '#D1FAE5',
        borderWidth: 1,
        borderColor: '#A7F3D0',
    },
    statusCardOffline: {
        backgroundColor: '#f8f9fa',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    statusIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    statusDotLive: {
        backgroundColor: '#10B981',
    },
    statusDotOffline: {
        backgroundColor: '#94A3B8',
    },
    statusLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#111',
    },
    statusDesc: {
        flex: 1,
        textAlign: 'right',
        fontSize: 13,
        color: '#666',
    },
    updateCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 10,
        marginBottom: 16,
    },
    updateText: {
        fontSize: 13,
        color: '#666',
    },
    vehicleCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    vehicleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    vehicleTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
    },
    vehicleInfo: {
        flexDirection: 'row',
        gap: 20,
    },
    vehicleItem: {
        flex: 1,
    },
    vehicleLabel: {
        fontSize: 12,
        color: '#94A3B8',
        marginBottom: 4,
    },
    vehicleValue: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    tripCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    tripHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
    },
    tripTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
    },
    crewInfo: {
        flexDirection: 'row',
        gap: 20,
        marginBottom: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e7eb',
    },
    crewItem: {
        flex: 1,
    },
    crewLabel: {
        fontSize: 12,
        color: '#94A3B8',
        marginBottom: 4,
    },
    crewValue: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
    },
    callBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 6,
    },
    callBtnText: {
        fontSize: 13,
        color: '#10B981',
    },
    stopsSection: {},
    stopsTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 10,
    },
    stopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    stopNumber: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    stopNumberText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#0469ff',
    },
    stopName: {
        flex: 1,
        fontSize: 14,
        color: '#111',
    },
    stopTime: {
        fontSize: 13,
        color: '#666',
    },
    moreStops: {
        fontSize: 13,
        color: '#94A3B8',
        marginTop: 8,
    },
    stopAssignmentCard: {
        backgroundColor: '#D1FAE5',
        borderRadius: 16,
        padding: 16,
    },
    stopAssignmentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    stopAssignmentTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#15803D',
    },
    stopAssignmentName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
        marginBottom: 12,
    },
    stopTimes: {
        flexDirection: 'row',
        gap: 20,
    },
    stopTimeItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    stopTimeLabel: {
        fontSize: 13,
        color: '#666',
    },
    stopTimeValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        paddingHorizontal: 32,
    },
});
