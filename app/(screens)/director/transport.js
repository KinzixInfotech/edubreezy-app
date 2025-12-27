import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bus, ChevronLeft, MapPin, Users, Wrench, CheckCircle, Navigation } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function TransportScreen() {
    const { schoolId } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['director-transport', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/transport`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    const stats = data?.stats || {};
    const vehicles = data?.vehicles || [];
    const activeTrips = data?.activeTrips || [];

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'active': return { bg: '#DCFCE7', text: '#16A34A' };
            case 'maintenance': return { bg: '#FEF3C7', text: '#D97706' };
            case 'inactive': return { bg: '#FEE2E2', text: '#DC2626' };
            default: return { bg: '#F3F4F6', text: '#6B7280' };
        }
    };

    const renderVehicle = ({ item }) => {
        const statusColor = getStatusColor(item.status);
        return (
            <HapticTouchable onPress={() => router.push(`/transport/vehicle/${item.id}`)}>
                <View style={styles.vehicleCard}>
                    <View style={[styles.vehicleIcon, { backgroundColor: statusColor.bg }]}>
                        <Bus size={24} color={statusColor.text} />
                    </View>
                    <View style={styles.vehicleInfo}>
                        <Text style={styles.vehiclePlate}>{item.licensePlate}</Text>
                        <Text style={styles.vehicleModel}>{item.model}</Text>
                        <View style={styles.vehicleDetails}>
                            <Users size={14} color="#9CA3AF" />
                            <Text style={styles.detailText}>{item.capacity} seats</Text>
                            {item.route && (
                                <>
                                    <MapPin size={14} color="#9CA3AF" style={{ marginLeft: 12 }} />
                                    <Text style={styles.detailText}>{item.route}</Text>
                                </>
                            )}
                        </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
                        <Text style={[styles.statusText, { color: statusColor.text }]}>
                            {item.status}
                        </Text>
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
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Transport</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Stats Cards */}
            <View style={styles.statsContainer}>
                <View style={[styles.statCard, { backgroundColor: '#F3F4F6' }]}>
                    <Bus size={20} color="#6B7280" />
                    <Text style={styles.statValue}>{stats.totalVehicles || 0}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#DCFCE7' }]}>
                    <CheckCircle size={20} color="#16A34A" />
                    <Text style={styles.statValue}>{stats.activeVehicles || 0}</Text>
                    <Text style={styles.statLabel}>Active</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
                    <Wrench size={20} color="#D97706" />
                    <Text style={styles.statValue}>{stats.maintenance || 0}</Text>
                    <Text style={styles.statLabel}>Maintenance</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
                    <Navigation size={20} color="#3B82F6" />
                    <Text style={styles.statValue}>{stats.activeTrips || 0}</Text>
                    <Text style={styles.statLabel}>On Route</Text>
                </View>
            </View>

            {/* Active Trips Alert */}
            {activeTrips.length > 0 && (
                <View style={styles.activeTripsCard}>
                    <View style={styles.tripHeader}>
                        <Navigation size={18} color="#3B82F6" />
                        <Text style={styles.tripHeaderText}>Active Trips</Text>
                    </View>
                    {activeTrips.slice(0, 3).map((trip, index) => (
                        <View key={index} style={styles.tripItem}>
                            <Text style={styles.tripVehicle}>{trip.vehiclePlate}</Text>
                            <Text style={styles.tripRoute}>{trip.route}</Text>
                            <View style={styles.tripStatus}>
                                <View style={styles.liveDot} />
                                <Text style={styles.tripStatusText}>In Transit</Text>
                            </View>
                        </View>
                    ))}
                </View>
            )}

            {/* Vehicles List */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>All Vehicles</Text>
            </View>
            <FlatList
                data={vehicles}
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    statsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 8,
    },
    statCard: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1F2937',
        marginTop: 6,
    },
    statLabel: {
        fontSize: 10,
        color: '#6B7280',
        marginTop: 2,
    },
    activeTripsCard: {
        marginHorizontal: 16,
        marginBottom: 16,
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    tripHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    tripHeaderText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1D4ED8',
    },
    tripItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#BFDBFE',
    },
    tripVehicle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1F2937',
        width: 80,
    },
    tripRoute: {
        flex: 1,
        fontSize: 14,
        color: '#6B7280',
    },
    tripStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981',
    },
    tripStatusText: {
        fontSize: 12,
        color: '#10B981',
    },
    section: {
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 12,
    },
    listContainer: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    vehicleCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    vehicleIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    vehicleInfo: {
        flex: 1,
        marginLeft: 12,
    },
    vehiclePlate: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1F2937',
    },
    vehicleModel: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    vehicleDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 4,
    },
    detailText: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        textTransform: 'capitalize',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        fontSize: 16,
        color: '#9CA3AF',
        marginTop: 12,
    },
});
