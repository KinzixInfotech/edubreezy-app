// app/(screens)/teachers/my-payroll.js
// Teacher view for payroll, payslips, loans, and YTD summary
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
    Building2,
    FileText,
    IndianRupee,
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

export default function TeacherPayroll() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('overview'); // overview, payslips, loans

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const teacherId = userData?.id;

    // Fetch payroll data
    const { data: payrollData, isLoading, error } = useQuery({
        queryKey: ['teacher-payroll', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return null;
            const res = await api.get(`/schools/${schoolId}/teachers/${teacherId}/payroll`);
            return res.data;
        },
        enabled: !!schoolId && !!teacherId,
        staleTime: 1000 * 60 * 5,
    });

    // Fetch payslip history
    const { data: payslipsData } = useQuery({
        queryKey: ['teacher-payslips', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return null;
            const res = await api.get(`/schools/${schoolId}/teachers/${teacherId}/payroll/payslips`);
            return res.data;
        },
        enabled: !!schoolId && !!teacherId && activeTab === 'payslips',
        staleTime: 1000 * 60 * 5,
    });

    // Fetch loans
    const { data: loansData } = useQuery({
        queryKey: ['teacher-loans', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return null;
            const res = await api.get(`/schools/${schoolId}/teachers/${teacherId}/payroll/loans`);
            return res.data;
        },
        enabled: !!schoolId && !!teacherId && payrollData?.loansEnabled && activeTab === 'loans',
        staleTime: 1000 * 60 * 5,
    });

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['teacher-payroll']),
            queryClient.invalidateQueries(['teacher-payslips']),
            queryClient.invalidateQueries(['teacher-loans']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
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

    const { profile, salaryStructure, latestPayslip, ytd, loans, loansEnabled } = payrollData;

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
                {loansEnabled && (
                    <TouchableOpacity
                        style={[styles.tab, activeTab === 'loans' && styles.tabActive]}
                        onPress={() => setActiveTab('loans')}
                    >
                        <Text style={[styles.tabText, activeTab === 'loans' && styles.tabTextActive]}>
                            Loans
                        </Text>
                    </TouchableOpacity>
                )}
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
            >
                {activeTab === 'overview' && (
                    <>
                        {/* Salary Summary Card */}
                        {latestPayslip && (
                            <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                                <LinearGradient
                                    colors={['#0469ff', '#0355d4']}
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
                                                {latestPayslip.daysWorked}
                                            </Text>
                                        </View>
                                    </View>
                                </LinearGradient>
                            </Animated.View>
                        )}

                        {/* YTD Summary */}
                        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                            <Text style={styles.sectionTitle}>Year-to-Date ({ytd.year})</Text>
                            <View style={styles.ytdGrid}>
                                <View style={styles.ytdCard}>
                                    <TrendingUp size={20} color="#51CF66" />
                                    <Text style={styles.ytdValue}>{formatCurrency(ytd.grossEarnings)}</Text>
                                    <Text style={styles.ytdLabel}>Total Earned</Text>
                                </View>
                                <View style={styles.ytdCard}>
                                    <Wallet size={20} color="#0469ff" />
                                    <Text style={styles.ytdValue}>{formatCurrency(ytd.netSalary)}</Text>
                                    <Text style={styles.ytdLabel}>Net Received</Text>
                                </View>
                                <View style={styles.ytdCard}>
                                    <Building2 size={20} color="#FFB020" />
                                    <Text style={styles.ytdValue}>{formatCurrency(ytd.pfContribution)}</Text>
                                    <Text style={styles.ytdLabel}>PF Contribution</Text>
                                </View>
                                <View style={styles.ytdCard}>
                                    <CreditCard size={20} color="#FF6B6B" />
                                    <Text style={styles.ytdValue}>{formatCurrency(ytd.tds)}</Text>
                                    <Text style={styles.ytdLabel}>Tax Deducted</Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* Salary Structure */}
                        {salaryStructure && (
                            <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                                <Text style={styles.sectionTitle}>Salary Structure</Text>
                                <View style={styles.structureCard}>
                                    <View style={styles.structureHeader}>
                                        <Text style={styles.structureName}>{salaryStructure.name}</Text>
                                        <Text style={styles.structureCTC}>
                                            CTC: {formatCurrency(salaryStructure.ctc)}
                                        </Text>
                                    </View>
                                    <View style={styles.structureItems}>
                                        <View style={styles.structureRow}>
                                            <Text style={styles.structureLabel}>Basic</Text>
                                            <Text style={styles.structureValue}>
                                                {formatCurrency(salaryStructure.basicSalary)}
                                            </Text>
                                        </View>
                                        {salaryStructure.hraPercent > 0 && (
                                            <View style={styles.structureRow}>
                                                <Text style={styles.structureLabel}>HRA ({salaryStructure.hraPercent}%)</Text>
                                                <Text style={styles.structureValue}>
                                                    {formatCurrency(salaryStructure.basicSalary * salaryStructure.hraPercent / 100)}
                                                </Text>
                                            </View>
                                        )}
                                        {salaryStructure.daPercent > 0 && (
                                            <View style={styles.structureRow}>
                                                <Text style={styles.structureLabel}>DA ({salaryStructure.daPercent}%)</Text>
                                                <Text style={styles.structureValue}>
                                                    {formatCurrency(salaryStructure.basicSalary * salaryStructure.daPercent / 100)}
                                                </Text>
                                            </View>
                                        )}
                                        {salaryStructure.taAmount > 0 && (
                                            <View style={styles.structureRow}>
                                                <Text style={styles.structureLabel}>Transport Allowance</Text>
                                                <Text style={styles.structureValue}>
                                                    {formatCurrency(salaryStructure.taAmount)}
                                                </Text>
                                            </View>
                                        )}
                                        {salaryStructure.specialAllowance > 0 && (
                                            <View style={styles.structureRow}>
                                                <Text style={styles.structureLabel}>Special Allowance</Text>
                                                <Text style={styles.structureValue}>
                                                    {formatCurrency(salaryStructure.specialAllowance)}
                                                </Text>
                                            </View>
                                        )}
                                        <View style={[styles.structureRow, styles.structureTotal]}>
                                            <Text style={styles.structureTotalLabel}>Gross Salary</Text>
                                            <Text style={styles.structureTotalValue}>
                                                {formatCurrency(salaryStructure.grossSalary)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* Active Loans Summary */}
                        {loansEnabled && loans?.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(500).duration(500)}>
                                <TouchableOpacity
                                    style={styles.loansSummaryCard}
                                    onPress={() => setActiveTab('loans')}
                                >
                                    <View style={styles.loansSummaryLeft}>
                                        <CreditCard size={24} color="#FF6B6B" />
                                        <View style={styles.loansSummaryText}>
                                            <Text style={styles.loansSummaryTitle}>
                                                {loans.length} Active Loan{loans.length > 1 ? 's' : ''}
                                            </Text>
                                            <Text style={styles.loansSummaryAmount}>
                                                EMI: {formatCurrency(loans.reduce((sum, l) => sum + l.emiAmount, 0))}/month
                                            </Text>
                                        </View>
                                    </View>
                                    <ChevronRight size={20} color="#999" />
                                </TouchableOpacity>
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
                                                <Calendar size={18} color="#0469ff" />
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

                {activeTab === 'loans' && loansEnabled && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        {loansData?.loans?.length > 0 ? (
                            <>
                                {/* Loan Summary */}
                                <View style={styles.loanSummaryGrid}>
                                    <View style={styles.loanSummaryCard}>
                                        <Text style={styles.loanSummaryValue}>
                                            {formatCurrency(loansData.summary.totalPending)}
                                        </Text>
                                        <Text style={styles.loanSummaryLabel}>Total Pending</Text>
                                    </View>
                                    <View style={styles.loanSummaryCard}>
                                        <Text style={styles.loanSummaryValue}>
                                            {formatCurrency(loansData.summary.monthlyEmi)}
                                        </Text>
                                        <Text style={styles.loanSummaryLabel}>Monthly EMI</Text>
                                    </View>
                                </View>

                                {/* Loan Cards */}
                                {loansData.loans.map((loan, idx) => (
                                    <Animated.View key={loan.id} entering={FadeInRight.delay(idx * 50)}>
                                        <View style={styles.loanCard}>
                                            <View style={styles.loanHeader}>
                                                <View>
                                                    <Text style={styles.loanType}>{loan.typeName}</Text>
                                                    <Text style={styles.loanAmount}>
                                                        {formatCurrency(loan.principalAmount)}
                                                    </Text>
                                                </View>
                                                <View style={[
                                                    styles.loanStatusBadge,
                                                    { backgroundColor: loan.status === 'ACTIVE' ? '#D1FAE5' : '#E5E7EB' }
                                                ]}>
                                                    <Text style={[
                                                        styles.loanStatusText,
                                                        { color: loan.status === 'ACTIVE' ? '#059669' : '#6B7280' }
                                                    ]}>
                                                        {loan.status}
                                                    </Text>
                                                </View>
                                            </View>

                                            {/* Progress Bar */}
                                            <View style={styles.loanProgress}>
                                                <View style={styles.progressBar}>
                                                    <View style={[
                                                        styles.progressFill,
                                                        { width: `${loan.progress}%` }
                                                    ]} />
                                                </View>
                                                <Text style={styles.progressText}>
                                                    {loan.progress}% paid
                                                </Text>
                                            </View>

                                            <View style={styles.loanDetails}>
                                                <View style={styles.loanDetailItem}>
                                                    <Text style={styles.loanDetailLabel}>EMI</Text>
                                                    <Text style={styles.loanDetailValue}>
                                                        {formatCurrency(loan.emiAmount)}/month
                                                    </Text>
                                                </View>
                                                <View style={styles.loanDetailItem}>
                                                    <Text style={styles.loanDetailLabel}>Paid</Text>
                                                    <Text style={[styles.loanDetailValue, { color: '#51CF66' }]}>
                                                        {formatCurrency(loan.amountPaid)}
                                                    </Text>
                                                </View>
                                                <View style={styles.loanDetailItem}>
                                                    <Text style={styles.loanDetailLabel}>Pending</Text>
                                                    <Text style={[styles.loanDetailValue, { color: '#FF6B6B' }]}>
                                                        {formatCurrency(loan.amountPending)}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    </Animated.View>
                                ))}
                            </>
                        ) : (
                            <View style={styles.emptyState}>
                                <CreditCard size={48} color="#ccc" />
                                <Text style={styles.emptyText}>No active loans</Text>
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
        backgroundColor: '#0469ff',
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
    structureCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    structureHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    structureName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    structureCTC: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0469ff',
    },
    structureItems: {
        gap: 8,
    },
    structureRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 4,
    },
    structureLabel: {
        fontSize: 14,
        color: '#666',
    },
    structureValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    structureTotal: {
        marginTop: 8,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    structureTotalLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    structureTotalValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0469ff',
    },
    loansSummaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFF5F5',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    loansSummaryLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    loansSummaryText: {
        gap: 4,
    },
    loansSummaryTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    loansSummaryAmount: {
        fontSize: 13,
        color: '#666',
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
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    payslipStatusText: {
        fontSize: 11,
        fontWeight: '600',
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
        gap: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    payslipBreakdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    breakdownLabel: {
        fontSize: 13,
        color: '#666',
    },
    breakdownValue: {
        fontSize: 13,
        fontWeight: '600',
    },
    emptyState: {
        paddingVertical: 60,
        alignItems: 'center',
        gap: 12,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
    loanSummaryGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    loanSummaryCard: {
        flex: 1,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    loanSummaryValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    loanSummaryLabel: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    loanCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    loanHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    loanType: {
        fontSize: 14,
        color: '#666',
    },
    loanAmount: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111',
        marginTop: 4,
    },
    loanStatusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    loanStatusText: {
        fontSize: 11,
        fontWeight: '600',
    },
    loanProgress: {
        marginBottom: 16,
    },
    progressBar: {
        height: 8,
        backgroundColor: '#e0e0e0',
        borderRadius: 4,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#51CF66',
        borderRadius: 4,
    },
    progressText: {
        fontSize: 12,
        color: '#666',
        textAlign: 'right',
    },
    loanDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    loanDetailItem: {
        alignItems: 'center',
    },
    loanDetailLabel: {
        fontSize: 12,
        color: '#999',
    },
    loanDetailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
        marginTop: 4,
    },
});
