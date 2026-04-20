import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    FlatList,
    TextInput,
    ActivityIndicator,
    Platform,
    Alert,
    Share,
    KeyboardAvoidingView,
    TouchableOpacity,
    Dimensions,
    Modal,
} from 'react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    ArrowLeft,
    Search,
    ChevronRight,
    X,
    DollarSign,
    CheckCircle,
    Calendar,
    Receipt,
    Percent,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'expo-image';
import HapticTouchable from '../components/HapticTouch';
import api from '../../lib/api';

export default function AccountantCollectFeeScreen() {
    const queryClient = useQueryClient();
    const params = useLocalSearchParams();

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

    // Flow steps: 'search' → 'payment' → 'success'
    const [step, setStep] = useState('search');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClassFilter, setSelectedClassFilter] = useState(null);
    const [selectedSectionFilter, setSelectedSectionFilter] = useState(null);
    const [showClassDropdown, setShowClassDropdown] = useState(false);
    const [showSectionDropdown, setShowSectionDropdown] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [discountModalVisible, setDiscountModalVisible] = useState(false);
    const [ledgerModalVisible, setLedgerModalVisible] = useState(false);
    const [selectedLedgerEntry, setSelectedLedgerEntry] = useState(null);
    const [discountAmount, setDiscountAmount] = useState('');
    const [discountReason, setDiscountReason] = useState('');

    // Payment form state
    const [paymentMethod, setPaymentMethod] = useState('CASH');
    const [remarks, setRemarks] = useState('');
    const [selectedInstallmentIds, setSelectedInstallmentIds] = useState([]);
    const [lastPaymentResult, setLastPaymentResult] = useState(null);

    // Academic year
    const { data: academicYears } = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId,
        select: (data) => data?.find(y => y.isActive),
    });

    const {
        data: studentsPages,
        isLoading: studentsLoading,
        isFetchingNextPage,
        fetchNextPage,
        hasNextPage,
        refetch: refetchStudents,
    } = useInfiniteQuery({
        queryKey: ['accountant-student-search', schoolId, searchQuery, selectedClassFilter, selectedSectionFilter],
        queryFn: async ({ pageParam = 1 }) => {
            const params = new URLSearchParams({
                page: String(pageParam),
                limit: '25',
            });
            if (searchQuery) params.set('search', searchQuery);
            const res = await api.get(`/schools/${schoolId}/director/students?${params.toString()}`);
            return res.data;
        },
        enabled: step === 'search' && !!schoolId,
        staleTime: 1000 * 30,
        initialPageParam: 1,
        getNextPageParam: (lastPage) => lastPage?.pagination?.nextPage ?? undefined,
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

    // Filtered students based on selected class + section
    const filteredStudents = useMemo(() => {
        const baseStudents = studentsPages?.pages?.flatMap((page) => page?.students || []) || [];
        if (!baseStudents) return [];
        let result = baseStudents;
        if (selectedClassFilter) {
            result = result.filter(s => (s.class?.name || s.class?.className) === selectedClassFilter);
        }
        if (selectedSectionFilter) {
            result = result.filter(s => (s.section?.name || s.section?.sectionName) === selectedSectionFilter);
        }
        return result;
    }, [studentsPages, selectedClassFilter, selectedSectionFilter]);

    useEffect(() => {
        if (!params?.selectedStudent || selectedStudent) return;
        try {
            const parsed = JSON.parse(params.selectedStudent);
            if (parsed?.id || parsed?.userId) {
                setSelectedStudent({
                    ...parsed,
                    id: parsed.id || parsed.userId,
                    userId: parsed.userId || parsed.id,
                    admissionNo: parsed.admissionNo || parsed.admissionNumber,
                });
                setStep('payment');
            }
        } catch (error) {
            console.warn('Failed to parse selected student param:', error);
        }
    }, [params?.selectedStudent, selectedStudent]);

    // Student fee details when student is selected
    const { data: studentFee, isLoading: feeLoading } = useQuery({
        queryKey: ['student-fee-detail', selectedStudent?.id, academicYears?.id],
        queryFn: async () => {
            const res = await api.get(`/schools/fee/students/${selectedStudent.id}?academicYearId=${academicYears.id}`);
            return res.data;
        },
        enabled: step === 'payment' && !!selectedStudent && !!academicYears?.id,
    });

    const applyDiscountMutation = useMutation({
        mutationFn: async ({ ledgerEntryId, amount, reason }) => {
            const res = await api.patch('/schools/fee/ledger', {
                action: 'discount',
                ledgerEntryId,
                discountAmount: Number(amount),
                reason,
                userId: userData?.id,
            });
            return res.data;
        },
        onSuccess: async () => {
            setDiscountModalVisible(false);
            setSelectedLedgerEntry(null);
            setDiscountAmount('');
            setDiscountReason('');
            await queryClient.invalidateQueries({ queryKey: ['student-fee-detail', selectedStudent?.id, academicYears?.id] });
            await queryClient.invalidateQueries({ queryKey: ['home', 'accountantDashboard', schoolId, userData?.id] });
            Alert.alert('Success', 'Discount updated successfully.');
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || error.message || 'Could not apply discount');
        },
    });

    // All installments sorted
    const allInstallments = useMemo(() => {
        if (!studentFee?.installments) return [];
        return [...studentFee.installments].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    }, [studentFee]);

    // Pending installments only
    const pendingInstallments = useMemo(() => {
        return allInstallments.filter(i => i.status !== 'PAID');
    }, [allInstallments]);

    // Auto-calculate payment amount from selected installments
    const computedAmount = useMemo(() => {
        if (selectedInstallmentIds.length === 0) return 0;
        return allInstallments
            .filter(i => selectedInstallmentIds.includes(i.id))
            .reduce((sum, inst) => sum + (inst.amount - (inst.paidAmount || 0)), 0);
    }, [selectedInstallmentIds, allInstallments]);

    const studentProfile = studentFee?.studentProfile;
    const ledgerMonths = studentFee?.ledgerMonths || [];
    const summary = studentFee?.summary;
    const collectionProgress = summary?.collectionProgress || 0;

    // Record payment mutation
    const recordPayment = useMutation({
        mutationFn: async (data) => {
            const res = await api.post('/schools/fee/payments/record-offline', data);
            return res.data;
        },
        onSuccess: (data) => {
            setLastPaymentResult(data.payment);
            setStep('success');
            queryClient.invalidateQueries(['accountant-student-search']);
            queryClient.invalidateQueries(['student-fee-detail']);
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || error.message || 'Failed to record payment');
        },
    });

    const handleStudentSelect = (student) => {
        setSelectedStudent({
            ...student,
            userId: student.id,
            admissionNo: student.admissionNumber,
        });
        setStep('payment');
        setPaymentMethod('CASH');
        setRemarks('');
        setSelectedInstallmentIds([]);
        setShowClassDropdown(false);
        setShowSectionDropdown(false);
    };

    const handleQuickFill = (type) => {
        if (!studentFee) return;
        if (type === 'full') {
            // Select all pending installments
            setSelectedInstallmentIds(pendingInstallments.map(i => i.id));
        } else if (type === 'next' && pendingInstallments.length > 0) {
            // Select just the next pending installment
            setSelectedInstallmentIds([pendingInstallments[0].id]);
        }
    };

    const openDiscountModal = (entry) => {
        setSelectedLedgerEntry(entry);
        setDiscountAmount(entry?.discountAmount ? String(entry.discountAmount) : '');
        setDiscountReason('');
        setDiscountModalVisible(true);
    };

    const submitDiscount = () => {
        const numericDiscount = Number(discountAmount);
        if (!selectedLedgerEntry?.id || !numericDiscount || numericDiscount < 0) {
            Alert.alert('Invalid amount', 'Enter a valid discount amount.');
            return;
        }
        applyDiscountMutation.mutate({
            ledgerEntryId: selectedLedgerEntry.id,
            amount: numericDiscount,
            reason: discountReason || 'Adjusted from accountant mobile app',
        });
    };

    const toggleInstallment = (id) => {
        // Don't allow toggling paid installments
        const inst = allInstallments.find(i => i.id === id);
        if (inst?.status === 'PAID') return;
        setSelectedInstallmentIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const handleRecordPayment = () => {
        if (!selectedStudent || !studentFee || computedAmount <= 0) {
            Alert.alert('Error', 'Please select at least one installment to pay');
            return;
        }

        if (computedAmount > studentFee.balanceAmount) {
            Alert.alert('Error', `Amount exceeds balance of ₹${studentFee.balanceAmount}`);
            return;
        }

        Alert.alert(
            'Confirm Payment',
            `Record ${formatCurrency(computedAmount)} payment for ${selectedStudent.name} via ${paymentMethod}?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Record',
                    onPress: () => {
                        recordPayment.mutate({
                            studentFeeId: studentFee.id,
                            studentId: selectedStudent.id,
                            schoolId,
                            academicYearId: academicYears.id,
                            amount: computedAmount,
                            paymentMethod,
                            remarks: remarks || undefined,
                            installmentIds: selectedInstallmentIds,
                        });
                    },
                },
            ]
        );
    };

    const resetAndGoBack = () => {
        setStep('search');
        setSelectedStudent(null);
        setSearchQuery('');
        setLastPaymentResult(null);
    };

    const formatCurrency = (amount) => {
        return `₹${(amount || 0).toLocaleString('en-IN')}`;
    };

    const handleShareStudentReport = async () => {
        if (!selectedStudent || !summary) return;
        await Share.share({
            title: `${selectedStudent.name} fee report`,
            message: [
                `${selectedStudent.name} Fee Summary`,
                `Admission No: ${selectedStudent.admissionNo || selectedStudent.admissionNumber || 'N/A'}`,
                `Expected: ${formatCurrency(summary.expectedCollection)}`,
                `Collected: ${formatCurrency(summary.totalFeesCollected)}`,
                `Pending: ${formatCurrency(summary.feesPendingAcrossYear)}`,
                `Discount: ${formatCurrency(summary.discountGiven)}`,
                `Late Fee: ${formatCurrency(summary.lateFeeAccrued)}`,
                `Collection Progress: ${collectionProgress}%`,
            ].join('\n'),
        });
    };

    const paymentMethods = [
        { key: 'CASH', label: 'Cash', icon: '💵' },
        { key: 'UPI', label: 'UPI', icon: '📱' },
        { key: 'CHEQUE', label: 'Cheque', icon: '📝' },
        { key: 'CARD', label: 'Card', icon: '💳' },
        { key: 'NET_BANKING', label: 'Net Banking', icon: '🏦' },
        { key: 'DEMAND_DRAFT', label: 'DD', icon: '📄' },
    ];

    // ── STEP 1: SEARCH ──
    const renderSearch = () => {
        const loading = studentsLoading;

        const getClassSectionLabel = (student) => {
            const className = student.class?.name || student.class?.className;
            const sectionName = student.section?.name || student.section?.sectionName;
            if (!className) return 'N/A';
            return sectionName ? `Class ${className} - ${sectionName}` : `Class ${className}`;
        };

        const renderStudentItem = ({ item: student, index }) => (
            <Animated.View entering={FadeInDown.delay(40 + index * 20).duration(250)}>
                <HapticTouchable onPress={() => handleStudentSelect(student)}>
                    <View style={s.studentCard}>
                        <View style={s.studentAvatar}>
                            {/* <Text style={s.studentAvatarText}>
                                {(student.name || '?').charAt(0).toUpperCase()}
                            </Text> */}
                            {student?.profilePicture && student.profilePicture !== 'default.png' ? (
                                <Image source={{ uri: student.profilePicture }} style={s.profileImage} />
                            ) : (
                                <View style={s.studentAvatarFallback}>
                                    <Text style={s.studentAvatarText}>
                                        {(student?.name || '?').charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.studentName}>{student.name}</Text>
                            <View style={s.studentMetaRow}>
                                <View style={s.classBadge}>
                                    <Text style={s.classBadgeText}>{getClassSectionLabel(student)}</Text>
                                </View>
                                <Text style={s.admissionText}>
                                    {student.admissionNumber || student.admissionNo || 'N/A'}
                                </Text>
                            </View>
                        </View>
                        <ChevronRight size={16} color="#CBD5E1" />
                    </View>
                </HapticTouchable>
            </Animated.View>
        );

        return (
            <View style={{ flex: 1 }}>
                {/* Search bar */}
                <Animated.View entering={FadeInDown.delay(150).duration(400)} style={s.searchBarWrapper}>
                    <View style={s.searchBar}>
                        <View style={s.searchIconWrapper}>
                            <Search size={18} color="#6366F1" />
                        </View>
                        <TextInput
                            style={s.searchInput}
                            placeholder="Search by name or admission no..."
                            placeholderTextColor="#94A3B8"
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
                            <HapticTouchable onPress={() => { setSearchQuery(''); setSelectedClassFilter(null); setSelectedSectionFilter(null); }}>
                                <View style={s.clearButton}>
                                    <X size={14} color="#fff" />
                                </View>
                            </HapticTouchable>
                        )}
                    </View>
                </Animated.View>

                {/* Filters — OUTSIDE FlatList so dropdown z-index works */}
                {uniqueClasses.length > 0 && (
                    <Animated.View entering={FadeInDown.delay(200).duration(350)} style={[s.filterDropdownRow, { zIndex: 200 }]}>
                        <View style={{ flex: 1, position: 'relative', zIndex: 110 }}>
                            <Text style={s.filterDropdownLabel}>Class</Text>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => { setShowClassDropdown(!showClassDropdown); setShowSectionDropdown(false); }}
                                style={[s.filterDropdown, showClassDropdown && s.filterDropdownOpen]}
                            >
                                <Text style={[s.filterDropdownValue, !selectedClassFilter && s.filterDropdownPlaceholder]}>
                                    {selectedClassFilter ? `Class ${selectedClassFilter}` : 'All Classes'}
                                </Text>
                                <ChevronRight size={14} color="#94A3B8" style={{ transform: [{ rotate: showClassDropdown ? '90deg' : '0deg' }] }} />
                            </TouchableOpacity>
                            {showClassDropdown && (
                                <View style={s.dropdownMenu}>
                                    <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                                        <TouchableOpacity
                                            onPress={() => { setSelectedClassFilter(null); setSelectedSectionFilter(null); setShowClassDropdown(false); }}
                                            style={[s.dropdownItem, !selectedClassFilter && s.dropdownItemActive]}
                                        >
                                            <Text style={[s.dropdownItemText, !selectedClassFilter && s.dropdownItemTextActive]}>All Classes</Text>
                                        </TouchableOpacity>
                                        {uniqueClasses.map((cls) => (
                                            <TouchableOpacity
                                                key={cls}
                                                onPress={() => { setSelectedClassFilter(cls); setSelectedSectionFilter(null); setShowClassDropdown(false); }}
                                                style={[s.dropdownItem, selectedClassFilter === cls && s.dropdownItemActive]}
                                            >
                                                <Text style={[s.dropdownItemText, selectedClassFilter === cls && s.dropdownItemTextActive]}>Class {cls}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                </View>
                            )}
                        </View>

                        {uniqueSections.length > 0 && (
                            <View style={{ flex: 1, position: 'relative', zIndex: 100 }}>
                                <Text style={s.filterDropdownLabel}>Section</Text>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => { setShowSectionDropdown(!showSectionDropdown); setShowClassDropdown(false); }}
                                    style={[s.filterDropdown, showSectionDropdown && s.filterDropdownOpen]}
                                >
                                    <Text style={[s.filterDropdownValue, !selectedSectionFilter && s.filterDropdownPlaceholder]}>
                                        {selectedSectionFilter || 'All Sections'}
                                    </Text>
                                    <ChevronRight size={14} color="#94A3B8" style={{ transform: [{ rotate: showSectionDropdown ? '90deg' : '0deg' }] }} />
                                </TouchableOpacity>
                                {showSectionDropdown && (
                                    <View style={s.dropdownMenu}>
                                        <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
                                            <TouchableOpacity
                                                onPress={() => { setSelectedSectionFilter(null); setShowSectionDropdown(false); }}
                                                style={[s.dropdownItem, !selectedSectionFilter && s.dropdownItemActive]}
                                            >
                                                <Text style={[s.dropdownItemText, !selectedSectionFilter && s.dropdownItemTextActive]}>All Sections</Text>
                                            </TouchableOpacity>
                                            {uniqueSections.map((sec) => (
                                                <TouchableOpacity
                                                    key={sec}
                                                    onPress={() => { setSelectedSectionFilter(sec); setShowSectionDropdown(false); }}
                                                    style={[s.dropdownItem, selectedSectionFilter === sec && s.dropdownItemActive]}
                                                >
                                                    <Text style={[s.dropdownItemText, selectedSectionFilter === sec && s.dropdownItemTextActive]}>{sec}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </ScrollView>
                                    </View>
                                )}
                            </View>
                        )}
                    </Animated.View>
                )}

                {!studentsLoading && filteredStudents.length > 0 && (
                    <View style={s.resultsCountRow}>
                        <Text style={s.resultsCountText}>
                            {filteredStudents.length} loaded{hasNextPage ? ' • more available' : ''}
                        </Text>
                    </View>
                )}

                {/* FlatList with empty ListHeaderComponent */}
                <FlatList
                    data={filteredStudents}
                    keyExtractor={(item) => `${item.id}`}
                    renderItem={renderStudentItem}
                    style={{ flex: 1 }}
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20, paddingTop: 8 }}
                    onEndReachedThreshold={0.35}
                    onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
                    refreshing={false}
                    onRefresh={refetchStudents}
                    ListEmptyComponent={
                        studentsLoading ? (
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <ActivityIndicator size="large" color="#6366F1" />
                                <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Loading students...</Text>
                            </View>
                        ) : (
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <Search size={48} color="#E2E8F0" />
                                <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 15, fontWeight: '500' }}>No students found</Text>
                                <Text style={{ color: '#CBD5E1', marginTop: 4, fontSize: 13 }}>Try a different search or filter</Text>
                            </View>
                        )
                    }
                    ListFooterComponent={isFetchingNextPage ? (
                        <View style={{ paddingVertical: 20 }}>
                            <ActivityIndicator color="#6366F1" />
                        </View>
                    ) : <View style={{ height: 20 }} />}
                />
            </View>
        );
    };

    // ── STEP 2: PAYMENT FORM ──
    const renderPayment = () => (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 16 }}
                automaticallyAdjustKeyboardInsets={true}
            >
                {/* Student Info Card */}
                <Animated.View entering={FadeInDown.duration(300)}>
                    <View style={s.infoCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                {studentProfile?.profilePicture ? (
                                    <Image source={{ uri: studentProfile.profilePicture }} style={s.profileImage} />
                                ) : (
                                    <View style={s.profileAvatarFallback}>
                                        <Text style={s.profileAvatarText}>
                                            {(selectedStudent?.name || '?').charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={s.infoName}>{selectedStudent?.name}</Text>
                                    <Text style={s.infoMeta}>
                                        {selectedStudent?.admissionNo || selectedStudent?.admissionNumber} • {(() => {
                                            const className = selectedStudent?.class?.name || selectedStudent?.class?.className || studentProfile?.className;
                                            const sectionName = selectedStudent?.section?.name || selectedStudent?.section?.sectionName || studentProfile?.sectionName;
                                            if (!className) return 'N/A';
                                            return sectionName ? `Class ${className} - ${sectionName}` : `Class ${className}`;
                                        })()}
                                    </Text>
                                </View>
                            </View>

                        </View>

                        {feeLoading ? (
                            <View style={{ padding: 16, alignItems: 'center' }}>
                                <ActivityIndicator size="small" color="#10B981" />
                            </View>
                        ) : studentFee ? (
                            <>
                                <View style={s.guardianRow}>
                                    {studentProfile?.fatherName ? <Text style={s.guardianLine}>Father: {studentProfile.fatherName}</Text> : null}
                                    {studentProfile?.motherName ? <Text style={s.guardianLine}>Mother: {studentProfile.motherName}</Text> : null}
                                    {studentProfile?.guardianName ? (
                                        <Text style={s.guardianLine}>
                                            {studentProfile.guardianRelation || 'Guardian'}: {studentProfile.guardianName}
                                        </Text>
                                    ) : null}
                                    {studentProfile?.joinedOnLabel ? <Text style={s.guardianLine}>Joined: {studentProfile.joinedOnLabel}</Text> : null}
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <HapticTouchable onPress={() => router.push({
                                        pathname: '/(screens)/accountant-payment-history',
                                        params: {
                                            selectedStudent: JSON.stringify(selectedStudent),
                                        },
                                    })}>
                                        <View style={s.changeBtn}>
                                            <Receipt size={14} color="#64748B" />
                                            <Text style={s.changeBtnText}>History</Text>
                                        </View>
                                    </HapticTouchable>
                                    <HapticTouchable onPress={() => { setStep('search'); setSearchQuery(''); }}>
                                        <View style={s.changeBtn}>
                                            <Text style={s.changeBtnText}>Change</Text>
                                        </View>
                                    </HapticTouchable>
                                </View>
                                <View style={s.feeRow}>
                                    <View style={s.feeStat}>
                                        <Text style={s.feeStatLabel}>Total</Text>
                                        <Text style={s.feeStatValue}>{formatCurrency(studentFee.finalAmount || studentFee.originalAmount)}</Text>
                                    </View>
                                    <View style={[s.feeStat, { borderLeftWidth: 1, borderLeftColor: '#f0f0f0' }]}>
                                        <Text style={s.feeStatLabel}>Paid</Text>
                                        <Text style={[s.feeStatValue, { color: '#10B981' }]}>{formatCurrency(studentFee.paidAmount)}</Text>
                                    </View>
                                    <View style={[s.feeStat, { borderLeftWidth: 1, borderLeftColor: '#f0f0f0' }]}>
                                        <Text style={s.feeStatLabel}>Balance</Text>
                                        <Text style={[s.feeStatValue, { color: '#EF4444' }]}>{formatCurrency(studentFee.balanceAmount)}</Text>
                                    </View>
                                </View>
                                <View style={[s.feeRow, { marginTop: 10 }]}>
                                    <View style={s.feeStat}>
                                        <Text style={s.feeStatLabel}>Discount</Text>
                                        <Text style={[s.feeStatValue, { color: '#7C3AED' }]}>{formatCurrency(summary?.discountGiven)}</Text>
                                    </View>
                                    <View style={[s.feeStat, { borderLeftWidth: 1, borderLeftColor: '#f0f0f0' }]}>
                                        <Text style={s.feeStatLabel}>Expected</Text>
                                        <Text style={s.feeStatValue}>{formatCurrency(summary?.expectedCollection)}</Text>
                                    </View>
                                    <View style={[s.feeStat, { borderLeftWidth: 1, borderLeftColor: '#f0f0f0' }]}>
                                        <Text style={s.feeStatLabel}>Late Fee</Text>
                                        <Text style={[s.feeStatValue, { color: '#F59E0B' }]}>{formatCurrency(summary?.lateFeeAccrued)}</Text>
                                    </View>
                                </View>
                                <View style={{ marginTop: 14 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <Text style={s.progressLabel}>Collection Progress</Text>
                                        <Text style={s.progressValue}>{collectionProgress}%</Text>
                                    </View>
                                    <View style={s.progressTrack}>
                                        <View style={[s.progressFill, { width: `${collectionProgress}%` }]} />
                                    </View>
                                </View>
                            </>
                        ) : (
                            <View style={{ paddingTop: 12 }}>
                                <Text style={{ color: '#999', fontSize: 13 }}>No fee assigned for this student</Text>
                            </View>
                        )}
                    </View>
                </Animated.View>

                {studentFee && studentFee.balanceAmount > 0 && (
                    <>
                        {/* Quick Fill Buttons */}
                        <Animated.View entering={FadeInDown.delay(100).duration(300)} style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                            <HapticTouchable style={{ flex: 1 }} onPress={() => handleQuickFill('full')}>
                                <View style={s.quickFillBtn}>
                                    <DollarSign size={14} color="#10B981" />
                                    <Text style={s.quickFillText}>Full Balance</Text>
                                </View>
                            </HapticTouchable>
                            {pendingInstallments.length > 0 && (
                                <HapticTouchable style={{ flex: 1 }} onPress={() => handleQuickFill('next')}>
                                    <View style={s.quickFillBtn}>
                                        <Calendar size={14} color="#0469ff" />
                                        <Text style={s.quickFillText}>Next Installment</Text>
                                    </View>
                                </HapticTouchable>
                            )}
                        </Animated.View>

                        {/* Installments */}
                        {allInstallments.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(150).duration(300)} style={{ marginTop: 16 }}>
                                <Text style={s.sectionLabel}>Pay by Month</Text>
                                <View style={s.installmentList}>
                                    {allInstallments.map((inst) => {
                                        const isPaid = inst.status === 'PAID';
                                        const balance = inst.amount - (inst.paidAmount || 0);
                                        const isSelected = isPaid || selectedInstallmentIds.includes(inst.id);
                                        return (
                                            <HapticTouchable key={inst.id} onPress={() => toggleInstallment(inst.id)} disabled={isPaid}>
                                                <View style={[s.installmentItem, isSelected && s.installmentItemSelected, isPaid && { opacity: 0.7, backgroundColor: '#F0FDF4' }]}>
                                                    <View style={[s.checkbox, isSelected && s.checkboxChecked, isPaid && { backgroundColor: '#10B981', borderColor: '#10B981' }]}>
                                                        {isSelected && <CheckCircle size={14} color="#fff" />}
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[s.installmentTitle, isPaid && { color: '#666' }]}>{inst.monthLabel || `Installment ${inst.installmentNumber}`}</Text>
                                                        <Text style={s.installmentDue}>
                                                            {isPaid ? 'Paid' : `Due: ${new Date(inst.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                                                        </Text>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <Text style={[s.installmentAmount, isPaid ? { color: '#10B981' } : inst.isOverdue ? { color: '#EF4444' } : {}]}>
                                                            {isPaid ? formatCurrency(inst.amount) : formatCurrency(balance)}
                                                        </Text>
                                                        {isPaid && (
                                                            <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '600' }}>PAID</Text>
                                                        )}
                                                        {!isPaid && inst.isOverdue && (
                                                            <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600' }}>OVERDUE</Text>
                                                        )}
                                                    </View>
                                                </View>
                                            </HapticTouchable>
                                        );
                                    })}
                                </View>
                            </Animated.View>
                        )}

                        {ledgerMonths.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(180).duration(300)} style={{ marginTop: 18 }}>
                                <View style={s.ledgerEntryCard}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.sectionLabel}>Financial Ledger</Text>
                                        <Text style={s.sectionNote}>
                                            Open the month-wise ledger in a modal so payment selection stays clean.
                                        </Text>
                                    </View>
                                    <View style={s.ledgerEntryActions}>
                                        <HapticTouchable onPress={() => setLedgerModalVisible(true)}>
                                            <View style={s.ledgerPrimaryButton}>
                                                <Receipt size={15} color="#0469ff" />
                                                <Text style={s.ledgerPrimaryButtonText}>View Ledger</Text>
                                            </View>
                                        </HapticTouchable>
                                        <HapticTouchable onPress={handleShareStudentReport}>
                                            <View style={s.ledgerSecondaryButton}>
                                                <Text style={s.ledgerSecondaryButtonText}>Generate Report</Text>
                                            </View>
                                        </HapticTouchable>
                                    </View>
                                </View>
                            </Animated.View>
                        )}

                        {/* Calculated Amount Display */}
                        <Animated.View entering={FadeInDown.delay(200).duration(300)} style={{ marginTop: 20 }}>
                            <Text style={s.sectionLabel}>Payment Amount</Text>
                            <View style={[s.amountInputContainer, { justifyContent: 'space-between' }]}>
                                <Text style={s.currencyPrefix}>₹</Text>
                                <Text style={[s.amountInput, { paddingVertical: 14 }]}>
                                    {computedAmount > 0 ? computedAmount.toLocaleString('en-IN') : '0'}
                                </Text>
                                {computedAmount > 0 && (
                                    <Text style={{ fontSize: 12, color: '#10B981', fontWeight: '600' }}>
                                        {selectedInstallmentIds.length} inst.
                                    </Text>
                                )}
                            </View>
                            {computedAmount === 0 && pendingInstallments.length > 0 && (
                                <Text style={{ fontSize: 12, color: '#F59E0B', marginTop: 6 }}>Select installments above to proceed</Text>
                            )}
                        </Animated.View>

                        {/* Payment Method */}
                        <Animated.View entering={FadeInDown.delay(250).duration(300)} style={{ marginTop: 20 }}>
                            <Text style={s.sectionLabel}>Payment Method</Text>
                            <View style={s.methodGrid}>
                                {paymentMethods.map((method) => (
                                    <HapticTouchable key={method.key} onPress={() => setPaymentMethod(method.key)} style={{ width: '31%' }}>
                                        <View style={[s.methodChip, paymentMethod === method.key && s.methodChipSelected]}>
                                            <Text style={{ fontSize: 18 }}>{method.icon}</Text>
                                            <Text style={[s.methodLabel, paymentMethod === method.key && s.methodLabelSelected]}>
                                                {method.label}
                                            </Text>
                                        </View>
                                    </HapticTouchable>
                                ))}
                            </View>
                        </Animated.View>

                        {/* Remarks */}
                        <Animated.View entering={FadeInDown.delay(300).duration(300)} style={{ marginTop: 20 }}>
                            <Text style={s.sectionLabel}>Remarks (optional)</Text>
                            <TextInput
                                style={s.remarksInput}
                                value={remarks}
                                onChangeText={setRemarks}
                                placeholder="Add a note..."
                                placeholderTextColor="#ccc"
                                multiline
                            />
                        </Animated.View>

                        {/* Record Button */}
                        <Animated.View entering={FadeInDown.delay(350).duration(300)} style={{ marginTop: 24 }}>
                            <HapticTouchable onPress={handleRecordPayment} disabled={recordPayment.isPending || computedAmount <= 0}>
                                <LinearGradient
                                    colors={recordPayment.isPending || computedAmount <= 0 ? ['#9CA3AF', '#6B7280'] : ['#10B981', '#059669']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={s.recordButton}
                                >
                                    {recordPayment.isPending ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <CheckCircle size={20} color="#fff" />
                                    )}
                                    <Text style={s.recordButtonText}>
                                        {recordPayment.isPending ? 'Recording...' : `Record ${computedAmount > 0 ? formatCurrency(computedAmount) : 'Payment'}`}
                                    </Text>
                                </LinearGradient>
                            </HapticTouchable>
                        </Animated.View>

                        <View style={{ height: 40 }} />
                    </>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );

    // ── STEP 3: SUCCESS ──
    const renderSuccess = () => (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
            <Animated.View entering={FadeInDown.duration(400)} style={{ alignItems: 'center', width: '100%' }}>
                <View style={s.successIcon}>
                    <CheckCircle size={48} color="#10B981" />
                </View>
                <Text style={s.successTitle}>Payment Recorded!</Text>
                <Text style={s.successSubtitle}>
                    Receipt: {lastPaymentResult?.receiptNumber}
                </Text>

                <View style={s.successCard}>
                    <View style={s.successRow}>
                        <Text style={s.successLabel}>Student</Text>
                        <Text style={s.successValue}>{selectedStudent?.name}</Text>
                    </View>
                    <View style={s.successRow}>
                        <Text style={s.successLabel}>Amount</Text>
                        <Text style={[s.successValue, { color: '#10B981', fontWeight: '700' }]}>
                            {formatCurrency(lastPaymentResult?.amount)}
                        </Text>
                    </View>
                    <View style={s.successRow}>
                        <Text style={s.successLabel}>Method</Text>
                        <Text style={s.successValue}>{paymentMethod}</Text>
                    </View>
                    <View style={s.successRow}>
                        <Text style={s.successLabel}>Date</Text>
                        <Text style={s.successValue}>
                            {lastPaymentResult?.paymentDate
                                ? new Date(lastPaymentResult.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                                : 'Today'}
                        </Text>
                    </View>
                </View>

                <View style={{ width: '100%', gap: 10, marginTop: 24 }}>
                    <HapticTouchable onPress={resetAndGoBack}>
                        <LinearGradient
                            colors={['#10B981', '#059669']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={s.recordButton}
                        >
                            <DollarSign size={18} color="#fff" />
                            <Text style={s.recordButtonText}>Collect Another Payment</Text>
                        </LinearGradient>
                    </HapticTouchable>

                    <HapticTouchable onPress={() => router.back()}>
                        <View style={s.doneButton}>
                            <Text style={s.doneButtonText}>Done</Text>
                        </View>
                    </HapticTouchable>
                </View>
            </Animated.View>
        </ScrollView>
    );

    const headerTitle = step === 'search' ? 'Collect Fee' : step === 'payment' ? 'Record Payment' : 'Payment Recorded';
    const headerSubtitle = step === 'search' ? 'Search for a student' : step === 'payment' ? selectedStudent?.name : '';

    return (
        <View style={s.container}>
            <StatusBar style="dark" />
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={[s.header, Platform.OS === 'ios' && { paddingTop: 60 }]}>
                <HapticTouchable onPress={() => {
                    if (step === 'payment') { setStep('search'); setSearchQuery(''); }
                    else router.back();
                }}>
                    <View style={s.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={s.headerCenter}>
                    <Text style={s.headerTitle}>{headerTitle}</Text>
                    {headerSubtitle ? <Text style={s.headerSubtitle}>{headerSubtitle}</Text> : null}
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {step === 'search' && renderSearch()}
            {step === 'payment' && renderPayment()}
            {step === 'success' && renderSuccess()}

            <Modal visible={ledgerModalVisible} animationType="slide" onRequestClose={() => setLedgerModalVisible(false)}>
                <View style={s.ledgerModalContainer}>
                    <View style={s.ledgerModalHeader}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.ledgerModalTitle}>Financial Ledger</Text>
                            <Text style={s.ledgerModalSubtitle}>Month-wise breakdown with detailed fee tracking.</Text>
                        </View>
                        <HapticTouchable onPress={() => setLedgerModalVisible(false)}>
                            <View style={s.backButton}>
                                <X size={20} color="#111" />
                            </View>
                        </HapticTouchable>
                    </View>

                    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
                        {ledgerMonths.map((month) => (
                            <View key={month.monthKey} style={s.ledgerMonthCard}>
                                <View style={s.ledgerMonthHeader}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.ledgerMonthTitle}>{month.monthLabel}</Text>
                                        <Text style={s.ledgerMonthMeta}>{month.monthStatus}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={s.ledgerMonthAmount}>{formatCurrency(month.totalNet)}</Text>
                                        <Text style={s.ledgerMonthDue}>Due: {formatCurrency(month.totalBalance)}</Text>
                                    </View>
                                </View>

                                {month.groups.length === 0 ? (
                                    <Text style={s.emptyLedgerMonth}>No fees scheduled for this month</Text>
                                ) : month.groups.map((group) => (
                                    <View key={group.key} style={{ marginTop: 12 }}>
                                        <Text style={s.ledgerGroupTitle}>{group.title}</Text>
                                        {group.items.map((item) => (
                                            <View key={item.id} style={s.ledgerItemRow}>
                                                <View style={{ flex: 1 }}>
                                                    <Text style={s.ledgerItemTitle}>{item.title}</Text>
                                                    <Text style={s.ledgerItemDue}>Due: {item.dueDateLabel}</Text>
                                                    <Text style={[s.ledgerItemStatus, item.statusMeta?.tone === 'overdue' && { color: '#EF4444' }]}>
                                                        {item.statusMeta?.badge}
                                                    </Text>
                                                </View>
                                                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                                    <Text style={s.ledgerItemAmount}>{formatCurrency(item.balanceAmount || item.netAmount)}</Text>
                                                    {item.canAdjust ? (
                                                        <HapticTouchable onPress={() => openDiscountModal(item)}>
                                                            <View style={s.adjustButton}>
                                                                <Percent size={12} color="#7C3AED" />
                                                                <Text style={s.adjustButtonText}>Adjust</Text>
                                                            </View>
                                                        </HapticTouchable>
                                                    ) : null}
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                ))}
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </Modal>

            <Modal visible={discountModalVisible} transparent animationType="fade" onRequestClose={() => setDiscountModalVisible(false)}>
                <View style={s.modalBackdrop}>
                    <View style={s.modalCard}>
                        <Text style={s.modalTitle}>Adjust Discount</Text>
                        <Text style={s.modalSubtitle}>{selectedLedgerEntry?.title}</Text>

                        <Text style={s.modalLabel}>Discount Amount</Text>
                        <TextInput
                            value={discountAmount}
                            onChangeText={setDiscountAmount}
                            keyboardType="numeric"
                            placeholder="Enter discount amount"
                            placeholderTextColor="#94A3B8"
                            style={s.modalInput}
                        />

                        <Text style={s.modalLabel}>Reason</Text>
                        <TextInput
                            value={discountReason}
                            onChangeText={setDiscountReason}
                            placeholder="Reason for discount"
                            placeholderTextColor="#94A3B8"
                            style={[s.modalInput, { height: 88, textAlignVertical: 'top' }]}
                            multiline
                        />

                        <View style={s.modalActions}>
                            <HapticTouchable onPress={() => setDiscountModalVisible(false)} style={{ flex: 1 }}>
                                <View style={s.modalSecondaryBtn}>
                                    <Text style={s.modalSecondaryText}>Cancel</Text>
                                </View>
                            </HapticTouchable>
                            <HapticTouchable onPress={submitDiscount} style={{ flex: 1 }} disabled={applyDiscountMutation.isPending}>
                                <LinearGradient colors={['#7C3AED', '#6D28D9']} style={s.modalPrimaryBtn}>
                                    {applyDiscountMutation.isPending ? (
                                        <ActivityIndicator color="#fff" />
                                    ) : (
                                        <Text style={s.modalPrimaryText}>Apply</Text>
                                    )}
                                </LinearGradient>
                            </HapticTouchable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 12, color: '#666', marginTop: 2 },

    // Search
    searchBarWrapper: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 4,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 14 : 10,
        gap: 10,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
    },
    searchIconWrapper: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: '#EEF2FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#1E293B',
        fontWeight: '500',
        paddingVertical: 0,
    },
    clearButton: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#CBD5E1',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Dropdown filters
    filterDropdownRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 4,
        gap: 12,
        zIndex: 100,
    },
    filterDropdownLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
        marginBottom: 6,
        letterSpacing: 0.3,
    },
    filterDropdown: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
    },
    filterDropdownOpen: {
        borderColor: '#6366F1',
        backgroundColor: '#FAFAFF',
    },
    filterDropdownValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#1E293B',
    },
    filterDropdownPlaceholder: {
        color: '#94A3B8',
        fontWeight: '500',
    },
    dropdownMenu: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 4,
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        zIndex: 200,
        ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, android: { elevation: 8 } }),
    },
    dropdownItem: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    dropdownItemActive: {
        backgroundColor: '#EEF2FF',
    },
    dropdownItemText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#475569',
    },
    dropdownItemTextActive: {
        color: '#6366F1',
        fontWeight: '600',
    },

    // Results count
    resultsCountRow: {
        paddingHorizontal: 20,
        paddingTop: 8,
        paddingBottom: 6,
    },
    resultsCountText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#94A3B8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },

    // Student cards
    studentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,

        marginBottom: 8,
        gap: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    studentAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#EEF2FF',
        alignItems: 'center',

        justifyContent: 'center',
    },
    studentAvatarText: {
        fontSize: 17,
        fontWeight: '700',
        color: '#6366F1',
    },
    studentName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1E293B',
        marginBottom: 4,
    },
    studentMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    classBadge: {
        backgroundColor: '#F0FDF4',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#BBF7D0',
    },
    classBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#16A34A',
    },
    admissionText: {
        fontSize: 12,
        color: '#94A3B8',
        fontWeight: '500',
    },

    // Payment form
    infoCard: {
        backgroundColor: '#f8f9fa', borderRadius: 16, padding: 16,
        borderWidth: 1, borderColor: '#f0f0f0',
    },
    profileImage: {
        width: 54, height: 54, borderRadius: 27, backgroundColor: '#E2E8F0', borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    profileAvatarFallback: {
        width: 54, height: 54, borderRadius: 27, backgroundColor: '#DBEAFE',
        alignItems: 'center', justifyContent: 'center',
    },
    profileAvatarText: { fontSize: 20, fontWeight: '800', color: '#1D4ED8' },
    infoName: { fontSize: 18, fontWeight: '700', color: '#111' },
    infoMeta: { fontSize: 13, color: '#666', marginTop: 2 },
    changeBtn: {
        backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
        borderWidth: 1, borderColor: '#e5e5e5',
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 15,
    },
    changeBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },
    guardianRow: { marginTop: 20, gap: 4 },
    guardianLine: { fontSize: 12, color: '#475569', fontWeight: '500' },
    feeRow: {
        flexDirection: 'row', marginTop: 14, paddingTop: 14,
        borderTopWidth: 1, borderTopColor: '#eee',
    },
    feeStat: { flex: 1, alignItems: 'center' },
    feeStatLabel: { fontSize: 11, color: '#999', fontWeight: '500' },
    feeStatValue: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 4 },
    progressLabel: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
    progressValue: { fontSize: 13, fontWeight: '800', color: '#0469ff' },
    progressTrack: { height: 10, borderRadius: 999, backgroundColor: '#E2E8F0', overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#10B981' },

    // Quick fill
    quickFillBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#f5f5f5', borderRadius: 10, paddingVertical: 10, gap: 6,
        borderWidth: 1, borderColor: '#eee',
    },
    quickFillText: { fontSize: 13, fontWeight: '600', color: '#333' },

    // Installments
    sectionLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
    sectionNote: { fontSize: 12, color: '#94A3B8', lineHeight: 18 },
    ledgerEntryCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 14,
        gap: 14,
    },
    ledgerEntryActions: {
        flexDirection: 'row',
        gap: 10,
        flexWrap: 'wrap',
    },
    ledgerPrimaryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#EFF6FF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    ledgerPrimaryButtonText: { fontSize: 13, fontWeight: '700', color: '#0469ff' },
    ledgerSecondaryButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    ledgerSecondaryButtonText: { fontSize: 13, fontWeight: '700', color: '#334155' },
    installmentList: { borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#f0f0f0' },
    installmentItem: {
        flexDirection: 'row', alignItems: 'center', padding: 12,
        backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f5f5f5', gap: 10,
    },
    installmentItemSelected: { backgroundColor: '#ECFDF5' },
    checkbox: {
        width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#ddd',
        alignItems: 'center', justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: '#10B981', borderColor: '#10B981' },
    installmentTitle: { fontSize: 14, fontWeight: '600', color: '#111' },
    installmentDue: { fontSize: 11, color: '#999', marginTop: 2 },
    installmentAmount: { fontSize: 14, fontWeight: '700', color: '#111' },
    ledgerMonthCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        padding: 14,
    },
    ledgerMonthHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    ledgerMonthTitle: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    ledgerMonthMeta: { fontSize: 12, color: '#64748B', marginTop: 4 },
    ledgerMonthAmount: { fontSize: 16, fontWeight: '800', color: '#111827' },
    ledgerMonthDue: { fontSize: 12, color: '#EF4444', marginTop: 4 },
    ledgerGroupTitle: { fontSize: 12, fontWeight: '800', color: '#F97316', marginBottom: 8, textTransform: 'uppercase' },
    ledgerItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    ledgerItemTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    ledgerItemDue: { fontSize: 11, color: '#64748B', marginTop: 2 },
    ledgerItemStatus: { fontSize: 11, color: '#0EA5E9', marginTop: 2, fontWeight: '700' },
    ledgerItemAmount: { fontSize: 14, fontWeight: '800', color: '#111827' },
    adjustButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: '#F5F3FF',
    },
    adjustButtonText: { fontSize: 11, fontWeight: '700', color: '#7C3AED' },
    emptyLedgerMonth: { fontSize: 13, color: '#94A3B8', marginTop: 12 },
    ledgerModalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
    ledgerModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingTop: Platform.OS === 'ios' ? 58 : 20,
        paddingHorizontal: 16,
        paddingBottom: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
        backgroundColor: '#FFFFFF',
    },
    ledgerModalTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
    ledgerModalSubtitle: { fontSize: 12, color: '#64748B', marginTop: 4 },

    // Amount
    amountInputContainer: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa',
        borderRadius: 12, borderWidth: 1, borderColor: '#e5e5e5', paddingHorizontal: 14,
    },
    currencyPrefix: { fontSize: 20, fontWeight: '700', color: '#666', marginRight: 6 },
    amountInput: { flex: 1, fontSize: 24, fontWeight: '700', color: '#111', paddingVertical: 14 },

    // Method
    methodGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    methodChip: {
        alignItems: 'center', padding: 10, borderRadius: 12,
        backgroundColor: '#f8f9fa', borderWidth: 1.5, borderColor: '#eee', gap: 4,
    },
    methodChipSelected: { borderColor: '#10B981', backgroundColor: '#ECFDF5' },
    methodLabel: { fontSize: 11, fontWeight: '600', color: '#666' },
    methodLabelSelected: { color: '#10B981' },

    // Remarks
    remarksInput: {
        backgroundColor: '#f8f9fa', borderRadius: 12, padding: 14,
        fontSize: 14, color: '#111', minHeight: 60, textAlignVertical: 'top',
        borderWidth: 1, borderColor: '#e5e5e5',
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
        justifyContent: 'center',
        padding: 20,
    },
    modalCard: {
        backgroundColor: '#fff',
        borderRadius: 20,
        padding: 18,
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
    modalSubtitle: { fontSize: 13, color: '#64748B', marginTop: 4, marginBottom: 14 },
    modalLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 8, marginTop: 8 },
    modalInput: {
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 14,
        color: '#111827',
        backgroundColor: '#F8FAFC',
    },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
    modalSecondaryBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: '#F1F5F9',
        paddingVertical: 14,
    },
    modalSecondaryText: { fontSize: 14, fontWeight: '700', color: '#475569' },
    modalPrimaryBtn: {
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        paddingVertical: 14,
    },
    modalPrimaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    // Record button
    recordButton: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 16, borderRadius: 14, gap: 8,
    },
    recordButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },

    // Success
    successIcon: {
        width: 80, height: 80, borderRadius: 40, backgroundColor: '#D1FAE5',
        alignItems: 'center', justifyContent: 'center', marginBottom: 16, marginTop: 20,
    },
    successTitle: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4 },
    successSubtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
    successCard: {
        width: '100%', backgroundColor: '#f8f9fa', borderRadius: 16,
        padding: 16, borderWidth: 1, borderColor: '#f0f0f0',
    },
    successRow: {
        flexDirection: 'row', justifyContent: 'space-between',
        paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    successLabel: { fontSize: 14, color: '#666' },
    successValue: { fontSize: 14, fontWeight: '600', color: '#111' },
    doneButton: {
        alignItems: 'center', paddingVertical: 14, borderRadius: 14,
        backgroundColor: '#f5f5f5',
    },
    doneButtonText: { fontSize: 15, fontWeight: '600', color: '#666' },
});
