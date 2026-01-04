import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    Alert,
    Modal,
    TextInput,
    TouchableOpacity,
} from 'react-native';
import { router } from 'expo-router';
import {
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Clock,
    Calendar,
    DollarSign,
    BookOpen,
    User,
    AlertTriangle,
    ChevronRight,
    X,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

const CATEGORY_CONFIG = {
    leave: {
        label: 'Leave Requests',
        icon: Calendar,
        color: '#8B5CF6',
        bgColor: '#F5F3FF',
    },
    feeDiscount: {
        label: 'Fee Discounts',
        icon: DollarSign,
        color: '#10B981',
        bgColor: '#D1FAE5',
    },
    library: {
        label: 'Library Requests',
        icon: BookOpen,
        color: '#0EA5E9',
        bgColor: '#F0F9FF',
    },
    payroll: {
        label: 'Payroll Approval',
        icon: DollarSign,
        color: '#F59E0B',
        bgColor: '#FFFBEB',
    },
};

export default function ApprovalsScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [activeCategory, setActiveCategory] = useState(null);
    const queryClient = useQueryClient();

    // Get user data
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const userId = userData?.id;

    // Fetch approvals
    const { data: approvals, isLoading, refetch } = useQuery({
        queryKey: ['approvals', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/approvals`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    // Approval mutation
    const approvalMutation = useMutation({
        mutationFn: async ({ itemId, type, action, reason }) => {
            return api.post(`/schools/${schoolId}/approvals`, {
                itemId,
                type,
                action,
                reason,
                approverId: userId,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['approvals', schoolId]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setModalVisible(false);
            setSelectedItem(null);
            setRejectReason('');
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || 'Failed to process approval');
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const handleApprove = (item) => {
        Alert.alert(
            'Approve Request',
            `Are you sure you want to approve this ${item.type.replace('_', ' ')} request?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Approve',
                    onPress: () => {
                        approvalMutation.mutate({
                            itemId: item.id,
                            type: item.type,
                            action: 'approve',
                        });
                    },
                },
            ]
        );
    };

    const handleReject = (item) => {
        setSelectedItem(item);
        setModalVisible(true);
    };

    const submitRejection = () => {
        if (!rejectReason.trim()) {
            Alert.alert('Error', 'Please provide a reason for rejection');
            return;
        }
        approvalMutation.mutate({
            itemId: selectedItem.id,
            type: selectedItem.type,
            action: 'reject',
            reason: rejectReason.trim(),
        });
    };

    const renderApprovalItem = (item, index) => {
        const config = CATEGORY_CONFIG[item.type] || CATEGORY_CONFIG.leave;
        const Icon = config.icon;

        return (
            <Animated.View
                key={item.id}
                entering={FadeInDown.delay(index * 50).duration(400)}
            >
                <View style={[styles.approvalCard, item.isUrgent && styles.urgentCard]}>
                    {item.isUrgent && (
                        <View style={styles.urgentBadge}>
                            <AlertTriangle size={12} color="#DC2626" />
                            <Text style={styles.urgentText}>Pending &gt; 48h</Text>
                        </View>
                    )}

                    <View style={styles.cardHeader}>
                        <View style={[styles.iconContainer, { backgroundColor: config.bgColor }]}>
                            <Icon size={20} color={config.color} />
                        </View>
                        <View style={styles.cardTitleSection}>
                            <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={styles.cardSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                        </View>
                        <Text style={styles.timeAgo}>{item.pendingSince}</Text>
                    </View>

                    {item.description && (
                        <Text style={styles.cardDescription} numberOfLines={2}>{item.description}</Text>
                    )}

                    {item.type === 'leave' && (
                        <View style={styles.leaveDetails}>
                            <View style={styles.detailItem}>
                                <Calendar size={14} color="#6B7280" />
                                <Text style={styles.detailText}>
                                    {new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()}
                                </Text>
                            </View>
                            <View style={styles.detailBadge}>
                                <Text style={styles.detailBadgeText}>{item.totalDays} days</Text>
                            </View>
                        </View>
                    )}

                    {item.type === 'fee_discount' && (
                        <View style={styles.feeDetails}>
                            <Text style={styles.feeAmount}>₹{item.amount?.toLocaleString('en-IN')}</Text>
                            <Text style={styles.feeType}>
                                {item.discountType === 'PERCENTAGE' ? `${item.value}%` : 'Fixed'} discount
                            </Text>
                        </View>
                    )}

                    {item.type === 'library' && (
                        <View style={styles.libraryDetails}>
                            <Text style={styles.availableCopies}>
                                {item.availableCopies} copies available
                            </Text>
                        </View>
                    )}

                    {item.type === 'payroll' && (
                        <View style={styles.payrollDetails}>
                            <Text style={styles.payrollAmount}>
                                ₹{item.totalAmount?.toLocaleString('en-IN')}
                            </Text>
                            <Text style={styles.employeeCount}>{item.employeeCount} employees</Text>
                        </View>
                    )}

                    <View style={styles.actionButtons}>
                        <HapticTouchable
                            style={styles.rejectButton}
                            onPress={() => handleReject(item)}
                        >
                            <XCircle size={18} color="#EF4444" />
                            <Text style={styles.rejectText}>Reject</Text>
                        </HapticTouchable>

                        <HapticTouchable
                            style={styles.approveButton}
                            onPress={() => handleApprove(item)}
                        >
                            <CheckCircle2 size={18} color="#fff" />
                            <Text style={styles.approveText}>Approve</Text>
                        </HapticTouchable>
                    </View>
                </View>
            </Animated.View>
        );
    };

    const renderCategorySection = (categoryKey, items) => {
        if (!items || items.length === 0) return null;

        const config = CATEGORY_CONFIG[categoryKey];
        const Icon = config.icon;
        const isExpanded = activeCategory === categoryKey || activeCategory === null;

        return (
            <Animated.View
                entering={FadeInDown.duration(400)}
                style={styles.categorySection}
            >
                <HapticTouchable
                    onPress={() => setActiveCategory(activeCategory === categoryKey ? null : categoryKey)}
                >
                    <View style={styles.categoryHeader}>
                        <View style={[styles.categoryIcon, { backgroundColor: config.bgColor }]}>
                            <Icon size={20} color={config.color} />
                        </View>
                        <Text style={styles.categoryTitle}>{config.label}</Text>
                        <View style={[styles.countBadge, { backgroundColor: config.color }]}>
                            <Text style={styles.countText}>{items.length}</Text>
                        </View>
                        <ChevronRight
                            size={20}
                            color="#9CA3AF"
                            style={{ transform: [{ rotate: isExpanded ? '90deg' : '0deg' }] }}
                        />
                    </View>
                </HapticTouchable>

                {isExpanded && items.map((item, index) => renderApprovalItem(item, index))}
            </Animated.View>
        );
    };

    if (isLoading || !schoolId) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#7C3AED" />
            </View>
        );
    }

    const hasApprovals = approvals?.summary?.total > 0;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#111" />
                </HapticTouchable>
                <View>
                    <Text style={styles.headerTitle}>Approvals</Text>
                    {hasApprovals && (
                        <Text style={styles.headerSubtitle}>
                            {approvals.summary.total} pending
                        </Text>
                    )}
                </View>
            </View>

            {/* Summary Cards */}
            {hasApprovals && (
                <View style={styles.summaryContainer}>
                    {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                        const count = approvals.summary[key] || 0;
                        const Icon = config.icon;
                        return (
                            <HapticTouchable
                                key={key}
                                style={[styles.summaryCard, { backgroundColor: config.bgColor }]}
                                onPress={() => setActiveCategory(activeCategory === key ? null : key)}
                            >
                                <Icon size={18} color={config.color} />
                                <Text style={[styles.summaryCount, { color: config.color }]}>{count}</Text>
                            </HapticTouchable>
                        );
                    })}
                </View>
            )}

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
                }
                showsVerticalScrollIndicator={false}
            >
                {!hasApprovals ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <CheckCircle2 size={48} color="#10B981" />
                        </View>
                        <Text style={styles.emptyTitle}>All Caught Up!</Text>
                        <Text style={styles.emptySubtitle}>No pending approvals at the moment</Text>
                    </View>
                ) : (
                    <>
                        {renderCategorySection('leave', approvals.items?.leave)}
                        {renderCategorySection('feeDiscount', approvals.items?.feeDiscount)}
                        {renderCategorySection('library', approvals.items?.library)}
                        {renderCategorySection('payroll', approvals.items?.payroll)}
                    </>
                )}
            </ScrollView>

            {/* Rejection Modal */}
            <Modal
                visible={modalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Reject Request</Text>
                            <HapticTouchable onPress={() => setModalVisible(false)}>
                                <X size={24} color="#111" />
                            </HapticTouchable>
                        </View>

                        <Text style={styles.modalSubtitle}>
                            Please provide a reason for rejecting this {selectedItem?.type?.replace('_', ' ')} request
                        </Text>

                        <TextInput
                            style={styles.reasonInput}
                            placeholder="Enter rejection reason..."
                            placeholderTextColor="#9CA3AF"
                            multiline
                            numberOfLines={4}
                            value={rejectReason}
                            onChangeText={setRejectReason}
                        />

                        <View style={styles.modalButtons}>
                            <HapticTouchable
                                style={styles.cancelButton}
                                onPress={() => setModalVisible(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </HapticTouchable>

                            <HapticTouchable
                                style={styles.confirmRejectButton}
                                onPress={submitRejection}
                                disabled={approvalMutation.isPending}
                            >
                                {approvalMutation.isPending ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.confirmRejectText}>Reject</Text>
                                )}
                            </HapticTouchable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        gap: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    backButton: {},
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#7C3AED',
        marginTop: 2,
    },
    summaryContainer: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
    },
    summaryCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 12,
    },
    summaryCount: {
        fontSize: 16,
        fontWeight: '700',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 100,
    },
    categorySection: {
        marginBottom: 20,
    },
    categoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        padding: 14,
        borderRadius: 12,
        marginBottom: 12,
    },
    categoryIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    categoryTitle: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
    },
    countBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 8,
    },
    countText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '700',
    },
    approvalCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    urgentCard: {
        borderColor: '#FECACA',
        backgroundColor: '#FEF2F2',
    },
    urgentBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
        marginBottom: 10,
    },
    urgentText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#DC2626',
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardTitleSection: {
        flex: 1,
        marginLeft: 12,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1F2937',
    },
    cardSubtitle: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    timeAgo: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    cardDescription: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 10,
        lineHeight: 18,
    },
    leaveDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    detailText: {
        fontSize: 13,
        color: '#6B7280',
    },
    detailBadge: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    detailBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4B5563',
    },
    feeDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    feeAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: '#10B981',
    },
    feeType: {
        fontSize: 13,
        color: '#6B7280',
    },
    libraryDetails: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    availableCopies: {
        fontSize: 13,
        color: '#0EA5E9',
        fontWeight: '500',
    },
    payrollDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    payrollAmount: {
        fontSize: 18,
        fontWeight: '700',
        color: '#F59E0B',
    },
    employeeCount: {
        fontSize: 13,
        color: '#6B7280',
    },
    actionButtons: {
        flexDirection: 'row',
        marginTop: 16,
        gap: 12,
    },
    rejectButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: '#FEE2E2',
    },
    rejectText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#EF4444',
    },
    approveButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 10,
        backgroundColor: '#10B981',
    },
    approveText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#D1FAE5',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#6B7280',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
    },
    modalSubtitle: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 16,
    },
    reasonInput: {
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 14,
        fontSize: 15,
        color: '#1F2937',
        minHeight: 100,
        textAlignVertical: 'top',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 20,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
    },
    cancelButtonText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#6B7280',
    },
    confirmRejectButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#EF4444',
        alignItems: 'center',
    },
    confirmRejectText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
});
