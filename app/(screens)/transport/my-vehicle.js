import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, RefreshControl } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Bus, FileText, Wrench, AlertTriangle, Calendar, MapPin, CheckCircle2 } from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

export default function MyVehicleScreen() {
    const router = useRouter();
    const [user, setUser] = React.useState(null);

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
    const [refreshing, setRefreshing] = useState(false);

    // First get the transport staff ID for this user
    const { data: staffListData, refetch: refetchStaff, isLoading: isLoadingStaff } = useQuery({
        queryKey: ['transport-staff-list', schoolId, userId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/staff?schoolId=${schoolId}&userId=${userId}`);
            return res.data;
        },
        enabled: !!schoolId && !!userId,
    });

    const staffData = staffListData?.staff?.[0];
    const transportStaffId = staffData?.id;

    // Get vehicle from trips (more reliable since driver is assigned to trips)
    const { data: tripsData, isLoading: isLoadingTrips, refetch: refetchTrips } = useQuery({
        queryKey: ['driver-trips', schoolId, transportStaffId],
        queryFn: async () => {
            const today = new Date().toISOString().split('T')[0];
            const res = await api.get(`/schools/transport/trips?schoolId=${schoolId}&driverId=${transportStaffId}&startDate=${today}&endDate=${today}`);
            return res.data;
        },
        enabled: !!schoolId && !!transportStaffId,
    });

    // Combined loading state
    const isLoading = isLoadingStaff || (!!transportStaffId && isLoadingTrips);

    // Refresh both staff data and trips data
    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            refetchStaff(),
            transportStaffId ? refetchTrips() : Promise.resolve()
        ]);
        setRefreshing(false);
    }, [refetchStaff, refetchTrips, transportStaffId]);

    // Get vehicle from multiple sources (priority order):
    // 1. Today's trips (most reliable for active trips)
    // 2. Driver route assignments (permanent assignments)
    // 3. Conductor route assignments (if staff is conductor)
    // 4. Vehicle assignments (direct vehicle-to-staff assignment - fallback)
    const tripVehicle = tripsData?.trips?.[0]?.vehicle;
    const driverRouteVehicle = staffData?.driverRouteAssignments?.[0]?.vehicle;
    const conductorRouteVehicle = staffData?.conductorRouteAssignments?.[0]?.vehicle;
    const assignedVehicle = staffData?.vehicleAssignments?.[0]?.vehicle;

    const vehicle = tripVehicle || driverRouteVehicle || conductorRouteVehicle || assignedVehicle;

    // Also get the route info if available
    const assignedRoute = staffData?.driverRouteAssignments?.[0]?.route ||
        staffData?.conductorRouteAssignments?.[0]?.route;

    console.log('👤 Staff Data:', staffData);
    console.log('🚌 Vehicle from trips:', tripVehicle);
    console.log('🚌 Vehicle from driver route assignments:', driverRouteVehicle);
    console.log('🚌 Vehicle from conductor route assignments:', conductorRouteVehicle);
    console.log('🚌 Vehicle from vehicle assignments:', assignedVehicle);
    console.log('📍 Assigned Route:', assignedRoute);

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ScrollView
                    contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
                >
                    <Text>Loading vehicle details...</Text>
                </ScrollView>
            </View>
        );
    }

    if (!vehicle) {
        return (
            <View style={styles.container}>
                <ScrollView
                    contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
                >
                    <Bus size={64} color="#cbd5e1" />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#64748b', marginTop: 16 }}>No Vehicle Assigned</Text>
                    <Text style={{ textAlign: 'center', color: '#94a3b8', marginTop: 8 }}>You currently don't have a vehicle assigned to you. Please contact the transport manager.</Text>
                    <Text style={{ textAlign: 'center', color: '#0469ff', marginTop: 16, fontSize: 13 }}>Pull down to refresh</Text>
                </ScrollView>
            </View>
        );
    }
    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: 40, paddingTop: 20 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {/* Vehicle Main Card */}
                <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.vehicleCard}>
                    <View style={styles.statusBadge}>
                        <Text style={styles.statusText}>ACTIVE</Text>
                    </View>
                    <View style={styles.vehicleHeader}>
                        <View style={styles.vehicleIcon}>
                            <Bus size={32} color="#0469ff" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.plateNumber}>{vehicle.licensePlate}</Text>
                            <Text style={styles.modelName}>{vehicle.model || 'Unknown Model'}</Text>
                        </View>
                    </View>

                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Capacity</Text>
                            <Text style={styles.statValue}>{vehicle.capacity || '-'} Seats</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Fuel Type</Text>
                            <Text style={styles.statValue}>{vehicle.fuelType || 'Diff'}</Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statLabel}>Mileage</Text>
                            <Text style={styles.statValue}>{vehicle.mileage ? `${vehicle.mileage} km` : 'N/A'}</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Documents Section */}
                <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.section}>
                    <Text style={styles.sectionTitle}>Documents & Compliance</Text>

                    <View style={styles.docCard}>
                        <View style={styles.docIconBg}>
                            <FileText size={20} color="#0469ff" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.docTitle}>Registration Certificate</Text>
                            <Text style={styles.docExpiry}>
                                {vehicle.rcExpiry ? `Valid until: ${new Date(vehicle.rcExpiry).toLocaleDateString()}` : 'Not Uploaded'}
                            </Text>
                        </View>
                        {!vehicle.rcExpiry ? (
                            <AlertTriangle size={20} color="#94a3b8" />
                        ) : new Date(vehicle.rcExpiry) < new Date() ? (
                            <AlertTriangle size={20} color="#EF4444" />
                        ) : (
                            <CheckCircle2 size={20} color="#10B981" />
                        )}
                    </View>

                    <View style={styles.docCard}>
                        <View style={styles.docIconBg}>
                            <FileText size={20} color="#0469ff" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.docTitle}>Insurance Policy</Text>
                            <Text style={styles.docExpiry}>
                                {vehicle.insuranceExpiry ? `Valid until: ${new Date(vehicle.insuranceExpiry).toLocaleDateString()}` : 'Not Uploaded'}
                            </Text>
                        </View>
                        {!vehicle.insuranceExpiry ? (
                            <AlertTriangle size={20} color="#94a3b8" />
                        ) : new Date(vehicle.insuranceExpiry) < new Date() ? (
                            <AlertTriangle size={20} color="#EF4444" />
                        ) : (
                            <CheckCircle2 size={20} color="#10B981" />
                        )}
                    </View>

                    <View style={styles.docCard}>
                        <View style={styles.docIconBg}>
                            <FileText size={20} color="#0469ff" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.docTitle}>Pollution Certificate (PUC)</Text>
                            <Text style={styles.docExpiry}>
                                {vehicle.pucExpiry ? `Valid until: ${new Date(vehicle.pucExpiry).toLocaleDateString()}` : 'Not Uploaded'}
                            </Text>
                        </View>
                        {!vehicle.pucExpiry ? (
                            <AlertTriangle size={20} color="#94a3b8" />
                        ) : new Date(vehicle.pucExpiry) < new Date() ? (
                            <AlertTriangle size={20} color="#EF4444" />
                        ) : (
                            <CheckCircle2 size={20} color="#10B981" />
                        )}
                    </View>
                </Animated.View>

                {/* Maintenance Section (Placeholder for now as generic API doesn't have it) */}
                <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.section}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <Text style={styles.sectionTitle}>Maintenance Log</Text>
                        <TouchableOpacity>
                            <Text style={{ color: '#0469ff', fontWeight: '600' }}>View All</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.maintenanceCard, { borderWidth: 1, borderColor: '#e2e8f0' }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <View style={[styles.maintenanceIcon, { backgroundColor: '#FEF3C7' }]}>
                                <Wrench size={20} color="#D97706" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 12 }}>
                                <Text style={styles.maintenanceTitle}>Next Service Due</Text>
                                <Text style={styles.maintenanceDate}>{vehicle.maintenanceDue ? new Date(vehicle.maintenanceDue).toLocaleDateString() : 'Not Scheduled'}</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>

            </ScrollView>
        </View >
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
    vehicleCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 20,
        position: 'relative',
    },
    vehicleHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    vehicleIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    plateNumber: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1e293b',
    },
    modelName: {
        fontSize: 14,
        color: '#64748b',
        marginTop: 2,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    divider: {
        width: 1,
        height: 36,
        backgroundColor: '#f1f5f9',
    },
    statLabel: {
        fontSize: 12,
        color: '#94a3b8',
        marginBottom: 4,
    },
    statValue: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1e293b',
    },
    vehicleIconContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    vehicleInfo: {
        flex: 1,
    },
    vehiclePlate: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1e293b',
    },
    vehicleModel: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 6,
    },
    statusBadge: {
        position: 'absolute',
        top: 16,
        right: 16,
        backgroundColor: '#dcfce7',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#16a34a',
    },
    content: {
        flex: 1,
        paddingTop: 20,
        paddingHorizontal: 20,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 16,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    gridItem: {
        width: (width - 52) / 2,
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    gridLabel: {
        fontSize: 13,
        color: '#94a3b8',
        marginBottom: 6,
    },
    gridValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#334155',
    },
    docList: {
        gap: 12,
    },
    docItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    docIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    docContent: {
        flex: 1,
    },
    docTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#334155',
    },
    docExpiry: {
        fontSize: 12,
        color: '#94a3b8',
    },
    logItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 12,
    },
    dateBox: {
        backgroundColor: '#F1F5F9',
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        alignItems: 'center',
    },
    dateDay: {
        fontSize: 16,
        fontWeight: '800',
        color: '#334155',
    },
    dateMonth: {
        fontSize: 10,
        fontWeight: '700',
        color: '#64748b',
    },
    logTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#334155',
    },
    logDesc: {
        fontSize: 12,
        color: '#94a3b8',
        marginTop: 2,
    },
    logCost: {
        fontSize: 14,
        fontWeight: '600',
        color: '#10B981',
    },
    docCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    docIconBg: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    maintenanceCard: {
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    maintenanceIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    maintenanceTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1e293b',
    },
    maintenanceDate: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 2,
    },
});
