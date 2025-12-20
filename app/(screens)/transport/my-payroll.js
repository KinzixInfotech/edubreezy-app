// Transport Staff Payroll Screen (Driver/Conductor)
// Matches teacher payroll UI design
import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    Wallet,
    TrendingUp,
    CreditCard,
    Calendar,
    ChevronRight,
    FileText,
    Clock,
    CheckCircle,
    AlertCircle,
    Minus,
    Plus,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';

const { width } = Dimensions.get('window');

const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₹0';
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

const getMonthName = (month) => {
    return new Date(2000, month - 1).toLocaleString('default', { month: 'short' });
};

export default function MyPayrollScreen() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId || userData?.school?.id;
    const userId = userData?.id;

    // Fetch payroll data
    const { data: payrollData, isLoading, error } = useQuery({
        queryKey: ['transport-payroll', schoolId, userId],
        queryFn: async () => {
            if (!schoolId || !userId) return null;
            const res = await api.get(`/schools/transport/staff/user/${userId}/payroll?schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 1000 * 60 * 5,
    });

    // Fetch payslip history
    const { data: payslipsData } = useQuery({
        queryKey: ['transport-payslips', schoolId, userId],
        queryFn: async () => {
            if (!schoolId || !userId) return null;
            const res = await api.get(`/schools/transport/staff/user/${userId}/payroll/payslips?schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId && !!userId && activeTab === 'payslips',
        staleTime: 1000 * 60 * 5,
    });

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['transport-payroll']),
            queryClient.invalidateQueries(['transport-payslips']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={styles.loaderText}>Loading payroll...</Text>
            </View>
        );
    }

    if (error || !payrollData) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#111" />
                        </View>
                    </HapticTouchable>
                    <Text style={styles.headerTitle}>My Payroll</Text>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.errorContainer}>
                    <AlertCircle size={48} color="#FF6B6B" />
                    <Text style={styles.errorText}>
                        {error?.message || 'Payroll profile not found'}
                    </Text>
                    <Text style={styles.errorSubtext}>
                        Contact your administrator to set up your payroll profile.
                    </Text>
                </View>
            </View>
        );
    }

    const { profile, latestPayslip, ytd, loansEnabled } = payrollData;

    return (
        <View style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <Text style={styles.headerTitle}>My Payroll</Text>
                <View style={{ width: 40 }} />
            </Animated.View>

            {/* Tabs */}
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
                    onPress={() => setActiveTab('overview')}
                >
                    <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
                        Overview
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'payslips' && styles.tabActive]}
                    onPress={() => setActiveTab('payslips')}
                >
                    <Text style={[styles.tabText, activeTab === 'payslips' && styles.tabTextActive]}>
                        Payslips
                    </Text>
                </TouchableOpacity>
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />
                }
            >
                {activeTab === 'overview' && (
                    <>
                        {/* Salary Summary Card */}
                        {latestPayslip ? (
                            <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                                <LinearGradient
                                    colors={['#059669', '#047857']}
                                    style={styles.mainCard}
                                >
                                    <View style={styles.mainCardHeader}>
                                        <View>
                                            <Text style={styles.mainCardLabel}>Net Salary</Text>
                                            <Text style={styles.mainCardValue}>
                                                {formatCurrency(latestPayslip.netSalary)}
                                            </Text>
                                        </View>
                                        <View style={styles.periodBadge}>
                                            <Text style={styles.periodText}>
                                                {getMonthName(latestPayslip.month)} {latestPayslip.year}
                                            </Text>
                                        </View>
                                    </View>
                                    <View style={styles.mainCardStats}>
                                        <View style={styles.statItem}>
                                            <Plus size={16} color="#51CF66" />
                                            <Text style={styles.statLabel}>Gross</Text>
                                            <Text style={styles.statValue}>
                                                {formatCurrency(latestPayslip.grossEarnings)}
                                            </Text>
                                        </View>
                                        <View style={styles.statDivider} />
                                        <View style={styles.statItem}>
                                            <Minus size={16} color="#FF6B6B" />
                                            <Text style={styles.statLabel}>Deductions</Text>
                                            <Text style={styles.statValue}>
                                                {formatCurrency(latestPayslip.totalDeductions)}
                                            </Text>
                                        </View>
                                        <View style={styles.statDivider} />
                                        <View style={styles.statItem}>
                                            <Calendar size={16} color="#fff" />
                                            <Text style={styles.statLabel}>Days</Text>
                                            <Text style={styles.statValue}>
                                                {latestPayslip.attendanceSummary?.daysWorked || '-'}
                                            </Text>
                                        </View>
                                    </View>
                                </LinearGradient>
                            </Animated.View>
                        ) : (
                            <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.emptyCard}>
                                <Wallet size={48} color="#ccc" />
                                <Text style={styles.emptyText}>No payslip available yet</Text>
                                <Text style={styles.emptySubtext}>Your salary details will appear here once processed</Text>
                            </Animated.View>
                        )}

                        {/* YTD Summary */}
                        {ytd && (
                            <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                                <Text style={styles.sectionTitle}>Year-to-Date ({ytd.year})</Text>
                                <View style={styles.ytdGrid}>
                                    <View style={styles.ytdCard}>
                                        <TrendingUp size={20} color="#51CF66" />
                                        <Text style={styles.ytdValue}>{formatCurrency(ytd.grossEarnings)}</Text>
                                        <Text style={styles.ytdLabel}>Total Earned</Text>
                                    </View>
                                    <View style={styles.ytdCard}>
                                        <Wallet size={20} color="#059669" />
                                        <Text style={styles.ytdValue}>{formatCurrency(ytd.netSalary)}</Text>
                                        <Text style={styles.ytdLabel}>Net Received</Text>
                                    </View>
                                    <View style={styles.ytdCard}>
                                        <CreditCard size={20} color="#FF6B6B" />
                                        <Text style={styles.ytdValue}>{formatCurrency(ytd.totalDeductions)}</Text>
                                        <Text style={styles.ytdLabel}>Deductions</Text>
                                    </View>
                                    <View style={styles.ytdCard}>
                                        <Clock size={20} color="#FFB020" />
                                        <Text style={styles.ytdValue}>{formatCurrency(ytd.pfContribution)}</Text>
                                        <Text style={styles.ytdLabel}>PF Contribution</Text>
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* Staff Profile Info */}
                        {profile && (
                            <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                                <Text style={styles.sectionTitle}>Profile Info</Text>
                                <View style={styles.profileCard}>
                                    <View style={styles.profileRow}>
                                        <Text style={styles.profileLabel}>Name</Text>
                                        <Text style={styles.profileValue}>{profile.name}</Text>
                                    </View>
                                    <View style={styles.profileRow}>
                                        <Text style={styles.profileLabel}>Employee ID</Text>
                                        <Text style={styles.profileValue}>{profile.employeeId}</Text>
                                    </View>
                                </View>
                            </Animated.View>
                        )}
                    </>
                )}

                {activeTab === 'payslips' && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        {payslipsData?.payslips?.length > 0 ? (
                            payslipsData.payslips.map((payslip, idx) => (
                                <Animated.View key={payslip.id} entering={FadeInRight.delay(idx * 50)}>
                                    <TouchableOpacity style={styles.payslipCard}>
                                        <View style={styles.payslipHeader}>
                                            <View style={styles.payslipMonth}>
                                                <Calendar size={18} color="#059669" />
                                                <Text style={styles.payslipMonthText}>
                                                    {payslip.monthName} {payslip.year}
                                                </Text>
                                            </View>
                                            <View style={[
                                                styles.payslipStatus,
                                                { backgroundColor: payslip.paymentStatus === 'PAID' ? '#D1FAE5' : '#FEF3C7' }
                                            ]}>
                                                <Text style={[
                                                    styles.payslipStatusText,
                                                    { color: payslip.paymentStatus === 'PAID' ? '#059669' : '#D97706' }
                                                ]}>
                                                    {payslip.paymentStatus}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={styles.payslipAmount}>
                                            <Text style={styles.payslipNet}>
                                                {formatCurrency(payslip.netSalary)}
                                            </Text>
                                            <Text style={styles.payslipMeta}>
                                                {payslip.daysWorked} days worked
                                            </Text>
                                        </View>
                                        <View style={styles.payslipBreakdown}>
                                            <View style={styles.payslipBreakdownItem}>
                                                <Text style={styles.breakdownLabel}>Gross</Text>
                                                <Text style={[styles.breakdownValue, { color: '#51CF66' }]}>
                                                    +{formatCurrency(payslip.grossEarnings)}
                                                </Text>
                                            </View>
                                            <View style={styles.payslipBreakdownItem}>
                                                <Text style={styles.breakdownLabel}>Deductions</Text>
                                                <Text style={[styles.breakdownValue, { color: '#FF6B6B' }]}>
                                                    -{formatCurrency(payslip.totalDeductions)}
                                                </Text>
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <FileText size={48} color="#ccc" />
                                <Text style={styles.emptyText}>No payslips available</Text>
                            </View>
                        )}
                    </Animated.View>
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
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loaderText: {
        fontSize: 16,
        color: '#666',
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
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    tabContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    tab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
    },
    tabActive: {
        backgroundColor: '#059669',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    tabTextActive: {
        color: '#fff',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
        gap: 16,
    },
    errorText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        textAlign: 'center',
    },
    errorSubtext: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
    mainCard: {
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
    },
    mainCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    mainCardLabel: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
    },
    mainCardValue: {
        fontSize: 32,
        fontWeight: '700',
        color: '#fff',
        marginTop: 4,
    },
    periodBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    periodText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#fff',
    },
    mainCardStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 4,
    },
    statValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        marginTop: 2,
    },
    statDivider: {
        width: 1,
        height: 40,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 12,
        marginTop: 8,
    },
    ytdGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 20,
    },
    ytdCard: {
        width: (width - 44) / 2,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        alignItems: 'flex-start',
        gap: 8,
    },
    ytdValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    ytdLabel: {
        fontSize: 12,
        color: '#666',
    },
    profileCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    profileRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    profileLabel: {
        fontSize: 14,
        color: '#666',
    },
    profileValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    emptyCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 20,
        padding: 40,
        alignItems: 'center',
        marginBottom: 20,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#64748B',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#94A3B8',
        marginTop: 8,
        textAlign: 'center',
    },
    payslipCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    payslipHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    payslipMonth: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    payslipMonthText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    payslipStatus: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
    },
    payslipStatusText: {
        fontSize: 12,
        fontWeight: '700',
    },
    payslipAmount: {
        marginBottom: 12,
    },
    payslipNet: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111',
    },
    payslipMeta: {
        fontSize: 13,
        color: '#666',
        marginTop: 4,
    },
    payslipBreakdown: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    payslipBreakdownItem: {
        alignItems: 'center',
    },
    breakdownLabel: {
        fontSize: 12,
        color: '#666',
        marginBottom: 4,
    },
    breakdownValue: {
        fontSize: 14,
        fontWeight: '600',
    },
});
