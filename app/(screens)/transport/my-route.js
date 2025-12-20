import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, MapPin, Clock, Users, Navigation } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function MyRouteScreen() {
    const router = useRouter();
    const [user, setUser] = useState(null);

    useEffect(() => {
        const getUser = async () => {
            const userData = await SecureStore.getItemAsync('user');
            if (userData) {
                setUser(JSON.parse(userData));
            }
        };
        getUser();
    }, []);

    const schoolId = user?.schoolId || user?.school?.id;
    const userId = user?.id;

    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = React.useState(false);

    // Fetch transport staff details to get the assigned route
    const { data: staffListData, isLoading, refetch } = useQuery({
        queryKey: ['transport-staff-list', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/staff?schoolId=${schoolId}&limit=100`);
            return res.data;
        },
        enabled: !!schoolId,
    });

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const staffData = staffListData?.staff?.find(s => s.userId === userId);
    // Assuming the vehicle's first route is the primary one
    const route = staffData?.vehicleAssignments?.[0]?.vehicle?.routes?.[0];

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <Text>Loading route details...</Text>
            </View>
        );
    }

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
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
                    <MapPin size={64} color="#cbd5e1" />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#64748b', marginTop: 16 }}>No Route Assigned</Text>
                    <Text style={{ textAlign: 'center', color: '#94a3b8', marginTop: 8 }}>You currently don't have a route assigned. Please contact the transport manager.</Text>
                </View>
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
    routeHeaderCard: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        marginHorizontal: 20,
        borderRadius: 20,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
        position: 'absolute',
        bottom: -40,
        left: 0,
        right: 0,
        backgroundColor: '#8B5CF6', // Fallback
    },
    routeIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    routeInfo: {
        flex: 1,
    },
    routeName: {
        fontSize: 20,
        fontWeight: '800',
        color: '#fff',
        marginBottom: 8,
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    metaText: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 13,
        fontWeight: '600',
    },
    metaDivider: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.4)',
        marginHorizontal: 12,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1e293b',
    },
    timeline: {
        paddingLeft: 10,
    },
    stopItem: {
        flexDirection: 'row',
        minHeight: 80,
    },
    timeCol: {
        width: 70,
        paddingTop: 2,
    },
    stopTime: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748b',
    },
    lineCol: {
        alignItems: 'center',
        width: 30,
        marginRight: 10,
    },
    dot: {
        width: 14,
        height: 14,
        borderRadius: 7,
        zIndex: 2,
    },
    line: {
        width: 2,
        flex: 1,
        backgroundColor: '#e2e8f0',
        marginVertical: 4,
    },
    stopContent: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    stopName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#334155',
        marginBottom: 6,
    },
    stopMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    studentCount: {
        fontSize: 12,
        color: '#64748b',
        fontWeight: '500',
    },
});
