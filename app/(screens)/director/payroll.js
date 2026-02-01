import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TouchableOpacity, Modal, Share, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
    DollarSign, ChevronLeft, Calendar, Users, CheckCircle, UserX, Clock,
    Download, FileText, ChevronRight, AlertCircle, Building2, Percent,
    TrendingUp, X, Briefcase, CreditCard, FileSpreadsheet, Mail
} from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function PayrollScreen() {
    const { schoolId } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [showDownloadOptions, setShowDownloadOptions] = useState(false);
    const queryClient = useQueryClient();

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
        return `₹${amount.toLocaleString('en-IN')}`;
    };

    const formatFullCurrency = (amount) => {
        if (!amount) return '₹0';
        return `₹${amount.toLocaleString('en-IN')}`;
    };

    const getStatusColor = (status) => {
        const colors = {
            'DRAFT': { bg: '#F3F4F6', text: '#6B7280' },
            'NOT_CREATED': { bg: '#FEF3C7', text: '#D97706' },
            'PENDING_APPROVAL': { bg: '#FEF3C7', text: '#D97706' },
            'APPROVED': { bg: '#DBEAFE', text: '#2563EB' },
            'PAID': { bg: '#DCFCE7', text: '#16A34A' },
            'READY': { bg: '#DCFCE7', text: '#16A34A' },
            'NO_STRUCTURE': { bg: '#FEE2E2', text: '#DC2626' },
            'NOT_PROCESSED': { bg: '#DBEAFE', text: '#2563EB' },
            'SKIPPED_NO_STRUCTURE': { bg: '#FEE2E2', text: '#DC2626' },
        };
        return colors[status] || colors.DRAFT;
    };

    const downloadPayslip = async (employeeId, employeeName) => {
        try {
            Alert.alert('Downloading...', `Fetching payslip for ${employeeName}`);
            const res = await api.get(`/schools/${schoolId}/payroll/payslips/${employeeId}/download`, {
                responseType: 'blob'
            });
            // Handle download logic
            Alert.alert('Success', `Payslip downloaded for ${employeeName}`);
        } catch (error) {
            Alert.alert('Error', 'Failed to download payslip');
        }
    };

    const downloadReport = async (type) => {
        setShowDownloadOptions(false);
        try {
            Alert.alert('Generating Report...', `Creating ${type} report`);
            const endpoint = type === 'excel'
                ? `/schools/${schoolId}/payroll/reports/export?format=xlsx`
                : `/schools/${schoolId}/payroll/reports/export?format=pdf`;

            const res = await api.get(endpoint, { responseType: 'blob' });
            Alert.alert('Success', `${type.toUpperCase()} report downloaded`);
        } catch (error) {
            Alert.alert('Error', `Failed to generate ${type} report`);
        }
    };

    const currentPeriod = data?.currentPeriod || {};
    const employees = data?.employees || [];
    const history = data?.history || [];
    const deductionTotals = data?.deductionTotals || {};
    const totalProfiles = data?.totalProfiles || 0;

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

            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Payroll Management</Text>
                <HapticTouchable onPress={() => setShowDownloadOptions(true)}>
                    <Download size={22} color="#EC4899" />
                </HapticTouchable>
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Current Period Summary Card */}
                <View style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                        <View>
                            <Text style={styles.summaryLabel}>Current Period</Text>
                            <Text style={styles.summaryPeriod}>
                                {currentPeriod.month} {currentPeriod.year}
                            </Text>
                        </View>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(currentPeriod.status).bg }]}>
                            <Text style={[styles.statusText, { color: getStatusColor(currentPeriod.status).text }]}>
                                {currentPeriod.status?.replace('_', ' ') || 'Not Created'}
                            </Text>
                        </View>
                    </View>

                    {/* Main Amount */}
                    <View style={styles.mainAmount}>
                        <Text style={styles.mainAmountLabel}>Net Payable</Text>
                        <Text style={styles.mainAmountValue}>{formatFullCurrency(currentPeriod.totalAmount)}</Text>
                    </View>

                    {/* Quick Stats Grid */}
                    <View style={styles.statsGrid}>
                        <View style={styles.statItem}>
                            <Users size={18} color="#6366F1" />
                            <Text style={styles.statValue}>{employees.length || totalProfiles}</Text>
                            <Text style={styles.statLabel}>Employees</Text>
                        </View>
                        <View style={styles.statItem}>
                            <TrendingUp size={18} color="#10B981" />
                            <Text style={styles.statValue}>{formatCurrency(currentPeriod.totalGross)}</Text>
                            <Text style={styles.statLabel}>Gross</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Percent size={18} color="#EF4444" />
                            <Text style={styles.statValue}>{formatCurrency(currentPeriod.totalDeductions)}</Text>
                            <Text style={styles.statLabel}>Deductions</Text>
                        </View>
                        <View style={styles.statItem}>
                            <Calendar size={18} color="#8B5CF6" />
                            <Text style={styles.statValue}>{currentPeriod.payDate || '-'}</Text>
                            <Text style={styles.statLabel}>Pay Date</Text>
                        </View>
                    </View>
                </View>

                {/* Tax & Deductions Breakdown */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Tax & Deductions Summary</Text>
                    <View style={styles.deductionCard}>
                        <View style={styles.deductionRow}>
                            <View style={styles.deductionItem}>
                                <Text style={styles.deductionLabel}>PF (Total)</Text>
                                <Text style={styles.deductionValue}>{formatFullCurrency(deductionTotals.pf)}</Text>
                            </View>
                            <View style={styles.deductionItem}>
                                <Text style={styles.deductionLabel}>ESI (Total)</Text>
                                <Text style={styles.deductionValue}>{formatFullCurrency(deductionTotals.esi)}</Text>
                            </View>
                        </View>
                        <View style={styles.deductionRow}>
                            <View style={styles.deductionItem}>
                                <Text style={styles.deductionLabel}>TDS</Text>
                                <Text style={styles.deductionValue}>{formatFullCurrency(deductionTotals.tds)}</Text>
                            </View>
                            <View style={styles.deductionItem}>
                                <Text style={styles.deductionLabel}>Professional Tax</Text>
                                <Text style={styles.deductionValue}>{formatFullCurrency(deductionTotals.professionalTax)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Employee Breakdown */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Employee Breakdown</Text>
                        <Text style={styles.sectionCount}>{employees.length} employees</Text>
                    </View>

                    {employees.length > 0 ? (
                        employees.map((emp, index) => (
                            <HapticTouchable
                                key={emp.id || index}
                                onPress={() => setSelectedEmployee(emp)}
                            >
                                <View style={styles.employeeCard}>
                                    <View style={styles.employeeAvatar}>
                                        <Text style={styles.avatarText}>
                                            {emp.name?.[0]?.toUpperCase() || '?'}
                                        </Text>
                                    </View>
                                    <View style={styles.employeeInfo}>
                                        <Text style={styles.employeeName}>{emp.name || 'Unknown'}</Text>
                                        <Text style={styles.employeeRole}>{emp.designation || 'Staff'}</Text>
                                        {emp.statusMessage && (
                                            <Text style={styles.statusMessage}>{emp.statusMessage}</Text>
                                        )}
                                    </View>
                                    <View style={styles.employeeSalary}>
                                        <Text style={styles.salaryAmount}>{formatCurrency(emp.netSalary)}</Text>
                                        <View style={[styles.empStatusBadge, { backgroundColor: getStatusColor(emp.status).bg }]}>
                                            <Text style={[styles.empStatusText, { color: getStatusColor(emp.status).text }]}>
                                                {emp.status === 'NO_STRUCTURE' ? 'No Structure' :
                                                    emp.status === 'NOT_PROCESSED' ? 'Not Processed' :
                                                        emp.status === 'BANK_PENDING' ? 'Bank Pending' :
                                                            emp.status === 'ADDED_AFTER' ? 'Added After' :
                                                                emp.status === 'SKIPPED_NO_STRUCTURE' ? 'Skipped' :
                                                                    emp.status === 'READY' ? 'Ready' : emp.status}
                                            </Text>
                                        </View>
                                    </View>
                                    <ChevronRight size={18} color="#9CA3AF" />
                                </View>
                            </HapticTouchable>
                        ))
                    ) : (
                        <View style={styles.emptyCard}>
                            <UserX size={40} color="#D1D5DB" />
                            <Text style={styles.emptyTitle}>No Employees</Text>
                            <Text style={styles.emptySubtext}>
                                Add employees to payroll from the web dashboard
                            </Text>
                        </View>
                    )}
                </View>

                {/* Payroll History */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Payroll History</Text>
                    {history.length > 0 ? (
                        history.map((period, index) => (
                            <View key={period.id || index} style={styles.historyCard}>
                                <View style={styles.historyInfo}>
                                    <Text style={styles.historyPeriod}>{period.month} {period.year}</Text>
                                    <Text style={styles.historyMeta}>
                                        {period.employeeCount} employees • Paid: {period.paidDate || 'N/A'}
                                    </Text>
                                </View>
                                <View style={styles.historyAmount}>
                                    <Text style={styles.historyValue}>{formatCurrency(period.totalAmount)}</Text>
                                    <View style={styles.historyStatusRow}>
                                        <CheckCircle size={14} color="#10B981" />
                                        <Text style={styles.historyStatusText}>Completed</Text>
                                    </View>
                                </View>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptyCard}>
                            <Clock size={40} color="#D1D5DB" />
                            <Text style={styles.emptyTitle}>No History Yet</Text>
                            <Text style={styles.emptySubtext}>
                                Completed payroll runs will appear here
                            </Text>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Employee Detail Modal */}
            <Modal
                visible={!!selectedEmployee}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setSelectedEmployee(null)}
            >
                <SafeAreaView style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Employee Details</Text>
                        <HapticTouchable onPress={() => setSelectedEmployee(null)}>
                            <X size={24} color="#6B7280" />
                        </HapticTouchable>
                    </View>

                    {selectedEmployee && (
                        <ScrollView style={styles.modalContent}>
                            {/* Employee Header */}
                            <View style={styles.empDetailHeader}>
                                <View style={styles.empDetailAvatar}>
                                    <Text style={styles.empDetailAvatarText}>
                                        {selectedEmployee.name?.[0]?.toUpperCase() || '?'}
                                    </Text>
                                </View>
                                <Text style={styles.empDetailName}>{selectedEmployee.name}</Text>
                                <Text style={styles.empDetailRole}>{selectedEmployee.designation}</Text>
                            </View>

                            {/* Salary Breakdown */}
                            <View style={styles.detailSection}>
                                <Text style={styles.detailSectionTitle}>Salary Breakdown</Text>
                                <View style={styles.detailCard}>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Gross Salary</Text>
                                        <Text style={styles.detailValue}>{formatFullCurrency(selectedEmployee.grossSalary)}</Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Total Deductions</Text>
                                        <Text style={[styles.detailValue, { color: '#EF4444' }]}>
                                            -{formatFullCurrency(selectedEmployee.deductions)}
                                        </Text>
                                    </View>
                                    <View style={[styles.detailRow, styles.detailRowHighlight]}>
                                        <Text style={styles.detailLabelBold}>Net Salary</Text>
                                        <Text style={styles.detailValueBold}>{formatFullCurrency(selectedEmployee.netSalary)}</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Status */}
                            <View style={styles.detailSection}>
                                <Text style={styles.detailSectionTitle}>Status</Text>
                                <View style={styles.detailCard}>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Salary Structure</Text>
                                        <Text style={[styles.detailValue, { color: selectedEmployee.hasSalaryStructure ? '#10B981' : '#EF4444' }]}>
                                            {selectedEmployee.hasSalaryStructure ? 'Assigned' : 'Not Assigned'}
                                        </Text>
                                    </View>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Payroll Status</Text>
                                        <Text style={styles.detailValue}>{selectedEmployee.status}</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Actions */}
                            <View style={styles.modalActions}>
                                <HapticTouchable
                                    style={styles.actionButton}
                                    onPress={() => downloadPayslip(selectedEmployee.id, selectedEmployee.name)}
                                >
                                    <FileText size={20} color="#FFFFFF" />
                                    <Text style={styles.actionButtonText}>Download Payslip</Text>
                                </HapticTouchable>
                            </View>
                        </ScrollView>
                    )}
                </SafeAreaView>
            </Modal>

            {/* Download Options Modal */}
            <Modal
                visible={showDownloadOptions}
                transparent
                animationType="fade"
                onRequestClose={() => setShowDownloadOptions(false)}
            >
                <TouchableOpacity
                    style={styles.downloadOverlay}
                    activeOpacity={1}
                    onPress={() => setShowDownloadOptions(false)}
                >
                    <View style={styles.downloadSheet}>
                        <Text style={styles.downloadTitle}>Download Reports</Text>

                        <HapticTouchable
                            style={styles.downloadOption}
                            onPress={() => downloadReport('excel')}
                        >
                            <FileSpreadsheet size={24} color="#10B981" />
                            <View style={styles.downloadOptionInfo}>
                                <Text style={styles.downloadOptionTitle}>Excel Report</Text>
                                <Text style={styles.downloadOptionDesc}>Full payroll data with all details</Text>
                            </View>
                        </HapticTouchable>

                        <HapticTouchable
                            style={styles.downloadOption}
                            onPress={() => downloadReport('pdf')}
                        >
                            <FileText size={24} color="#EF4444" />
                            <View style={styles.downloadOptionInfo}>
                                <Text style={styles.downloadOptionTitle}>PDF Summary</Text>
                                <Text style={styles.downloadOptionDesc}>Printable payroll summary</Text>
                            </View>
                        </HapticTouchable>

                        <HapticTouchable
                            style={styles.downloadOption}
                            onPress={() => {
                                setShowDownloadOptions(false);
                                Alert.alert('Coming Soon', 'Email all payslips feature coming soon');
                            }}
                        >
                            <Mail size={24} color="#6366F1" />
                            <View style={styles.downloadOptionInfo}>
                                <Text style={styles.downloadOptionTitle}>Email All Payslips</Text>
                                <Text style={styles.downloadOptionDesc}>Send payslips to all employees</Text>
                            </View>
                        </HapticTouchable>

                        <HapticTouchable
                            style={styles.cancelButton}
                            onPress={() => setShowDownloadOptions(false)}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </HapticTouchable>
                    </View>
                </TouchableOpacity>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scrollContent: { paddingBottom: 32 },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
    },
    headerTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },

    // Summary Card
    summaryCard: {
        margin: 16,
        padding: 20,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2
    },
    summaryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16
    },
    summaryLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
    summaryPeriod: { fontSize: 22, fontWeight: '700', color: '#1F2937' },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
    statusText: { fontSize: 12, fontWeight: '600' },

    mainAmount: { alignItems: 'center', paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    mainAmountLabel: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
    mainAmountValue: { fontSize: 32, fontWeight: '800', color: '#10B981' },

    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 16
    },
    statItem: { alignItems: 'center', flex: 1 },
    statValue: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginTop: 8 },
    statLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },

    // Section
    section: { paddingHorizontal: 16, marginBottom: 24 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
    sectionCount: { fontSize: 13, color: '#6B7280' },

    // Deduction Card
    deductionCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    deductionRow: { flexDirection: 'row', marginBottom: 12 },
    deductionItem: { flex: 1 },
    deductionLabel: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
    deductionValue: { fontSize: 16, fontWeight: '600', color: '#1F2937' },

    // Employee Card
    employeeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 14,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    employeeAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FDF2F8',
        justifyContent: 'center',
        alignItems: 'center'
    },
    avatarText: { fontSize: 16, fontWeight: '600', color: '#EC4899' },
    employeeInfo: { flex: 1, marginLeft: 12 },
    employeeName: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    employeeRole: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    employeeSalary: { alignItems: 'flex-end', marginRight: 8 },
    salaryAmount: { fontSize: 15, fontWeight: '700', color: '#10B981' },
    empStatusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
    empStatusText: { fontSize: 10, fontWeight: '500' },

    // History Card
    historyCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    historyInfo: {},
    historyPeriod: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    historyMeta: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
    historyAmount: { alignItems: 'flex-end' },
    historyValue: { fontSize: 15, fontWeight: '700', color: '#1F2937' },
    historyStatusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
    historyStatusText: { fontSize: 12, color: '#10B981' },

    // Empty State
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
    emptyTitle: { fontSize: 16, fontWeight: '600', color: '#6B7280', marginTop: 12 },
    emptySubtext: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 4, maxWidth: 220 },

    // Modal
    modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
    },
    modalTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
    modalContent: { flex: 1, padding: 16 },

    // Employee Detail
    empDetailHeader: { alignItems: 'center', paddingVertical: 24 },
    empDetailAvatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FDF2F8', justifyContent: 'center', alignItems: 'center' },
    empDetailAvatarText: { fontSize: 28, fontWeight: '600', color: '#EC4899' },
    empDetailName: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginTop: 12 },
    empDetailRole: { fontSize: 14, color: '#6B7280', marginTop: 4 },

    detailSection: { marginBottom: 24 },
    detailSectionTitle: { fontSize: 14, fontWeight: '600', color: '#6B7280', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
    detailCard: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    detailRowHighlight: { backgroundColor: '#F0FDF4', marginTop: 8, marginHorizontal: -16, paddingHorizontal: 16, borderRadius: 8, borderBottomWidth: 0 },
    detailLabel: { fontSize: 14, color: '#6B7280' },
    detailValue: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
    detailLabelBold: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    detailValueBold: { fontSize: 17, fontWeight: '700', color: '#10B981' },

    modalActions: { marginTop: 24 },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#EC4899',
        paddingVertical: 14,
        borderRadius: 12,
        gap: 8
    },
    actionButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

    // Download Sheet
    downloadOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    downloadSheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
    downloadTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 20, textAlign: 'center' },
    downloadOption: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F9FAFB', borderRadius: 12, marginBottom: 12 },
    downloadOptionInfo: { marginLeft: 16, flex: 1 },
    downloadOptionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    downloadOptionDesc: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    cancelButton: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
    cancelButtonText: { fontSize: 16, fontWeight: '500', color: '#6B7280' },
});
