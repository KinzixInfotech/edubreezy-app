import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Alert, ActivityIndicator, Image, Pressable
} from 'react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CheckCircle, Clock, AlertCircle, CreditCard, ArrowLeft,
  ChevronDown, ChevronUp, Info, X, ArrowRight, Sparkles, Receipt,
  BookOpen, CalendarDays, Tag, Bus
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn, Layout } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';
import RazorpayCheckout from 'react-native-razorpay';
import PaymentWebView from '../components/PaymentWebView';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateReceiptPDF } from '../../lib/utils/receiptGenerator';
import { uploadFile } from '../../lib/uploadthing';

const TYPE_META = {
  MONTHLY: { label: 'Monthly Fees', icon: BookOpen, color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  ANNUAL: { label: 'Annual Fees', icon: CalendarDays, color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  ONE_TIME: { label: 'One-time Fees', icon: Receipt, color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  TERM: { label: 'Term Fees', icon: CalendarDays, color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  PROMOTION: { label: 'Promotion Fees', icon: Tag, color: '#DB2777', bg: '#FDF2F8', border: '#FBCFE8' },
};
const TYPE_ORDER = ['MONTHLY', 'ANNUAL', 'ONE_TIME', 'TERM', 'PROMOTION'];

const STATUS_COLORS = {
  LEDGER_PAID: { color: '#10B981', bg: '#D1FAE5', label: 'Paid' },
  LEDGER_PARTIAL: { color: '#F59E0B', bg: '#FEF3C7', label: 'Partial' },
  LEDGER_UNPAID: { color: '#6B7280', bg: '#F3F4F6', label: 'Unpaid' },
  LEDGER_WAIVED: { color: '#8B5CF6', bg: '#EDE9FE', label: 'Waived' },
  LEDGER_CANCELLED: { color: '#9CA3AF', bg: '#F3F4F6', label: 'Cancelled' },
};

export default function PayFeesScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const childData = params.childData ? JSON.parse(params.childData) : null;

  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState([]);
  const [expandedMonths, setExpandedMonths] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingReceipt, setIsGeneratingReceipt] = useState(false);
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

  const { data: schoolDetails } = useQuery({
    queryKey: ['school-details', schoolId],
    queryFn: async () => {
      const res = await api.get(`/mobile/schools/${schoolId}`);
      return res.data;
    },
    enabled: !!schoolId,
    staleTime: 1000 * 60 * 60, // 1 hour
  });

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

  // Grouping Ledger
  const groupedLedger = useMemo(() => {
    const entries = studentFee?.ledger || [];

    let sessionStartDate = new Date();
    sessionStartDate.setMonth(3); // April
    sessionStartDate.setDate(1);
    sessionStartDate.setHours(0, 0, 0, 0);

    if (studentFee?.session?.startMonth) {
      sessionStartDate = new Date(studentFee.session.startMonth);
      sessionStartDate.setDate(1);
      sessionStartDate.setHours(0, 0, 0, 0);
    } else {
      const validMonths = entries.filter(e => e.month).map(e => new Date(e.month));
      if (validMonths.length > 0) {
        const minDate = new Date(Math.min(...validMonths));
        sessionStartDate = new Date(minDate.getFullYear(), 3, 1);
      }
    }

    const allMonths = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(sessionStartDate);
      d.setMonth(d.getMonth() + i);
      const mKey = d.toISOString().slice(0, 7);
      const mLabel = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      allMonths.push({ key: mKey, label: mLabel, date: d.toISOString(), types: {}, entries: [] });
    }

    const byMonth = {};
    allMonths.forEach(m => { byMonth[m.key] = m; });

    for (const e of entries) {
      let mKey = e.month ? new Date(e.month).toISOString().slice(0, 7) : null;
      if (!mKey) {
        mKey = 'other';
        if (!byMonth[mKey]) byMonth[mKey] = { key: mKey, label: e.monthLabel || 'Other', date: new Date().toISOString(), types: {}, entries: [] };
      } else if (!byMonth[mKey]) {
        const mLabel = new Date(e.month).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        byMonth[mKey] = { key: mKey, label: mLabel, date: e.month, types: {}, entries: [] };
      }
      byMonth[mKey].entries.push(e);
      const cType = e.feeComponent?.type || 'ONE_TIME';
      if (!byMonth[mKey].types[cType]) byMonth[mKey].types[cType] = [];
      byMonth[mKey].types[cType].push(e);
    }
    return Object.values(byMonth).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [studentFee?.ledger]);

  // Auto-expand next unpaid month
  useEffect(() => {
    if (groupedLedger.length > 0) {
      const firstUnpaid = groupedLedger.find(m => m.entries.some(e => ['LEDGER_UNPAID', 'LEDGER_PARTIAL'].includes(e.status)));
      if (firstUnpaid) {
        setExpandedMonths({ [firstUnpaid.key]: true });
      } else {
        setExpandedMonths({ [groupedLedger[0].key]: true });
      }
    }
  }, [groupedLedger]);

  const toggleExpand = (key) => setExpandedMonths(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleSelectMonth = (key, disabled) => {
    if (disabled) return;
    setSelectedMonths(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const totalPaymentAmount = useMemo(() => {
    let total = 0;
    groupedLedger.forEach(m => {
      if (selectedMonths.includes(m.key)) {
        m.entries.forEach(e => {
          if (['LEDGER_UNPAID', 'LEDGER_PARTIAL'].includes(e.status)) {
            total += e.balanceAmount || 0;
          }
        });
      }
    });
    return total;
  }, [selectedMonths, groupedLedger]);

  const handlePayment = () => {
    if (selectedMonths.length === 0 || totalPaymentAmount <= 0) {
      Alert.alert('No Selection', 'Please select at least one unpaid month to pay');
      return;
    }
    Alert.alert(
      'Confirm Payment',
      `Pay ${formatCurrency(totalPaymentAmount)} online?\n\nNote: Payments are allocated to the oldest dues first.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay Now', onPress: createOrder }
      ]
    );
  };

  const createOrder = async () => {
    setIsProcessing(true);
    try {
      const res = await api.post('/payment/initiate', {
        studentFeeId: studentFee.id,
        studentId: childData.studentId,
        schoolId,
        amount: totalPaymentAmount,
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
            schoolName: schoolDetails?.name || userData?.school?.name || 'EduBreezy',
            description: `Fee Payment - ${childData.name}`,
            image: schoolDetails?.profilePicture || 'https://edubreezy.com/web-app-manifest-192x192.png',
            prefill: {
              email: userData?.email || schoolDetails?.email || 'test@example.com',
              contact: userData?.phone || schoolDetails?.contactNumber || '9999999999',
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
            setIsGeneratingReceipt(true);
            try {
              const paymentDetails = verifyRes.data.payment;
              const selectedMonthsArr = groupedLedger.filter(m => selectedMonths.includes(m.key));
              const isPromotionReceipt = selectedMonthsArr.some(m =>
                m.entries.some(e => e.feeComponent.name.toLowerCase().includes('admission') || e.feeComponent.category.includes('ADMISSION'))
              ) && selectedMonthsArr[0]?.key.endsWith('-04');

              const pdfUri = await generateReceiptPDF({
                schoolDetails: {
                  name: schoolDetails?.name || userData?.school?.name || 'EduBreezy School',
                  logoUrl: schoolDetails?.profilePicture || userData?.schoolLogo || null,
                  address: schoolDetails?.address ? `${schoolDetails.address}, ${schoolDetails.city || ''} - ${schoolDetails.pincode || ''}` : userData?.schoolAddress || '',
                  phone: schoolDetails?.contactNumber || userData?.schoolPhone || '',
                  slogan: userData?.schoolSlogan || ''
                },
                studentDetails: {
                  admissionNo: childData.admissionNo || '',
                  studentName: childData.name || '',
                  fatherName: '',
                  session: studentFee?.session?.name || '',
                  className: `${childData.className || ''} ${childData.sectionName || ''}`
                },
                paymentDetails: {
                  receiptNo: paymentDetails.receiptNumber,
                  date: paymentDetails.date,
                  totalAmount: totalPaymentAmount,
                  paidAmount: totalPaymentAmount,
                  balance: paymentDetails.balance || 0,
                  mode: 'Online (Razorpay)',
                  collectedBy: 'SYSTEM'
                },
                selectedMonths: selectedMonthsArr.map(m => m.label),
                isPromotionReceipt,
                receiptSettings: studentFee?.paymentOptions?.receiptSettings || {}
              });

              const uploadRes = await uploadFile(
                { uri: pdfUri, mimeType: 'application/pdf', name: `Receipt_${paymentDetails.receiptNumber}.pdf` },
                'fee_receipt',
                { schoolId, userId: userData.id, type: 'receipts' }
              );

              if (uploadRes && uploadRes.url) {
                await api.post('/payment/save-receipt', { paymentId: paymentDetails.id, receiptUrl: uploadRes.url });
              }
            } catch (err) {
              console.error("Receipt error:", err);
            } finally {
              setIsGeneratingReceipt(false);
            }

            queryClient.invalidateQueries(['student-fee']);
            setSelectedMonths([]);
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
        setSelectedMonths([]);
        setIsProcessing(false);
      }
    } else {
      setIsProcessing(false);
      if (status === 'FAILED') {
        Alert.alert('Payment Failed', (data?.description) || 'The payment could not be completed.');
      }
    }
  };

  const paidPct = studentFee
    ? Math.round((studentFee.paidAmount / (studentFee.finalAmount || studentFee.originalAmount || 1)) * 100) || 0
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
                <View style={styles.heroCircle1} />
                <View style={styles.heroCircle2} />

                <View style={styles.heroTop}>
                  <View>
                    <Text style={styles.heroLabel}>Total Fee</Text>
                    <Text style={styles.heroAmount}>{formatCurrency(studentFee.originalAmount)}</Text>
                    {studentFee.discountAmount > 0 && <Text style={styles.heroDiscountText}>After discount: {formatCurrency(studentFee.finalAmount)}</Text>}
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

            {/* Note regarding dates */}
            <Animated.View entering={FadeInDown.delay(160).duration(400)}>
              <View style={styles.infoCard}>
                <View style={styles.infoIconBg}><Info size={16} color="#0469ff" /></View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoTitle}>Fee Ledger</Text>
                  <Text style={styles.infoText}>Fees are calculated from the Join Date onwards. Payments are allocated to the oldest dues first.</Text>
                </View>
              </View>
            </Animated.View>

            {/* ── Grouped Ledger ────────────────────────────────────────── */}
            <View style={styles.ledgerContainer}>
              {groupedLedger.map((monthGroup, idx) => {
                const isExpanded = !!expandedMonths[monthGroup.key];
                const mTotal = monthGroup.entries.reduce((s, e) => s + (e.netAmount || 0), 0);
                const mPaid = monthGroup.entries.reduce((s, e) => s + (e.paidAmount || 0), 0);
                const mBalance = monthGroup.entries.reduce((s, e) => s + (e.balanceAmount || 0), 0);
                const mLateFee = monthGroup.entries.reduce((s, e) => s + (e.lateFeeAmount || 0), 0);

                const hasOverdue = monthGroup.entries.some(e => !['PAID', 'LEDGER_PAID', 'WAIVED', 'LEDGER_WAIVED', 'CANCELLED', 'LEDGER_CANCELLED'].includes(e.status) && e.dueDate && new Date(e.dueDate) < new Date());
                const allPaid = monthGroup.entries.length > 0 && monthGroup.entries.every(e => ['LEDGER_PAID', 'PAID', 'LEDGER_WAIVED', 'WAIVED', 'LEDGER_CANCELLED', 'CANCELLED'].includes(e.status));

                const isSelected = selectedMonths.includes(monthGroup.key);
                const canSelect = mBalance > 0;

                const monthStatus = monthGroup.entries.length === 0 ? 'No Dues' : (allPaid ? 'Paid' : hasOverdue ? 'Overdue' : 'Unpaid');
                const monthColor = monthGroup.entries.length === 0 ? '#9CA3AF' : allPaid ? '#10B981' : hasOverdue ? '#EF4444' : '#6B7280';
                const monthBg = monthGroup.entries.length === 0 ? '#F3F4F6' : allPaid ? '#D1FAE5' : hasOverdue ? '#FEE2E2' : '#F3F4F6';

                return (
                  <Animated.View key={monthGroup.key} layout={Layout} entering={FadeInDown.delay(200 + idx * 50).duration(400)} style={[styles.monthCard, isSelected && styles.monthCardSelected]}>
                    {/* Month Header */}
                    <Pressable style={styles.monthHeader} onPress={() => toggleExpand(monthGroup.key)}>
                      <HapticTouchable onPress={() => toggleSelectMonth(monthGroup.key, !canSelect)} disabled={!canSelect} style={styles.monthCheckboxContainer}>
                        <View style={[styles.checkbox, isSelected && styles.checkboxActive, !canSelect && styles.checkboxDisabled]}>
                          {(isSelected || allPaid) && <CheckCircle size={14} color={allPaid && !isSelected ? "#10B981" : "#fff"} />}
                        </View>
                      </HapticTouchable>

                      <View style={styles.monthHeaderTitles}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.monthLabel}>{monthGroup.label}</Text>
                          <View style={[styles.monthStatusBadge, { backgroundColor: monthBg }]}>
                            <Text style={[styles.monthStatusText, { color: monthColor }]}>{monthStatus}</Text>
                          </View>
                        </View>
                        <Text style={styles.monthSummaryText}>
                          {mBalance > 0 ? `Due: ${formatCurrency(mBalance)}` : mTotal > 0 ? `Total: ${formatCurrency(mTotal)}` : 'No fees scheduled'}
                        </Text>
                      </View>

                      <View style={styles.monthHeaderRight}>
                        {mLateFee > 0 && <Text style={styles.lateFeeBadge}>+{formatCurrency(mLateFee)} late</Text>}
                        {isExpanded ? <ChevronUp size={20} color="#6B7280" /> : <ChevronDown size={20} color="#6B7280" />}
                      </View>
                    </Pressable>

                    {/* Month Body */}
                    {isExpanded && (
                      <View style={styles.monthBody}>
                        {monthGroup.entries.length === 0 ? (
                          <View style={styles.emptyMonthBody}>
                            <Receipt size={24} color="#D1D5DB" />
                            <Text style={styles.emptyMonthText}>No fees scheduled for this month</Text>
                          </View>
                        ) : (
                          TYPE_ORDER.filter(t => monthGroup.types[t]).map(typeKey => {
                            const meta = TYPE_META[typeKey] || TYPE_META.ONE_TIME;
                            const TypeIcon = meta.icon;
                            const items = monthGroup.types[typeKey];

                            return (
                              <View key={typeKey} style={styles.feeTypeGroup}>
                                <View style={styles.feeTypeHeader}>
                                  <View style={[styles.feeTypeIconWrap, { backgroundColor: meta.bg }]}>
                                    <TypeIcon size={14} color={meta.color} />
                                  </View>
                                  <Text style={[styles.feeTypeLabel, { color: meta.color }]}>{meta.label}</Text>
                                </View>

                                <View style={[styles.feeTypeItemsContainer, { borderColor: meta.border }]}>
                                  {items.map((e, index) => {
                                    const sc = STATUS_COLORS[e.status] || STATUS_COLORS.LEDGER_UNPAID;
                                    return (
                                      <View key={e.id} style={[styles.feeItemRow, index > 0 && styles.feeItemBorder]}>
                                        <View style={styles.feeItemLeft}>
                                          <Text style={styles.feeItemName}>{e.feeComponent?.name}</Text>
                                          <Text style={styles.feeItemDate}>Due: {e.dueDate ? new Date(e.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</Text>
                                        </View>
                                        <View style={styles.feeItemRight}>
                                          <Text style={styles.feeItemAmount}>{formatCurrency(e.netAmount)}</Text>
                                          <View style={[styles.statusChip, { backgroundColor: sc.bg }]}>
                                            <Text style={[styles.statusChipText, { color: sc.color }]}>{sc.label}</Text>
                                          </View>
                                        </View>
                                      </View>
                                    );
                                  })}
                                </View>
                              </View>
                            );
                          })
                        )}
                        {monthGroup.entries.length > 0 && (
                          <View style={styles.monthFooter}>
                            <Text style={styles.monthFooterLabel}>Total for {monthGroup.label}</Text>
                            <Text style={styles.monthFooterTotal}>{formatCurrency(mTotal)}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </Animated.View>
                );
              })}
            </View>
            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>

      {/* ── Floating pay button ─────────────────────────────────────────────── */}
      {studentFee && studentFee.balanceAmount > 0 && (
        <View style={[styles.floatingBar, { paddingBottom: insets.bottom + 8 }]}>
          {studentFee.paymentOptions?.onlineEnabled ? (
            <HapticTouchable
              onPress={handlePayment}
              disabled={isProcessing || isGeneratingReceipt || totalPaymentAmount <= 0}
            >
              <LinearGradient
                colors={totalPaymentAmount > 0 ? ['#0469ff', '#0347b8'] : ['#94a3b8', '#64748b']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.payBtn}
              >
                <View style={styles.payBtnLeft}>
                  {isGeneratingReceipt ? <ActivityIndicator color="#fff" size="small" /> :
                    isProcessing ? <ActivityIndicator color="#fff" size="small" /> :
                      <CreditCard size={22} color="#fff" />
                  }
                  <View>
                    <Text style={styles.payBtnLabel}>
                      {isGeneratingReceipt ? 'Generating Receipt...' :
                        (selectedMonths.length > 0
                          ? `Pay ${selectedMonths.length} Month${selectedMonths.length > 1 ? 's' : ''}`
                          : 'Select months to pay')}
                    </Text>
                    <Text style={styles.payBtnAmount}>
                      {formatCurrency(totalPaymentAmount)}
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
            <View style={styles.confirmHandle} />
            <View style={styles.confirmHeader}>
              <Text style={styles.confirmTitle}>Confirm Payment</Text>
              <HapticTouchable onPress={() => setShowConfirmation(false)}>
                <View style={styles.confirmClose}><X size={20} color="#666" /></View>
              </HapticTouchable>
            </View>
            <View style={styles.confirmBody}>
              <View style={styles.confirmSchoolRow}>
                {pendingOrder?.image && (
                  <Image source={{ uri: pendingOrder.image }} style={styles.confirmLogo} />
                )}
                <Text style={styles.confirmSchoolName}>{pendingOrder?.schoolName}</Text>
              </View>
              <View style={styles.confirmDivider} />
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
            <View style={[styles.confirmFooter, { paddingBottom: Math.max(insets.bottom + 8, 24) }]}>
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
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, backgroundColor: '#FAFAFA' },
  backButtonCenter: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#0469ff', borderRadius: 12 },
  backButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },

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

  heroCard: {
    borderRadius: 24, padding: 22, marginTop: 20, marginBottom: 16,
    overflow: 'hidden', elevation: 8, shadowColor: '#0469ff', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10
  },
  heroCircle1: { position: 'absolute', top: -50, right: -50, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.07)' },
  heroCircle2: { position: 'absolute', bottom: -40, left: -30, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(255,255,255,0.05)' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  heroLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  heroAmount: { fontSize: 32, fontWeight: '800', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  heroDiscountText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  heroBadgeText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  progressTrack: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fff', borderRadius: 3 },
  progressPct: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '600', minWidth: 52, textAlign: 'right' },
  heroRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: 14, borderRadius: 16 },
  heroStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroDivider: { width: 1, height: 30, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 16 },
  heroStatLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  heroStatValue: { fontSize: 16, fontWeight: '700', color: '#fff' },

  infoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#EFF6FF', borderRadius: 16, borderWidth: 1, borderColor: '#DBEAFE', marginBottom: 20 },
  infoIconBg: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#DBEAFE', alignItems: 'center', justifyContent: 'center' },
  infoContent: { flex: 1 },
  infoTitle: { fontSize: 13, fontWeight: '700', color: '#1E3A8A' },
  infoText: { fontSize: 12, color: '#1E40AF', marginTop: 2, lineHeight: 16 },

  // Ledger Container
  ledgerContainer: { gap: 12 },
  monthCard: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
  monthCardSelected: { borderColor: '#3B82F6', borderWidth: 2, shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },

  monthHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff' },
  monthCheckboxContainer: { padding: 4, marginRight: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 8, borderWidth: 2, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  checkboxDisabled: { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },

  monthHeaderTitles: { flex: 1 },
  monthLabel: { fontSize: 16, fontWeight: '700', color: '#111' },
  monthStatusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  monthStatusText: { fontSize: 10, fontWeight: '700' },
  monthSummaryText: { fontSize: 13, color: '#6B7280', marginTop: 4, fontWeight: '500' },

  monthHeaderRight: { alignItems: 'flex-end', gap: 6 },
  lateFeeBadge: { fontSize: 11, color: '#EF4444', fontWeight: '600', backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },

  monthBody: { borderTopWidth: 1, borderTopColor: '#F3F4F6', backgroundColor: '#FAFAFA', padding: 16, gap: 16 },

  feeTypeGroup: { gap: 8 },
  feeTypeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  feeTypeIconWrap: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  feeTypeLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },

  feeTypeItemsContainer: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  feeItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  feeItemBorder: { borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  feeItemLeft: { flex: 1, gap: 2 },
  feeItemName: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  feeItemDate: { fontSize: 11, color: '#6B7280' },
  feeItemRight: { alignItems: 'flex-end', gap: 4 },
  feeItemAmount: { fontSize: 14, fontWeight: '700', color: '#111' },

  statusChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  statusChipText: { fontSize: 10, fontWeight: '700' },

  monthFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E5E7EB', borderStyle: 'dashed' },
  monthFooterLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
  monthFooterTotal: { fontSize: 16, fontWeight: '800', color: '#111' },

  emptyMonthBody: { alignItems: 'center', paddingVertical: 20, gap: 8, opacity: 0.5 },
  emptyMonthText: { fontSize: 13, color: '#6B7280' },

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