import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, MapPin, Clock, Users, Navigation, RefreshCw } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function MyRouteScreen() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [userLoading, setUserLoading] = useState(true);
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    // Load user data immediately on mount
    useEffect(() => {
        const getUser = async () => {
            try {
                const userData = await SecureStore.getItemAsync('user');
                if (userData) {
                    setUser(JSON.parse(userData));
                }
            } catch (e) {
                console.error('Error loading user:', e);
            } finally {
                setUserLoading(false);
            }
        };
        getUser();
    }, []);

    const schoolId = user?.schoolId || user?.school?.id;
    const userId = user?.id;

    // Fetch transport staff details to get the assigned route
    const { data: staffListData, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['my-route-staff', schoolId, userId],
        queryFn: async () => {
            console.log('Fetching route for:', { schoolId, userId });
            const res = await api.get(`/schools/transport/staff?schoolId=${schoolId}&userId=${userId}`);
            console.log('Route response:', res.data);
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 0,
        cacheTime: 0,
        refetchOnMount: true,
    });

    const onRefresh = useCallback(async () => {
        console.log('Refreshing route data...');
        setRefreshing(true);
        try {
            // Force refetch by invalidating and refetching
            await queryClient.invalidateQueries({ queryKey: ['my-route-staff'] });
            await refetch({ cancelRefetch: false });
        } catch (e) {
            console.error('Refresh error:', e);
        } finally {
            setRefreshing(false);
        }
    }, [refetch, queryClient]);

    const staffData = staffListData?.staff?.find(s => s.userId === userId) || staffListData?.staff?.[0];

    // Route can be assigned in multiple ways - check all paths
    const route =
        staffData?.driverRouteAssignments?.[0]?.route ||
        staffData?.conductorRouteAssignments?.[0]?.route ||
        staffData?.vehicleAssignments?.[0]?.vehicle?.routes?.[0] ||
        null;

    // Also get assigned vehicle info
    const assignedVehicle =
        staffData?.driverRouteAssignments?.[0]?.vehicle ||
        staffData?.conductorRouteAssignments?.[0]?.vehicle ||
        staffData?.vehicleAssignments?.[0]?.vehicle ||
        null;

    // Show loading state
    if (userLoading || isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={{ marginTop: 12, color: '#64748b' }}>Loading route details...</Text>
            </View>
        );
    }

    // No route assigned - with pull to refresh
    if (!route) {
        return (
            <View style={styles.container}>
                <View style={[styles.header, { backgroundColor: '#8B5CF6', paddingBottom: 20 }]}>
                    <View style={styles.headerContent}>
                        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>My Route</Text>
                        <View style={{ width: 40 }} />
                    </View>
                </View>
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{
                        flexGrow: 1,
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: 40,
                        minHeight: 300, // Ensure enough height for pull gesture
                    }}
                    showsVerticalScrollIndicator={false}
                    bounces={true}
                    alwaysBounceVertical={true}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor="#8B5CF6"
                            colors={['#8B5CF6']}
                            progressViewOffset={10}
                        />
                    }
                >
                    <MapPin size={64} color="#cbd5e1" />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#64748b', marginTop: 16 }}>No Route Assigned</Text>
                    <Text style={{ textAlign: 'center', color: '#94a3b8', marginTop: 8 }}>
                        You currently don't have a route assigned. Please contact the transport manager.
                    </Text>
                    <TouchableOpacity
                        onPress={onRefresh}
                        disabled={refreshing}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            marginTop: 24,
                            backgroundColor: refreshing ? '#a78bfa' : '#8B5CF6',
                            paddingHorizontal: 20,
                            paddingVertical: 12,
                            borderRadius: 12,
                        }}
                    >
                        {refreshing ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <RefreshCw size={16} color="#fff" />
                        )}
                        <Text style={{ color: '#fff', fontWeight: '600', marginLeft: 8 }}>
                            {refreshing ? 'Refreshing...' : 'Refresh'}
                        </Text>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 12 }}>Pull down to refresh</Text>
                </ScrollView>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <LinearGradient colors={['#8B5CF6', '#7C3AED']} style={styles.header}>
                <View style={styles.headerContent}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <ArrowLeft size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>My Route</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Route Info Card */}
                <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.routeCard}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                        <View>
                            <Text style={styles.routeLabel}>ROUTE NAME</Text>
                            <Text style={styles.routeName}>{route.name}</Text>
                        </View>
                        <View style={styles.routeIcon}>
                            <Navigation size={24} color="#8B5CF6" />
                        </View>
                    </View>

                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Clock size={16} color="#ddd6fe" style={{ marginBottom: 4 }} />
                            <Text style={styles.statValue}>{route.stops?.length * 15 || 45} mins</Text>
                            <Text style={styles.statLabel}>Est. Duration</Text>
                        </View>
                        <View style={{ width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                        <View style={styles.statItem}>
                            <MapPin size={16} color="#ddd6fe" style={{ marginBottom: 4 }} />
                            <Text style={styles.statValue}>{route.stops?.length || 0}</Text>
                            <Text style={styles.statLabel}>Stops</Text>
                        </View>
                        <View style={{ width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                        <View style={styles.statItem}>
                            <Users size={16} color="#ddd6fe" style={{ marginBottom: 4 }} />
                            <Text style={styles.statValue}>{route.stops?.reduce((acc, stop) => acc + (stop.students?.length || 0), 0)}</Text>
                            <Text style={styles.statLabel}>Students</Text>
                        </View>
                    </View>
                </Animated.View>
            </LinearGradient>

            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: 40, paddingTop: 80 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />}
            >
                <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.section}>
                    <Text style={styles.sectionTitle}>Route Stops</Text>

                    <View style={styles.timeline}>
                        {route.stops?.map((stop, index) => (
                            <View key={stop.id || index} style={styles.timelineItem}>
                                <View style={styles.timelineLeft}>
                                    <Text style={styles.stopTime}>
                                        {/* Mock times based on index for now as strict arrival times might not be in stop object */}
                                        {new Date(new Date().setHours(7, 30 + (index * 15))).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </View>

                                <View style={styles.timelineCenter}>
                                    <View style={[styles.timelineDot, { backgroundColor: index === 0 ? '#10B981' : index === route.stops.length - 1 ? '#EF4444' : '#8B5CF6' }]} />
                                    {index !== route.stops.length - 1 && <View style={styles.timelineLine} />}
                                </View>

                                <View style={styles.timelineRight}>
                                    <View style={styles.stopCard}>
                                        <Text style={styles.stopName}>{stop.location || stop.name || `Stop #${index + 1}`}</Text>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                            <Users size={12} color="#64748b" />
                                            <Text style={styles.studentCount}>{stop.students?.length || 0} Students</Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                </Animated.View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
    },
    header: {
        paddingTop: 60,
        paddingBottom: 80,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
    },
    headerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    routeCard: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginHorizontal: 20,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    routeLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 1,
        marginBottom: 4,
    },
    routeName: {
        fontSize: 22,
        fontWeight: '800',
        color: '#fff',
    },
    routeIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.9)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    statLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 2,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    section: {
        marginTop: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 16,
    },
    timeline: {
        marginTop: 8,
    },
    timelineItem: {
        flexDirection: 'row',
        minHeight: 70,
    },
    timelineLeft: {
        width: 60,
        paddingTop: 2,
    },
    timelineCenter: {
        width: 24,
        alignItems: 'center',
        marginRight: 12,
    },
    timelineDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#fff',
    },
    timelineLine: {
        width: 2,
        flex: 1,
        backgroundColor: '#e2e8f0',
        marginTop: 4,
    },
    timelineRight: {
        flex: 1,
        paddingBottom: 16,
    },
    stopCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    stopTime: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
    },
    stopName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#334155',
    },
    studentCount: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '500',
        marginLeft: 4,
    },
});
