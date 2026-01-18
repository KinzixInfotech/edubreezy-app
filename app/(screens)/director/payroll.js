import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DollarSign, ChevronLeft, Calendar, Users, CheckCircle, UserX, Clock } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

export default function PayrollScreen() {
    const { schoolId } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['director-payroll', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/payroll`);
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

    const formatCurrency = (amount) => {
        if (!amount) return '₹0';
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
        if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
        return `₹${amount}`;
    };

    const currentPeriod = data?.currentPeriod || {};
    const employees = data?.employees || [];
    const history = data?.history || [];
    const hasCurrentPeriod = currentPeriod.month || currentPeriod.year;

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#EC4899" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Payroll</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Current Period Card */}
                <View style={styles.periodCard}>
                    <View style={styles.periodHeader}>
                        <View style={styles.periodInfo}>
                            <Text style={styles.periodLabel}>Current Period</Text>
                            <Text style={styles.periodDate}>
                                {hasCurrentPeriod ? `${currentPeriod.month} ${currentPeriod.year}` : 'No Active Period'}
                            </Text>
                        </View>
                        {hasCurrentPeriod && (
                            <View style={[styles.statusBadge, { backgroundColor: currentPeriod.status === 'APPROVED' ? '#DCFCE7' : '#FEF3C7' }]}>
                                <Text style={[styles.statusText, { color: currentPeriod.status === 'APPROVED' ? '#16A34A' : '#D97706' }]}>
                                    {currentPeriod.status || 'PENDING'}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.periodStats}>
                        <View style={styles.stat}>
                            <Users size={20} color="#EC4899" />
                            <Text style={styles.statValue}>{currentPeriod.employeeCount || 0}</Text>
                            <Text style={styles.statLabel}>Employees</Text>
                        </View>
                        <View style={styles.stat}>
                            <DollarSign size={20} color="#10B981" />
                            <Text style={styles.statValue}>{formatCurrency(currentPeriod.totalAmount)}</Text>
                            <Text style={styles.statLabel}>Total</Text>
                        </View>
                        <View style={styles.stat}>
                            <Calendar size={20} color="#6366F1" />
                            <Text style={styles.statValue}>{currentPeriod.payDate || '-'}</Text>
                            <Text style={styles.statLabel}>Pay Date</Text>
                        </View>
                    </View>
                </View>

                {/* Employee Breakdown Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Employee Breakdown</Text>
                    {employees.length > 0 ? (
                        employees.slice(0, 10).map((emp, index) => (
                            <View key={index} style={styles.employeeCard}>
                                <View style={styles.employeeAvatar}>
                                    <Text style={styles.avatarText}>{emp.name?.[0] || '?'}</Text>
                                </View>
                                <View style={styles.employeeInfo}>
                                    <Text style={styles.employeeName}>{emp.name}</Text>
                                    <Text style={styles.employeeRole}>{emp.designation || 'Staff'}</Text>
                                </View>
                                <View style={styles.salaryInfo}>
                                    <Text style={styles.salaryAmount}>{formatCurrency(emp.netSalary)}</Text>
                                    <Text style={styles.salaryLabel}>Net</Text>
                                </View>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptyCard}>
                            <UserX size={40} color="#D1D5DB" />
                            <Text style={styles.emptyTitle}>No Employee Data</Text>
                            <Text style={styles.emptySubtext}>
                                Employee payroll breakdown will appear here once processed
                            </Text>
                        </View>
                    )}
                </View>

                {/* Recent History Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recent History</Text>
                    {history.length > 0 ? (
                        history.map((period, index) => (
                            <View key={index} style={styles.historyCard}>
                                <View style={styles.historyInfo}>
                                    <Text style={styles.historyPeriod}>{period.month} {period.year}</Text>
                                    <Text style={styles.historyDate}>Paid: {period.paidDate || 'N/A'}</Text>
                                </View>
                                <View style={styles.historyAmount}>
                                    <Text style={styles.historyValue}>{formatCurrency(period.totalAmount)}</Text>
                                    <View style={styles.historyStatus}>
                                        <CheckCircle size={14} color="#10B981" />
                                        <Text style={styles.historyStatusText}>Completed</Text>
                                    </View>
                                </View>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptyCard}>
                            <Clock size={40} color="#D1D5DB" />
                            <Text style={styles.emptyTitle}>No Payroll History</Text>
                            <Text style={styles.emptySubtext}>
                                Past payroll records will appear here after processing
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    headerTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingBottom: 24 },
    periodCard: { margin: 16, padding: 20, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    periodHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    periodInfo: {},
    periodLabel: { fontSize: 12, color: '#6B7280' },
    periodDate: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginTop: 4 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    statusText: { fontSize: 12, fontWeight: '600' },
    periodStats: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    stat: { alignItems: 'center' },
    statValue: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginTop: 8 },
    statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
    section: { paddingHorizontal: 16, marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
    employeeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    employeeAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FDF2F8', justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 16, fontWeight: '600', color: '#EC4899' },
    employeeInfo: { flex: 1, marginLeft: 12 },
    employeeName: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    employeeRole: { fontSize: 14, color: '#6B7280', marginTop: 2 },
    salaryInfo: { alignItems: 'flex-end' },
    salaryAmount: { fontSize: 16, fontWeight: '700', color: '#10B981' },
    salaryLabel: { fontSize: 12, color: '#9CA3AF' },
    historyCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    historyInfo: {},
    historyPeriod: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    historyDate: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
    historyAmount: { alignItems: 'flex-end' },
    historyValue: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
    historyStatus: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
    historyStatusText: { fontSize: 12, color: '#10B981' },
    // Empty state styles
    emptyCard: {
        backgroundColor: '#FFFFFF',
        padding: 32,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center'
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#6B7280',
        marginTop: 12
    },
    emptySubtext: {
        fontSize: 13,
        color: '#9CA3AF',
        textAlign: 'center',
        marginTop: 4,
        maxWidth: 220
    },
});

