import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, FlatList, Modal, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useMemo } from 'react';
import { Wallet, ChevronLeft, AlertTriangle, Clock, Users, X, Phone, GraduationCap, Search, CheckCircle, Receipt, Calendar, Filter, ChevronDown } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function FeesPendingScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [showDetailModal, setShowDetailModal] = useState(false);
    const [filter, setFilter] = useState('all'); // all, paid, partial, unpaid, overdue
    const [selectedClass, setSelectedClass] = useState('all');
    const [selectedSection, setSelectedSection] = useState('all');

    // Get user data from SecureStore
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;

    // First fetch academic years to get the active one
    const { data: academicYears } = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
            return Array.isArray(res.data) ? res.data : (res.data?.academicYears || []);
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 10,
    });

    const academicYearId = academicYears?.find(ay => ay.isActive)?.id;

    // Use the fee dashboard API for summary
    const { data: dashboardData, isLoading: dashboardLoading, refetch: refetchDashboard } = useQuery({
        queryKey: ['fee-dashboard', schoolId, academicYearId],
        queryFn: async () => {
            const res = await api.get('/schools/fee/admin/dashboard', {
                params: { schoolId, academicYearId }
            });
            return res.data;
        },
        enabled: !!schoolId && !!academicYearId,
        staleTime: 60 * 1000,
    });

    // Fetch all students with fee status (like web version - no academicYearId filter)
    const { data: studentsData, isLoading: studentsLoading, refetch: refetchStudents } = useQuery({
        queryKey: ['fee-students-list', schoolId],
        queryFn: async () => {
            const res = await api.get('/schools/fee/students/list', {
                params: { schoolId }
            });
            return res.data || [];
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    // Fetch classes for filter
    const { data: classesData } = useQuery({
        queryKey: ['classes', schoolId],
        queryFn: async () => {
            const res = await api.get('/schools/class', { params: { schoolId } });
            return res.data?.classes || res.data || [];
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 10,
    });

    // Fetch selected student's fee details
    const { data: studentFeeDetails, isLoading: detailsLoading } = useQuery({
        queryKey: ['student-fee-details', selectedStudent?.userId, academicYearId],
        queryFn: async () => {
            const res = await api.get(`/schools/fee/students/${selectedStudent.userId}`, {
                params: { academicYearId }
            });
            return res.data;
        },
        enabled: !!selectedStudent?.userId && !!academicYearId,
        staleTime: 30 * 1000,
    });

    const isLoading = dashboardLoading || studentsLoading;

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([refetchDashboard(), refetchStudents()]);
        setRefreshing(false);
    };

    const formatCurrency = (amount) => {
        if (!amount) return '₹0';
        if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`;
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
        return `₹${amount.toLocaleString('en-IN')}`;
    };

    const formatDate = (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Map students from API (handles /schools/fee/students/list format)
    const allStudents = useMemo(() => {
        if (!studentsData || !Array.isArray(studentsData)) return [];
        return studentsData.map(s => {
            const fee = s.fee;
            const hasFee = !!fee;

            // Determine status based on fee data
            let status = 'unpaid';
            if (hasFee) {
                status = fee.status?.toLowerCase() || 'unpaid';
            }

            // Calculate amounts
            const totalFee = fee?.finalAmount || 0;
            const paidAmount = fee?.paidAmount || 0;
            const balanceAmount = fee?.balanceAmount || totalFee;

            return {
                id: s.userId || s.id,
                userId: s.userId || s.id,
                studentName: s.name || 'Unknown',
                profilePicture: s.profilePicture,
                classId: s.classId || s.class?.id,
                class: s.class?.className || s.className || '-',
                sectionId: s.section?.id,
                section: s.section?.name || s.sectionName || '',
                admissionNo: s.admissionNo || '',
                rollNumber: s.rollNumber || '',
                parentPhone: s.parentPhone || s.parent?.phone || '',
                parentName: s.parentName || s.parent?.name || '',
                // Fee data
                totalFee,
                paidAmount,
                balanceAmount,
                status,
                hasFee,
                isOverdue: s.isOverdue || status === 'overdue',
                dueDate: s.nextDueDate || s.dueDate,
            };
        });
    }, [studentsData]);

    // Extract unique classes and sections
    const classes = useMemo(() => {
        const unique = [...new Map(
            allStudents
                .filter(s => s.class && s.class !== '-')
                .map(s => [s.class, { id: s.classId, name: s.class }])
        ).values()];
        return unique.sort((a, b) => a.name.localeCompare(b.name));
    }, [allStudents]);

    const sections = useMemo(() => {
        let studentsToCheck = allStudents;
        if (selectedClass !== 'all') {
            studentsToCheck = allStudents.filter(s => s.class === selectedClass);
        }
        const unique = [...new Set(studentsToCheck.filter(s => s.section).map(s => s.section))];
        return unique.sort();
    }, [allStudents, selectedClass]);

    // Apply search and filters
    const filteredStudents = useMemo(() => {
        let result = allStudents;

        // Apply class filter
        if (selectedClass !== 'all') {
            result = result.filter(s => s.class === selectedClass);
        }

        // Apply section filter
        if (selectedSection !== 'all') {
            result = result.filter(s => s.section === selectedSection);
        }

        // Apply status filter
        if (filter !== 'all') {
            result = result.filter(s => {
                if (filter === 'overdue') return s.isOverdue;
                return s.status === filter;
            });
        }

        // Apply search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(s =>
                s.studentName.toLowerCase().includes(query) ||
                s.admissionNo?.toLowerCase().includes(query) ||
                s.class?.toLowerCase().includes(query)
            );
        }

        return result;
    }, [allStudents, filter, searchQuery, selectedClass, selectedSection]);

    // Map API response for summary
    const summary = {
        totalPending: dashboardData?.summary?.totalBalance || 0,
        totalCollected: dashboardData?.summary?.totalPaid || 0,
        studentCount: allStudents.length,
        overdueCount: dashboardData?.statusCounts?.overdue || 0,
        paidCount: dashboardData?.statusCounts?.paid || 0,
        partialCount: dashboardData?.statusCounts?.partial || 0,
    };

    const FILTERS = [
        { key: 'all', label: 'All', count: allStudents.length },
        { key: 'paid', label: 'Paid', count: allStudents.filter(s => s.status === 'paid').length },
        { key: 'partial', label: 'Partial', count: allStudents.filter(s => s.status === 'partial').length },
        { key: 'unpaid', label: 'Unpaid', count: allStudents.filter(s => s.status === 'unpaid').length },
        { key: 'overdue', label: 'Overdue', count: allStudents.filter(s => s.isOverdue).length },
    ];

    const openStudentDetails = (student) => {
        setSelectedStudent(student);
        setShowDetailModal(true);
    };

    const getStatusColor = (status, isOverdue) => {
        if (isOverdue) return { bg: '#FEE2E2', text: '#DC2626' };
        switch (status?.toLowerCase()) {
            case 'paid': return { bg: '#D1FAE5', text: '#10B981' };
            case 'partial': return { bg: '#FEF3C7', text: '#D97706' };
            default: return { bg: '#FEE2E2', text: '#EF4444' };
        }
    };

    const renderStudent = useCallback(({ item }) => {
        const statusColors = getStatusColor(item.status, item.isOverdue);
        const compactCurrency = (amount) => {
            if (!amount) return '₹0';
            if (amount >= 100000) return `₹${(amount / 1000).toFixed(0)}k`;
            if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`.replace('.0k', 'k');
            return `₹${amount}`;
        };

        const hasPaid = item.paidAmount > 0;
        const hasDue = item.balanceAmount > 0 || (item.hasFee && item.totalFee > 0);
        const showPaidTotal = hasPaid && item.totalFee > 0;

        return (
            <HapticTouchable onPress={() => openStudentDetails(item)}>
                <View style={[styles.studentCard, item.isOverdue && styles.overdueCard]}>
                    {/* Avatar */}
                    <View style={styles.studentAvatar}>
                        {item.profilePicture ? (
                            <Image source={{ uri: item.profilePicture }} style={styles.avatarImage} contentFit="cover" />
                        ) : (
                            <View style={[styles.avatarPlaceholder, { backgroundColor: statusColors.bg }]}>
                                <Text style={[styles.avatarText, { color: statusColors.text }]}>
                                    {item.studentName?.charAt(0)?.toUpperCase()}
                                </Text>
                            </View>
                        )}
                    </View>

                    {/* Student Info */}
                    <View style={styles.studentInfo}>
                        <Text style={styles.studentName} numberOfLines={1}>{item.studentName}</Text>
                        <Text style={styles.studentClass}>{item.class}{item.section ? ` - ${item.section}` : ''}</Text>
                        {item.admissionNo && <Text style={styles.admissionNo}>Adm: {item.admissionNo}</Text>}
                    </View>

                    {/* Fee Info - Right Side */}
                    <View style={styles.feeInfo}>
                        {/* Due Amount - Prominent */}
                        {hasDue ? (
                            <View style={styles.dueContainer}>
                                <Text style={styles.dueLabel}>Due</Text>
                                <Text style={[styles.dueAmount, { color: item.isOverdue ? '#DC2626' : '#EF4444' }]}>
                                    {formatCurrency(item.balanceAmount)}
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.dueContainer}>
                                <Text style={[styles.dueAmount, { color: '#10B981' }]}>PAID</Text>
                            </View>
                        )}

                        {/* Paid/Total - Smaller beneath */}
                        {showPaidTotal && (
                            <View style={styles.paidContainer}>
                                <Text style={styles.paidText}>
                                    <Text style={styles.paidGreen}>{compactCurrency(item.paidAmount)}</Text>
                                    <Text style={styles.paidSlash}> / </Text>
                                    <Text style={styles.paidTotal}>{compactCurrency(item.totalFee)}</Text>
                                </Text>
                            </View>
                        )}

                        {/* Status Badge */}
                        <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                            <Text style={[styles.statusText, { color: statusColors.text }]}>
                                {item.isOverdue ? 'OVERDUE' : item.status?.toUpperCase()}
                            </Text>
                        </View>
                    </View>
                </View>
            </HapticTouchable>
        );
    }, []);

    const ListHeader = () => (
        <>
            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
                <View style={[styles.summaryCard, { backgroundColor: '#D1FAE5' }]}>
                    <CheckCircle size={20} color="#10B981" />
                    <Text style={styles.summaryValue}>{formatCurrency(summary.totalCollected)}</Text>
                    <Text style={styles.summaryLabel}>Collected</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#FEE2E2' }]}>
                    <Wallet size={20} color="#DC2626" />
                    <Text style={styles.summaryValue}>{formatCurrency(summary.totalPending)}</Text>
                    <Text style={styles.summaryLabel}>Pending</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#FECACA' }]}>
                    <AlertTriangle size={20} color="#B91C1C" />
                    <Text style={styles.summaryValue}>{summary.overdueCount}</Text>
                    <Text style={styles.summaryLabel}>Overdue</Text>
                </View>
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Search size={20} color="#9CA3AF" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search by name, admission no..."
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {/* Class & Section Filters */}
            <View style={styles.classFilterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.classFilterChips}>
                        <HapticTouchable onPress={() => { setSelectedClass('all'); setSelectedSection('all'); }}>
                            <View style={[styles.classChip, selectedClass === 'all' && styles.classChipActive]}>
                                <Text style={[styles.classChipText, selectedClass === 'all' && styles.classChipTextActive]}>
                                    All Classes
                                </Text>
                            </View>
                        </HapticTouchable>
                        {classes.map(c => (
                            <HapticTouchable key={c.name} onPress={() => { setSelectedClass(c.name); setSelectedSection('all'); }}>
                                <View style={[styles.classChip, selectedClass === c.name && styles.classChipActive]}>
                                    <Text style={[styles.classChipText, selectedClass === c.name && styles.classChipTextActive]}>
                                        {c.name}
                                    </Text>
                                </View>
                            </HapticTouchable>
                        ))}
                    </View>
                </ScrollView>
            </View>

            {/* Section Filter - only show if class is selected */}
            {selectedClass !== 'all' && sections.length > 0 && (
                <View style={styles.sectionFilterRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.sectionFilterChips}>
                            <HapticTouchable onPress={() => setSelectedSection('all')}>
                                <View style={[styles.sectionChip, selectedSection === 'all' && styles.sectionChipActive]}>
                                    <Text style={[styles.sectionChipText, selectedSection === 'all' && styles.sectionChipTextActive]}>
                                        All Sections
                                    </Text>
                                </View>
                            </HapticTouchable>
                            {sections.map(sec => (
                                <HapticTouchable key={sec} onPress={() => setSelectedSection(sec)}>
                                    <View style={[styles.sectionChip, selectedSection === sec && styles.sectionChipActive]}>
                                        <Text style={[styles.sectionChipText, selectedSection === sec && styles.sectionChipTextActive]}>
                                            {sec}
                                        </Text>
                                    </View>
                                </HapticTouchable>
                            ))}
                        </View>
                    </ScrollView>
                </View>
            )}

            {/* Status Filter Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                <View style={styles.filterChips}>
                    {FILTERS.map(f => (
                        <HapticTouchable key={f.key} onPress={() => setFilter(f.key)}>
                            <View style={[styles.filterChip, filter === f.key && styles.filterChipActive]}>
                                <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                                    {f.label} ({f.count})
                                </Text>
                            </View>
                        </HapticTouchable>
                    ))}
                </View>
            </ScrollView>

            <Text style={styles.listTitle}>
                Students ({filteredStudents.length})
                {selectedClass !== 'all' && ` • ${selectedClass}`}
                {selectedSection !== 'all' && ` - ${selectedSection}`}
            </Text>
        </>
    );

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#EF4444" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Fee Management</Text>
                <View style={{ width: 24 }} />
            </View>

            <FlatList
                data={filteredStudents}
                renderItem={renderStudent}
                keyExtractor={(item) => item.userId || item.id}
                ListHeaderComponent={ListHeader}
                contentContainerStyle={styles.listContainer}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Users size={48} color="#D1D5DB" />
                        <Text style={styles.emptyText}>No students found</Text>
                    </View>
                }
                // Performance optimizations
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={10}
                removeClippedSubviews={true}
                getItemLayout={(data, index) => ({
                    length: 88,
                    offset: 88 * index,
                    index,
                })}
            />

            {/* Student Fee Detail Modal */}
            <Modal
                visible={showDetailModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowDetailModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Fee Details</Text>
                            <HapticTouchable onPress={() => setShowDetailModal(false)}>
                                <View style={styles.modalCloseBtn}>
                                    <X size={20} color="#666" />
                                </View>
                            </HapticTouchable>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {selectedStudent && (
                                <>
                                    {/* Student Info */}
                                    <View style={styles.detailStudentCard}>
                                        <View style={styles.detailAvatarContainer}>
                                            {selectedStudent.profilePicture ? (
                                                <Image source={{ uri: selectedStudent.profilePicture }} style={styles.detailAvatar} contentFit="cover" />
                                            ) : (
                                                <View style={[styles.detailAvatar, styles.avatarPlaceholder]}>
                                                    <Text style={styles.detailAvatarText}>{selectedStudent.studentName?.charAt(0)?.toUpperCase()}</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={styles.detailStudentName}>{selectedStudent.studentName}</Text>
                                        <View style={styles.detailInfoRow}>
                                            <GraduationCap size={14} color="#6B7280" />
                                            <Text style={styles.detailInfoText}>
                                                {selectedStudent.class}{selectedStudent.section ? ` - ${selectedStudent.section}` : ''}
                                            </Text>
                                        </View>
                                        {selectedStudent.admissionNo && (
                                            <Text style={styles.detailAdmNo}>Admission No: {selectedStudent.admissionNo}</Text>
                                        )}
                                        {selectedStudent.parentPhone && (
                                            <View style={styles.detailInfoRow}>
                                                <Phone size={14} color="#6B7280" />
                                                <Text style={styles.detailInfoText}>{selectedStudent.parentPhone}</Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Fee Summary */}
                                    <View style={styles.feeSummaryCard}>
                                        <View style={styles.feeSummaryRow}>
                                            <Text style={styles.feeSummaryLabel}>Total Fee</Text>
                                            <Text style={styles.feeSummaryValue}>{formatCurrency(selectedStudent.totalFee)}</Text>
                                        </View>
                                        <View style={styles.feeSummaryRow}>
                                            <Text style={styles.feeSummaryLabel}>Paid Amount</Text>
                                            <Text style={[styles.feeSummaryValue, { color: '#10B981' }]}>
                                                {formatCurrency(selectedStudent.paidAmount)}
                                            </Text>
                                        </View>
                                        <View style={[styles.feeSummaryRow, styles.balanceRow]}>
                                            <Text style={styles.balanceLabel}>Balance Due</Text>
                                            <Text style={[styles.balanceValue, { color: selectedStudent.balanceAmount > 0 ? '#EF4444' : '#10B981' }]}>
                                                {formatCurrency(selectedStudent.balanceAmount)}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Loading state for details */}
                                    {detailsLoading ? (
                                        <View style={styles.detailsLoading}>
                                            <ActivityIndicator size="small" color="#3B82F6" />
                                            <Text style={styles.detailsLoadingText}>Loading payment history...</Text>
                                        </View>
                                    ) : (
                                        <>
                                            {/* Fee Breakdown */}
                                            {studentFeeDetails?.feeBreakdown?.length > 0 && (
                                                <View style={styles.sectionCard}>
                                                    <Text style={styles.sectionTitle}>Fee Breakdown</Text>
                                                    {studentFeeDetails.feeBreakdown.map((fee, idx) => (
                                                        <View key={idx} style={styles.breakdownRow}>
                                                            <Text style={styles.breakdownName}>{fee.feeName || fee.name}</Text>
                                                            <Text style={styles.breakdownAmount}>{formatCurrency(fee.amount)}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}

                                            {/* Payment History */}
                                            {studentFeeDetails?.payments?.length > 0 && (
                                                <View style={styles.sectionCard}>
                                                    <Text style={styles.sectionTitle}>
                                                        <Receipt size={16} color="#1F2937" /> Payment History
                                                    </Text>
                                                    {studentFeeDetails.payments.map((payment, idx) => (
                                                        <View key={idx} style={styles.paymentRow}>
                                                            <View style={styles.paymentInfo}>
                                                                <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                                                                <Text style={styles.paymentDate}>{formatDate(payment.paidAt || payment.createdAt)}</Text>
                                                                <Text style={styles.paymentMode}>{payment.paymentMode || 'Cash'}</Text>
                                                            </View>
                                                            <View style={[styles.paymentStatusBadge, { backgroundColor: payment.status === 'SUCCESS' ? '#D1FAE5' : '#FEF3C7' }]}>
                                                                <Text style={[styles.paymentStatusText, { color: payment.status === 'SUCCESS' ? '#10B981' : '#D97706' }]}>
                                                                    {payment.status}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}

                                            {/* Installments Due */}
                                            {studentFeeDetails?.installments?.length > 0 && (
                                                <View style={styles.sectionCard}>
                                                    <Text style={styles.sectionTitle}>
                                                        <Calendar size={16} color="#1F2937" /> Installments
                                                    </Text>
                                                    {studentFeeDetails.installments.map((inst, idx) => (
                                                        <View key={idx} style={[styles.installmentRow, inst.isPaid && styles.installmentPaid]}>
                                                            <View style={styles.installmentInfo}>
                                                                <Text style={styles.installmentName}>{inst.name || `Installment ${idx + 1}`}</Text>
                                                                <Text style={styles.installmentDue}>Due: {formatDate(inst.dueDate)}</Text>
                                                            </View>
                                                            <View style={styles.installmentRight}>
                                                                <Text style={styles.installmentAmount}>{formatCurrency(inst.amount)}</Text>
                                                                {inst.isPaid && (
                                                                    <CheckCircle size={16} color="#10B981" />
                                                                )}
                                                            </View>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}

                                            {/* No payment history message */}
                                            {(!studentFeeDetails?.payments || studentFeeDetails.payments.length === 0) && (
                                                <View style={styles.noDataCard}>
                                                    <Receipt size={32} color="#D1D5DB" />
                                                    <Text style={styles.noDataText}>No payment history yet</Text>
                                                </View>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    headerTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    summaryContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
    summaryCard: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
    summaryValue: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginTop: 6 },
    summaryLabel: { fontSize: 10, color: '#6B7280', marginTop: 2 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 16, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: '#1F2937' },
    filterScroll: { marginTop: 12, marginBottom: 8 },
    filterChips: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
    filterChipActive: { backgroundColor: '#3B82F6' },
    filterChipText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    filterChipTextActive: { color: '#FFFFFF' },
    listTitle: { fontSize: 15, fontWeight: '600', color: '#374151', marginHorizontal: 16, marginTop: 12, marginBottom: 8 },
    listContainer: { paddingBottom: 24 },
    studentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    overdueCard: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
    studentAvatar: { marginRight: 12 },
    avatarImage: { width: 44, height: 44, borderRadius: 22 },
    avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 18, fontWeight: '600', color: '#6B7280' },
    studentInfo: { flex: 1 },
    studentName: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    studentClass: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    admissionNo: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
    feeInfo: { alignItems: 'flex-end', minWidth: 90 },
    // Due amount styling
    dueContainer: { alignItems: 'flex-end' },
    dueLabel: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
    dueAmount: { fontSize: 16, fontWeight: '700' },
    // Paid/Total styling
    paidContainer: { marginTop: 2, alignItems: 'flex-end' },
    paidText: { fontSize: 11 },
    paidGreen: { color: '#10B981', fontWeight: '600' },
    paidSlash: { color: '#9CA3AF' },
    paidTotal: { color: '#6B7280' },
    // Status badge
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4 },
    statusText: { fontSize: 10, fontWeight: '600' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 16, color: '#9CA3AF', marginTop: 12 },
    // Modal styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
    modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    detailStudentCard: { alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', marginBottom: 16 },
    detailAvatarContainer: { marginBottom: 12 },
    detailAvatar: { width: 80, height: 80, borderRadius: 40 },
    detailAvatarText: { fontSize: 28, fontWeight: '600', color: '#6B7280' },
    detailStudentName: { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 4 },
    detailInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    detailInfoText: { fontSize: 14, color: '#6B7280' },
    detailAdmNo: { fontSize: 13, color: '#9CA3AF', marginTop: 4 },
    feeSummaryCard: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, marginBottom: 16 },
    feeSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
    feeSummaryLabel: { fontSize: 14, color: '#6B7280' },
    feeSummaryValue: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    balanceRow: { borderTopWidth: 1, borderTopColor: '#E5E7EB', marginTop: 8, paddingTop: 12 },
    balanceLabel: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    balanceValue: { fontSize: 18, fontWeight: '700' },
    detailsLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
    detailsLoadingText: { fontSize: 14, color: '#6B7280' },
    sectionCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
    breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    breakdownName: { fontSize: 14, color: '#374151' },
    breakdownAmount: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
    paymentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    paymentInfo: { flex: 1 },
    paymentAmount: { fontSize: 15, fontWeight: '600', color: '#10B981' },
    paymentDate: { fontSize: 12, color: '#6B7280', marginTop: 2 },
    paymentMode: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
    paymentStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    paymentStatusText: { fontSize: 11, fontWeight: '600' },
    installmentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    installmentPaid: { opacity: 0.6 },
    installmentInfo: { flex: 1 },
    installmentName: { fontSize: 14, fontWeight: '500', color: '#374151' },
    installmentDue: { fontSize: 12, color: '#6B7280', marginTop: 2 },
    installmentRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    installmentAmount: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
    noDataCard: { alignItems: 'center', padding: 32 },
    noDataText: { fontSize: 14, color: '#9CA3AF', marginTop: 8 },
    // Class filter styles
    classFilterRow: { marginTop: 12, marginBottom: 4 },
    classFilterChips: { flexDirection: 'row', paddingHorizontal: 16, gap: 8 },
    classChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E8F4FE', borderWidth: 1, borderColor: '#BFDBFE' },
    classChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
    classChipText: { fontSize: 13, color: '#2563EB', fontWeight: '500' },
    classChipTextActive: { color: '#FFFFFF' },
    // Section filter styles
    sectionFilterRow: { marginTop: 4, marginBottom: 4 },
    sectionFilterChips: { flexDirection: 'row', paddingHorizontal: 16, gap: 6 },
    sectionChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F3E8FF', borderWidth: 1, borderColor: '#DDD6FE' },
    sectionChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
    sectionChipText: { fontSize: 12, color: '#7C3AED', fontWeight: '500' },
    sectionChipTextActive: { color: '#FFFFFF' },
    // Paid/total text
    paidOfTotal: { fontSize: 11, color: '#6B7280', marginTop: 2 },
});
