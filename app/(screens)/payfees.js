import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Modal,
  Image
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  DollarSign,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  CreditCard,
  ArrowLeft,
  ChevronDown,
  Receipt,
  Info,
  X,
  ArrowRight
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';
import RazorpayCheckout from 'react-native-razorpay';
import PaymentWebView from '../components/PaymentWebView';

export default function PayFeesScreen() {
  const params = useLocalSearchParams();
  const childData = params.childData ? JSON.parse(params.childData) : null;

  const [refreshing, setRefreshing] = useState(false);
  const [selectedInstallments, setSelectedInstallments] = useState([]);
  const [expandedInstallment, setExpandedInstallment] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Payment WebView state
  const [showPaymentWebView, setShowPaymentWebView] = useState(false);
  const [paymentData, setPaymentData] = useState(null);

  // Payment Confirmation Modal State
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);

  // API base URL for payment
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

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


  // Fetch active academic year - ensure fresh fetch on mount
  const { data: academicYear, isLoading: academicYearLoading } = useQuery({
    queryKey: ['academic-year-fees', schoolId],
    queryFn: async () => {
      const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
      return res.data?.find(y => y.isActive);
    },
    enabled: !!schoolId,
    refetchOnMount: 'always', // Always refetch on screen mount to ensure fresh data
    staleTime: 1000 * 60 * 5,
  });

  // Fetch student fee details for active academic year
  const { data: studentFee, isLoading: feeLoading } = useQuery({
    queryKey: ['student-fee', childData?.studentId, academicYear?.id],
    queryFn: async () => {
      const res = await api.get(`/schools/fee/students/${childData.studentId}?academicYearId=${academicYear.id}`);
      return res.data;
    },
    enabled: !!childData && !!academicYear?.id,
    staleTime: 1000 * 60 * 2,
    refetchOnMount: 'always', // Ensure fresh load
  });

  // Fetch school details for branding (name, logo)
  const { data: schoolDetails } = useQuery({
    queryKey: ['school-details', schoolId],
    queryFn: async () => {
      // Endpoint: /api/schools/get-school/[schoolId]
      const res = await api.get(`/schools/get-school/${schoolId}`);
      return res.data?.school;
    },
    enabled: !!schoolId,
    staleTime: Infinity,
  });

  // Payment mutation
  const paymentMutation = useMutation({
    mutationFn: async (paymentData) => {
      console.log('Submitting payment:', paymentData);

      const res = await api.post('/schools/fee/payments/record-offline', paymentData);

      console.log('Payment response:', res.data);
      return res.data;
    },
    onSuccess: (data) => {
      Alert.alert(
        'Payment Successful! 🎉',
        `Receipt: ${data.payment.receiptNumber}\nAmount: ₹${data.payment.amount}\nNew Balance: ₹${data.newBalance}`,
        [
          {
            text: 'View Receipt',
            onPress: () => {
              // TODO: Navigate to receipt screen
              console.log('View receipt:', data.payment.receiptNumber);
            }
          },
          {
            text: 'OK',
            onPress: () => {
              // Refresh fee data
              queryClient.invalidateQueries(['student-fee']);
              setSelectedInstallments([]);
            }
          }
        ]
      );
    },
    onError: (error) => {
      console.error('Payment error:', error);
      Alert.alert(
        'Payment Failed',
        error.response?.data?.error || error.message || 'Something went wrong. Please try again.'
      );
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(['student-fee']);
    setRefreshing(false);
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const getStatusConfig = (status) => {
    const configs = {
      PAID: { color: '#51CF66', icon: CheckCircle, bg: '#E7F5E9' },
      PENDING: { color: '#3B82F6', icon: Clock, bg: '#E3F2FD' },
      PARTIAL: { color: '#FFB020', icon: Clock, bg: '#FFF9E0' },
      OVERDUE: { color: '#FF6B6B', icon: AlertCircle, bg: '#FFE9E9' },
    };
    return configs[status] || configs.PENDING;
  };

  const toggleInstallment = (installmentId) => {
    setSelectedInstallments(prev =>
      prev.includes(installmentId)
        ? prev.filter(id => id !== installmentId)
        : [...prev, installmentId]
    );
  };

  const totalPaymentAmount = useMemo(() => {
    if (!studentFee?.installments) return 0;
    return studentFee.installments
      .filter(inst => selectedInstallments.includes(inst.id))
      .reduce((sum, inst) => sum + (inst.amount - inst.paidAmount), 0);
  }, [selectedInstallments, studentFee]);

  const handlePayment = () => {
    if (selectedInstallments.length === 0) {
      Alert.alert('No Selection', 'Please select at least one installment to pay');
      return;
    }

    // No need to check isOnlineEnabled - button is only shown when enabled
    Alert.alert(
      'Confirm Payment',
      `Pay ₹${totalPaymentAmount.toLocaleString()} for ${selectedInstallments.length} installment(s) online?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay Now', onPress: createOrder }
      ]
    );
  };

  // Step 1: Create Order (Initiate)
  const createOrder = async () => {
    setIsProcessing(true);

    try {
      const installmentPayload = studentFee.installments
        .filter(i => selectedInstallments.includes(i.id))
        .map(i => ({ id: i.id, amount: i.amount - i.paidAmount }));

      const res = await api.post('/payment/initiate', {
        studentFeeId: studentFee.id,
        studentId: childData.studentId,
        schoolId: schoolId,
        amount: totalPaymentAmount,
        installments: installmentPayload,
        paymentMode: 'ONLINE',
      });

      const result = res.data;

      if (result.success) {
        if (result.type === 'RAZORPAY') {
          // Store order details and show confirmation screen
          setPendingOrder({
            type: 'RAZORPAY',
            keyId: result.keyId,
            order: result.order,
            orderId: result.orderId,
            amount: result.order.amount,
            currency: result.order.currency,
            schoolName: schoolDetails?.name || 'EduBreezy',
            description: `Fee Payment - ${childData.name}`,
            image: schoolDetails?.profilePicture,
            prefill: {
              email: userData?.email || 'test@example.com',
              contact: userData?.phone || '9999999999',
              name: childData.name
            },
            theme: { color: '#0469ff' }
          });
          setShowConfirmation(true);
        } else if (result.type === 'REDIRECT') {
          // Redirect flows (open WebView immediately)
          setPaymentData({
            redirectUrl: result.redirectUrl,
            params: result.params,
            method: result.method,
            orderId: result.orderId,
          });
          setShowPaymentWebView(true);
        } else if (result.type === 'UPI_COLLECT') {
          Alert.alert('UPI Payment', result.message || 'Please approve payment in your UPI app');
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to initiate payment');
      }
    } catch (error) {
      console.error('Payment initiation error:', error);
      Alert.alert('Error', error.response?.data?.error || 'Failed to initiate payment');
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Proceed to Actual Payment (Razorpay)
  const proceedToPayment = () => {
    setShowConfirmation(false);

    if (!pendingOrder) return;

    setIsProcessing(true); // Start loading for payment flow

    const options = {
      description: pendingOrder.description,
      image: pendingOrder.image,
      currency: pendingOrder.currency,
      key: pendingOrder.keyId,
      amount: pendingOrder.amount,
      name: pendingOrder.schoolName,
      order_id: pendingOrder.order.id,
      prefill: pendingOrder.prefill,
      theme: pendingOrder.theme
    };

    // Delay to allowing Modal to fully dismiss before opening new Native UI
    setTimeout(() => {
      RazorpayCheckout.open(options).then(async (data) => {
        // Success: Calls backend verify
        await handlePaymentComplete('SUCCESS', data);
      }).catch((error) => {
        // Failure/Cancel
        console.log("Razorpay Error", error);
        setIsProcessing(false); // Stop loading immediately

        if (error.code === 0) {
          // Just log cancellation, no alert needed usually, or a subtle toast
          console.log('User cancelled payment');
        } else {
          Alert.alert('Payment Failed', error.description || 'Something went wrong.');
        }
      });
    }, 500);
  };

  // Handle payment completion from WebView or Native SDK
  const handlePaymentComplete = async (status, data) => {
    setShowPaymentWebView(false);
    setPaymentData(null);

    if (status === 'SUCCESS') {
      // Check if it's Razorpay verification data
      if (data && data.razorpay_signature) {
        try {
          // Keep isProcessing true (it was true from proceedToPayment)
          const verifyRes = await api.post('/payment/razorpay/verify', data);

          if (verifyRes.data.success) {
            // Success!
            queryClient.invalidateQueries(['student-fee']);
            setSelectedInstallments([]);

            Alert.alert(
              'Payment Successful! 🎉',
              `Receipt: ${verifyRes.data.payment?.receiptNumber || 'Generated'}\nAmount: ${formatCurrency(verifyRes.data.payment?.amount)}\n\nYour transaction has been recorded successfully.`,
              [{ text: 'OK' }]
            );
          } else {
            Alert.alert('Verification Failed', 'Payment verification failed. Please contact support.');
          }
        } catch (error) {
          console.error('Verification error:', error);
          Alert.alert('Verification Error', error.response?.data?.error || 'Failed to verify payment');
        } finally {
          setIsProcessing(false);
        }
      } else {
        // Standard redirect success (already verified via polling/webhook)
        Alert.alert('Payment Successful! 🎉', 'Your payment has been processed successfully.');
        queryClient.invalidateQueries(['student-fee']);
        setSelectedInstallments([]);
        setIsProcessing(false);
      }
    } else {
      // Failed or Cancelled from WebView or other flows
      setIsProcessing(false);
      if (status === 'FAILED') {
        const msg = (data && data.description) ? data.description : 'The payment could not be completed.';
        Alert.alert('Payment Failed', msg);
      }
    }
  };

  if (!childData) {
    return (
      <View style={styles.loaderContainer}>
        <AlertCircle size={48} color="#999" />
        <Text style={styles.noFeeText}>No child selected</Text>
        <HapticTouchable onPress={() => router.back()}>
          <View style={styles.backButtonCenter}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </View>
        </HapticTouchable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <HapticTouchable onPress={() => router.back()}>
          <View style={styles.backButton}>
            <ArrowLeft size={24} color="#111" />
          </View>
        </HapticTouchable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Fee Payment</Text>
          <Text style={styles.headerSubtitle}>
            {childData.name} • {academicYear?.name || 'Current Session'}
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </Animated.View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
        }
      >
        {(feeLoading || academicYearLoading) ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0469ff" />
          </View>
        ) : !studentFee ? (
          <Animated.View entering={FadeInDown.delay(300)} style={styles.noFeeCard}>
            <AlertCircle size={48} color="#999" />
            <Text style={styles.noFeeText}>No fee assigned yet</Text>
          </Animated.View>
        ) : (
          <>
            {/* Summary Cards */}
            <Animated.View entering={FadeInDown.delay(300).duration(500)}>
              <View style={styles.summaryGrid}>
                <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
                  <DollarSign size={24} color="#fff" />
                  <Text style={styles.summaryValue}>{formatCurrency(studentFee.originalAmount)}</Text>
                  <Text style={styles.summaryLabel}>Total Fee</Text>
                </LinearGradient>

                <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
                  <CheckCircle size={24} color="#fff" />
                  <Text style={styles.summaryValue}>{formatCurrency(studentFee.paidAmount)}</Text>
                  <Text style={styles.summaryLabel}>Paid</Text>
                </LinearGradient>

                <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
                  <AlertCircle size={24} color="#fff" />
                  <Text style={styles.summaryValue}>{formatCurrency(studentFee.balanceAmount)}</Text>
                  <Text style={styles.summaryLabel}>Fees (Due)</Text>
                </LinearGradient>
              </View>
            </Animated.View>

            {/* Online Payment Disabled Notice */}
            {!studentFee.paymentOptions?.onlineEnabled && (
              <View style={styles.infoCard}>
                <Info size={18} color="#f59e0b" />
                <View style={styles.infoContent}>
                  <Text style={styles.infoTitle}>Online Payment Not Available</Text>
                  <Text style={styles.infoText}>Please visit the school office to make payments.</Text>
                </View>
              </View>
            )}

            {/* Installments Table */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Payment Schedule</Text>
              <Text style={styles.installmentCount}>{studentFee.installments?.length} Installments</Text>
            </View>

            {/* Table Container */}
            <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.tableContainer}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.colMonth]}>Month</Text>
                <Text style={[styles.tableHeaderCell, styles.colDue]}>Due Date</Text>
                <Text style={[styles.tableHeaderCell, styles.colAmount]}>Amount</Text>
                <Text style={[styles.tableHeaderCell, styles.colStatus]}>Status</Text>
                <Text style={[styles.tableHeaderCell, styles.colSelect]}></Text>
              </View>

              {/* Table Rows */}
              {studentFee.installments?.map((installment, index, arr) => {
                const statusConfig = getStatusConfig(installment.status);
                const isSelected = selectedInstallments.includes(installment.id);
                const canSelect = installment.status !== 'PAID' && installment.paidAmount < installment.amount;
                const dueDate = new Date(installment.dueDate);
                const currentYear = new Date().getFullYear();
                const isNextYear = dueDate.getFullYear() > currentYear;
                const monthName = dueDate.toLocaleDateString('en-IN', { month: 'short' });

                // Check if this is the first next year installment (show separator)
                const prevDueDate = index > 0 ? new Date(arr[index - 1].dueDate) : null;
                const isFirstNextYear = isNextYear && (!prevDueDate || prevDueDate.getFullYear() <= currentYear);

                return (
                  <View key={installment.id}>
                    {/* Year Separator for Next Year */}
                    {isFirstNextYear && (
                      <View style={styles.yearSeparator}>
                        <View style={styles.yearSeparatorLine} />
                        <View style={styles.yearBadge}>
                          <Text style={styles.yearBadgeText}>{dueDate.getFullYear()}</Text>
                        </View>
                        <View style={styles.yearSeparatorLine} />
                      </View>
                    )}

                    <HapticTouchable
                      onPress={() => canSelect && toggleInstallment(installment.id)}
                      disabled={!canSelect}
                    >
                      <View
                        style={[
                          styles.tableRow,
                          index % 2 === 1 && styles.tableRowAlt,
                          installment.status === 'PAID' && styles.tableRowPaid,
                          installment.isOverdue && styles.tableRowOverdue,
                          isSelected && styles.tableRowSelected,
                        ]}
                      >
                        {/* Month Column */}
                        <View style={[styles.tableCell, styles.colMonth]}>
                          <View style={[styles.monthBadge, { backgroundColor: statusConfig.bg }]}>
                            <Text style={[styles.monthNumber, { color: statusConfig.color }]}>
                              {installment.installmentNumber}
                            </Text>
                          </View>
                          <Text style={styles.monthName}>{monthName}</Text>
                        </View>

                        {/* Due Date Column */}
                        <Text style={[styles.tableCell, styles.colDue, styles.cellText]}>
                          {dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{isNextYear ? ` '${dueDate.getFullYear().toString().slice(-2)}` : ''}
                        </Text>

                        {/* Amount Column */}
                        <Text style={[styles.tableCell, styles.colAmount, styles.amountText]}>
                          {formatCurrency(installment.amount)}
                        </Text>

                        {/* Status Column */}
                        <View style={[styles.tableCell, styles.colStatus]}>
                          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                            <Text style={[styles.statusText, { color: statusConfig.color }]}>
                              {installment.status}
                            </Text>
                          </View>
                        </View>

                        {/* Select Column */}
                        <View style={[styles.tableCell, styles.colSelect]}>
                          {canSelect ? (
                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                              {isSelected && <CheckCircle size={14} color="#fff" />}
                            </View>
                          ) : (
                            <CheckCircle size={18} color="#51CF66" />
                          )}
                        </View>
                      </View>
                    </HapticTouchable>
                  </View>
                );
              })}
            </Animated.View>

            {/* Fee Components */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Fee Components</Text>
            </View>
            {studentFee.particulars?.map((particular) => {
              const statusConfig = getStatusConfig(particular.status);
              return (
                <View key={particular.id} style={styles.particularCard}>
                  <View style={styles.particularCardLeft}>
                    <Text style={styles.particularCardName}>{particular.name}</Text>
                    <Text style={styles.particularCardMeta}>
                      Paid: {formatCurrency(particular.paidAmount)} / {formatCurrency(particular.amount)}
                    </Text>
                  </View>
                  <View style={styles.particularCardRight}>
                    <Text style={styles.particularCardAmount}>{formatCurrency(particular.amount)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                      <Text style={[styles.statusText, { color: statusConfig.color }]}>
                        {particular.status}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={{ height: 120 }} />
          </>
        )}
      </ScrollView>

      {/* Floating Payment Button - Always show but disabled when online payment not enabled */}
      {studentFee && studentFee.balanceAmount > 0 && (
        <View style={styles.floatingButton}>
          {studentFee.paymentOptions?.onlineEnabled ? (
            <LinearGradient colors={['#0469ff', '#0347b8']} style={styles.payButton}>
              <HapticTouchable onPress={handlePayment} disabled={isProcessing || selectedInstallments.length === 0}>
                <View style={styles.payButtonContent}>
                  {isProcessing ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <View style={styles.payButtonLeft}>
                        <CreditCard size={24} color="#fff" />
                        <View>
                          <Text style={styles.payButtonLabel}>
                            {selectedInstallments.length > 0
                              ? `Pay ${selectedInstallments.length} Installment(s)`
                              : 'Select Installments to Pay'}
                          </Text>
                          <Text style={styles.payButtonAmount}>
                            {formatCurrency(selectedInstallments.length > 0 ? totalPaymentAmount : studentFee.balanceAmount)}
                          </Text>
                        </View>
                      </View>
                      <Receipt size={24} color="#fff" />
                    </>
                  )}
                </View>
              </HapticTouchable>
            </LinearGradient>
          ) : (
            // Disabled state when online payment not available
            <View style={styles.payButtonDisabled}>
              <View style={styles.payButtonContent}>
                <View style={styles.payButtonLeft}>
                  <CreditCard size={24} color="#999" />
                  <View>
                    <Text style={styles.payButtonLabelDisabled}>Online Payment Disabled</Text>
                    <Text style={styles.payButtonAmountDisabled}>
                      Total Due: {formatCurrency(studentFee.balanceAmount)}
                    </Text>
                  </View>
                </View>
                <View style={styles.disabledBadge}>
                  <AlertCircle size={16} color="#f59e0b" />
                </View>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Payment WebView Modal */}
      <PaymentWebView
        visible={showPaymentWebView}
        paymentData={paymentData}
        onClose={() => { setShowPaymentWebView(false); setPaymentData(null); }}
        onPaymentComplete={handlePaymentComplete}
        apiBaseUrl={API_BASE_URL}
      />

      {/* Confirmation Modal - Replaced with Absolute View to allow Razorpay Native UI 
          to present correctly on top without ViewController hierarchy conflicts */}
      {showConfirmation && (
        <View style={styles.absoluteOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Payment</Text>
              <HapticTouchable onPress={() => setShowConfirmation(false)}>
                <X size={24} color="#666" />
              </HapticTouchable>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.schoolInfo}>
                {pendingOrder?.image && (
                  <Image source={{ uri: pendingOrder.image }} style={styles.schoolLogo} />
                )}
                <Text style={styles.schoolName}>{pendingOrder?.schoolName}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.orderRow}>
                <Text style={styles.orderLabel}>Order ID</Text>
                <Text style={styles.orderValue}>{pendingOrder?.orderId || '...'}</Text>
              </View>

              <View style={styles.orderRow}>
                <Text style={styles.orderLabel}>Student</Text>
                <Text style={styles.orderValue}>{childData?.name}</Text>
              </View>

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>{formatCurrency(totalPaymentAmount)}</Text>
              </View>

              <Text style={styles.secureText}>🔒 Secure Payment via Razorpay</Text>
            </View>

            <View style={styles.modalFooter}>
              <HapticTouchable onPress={proceedToPayment} style={styles.proceedButton}>
                <LinearGradient colors={['#0469ff', '#0347b8']} style={styles.gradientButton}>
                  <Text style={styles.proceedButtonText}>Proceed to Pay</Text>
                  <ArrowRight size={20} color="#fff" />
                </LinearGradient>
              </HapticTouchable>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// Styles remain the same as before
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  backButtonCenter: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#0469ff', borderRadius: 12 },
  backButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  content: { flex: 1, padding: 16 },
  loadingContainer: { padding: 40, alignItems: 'center' },
  noFeeCard: { padding: 40, alignItems: 'center', gap: 12 },
  noFeeText: { fontSize: 16, color: '#999' },
  summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  summaryCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', gap: 8 },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#fff' },
  summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 20 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
  installmentCount: { fontSize: 14, color: '#666', backgroundColor: '#f5f5f5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  installmentCard: { padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, borderWidth: 2, borderColor: 'transparent', marginBottom: 12 },
  paidInstallment: { opacity: 0.6 },
  overdueInstallment: { borderColor: '#FFE9E9', backgroundColor: '#FFF5F5' },
  selectedInstallment: { borderColor: '#0469ff', backgroundColor: '#E3F2FD' },
  installmentMainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  installmentLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  installmentNumber: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  installmentNumberText: { fontSize: 16, fontWeight: '700' },
  installmentInfo: { flex: 1, gap: 4 },
  installmentTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
  installmentMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  installmentDate: { fontSize: 12, color: '#666' },
  installmentRight: { alignItems: 'flex-end', gap: 8 },
  installmentAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#0469ff', borderColor: '#0469ff' },
  expandButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  expandButtonText: { fontSize: 13, fontWeight: '600', color: '#0469ff' },
  particularBreakdown: { marginTop: 8, padding: 12, backgroundColor: '#fff', borderRadius: 8 },
  breakdownTitle: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
  particularRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  particularName: { fontSize: 13, color: '#111', flex: 1 },
  particularAmount: { fontSize: 13, fontWeight: '600', color: '#111' },
  particularDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
  particularTotalLabel: { fontSize: 14, fontWeight: '700', color: '#111' },
  particularTotalAmount: { fontSize: 14, fontWeight: '700', color: '#0469ff' },
  particularCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 8 },
  particularCardLeft: { flex: 1 },
  particularCardName: { fontSize: 14, fontWeight: '600', color: '#111' },
  particularCardMeta: { fontSize: 12, color: '#666', marginTop: 4 },
  particularCardRight: { alignItems: 'flex-end', gap: 6 },
  particularCardAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
  floatingButton: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  payButton: { borderRadius: 16, overflow: 'hidden' },
  payButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18 },
  payButtonLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  payButtonLabel: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  payButtonAmount: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 2 },

  // Disabled button styles
  payButtonDisabled: { borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  payButtonLabelDisabled: { fontSize: 13, color: '#9ca3af', fontWeight: '600' },
  payButtonAmountDisabled: { fontSize: 18, fontWeight: '700', color: '#6b7280', marginTop: 2 },
  disabledBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' },

  // Info card styles (online payment disabled notice)
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, backgroundColor: '#fffbeb', borderRadius: 12, borderWidth: 1, borderColor: '#fcd34d', marginTop: 12 },
  infoContent: { flex: 1 },
  infoTitle: { fontSize: 14, fontWeight: '600', color: '#92400e', marginBottom: 2 },
  infoText: { fontSize: 13, color: '#a16207' },

  // Enhanced Table styles for installments
  tableContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#1e3a5f',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  tableRowAlt: { backgroundColor: '#f8fafc' },
  tableRowNextYear: { backgroundColor: '#faf5ff', borderLeftWidth: 3, borderLeftColor: '#a855f7' },
  tableRowPaid: { opacity: 0.5, backgroundColor: '#f0fdf4' },
  tableRowOverdue: { backgroundColor: '#fef2f2', borderLeftWidth: 3, borderLeftColor: '#ef4444' },
  tableRowSelected: { backgroundColor: '#eff6ff', borderLeftWidth: 3, borderLeftColor: '#0469ff' },
  tableCell: { alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 13, color: '#374151', textAlign: 'center', fontWeight: '500' },
  amountText: { fontSize: 14, fontWeight: '700', color: '#111', textAlign: 'center' },

  // Column widths (flex ratios)
  colMonth: { flex: 1.3, flexDirection: 'row', alignItems: 'center', gap: 8 },
  colDue: { flex: 1.1 },
  colAmount: { flex: 1.2 },
  colStatus: { flex: 1.1 },
  colSelect: { flex: 0.5 },

  // Month badge in table
  monthBadge: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  monthNumber: { fontSize: 13, fontWeight: '700' },
  monthName: { fontSize: 13, color: '#374151', fontWeight: '600' },

  // Year separator for next year installments
  yearSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
  },
  yearSeparatorLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#e5e7eb',
  },
  yearBadge: {
    backgroundColor: '#0469ff',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 12,
  },
  yearBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Modal Styles
  absoluteOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999, // Ensure it sits on top of everything
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: { backgroundColor: '#fff', borderRadius: 24, width: '100%', maxWidth: 400, overflow: 'hidden', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  modalBody: { padding: 24, alignItems: 'center' },
  schoolInfo: { alignItems: 'center', gap: 12, marginBottom: 20 },
  schoolLogo: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#f5f5f5' },
  schoolName: { fontSize: 16, fontWeight: '600', color: '#111', textAlign: 'center' },
  divider: { height: 1, backgroundColor: '#f0f0f0', width: '100%', marginBottom: 20 },
  orderRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 12 },
  orderLabel: { fontSize: 14, color: '#666' },
  orderValue: { fontSize: 14, fontWeight: '600', color: '#111' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#111' },
  totalValue: { fontSize: 20, fontWeight: '700', color: '#0469ff' },
  secureText: { marginTop: 24, fontSize: 12, color: '#666', flexDirection: 'row', alignItems: 'center' },
  modalFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  proceedButton: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  gradientButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 8 },
  proceedButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});