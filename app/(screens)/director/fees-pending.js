import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Wallet, ChevronLeft, AlertTriangle, Clock, Users } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function FeesPendingScreen() {
    const { schoolId } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);

    // First fetch academic years to get the active one
    const { data: academicYears } = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
            return Array.isArray(res.data) ? res.data : (res.data?.academicYears || []);
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 10,
    });

    const academicYearId = academicYears?.find(ay => ay.isActive)?.id;

    // Use the fee dashboard API which has proper data
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['fee-dashboard', schoolId, academicYearId],
        queryFn: async () => {
            const res = await api.get('/schools/fee/admin/dashboard', {
                params: { schoolId, academicYearId }
            });
            return res.data;
        },
        enabled: !!schoolId && !!academicYearId,
        staleTime: 60 * 1000,
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    const formatCurrency = (amount) => {
        if (!amount) return '₹0';
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
        return `₹${amount.toLocaleString('en-IN')}`;
    };

    // Map API response
    const summary = {
        totalPending: data?.summary?.totalBalance || 0,
        studentCount: (data?.statusCounts?.unpaid || 0) + (data?.statusCounts?.partial || 0),
        overdueCount: data?.statusCounts?.overdue || 0
    };
    const pendingStudents = (data?.overdueStudents || []).map(s => ({
        id: s.userId,
        studentName: s.name || 'Unknown',
        class: s.class?.className || '-',
        dueDate: s.overdueInstallments?.[0]?.dueDate || new Date(),
        pendingAmount: s.balanceAmount || 0,
        feeType: 'Tuition Fee',
        isOverdue: true
    }));

    const renderStudent = ({ item }) => (
        <HapticTouchable onPress={() => router.push(`/student/${item.id}/fees`)}>
            <View style={[styles.studentCard, item.isOverdue && styles.overdueCard]}>
                <View style={styles.studentInfo}>
                    <View style={styles.studentHeader}>
                        <Text style={styles.studentName}>{item.studentName}</Text>
                        {item.isOverdue && (
                            <View style={styles.overdueBadge}>
                                <AlertTriangle size={12} color="#DC2626" />
                                <Text style={styles.overdueText}>Overdue</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.studentClass}>{item.class}</Text>
                    <View style={styles.dueDateRow}>
                        <Clock size={12} color="#9CA3AF" />
                        <Text style={styles.dueDate}> Due: {new Date(item.dueDate).toLocaleDateString()}</Text>
                    </View>
                </View>
                <View style={styles.amountContainer}>
                    <Text style={[styles.pendingAmount, item.isOverdue && styles.overdueAmount]}>
                        {formatCurrency(item.pendingAmount)}
                    </Text>
                    <Text style={styles.feeType}>{item.feeType}</Text>
                </View>
            </View>
        </HapticTouchable>
    );

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#EF4444" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Fees Pending</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.summaryContainer}>
                <View style={[styles.summaryCard, { backgroundColor: '#FEE2E2' }]}>
                    <Wallet size={24} color="#DC2626" />
                    <Text style={styles.summaryValue}>{formatCurrency(summary.totalPending)}</Text>
                    <Text style={styles.summaryLabel}>Total Pending</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#FEF3C7' }]}>
                    <Users size={24} color="#D97706" />
                    <Text style={styles.summaryValue}>{summary.studentCount || 0}</Text>
                    <Text style={styles.summaryLabel}>Students</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#FECACA' }]}>
                    <AlertTriangle size={24} color="#B91C1C" />
                    <Text style={styles.summaryValue}>{summary.overdueCount || 0}</Text>
                    <Text style={styles.summaryLabel}>Overdue</Text>
                </View>
            </View>

            <FlatList
                data={pendingStudents}
                renderItem={renderStudent}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Wallet size={48} color="#D1D5DB" />
                        <Text style={styles.emptyText}>No pending fees</Text>
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    headerTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    summaryContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
    summaryCard: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
    summaryValue: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginTop: 8 },
    summaryLabel: { fontSize: 11, color: '#6B7280', marginTop: 4 },
    listContainer: { paddingHorizontal: 16, paddingBottom: 24 },
    studentCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    overdueCard: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
    studentInfo: { flex: 1 },
    studentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    studentName: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    overdueBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, gap: 4 },
    overdueText: { fontSize: 10, color: '#DC2626', fontWeight: '500' },
    studentClass: { fontSize: 14, color: '#6B7280', marginTop: 4 },
    dueDateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
    dueDate: { fontSize: 12, color: '#9CA3AF' },
    amountContainer: { alignItems: 'flex-end' },
    pendingAmount: { fontSize: 18, fontWeight: '700', color: '#EF4444' },
    overdueAmount: { color: '#B91C1C' },
    feeType: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 16, color: '#9CA3AF', marginTop: 12 },
});
