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
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
    FadeInDown,
    FadeInRight,
    FadeIn,
    SlideInRight,
} from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';
import { Modal } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export default function PaymentHistoryScreen() {
    const params = useLocalSearchParams();
    const childData = params.childData ? JSON.parse(params.childData) : null;
    console.log(childData);

    const [refreshing, setRefreshing] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState(null);
    const [receiptModalVisible, setReceiptModalVisible] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [filterMode, setFilterMode] = useState('ALL'); // 'ALL' | 'ONLINE' | 'CASH'

    const queryClient = useQueryClient();

    // Load user data
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;

    // Fetch academic years
    const { data: academicYears } = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId,
        select: (data) => data?.find(y => y.isActive),
    });

    // Fetch payment history
    const { data: payments, isLoading } = useQuery({
        queryKey: ['payment-history', childData?.studentId, academicYears?.id],
        queryFn: async () => {
            const params = new URLSearchParams({
                parentId: childData.parentId,
                studentId: childData.studentId,
                academicYearId: academicYears.id,
            });
            const res = await api.get(`schools/fee/parent/payment-history?${params}`);
            return res.data;
        },
        enabled: !!childData && !!academicYears,
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['payment-history']);
        setRefreshing(false);
    }, []);

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(amount || 0);
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    };

    const formatTime = (dateString) => {
        return new Date(dateString).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getPaymentMethodIcon = (method) => {
        const icons = {
            CASH: DollarSign,
            UPI: CreditCard,
            CARD: CreditCard,
            NET_BANKING: CreditCard,
            CHEQUE: FileText,
        };
        return icons[method] || CreditCard;
    };

    const handleViewReceipt = async (payment) => {
        setSelectedReceipt(payment);
        // setReceiptModalVisible(true);
        console.log(selectedReceipt.receiptUrl);

        await WebBrowser.openBrowserAsync(selectedReceipt.receiptUrl);

    };

    const handleShareReceipt = async (payment) => {
        try {
            const message = `
🧾 Payment Receipt
━━━━━━━━━━━━━━━━
Receipt No: ${payment.receiptNumber}
Date: ${formatDate(payment.paymentDate)}
Amount: ${formatCurrency(payment.amount)}
Method: ${payment.paymentMethod}
Status: ${payment.status}

Student: ${childData.name}
School: ${userData?.school?.name || 'School'}

Thank you for your payment!
      `.trim();

            if (Platform.OS === 'android') {
                await Share.share({
                    message,
                    title: 'Payment Receipt',
                });
            } else {
                await Share.share({
                    message,
                });
            }
        } catch (error) {
            console.error('Share error:', error);
            Alert.alert('Error', 'Failed to share receipt');
        }
    };

    const handleDownloadReceipt = async (payment) => {
        try {
            setIsDownloading(true);

            // Generate receipt content
            const receiptContent = `
Payment Receipt
━━━━━━━━━━━━━━━━━━━━━━━━

Receipt No: ${payment.receiptNumber}
Date: ${formatDate(payment.paymentDate)} ${formatTime(payment.paymentDate)}
━━━━━━━━━━━━━━━━━━━━━━━━

Student Details:
Name: ${childData.name}
Class: ${childData.class?.className}
Admission No: ${childData.admissionNo}

Payment Details:
Amount: ${formatCurrency(payment.amount)}
Method: ${payment.paymentMethod}
Mode: ${payment.paymentMode}
Status: ${payment.status}

Installments Paid:
${payment.installmentPayments?.map((ip, idx) =>
                `${idx + 1}. Installment ${ip.installment.installmentNumber} - ${formatCurrency(ip.amount)}`
            ).join('\n') || 'N/A'}

Total Amount: ${formatCurrency(payment.amount)}

━━━━━━━━━━━━━━━━━━━━━━━━
This is a computer-generated receipt.
Thank you for your payment!
      `.trim();

            const fileName = `receipt_${payment.receiptNumber}.txt`;
            const fileUri = `${FileSystem.documentDirectory}${fileName}`;

            await FileSystem.writeAsStringAsync(fileUri, receiptContent);

            // Share the file
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(fileUri, {
                    mimeType: 'text/plain',
                    dialogTitle: 'Save Receipt',
                    UTI: 'public.plain-text',
                });
            } else {
                Alert.alert('Success', `Receipt saved to ${fileName}`);
            }
        } catch (error) {
            console.error('Download error:', error);
            Alert.alert('Error', 'Failed to download receipt');
        } finally {
            setIsDownloading(false);
        }
    };

    // Calculate summary
    const summary = {
        totalPayments: payments?.length || 0,
        totalAmount: payments?.reduce((sum, p) => sum + p.amount, 0) || 0,
        lastPayment: payments?.[0],
    };

    // Filter payments
    const filteredPayments = payments?.filter(payment => {
        if (filterMode === 'ALL') return true;
        if (filterMode === 'CASH') return ['CASH', 'CHEQUE'].includes(payment.paymentMethod);
        if (filterMode === 'ONLINE') return !['CASH', 'CHEQUE'].includes(payment.paymentMethod);
        return true;
    });

    if (!childData) {
        return (
            <View style={styles.loaderContainer}>
                <Text style={styles.noDataText}>No child selected</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={[styles.header, Platform.OS === 'ios' ? { paddingTop: 60 } : { paddingTop: 20 }]}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Payment History</Text>
                    <Text style={styles.headerSubtitle}>
                        {childData.name} {childData.class?.className}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                    />
                }
            >
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                    </View>
                ) : !payments || payments.length === 0 ? (
                    <Animated.View entering={FadeInDown.delay(300)} style={styles.noDataCard}>
                        <Receipt size={64} color="#ccc" />
                        <Text style={styles.noDataText}>No payment history yet</Text>
                        <Text style={styles.noDataSubtext}>
                            Payments will appear here once made
                        </Text>
                    </Animated.View>
                ) : (
                    <>
                        {/* Summary Cards */}
                        <Animated.View entering={FadeInDown.delay(200)}>
                            <View style={styles.summaryGrid}>
                                <LinearGradient
                                    colors={['#3B82F6', '#2563EB']}
                                    style={styles.summaryCard}
                                >
                                    <FileText size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>{summary.totalPayments}</Text>
                                    <Text style={styles.summaryLabel}>Total Payments</Text>
                                </LinearGradient>

                                <LinearGradient
                                    colors={['#51CF66', '#37B24D']}
                                    style={styles.summaryCard}
                                >
                                    <DollarSign size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>
                                        {formatCurrency(summary.totalAmount)}
                                    </Text>
                                    <Text style={styles.summaryLabel}>Total Paid</Text>
                                </LinearGradient>
                            </View>
                        </Animated.View>
                        {/* Last Payment Card */}
                        {summary.lastPayment && (
                            <Animated.View entering={FadeInDown.delay(300)}>
                                <View style={styles.lastPaymentCard}>
                                    <View style={styles.lastPaymentHeader}>
                                        <CheckCircle size={20} color="#51CF66" />
                                        <Text style={styles.lastPaymentTitle}>Last Payment</Text>
                                    </View>
                                    <View style={styles.lastPaymentBody}>
                                        <Text style={styles.lastPaymentAmount}>
                                            {formatCurrency(summary.lastPayment.amount)}
                                        </Text>
                                        <Text style={styles.lastPaymentDate}>
                                            {formatDate(summary.lastPayment.paymentDate)}
                                        </Text>
                                    </View>
                                </View>
                            </Animated.View>
                        )}
                        {/* Payments List */}
                        <Animated.View entering={FadeInDown.delay(400)}>
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>All Payments</Text>
                            </View>

                            {/* Filter Tabs */}
                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
                            >
                                {['ALL', 'ONLINE', 'CASH'].map((mode) => (
                                    <HapticTouchable key={mode} onPress={() => setFilterMode(mode)}>
                                        <View style={[
                                            styles.filterChip,
                                            filterMode === mode && styles.filterChipActive
                                        ]}>
                                            <Text style={[
                                                styles.filterChipText,
                                                filterMode === mode && styles.filterChipTextActive
                                            ]}>
                                                {mode === 'ALL' ? 'All Transactions' : mode === 'CASH' ? 'Cash/Cheque' : 'Online'}
                                            </Text>
                                        </View>
                                    </HapticTouchable>
                                ))}
                            </ScrollView>

                            {filteredPayments?.map((payment, index) => {
                                const MethodIcon = getPaymentMethodIcon(payment.paymentMethod);

                                return (
                                    <Animated.View
                                        key={payment.id}
                                        entering={FadeInRight.delay(500 + index * 50)}
                                    >
                                        <HapticTouchable onPress={() => handleViewReceipt(payment)}>
                                            <View style={styles.paymentCard}>
                                                <View style={styles.paymentLeft}>
                                                    <View style={styles.paymentIconContainer}>
                                                        <LinearGradient
                                                            colors={['#E3F2FD', '#BBDEFB']}
                                                            style={styles.paymentIcon}
                                                        >
                                                            <MethodIcon size={20} color="#0469ff" />
                                                        </LinearGradient>
                                                    </View>

                                                    <View style={styles.paymentInfo}>
                                                        <Text style={styles.paymentReceipt}>
                                                            {payment.receiptNumber}
                                                        </Text>
                                                        <View style={styles.paymentMeta}>
                                                            <Calendar size={12} color="#666" />
                                                            <Text style={styles.paymentDate}>
                                                                {formatDate(payment.paymentDate)}
                                                            </Text>
                                                        </View>
                                                        <Text style={styles.paymentMethod}>
                                                            {payment.paymentMethod}
                                                        </Text>
                                                    </View>
                                                </View>

                                                <View style={styles.paymentRight}>
                                                    <Text style={styles.paymentAmount}>
                                                        {formatCurrency(payment.amount)}
                                                    </Text>
                                                    <View style={styles.statusBadge}>
                                                        <CheckCircle size={12} color="#51CF66" />
                                                        <Text style={styles.statusText}>
                                                            {payment.status}
                                                        </Text>
                                                    </View>
                                                    <ChevronRight size={16} color="#999" />
                                                </View>
                                            </View>
                                        </HapticTouchable>
                                    </Animated.View>
                                );
                            })}
                        </Animated.View>

                        <View style={{ height: 40 }} />
                    </>
                )}
            </ScrollView>

            {/* Receipt Modal */}
            <Modal
                visible={receiptModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setReceiptModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Animated.View
                        entering={SlideInRight.springify()}
                        style={styles.receiptModal}
                    >
                        {/* Modal Header */}
                        <View style={styles.receiptHeader}>
                            <Text style={styles.receiptTitle}>Payment Receipt</Text>
                            <HapticTouchable onPress={() => setReceiptModalVisible(false)}>
                                <X size={24} color="#666" />
                            </HapticTouchable>
                        </View>

                        <ScrollView style={styles.receiptContent}>
                            {selectedReceipt && (
                                <>
                                    {/* Receipt Number */}
                                    <View style={styles.receiptNumberCard}>
                                        <Receipt size={32} color="#0469ff" />
                                        <Text style={styles.receiptNumber}>
                                            {selectedReceipt.receiptNumber}
                                        </Text>
                                        <View style={styles.receiptStatusBadge}>
                                            <CheckCircle size={16} color="#51CF66" />
                                            <Text style={styles.receiptStatusText}>
                                                {selectedReceipt.status}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Payment Details */}
                                    <View style={styles.receiptSection}>
                                        <Text style={styles.receiptSectionTitle}>
                                            Payment Details
                                        </Text>
                                        <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Amount Paid</Text>
                                            <Text style={styles.receiptValue}>
                                                {formatCurrency(selectedReceipt.amount)}
                                            </Text>
                                        </View>
                                        <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Payment Date</Text>
                                            <Text style={styles.receiptValue}>
                                                {formatDate(selectedReceipt.paymentDate)}
                                            </Text>
                                        </View>
                                        <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Payment Time</Text>
                                            <Text style={styles.receiptValue}>
                                                {formatTime(selectedReceipt.paymentDate)}
                                            </Text>
                                        </View>
                                        <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Payment Method</Text>
                                            <Text style={styles.receiptValue}>
                                                {selectedReceipt.paymentMethod}
                                            </Text>
                                        </View>
                                        <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Payment Mode</Text>
                                            <Text style={styles.receiptValue}>
                                                {selectedReceipt.paymentMode}
                                            </Text>
                                        </View>
                                        {selectedReceipt.transactionId && (
                                            <View style={styles.receiptRow}>
                                                <Text style={styles.receiptLabel}>Transaction ID</Text>
                                                <Text style={styles.receiptValue}>
                                                    {selectedReceipt.transactionId}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Student Details */}
                                    <View style={styles.receiptSection}>
                                        <Text style={styles.receiptSectionTitle}>
                                            Student Details
                                        </Text>
                                        <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Name</Text>
                                            <Text style={styles.receiptValue}>{childData.name}</Text>
                                        </View>
                                        <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Class</Text>
                                            <Text style={styles.receiptValue}>
                                                {childData.class?.className}
                                            </Text>
                                        </View>
                                        <View style={styles.receiptRow}>
                                            <Text style={styles.receiptLabel}>Admission No</Text>
                                            <Text style={styles.receiptValue}>
                                                {childData.admissionNo}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Installments Paid */}
                                    {selectedReceipt.installmentPayments &&
                                        selectedReceipt.installmentPayments.length > 0 && (
                                            <View style={styles.receiptSection}>
                                                <Text style={styles.receiptSectionTitle}>
                                                    Installments Paid
                                                </Text>
                                                {selectedReceipt.installmentPayments.map((ip, idx) => (
                                                    <View key={idx} style={styles.installmentRow}>
                                                        <View style={styles.installmentLeft}>
                                                            <View style={styles.installmentBadge}>
                                                                <Text style={styles.installmentBadgeText}>
                                                                    {ip.installment.installmentNumber}
                                                                </Text>
                                                            </View>
                                                            <Text style={styles.installmentText}>
                                                                Installment {ip.installment.installmentNumber}
                                                            </Text>
                                                        </View>
                                                        <Text style={styles.installmentAmount}>
                                                            {formatCurrency(ip.amount)}
                                                        </Text>
                                                    </View>
                                                ))}
                                                <View style={styles.receiptDivider} />
                                                <View style={styles.receiptRow}>
                                                    <Text style={styles.receiptTotalLabel}>Total</Text>
                                                    <Text style={styles.receiptTotalValue}>
                                                        {formatCurrency(selectedReceipt.amount)}
                                                    </Text>
                                                </View>
                                            </View>
                                        )}

                                    {/* Footer */}
                                    <View style={styles.receiptFooter}>
                                        <Text style={styles.receiptFooterText}>
                                            This is a computer-generated receipt
                                        </Text>
                                        <Text style={styles.receiptFooterSubtext}>
                                            Thank you for your payment!
                                        </Text>
                                    </View>
                                </>
                            )}
                        </ScrollView>

                        {/* Action Buttons */}
                        <View style={styles.receiptActions}>
                            <HapticTouchable
                                onPress={() => handleShareReceipt(selectedReceipt)}
                                style={{ flex: 1 }}
                            >
                                <View style={styles.actionButton}>
                                    <Share2 size={20} color="#0469ff" />
                                    <Text style={styles.actionButtonText}>Share</Text>
                                </View>
                            </HapticTouchable>

                            <HapticTouchable
                                onPress={() => handleDownloadReceipt(selectedReceipt)}
                                style={{ flex: 1 }}
                                disabled={isDownloading}
                            >
                                <LinearGradient
                                    colors={['#0469ff', '#0347b8']}
                                    style={styles.actionButtonPrimary}
                                >
                                    {isDownloading ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <>
                                            <Download size={20} color="#fff" />
                                            <Text style={styles.actionButtonPrimaryText}>
                                                Download
                                            </Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </HapticTouchable>
                        </View>
                    </Animated.View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
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
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
    content: { flex: 1, padding: 16 },
    loadingContainer: { padding: 40, alignItems: 'center' },
    noDataCard: { padding: 60, alignItems: 'center', gap: 12 },
    noDataText: { fontSize: 18, fontWeight: '600', color: '#999' },
    noDataSubtext: { fontSize: 14, color: '#ccc', textAlign: 'center' },
    summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    summaryCard: {
        flex: 1,
        padding: 20,
        borderRadius: 16,
        alignItems: 'center',
        gap: 8,
    },
    summaryValue: { fontSize: 20, fontWeight: '700', color: '#fff' },
    summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
    lastPaymentCard: {
        padding: 16,
        backgroundColor: '#E7F5E9',
        borderRadius: 12,
        marginBottom: 20,
    },
    lastPaymentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    lastPaymentTitle: { fontSize: 14, fontWeight: '600', color: '#666' },
    lastPaymentBody: { alignItems: 'center' },
    lastPaymentAmount: { fontSize: 28, fontWeight: '700', color: '#111' },
    lastPaymentDate: { fontSize: 14, color: '#666', marginTop: 4 },
    sectionHeader: { marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    paymentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
    },
    paymentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    paymentIconContainer: {},
    paymentIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    paymentInfo: { flex: 1, gap: 4 },
    paymentReceipt: { fontSize: 14, fontWeight: '600', color: '#111' },
    paymentMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    paymentDate: { fontSize: 12, color: '#666' },
    paymentMethod: {
        fontSize: 11,
        color: '#0469ff',
        backgroundColor: '#E3F2FD',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        alignSelf: 'flex-start',
    },
    paymentRight: { alignItems: 'flex-end', gap: 6 },
    paymentAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#E7F5E9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: { fontSize: 11, fontWeight: '600', color: '#51CF66' },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    receiptModal: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '90%',
    },
    receiptHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    receiptTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
    receiptContent: { flex: 1, padding: 20 },
    receiptNumberCard: {
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        marginBottom: 24,
    },
    receiptNumber: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
        marginTop: 12,
    },
    receiptStatusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
        backgroundColor: '#E7F5E9',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    receiptStatusText: { fontSize: 13, fontWeight: '600', color: '#51CF66' },
    receiptSection: {
        marginBottom: 24,
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
    },
    receiptSectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111',
        marginBottom: 12,
    },
    receiptRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
    },
    receiptLabel: { fontSize: 13, color: '#666' },
    receiptValue: { fontSize: 13, fontWeight: '600', color: '#111' },
    installmentRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    installmentLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    installmentBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#0469ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    installmentBadgeText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#fff',
    },
    installmentText: { fontSize: 13, color: '#666' },
    installmentAmount: { fontSize: 13, fontWeight: '600', color: '#111' },
    receiptDivider: {
        height: 1,
        backgroundColor: '#e5e7eb',
        marginVertical: 12,
    },
    receiptTotalLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
    receiptTotalValue: { fontSize: 18, fontWeight: '700', color: '#0469ff' },
    receiptFooter: { alignItems: 'center', marginTop: 24, marginBottom: 16 },
    receiptFooterSubtext: {
        fontSize: 11,
        color: '#ccc',
        marginTop: 4,
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    filterChipActive: {
        backgroundColor: '#0469ff',
        borderColor: '#0469ff',
    },
    filterChipText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
    },
    filterChipTextActive: {
        color: '#fff',
    },

    receiptActions: {
        flexDirection: 'row',
        gap: 12,
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    actionButtonText: { fontSize: 15, fontWeight: '600', color: '#0469ff' },
    actionButtonPrimary: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        borderRadius: 12,
    },
    actionButtonPrimaryText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
});