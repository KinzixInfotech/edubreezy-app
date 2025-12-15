// Transport Fee Payment Screen for Parents
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
    DollarSign,
    User,
    CheckCircle2,
    Clock,
    AlertCircle,
    Receipt,
    Info,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function TransportFeeScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    // Parse child data from params
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

    // Fetch fee details
    const { data: feeData, isLoading: feeLoading } = useQuery({
        queryKey: ['transport-fee', schoolId, studentId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/fees?schoolId=${schoolId}&studentId=${studentId}`);
            return res.data;
        },
        enabled: !!schoolId && !!studentId,
    });

    // Fetch payment history
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

    const getPaymentStatusInfo = (status) => {
        switch (status) {
            case 'PAID': return { icon: CheckCircle2, color: '#10B981', bg: '#D1FAE5' };
            case 'PENDING': return { icon: Clock, color: '#F59E0B', bg: '#FEF3C7' };
            case 'OVERDUE': return { icon: AlertCircle, color: '#EF4444', bg: '#FEE2E2' };
            default: return { icon: Clock, color: '#94A3B8', bg: '#F1F5F9' };
        }
    };

    const frequencyLabel = {
        MONTHLY: 'per month',
        QUARTERLY: 'per quarter',
        HALF_YEARLY: 'per half-year',
        YEARLY: 'per year',
    };

    // No child data error state
    if (!childData) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#111" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Transport Fee</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyState}>
                    <AlertCircle size={48} color="#ccc" />
                    <Text style={styles.emptyTitle}>No Child Selected</Text>
                    <Text style={styles.emptySubtitle}>Please select a child from home screen</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Transport Fee</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s fee details</Text>
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
                {/* Child Info Card */}
                <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                    <View style={styles.childInfoCard}>
                        <View style={styles.childInfoIcon}>
                            <User size={20} color="#0469ff" />
                        </View>
                        <View style={styles.childInfoContent}>
                            <Text style={styles.childInfoName}>{childData.name}</Text>
                            <Text style={styles.childInfoClass}>
                                Class {childData.class} - {childData.section}
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                    </View>
                ) : feeDetails ? (
                    <>
                        {/* Fee Summary Card */}
                        <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                            <View style={styles.feeCard}>
                                <View style={styles.feeCardHeader}>
                                    <View style={styles.feeIconContainer}>
                                        <Bus size={24} color="#10B981" />
                                    </View>
                                    <View style={styles.feeCardInfo}>
                                        <Text style={styles.feeName}>{feeDetails.name}</Text>
                                        <Text style={styles.feeRoute}>{feeDetails.route?.name || 'All Routes'}</Text>
                                    </View>
                                </View>

                                <View style={styles.amountSection}>
                                    <Text style={styles.amountLabel}>Fee Amount</Text>
                                    <View style={styles.amountValue}>
                                        <Text style={styles.currencySymbol}>₹</Text>
                                        <Text style={styles.amountNumber}>{feeDetails.amount?.toLocaleString()}</Text>
                                        <Text style={styles.frequencyText}>{frequencyLabel[feeDetails.frequency]}</Text>
                                    </View>
                                </View>

                                <View style={styles.statsRow}>
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Total Paid</Text>
                                        <Text style={[styles.statValue, { color: '#10B981' }]}>
                                            ₹{totalPaid.toLocaleString()}
                                        </Text>
                                    </View>
                                    <View style={styles.statDivider} />
                                    <View style={styles.statItem}>
                                        <Text style={styles.statLabel}>Pending</Text>
                                        <Text style={[styles.statValue, { color: pendingAmount > 0 ? '#F59E0B' : '#10B981' }]}>
                                            ₹{pendingAmount.toLocaleString()}
                                        </Text>
                                    </View>
                                </View>

                                {pendingAmount > 0 && (
                                    <HapticTouchable onPress={handlePayNow}>
                                        <View style={styles.payBtn}>
                                            <CreditCard size={20} color="#fff" />
                                            <Text style={styles.payBtnText}>Pay Now</Text>
                                        </View>
                                    </HapticTouchable>
                                )}
                            </View>
                        </Animated.View>
                    </>
                ) : (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.noFeeCard}>
                            <Info size={48} color="#ccc" />
                            <Text style={styles.noFeeTitle}>No Transport Fee Assigned</Text>
                            <Text style={styles.noFeeText}>
                                Contact admin for fee details
                            </Text>
                        </View>
                    </Animated.View>
                )}

                {/* Payment History */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Payment History</Text>

                    {payments.length > 0 ? (
                        payments.map((payment, index) => {
                            const statusInfo = getPaymentStatusInfo(payment.status);
                            const StatusIcon = statusInfo.icon;

                            return (
                                <Animated.View
                                    key={payment.id}
                                    entering={FadeInRight.delay(300 + index * 80).duration(500)}
                                >
                                    <View style={styles.paymentCard}>
                                        <View style={[styles.paymentIconContainer, { backgroundColor: statusInfo.bg }]}>
                                            <StatusIcon size={18} color={statusInfo.color} />
                                        </View>
                                        <View style={styles.paymentInfo}>
                                            <Text style={styles.paymentAmount}>₹{payment.amount?.toLocaleString()}</Text>
                                            <Text style={styles.paymentDate}>
                                                {new Date(payment.paymentDate || payment.createdAt).toLocaleDateString('en-IN', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    year: 'numeric',
                                                })}
                                            </Text>
                                        </View>
                                        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                                            <Text style={[styles.statusText, { color: statusInfo.color }]}>
                                                {payment.status}
                                            </Text>
                                        </View>
                                    </View>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                            <View style={styles.emptyState}>
                                <Receipt size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Payment Records</Text>
                                <Text style={styles.emptySubtitle}>
                                    Payment history will appear here
                                </Text>
                            </View>
                        </Animated.View>
                    )}
                </View>

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
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    childInfoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 16,
        gap: 12,
    },
    childInfoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    childInfoContent: {
        flex: 1,
    },
    childInfoName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    childInfoClass: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    loadingContainer: {
        padding: 60,
        alignItems: 'center',
    },
    feeCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
    },
    feeCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    feeIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#D1FAE5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    feeCardInfo: {
        marginLeft: 14,
    },
    feeName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    feeRoute: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    amountSection: {
        alignItems: 'center',
        paddingVertical: 20,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#e5e7eb',
    },
    amountLabel: {
        fontSize: 13,
        color: '#94A3B8',
        marginBottom: 4,
    },
    amountValue: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    currencySymbol: {
        fontSize: 24,
        fontWeight: '600',
        color: '#10B981',
    },
    amountNumber: {
        fontSize: 36,
        fontWeight: '800',
        color: '#111',
        marginLeft: 2,
    },
    frequencyText: {
        fontSize: 14,
        color: '#666',
        marginLeft: 8,
    },
    statsRow: {
        flexDirection: 'row',
        paddingVertical: 16,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statDivider: {
        width: 1,
        backgroundColor: '#e5e7eb',
    },
    statLabel: {
        fontSize: 12,
        color: '#94A3B8',
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        marginTop: 4,
    },
    payBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 14,
        marginTop: 8,
        borderRadius: 12,
        backgroundColor: '#0469ff',
    },
    payBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    noFeeCard: {
        alignItems: 'center',
        padding: 40,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        marginBottom: 20,
    },
    noFeeTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
        marginTop: 16,
    },
    noFeeText: {
        fontSize: 14,
        color: '#666',
        marginTop: 8,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
        marginBottom: 12,
    },
    paymentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        gap: 12,
    },
    paymentIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    paymentInfo: {
        flex: 1,
    },
    paymentAmount: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    paymentDate: {
        fontSize: 13,
        color: '#94A3B8',
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        paddingHorizontal: 32,
    },
});
