// app/(screens)/payment-history.jsx
// Payment History Screen with Receipt View & Share

import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Platform,
    Alert,
    ActivityIndicator,
    Share,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
    ArrowLeft,
    Receipt,
    Calendar,
    DollarSign,
    Download,
    Share2,
    CheckCircle,
    Clock,
    CreditCard,
    FileText,
    ChevronRight,
    X,
    AlertCircle,
    Hourglass,
    TrendingUp,
    Wallet,
    BadgeCheck,
    CircleDashed,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight, SlideInUp, FadeIn } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';
import { Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Svg, { Circle } from 'react-native-svg';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// ── Empty state component ─────────────────────────────────────────────────────
const EmptyState = ({ icon: Icon, title, subtitle, color = '#0469ff' }) => (
    <Animated.View entering={FadeInDown.delay(200).duration(400)} style={emptyStyles.wrap}>
        <View style={[emptyStyles.iconBg, { backgroundColor: color + '15' }]}>
            <Icon size={40} color={color} />
        </View>
        <Text style={emptyStyles.title}>{title}</Text>
        <Text style={emptyStyles.subtitle}>{subtitle}</Text>
    </Animated.View>
);

const emptyStyles = StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 56, gap: 12 },
    iconBg: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    title: { fontSize: 17, fontWeight: '700', color: '#111' },
    subtitle: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 40, lineHeight: 20 },
});

export default function PaymentHistoryScreen() {
    const params = useLocalSearchParams();
    const childData = params.childData ? JSON.parse(params.childData) : null;
    const insets = useSafeAreaInsets();

    const [refreshing, setRefreshing] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [receiptModalVisible, setReceiptModalVisible] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [filterMode, setFilterMode] = useState('ALL');
    const [activeTab, setActiveTab] = useState('DETAILS');

    const queryClient = useQueryClient();

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;

    const { data: academicYears } = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId,
        select: (data) => data?.find(y => y.isActive),
    });

    const { data: studentFee, isLoading: feeLoading } = useQuery({
        queryKey: ['student-fee', childData?.studentId, academicYears?.id],
        queryFn: async () => {
            const res = await api.get(`/schools/fee/students/${childData.studentId}?academicYearId=${academicYears.id}`);
            return res.data;
        },
        enabled: !!childData && !!academicYears?.id,
    });

    const { data: payments, isLoading: paymentsLoading } = useQuery({
        queryKey: ['payment-history', childData?.studentId, academicYears?.id],
        queryFn: async () => {
            const queryParams = new URLSearchParams({
                parentId: childData.parentId,
                studentId: childData.studentId,
                academicYearId: academicYears.id,
            });
            const res = await api.get(`schools/fee/parent/payment-history?${queryParams}`);
            return res.data;
        },
        enabled: !!childData && !!academicYears,
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        if (activeTab === 'DETAILS') {
            await queryClient.invalidateQueries(['student-fee']);
        } else {
            await queryClient.invalidateQueries(['payment-history']);
        }
        setRefreshing(false);
    }, [activeTab]);

    const formatCurrency = (amount) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);

    const formatDate = (dateString) =>
        new Date(dateString).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    const formatTime = (dateString) =>
        new Date(dateString).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

    const getPaymentMethodIcon = (method) => {
        const icons = { CASH: DollarSign, UPI: CreditCard, CARD: CreditCard, NET_BANKING: CreditCard, CHEQUE: FileText };
        return icons[method] || CreditCard;
    };

    const handleViewReceipt = async (payment) => {
        setSelectedReceipt(payment);
        if (payment.receiptUrl) {
            await WebBrowser.openBrowserAsync(payment.receiptUrl);
        }
    };

    const handleShareReceipt = async (payment) => {
        try {
            const message = `🧾 Payment Receipt\n━━━━━━━━━━━━━━━━\nReceipt No: ${payment.receiptNumber}\nDate: ${formatDate(payment.paymentDate)}\nAmount: ${formatCurrency(payment.amount)}\nMethod: ${payment.paymentMethod}\nStatus: ${payment.status}\n\nStudent: ${childData.name}\nSchool: ${userData?.school?.name || 'School'}\n\nThank you for your payment!`.trim();
            await Share.share({ message, title: 'Payment Receipt' });
        } catch (error) {
            Alert.alert('Error', 'Failed to share receipt');
        }
    };

    const handleDownloadReceipt = async (payment) => {
        try {
            setIsDownloading(true);
            const receiptContent = `Payment Receipt\n━━━━━━━━━━━━━━━━━━━━━━━━\nReceipt No: ${payment.receiptNumber}\nDate: ${formatDate(payment.paymentDate)} ${formatTime(payment.paymentDate)}\n\nStudent: ${childData.name}\nAmount: ${formatCurrency(payment.amount)}\nMethod: ${payment.paymentMethod}\nStatus: ${payment.status}\n\nThank you for your payment!`.trim();
            const fileName = `receipt_${payment.receiptNumber}.txt`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;
            await FileSystem.writeAsStringAsync(fileUri, receiptContent);
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(fileUri, { mimeType: 'text/plain', dialogTitle: 'Save Receipt', UTI: 'public.plain-text' });
            } else {
                Alert.alert('Success', `Receipt saved to ${fileName}`);
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to download receipt');
        } finally {
            setIsDownloading(false);
        }
    };

    const summary = {
        totalPayments: payments?.length || 0,
        totalAmount: payments?.reduce((sum, p) => sum + p.amount, 0) || 0,
        lastPayment: payments?.[0],
    };

    const filteredPayments = payments?.filter(payment => {
        if (filterMode === 'ALL') return true;
        if (filterMode === 'CASH') return ['CASH', 'CHEQUE'].includes(payment.paymentMethod);
        if (filterMode === 'ONLINE') return !['CASH', 'CHEQUE'].includes(payment.paymentMethod);
        return true;
    });

    if (!childData) {
        return (
            <SafeAreaView style={styles.container}>
                <EmptyState icon={AlertCircle} title="No Child Selected" subtitle="Please select a child from the home screen" color="#EF4444" />
            </SafeAreaView>
        );
    }

    // ── Donut chart ───────────────────────────────────────────────────────────
    const renderDonutChart = () => {
        if (!studentFee) return null;
        const total = studentFee.originalAmount || 0;
        const paid = studentFee.paidAmount || 0;
        const balance = studentFee.balanceAmount || 0;
        const concession = studentFee.concessionAmount || 0;

        const hasData = total > 0;

        const size = 130;
        const strokeWidth = 24;
        const radius = (size - strokeWidth) / 2;
        const circumference = radius * 2 * Math.PI;
        const gap = 3;

        const paidPercent = total > 0 ? paid / total : 0;
        const balancePercent = total > 0 ? balance / total : 0;
        const conPercent = total > 0 ? concession / total : 0;

        const slices = [];
        let currentOffset = 0;
        if (paidPercent > 0) { slices.push({ color: '#10B981', stroke: Math.max(0, circumference * paidPercent - gap), offset: -currentOffset }); currentOffset += circumference * paidPercent; }
        if (balancePercent > 0) { slices.push({ color: '#EF4444', stroke: Math.max(0, circumference * balancePercent - gap), offset: -currentOffset }); currentOffset += circumference * balancePercent; }
        if (conPercent > 0) { slices.push({ color: '#F59E0B', stroke: Math.max(0, circumference * conPercent - gap), offset: -currentOffset }); }

        return (
            <View style={styles.feeStatusCard}>
                <Text style={styles.feeStatusTitle}>Fee Overview</Text>
                {!hasData ? (
                    <View style={styles.noFeeChartWrap}>
                        <View style={styles.noFeeChartCircle}>
                            <CircleDashed size={40} color="#d1d5db" />
                        </View>
                        <Text style={styles.noFeeChartText}>No fee structure assigned yet</Text>
                        <Text style={styles.noFeeChartSub}>Fee details will appear once assigned by the school</Text>
                    </View>
                ) : (
                    <View style={styles.feeStatusBody}>
                        <View style={styles.chartContainer}>
                            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                                {/* Background ring */}
                                <Circle cx={size / 2} cy={size / 2} r={radius} stroke="#f3f4f6" strokeWidth={strokeWidth} fill="transparent" />
                                {slices.map((slice, i) => (
                                    <Circle
                                        key={i}
                                        cx={size / 2} cy={size / 2} r={radius}
                                        stroke={slice.color}
                                        strokeWidth={strokeWidth}
                                        fill="transparent"
                                        strokeDasharray={`${slice.stroke} ${circumference}`}
                                        strokeDashoffset={slice.offset}
                                        transform={`rotate(-90 ${size / 2} ${size / 2})`}
                                        strokeLinecap="butt"
                                    />
                                ))}
                            </Svg>
                            <View style={styles.chartCenter}>
                                <Text style={styles.chartCenterPct}>{Math.round(paidPercent * 100)}%</Text>
                                <Text style={styles.chartCenterLabel}>paid</Text>
                            </View>
                        </View>
                        <View style={styles.legendContainer}>
                            {[
                                { color: '#3B82F6', label: 'Total', value: total },
                                { color: '#F59E0B', label: 'Con/Dis', value: concession },
                                { color: '#10B981', label: 'Paid', value: paid },
                                { color: '#EF4444', label: 'Balance', value: balance },
                            ].map((item) => (
                                <View key={item.label} style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                                    <View>
                                        <Text style={styles.legendLabel}>{item.label}</Text>
                                        <Text style={styles.legendValue}>{formatCurrency(item.value)}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}
            </View>
        );
    };

    const renderStamp = (status) => {
        const configs = {
            PAID: { borderColor: '#10B981', icon: <BadgeCheck size={18} color="#10B981" />, text: 'PAID', textColor: '#10B981' },
            PARTIAL: { borderColor: '#F59E0B', icon: <Hourglass size={14} color="#F59E0B" />, text: 'PARTIAL', textColor: '#F59E0B' },
        };
        const cfg = configs[status] || { borderColor: '#EF4444', icon: <Hourglass size={14} color="#EF4444" />, text: 'DUE', textColor: '#EF4444' };
        return (
            <View style={[styles.circularStamp, { borderColor: cfg.borderColor }]}>
                {cfg.icon}
                <Text style={[styles.stampText, { color: cfg.textColor }]}>{cfg.text}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}><ArrowLeft size={24} color="#111" /></View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Payment History</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {/* Tabs */}
            <View style={styles.tabsContainer}>
                {['DETAILS', 'RECEIPTS'].map((tab) => (
                    <HapticTouchable key={tab} onPress={() => setActiveTab(tab)} style={styles.tabInput}>
                        <View style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}>
                            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                                {tab === 'DETAILS' ? 'Fee Details' : 'Receipts'}
                            </Text>
                        </View>
                    </HapticTouchable>
                ))}
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: activeTab === 'DETAILS' ? insets.bottom + 100 : insets.bottom + 24 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {activeTab === 'DETAILS' ? (
                    feeLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                            <Text style={styles.loadingText}>Loading fee details…</Text>
                        </View>
                    ) : !studentFee ? (
                        <EmptyState
                            icon={Wallet}
                            title="No Fee Assigned"
                            subtitle="Fee details will appear here once assigned by the school"
                            color="#0469ff"
                        />
                    ) : (
                        <Animated.View entering={FadeInDown.delay(100)}>
                            {renderDonutChart()}

                            {/* Fee Details header */}
                            <View style={styles.feeDetailsHeader}>
                                <Text style={styles.feeDetailsTitle}>
                                    Installment Schedule {studentFee.globalFeeStructure?.mode ? `(${studentFee.globalFeeStructure.mode})` : ''}
                                </Text>
                            </View>

                            {/* No installments fallback */}
                            {(!studentFee.installments || studentFee.installments.length === 0) ? (
                                <EmptyState
                                    icon={Calendar}
                                    title="No Installments"
                                    subtitle="Installment schedule has not been set up yet"
                                    color="#3B82F6"
                                />
                            ) : (
                                studentFee.installments.map((inst) => {
                                    const dueDate = new Date(inst.dueDate);
                                    const monthName = dueDate.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
                                    const balance = inst.amount - inst.paidAmount;
                                    return (
                                        <View key={inst.id} style={styles.installmentCardWrap}>
                                            <View style={styles.monthCol}>
                                                <Text style={styles.monthColText}>{monthName}</Text>
                                            </View>
                                            <View style={styles.installmentCardContent}>
                                                <View style={styles.installmentRowTop}>
                                                    <View style={[styles.instDataBox, { borderColor: '#EF4444' }]}>
                                                        <Text style={styles.instDataLabel}>Due</Text>
                                                        <Text style={styles.instDataValue}>{formatCurrency(inst.amount)}</Text>
                                                    </View>
                                                    <View style={[styles.instDataBox, { borderColor: '#10B981' }]}>
                                                        <Text style={styles.instDataLabel}>Paid</Text>
                                                        <Text style={styles.instDataValue}>{formatCurrency(inst.paidAmount)}</Text>
                                                    </View>
                                                </View>
                                                {balance > 0 && (
                                                    <View style={[styles.balanceBox, { borderColor: '#3B82F6', backgroundColor: '#EEF4FF' }]}>
                                                        <Text style={styles.balanceText}>Balance {formatCurrency(balance)}</Text>
                                                    </View>
                                                )}
                                                {inst.paidDate && (
                                                    <Text style={styles.paidDateText}>Paid on {formatDate(inst.paidDate)}</Text>
                                                )}
                                            </View>
                                            <View style={styles.stampCol}>
                                                {renderStamp(inst.status)}
                                                {inst.paidAmount > 0 && (
                                                    <HapticTouchable onPress={() => setActiveTab('RECEIPTS')} style={styles.instReceiptBtn}>
                                                        <LinearGradient colors={['#3b82f6', '#2563eb']} style={styles.instReceiptIcon}>
                                                            <FileText size={12} color="#fff" />
                                                        </LinearGradient>
                                                    </HapticTouchable>
                                                )}
                                            </View>
                                        </View>
                                    );
                                })
                            )}
                        </Animated.View>
                    )
                ) : (
                    paymentsLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                            <Text style={styles.loadingText}>Loading receipts…</Text>
                        </View>
                    ) : !payments || payments.length === 0 ? (
                        <EmptyState
                            icon={Receipt}
                            title="No Payments Yet"
                            subtitle="Your payment receipts will appear here once you make a payment"
                            color="#0469ff"
                        />
                    ) : (
                        <>
                            {/* Summary cards */}
                            <Animated.View entering={FadeInDown.delay(100)}>
                                <View style={styles.summaryGrid}>
                                    <View style={[styles.summaryCard, { backgroundColor: '#EEF4FF' }]}>
                                        <View style={styles.summaryIconBg}><FileText size={18} color="#0469ff" /></View>
                                        <Text style={[styles.summaryValue, { color: '#0469ff' }]}>{summary.totalPayments}</Text>
                                        <Text style={styles.summaryLabel}>Payments</Text>
                                    </View>
                                    <View style={[styles.summaryCard, { backgroundColor: '#D1FAE5' }]}>
                                        <View style={[styles.summaryIconBg, { backgroundColor: '#A7F3D0' }]}><TrendingUp size={18} color="#10B981" /></View>
                                        <Text style={[styles.summaryValue, { color: '#10B981' }]}>{formatCurrency(summary.totalAmount)}</Text>
                                        <Text style={styles.summaryLabel}>Total Paid</Text>
                                    </View>
                                </View>
                            </Animated.View>

                            {/* Last payment */}
                            {summary.lastPayment && (
                                <Animated.View entering={FadeInDown.delay(160)}>
                                    <View style={styles.lastPaymentCard}>
                                        <View style={styles.lastPaymentLeft}>
                                            <View style={styles.lastPaymentIconBg}>
                                                <CheckCircle size={20} color="#10B981" />
                                            </View>
                                            <View>
                                                <Text style={styles.lastPaymentLabel}>Last Payment</Text>
                                                <Text style={styles.lastPaymentDate}>{formatDate(summary.lastPayment.paymentDate)}</Text>
                                            </View>
                                        </View>
                                        <Text style={styles.lastPaymentAmount}>{formatCurrency(summary.lastPayment.amount)}</Text>
                                    </View>
                                </Animated.View>
                            )}

                            {/* Filter + list */}
                            <Animated.View entering={FadeInDown.delay(220)}>
                                <View style={styles.sectionHeader}>
                                    <Text style={styles.sectionTitle}>All Transactions</Text>
                                    <Text style={styles.sectionCount}>{filteredPayments?.length || 0}</Text>
                                </View>

                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
                                    {['ALL', 'ONLINE', 'CASH'].map((mode) => (
                                        <HapticTouchable key={mode} onPress={() => setFilterMode(mode)}>
                                            <View style={[styles.filterChip, filterMode === mode && styles.filterChipActive]}>
                                                <Text style={[styles.filterChipText, filterMode === mode && styles.filterChipTextActive]}>
                                                    {mode === 'ALL' ? 'All' : mode === 'CASH' ? 'Cash/Cheque' : 'Online'}
                                                </Text>
                                            </View>
                                        </HapticTouchable>
                                    ))}
                                </ScrollView>

                                {filteredPayments?.length === 0 ? (
                                    <EmptyState
                                        icon={Receipt}
                                        title="No transactions found"
                                        subtitle={`No ${filterMode.toLowerCase()} transactions to show`}
                                        color="#888"
                                    />
                                ) : (
                                    filteredPayments?.map((payment, index) => {
                                        const MethodIcon = getPaymentMethodIcon(payment.paymentMethod);
                                        return (
                                            <Animated.View key={payment.id} entering={FadeInRight.delay(280 + index * 50)}>
                                                <HapticTouchable onPress={() => handleViewReceipt(payment)}>
                                                    <View style={styles.paymentCard}>
                                                        <View style={[styles.paymentIconBg, { backgroundColor: '#EEF4FF' }]}>
                                                            <MethodIcon size={20} color="#0469ff" />
                                                        </View>
                                                        <View style={styles.paymentInfo}>
                                                            <Text style={styles.paymentReceipt}>{payment.receiptNumber}</Text>
                                                            <View style={styles.paymentMeta}>
                                                                <Calendar size={11} color="#888" />
                                                                <Text style={styles.paymentDate}>{formatDate(payment.paymentDate)}</Text>
                                                                <View style={styles.methodChip}>
                                                                    <Text style={styles.methodChipText}>{payment.paymentMethod}</Text>
                                                                </View>
                                                            </View>
                                                        </View>
                                                        <View style={styles.paymentRight}>
                                                            <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                                                            <View style={styles.paidChip}>
                                                                <CheckCircle size={10} color="#10B981" />
                                                                <Text style={styles.paidChipText}>Paid</Text>
                                                            </View>
                                                        </View>
                                                        <ChevronRight size={16} color="#ccc" />
                                                    </View>
                                                </HapticTouchable>
                                            </Animated.View>
                                        );
                                    })
                                )}
                            </Animated.View>
                        </>
                    )
                )}
            </ScrollView>

            {/* Sticky footer for fee details */}
            {activeTab === 'DETAILS' && studentFee && studentFee.originalAmount > 0 && (
                <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + 4 }]}>
                    <View style={styles.footerRow}>
                        <View style={[styles.footerBox, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={styles.footerBoxLabel}>Total</Text>
                            <Text style={styles.footerBoxValue}>{formatCurrency(studentFee.originalAmount)}</Text>
                        </View>
                        <Text style={styles.footerMinus}>–</Text>
                        <View style={[styles.footerBox, { backgroundColor: '#D1FAE5' }]}>
                            <Text style={styles.footerBoxLabel}>Paid</Text>
                            <Text style={styles.footerBoxValue}>{formatCurrency(studentFee.paidAmount)}</Text>
                        </View>
                    </View>
                    <View style={styles.footerBalance}>
                        <Text style={styles.footerBalanceText}>Balance Due  {formatCurrency(studentFee.balanceAmount)}</Text>
                    </View>
                </View>
            )}

            {/* Receipt modal */}
            <Modal
                visible={receiptModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setReceiptModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Animated.View entering={SlideInUp.springify()} style={styles.receiptModal}>
                        <View style={styles.modalHandle} />
                        <View style={styles.receiptHeader}>
                            <Text style={styles.receiptTitle}>Payment Receipt</Text>
                            <HapticTouchable onPress={() => setReceiptModalVisible(false)}>
                                <View style={styles.receiptCloseBtn}><X size={20} color="#666" /></View>
                            </HapticTouchable>
                        </View>

                        <ScrollView style={styles.receiptContent} showsVerticalScrollIndicator={false}>
                            {selectedReceipt && (
                                <>
                                    <View style={styles.receiptNumberCard}>
                                        <View style={styles.receiptIconBg}><Receipt size={28} color="#0469ff" /></View>
                                        <Text style={styles.receiptNumber}>{selectedReceipt.receiptNumber}</Text>
                                        <View style={styles.receiptStatusBadge}>
                                            <CheckCircle size={14} color="#10B981" />
                                            <Text style={styles.receiptStatusText}>{selectedReceipt.status}</Text>
                                        </View>
                                    </View>

                                    {[
                                        {
                                            title: 'Payment Details', rows: [
                                                ['Amount Paid', formatCurrency(selectedReceipt.amount)],
                                                ['Date', formatDate(selectedReceipt.paymentDate)],
                                                ['Time', formatTime(selectedReceipt.paymentDate)],
                                                ['Method', selectedReceipt.paymentMethod],
                                                ['Mode', selectedReceipt.paymentMode],
                                                selectedReceipt.transactionId && ['Transaction ID', selectedReceipt.transactionId],
                                            ].filter(Boolean)
                                        },
                                        {
                                            title: 'Student Details', rows: [
                                                ['Name', childData.name],
                                                ['Class', childData.class?.className],
                                                ['Admission No', childData.admissionNo],
                                            ]
                                        },
                                    ].map((section) => (
                                        <View key={section.title} style={styles.receiptSection}>
                                            <Text style={styles.receiptSectionTitle}>{section.title}</Text>
                                            {section.rows.map(([label, value]) => (
                                                <View key={label} style={styles.receiptRow}>
                                                    <Text style={styles.receiptLabel}>{label}</Text>
                                                    <Text style={styles.receiptValue}>{value}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    ))}

                                    {selectedReceipt.installmentPayments?.length > 0 && (
                                        <View style={styles.receiptSection}>
                                            <Text style={styles.receiptSectionTitle}>Installments Paid</Text>
                                            {selectedReceipt.installmentPayments.map((ip, idx) => (
                                                <View key={idx} style={styles.receiptRow}>
                                                    <Text style={styles.receiptLabel}>Installment {ip.installment.installmentNumber}</Text>
                                                    <Text style={styles.receiptValue}>{formatCurrency(ip.amount)}</Text>
                                                </View>
                                            ))}
                                            <View style={[styles.receiptRow, { borderTopWidth: 1, borderTopColor: '#f0f0f0', marginTop: 8, paddingTop: 8 }]}>
                                                <Text style={styles.receiptTotalLabel}>Total</Text>
                                                <Text style={styles.receiptTotalValue}>{formatCurrency(selectedReceipt.amount)}</Text>
                                            </View>
                                        </View>
                                    )}

                                    <View style={styles.receiptFooter}>
                                        <Text style={styles.receiptFooterText}>Computer-generated receipt · Thank you!</Text>
                                    </View>
                                </>
                            )}
                        </ScrollView>

                        <View style={styles.receiptActions}>
                            <HapticTouchable onPress={() => handleShareReceipt(selectedReceipt)} style={{ flex: 1 }}>
                                <View style={styles.actionButton}>
                                    <Share2 size={18} color="#0469ff" />
                                    <Text style={styles.actionButtonText}>Share</Text>
                                </View>
                            </HapticTouchable>
                            <HapticTouchable onPress={() => handleDownloadReceipt(selectedReceipt)} style={{ flex: 1 }} disabled={isDownloading}>
                                <LinearGradient colors={['#0469ff', '#0347b8']} style={styles.actionButtonPrimary}>
                                    {isDownloading ? <ActivityIndicator color="#fff" size="small" /> : <><Download size={18} color="#fff" /><Text style={styles.actionButtonPrimaryText}>Download</Text></>}
                                </LinearGradient>
                            </HapticTouchable>
                        </View>
                    </Animated.View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loaderContainer: { paddingVertical: 56, alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, color: '#888' },

    // Header
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },

    // Tabs
    tabsContainer: { flexDirection: 'row', backgroundColor: '#f5f5f5', borderRadius: 12, padding: 4, margin: 16, marginBottom: 8 },
    tabInput: { flex: 1 },
    tabItem: { paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
    tabItemActive: { backgroundColor: '#fff', borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
    tabText: { fontSize: 14, fontWeight: '600', color: '#888' },
    tabTextActive: { color: '#0469ff' },

    content: { flex: 1, paddingHorizontal: 16 },

    // Fee status card
    feeStatusCard: { backgroundColor: '#f4f7ff', borderRadius: 18, padding: 18, marginBottom: 16, marginTop: 8 },
    feeStatusTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 16 },
    feeStatusBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chartContainer: { alignItems: 'center', justifyContent: 'center', position: 'relative' },
    chartCenter: { position: 'absolute', alignItems: 'center' },
    chartCenterPct: { fontSize: 20, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
    chartCenterLabel: { fontSize: 11, color: '#888', fontWeight: '500' },
    legendContainer: { gap: 10, paddingLeft: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    legendDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
    legendLabel: { fontSize: 12, color: '#666' },
    legendValue: { fontSize: 13, fontWeight: '700', color: '#111' },

    // No fee chart empty state
    noFeeChartWrap: { alignItems: 'center', paddingVertical: 20, gap: 10 },
    noFeeChartCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
    noFeeChartText: { fontSize: 14, fontWeight: '600', color: '#666' },
    noFeeChartSub: { fontSize: 12, color: '#999', textAlign: 'center', paddingHorizontal: 20 },

    // Fee details
    feeDetailsHeader: { backgroundColor: '#0469ff', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
    feeDetailsTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },

    // Installment cards
    installmentCardWrap: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#f0f0f0', overflow: 'hidden' },
    monthCol: { backgroundColor: '#f1f5f9', width: 44, alignItems: 'center', justifyContent: 'center' },
    monthColText: { transform: [{ rotate: '-90deg' }], fontSize: 11, fontWeight: '700', color: '#64748b', width: 56, textAlign: 'center' },
    installmentCardContent: { flex: 1, padding: 12 },
    installmentRowTop: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    instDataBox: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, alignItems: 'center' },
    instDataLabel: { fontSize: 11, fontWeight: '700', color: '#666', marginBottom: 2 },
    instDataValue: { fontSize: 13, fontWeight: '700', color: '#111' },
    balanceBox: { borderWidth: 1, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
    balanceText: { fontSize: 12, fontWeight: '700', color: '#1d4ed8' },
    paidDateText: { fontSize: 11, fontStyle: 'italic', color: '#10B981', marginTop: 5 },
    stampCol: { width: 68, alignItems: 'center', justifyContent: 'center', paddingRight: 8, gap: 6 },
    circularStamp: { width: 56, height: 56, borderRadius: 28, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', gap: 1 },
    stampText: { fontSize: 7, fontWeight: '900', textAlign: 'center', textTransform: 'uppercase' },
    instReceiptBtn: {},
    instReceiptIcon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

    // Receipts tab
    summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 14, marginTop: 8 },
    summaryCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', gap: 6 },
    summaryIconBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
    summaryValue: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    summaryLabel: { fontSize: 11, color: '#666', fontWeight: '500' },

    lastPaymentCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f0fdf4', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#bbf7d0' },
    lastPaymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    lastPaymentIconBg: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center' },
    lastPaymentLabel: { fontSize: 12, color: '#666', fontWeight: '500' },
    lastPaymentDate: { fontSize: 13, color: '#111', fontWeight: '600', marginTop: 2 },
    lastPaymentAmount: { fontSize: 20, fontWeight: '800', color: '#10B981', letterSpacing: -0.3 },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
    sectionCount: { fontSize: 13, color: '#666', backgroundColor: '#f5f5f5', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },

    filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e5e7eb' },
    filterChipActive: { backgroundColor: '#0469ff', borderColor: '#0469ff' },
    filterChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
    filterChipTextActive: { color: '#fff' },

    paymentCard: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 10, gap: 12 },
    paymentIconBg: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
    paymentInfo: { flex: 1 },
    paymentReceipt: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 4 },
    paymentMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    paymentDate: { fontSize: 12, color: '#888' },
    methodChip: { backgroundColor: '#EEF4FF', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
    methodChipText: { fontSize: 10, fontWeight: '600', color: '#0469ff' },
    paymentRight: { alignItems: 'flex-end', gap: 5 },
    paymentAmount: { fontSize: 15, fontWeight: '700', color: '#111' },
    paidChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#D1FAE5', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
    paidChipText: { fontSize: 10, fontWeight: '700', color: '#10B981' },

    // Sticky footer
    stickyFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
    footerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
    footerBox: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
    footerBoxLabel: { fontSize: 12, fontWeight: '600', color: '#666' },
    footerBoxValue: { fontSize: 15, fontWeight: '800', color: '#111', marginTop: 2 },
    footerMinus: { fontSize: 22, fontWeight: '800', color: '#111', marginHorizontal: 12 },
    footerBalance: { backgroundColor: '#0469ff', paddingVertical: 13, alignItems: 'center', marginHorizontal: 16, borderRadius: 12 },
    footerBalanceText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    receiptModal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    modalHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginTop: 10, marginBottom: 4 },
    receiptHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    receiptTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    receiptCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    receiptContent: { flex: 1, padding: 20 },
    receiptNumberCard: { alignItems: 'center', padding: 20, backgroundColor: '#f8f9fa', borderRadius: 16, marginBottom: 20 },
    receiptIconBg: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    receiptNumber: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 8 },
    receiptStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#D1FAE5', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
    receiptStatusText: { fontSize: 12, fontWeight: '700', color: '#10B981' },
    receiptSection: { marginBottom: 16, padding: 14, backgroundColor: '#f8f9fa', borderRadius: 12 },
    receiptSectionTitle: { fontSize: 13, fontWeight: '700', color: '#111', marginBottom: 10 },
    receiptRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
    receiptLabel: { fontSize: 13, color: '#666' },
    receiptValue: { fontSize: 13, fontWeight: '600', color: '#111' },
    receiptTotalLabel: { fontSize: 14, fontWeight: '700', color: '#111' },
    receiptTotalValue: { fontSize: 16, fontWeight: '700', color: '#0469ff' },
    receiptFooter: { alignItems: 'center', marginVertical: 16 },
    receiptFooterText: { fontSize: 12, color: '#999' },
    receiptActions: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
    actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, backgroundColor: '#f8f9fa', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
    actionButtonText: { fontSize: 14, fontWeight: '600', color: '#0469ff' },
    actionButtonPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12 },
    actionButtonPrimaryText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});