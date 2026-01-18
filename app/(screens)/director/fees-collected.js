import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { DollarSign, ChevronLeft, CreditCard, Banknote, Smartphone, TrendingUp } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

export default function FeesCollectedScreen() {
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

    // Map API response to screen data
    const summary = {
        thisMonth: data?.summary?.totalCollected || 0,
        growthPercent: data?.summary?.collectionPercentage || 0
    };
    const paymentMethods = (data?.paymentMethodStats || []).map(pm => ({
        method: pm.paymentMethod || 'Other',
        amount: pm._sum?.amount || 0,
        count: pm._count || 0
    }));
    const recentPayments = (data?.recentPayments || []).map(p => ({
        studentName: p.student?.name || 'Unknown',
        class: p.student?.class?.className || '-',
        date: p.paymentDate,
        amount: p.amount,
        method: p.paymentMethod
    }));

    const getPaymentIcon = (method) => {
        switch (method?.toLowerCase()) {
            case 'cash': return Banknote;
            case 'card': return CreditCard;
            case 'upi': return Smartphone;
            default: return DollarSign;
        }
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
            <StatusBar style='dark' />
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Fees Collected</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                <View style={styles.totalCard}>
                    <View style={styles.totalIconContainer}>
                        <DollarSign size={32} color="#FFFFFF" />
                    </View>
                    <Text style={styles.totalLabel}>Total Collected This Month</Text>
                    <Text style={styles.totalValue}>{formatCurrency(summary.thisMonth)}</Text>
                    <View style={styles.trendContainer}>
                        <TrendingUp size={16} color="#10B981" />
                        <Text style={styles.trendText}>+{summary.growthPercent || 0}% from last month</Text>
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Payment Methods</Text>
                    {paymentMethods.length > 0 ? (
                        <View style={styles.methodsContainer}>
                            {paymentMethods.map((method, index) => {
                                const Icon = getPaymentIcon(method.method);
                                return (
                                    <View key={index} style={styles.methodCard}>
                                        <View style={[styles.methodIcon, { backgroundColor: '#FEF3C7' }]}>
                                            <Icon size={20} color="#D97706" />
                                        </View>
                                        <Text style={styles.methodName}>{method.method}</Text>
                                        <Text style={styles.methodAmount}>{formatCurrency(method.amount)}</Text>
                                        <Text style={styles.methodCount}>{method.count} payments</Text>
                                    </View>
                                );
                            })}
                        </View>
                    ) : (
                        <View style={styles.emptyCard}>
                            <View style={styles.emptyIcon}>
                                <CreditCard size={32} color="#9CA3AF" />
                            </View>
                            <Text style={styles.emptyTitle}>No Payment Methods</Text>
                            <Text style={styles.emptyText}>Payment method data will appear here once fees are collected</Text>
                        </View>
                    )}
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recent Payments</Text>
                    {recentPayments.length > 0 ? (
                        recentPayments.map((payment, index) => (
                            <View key={index} style={styles.paymentCard}>
                                <View style={styles.paymentInfo}>
                                    <Text style={styles.paymentStudent}>{payment.studentName}</Text>
                                    <Text style={styles.paymentClass}>{payment.class}</Text>
                                    <Text style={styles.paymentDate}>{new Date(payment.date).toLocaleDateString()}</Text>
                                </View>
                                <View style={styles.paymentAmount}>
                                    <Text style={styles.amountText}>{formatCurrency(payment.amount)}</Text>
                                    <Text style={styles.paymentMethod}>{payment.method}</Text>
                                </View>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptyCard}>
                            <View style={styles.emptyIcon}>
                                <DollarSign size={32} color="#9CA3AF" />
                            </View>
                            <Text style={styles.emptyTitle}>No Payments Yet</Text>
                            <Text style={styles.emptyText}>Recent fee payments will appear here</Text>
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
    totalCard: { margin: 16, padding: 24, backgroundColor: '#F59E0B', borderRadius: 16, alignItems: 'center' },
    totalIconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    totalLabel: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 8 },
    totalValue: { fontSize: 36, fontWeight: '700', color: '#FFFFFF' },
    trendContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
    trendText: { fontSize: 12, color: '#FFFFFF', marginLeft: 4 },
    section: { paddingHorizontal: 16, marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
    methodsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    methodCard: { width: '47%', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    methodIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
    methodName: { fontSize: 14, color: '#6B7280', textTransform: 'capitalize' },
    methodAmount: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginTop: 4 },
    methodCount: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
    paymentCard: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    paymentInfo: { flex: 1 },
    paymentStudent: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    paymentClass: { fontSize: 14, color: '#6B7280', marginTop: 2 },
    paymentDate: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
    paymentAmount: { alignItems: 'flex-end' },
    amountText: { fontSize: 16, fontWeight: '700', color: '#10B981' },
    paymentMethod: { fontSize: 12, color: '#9CA3AF', marginTop: 2, textTransform: 'capitalize' },
    emptyCard: { backgroundColor: '#FFFFFF', padding: 32, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
    emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 8 },
    emptyText: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
});