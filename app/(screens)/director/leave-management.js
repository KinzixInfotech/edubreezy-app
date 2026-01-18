// app/(screens)/director/leave-management.js
import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    RefreshControl,
    Alert,
    Modal,
    TextInput,
    Switch,
    Dimensions,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    Search,
    ChevronDown,
    Phone,
    Mail,
    Briefcase,
    MessageSquare,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn, SlideInUp } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

const STATUS_TABS = [
    { key: 'PENDING', label: 'Pending', color: '#F59E0B', icon: Clock },
    { key: 'APPROVED', label: 'Approved', color: '#10B981', icon: CheckCircle2 },
    { key: 'REJECTED', label: 'Rejected', color: '#EF4444', icon: XCircle },
];

const LEAVE_TYPES = ['ALL', 'CASUAL', 'SICK', 'EARNED', 'EMERGENCY', 'MATERNITY', 'PATERNITY'];

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
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [rejectModalVisible, setRejectModalVisible] = useState(false);
    const [settingsModalVisible, setSettingsModalVisible] = useState(false);
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedLeaveType, setSelectedLeaveType] = useState('ALL');
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
    const { data: leavesData, isLoading, refetch } = useQuery({
        queryKey: ['leave-requests', schoolId, activeStatus],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/attendance/admin/leave-management?status=${activeStatus}`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    // Extract leaves array
    const rawLeaves = Array.isArray(leavesData) ? leavesData : (leavesData?.leaves || []);

    // Apply filters
    const filteredLeaves = useMemo(() => {
        let result = [...rawLeaves];

        // Search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(leave =>
                leave.user?.name?.toLowerCase().includes(query) ||
                leave.user?.email?.toLowerCase().includes(query) ||
                leave.reason?.toLowerCase().includes(query)
            );
        }

        // Leave type filter
        if (selectedLeaveType !== 'ALL') {
            result = result.filter(leave => leave.leaveType === selectedLeaveType);
        }

        return result;
    }, [rawLeaves, searchQuery, selectedLeaveType]);

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
            setDetailModalVisible(false);
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

    const openLeaveDetails = (leave) => {
        setSelectedLeave(leave);
        setDetailModalVisible(true);
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
            year: 'numeric',
        });
    };

    const formatShortDate = (date) => {
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

    const clearFilters = () => {
        setSearchQuery('');
        setSelectedLeaveType('ALL');
    };

    const hasActiveFilters = searchQuery.trim() || selectedLeaveType !== 'ALL';

    const renderLeaveCard = ({ item: leave, index }) => {
        const typeColor = LEAVE_TYPE_COLORS[leave.leaveType] || LEAVE_TYPE_COLORS.CASUAL;
        const isUrgent = activeStatus === 'PENDING' &&
            Math.floor((new Date() - new Date(leave.submittedAt)) / (1000 * 60 * 60 * 24)) > 2;

        return (
            <HapticTouchable onPress={() => openLeaveDetails(leave)}>
                <View style={[styles.leaveCard, isUrgent && styles.urgentCard]}>
                    {isUrgent && (
                        <View style={styles.urgentBadge}>
                            <AlertTriangle size={12} color="#DC2626" />
                            <Text style={styles.urgentText}>Pending {'>'} 48h</Text>
                        </View>
                    )}

                    <View style={styles.cardHeader}>
                        <View style={styles.avatarContainer}>
                            <Text style={styles.avatarText}>{leave.user?.name?.charAt(0) || 'U'}</Text>
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
                            {formatShortDate(leave.startDate)} - {formatShortDate(leave.endDate)}
                        </Text>
                        <View style={styles.daysBadge}>
                            <Text style={styles.daysText}>{leave.totalDays} day{leave.totalDays > 1 ? 's' : ''}</Text>
                        </View>
                    </View>

                    {leave.reason && (
                        <Text style={styles.reasonText} numberOfLines={2}>
                            {leave.reason}
                        </Text>
                    )}

                    {/* Show rejection reason for rejected leaves */}
                    {activeStatus === 'REJECTED' && leave.adminRemarks && (
                        <View style={styles.rejectionReasonContainer}>
                            <MessageSquare size={12} color="#DC2626" />
                            <Text style={styles.rejectionReasonText} numberOfLines={2}>
                                {leave.adminRemarks}
                            </Text>
                        </View>
                    )}

                    <View style={styles.cardFooter}>
                        <Text style={styles.submittedText}>
                            {getTimeAgo(leave.submittedAt)}
                        </Text>

                        {activeStatus === 'PENDING' && permissions?.viewer?.canApprove ? (
                            <View style={styles.quickActions}>
                                <HapticTouchable
                                    style={styles.quickRejectBtn}
                                    onPress={(e) => { e.stopPropagation(); handleReject(leave); }}
                                >
                                    <XCircle size={18} color="#EF4444" />
                                </HapticTouchable>
                                <HapticTouchable
                                    style={styles.quickApproveBtn}
                                    onPress={(e) => { e.stopPropagation(); handleApprove(leave); }}
                                >
                                    <CheckCircle2 size={18} color="#fff" />
                                </HapticTouchable>
                            </View>
                        ) : (
                            <View style={styles.reviewerInfo}>
                                <Text style={styles.reviewerText}>
                                    {activeStatus === 'APPROVED' ? '✓' : '✗'} {leave.reviewer?.name || 'Admin'}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            </HapticTouchable>
        );
    };

    const ListHeader = () => (
        <View style={styles.listHeader}>
            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Search size={18} color="#9CA3AF" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, email, or reason..."
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                {searchQuery.length > 0 && (
                    <HapticTouchable onPress={() => setSearchQuery('')}>
                        <X size={18} color="#9CA3AF" />
                    </HapticTouchable>
                )}
            </View>

            {/* Filter Chips */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipsContainer}
            >
                <HapticTouchable
                    style={[styles.filterChip, filterModalVisible && styles.filterChipActive]}
                    onPress={() => setFilterModalVisible(true)}
                >
                    <Filter size={14} color={hasActiveFilters ? '#7C3AED' : '#6B7280'} />
                    <Text style={[styles.filterChipText, hasActiveFilters && { color: '#7C3AED' }]}>
                        Filters {hasActiveFilters ? '•' : ''}
                    </Text>
                </HapticTouchable>

                {LEAVE_TYPES.slice(1).map((type) => (
                    <HapticTouchable
                        key={type}
                        style={[
                            styles.typeChip,
                            selectedLeaveType === type && {
                                backgroundColor: LEAVE_TYPE_COLORS[type]?.bg,
                                borderColor: LEAVE_TYPE_COLORS[type]?.text,
                            }
                        ]}
                        onPress={() => setSelectedLeaveType(selectedLeaveType === type ? 'ALL' : type)}
                    >
                        <Text style={[
                            styles.typeChipText,
                            selectedLeaveType === type && { color: LEAVE_TYPE_COLORS[type]?.text }
                        ]}>
                            {type}
                        </Text>
                    </HapticTouchable>
                ))}
            </ScrollView>

            {/* Results count */}
            <View style={styles.resultsRow}>
                <Text style={styles.resultsText}>
                    {filteredLeaves.length} {activeStatus.toLowerCase()} request{filteredLeaves.length !== 1 ? 's' : ''}
                </Text>
                {hasActiveFilters && (
                    <HapticTouchable onPress={clearFilters}>
                        <Text style={styles.clearFiltersText}>Clear filters</Text>
                    </HapticTouchable>
                )}
            </View>
        </View>
    );

    if (isLoading || !schoolId) {
        return (
            <SafeAreaView style={styles.loadingContainer} edges={['top']}>
                <StatusBar style="dark" />
                <ActivityIndicator size="large" color="#7C3AED" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#111" />
                </HapticTouchable>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Leave Management</Text>
                    <Text style={styles.headerSubtitle}>
                        {rawLeaves.length} total requests
                    </Text>
                </View>
                <HapticTouchable onPress={() => setSettingsModalVisible(true)} style={styles.settingsButton}>
                    <Settings size={22} color="#6B7280" />
                </HapticTouchable>
            </View>

            {/* Status Tabs */}
            <View style={styles.tabsContainer}>
                {STATUS_TABS.map((tab) => {
                    const Icon = tab.icon;
                    return (
                        <HapticTouchable
                            key={tab.key}
                            style={[
                                styles.tab,
                                activeStatus === tab.key && { backgroundColor: tab.color + '15', borderColor: tab.color }
                            ]}
                            onPress={() => setActiveStatus(tab.key)}
                        >
                            <Icon size={16} color={activeStatus === tab.key ? tab.color : '#9CA3AF'} />
                            <Text style={[
                                styles.tabText,
                                activeStatus === tab.key && { color: tab.color, fontWeight: '600' }
                            ]}>
                                {tab.label}
                            </Text>
                        </HapticTouchable>
                    );
                })}
            </View>

            {/* Leave List */}
            <FlatList
                data={filteredLeaves}
                renderItem={renderLeaveCard}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={ListHeader}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />
                }
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <FileText size={48} color="#9CA3AF" />
                        </View>
                        <Text style={styles.emptyTitle}>
                            {hasActiveFilters ? 'No matching requests' : `No ${activeStatus.toLowerCase()} requests`}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                            {hasActiveFilters
                                ? 'Try adjusting your search or filters'
                                : activeStatus === 'PENDING'
                                    ? 'All caught up! No pending leave requests.'
                                    : `No ${activeStatus.toLowerCase()} leave requests found.`}
                        </Text>
                        {hasActiveFilters && (
                            <HapticTouchable style={styles.clearFiltersBtn} onPress={clearFilters}>
                                <Text style={styles.clearFiltersBtnText}>Clear Filters</Text>
                            </HapticTouchable>
                        )}
                    </View>
                }
                keyboardShouldPersistTaps="handled"
            />

            {/* Leave Detail Modal */}
            <Modal
                visible={detailModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setDetailModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.detailModalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Leave Details</Text>
                            <HapticTouchable onPress={() => setDetailModalVisible(false)}>
                                <X size={24} color="#111" />
                            </HapticTouchable>
                        </View>

                        {selectedLeave && (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {/* User Info */}
                                <View style={styles.detailSection}>
                                    <View style={styles.detailUserRow}>
                                        <View style={styles.detailAvatar}>
                                            <Text style={styles.detailAvatarText}>
                                                {selectedLeave.user?.name?.charAt(0) || 'U'}
                                            </Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.detailUserName}>{selectedLeave.user?.name}</Text>
                                            <Text style={styles.detailUserRole}>
                                                {selectedLeave.user?.teacher?.designation || selectedLeave.user?.role?.name || 'Staff'}
                                            </Text>
                                        </View>
                                        <View style={[
                                            styles.detailTypeBadge,
                                            { backgroundColor: LEAVE_TYPE_COLORS[selectedLeave.leaveType]?.bg }
                                        ]}>
                                            <Text style={[
                                                styles.detailTypeBadgeText,
                                                { color: LEAVE_TYPE_COLORS[selectedLeave.leaveType]?.text }
                                            ]}>
                                                {selectedLeave.leaveType}
                                            </Text>
                                        </View>
                                    </View>

                                    {selectedLeave.user?.email && (
                                        <View style={styles.detailInfoRow}>
                                            <Mail size={14} color="#6B7280" />
                                            <Text style={styles.detailInfoText}>{selectedLeave.user.email}</Text>
                                        </View>
                                    )}
                                    {selectedLeave.user?.phone && (
                                        <View style={styles.detailInfoRow}>
                                            <Phone size={14} color="#6B7280" />
                                            <Text style={styles.detailInfoText}>{selectedLeave.user.phone}</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Leave Details */}
                                <View style={styles.detailSection}>
                                    <Text style={styles.detailSectionTitle}>Leave Period</Text>
                                    <View style={styles.detailGrid}>
                                        <View style={styles.detailGridItem}>
                                            <Text style={styles.detailLabel}>From</Text>
                                            <Text style={styles.detailValue}>{formatDate(selectedLeave.startDate)}</Text>
                                        </View>
                                        <View style={styles.detailGridItem}>
                                            <Text style={styles.detailLabel}>To</Text>
                                            <Text style={styles.detailValue}>{formatDate(selectedLeave.endDate)}</Text>
                                        </View>
                                        <View style={styles.detailGridItem}>
                                            <Text style={styles.detailLabel}>Duration</Text>
                                            <Text style={styles.detailValue}>{selectedLeave.totalDays} day{selectedLeave.totalDays > 1 ? 's' : ''}</Text>
                                        </View>
                                        <View style={styles.detailGridItem}>
                                            <Text style={styles.detailLabel}>Submitted</Text>
                                            <Text style={styles.detailValue}>{getTimeAgo(selectedLeave.submittedAt)}</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Reason */}
                                {selectedLeave.reason && (
                                    <View style={styles.detailSection}>
                                        <Text style={styles.detailSectionTitle}>Reason</Text>
                                        <Text style={styles.detailReasonText}>{selectedLeave.reason}</Text>
                                    </View>
                                )}

                                {/* Leave Balance */}
                                {selectedLeave.balance && (
                                    <View style={styles.detailSection}>
                                        <Text style={styles.detailSectionTitle}>Leave Balance</Text>
                                        <View style={styles.balanceCard}>
                                            <Text style={styles.balanceType}>{selectedLeave.leaveType} Leave</Text>
                                            <Text style={styles.balanceAmount}>
                                                {selectedLeave.balance[`${selectedLeave.leaveType.toLowerCase()}Leave`]?.balance || 0} remaining
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                {/* Status & Review Info */}
                                {selectedLeave.status !== 'PENDING' && (
                                    <View style={styles.detailSection}>
                                        <Text style={styles.detailSectionTitle}>
                                            {selectedLeave.status === 'APPROVED' ? 'Approval' : 'Rejection'} Info
                                        </Text>
                                        <View style={[
                                            styles.statusCard,
                                            { backgroundColor: selectedLeave.status === 'APPROVED' ? '#D1FAE5' : '#FEE2E2' }
                                        ]}>
                                            <View style={styles.statusCardRow}>
                                                <Text style={styles.statusCardLabel}>Status</Text>
                                                <Text style={[
                                                    styles.statusCardValue,
                                                    { color: selectedLeave.status === 'APPROVED' ? '#059669' : '#DC2626' }
                                                ]}>
                                                    {selectedLeave.status}
                                                </Text>
                                            </View>
                                            <View style={styles.statusCardRow}>
                                                <Text style={styles.statusCardLabel}>Reviewed By</Text>
                                                <Text style={styles.statusCardValue}>{selectedLeave.reviewer?.name || 'Admin'}</Text>
                                            </View>
                                            {selectedLeave.reviewedAt && (
                                                <View style={styles.statusCardRow}>
                                                    <Text style={styles.statusCardLabel}>Reviewed On</Text>
                                                    <Text style={styles.statusCardValue}>{formatDate(selectedLeave.reviewedAt)}</Text>
                                                </View>
                                            )}
                                            {selectedLeave.adminRemarks && (
                                                <View style={styles.remarksSection}>
                                                    <Text style={styles.statusCardLabel}>
                                                        {selectedLeave.status === 'REJECTED' ? 'Rejection Reason' : 'Remarks'}
                                                    </Text>
                                                    <Text style={styles.remarksText}>{selectedLeave.adminRemarks}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                )}

                                {/* Action Buttons for Pending */}
                                {selectedLeave.status === 'PENDING' && permissions?.viewer?.canApprove && (
                                    <View style={styles.detailActions}>
                                        <HapticTouchable
                                            style={styles.detailRejectBtn}
                                            onPress={() => {
                                                setDetailModalVisible(false);
                                                setTimeout(() => handleReject(selectedLeave), 300);
                                            }}
                                        >
                                            <XCircle size={20} color="#EF4444" />
                                            <Text style={styles.detailRejectText}>Reject</Text>
                                        </HapticTouchable>

                                        <HapticTouchable
                                            style={styles.detailApproveBtn}
                                            onPress={() => handleApprove(selectedLeave)}
                                        >
                                            <CheckCircle2 size={20} color="#fff" />
                                            <Text style={styles.detailApproveText}>Approve</Text>
                                        </HapticTouchable>
                                    </View>
                                )}
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Rejection Modal */}
            <Modal
                visible={rejectModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setRejectModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.rejectModalContent}>
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
                            placeholder="Enter rejection reason (required)..."
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

            {/* Settings Modal */}
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
                                <View style={{ flex: 1 }}>
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
                                <View style={{ flex: 1 }}>
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
                                <View style={{ flex: 1 }}>
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
                                <View style={{ flex: 1 }}>
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
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    backButton: { padding: 4 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#8B5CF6', marginTop: 2 },
    settingsButton: { padding: 8 },

    // Tabs
    tabsContainer: { flexDirection: 'row', padding: 16, gap: 10 },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    tabText: { fontSize: 13, color: '#6B7280' },

    // List Header
    listHeader: { paddingBottom: 8 },
    listContent: { padding: 16, paddingTop: 0 },

    // Search
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        gap: 10,
        marginBottom: 12,
    },
    searchInput: { flex: 1, fontSize: 15, color: '#1F2937' },

    // Filter chips
    filterChipsContainer: { paddingBottom: 12, gap: 8 },
    filterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    filterChipActive: { borderColor: '#7C3AED', backgroundColor: '#F3E8FF' },
    filterChipText: { fontSize: 13, color: '#6B7280' },
    typeChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    typeChipText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },

    // Results row
    resultsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    resultsText: { fontSize: 13, color: '#6B7280' },
    clearFiltersText: { fontSize: 13, color: '#7C3AED', fontWeight: '600' },

    // Leave Card
    leaveCard: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    urgentCard: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
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
    urgentText: { fontSize: 11, fontWeight: '600', color: '#DC2626' },
    cardHeader: { flexDirection: 'row', alignItems: 'center' },
    avatarContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#EDE9FE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: { fontSize: 16, fontWeight: '700', color: '#7C3AED' },
    cardTitleSection: { flex: 1, marginLeft: 12 },
    cardTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    cardSubtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
    typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    typeBadgeText: { fontSize: 11, fontWeight: '600' },
    dateSection: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
    dateText: { fontSize: 13, color: '#6B7280', flex: 1 },
    daysBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    daysText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
    reasonText: { fontSize: 13, color: '#6B7280', marginTop: 10, lineHeight: 18 },

    // Rejection reason display
    rejectionReasonContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 6,
        marginTop: 10,
        padding: 10,
        backgroundColor: '#FEF2F2',
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#EF4444',
    },
    rejectionReasonText: { flex: 1, fontSize: 12, color: '#991B1B', lineHeight: 16 },

    // Card Footer
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    submittedText: { fontSize: 12, color: '#9CA3AF' },
    quickActions: { flexDirection: 'row', gap: 8 },
    quickRejectBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FEE2E2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    quickApproveBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#10B981',
        alignItems: 'center',
        justifyContent: 'center',
    },
    reviewerInfo: {},
    reviewerText: { fontSize: 12, color: '#6B7280' },

    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 60 },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', paddingHorizontal: 40 },
    clearFiltersBtn: {
        marginTop: 16,
        paddingHorizontal: 20,
        paddingVertical: 10,
        backgroundColor: '#F3E8FF',
        borderRadius: 8,
    },
    clearFiltersBtnText: { fontSize: 14, fontWeight: '600', color: '#7C3AED' },

    // Modal styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
    modalSubtitle: { fontSize: 14, color: '#6B7280', marginBottom: 16 },

    // Detail Modal
    detailModalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        maxHeight: '85%',
    },
    detailSection: { marginBottom: 20 },
    detailSectionTitle: { fontSize: 14, fontWeight: '600', color: '#6B7280', marginBottom: 10 },
    detailUserRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    detailAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#EDE9FE',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    detailAvatarText: { fontSize: 20, fontWeight: '700', color: '#7C3AED' },
    detailUserName: { fontSize: 17, fontWeight: '700', color: '#1F2937' },
    detailUserRole: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    detailTypeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    detailTypeBadgeText: { fontSize: 12, fontWeight: '600' },
    detailInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    detailInfoText: { fontSize: 14, color: '#4B5563' },
    detailGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    detailGridItem: { width: '50%', marginBottom: 12 },
    detailLabel: { fontSize: 12, color: '#9CA3AF' },
    detailValue: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginTop: 2 },
    detailReasonText: { fontSize: 14, color: '#4B5563', lineHeight: 20 },
    balanceCard: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#F0FDF4',
        padding: 14,
        borderRadius: 10,
    },
    balanceType: { fontSize: 14, fontWeight: '500', color: '#166534' },
    balanceAmount: { fontSize: 14, fontWeight: '600', color: '#059669' },
    statusCard: { padding: 14, borderRadius: 10 },
    statusCardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    statusCardLabel: { fontSize: 13, color: '#6B7280' },
    statusCardValue: { fontSize: 13, fontWeight: '600', color: '#1F2937' },
    remarksSection: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' },
    remarksText: { fontSize: 14, color: '#1F2937', marginTop: 6, lineHeight: 20 },
    detailActions: { flexDirection: 'row', gap: 12, marginTop: 10 },
    detailRejectBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#FEE2E2',
    },
    detailRejectText: { fontSize: 15, fontWeight: '600', color: '#EF4444' },
    detailApproveBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#10B981',
    },
    detailApproveText: { fontSize: 15, fontWeight: '600', color: '#fff' },

    // Reject Modal
    rejectModalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
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
    modalButtons: { flexDirection: 'row', gap: 12, marginTop: 20 },
    cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center' },
    cancelButtonText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
    confirmRejectButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#EF4444', alignItems: 'center' },
    confirmRejectText: { fontSize: 15, fontWeight: '600', color: '#fff' },

    // Settings Modal
    settingsModalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 20,
        maxHeight: '80%',
    },
    settingsDescription: { fontSize: 14, color: '#6B7280', marginBottom: 20 },
    settingsList: { gap: 0 },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    settingTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937', marginBottom: 2 },
    settingSubtitle: { fontSize: 12, color: '#9CA3AF', maxWidth: 220 },
    divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 8 },
    closeSettingsButton: { marginTop: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: '#0865fb', alignItems: 'center' },
    closeSettingsText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
