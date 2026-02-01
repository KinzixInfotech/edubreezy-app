// app/(screens)/teachers/my-payroll.js
// Teacher view for payroll, payslips, loans, employment, bank, and tax details
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
    Linking,
    Alert,
    Modal,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
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
    Briefcase,
    Download,
    Edit3,
    X
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api, { API_BASE_URL } from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';

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

export default function TeacherPayroll() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('overview'); // overview, employment, salary, bank, tax, loans, payslips

    // Read user data directly from SecureStore (not cached via React Query)
    // This prevents data leaks when switching between profiles
    const [userData, setUserData] = useState(null);

    React.useEffect(() => {
        const loadUser = async () => {
            try {
                const stored = await SecureStore.getItemAsync('user');
                if (stored) {
                    setUserData(JSON.parse(stored));
                }
            } catch (error) {
                console.error('Failed to load user data:', error);
            }
        };
        loadUser();
    }, []);

    const schoolId = userData?.schoolId;
    const teacherId = userData?.id;
    console.log('TeacherPayroll userData:', userData);

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

    // Self-service update state
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [updateType, setUpdateType] = useState('bank'); // 'bank' or 'tax'
    const [formData, setFormData] = useState({
        bankName: '',
        accountNumber: '',
        ifscCode: '',
        accountHolder: '',
        upiId: '',
        panNumber: '',
        aadharNumber: '',
        uanNumber: '',
        esiNumber: '',
    });

    // Mutation for submitting self-service updates
    const updateProfileMutation = useMutation({
        mutationFn: async (data) => {
            const res = await api.patch(
                `/schools/${schoolId}/teachers/${teacherId}/payroll/profile/self-service`,
                data
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['teacher-payroll']);
            setShowUpdateModal(false);
            Alert.alert(
                '✅ Update Submitted',
                'Your details have been submitted for admin approval. You will be notified once approved.',
                [{ text: 'OK' }]
            );
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || 'Failed to submit update');
        },
    });

    const openUpdateModal = (type) => {
        const profile = payrollData?.profile || {};
        setUpdateType(type);
        if (type === 'bank') {
            setFormData({
                ...formData,
                bankName: profile.bankName || '',
                accountNumber: profile.accountNumber || '',
                ifscCode: profile.ifscCode || '',
                accountHolder: profile.accountHolder || profile.name || '',
                upiId: profile.upiId || '',
            });
        } else {
            setFormData({
                ...formData,
                panNumber: profile.panNumber || '',
                aadharNumber: profile.aadharNumber || '',
                uanNumber: profile.uanNumber || '',
                esiNumber: profile.esiNumber || '',
            });
        }
        setShowUpdateModal(true);
    };

    const handleSubmitUpdate = () => {
        if (updateType === 'bank') {
            if (!formData.accountNumber || !formData.ifscCode) {
                Alert.alert('Error', 'Account Number and IFSC Code are required');
                return;
            }
            updateProfileMutation.mutate({
                bankDetails: {
                    bankName: formData.bankName,
                    accountNumber: formData.accountNumber,
                    ifscCode: formData.ifscCode,
                    accountHolder: formData.accountHolder,
                    upiId: formData.upiId,
                },
            });
        } else {
            updateProfileMutation.mutate({
                idDetails: {
                    panNumber: formData.panNumber,
                    aadharNumber: formData.aadharNumber,
                    uanNumber: formData.uanNumber,
                    esiNumber: formData.esiNumber,
                },
            });
        }
    };

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['teacher-payroll']),
            queryClient.invalidateQueries(['teacher-payslips']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    // Download payslip PDF
    const handleDownloadPayslip = async (payslipId, monthName, year) => {
        try {
            // Construct the PDF download URL
            const pdfUrl = `${API_BASE_URL}/schools/${schoolId}/teachers/${teacherId}/payroll/payslips/${payslipId}/pdf`;

            // Open URL in browser - this will trigger the PDF download
            const supported = await Linking.canOpenURL(pdfUrl);
            if (supported) {
                await Linking.openURL(pdfUrl);
            } else {
                Alert.alert('Error', 'Unable to open PDF download link');
            }
        } catch (error) {
            console.error('Download error:', error);
            Alert.alert('Error', 'Failed to download payslip. Please try again.');
        }
    };

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
                <StatusBar style="dark" />
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
            <StatusBar style={showUpdateModal ? "dark" : "light"} />

            {/* Gradient Header */}
            <LinearGradient
                colors={['#0469ff', '#0355d4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                {/* Background Patterns */}
                <Text style={{ position: 'absolute', top: 20, right: 60, fontSize: 28, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>₹</Text>
                <Text style={{ position: 'absolute', top: 70, right: 25, fontSize: 18, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>✦</Text>
                <Text style={{ position: 'absolute', bottom: 60, right: 100, fontSize: 22, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>★</Text>
                <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.04)' }} />
                <View style={{ position: 'absolute', bottom: -50, left: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.04)' }} />

                <View style={styles.headerRow}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>My Payroll</Text>
                        <Text style={styles.headerSubtitle}>{profile?.name || 'Loading...'}</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                {/* Salary Summary in Header */}
                {latestPayslip && (
                    <View style={styles.salaryCard}>
                        <View style={styles.salaryRow}>
                            <View style={styles.salaryMain}>
                                <Text style={styles.salaryLabel}>Net Salary</Text>
                                <Text style={styles.salaryValue}>{formatCurrency(latestPayslip.netSalary)}</Text>
                            </View>
                            <View style={styles.salaryPeriod}>
                                <Text style={styles.periodBadgeText}>
                                    {getMonthName(latestPayslip.month)} {latestPayslip.year}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.salaryStats}>
                            <View style={styles.salaryStatItem}>
                                <Plus size={14} color="#51CF66" />
                                <Text style={styles.salaryStatValue}>{formatCurrency(latestPayslip.grossEarnings)}</Text>
                                <Text style={styles.salaryStatLabel}>Gross</Text>
                            </View>
                            <View style={styles.salaryStatDivider} />
                            <View style={styles.salaryStatItem}>
                                <Minus size={14} color="#FF6B6B" />
                                <Text style={styles.salaryStatValue}>{formatCurrency(latestPayslip.totalDeductions)}</Text>
                                <Text style={styles.salaryStatLabel}>Deductions</Text>
                            </View>
                            <View style={styles.salaryStatDivider} />
                            <View style={styles.salaryStatItem}>
                                <Calendar size={14} color="#fff" />
                                <Text style={styles.salaryStatValue}>{latestPayslip.daysWorked}</Text>
                                <Text style={styles.salaryStatLabel}>Days</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Scrollable Tabs */}
                <View style={styles.tabWrapper}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.tabContainer}
                        style={styles.tabScroll}
                    >
                        {tabs.map((tab) => (
                            <HapticTouchable
                                key={tab.id}
                                onPress={() => setActiveTab(tab.id)}
                            >
                                <View style={[styles.tab, activeTab === tab.id && styles.tabActive]}>
                                    <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                                        {tab.label}
                                    </Text>
                                </View>
                            </HapticTouchable>
                        ))}
                    </ScrollView>
                </View>
            </LinearGradient>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
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
                                                <User size={24} color="#0469ff" />
                                            </View>
                                        )}
                                    </View>
                                    <View style={styles.profileInfo}>
                                        <Text style={styles.profileName}>{profile.name}</Text>
                                        <Text style={styles.profileDesignation}>{profile.designation || 'Teacher'}</Text>
                                        <Text style={styles.profileDepartment}>{profile.department || 'Academics'}</Text>
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

                        {/* YTD Summary */}
                        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                            <Text style={styles.sectionTitle}>Year-to-Date ({ytd.year})</Text>
                            <View style={styles.ytdGrid}>
                                <View style={[styles.ytdCard, { borderColor: '#dcfce7' }]}>
                                    <View style={[styles.ytdIconBg, { backgroundColor: '#dcfce7' }]}>
                                        <TrendingUp size={18} color="#22c55e" />
                                    </View>
                                    <Text style={styles.ytdValue}>{formatCurrency(ytd.grossEarnings)}</Text>
                                    <Text style={styles.ytdLabel}>Total Earned</Text>
                                </View>
                                <View style={[styles.ytdCard, { borderColor: '#dbeafe' }]}>
                                    <View style={[styles.ytdIconBg, { backgroundColor: '#dbeafe' }]}>
                                        <Wallet size={18} color="#3b82f6" />
                                    </View>
                                    <Text style={styles.ytdValue}>{formatCurrency(ytd.netSalary)}</Text>
                                    <Text style={styles.ytdLabel}>Net Received</Text>
                                </View>
                                <View style={[styles.ytdCard, { borderColor: '#fef3c7' }]}>
                                    <View style={[styles.ytdIconBg, { backgroundColor: '#fef3c7' }]}>
                                        <Building2 size={18} color="#f59e0b" />
                                    </View>
                                    <Text style={styles.ytdValue}>{formatCurrency(ytd.pfContribution)}</Text>
                                    <Text style={styles.ytdLabel}>PF Contribution</Text>
                                </View>
                                <View style={[styles.ytdCard, { borderColor: '#fee2e2' }]}>
                                    <View style={[styles.ytdIconBg, { backgroundColor: '#fee2e2' }]}>
                                        <CreditCard size={18} color="#ef4444" />
                                    </View>
                                    <Text style={styles.ytdValue}>{formatCurrency(ytd.tds)}</Text>
                                    <Text style={styles.ytdLabel}>Tax Deducted</Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* Quick Actions - Birthday Card Style */}
                        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                            <Text style={styles.sectionTitle}>Quick Access</Text>

                            {/* Payslips Card */}
                            <HapticTouchable onPress={() => setActiveTab('payslips')}>
                                <View style={[styles.birthdayCard, { backgroundColor: '#eff6ff' }]}>
                                    <View style={[styles.birthdayIconBg, { backgroundColor: '#3b82f6' }]}>
                                        <FileText size={24} color="#fff" />
                                    </View>
                                    <View style={styles.birthdayContent}>
                                        <Text style={styles.birthdayTitle}>View Payslips</Text>
                                        <Text style={styles.birthdayDesc}>Download & view your monthly salary slips</Text>
                                    </View>
                                    <ChevronRight size={22} color="#3b82f6" />
                                </View>
                            </HapticTouchable>

                            {/* Salary Structure Card */}
                            <HapticTouchable onPress={() => setActiveTab('structure')}>
                                <View style={[styles.birthdayCard, { backgroundColor: '#f0fdf4' }]}>
                                    <View style={[styles.birthdayIconBg, { backgroundColor: '#22c55e' }]}>
                                        <Wallet size={24} color="#fff" />
                                    </View>
                                    <View style={styles.birthdayContent}>
                                        <Text style={styles.birthdayTitle}>Salary Structure</Text>
                                        <Text style={styles.birthdayDesc}>See your earnings & deductions breakdown</Text>
                                    </View>
                                    <ChevronRight size={22} color="#22c55e" />
                                </View>
                            </HapticTouchable>

                            {/* Bank Details Card */}
                            <HapticTouchable onPress={() => setActiveTab('bank')}>
                                <View style={[styles.birthdayCard, { backgroundColor: '#fefce8' }]}>
                                    <View style={[styles.birthdayIconBg, { backgroundColor: '#eab308' }]}>
                                        <Building2 size={24} color="#fff" />
                                    </View>
                                    <View style={styles.birthdayContent}>
                                        <Text style={styles.birthdayTitle}>Bank Details</Text>
                                        <Text style={styles.birthdayDesc}>Your account & payment information</Text>
                                    </View>
                                    <ChevronRight size={22} color="#eab308" />
                                </View>
                            </HapticTouchable>

                            {/* Tax & PF Card */}
                            <HapticTouchable onPress={() => setActiveTab('tax')}>
                                <View style={[styles.birthdayCard, { backgroundColor: '#fef2f2' }]}>
                                    <View style={[styles.birthdayIconBg, { backgroundColor: '#ef4444' }]}>
                                        <CreditCard size={24} color="#fff" />
                                    </View>
                                    <View style={styles.birthdayContent}>
                                        <Text style={styles.birthdayTitle}>Tax & PF Details</Text>
                                        <Text style={styles.birthdayDesc}>PAN, Aadhar, UAN & statutory info</Text>
                                    </View>
                                    <ChevronRight size={22} color="#ef4444" />
                                </View>
                            </HapticTouchable>
                        </Animated.View>

                        {/* Payroll Info */}
                        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                            <View style={styles.infoCard}>
                                <View style={[styles.infoIconBg, { backgroundColor: '#dbeafe' }]}>
                                    <Calendar size={18} color="#3b82f6" />
                                </View>
                                <View style={styles.infoContent}>
                                    <Text style={styles.infoTitle}>Salary Credit Date</Text>
                                    <Text style={styles.infoValue}>Last working day of each month</Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* Active Loans Summary Link */}
                        {loansEnabled && loans?.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(500).duration(500)}>
                                <TouchableOpacity
                                    style={styles.loansSummaryCard}
                                    onPress={() => setActiveTab('loans')}
                                >
                                    <View style={styles.loansSummaryLeft}>
                                        <View style={[styles.birthdayIconBg, { backgroundColor: '#ef4444' }]}>
                                            <CreditCard size={20} color="#fff" />
                                        </View>
                                        <View style={styles.loansSummaryText}>
                                            <Text style={styles.loansSummaryTitle}>
                                                {loans.length} Active Loan{loans.length > 1 ? 's' : ''}
                                            </Text>
                                            <Text style={styles.loansSummaryAmount}>
                                                EMI: {formatCurrency(loans.reduce((sum, l) => sum + l.emiAmount, 0))}/month
                                            </Text>
                                        </View>
                                    </View>
                                    <ChevronRight size={20} color="#ef4444" />
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                    </>
                )}

                {activeTab === 'employment' && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Briefcase size={20} color="#0469ff" />
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

                {activeTab === 'bank' && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Landmark size={20} color="#0469ff" />
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

                            {/* Update Button */}
                            <View style={styles.divider} />
                            <HapticTouchable onPress={() => openUpdateModal('bank')}>
                                <View style={styles.updateButton}>
                                    <Edit3 size={16} color="#fff" />
                                    <Text style={styles.updateButtonText}>Update Bank Details</Text>
                                </View>
                            </HapticTouchable>
                        </View>
                    </Animated.View>
                )}

                {activeTab === 'tax' && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <FileBadge size={20} color="#0469ff" />
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

                            {/* Update Button */}
                            <View style={styles.divider} />
                            <HapticTouchable onPress={() => openUpdateModal('tax')}>
                                <View style={styles.updateButton}>
                                    <Edit3 size={16} color="#fff" />
                                    <Text style={styles.updateButtonText}>Update Tax & ID Details</Text>
                                </View>
                            </HapticTouchable>
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
                                        {/* Download Button */}
                                        <TouchableOpacity
                                            style={styles.downloadButton}
                                            onPress={() => handleDownloadPayslip(payslip.id, payslip.monthName, payslip.year)}
                                        >
                                            <Download size={16} color="#fff" />
                                            <Text style={styles.downloadButtonText}>Download PDF</Text>
                                        </TouchableOpacity>
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

            {/* Self-Service Update Modal */}
            <Modal
                visible={showUpdateModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowUpdateModal(false)}
            >
                <StatusBar style="dark" />
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.modalContainer}
                >
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>
                            {updateType === 'bank' ? 'Update Bank Details' : 'Update Tax & ID Details'}
                        </Text>
                        <HapticTouchable onPress={() => setShowUpdateModal(false)}>
                            <X size={24} color="#333" />
                        </HapticTouchable>
                    </View>

                    <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
                        {updateType === 'bank' ? (
                            <>
                                <Text style={styles.inputLabel}>Bank Name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.bankName}
                                    onChangeText={(text) => setFormData({ ...formData, bankName: text })}
                                    placeholder="Enter bank name"
                                    placeholderTextColor="#999"
                                />

                                <Text style={styles.inputLabel}>Account Number *</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.accountNumber}
                                    onChangeText={(text) => setFormData({ ...formData, accountNumber: text })}
                                    placeholder="Enter account number"
                                    placeholderTextColor="#999"
                                    keyboardType="numeric"
                                />

                                <Text style={styles.inputLabel}>IFSC Code *</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.ifscCode}
                                    onChangeText={(text) => setFormData({ ...formData, ifscCode: text.toUpperCase() })}
                                    placeholder="Enter IFSC code"
                                    placeholderTextColor="#999"
                                    autoCapitalize="characters"
                                />

                                <Text style={styles.inputLabel}>Account Holder Name</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.accountHolder}
                                    onChangeText={(text) => setFormData({ ...formData, accountHolder: text })}
                                    placeholder="Enter account holder name"
                                    placeholderTextColor="#999"
                                />

                                <Text style={styles.inputLabel}>UPI ID (Optional)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.upiId}
                                    onChangeText={(text) => setFormData({ ...formData, upiId: text })}
                                    placeholder="e.g. yourname@upi"
                                    placeholderTextColor="#999"
                                />
                            </>
                        ) : (
                            <>
                                <Text style={styles.inputLabel}>PAN Number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.panNumber}
                                    onChangeText={(text) => setFormData({ ...formData, panNumber: text.toUpperCase() })}
                                    placeholder="Enter PAN number"
                                    placeholderTextColor="#999"
                                    autoCapitalize="characters"
                                    maxLength={10}
                                />

                                <Text style={styles.inputLabel}>Aadhar Number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.aadharNumber}
                                    onChangeText={(text) => setFormData({ ...formData, aadharNumber: text.replace(/\D/g, '') })}
                                    placeholder="Enter 12-digit Aadhar number"
                                    placeholderTextColor="#999"
                                    keyboardType="numeric"
                                    maxLength={12}
                                />

                                <Text style={styles.inputLabel}>UAN Number (PF)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.uanNumber}
                                    onChangeText={(text) => setFormData({ ...formData, uanNumber: text })}
                                    placeholder="Enter UAN number"
                                    placeholderTextColor="#999"
                                />

                                <Text style={styles.inputLabel}>ESI Number</Text>
                                <TextInput
                                    style={styles.input}
                                    value={formData.esiNumber}
                                    onChangeText={(text) => setFormData({ ...formData, esiNumber: text })}
                                    placeholder="Enter ESI number"
                                    placeholderTextColor="#999"
                                />
                            </>
                        )}

                        <View style={styles.infoBox}>
                            <AlertCircle size={16} color="#F59E0B" />
                            <Text style={styles.infoText}>
                                Updates will be sent to admin for approval. You'll be notified once approved.
                            </Text>
                        </View>

                        <HapticTouchable
                            onPress={handleSubmitUpdate}
                            disabled={updateProfileMutation.isPending}
                        >
                            <View style={[
                                styles.submitButton,
                                updateProfileMutation.isPending && styles.submitButtonDisabled
                            ]}>
                                {updateProfileMutation.isPending ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.submitButtonText}>Submit for Approval</Text>
                                )}
                            </View>
                        </HapticTouchable>

                        <View style={{ height: 40 }} />
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
        backgroundColor: '#fff',
    },
    loaderText: {
        fontSize: 14,
        color: '#666',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
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
        color: '#fff',
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    salaryCard: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    salaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    salaryMain: {},
    salaryLabel: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
    },
    salaryValue: {
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
        marginTop: 2,
    },
    salaryPeriod: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    periodBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#fff',
    },
    salaryStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    salaryStatItem: {
        alignItems: 'center',
        flex: 1,
    },
    salaryStatValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
        marginTop: 4,
    },
    salaryStatLabel: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 2,
    },
    salaryStatDivider: {
        width: 1,
        height: 36,
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    tabWrapper: {
        position: 'relative',
        marginHorizontal: 0,
    },
    tabFadeLeft: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 16,
        zIndex: 10,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
    },
    tabFadeRight: {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 16,
        zIndex: 10,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
    },
    tabScroll: {
        flexGrow: 0,
    },
    tabContainer: {
        paddingHorizontal: 0,
        paddingVertical: 4,
        gap: 8,
        justifyContent: 'center',
    },
    tab: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        marginRight: 6,
    },
    tabActive: {
        backgroundColor: '#fff',
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.9)',
    },
    tabTextActive: {
        color: '#0469ff',
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
        marginBottom: 16,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
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
        backgroundColor: '#e0e7ff',
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
        color: '#0469ff',
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
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        alignItems: 'flex-start',
        gap: 8,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
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
    ytdIconBg: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 4,
    },
    birthdayCard: {
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        gap: 14,
    },
    birthdayIconBg: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    birthdayContent: {
        flex: 1,
        gap: 3,
    },
    birthdayTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111',
    },
    birthdayDesc: {
        fontSize: 12,
        color: '#666',
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 14,
        marginBottom: 16,
        gap: 12,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
    },
    infoIconBg: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoContent: {
        flex: 1,
        gap: 2,
    },
    infoTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
    },
    infoValue: {
        fontSize: 12,
        color: '#666',
    },
    quickActionsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    quickActionCard: {
        flex: 1,
        borderRadius: 16,
        padding: 14,
        alignItems: 'center',
        gap: 8,
    },
    quickActionIcon: {
        width: 36,
        height: 36,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    quickActionLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#333',
        textAlign: 'center',
    },
    structureCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
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
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
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
    downloadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0469ff',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 8,
        marginTop: 12,
        gap: 8,
    },
    downloadButtonText: {
        color: '#fff',
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
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1.5,
        borderColor: '#e5e7eb',
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
        backgroundColor: '#e0e7ff',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4338ca',
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
        color: '#0469ff',
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
        backgroundColor: '#0469ff',
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
    // Self-service update styles
    updateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#0469ff',
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 16,
    },
    updateButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#fff',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingTop: 50,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        backgroundColor: '#fff',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    modalContent: {
        flex: 1,
        padding: 20,
    },
    inputLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
        marginTop: 16,
    },
    input: {
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: '#111',
        borderWidth: 1.5,
        borderColor: '#dee2e6',
    },
    infoBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: '#FEF3CD',
        padding: 14,
        borderRadius: 12,
        marginTop: 24,
        borderWidth: 1,
        borderColor: '#ffecb5',
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#856404',
        lineHeight: 18,
    },
    submitButton: {
        backgroundColor: '#10B981',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 24,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    submitButtonDisabled: {
        opacity: 0.6,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
