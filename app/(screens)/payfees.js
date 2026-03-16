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
  Receipt,
  Info,
  X,
  ArrowRight,
  Sparkles,
  TrendingUp,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight, FadeIn } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';
import RazorpayCheckout from 'react-native-razorpay';
import PaymentWebView from '../components/PaymentWebView';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function PayFeesScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const childData = params.childData ? JSON.parse(params.childData) : null;

  const [refreshing, setRefreshing] = useState(false);
  const [selectedInstallments, setSelectedInstallments] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPaymentWebView, setShowPaymentWebView] = useState(false);
  const [paymentData, setPaymentData] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';
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

  const { data: academicYear, isLoading: academicYearLoading } = useQuery({
    queryKey: ['academic-year-fees', schoolId],
    queryFn: async () => {
      const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
      return res.data?.find(y => y.isActive);
    },
    enabled: !!schoolId,
    refetchOnMount: 'always',
    staleTime: 1000 * 60 * 5,
  });

  const { data: studentFee, isLoading: feeLoading } = useQuery({
    queryKey: ['student-fee', childData?.studentId, academicYear?.id],
    queryFn: async () => {
      const res = await api.get(`/schools/fee/students/${childData.studentId}?academicYearId=${academicYear.id}`);
      return res.data;
    },
    enabled: !!childData && !!academicYear?.id,
    staleTime: 1000 * 60 * 2,
    refetchOnMount: 'always',
  });

  const { data: schoolDetails } = useQuery({
    queryKey: ['school-details', schoolId],
    queryFn: async () => {
      const res = await api.get(`/schools/get-school/${schoolId}`);
      return res.data?.school;
    },
    enabled: !!schoolId,
    staleTime: Infinity,
  });

  const paymentMutation = useMutation({
    mutationFn: async (paymentData) => {
      const res = await api.post('/schools/fee/payments/record-offline', paymentData);
      return res.data;
    },
    onSuccess: (data) => {
      Alert.alert(
        'Payment Successful! 🎉',
        `Receipt: ${data.payment.receiptNumber}\nAmount: ₹${data.payment.amount}\nNew Balance: ₹${data.newBalance}`,
        [
          { text: 'View Receipt', onPress: () => console.log('View receipt:', data.payment.receiptNumber) },
          { text: 'OK', onPress: () => { queryClient.invalidateQueries(['student-fee']); setSelectedInstallments([]); } }
        ]
      );
    },
    onError: (error) => {
      Alert.alert('Payment Failed', error.response?.data?.error || error.message || 'Something went wrong.');
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries(['student-fee']);
    setRefreshing(false);
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  const getStatusConfig = (status) => {
    const configs = {
      PAID: { color: '#10B981', icon: CheckCircle, bg: '#D1FAE5', label: 'Paid' },
      PENDING: { color: '#3B82F6', icon: Clock, bg: '#DBEAFE', label: 'Pending' },
      PARTIAL: { color: '#F59E0B', icon: Clock, bg: '#FEF3C7', label: 'Partial' },
      OVERDUE: { color: '#EF4444', icon: AlertCircle, bg: '#FEE2E2', label: 'Overdue' },
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
    Alert.alert(
      'Confirm Payment',
      `Pay ₹${totalPaymentAmount.toLocaleString()} for ${selectedInstallments.length} installment(s) online?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay Now', onPress: createOrder }
      ]
    );
  };

  const createOrder = async () => {
    setIsProcessing(true);
    try {
      const installmentPayload = studentFee.installments
        .filter(i => selectedInstallments.includes(i.id))
        .map(i => ({ id: i.id, amount: i.amount - i.paidAmount }));

      const res = await api.post('/payment/initiate', {
        studentFeeId: studentFee.id,
        studentId: childData.studentId,
        schoolId,
        amount: totalPaymentAmount,
        installments: installmentPayload,
        paymentMode: 'ONLINE',
      });

      const result = res.data;
      if (result.success) {
        if (result.type === 'RAZORPAY') {
          setPendingOrder({
            type: 'RAZORPAY',
            keyId: result.keyId,
            order: result.order,
            orderId: result.orderId,
            amount: result.order.amount,
            currency: result.order.currency,
            schoolName: 'EduBreezy',
            description: `Fee Payment - ${childData.name}`,
            image: 'https://edubreezy.com/web-app-manifest-192x192.png',
            prefill: {
              email: userData?.email || 'test@example.com',
              contact: userData?.phone || '9999999999',
              name: childData.name
            },
            theme: { color: '#0469ff' }
          });
          setShowConfirmation(true);
        } else if (result.type === 'REDIRECT') {
          setPaymentData({ redirectUrl: result.redirectUrl, params: result.params, method: result.method, orderId: result.orderId });
          setShowPaymentWebView(true);
        } else if (result.type === 'UPI_COLLECT') {
          Alert.alert('UPI Payment', result.message || 'Please approve payment in your UPI app');
        }
      } else {
        Alert.alert('Error', result.error || 'Failed to initiate payment');
      }
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to initiate payment');
    } finally {
      setIsProcessing(false);
    }
  };

  const proceedToPayment = () => {
    setShowConfirmation(false);
    if (!pendingOrder) return;
    setIsProcessing(true);
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
    setTimeout(() => {
      RazorpayCheckout.open(options)
        .then(async (data) => { await handlePaymentComplete('SUCCESS', data); })
        .catch((error) => {
          setIsProcessing(false);
          if (error.code !== 0) Alert.alert('Payment Failed', error.description || 'Something went wrong.');
        });
    }, 500);
  };

  const handlePaymentComplete = async (status, data) => {
    setShowPaymentWebView(false);
    setPaymentData(null);
    if (status === 'SUCCESS') {
      if (data?.razorpay_signature) {
        try {
          const verifyRes = await api.post('/payment/razorpay/verify', data);
          if (verifyRes.data.success) {
            queryClient.invalidateQueries(['student-fee']);
            setSelectedInstallments([]);
            Alert.alert('Payment Successful! 🎉', `Receipt: ${verifyRes.data.payment?.receiptNumber || 'Generated'}\nAmount: ${formatCurrency(verifyRes.data.payment?.amount)}\n\nYour transaction has been recorded successfully.`, [{ text: 'OK' }]);
          } else {
            Alert.alert('Verification Failed', 'Payment verification failed. Please contact support.');
          }
        } catch (error) {
          Alert.alert('Verification Error', error.response?.data?.error || 'Failed to verify payment');
        } finally {
          setIsProcessing(false);
        }
      } else {
        Alert.alert('Payment Successful! 🎉', 'Your payment has been processed successfully.');
        queryClient.invalidateQueries(['student-fee']);
        setSelectedInstallments([]);
        setIsProcessing(false);
      }
    } else {
      setIsProcessing(false);
      if (status === 'FAILED') {
        Alert.alert('Payment Failed', (data?.description) || 'The payment could not be completed.');
      }
    }
  };

  // ── Progress bar ──────────────────────────────────────────────────────────
  const paidPct = studentFee
    ? Math.round((studentFee.paidAmount / studentFee.originalAmount) * 100) || 0
    : 0;

  if (!childData) {
    return (
      <SafeAreaView style={styles.loaderContainer}>
        <AlertCircle size={48} color="#999" />
        <Text style={styles.noFeeText}>No child selected</Text>
        <HapticTouchable onPress={() => router.back()}>
          <View style={styles.backButtonCenter}><Text style={styles.backButtonText}>Go Back</Text></View>
        </HapticTouchable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <HapticTouchable onPress={() => router.back()}>
          <View style={styles.backButton}><ArrowLeft size={24} color="#111" /></View>
        </HapticTouchable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Fee Payment</Text>
          <Text style={styles.headerSubtitle}>{childData.name} · {academicYear?.name || 'Current Session'}</Text>
        </View>
        <View style={{ width: 40 }} />
      </Animated.View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
      >
        {(feeLoading || academicYearLoading) ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#0469ff" />
            <Text style={styles.loadingText}>Loading fee details…</Text>
          </View>
        ) : !studentFee ? (
          <Animated.View entering={FadeInDown.delay(200)} style={styles.noFeeCard}>
            <AlertCircle size={48} color="#ccc" />
            <Text style={styles.noFeeText}>No fee assigned yet</Text>
          </Animated.View>
        ) : (
          <>
            {/* ── Hero summary card ───────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.delay(80).duration(500)}>
              <LinearGradient
                colors={['#0469ff', '#0347b8']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.heroCard}
              >
                {/* Decorative circles */}
                <View style={styles.heroCircle1} />
                <View style={styles.heroCircle2} />

                <View style={styles.heroTop}>
                  <View>
                    <Text style={styles.heroLabel}>Total Fee</Text>
                    <Text style={styles.heroAmount}>{formatCurrency(studentFee.originalAmount)}</Text>
                  </View>
                  <View style={styles.heroBadge}>
                    <Sparkles size={14} color="#fff" />
                    <Text style={styles.heroBadgeText}>{academicYear?.name || 'AY'}</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={styles.progressWrap}>
                  <View style={styles.progressTrack}>
                    <Animated.View
                      entering={FadeIn.delay(400).duration(600)}
                      style={[styles.progressFill, { width: `${paidPct}%` }]}
                    />
                  </View>
                  <Text style={styles.progressPct}>{paidPct}% paid</Text>
                </View>

                {/* Paid / Due row */}
                <View style={styles.heroRow}>
                  <View style={styles.heroStat}>
                    <CheckCircle size={14} color="rgba(255,255,255,0.7)" />
                    <View>
                      <Text style={styles.heroStatLabel}>Paid</Text>
                      <Text style={styles.heroStatValue}>{formatCurrency(studentFee.paidAmount)}</Text>
                    </View>
                  </View>
                  <View style={styles.heroDivider} />
                  <View style={styles.heroStat}>
                    <AlertCircle size={14} color="rgba(255,255,255,0.7)" />
                    <View>
                      <Text style={styles.heroStatLabel}>Balance Due</Text>
                      <Text style={[styles.heroStatValue, studentFee.balanceAmount > 0 && { color: '#FCA5A5' }]}>
                        {formatCurrency(studentFee.balanceAmount)}
                      </Text>
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </Animated.View>

            {/* Online payment disabled notice */}
            {!studentFee.paymentOptions?.onlineEnabled && (
              <Animated.View entering={FadeInDown.delay(160).duration(400)}>
                <View style={styles.infoCard}>
                  <View style={styles.infoIconBg}><Info size={16} color="#F59E0B" /></View>
                  <View style={styles.infoContent}>
                    <Text style={styles.infoTitle}>Online Payment Unavailable</Text>
                    <Text style={styles.infoText}>Please visit the school office to make payments.</Text>
                  </View>
                </View>
              </Animated.View>
            )}

            {/* ── Payment Schedule ────────────────────────────────────────── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Payment Schedule</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{studentFee.installments?.length} installments</Text>
              </View>
            </View>

            <Animated.View entering={FadeInDown.delay(240).duration(500)} style={styles.tableContainer}>
              {/* Table header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thCell, styles.colMonth]}>#</Text>
                <Text style={[styles.thCell, styles.colDue]}>Due</Text>
                <Text style={[styles.thCell, styles.colAmount]}>Amount</Text>
                <Text style={[styles.thCell, styles.colStatus]}>Status</Text>
                <Text style={[styles.thCell, styles.colSelect]}> </Text>
              </View>

              {studentFee.installments?.map((inst, index, arr) => {
                const sc = getStatusConfig(inst.status);
                const isSelected = selectedInstallments.includes(inst.id);
                const canSelect = inst.status !== 'PAID' && inst.paidAmount < inst.amount;
                const dueDate = new Date(inst.dueDate);
                const currentYear = new Date().getFullYear();
                const isNextYear = dueDate.getFullYear() > currentYear;
                const prevDueDate = index > 0 ? new Date(arr[index - 1].dueDate) : null;
                const isFirstNextYear = isNextYear && (!prevDueDate || prevDueDate.getFullYear() <= currentYear);
                const monthName = dueDate.toLocaleDateString('en-IN', { month: 'short' });

                return (
                  <View key={inst.id}>
                    {isFirstNextYear && (
                      <View style={styles.yearSeparator}>
                        <View style={styles.yearLine} />
                        <View style={styles.yearBadge}>
                          <Text style={styles.yearBadgeText}>{dueDate.getFullYear()}</Text>
                        </View>
                        <View style={styles.yearLine} />
                      </View>
                    )}

                    <HapticTouchable onPress={() => canSelect && toggleInstallment(inst.id)} disabled={!canSelect}>
                      <View style={[
                        styles.tableRow,
                        index % 2 === 1 && styles.tableRowAlt,
                        inst.status === 'PAID' && styles.tableRowPaid,
                        inst.isOverdue && styles.tableRowOverdue,
                        isSelected && styles.tableRowSelected,
                      ]}>
                        {/* # + month */}
                        <View style={[styles.tdCell, styles.colMonth]}>
                          <View style={[styles.instBadge, { backgroundColor: sc.bg }]}>
                            <Text style={[styles.instBadgeNum, { color: sc.color }]}>{inst.installmentNumber}</Text>
                          </View>
                          <Text style={styles.instMonth}>{monthName}</Text>
                        </View>

                        {/* Due date */}
                        <Text style={[styles.tdCell, styles.colDue, styles.cellText]}>
                          {dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          {isNextYear ? ` '${dueDate.getFullYear().toString().slice(-2)}` : ''}
                        </Text>

                        {/* Amount */}
                        <Text style={[styles.tdCell, styles.colAmount, styles.amountText]}>
                          {formatCurrency(inst.amount)}
                        </Text>

                        {/* Status */}
                        <View style={[styles.tdCell, styles.colStatus]}>
                          <View style={[styles.statusChip, { backgroundColor: sc.bg }]}>
                            <Text style={[styles.statusChipText, { color: sc.color }]}>{sc.label}</Text>
                          </View>
                        </View>

                        {/* Checkbox */}
                        <View style={[styles.tdCell, styles.colSelect]}>
                          {canSelect ? (
                            <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                              {isSelected && <CheckCircle size={13} color="#fff" />}
                            </View>
                          ) : (
                            <CheckCircle size={18} color="#10B981" />
                          )}
                        </View>
                      </View>
                    </HapticTouchable>
                  </View>
                );
              })}
            </Animated.View>

            {/* ── Fee Components ──────────────────────────────────────────── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Fee Components</Text>
            </View>

            <Animated.View entering={FadeInDown.delay(320).duration(500)} style={styles.componentsList}>
              {studentFee.particulars?.map((p, idx) => {
                const sc = getStatusConfig(p.status);
                const pct = Math.round((p.paidAmount / p.amount) * 100) || 0;
                return (
                  <View key={p.id} style={[styles.componentCard, idx < studentFee.particulars.length - 1 && styles.componentBorder]}>
                    <View style={styles.componentLeft}>
                      <Text style={styles.componentName}>{p.name}</Text>
                      <View style={styles.componentProgressRow}>
                        <View style={styles.componentTrack}>
                          <View style={[styles.componentFill, {
                            width: `${pct}%`,
                            backgroundColor: sc.color,
                          }]} />
                        </View>
                        <Text style={[styles.componentPct, { color: sc.color }]}>{pct}%</Text>
                      </View>
                      <Text style={styles.componentMeta}>
                        Paid {formatCurrency(p.paidAmount)} of {formatCurrency(p.amount)}
                      </Text>
                    </View>
                    <View style={styles.componentRight}>
                      <Text style={styles.componentAmount}>{formatCurrency(p.amount)}</Text>
                      <View style={[styles.statusChip, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.statusChipText, { color: sc.color }]}>{sc.label}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </Animated.View>
          </>
        )}
      </ScrollView>

      {/* ── Floating pay button ─────────────────────────────────────────────── */}
      {studentFee && studentFee.balanceAmount > 0 && (
        <View style={[styles.floatingBar, { paddingBottom: insets.bottom + 8 }]}>
          {studentFee.paymentOptions?.onlineEnabled ? (
            <HapticTouchable
              onPress={handlePayment}
              disabled={isProcessing || selectedInstallments.length === 0}
            >
              <LinearGradient
                colors={selectedInstallments.length > 0 ? ['#0469ff', '#0347b8'] : ['#94a3b8', '#64748b']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.payBtn}
              >
                <View style={styles.payBtnLeft}>
                  {isProcessing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <CreditCard size={22} color="#fff" />
                  }
                  <View>
                    <Text style={styles.payBtnLabel}>
                      {selectedInstallments.length > 0
                        ? `Pay ${selectedInstallments.length} Installment${selectedInstallments.length > 1 ? 's' : ''}`
                        : 'Select installments to pay'}
                    </Text>
                    <Text style={styles.payBtnAmount}>
                      {formatCurrency(selectedInstallments.length > 0 ? totalPaymentAmount : studentFee.balanceAmount)}
                    </Text>
                  </View>
                </View>
                <View style={styles.payBtnArrow}>
                  <ArrowRight size={20} color="#fff" />
                </View>
              </LinearGradient>
            </HapticTouchable>
          ) : (
            <View style={styles.payBtnDisabled}>
              <View style={styles.payBtnLeft}>
                <CreditCard size={22} color="#9CA3AF" />
                <View>
                  <Text style={styles.payBtnLabelDisabled}>Online Payment Disabled</Text>
                  <Text style={styles.payBtnAmountDisabled}>Due: {formatCurrency(studentFee.balanceAmount)}</Text>
                </View>
              </View>
              <View style={styles.disabledDot}><AlertCircle size={16} color="#F59E0B" /></View>
            </View>
          )}
        </View>
      )}

      {/* Payment WebView */}
      <PaymentWebView
        visible={showPaymentWebView}
        paymentData={paymentData}
        onClose={() => { setShowPaymentWebView(false); setPaymentData(null); }}
        onPaymentComplete={handlePaymentComplete}
        apiBaseUrl={API_BASE_URL}
      />

      {/* Confirmation overlay */}
      {showConfirmation && (
        <View style={styles.overlay}>
          <Animated.View entering={FadeInDown.duration(300)} style={styles.confirmCard}>
            {/* Handle */}
            <View style={styles.confirmHandle} />

            <View style={styles.confirmHeader}>
              <Text style={styles.confirmTitle}>Confirm Payment</Text>
              <HapticTouchable onPress={() => setShowConfirmation(false)}>
                <View style={styles.confirmClose}><X size={20} color="#666" /></View>
              </HapticTouchable>
            </View>

            <View style={styles.confirmBody}>
              {/* Logo + school */}
              <View style={styles.confirmSchoolRow}>
                {pendingOrder?.image && (
                  <Image source={{ uri: pendingOrder.image }} style={styles.confirmLogo} />
                )}
                <Text style={styles.confirmSchoolName}>{pendingOrder?.schoolName}</Text>
              </View>

              <View style={styles.confirmDivider} />

              {/* Order details */}
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Order ID</Text>
                <Text style={styles.confirmValue} numberOfLines={1}>{pendingOrder?.orderId || '...'}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Student</Text>
                <Text style={styles.confirmValue}>{childData?.name}</Text>
              </View>

              <View style={styles.confirmDivider} />

              <View style={styles.confirmRow}>
                <Text style={styles.confirmTotalLabel}>Total Amount</Text>
                <Text style={styles.confirmTotalValue}>{formatCurrency(totalPaymentAmount)}</Text>
              </View>

              <View style={styles.secureBadge}>
                <Text style={styles.secureText}>🔒 Secure Payment via Razorpay</Text>
              </View>
            </View>

            <View style={styles.confirmFooter}>
              <HapticTouchable onPress={proceedToPayment}>
                <LinearGradient colors={['#0469ff', '#0347b8']} style={styles.confirmPayBtn}>
                  <Text style={styles.confirmPayBtnText}>Proceed to Pay</Text>
                  <ArrowRight size={20} color="#fff" />
                </LinearGradient>
              </HapticTouchable>
            </View>
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: '#fff' },
  backButtonCenter: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#0469ff', borderRadius: 12 },
  backButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff',
  },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  headerSubtitle: { fontSize: 13, color: '#888', marginTop: 2 },

  content: { flex: 1, paddingHorizontal: 16 },
  loadingContainer: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#888' },
  noFeeCard: { paddingVertical: 60, alignItems: 'center', gap: 12 },
  noFeeText: { fontSize: 16, color: '#999' },

  // Hero card
  heroCard: {
    borderRadius: 24, padding: 20, marginTop: 16, marginBottom: 16,
    overflow: 'hidden',
  },
  heroCircle1: { position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)' },
  heroCircle2: { position: 'absolute', bottom: -40, left: -30, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.05)' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  heroAmount: { fontSize: 28, fontWeight: '800', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  heroBadgeText: { fontSize: 12, color: '#fff', fontWeight: '600' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  progressTrack: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  progressPct: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600', minWidth: 52, textAlign: 'right' },
  heroRow: { flexDirection: 'row', alignItems: 'center' },
  heroStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  heroStatValue: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Info card
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#FFFBEB', borderRadius: 14, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 16 },
  infoIconBg: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },
  infoContent: { flex: 1 },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  infoText: { fontSize: 12, color: '#B45309', marginTop: 2 },

  // Section header
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  sectionBadge: { backgroundColor: '#EEF4FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  sectionBadgeText: { fontSize: 12, fontWeight: '600', color: '#0469ff' },

  // Table
  tableContainer: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 20 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#0469ff', paddingVertical: 12, paddingHorizontal: 12 },
  thCell: { fontSize: 11, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', alignItems: 'center', backgroundColor: '#fff' },
  tableRowAlt: { backgroundColor: '#fafafa' },
  tableRowPaid: { opacity: 0.55, backgroundColor: '#f0fdf4' },
  tableRowOverdue: { backgroundColor: '#fff5f5', borderLeftWidth: 3, borderLeftColor: '#EF4444' },
  tableRowSelected: { backgroundColor: '#EEF4FF', borderLeftWidth: 3, borderLeftColor: '#0469ff' },
  tdCell: { alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 12, color: '#374151', textAlign: 'center', fontWeight: '500' },
  amountText: { fontSize: 13, fontWeight: '700', color: '#111', textAlign: 'center' },
  colMonth: { flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 6 },
  colDue: { flex: 1.1 },
  colAmount: { flex: 1.2 },
  colStatus: { flex: 1.1 },
  colSelect: { flex: 0.5 },
  instBadge: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  instBadgeNum: { fontSize: 12, fontWeight: '700' },
  instMonth: { fontSize: 12, color: '#374151', fontWeight: '600' },
  statusChip: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 },
  statusChipText: { fontSize: 10, fontWeight: '700' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#0469ff', borderColor: '#0469ff' },

  // Year separator
  yearSeparator: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#f8fafc' },
  yearLine: { flex: 1, height: 1.5, backgroundColor: '#e5e7eb' },
  yearBadge: { backgroundColor: '#0469ff', paddingHorizontal: 14, paddingVertical: 4, borderRadius: 12, marginHorizontal: 10 },
  yearBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Fee components
  componentsList: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 20, overflow: 'hidden' },
  componentCard: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  componentBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  componentLeft: { flex: 1, gap: 6 },
  componentName: { fontSize: 14, fontWeight: '600', color: '#111' },
  componentProgressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  componentTrack: { flex: 1, height: 5, backgroundColor: '#f3f4f6', borderRadius: 3, overflow: 'hidden' },
  componentFill: { height: '100%', borderRadius: 3 },
  componentPct: { fontSize: 11, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  componentMeta: { fontSize: 11, color: '#888' },
  componentRight: { alignItems: 'flex-end', gap: 6 },
  componentAmount: { fontSize: 15, fontWeight: '700', color: '#111' },

  // Floating bar
  floatingBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  payBtn: { borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20 },
  payBtnLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  payBtnLabel: { fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  payBtnAmount: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 1, letterSpacing: -0.3 },
  payBtnArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  payBtnDisabled: { borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16, paddingHorizontal: 20 },
  payBtnLabelDisabled: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  payBtnAmountDisabled: { fontSize: 18, fontWeight: '700', color: '#6B7280', marginTop: 2 },
  disabledDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' },

  // Confirmation overlay
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  confirmCard: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  confirmHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e0e0e0', alignSelf: 'center', marginTop: 10, marginBottom: 6 },
  confirmHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  confirmClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  confirmBody: { padding: 24 },
  confirmSchoolRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  confirmLogo: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f5f5f5' },
  confirmSchoolName: { fontSize: 16, fontWeight: '700', color: '#111' },
  confirmDivider: { height: 1, backgroundColor: '#f0f0f0', marginBottom: 16 },
  confirmRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  confirmLabel: { fontSize: 14, color: '#888' },
  confirmValue: { fontSize: 14, fontWeight: '600', color: '#111', maxWidth: '60%', textAlign: 'right' },
  confirmTotalLabel: { fontSize: 16, fontWeight: '700', color: '#111' },
  confirmTotalValue: { fontSize: 22, fontWeight: '800', color: '#0469ff', letterSpacing: -0.5 },
  secureBadge: { backgroundColor: '#f0fdf4', borderRadius: 10, paddingVertical: 8, alignItems: 'center', marginTop: 16 },
  secureText: { fontSize: 12, color: '#16A34A', fontWeight: '600' },
  confirmFooter: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 4 },
  confirmPayBtn: { borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, gap: 10 },
  confirmPayBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});