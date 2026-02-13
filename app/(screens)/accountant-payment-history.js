import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    ActivityIndicator,
    Platform,
    RefreshControl,
    TouchableOpacity,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    ArrowLeft,
    Search,
    User,
    ChevronRight,
    ChevronDown,
    X,
    Receipt,
    Calendar,
    CheckCircle,
    Clock,
    AlertCircle,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../components/HapticTouch';
import api from '../../lib/api';

export default function AccountantPaymentHistoryScreen() {
    // Load user data from SecureStore
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;

    const [step, setStep] = useState('search'); // 'search' | 'history'
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    // Filter state
    const [selectedClassFilter, setSelectedClassFilter] = useState(null);
    const [selectedSectionFilter, setSelectedSectionFilter] = useState(null);
    const [showClassDropdown, setShowClassDropdown] = useState(false);
    const [showSectionDropdown, setShowSectionDropdown] = useState(false);

    // Academic year
    const { data: academicYear } = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId,
        select: (data) => data?.find(y => y.isActive),
    });

    // Fetch classes from API
    const { data: classesData } = useQuery({
        queryKey: ['classes', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/classes`);
            return res.data;
        },
        enabled: !!schoolId,
    });

    // Build unique class names from API data
    const uniqueClasses = useMemo(() => {
        if (!classesData || classesData.length === 0) return [];
        return classesData
            .map(c => c.className)
            .filter(Boolean)
            .sort((a, b) => {
                const numA = parseInt(a) || 0;
                const numB = parseInt(b) || 0;
                return numA - numB;
            });
    }, [classesData]);

    // Build unique sections from API class data based on selected class
    const uniqueSections = useMemo(() => {
        if (!classesData || classesData.length === 0) return [];
        const matchedClass = selectedClassFilter
            ? classesData.find(c => c.className === selectedClassFilter)
            : null;
        if (!matchedClass || !matchedClass.sections) return [];
        return matchedClass.sections
            .map(s => s.name)
            .filter(Boolean)
            .sort();
    }, [classesData, selectedClassFilter]);

    // Student search
    const { data: searchResults, isLoading: searchLoading } = useQuery({
        queryKey: ['acc-history-search', schoolId, searchQuery],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/students?search=${encodeURIComponent(searchQuery)}`);
            return res.data?.students || [];
        },
        enabled: step === 'search' && !!schoolId && searchQuery.length >= 1,
        staleTime: 1000 * 30,
    });

    const { data: allStudents, isLoading: allStudentsLoading } = useQuery({
        queryKey: ['acc-history-search', schoolId, ''],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/students`);
            return res.data?.students || [];
        },
        enabled: step === 'search' && !!schoolId && searchQuery.length < 1,
        staleTime: 1000 * 60,
    });

    // Filtered students
    const filteredStudents = useMemo(() => {
        const baseStudents = searchQuery.length >= 1 ? searchResults : allStudents;
        if (!baseStudents) return [];
        let result = baseStudents;
        if (selectedClassFilter) {
            result = result.filter(s => (s.class?.name || s.class?.className) === selectedClassFilter);
        }
        if (selectedSectionFilter) {
            result = result.filter(s => (s.section?.name || s.section?.sectionName) === selectedSectionFilter);
        }
        return result;
    }, [searchResults, allStudents, searchQuery, selectedClassFilter, selectedSectionFilter]);

    // Payment history for selected student
    const { data: payments, isLoading: paymentsLoading, refetch } = useQuery({
        queryKey: ['acc-payment-history', selectedStudent?.id, academicYear?.id],
        queryFn: async () => {
            const res = await api.get(`/schools/fee/payments/by-student?studentId=${selectedStudent.id}&academicYearId=${academicYear.id}`);
            return res.data;
        },
        enabled: step === 'history' && !!selectedStudent?.id && !!academicYear?.id,
    });

    const handleStudentSelect = (student) => {
        setSelectedStudent({
            ...student,
            userId: student.id,
            admissionNo: student.admissionNumber,
        });
        setStep('history');
        setShowClassDropdown(false);
        setShowSectionDropdown(false);
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const formatCurrency = (amount) => `₹${(amount || 0).toLocaleString('en-IN')}`;

    const getMethodIcon = (method) => {
        switch (method?.toUpperCase()) {
            case 'CASH': return '💵';
            case 'UPI': return '📱';
            case 'ONLINE': return '🌐';
            case 'CHEQUE': return '📝';
            case 'CARD': return '💳';
            case 'BANK_TRANSFER':
            case 'NET_BANKING': return '🏦';
            default: return '💳';
        }
    };

    // ── SEARCH STEP ──
    const renderSearch = () => {
        const loading = searchQuery.length >= 1 ? searchLoading : allStudentsLoading;

        return (
            <View style={{ flex: 1 }}>
                {/* Search Bar */}
                <Animated.View entering={FadeInDown.delay(200).duration(400)} style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                    <View style={s.searchBar}>
                        <Search size={20} color="#4F46E5" />
                        <TextInput
                            style={s.searchInput}
                            placeholder="Search by name or admission no..."
                            placeholderTextColor="#999"
                            value={searchQuery}
                            onChangeText={(text) => {
                                setSearchQuery(text);
                                setSelectedClassFilter(null);
                                setSelectedSectionFilter(null);
                            }}
                            autoCorrect={false}
                            autoFocus
                        />
                        {searchQuery.length > 0 && (
                            <HapticTouchable onPress={() => {
                                setSearchQuery('');
                                setSelectedClassFilter(null);
                                setSelectedSectionFilter(null);
                                setShowClassDropdown(false);
                                setShowSectionDropdown(false);
                            }}>
                                <View style={s.clearButton}>
                                    <X size={14} color="#fff" />
                                </View>
                            </HapticTouchable>
                        )}
                    </View>
                </Animated.View>

                {/* Filter Dropdowns */}
                {searchQuery.length === 0 && (
                    <Animated.View entering={FadeInDown.delay(250).duration(350)} style={s.filterDropdownRow}>
                        {/* Class Dropdown */}
                        <View style={{ flex: 1, position: 'relative', zIndex: 110 }}>
                            <TouchableOpacity
                                onPress={() => {
                                    setShowClassDropdown(!showClassDropdown);
                                    setShowSectionDropdown(false);
                                }}
                                style={[s.dropdownTrigger, selectedClassFilter && s.dropdownTriggerActive]}
                            >
                                <Text style={[s.dropdownTriggerText, selectedClassFilter && s.dropdownTriggerTextActive]}>
                                    {selectedClassFilter || 'Class'}
                                </Text>
                                <ChevronDown size={14} color={selectedClassFilter ? '#4F46E5' : '#888'} />
                            </TouchableOpacity>
                            {showClassDropdown && (
                                <View style={s.dropdownList}>
                                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setSelectedClassFilter(null);
                                                setSelectedSectionFilter(null);
                                                setShowClassDropdown(false);
                                            }}
                                            style={[s.dropdownItem, !selectedClassFilter && s.dropdownItemActive]}
                                        >
                                            <Text style={[s.dropdownItemText, !selectedClassFilter && s.dropdownItemTextActive]}>All Classes</Text>
                                        </TouchableOpacity>
                                        {uniqueClasses.map(cls => (
                                            <TouchableOpacity
                                                key={cls}
                                                onPress={() => {
                                                    setSelectedClassFilter(cls);
                                                    setSelectedSectionFilter(null);
                                                    setShowClassDropdown(false);
                                                }}
                                                style={[s.dropdownItem, selectedClassFilter === cls && s.dropdownItemActive]}
                                            >
                                                <Text style={[s.dropdownItemText, selectedClassFilter === cls && s.dropdownItemTextActive]}>{cls}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>

                        {/* Section Dropdown */}
                        <View style={{ flex: 1, position: 'relative', zIndex: 100 }}>
                            <TouchableOpacity
                                onPress={() => {
                                    if (!selectedClassFilter) return;
                                    setShowSectionDropdown(!showSectionDropdown);
                                    setShowClassDropdown(false);
                                }}
                                style={[
                                    s.dropdownTrigger,
                                    selectedSectionFilter && s.dropdownTriggerActive,
                                    !selectedClassFilter && { opacity: 0.5 },
                                ]}
                            >
                                <Text style={[s.dropdownTriggerText, selectedSectionFilter && s.dropdownTriggerTextActive]}>
                                    {selectedSectionFilter || 'Section'}
                                </Text>
                                <ChevronDown size={14} color={selectedSectionFilter ? '#4F46E5' : '#888'} />
                            </TouchableOpacity>
                            {showSectionDropdown && uniqueSections.length > 0 && (
                                <View style={s.dropdownList}>
                                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                                        <TouchableOpacity
                                            onPress={() => {
                                                setSelectedSectionFilter(null);
                                                setShowSectionDropdown(false);
                                            }}
                                            style={[s.dropdownItem, !selectedSectionFilter && s.dropdownItemActive]}
                                        >
                                            <Text style={[s.dropdownItemText, !selectedSectionFilter && s.dropdownItemTextActive]}>All Sections</Text>
                                        </TouchableOpacity>
                                        {uniqueSections.map(sec => (
                                            <TouchableOpacity
                                                key={sec}
                                                onPress={() => {
                                                    setSelectedSectionFilter(sec);
                                                    setShowSectionDropdown(false);
                                                }}
                                                style={[s.dropdownItem, selectedSectionFilter === sec && s.dropdownItemActive]}
                                            >
                                                <Text style={[s.dropdownItemText, selectedSectionFilter === sec && s.dropdownItemTextActive]}>{sec}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                )}

                {/* Results Count */}
                {filteredStudents.length > 0 && (
                    <View style={s.resultsCount}>
                        <Text style={s.resultsCountText}>
                            {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} found
                        </Text>
                    </View>
                )}

                <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 4 }} contentContainerStyle={{ padding: 16, paddingTop: 4 }}>
                    {loading ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#4F46E5" />
                        </View>
                    ) : filteredStudents && filteredStudents.length > 0 ? (
                        filteredStudents.map((student, index) => {
                            const className = student.class?.name || student.class?.className || '';
                            const sectionName = student.section?.name || student.section?.sectionName || '';
                            const initial = student.name?.charAt(0)?.toUpperCase() || '?';
                            return (
                                <Animated.View key={student.id} entering={FadeInDown.delay(50 + index * 25).duration(250)}>
                                    <HapticTouchable onPress={() => handleStudentSelect(student)}>
                                        <View style={s.studentCard}>
                                            <View style={s.studentAvatar}>
                                                <Text style={s.studentAvatarText}>{initial}</Text>
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.studentName}>{student.name}</Text>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                                    {(className || sectionName) ? (
                                                        <View style={s.classBadge}>
                                                            <Text style={s.classBadgeText}>
                                                                {className}{sectionName ? ` - ${sectionName}` : ''}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                    <Text style={s.admissionText}>
                                                        {student.admissionNumber || student.admissionNo || 'N/A'}
                                                    </Text>
                                                </View>
                                            </View>
                                            <ChevronRight size={16} color="#ccc" />
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            );
                        })
                    ) : searchQuery.length > 0 ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Search size={48} color="#ddd" />
                            <Text style={{ color: '#999', marginTop: 12, fontSize: 15 }}>No students found</Text>
                        </View>
                    ) : null}
                </ScrollView>
            </View>
        );
    };

    // ── HISTORY STEP ──
    const renderHistory = () => (
        <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor="#4F46E5" />}
        >
            {/* Student Info */}
            <Animated.View entering={FadeInDown.duration(300)}>
                <View style={s.infoCard}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                            <View style={s.infoAvatar}>
                                <Text style={s.infoAvatarText}>{selectedStudent?.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.infoName}>{selectedStudent?.name}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                                    <View style={s.classBadge}>
                                        <Text style={s.classBadgeText}>
                                            {selectedStudent?.class?.name || selectedStudent?.class?.className || 'N/A'}
                                        </Text>
                                    </View>
                                    <Text style={s.admissionText}>
                                        {selectedStudent?.admissionNo || selectedStudent?.admissionNumber}
                                    </Text>
                                </View>
                            </View>
                        </View>
                        <HapticTouchable onPress={() => { setStep('search'); setSearchQuery(''); }}>
                            <View style={s.changeBtn}>
                                <Text style={s.changeBtnText}>Change</Text>
                            </View>
                        </HapticTouchable>
                    </View>
                </View>
            </Animated.View>

            {/* Payments */}
            <View style={{ marginTop: 16 }}>
                <Text style={s.sectionTitle}>Payment History</Text>

                {paymentsLoading ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#4F46E5" />
                    </View>
                ) : payments && payments.length > 0 ? (
                    payments.map((payment, index) => (
                        <Animated.View key={payment.id} entering={FadeInDown.delay(50 + index * 30).duration(300)}>
                            <View style={s.paymentCard}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={s.paymentIcon}>
                                        <Text style={{ fontSize: 20 }}>{getMethodIcon(payment.paymentMethod)}</Text>
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                                        <Text style={s.paymentMeta}>
                                            {payment.paymentMethod} • {new Date(payment.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </Text>
                                    </View>
                                    <View style={[s.statusBadge, payment.status === 'SUCCESS' ? s.statusSuccess : s.statusPending]}>
                                        {payment.status === 'SUCCESS'
                                            ? <CheckCircle size={12} color="#10B981" />
                                            : <Clock size={12} color="#F59E0B" />
                                        }
                                        <Text style={[s.statusText, payment.status === 'SUCCESS' ? { color: '#10B981' } : { color: '#F59E0B' }]}>
                                            {payment.status === 'SUCCESS' ? 'Paid' : payment.status}
                                        </Text>
                                    </View>
                                </View>
                                {payment.receiptNumber && (
                                    <View style={s.receiptRow}>
                                        <Receipt size={12} color="#999" />
                                        <Text style={s.receiptText}>{payment.receiptNumber}</Text>
                                    </View>
                                )}
                                {payment.installmentPayments && payment.installmentPayments.length > 0 && (
                                    <View style={s.installmentsRow}>
                                        {payment.installmentPayments.map((ip) => (
                                            <View key={ip.id || ip.installment?.installmentNumber} style={s.installmentBadge}>
                                                <Text style={s.installmentBadgeText}>
                                                    Inst. {ip.installment?.installmentNumber} — {formatCurrency(ip.amount)}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </Animated.View>
                    ))
                ) : (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                        <Receipt size={48} color="#ddd" />
                        <Text style={{ color: '#999', marginTop: 12, fontSize: 15 }}>No payments found</Text>
                    </View>
                )}
            </View>
        </ScrollView>
    );

    return (
        <View style={s.container}>
            <StatusBar style="dark" />
            <Animated.View entering={FadeInDown.duration(400)} style={[s.header, Platform.OS === 'ios' && { paddingTop: 60 }]}>
                <HapticTouchable onPress={() => {
                    if (step === 'history') { setStep('search'); setSearchQuery(''); }
                    else router.back();
                }}>
                    <View style={s.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={s.headerCenter}>
                    <Text style={s.headerTitle}>Payment History</Text>
                    <Text style={s.headerSubtitle}>
                        {step === 'search' ? 'Select a student' : selectedStudent?.name}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {step === 'search' && renderSearch()}
            {step === 'history' && renderHistory()}
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16,
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },

    // Search
    searchBar: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5',
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 14 : 10, gap: 10,
    },
    searchInput: { flex: 1, fontSize: 15, color: '#111', paddingVertical: 0 },
    clearButton: {
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: '#ccc', alignItems: 'center', justifyContent: 'center',
    },

    // Filter Dropdowns
    filterDropdownRow: {
        flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 10, zIndex: 100,
    },
    dropdownTrigger: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#f5f5f5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
        borderWidth: 1, borderColor: '#eee',
    },
    dropdownTriggerActive: {
        backgroundColor: '#EEF2FF', borderColor: '#C7D2FE',
    },
    dropdownTriggerText: { fontSize: 13, color: '#888', fontWeight: '500' },
    dropdownTriggerTextActive: { color: '#4F46E5', fontWeight: '600' },
    dropdownList: {
        position: 'absolute', top: 44, left: 0, right: 0, zIndex: 200,
        backgroundColor: '#fff', borderRadius: 10,
        borderWidth: 1, borderColor: '#eee',
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 8 } }),
    },
    dropdownItem: { paddingHorizontal: 12, paddingVertical: 10 },
    dropdownItemActive: { backgroundColor: '#EEF2FF' },
    dropdownItemText: { fontSize: 13, color: '#444' },
    dropdownItemTextActive: { color: '#4F46E5', fontWeight: '600' },

    // Results count
    resultsCount: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
    resultsCountText: { fontSize: 12, color: '#888', fontWeight: '500' },

    // Student Card
    studentCard: {
        flexDirection: 'row', alignItems: 'center', padding: 14,
        backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 8, gap: 12,
        borderWidth: 1, borderColor: '#f0f0f0',
    },
    studentAvatar: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    },
    studentAvatarText: { fontSize: 18, fontWeight: '700', color: '#4F46E5' },
    studentName: { fontSize: 15, fontWeight: '600', color: '#111' },
    classBadge: {
        backgroundColor: '#ECFDF5', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    },
    classBadgeText: { fontSize: 11, color: '#059669', fontWeight: '600' },
    admissionText: { fontSize: 12, color: '#888' },

    // Info card
    infoCard: {
        backgroundColor: '#f8f9fa', borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: '#f0f0f0',
    },
    infoAvatar: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
    },
    infoAvatarText: { fontSize: 20, fontWeight: '700', color: '#4F46E5' },
    infoName: { fontSize: 18, fontWeight: '700', color: '#111' },
    infoMeta: { fontSize: 13, color: '#666', marginTop: 2 },
    changeBtn: {
        backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
        borderWidth: 1, borderColor: '#e5e5e5',
    },
    changeBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },

    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },

    // Payment card
    paymentCard: {
        backgroundColor: '#f8f9fa', borderRadius: 14, padding: 14,
        marginBottom: 8, borderWidth: 1, borderColor: '#f0f0f0',
    },
    paymentIcon: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#f0f0f0',
    },
    paymentAmount: { fontSize: 16, fontWeight: '700', color: '#111' },
    paymentMeta: { fontSize: 12, color: '#666', marginTop: 2 },
    statusBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    },
    statusSuccess: { backgroundColor: '#D1FAE5' },
    statusPending: { backgroundColor: '#FEF3C7' },
    statusText: { fontSize: 11, fontWeight: '600' },
    receiptRow: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#eee',
    },
    receiptText: { fontSize: 12, color: '#999' },
    installmentsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
    installmentBadge: {
        backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    },
    installmentBadgeText: { fontSize: 11, color: '#4F46E5', fontWeight: '500' },
});
