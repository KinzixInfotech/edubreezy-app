// Transport Fee Payment Screen for Parents — Modern UI
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
    Linking,
    RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    Bus,
    CreditCard,
    User,
    CheckCircle2,
    Clock,
    AlertCircle,
    Receipt,
    Info,
    Wallet,
    TrendingUp,
    ChevronRight,
    BadgeCheck,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = ({ icon: Icon, title, subtitle, color = '#0469ff' }) => (
    <Animated.View entering={FadeInDown.delay(200).duration(400)} style={emptyStyles.wrap}>
        <View style={[emptyStyles.iconBg, { backgroundColor: color + '15' }]}>
            <Icon size={36} color={color} />
        </View>
        <Text style={emptyStyles.title}>{title}</Text>
        <Text style={emptyStyles.subtitle}>{subtitle}</Text>
    </Animated.View>
);

const emptyStyles = StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 56, gap: 10 },
    iconBg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    title: { fontSize: 16, fontWeight: '700', color: '#111' },
    subtitle: { fontSize: 13, color: '#888', textAlign: 'center', paddingHorizontal: 40, lineHeight: 19 },
});

const FREQUENCY_LABEL = {
    MONTHLY: 'per month',
    QUARTERLY: 'per quarter',
    HALF_YEARLY: 'per half-year',
    YEARLY: 'per year',
};

export default function TransportFeeScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();
    const [refreshing, setRefreshing] = useState(false);

    const childData = params.childData ? JSON.parse(params.childData) : null;

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const studentId = childData?.studentId || childData?.id;

    const { data: feeData, isLoading: feeLoading } = useQuery({
        queryKey: ['transport-fee', schoolId, studentId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/fees?schoolId=${schoolId}&studentId=${studentId}`);
            return res.data;
        },
        enabled: !!schoolId && !!studentId,
    });

    const { data: paymentsData, isLoading: paymentsLoading } = useQuery({
        queryKey: ['transport-payments', schoolId, studentId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/fees/payments?schoolId=${schoolId}&studentId=${studentId}`);
            return res.data;
        },
        enabled: !!schoolId && !!studentId,
    });

    const feeDetails = feeData?.fees?.[0];
    const payments = paymentsData?.payments || [];
    const totalPaid = payments.filter(p => p.status === 'PAID').reduce((sum, p) => sum + (p.amount || 0), 0);
    const pendingAmount = Math.max(0, (feeDetails?.amount || 0) - totalPaid);
    const isLoading = feeLoading || paymentsLoading;

    const paidPct = feeDetails?.amount > 0
        ? Math.min(100, Math.round((totalPaid / feeDetails.amount) * 100))
        : 0;

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['transport-fee']),
            queryClient.invalidateQueries(['transport-payments']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    const handlePayNow = () => {
        Alert.alert(
            'Payment',
            'Payment gateway integration required. Contact admin for payment options.',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Contact Admin', onPress: () => Linking.openURL('mailto:admin@school.com') },
            ]
        );
    };

    const getPaymentCfg = (status) => {
        switch (status) {
            case 'PAID': return { icon: CheckCircle2, color: '#15803D', bg: '#ECFDF5', border: '#A7F3D0', label: 'Paid' };
            case 'PENDING': return { icon: Clock, color: '#B45309', bg: '#FFFBEB', border: '#FDE68A', label: 'Pending' };
            case 'OVERDUE': return { icon: AlertCircle, color: '#B91C1C', bg: '#FFF1F2', border: '#FECDD3', label: 'Overdue' };
            default: return { icon: Clock, color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', label: status };
        }
    };

    if (!childData) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="dark" backgroundColor="#fff" />
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}><ArrowLeft size={22} color="#0D1117" /></View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Transport Fee</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <EmptyState icon={AlertCircle} title="No Child Selected" subtitle="Please select a child from the home screen" color="#EF4444" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" backgroundColor="#fff" />

            {/* ── Header ─────────────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}><ArrowLeft size={22} color="#0D1117" /></View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Transport Fee</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s fee details</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {/* ── Hero banner ───────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.delay(80).duration(500)}>
                    <LinearGradient
                        colors={['#0469ff', '#0347c4']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.heroBanner}
                    >
                        <View style={styles.heroDeco1} />
                        <View style={styles.heroDeco2} />

                        {/* Child row */}
                        <View style={styles.heroTop}>
                            <View style={styles.heroAvatar}>
                                <User size={22} color="#0469ff" />
                            </View>
                            <View style={styles.heroText}>
                                <Text style={styles.heroName}>{childData.name}</Text>
                                <Text style={styles.heroClass}>Class {childData.class} · {childData.section}</Text>
                            </View>
                            <View style={styles.heroBusIcon}>
                                <Bus size={20} color="rgba(255,255,255,0.7)" />
                            </View>
                        </View>

                        {/* Amount */}
                        {feeDetails && (
                            <>
                                <View style={styles.heroAmountRow}>
                                    <Text style={styles.heroAmountLabel}>Total Fee</Text>
                                    <Text style={styles.heroAmount}>
                                        ₹{feeDetails.amount?.toLocaleString()}
                                        <Text style={styles.heroFreq}> {FREQUENCY_LABEL[feeDetails.frequency]}</Text>
                                    </Text>
                                </View>

                                {/* Progress bar */}
                                <View style={styles.progressWrap}>
                                    <View style={styles.progressBg}>
                                        <View style={[styles.progressFill, { width: `${paidPct}%` }]} />
                                    </View>
                                    <Text style={styles.progressLabel}>{paidPct}% paid</Text>
                                </View>
                            </>
                        )}

                        {/* Stats strip */}
                        <View style={styles.heroStats}>
                            <View style={styles.heroStat}>
                                <Text style={[styles.heroStatVal, { color: '#34D399' }]}>
                                    ₹{totalPaid.toLocaleString()}
                                </Text>
                                <Text style={styles.heroStatLabel}>Paid</Text>
                            </View>
                            <View style={styles.heroStatSep} />
                            <View style={styles.heroStat}>
                                <Text style={[styles.heroStatVal, { color: pendingAmount > 0 ? '#FDE68A' : '#34D399' }]}>
                                    ₹{pendingAmount.toLocaleString()}
                                </Text>
                                <Text style={styles.heroStatLabel}>Pending</Text>
                            </View>
                        </View>
                    </LinearGradient>
                </Animated.View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                        <Text style={styles.loadingText}>Loading fee details…</Text>
                    </View>
                ) : feeDetails ? (
                    <>
                        {/* ── Fee detail card ─────────────────────────────────── */}
                        <Animated.View entering={FadeInDown.delay(160).duration(450)}>
                            <View style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <View style={[styles.cardIconBg, { backgroundColor: '#ECFDF5' }]}>
                                        <Bus size={16} color="#10B981" />
                                    </View>
                                    <View style={styles.cardHeaderText}>
                                        <Text style={styles.cardTitle}>{feeDetails.name}</Text>
                                        <Text style={styles.cardSub}>{feeDetails.route?.name || 'All Routes'}</Text>
                                    </View>
                                    {pendingAmount === 0 && (
                                        <View style={styles.paidBadge}>
                                            <BadgeCheck size={13} color="#15803D" />
                                            <Text style={styles.paidBadgeText}>Cleared</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Info rows */}
                                {[
                                    { label: 'Fee Type', value: feeDetails.feeType || 'Transport' },
                                    { label: 'Frequency', value: FREQUENCY_LABEL[feeDetails.frequency] || feeDetails.frequency },
                                    {
                                        label: 'Due Date', value: feeDetails.dueDate
                                            ? new Date(feeDetails.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                            : 'N/A'
                                    },
                                ].map(row => (
                                    <View key={row.label} style={styles.infoRow}>
                                        <Text style={styles.infoLabel}>{row.label}</Text>
                                        <Text style={styles.infoValue}>{row.value}</Text>
                                    </View>
                                ))}

                                {/* Pay now button */}
                                {pendingAmount > 0 && (
                                    <HapticTouchable onPress={handlePayNow} style={{ marginTop: 16 }}>
                                        <LinearGradient
                                            colors={['#0469ff', '#0347c4']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 0 }}
                                            style={styles.payBtn}
                                        >
                                            <CreditCard size={18} color="#fff" />
                                            <Text style={styles.payBtnText}>Pay ₹{pendingAmount.toLocaleString()}</Text>
                                            <ChevronRight size={18} color="rgba(255,255,255,0.7)" style={{ marginLeft: 'auto' }} />
                                        </LinearGradient>
                                    </HapticTouchable>
                                )}
                            </View>
                        </Animated.View>
                    </>
                ) : (
                    <Animated.View entering={FadeInDown.delay(160).duration(450)}>
                        <EmptyState
                            icon={Info}
                            title="No Transport Fee Assigned"
                            subtitle="Contact your school admin for fee details"
                            color="#8B5CF6"
                        />
                    </Animated.View>
                )}

                {/* ── Payment history ───────────────────────────────────────── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Payment History</Text>
                        <View style={styles.sectionBadge}>
                            <Text style={styles.sectionBadgeText}>{payments.length}</Text>
                        </View>
                    </View>

                    {payments.length > 0 ? (
                        payments.map((payment, index) => {
                            const cfg = getPaymentCfg(payment.status);
                            const StatusIcon = cfg.icon;
                            return (
                                <Animated.View
                                    key={payment.id}
                                    entering={FadeInRight.delay(260 + index * 70).duration(450)}
                                >
                                    <View style={[styles.paymentCard, { borderColor: cfg.border }]}>
                                        <View style={[styles.cardAccent, { backgroundColor: cfg.color }]} />
                                        <View style={[styles.paymentIconBox, { backgroundColor: cfg.bg }]}>
                                            <StatusIcon size={18} color={cfg.color} />
                                        </View>
                                        <View style={styles.paymentInfo}>
                                            <Text style={styles.paymentAmount}>₹{payment.amount?.toLocaleString()}</Text>
                                            <Text style={styles.paymentDate}>
                                                {new Date(payment.paymentDate || payment.createdAt).toLocaleDateString('en-IN', {
                                                    day: 'numeric', month: 'short', year: 'numeric',
                                                })}
                                            </Text>
                                        </View>
                                        <View style={[styles.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                                            <Text style={[styles.statusPillText, { color: cfg.color }]}>{cfg.label}</Text>
                                        </View>
                                    </View>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <EmptyState
                            icon={Receipt}
                            title="No Payment Records"
                            subtitle="Payment history will appear here once payments are made"
                            color="#0469ff"
                        />
                    )}
                </View>
            </ScrollView>

            {/* ── Sticky pay footer ─────────────────────────────────────────── */}
            {!isLoading && feeDetails && pendingAmount > 0 && (
                <View style={[styles.stickyFooter, { paddingBottom: insets.bottom + 8 }]}>
                    <View style={styles.footerLeft}>
                        <Text style={styles.footerLabel}>Balance Due</Text>
                        <Text style={styles.footerAmount}>₹{pendingAmount.toLocaleString()}</Text>
                    </View>
                    <HapticTouchable onPress={handlePayNow} style={{ flex: 1 }}>
                        <LinearGradient
                            colors={['#0469ff', '#0347c4']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.footerPayBtn}
                        >
                            <CreditCard size={18} color="#fff" />
                            <Text style={styles.footerPayBtnText}>Pay Now</Text>
                        </LinearGradient>
                    </HapticTouchable>
                </View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F7F9FC' },

    // ── Header ────────────────────────────────────────────────────────────────
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#F0F3F8',
    },
    backButton: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#0D1117', letterSpacing: -0.3 },
    headerSubtitle: { fontSize: 12, color: '#8A97B0', marginTop: 1 },

    content: { flex: 1, paddingHorizontal: 16 },

    // ── Hero ──────────────────────────────────────────────────────────────────
    heroBanner: {
        borderRadius: 22, padding: 20,
        marginTop: 16, marginBottom: 16,
        overflow: 'hidden', position: 'relative',
    },
    heroDeco1: {
        position: 'absolute', width: 140, height: 140, borderRadius: 70,
        backgroundColor: 'rgba(255,255,255,0.07)', top: -40, right: -30,
    },
    heroDeco2: {
        position: 'absolute', width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.05)', bottom: -20, left: 40,
    },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
    heroAvatar: {
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    },
    heroText: { flex: 1 },
    heroName: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
    heroClass: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    heroBusIcon: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    },
    heroAmountRow: { marginBottom: 12 },
    heroAmountLabel: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500', marginBottom: 4 },
    heroAmount: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1 },
    heroFreq: { fontSize: 14, fontWeight: '400', color: 'rgba(255,255,255,0.65)' },

    progressWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    progressBg: {
        flex: 1, height: 6, borderRadius: 3,
        backgroundColor: 'rgba(255,255,255,0.25)',
        overflow: 'hidden',
    },
    progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#34D399' },
    progressLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '600', minWidth: 50 },

    heroStats: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.14)',
        borderRadius: 14, padding: 14,
    },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatVal: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
    heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', marginTop: 2, fontWeight: '500' },
    heroStatSep: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },

    loadingContainer: { padding: 60, alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, color: '#8A97B0' },

    // ── Cards ─────────────────────────────────────────────────────────────────
    card: {
        backgroundColor: '#fff',
        borderRadius: 18, borderWidth: 1, borderColor: '#F0F3F8',
        padding: 16, marginBottom: 14,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    cardIconBg: {
        width: 40, height: 40, borderRadius: 12,
        alignItems: 'center', justifyContent: 'center',
    },
    cardHeaderText: { flex: 1 },
    cardTitle: { fontSize: 15, fontWeight: '700', color: '#0D1117' },
    cardSub: { fontSize: 12, color: '#8A97B0', marginTop: 2 },
    paidBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#ECFDF5', paddingHorizontal: 9, paddingVertical: 4,
        borderRadius: 20,
    },
    paidBadgeText: { fontSize: 11, fontWeight: '700', color: '#15803D' },

    infoRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingVertical: 10,
        borderTopWidth: 1, borderTopColor: '#F4F6FA',
    },
    infoLabel: { fontSize: 13, color: '#8A97B0' },
    infoValue: { fontSize: 13, fontWeight: '700', color: '#0D1117' },

    payBtn: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 15, paddingHorizontal: 18,
        borderRadius: 14, gap: 10,
    },
    payBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

    // ── Section ───────────────────────────────────────────────────────────────
    section: { marginBottom: 8 },
    sectionHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 14,
    },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0D1117', letterSpacing: -0.2 },
    sectionBadge: {
        backgroundColor: '#EEF4FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    },
    sectionBadgeText: { fontSize: 12, fontWeight: '700', color: '#0469ff' },

    // ── Payment cards ─────────────────────────────────────────────────────────
    paymentCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 16, borderWidth: 1,
        marginBottom: 8, overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
    },
    cardAccent: { width: 4, alignSelf: 'stretch' },
    paymentIconBox: {
        width: 42, height: 42, borderRadius: 21,
        alignItems: 'center', justifyContent: 'center',
        marginLeft: 12, marginVertical: 12,
    },
    paymentInfo: { flex: 1, paddingLeft: 10 },
    paymentAmount: { fontSize: 15, fontWeight: '800', color: '#0D1117' },
    paymentDate: { fontSize: 12, color: '#8A97B0', marginTop: 2 },
    statusPill: {
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 20, borderWidth: 1,
        marginRight: 14,
    },
    statusPillText: { fontSize: 10, fontWeight: '800' },

    // ── Sticky footer ─────────────────────────────────────────────────────────
    stickyFooter: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff',
        borderTopWidth: 1, borderTopColor: '#F0F3F8',
        paddingTop: 12, paddingHorizontal: 16, gap: 14,
    },
    footerLeft: {},
    footerLabel: { fontSize: 11, color: '#8A97B0', fontWeight: '500' },
    footerAmount: { fontSize: 20, fontWeight: '900', color: '#0D1117', letterSpacing: -0.5 },
    footerPayBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 8, paddingVertical: 14, borderRadius: 14,
    },
    footerPayBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});