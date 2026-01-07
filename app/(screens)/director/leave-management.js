// app/(screens)/director/leave-management.js
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
    Switch,
} from 'react-native';
import { router } from 'expo-router';
import {
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Clock,
    Calendar,
    User,
    AlertTriangle,
    ChevronRight,
    X,
    Settings,
    FileText,
    Filter,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

const STATUS_TABS = [
    { key: 'PENDING', label: 'Pending', color: '#F59E0B' },
    { key: 'APPROVED', label: 'Approved', color: '#10B981' },
    { key: 'REJECTED', label: 'Rejected', color: '#EF4444' },
];

const LEAVE_TYPE_COLORS = {
    CASUAL: { bg: '#EFF6FF', text: '#2563EB' },
    SICK: { bg: '#FEF3C7', text: '#D97706' },
    EARNED: { bg: '#D1FAE5', text: '#059669' },
    EMERGENCY: { bg: '#FEE2E2', text: '#DC2626' },
    MATERNITY: { bg: '#FCE7F3', text: '#BE185D' },
    PATERNITY: { bg: '#E0E7FF', text: '#4338CA' },
};

export default function DirectorLeaveManagement() {
    const [refreshing, setRefreshing] = useState(false);
    const [activeStatus, setActiveStatus] = useState('PENDING');
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [rejectModalVisible, setRejectModalVisible] = useState(false);
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
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

    // Fetch leave requests
    const { data: leaves, isLoading, refetch } = useQuery({
        queryKey: ['leave-requests', schoolId, activeStatus],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/attendance/admin/leave-management?status=${activeStatus}`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    // Fetch leave permissions
    const { data: permissions, refetch: refetchPermissions } = useQuery({
        queryKey: ['leave-permissions', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/attendance/leave-permissions?viewerRole=DIRECTOR`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 300 * 1000,
    });

    // Approval mutation
    const approvalMutation = useMutation({
        mutationFn: async ({ leaveRequestIds, action, adminRemarks }) => {
            return api.post(`/schools/${schoolId}/attendance/admin/leave-management`, {
                leaveRequestIds,
                action,
                adminRemarks,
                reviewedBy: userId,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['leave-requests', schoolId]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setRejectModalVisible(false);
            setSelectedLeave(null);
            setRejectReason('');
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || 'Failed to process request');
        },
    });

    // Update permissions mutation
    const permissionsMutation = useMutation({
        mutationFn: async (data) => {
            return api.put(`/schools/${schoolId}/attendance/leave-permissions`, {
                ...data,
                updatedBy: userId,
                updaterRole: 'DIRECTOR',
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['leave-permissions', schoolId]);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Success', 'Approval settings updated');
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || 'Failed to update settings');
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([refetch(), refetchPermissions()]);
        setRefreshing(false);
    }, [refetch, refetchPermissions]);

    const handleApprove = (leave) => {
        Alert.alert(
            'Approve Leave',
            `Approve ${leave.user?.name}'s ${leave.leaveType.toLowerCase()} leave request for ${leave.totalDays} days?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Approve',
                    onPress: () => {
                        approvalMutation.mutate({
                            leaveRequestIds: [leave.id],
                            action: 'APPROVED',
                        });
                    },
                },
            ]
        );
    };

    const handleReject = (leave) => {
        setSelectedLeave(leave);
        setRejectModalVisible(true);
    };

    const submitRejection = () => {
        if (!rejectReason.trim()) {
            Alert.alert('Error', 'Please provide a reason for rejection');
            return;
        }
        approvalMutation.mutate({
            leaveRequestIds: [selectedLeave.id],
            action: 'REJECTED',
            adminRemarks: rejectReason.trim(),
        });
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
        });
    };

    const getTimeAgo = (date) => {
        const diff = Math.floor((new Date() - new Date(date)) / (1000 * 60 * 60 * 24));
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Yesterday';
        return `${diff} days ago`;
    };

    const renderLeaveCard = (leave, index) => {
        const typeColor = LEAVE_TYPE_COLORS[leave.leaveType] || LEAVE_TYPE_COLORS.CASUAL;
        const isUrgent = activeStatus === 'PENDING' &&
            Math.floor((new Date() - new Date(leave.submittedAt)) / (1000 * 60 * 60 * 24)) > 2;

        return (
            <Animated.View
                key={leave.id}
                entering={FadeInDown.delay(index * 50).duration(400)}
            >
                <View style={[styles.leaveCard, isUrgent && styles.urgentCard]}>
                    {isUrgent && (
                        <View style={styles.urgentBadge}>
                            <AlertTriangle size={12} color="#DC2626" />
                            <Text style={styles.urgentText}>Pending {'>'} 48h</Text>
                        </View>
                    )}

                    <View style={styles.cardHeader}>
                        <View style={styles.avatarContainer}>
                            <User size={20} color="#6B7280" />
                        </View>
                        <View style={styles.cardTitleSection}>
                            <Text style={styles.cardTitle} numberOfLines={1}>
                                {leave.user?.name || 'Unknown'}
                            </Text>
                            <Text style={styles.cardSubtitle} numberOfLines={1}>
                                {leave.user?.teacher?.designation || leave.user?.role?.name || 'Staff'}
                            </Text>
                        </View>
                        <View style={[styles.typeBadge, { backgroundColor: typeColor.bg }]}>
                            <Text style={[styles.typeBadgeText, { color: typeColor.text }]}>
                                {leave.leaveType}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.dateSection}>
                        <Calendar size={14} color="#6B7280" />
                        <Text style={styles.dateText}>
                            {formatDate(leave.startDate)} - {formatDate(leave.endDate)}
                        </Text>
                        <View style={styles.daysBadge}>
                            <Text style={styles.daysText}>{leave.totalDays} days</Text>
                        </View>
                    </View>

                    {leave.reason && (
                        <Text style={styles.reasonText} numberOfLines={2}>
                            {leave.reason}
                        </Text>
                    )}

                    {leave.balance && (
                        <View style={styles.balanceSection}>
                            <Text style={styles.balanceLabel}>Leave Balance:</Text>
                            <Text style={styles.balanceValue}>
                                {leave.balance[`${leave.leaveType.toLowerCase()}Leave`]?.balance || 0} remaining
                            </Text>
                        </View>
                    )}

                    <Text style={styles.submittedText}>
                        Submitted {getTimeAgo(leave.submittedAt)}
                    </Text>

                    {activeStatus === 'PENDING' && permissions?.viewer?.canApprove && (
                        <View style={styles.actionButtons}>
                            <HapticTouchable
                                style={styles.rejectButton}
                                onPress={() => handleReject(leave)}
                            >
                                <XCircle size={18} color="#EF4444" />
                                <Text style={styles.rejectText}>Reject</Text>
                            </HapticTouchable>

                            <HapticTouchable
                                style={styles.approveButton}
                                onPress={() => handleApprove(leave)}
                            >
                                <CheckCircle2 size={18} color="#fff" />
                                <Text style={styles.approveText}>Approve</Text>
                            </HapticTouchable>
                        </View>
                    )}

                    {activeStatus !== 'PENDING' && (
                        <View style={styles.reviewInfo}>
                            <Text style={styles.reviewLabel}>
                                {activeStatus === 'APPROVED' ? 'Approved' : 'Rejected'} by:
                            </Text>
                            <Text style={styles.reviewValue}>
                                {leave.reviewer?.name || 'Admin'}
                            </Text>
                        </View>
                    )}
                </View>
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

    const pendingCount = leaves?.filter?.(l => l.status === 'PENDING')?.length || 0;

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#111" />
                </HapticTouchable>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Leave Management</Text>
                    <Text style={styles.headerSubtitle}>
                        {activeStatus === 'PENDING' ? `${leaves?.length || 0} pending` : `${leaves?.length || 0} ${activeStatus.toLowerCase()}`}
                    </Text>
                </View>
                <HapticTouchable onPress={() => setSettingsModalVisible(true)} style={styles.settingsButton}>
                    <Settings size={22} color="#6B7280" />
                </HapticTouchable>
            </View>

            {/* Status Tabs */}
            <View style={styles.tabsContainer}>
                {STATUS_TABS.map((tab) => (
                    <HapticTouchable
                        key={tab.key}
                        style={[
                            styles.tab,
                            activeStatus === tab.key && { backgroundColor: tab.color + '15', borderColor: tab.color }
                        ]}
                        onPress={() => setActiveStatus(tab.key)}
                    >
                        <Text style={[
                            styles.tabText,
                            activeStatus === tab.key && { color: tab.color, fontWeight: '600' }
                        ]}>
                            {tab.label}
                        </Text>
                    </HapticTouchable>
                ))}
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
                }
                showsVerticalScrollIndicator={false}
            >
                {!leaves || leaves.length === 0 ? (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <FileText size={48} color="#9CA3AF" />
                        </View>
                        <Text style={styles.emptyTitle}>No {activeStatus.toLowerCase()} requests</Text>
                        <Text style={styles.emptySubtitle}>
                            {activeStatus === 'PENDING'
                                ? 'All caught up! No pending leave requests.'
                                : `No ${activeStatus.toLowerCase()} leave requests found.`}
                        </Text>
                    </View>
                ) : (
                    leaves.map((leave, index) => renderLeaveCard(leave, index))
                )}
            </ScrollView>

            {/* Rejection Modal */}
            <Modal
                visible={rejectModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setRejectModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Reject Leave</Text>
                            <HapticTouchable onPress={() => setRejectModalVisible(false)}>
                                <X size={24} color="#111" />
                            </HapticTouchable>
                        </View>

                        <Text style={styles.modalSubtitle}>
                            Rejecting leave request from {selectedLeave?.user?.name}
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
                                onPress={() => setRejectModalVisible(false)}
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

            {/* Settings Modal (Director Only) */}
            <Modal
                visible={settingsModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setSettingsModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.settingsModalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Approval Hierarchy</Text>
                            <HapticTouchable onPress={() => setSettingsModalVisible(false)}>
                                <X size={24} color="#111" />
                            </HapticTouchable>
                        </View>

                        <Text style={styles.settingsDescription}>
                            Control who can approve leave requests in your school
                        </Text>

                        <View style={styles.settingsList}>
                            <View style={styles.settingItem}>
                                <View>
                                    <Text style={styles.settingTitle}>Director Override</Text>
                                    <Text style={styles.settingSubtitle}>
                                        Only Director can approve (Admin & Principal read-only)
                                    </Text>
                                </View>
                                <Switch
                                    value={permissions?.config?.directorOverridesAll || false}
                                    onValueChange={(value) => {
                                        permissionsMutation.mutate({ directorOverridesAll: value });
                                    }}
                                    trackColor={{ false: '#E5E7EB', true: '#8B5CF6' }}
                                    thumbColor="#fff"
                                />
                            </View>

                            <View style={styles.settingItem}>
                                <View>
                                    <Text style={styles.settingTitle}>Principal Override</Text>
                                    <Text style={styles.settingSubtitle}>
                                        Admin cannot approve (read-only)
                                    </Text>
                                </View>
                                <Switch
                                    value={permissions?.config?.principalOverridesAdmin || false}
                                    onValueChange={(value) => {
                                        permissionsMutation.mutate({ principalOverridesAdmin: value });
                                    }}
                                    trackColor={{ false: '#E5E7EB', true: '#8B5CF6' }}
                                    thumbColor="#fff"
                                    disabled={permissions?.config?.directorOverridesAll}
                                />
                            </View>

                            <View style={styles.divider} />

                            <View style={styles.settingItem}>
                                <View>
                                    <Text style={styles.settingTitle}>Admin Can Approve</Text>
                                    <Text style={styles.settingSubtitle}>
                                        Allow admins to approve leave requests
                                    </Text>
                                </View>
                                <Switch
                                    value={permissions?.config?.adminCanApproveLeaves && !permissions?.config?.directorOverridesAll && !permissions?.config?.principalOverridesAdmin}
                                    onValueChange={(value) => {
                                        permissionsMutation.mutate({ adminCanApproveLeaves: value });
                                    }}
                                    trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                                    thumbColor="#fff"
                                    disabled={permissions?.config?.directorOverridesAll || permissions?.config?.principalOverridesAdmin}
                                />
                            </View>

                            <View style={styles.settingItem}>
                                <View>
                                    <Text style={styles.settingTitle}>Principal Can Approve</Text>
                                    <Text style={styles.settingSubtitle}>
                                        Allow principals to approve leave requests
                                    </Text>
                                </View>
                                <Switch
                                    value={permissions?.config?.principalCanApproveLeaves && !permissions?.config?.directorOverridesAll}
                                    onValueChange={(value) => {
                                        permissionsMutation.mutate({ principalCanApproveLeaves: value });
                                    }}
                                    trackColor={{ false: '#E5E7EB', true: '#10B981' }}
                                    thumbColor="#fff"
                                    disabled={permissions?.config?.directorOverridesAll}
                                />
                            </View>
                        </View>

                        <HapticTouchable
                            style={styles.closeSettingsButton}
                            onPress={() => setSettingsModalVisible(false)}
                        >
                            <Text style={styles.closeSettingsText}>Done</Text>
                        </HapticTouchable>
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
        gap: 12,
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
        color: '#8B5CF6',
        marginTop: 2,
    },
    settingsButton: {
        padding: 8,
    },
    tabsContainer: {
        flexDirection: 'row',
        padding: 16,
        gap: 10,
    },
    tab: {
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        alignItems: 'center',
    },
    tabText: {
        fontSize: 14,
        color: '#6B7280',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 100,
    },
    leaveCard: {
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
    avatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
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
    typeBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    typeBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    dateSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 6,
    },
    dateText: {
        fontSize: 13,
        color: '#6B7280',
        flex: 1,
    },
    daysBadge: {
        backgroundColor: '#F3F4F6',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    daysText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#4B5563',
    },
    reasonText: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 10,
        lineHeight: 18,
    },
    balanceSection: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        gap: 6,
    },
    balanceLabel: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    balanceValue: {
        fontSize: 12,
        color: '#059669',
        fontWeight: '500',
    },
    submittedText: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 8,
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
    reviewInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        gap: 6,
    },
    reviewLabel: {
        fontSize: 12,
        color: '#9CA3AF',
    },
    reviewValue: {
        fontSize: 12,
        color: '#4B5563',
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1F2937',
        marginBottom: 8,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#6B7280',
        textAlign: 'center',
        paddingHorizontal: 40,
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
    settingsModalContent: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 20,
        marginTop: 'auto',
        maxHeight: '80%',
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
    settingsDescription: {
        fontSize: 14,
        color: '#6B7280',
        marginBottom: 20,
    },
    settingsList: {
        gap: 0,
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    settingTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 2,
    },
    settingSubtitle: {
        fontSize: 12,
        color: '#9CA3AF',
        maxWidth: 220,
    },
    divider: {
        height: 1,
        backgroundColor: '#E5E7EB',
        marginVertical: 8,
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
    closeSettingsButton: {
        marginTop: 20,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#0865fb',
        alignItems: 'center',
    },
    closeSettingsText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#fff',
    },
});
