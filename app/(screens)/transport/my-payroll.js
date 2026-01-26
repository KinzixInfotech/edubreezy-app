// app/(screens)/transport/my-payroll.js
// Transport Staff view for payroll, payslips, loans, employment, bank, and tax details
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
    Image,
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
    User,
    Landmark,
    FileBadge,
    Briefcase
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

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
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

    const { profile, salaryStructure, latestPayslip, ytd, loans, loansEnabled } = payrollData;

    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'employment', label: 'Employment' },
        { id: 'salary', label: 'Salary Structure' },
        { id: 'bank', label: 'Bank Details' },
        { id: 'tax', label: 'Tax & PF' },
        ...(loansEnabled ? [{ id: 'loans', label: 'Loans' }] : []),
        { id: 'payslips', label: 'Payslips' },
    ];

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

            {/* Scrollable Tabs */}
            <View style={styles.tabWrapper}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabContainer}
                >
                    {tabs.map((tab) => (
                        <TouchableOpacity
                            key={tab.id}
                            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
                            onPress={() => setActiveTab(tab.id)}
                        >
                            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />
                }
            >
                {activeTab === 'overview' && (
                    <>
                        {/* Profile Summary Card */}
                        <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                            <View style={styles.profileCard}>
                                <View style={styles.profileRow}>
                                    <View style={['styles.avatarContainer', profile.profilePicture && { backgroundColor: 'transparent', overflow: 'hidden' }]}>
                                        {profile.profilePicture ? (
                                            <Image
                                                source={{ uri: profile.profilePicture }}
                                                style={{ width: 48, height: 48, borderRadius: 24 }}
                                            />
                                        ) : (
                                            <View style={styles.avatarContainer}>
                                                <User size={24} color="#059669" />
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.profileInfo}>
                                        <Text style={styles.profileName}>{profile.name}</Text>
                                        <Text style={styles.profileDesignation}>{profile.designation || 'Transport Staff'}</Text>
                                        <Text style={styles.profileDepartment}>{profile.department || 'Transport'}</Text>
                                    </View>
                                </View>
                                <View style={styles.profileDivider} />
                                <View style={styles.profileStats}>
                                    <View style={styles.profileStat}>
                                        <Text style={styles.profileStatLabel}>Joined</Text>
                                        <Text style={styles.profileStatValue}>{formatDate(profile.joiningDate)}</Text>
                                    </View>
                                    <View style={styles.profileStatDivider} />
                                    <View style={styles.profileStat}>
                                        <Text style={styles.profileStatLabel}>Type</Text>
                                        <Text style={styles.profileStatValue}>
                                            {profile.employmentType?.replace('_', ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase()) || 'Permanent'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </Animated.View>

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
                                                {latestPayslip.attendanceSummary?.daysWorked || latestPayslip.daysWorked || '-'}
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

                        {/* Link to Employment if Profile loaded */}
                        {profile && (
                            <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                                <TouchableOpacity
                                    style={styles.profileSummaryRow}
                                    onPress={() => setActiveTab('employment')}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                        <View style={styles.profileIconBg}>
                                            <User size={20} color="#059669" />
                                        </View>
                                        <View>
                                            <Text style={styles.profileRowTitle}>{profile.name}</Text>
                                            <Text style={styles.profileRowSubtitle}>{profile.designation}</Text>
                                        </View>
                                    </View>
                                    <ChevronRight size={20} color="#999" />
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                    </>
                )}

                {activeTab === 'employment' && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Briefcase size={20} color="#059669" />
                                <Text style={styles.cardTitle}>Employment Details</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Designation</Text>
                                <Text style={styles.detailValue}>{profile.designation || 'N/A'}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Department</Text>
                                <Text style={styles.detailValue}>{profile.department || 'N/A'}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Employment Type</Text>
                                <Text style={styles.detailValue}>{profile.employmentType?.replace('_', ' ') || 'N/A'}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Date of Joining</Text>
                                <Text style={styles.detailValue}>{formatDate(profile.joiningDate)}</Text>
                            </View>
                            {profile.confirmationDate && (
                                <>
                                    <View style={styles.divider} />
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Date of Confirmation</Text>
                                        <Text style={styles.detailValue}>{formatDate(profile.confirmationDate)}</Text>
                                    </View>
                                </>
                            )}
                        </View>
                    </Animated.View>
                )}

                {activeTab === 'salary' && salaryStructure && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
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
                                {/* Transport specific checks if structure exists */}
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

                {activeTab === 'bank' && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Landmark size={20} color="#059669" />
                                <Text style={styles.cardTitle}>Bank Account</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Bank Name</Text>
                                <Text style={styles.detailValue}>{profile.bankName || 'Not updated'}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Account Number</Text>
                                <Text style={styles.detailValue}>{profile.accountNumber || 'Not updated'}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>IFSC Code</Text>
                                <Text style={styles.detailValue}>{profile.ifscCode || 'Not updated'}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Account Holder</Text>
                                <Text style={styles.detailValue}>{profile.accountHolder || profile.name}</Text>
                            </View>
                            {profile.upiId && (
                                <>
                                    <View style={styles.divider} />
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>UPI ID</Text>
                                        <Text style={styles.detailValue}>{profile.upiId}</Text>
                                    </View>
                                </>
                            )}
                        </View>
                    </Animated.View>
                )}

                {activeTab === 'tax' && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <FileBadge size={20} color="#059669" />
                                <Text style={styles.cardTitle}>Tax & Statutory</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>PAN Number</Text>
                                <Text style={styles.detailValue}>{profile.panNumber || 'N/A'}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>UAN (PF)</Text>
                                <Text style={styles.detailValue}>{profile.uanNumber || 'N/A'}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>ESI Number</Text>
                                <Text style={styles.detailValue}>{profile.esiNumber || 'N/A'}</Text>
                            </View>
                            <View style={styles.divider} />
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Tax Regime</Text>
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{profile.taxRegime || 'NEW'}</Text>
                                </View>
                            </View>
                        </View>
                    </Animated.View>
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
    tabWrapper: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    tabContainer: {
        flexGrow: 1,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 8,
    },
    tab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        marginRight: 4,
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
    profileCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#f0f0f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    profileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 16,
    },
    avatarContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#d1fae5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    profileDesignation: {
        fontSize: 14,
        fontWeight: '600',
        color: '#059669',
        marginTop: 2,
    },
    profileDepartment: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    profileDivider: {
        height: 1,
        backgroundColor: '#f0f0f0',
        marginBottom: 16,
    },
    profileStats: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    profileStat: {
        flex: 1,
    },
    profileStatLabel: {
        fontSize: 12,
        color: '#666',
        marginBottom: 4,
    },
    profileStatValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    profileStatDivider: {
        width: 1,
        height: 30,
        backgroundColor: '#f0f0f0',
        marginHorizontal: 16,
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
        color: '#059669',
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
        color: '#059669',
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
    emptyCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 20,
        padding: 40,
        alignItems: 'center',
        marginBottom: 20,
    },
    card: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    cardTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    detailLabel: {
        fontSize: 14,
        color: '#666',
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
        maxWidth: '60%',
        textAlign: 'right',
    },
    divider: {
        height: 1,
        backgroundColor: '#e0e0e0',
    },
    badge: {
        backgroundColor: '#d1fae5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#059669',
    },
    profileSummaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    profileIconBg: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#d1fae5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    profileRowTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    profileRowSubtitle: {
        fontSize: 13,
        color: '#666',
    },
    loanSummaryGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
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
        marginBottom: 12,
    },
    loanType: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    loanAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: '#059669',
        marginTop: 4,
    },
    loanStatusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    loanStatusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    loanProgress: {
        marginBottom: 16,
    },
    progressBar: {
        height: 6,
        backgroundColor: '#e0e0e0',
        borderRadius: 3,
        marginBottom: 6,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#059669',
        borderRadius: 3,
    },
    progressText: {
        fontSize: 11,
        color: '#666',
        textAlign: 'right',
    },
    loanDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    loanDetailItem: {
        gap: 4,
    },
    loanDetailLabel: {
        fontSize: 11,
        color: '#666',
    },
    loanDetailValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#111',
    },
});
