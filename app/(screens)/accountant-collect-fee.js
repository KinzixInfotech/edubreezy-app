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
    KeyboardAvoidingView,
    TouchableOpacity,
    Dimensions,
} from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    ArrowLeft,
    Search,
    User,
    ChevronRight,
    X,
    DollarSign,
    Banknote,
    CreditCard,
    CheckCircle,
    AlertCircle,
    Calendar,
    Hash,
    FileText,
    ArrowRight,
    Loader2,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../components/HapticTouch';
import api from '../../lib/api';

export default function AccountantCollectFeeScreen() {
    const queryClient = useQueryClient();

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
    const [showClassDropdown, setShowClassDropdown] = useState(false);
    const [showSectionDropdown, setShowSectionDropdown] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);

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

    // Student search using director/students API
    const { data: searchResults, isLoading: searchLoading } = useQuery({
        queryKey: ['accountant-student-search', schoolId, searchQuery],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/students?search=${encodeURIComponent(searchQuery)}`);
            return res.data?.students || [];
        },
        enabled: step === 'search' && !!schoolId && searchQuery.length >= 1,
        staleTime: 1000 * 30,
    });

    // Load all students initially
    const { data: allStudents, isLoading: allStudentsLoading } = useQuery({
        queryKey: ['accountant-student-search', schoolId, ''],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/students`);
            return res.data?.students || [];
        },
        enabled: step === 'search' && !!schoolId && searchQuery.length < 1,
        staleTime: 1000 * 60,
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
    const [selectedSectionFilter, setSelectedSectionFilter] = useState(null);
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

    // Student fee details when student is selected
    const { data: studentFee, isLoading: feeLoading } = useQuery({
        queryKey: ['student-fee-detail', selectedStudent?.id, academicYears?.id],
        queryFn: async () => {
            const res = await api.get(`/schools/fee/students/${selectedStudent.id}?academicYearId=${academicYears.id}`);
            return res.data;
        },
        enabled: step === 'payment' && !!selectedStudent && !!academicYears?.id,
    });

    // All installments sorted
    const allInstallments = useMemo(() => {
        if (!studentFee?.installments) return [];
        return [...studentFee.installments].sort((a, b) => a.installmentNumber - b.installmentNumber);
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
        const loading = searchQuery.length >= 1 ? searchLoading : allStudentsLoading;

        const getClassSectionLabel = (student) => {
            const className = student.class?.name || student.class?.className;
            const sectionName = student.section?.name || student.section?.sectionName;
            if (!className) return 'N/A';
            return sectionName ? `Class ${className} - ${sectionName}` : `Class ${className}`;
        };

        return (
            <View style={{ flex: 1 }}>
                {/* Enhanced Search Bar */}
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

                {/* Class & Section Dropdowns */}
                {uniqueClasses.length > 0 && (
                    <Animated.View entering={FadeInDown.delay(200).duration(350)} style={s.filterDropdownRow}>
                        {/* Class Dropdown */}
                        <View style={{ flex: 1, position: 'relative', zIndex: 110 }}>
                            <Text style={s.filterDropdownLabel}>Class</Text>
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => {
                                    setShowClassDropdown(!showClassDropdown);
                                    setShowSectionDropdown(false);
                                }}
                                style={[s.filterDropdown, showClassDropdown && s.filterDropdownOpen]}
                            >
                                <Text style={[s.filterDropdownValue, !selectedClassFilter && s.filterDropdownPlaceholder]}>
                                    {selectedClassFilter ? `Class ${selectedClassFilter}` : 'All Classes'}
                                </Text>
                                <ChevronRight size={14} color="#94A3B8" style={{ transform: [{ rotate: showClassDropdown ? '90deg' : '0deg' }] }} />
                            </TouchableOpacity>
                            {showClassDropdown && (
                                <View style={s.dropdownMenu}>
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
                                </View>
                            )}
                        </View>

                        {/* Section Dropdown */}
                        {uniqueSections.length > 0 && (
                            <View style={{ flex: 1, position: 'relative', zIndex: 100 }}>
                                <Text style={s.filterDropdownLabel}>Section</Text>
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        setShowSectionDropdown(!showSectionDropdown);
                                        setShowClassDropdown(false);
                                    }}
                                    style={[s.filterDropdown, showSectionDropdown && s.filterDropdownOpen]}
                                >
                                    <Text style={[s.filterDropdownValue, !selectedSectionFilter && s.filterDropdownPlaceholder]}>
                                        {selectedSectionFilter || 'All Sections'}
                                    </Text>
                                    <ChevronRight size={14} color="#94A3B8" style={{ transform: [{ rotate: showSectionDropdown ? '90deg' : '0deg' }] }} />
                                </TouchableOpacity>
                                {showSectionDropdown && (
                                    <View style={s.dropdownMenu}>
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
                                    </View>
                                )}
                            </View>
                        )}
                    </Animated.View>
                )}

                {/* Results Count */}
                {!loading && filteredStudents && filteredStudents.length > 0 && (
                    <View style={s.resultsCountRow}>
                        <Text style={s.resultsCountText}>
                            {filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''}
                        </Text>
                    </View>
                )}

                {/* Student List */}
                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}>
                    {loading ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color="#6366F1" />
                            <Text style={{ color: '#94A3B8', marginTop: 10, fontSize: 13 }}>Searching students...</Text>
                        </View>
                    ) : filteredStudents && filteredStudents.length > 0 ? (
                        filteredStudents.map((student, index) => (
                            <Animated.View key={student.id} entering={FadeInDown.delay(40 + index * 20).duration(250)}>
                                <HapticTouchable onPress={() => handleStudentSelect(student)}>
                                    <View style={s.studentCard}>
                                        <View style={s.studentAvatar}>
                                            <Text style={s.studentAvatarText}>
                                                {(student.name || '?').charAt(0).toUpperCase()}
                                            </Text>
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
                        ))
                    ) : searchQuery.length > 0 || selectedClassFilter || selectedSectionFilter ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <Search size={48} color="#E2E8F0" />
                            <Text style={{ color: '#94A3B8', marginTop: 12, fontSize: 15, fontWeight: '500' }}>No students found</Text>
                            <Text style={{ color: '#CBD5E1', marginTop: 4, fontSize: 13 }}>Try a different search or filter</Text>
                        </View>
                    ) : null}
                </ScrollView>
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
                            <View style={{ flex: 1 }}>
                                <Text style={s.infoName}>{selectedStudent?.name}</Text>
                                <Text style={s.infoMeta}>
                                    {selectedStudent?.admissionNo || selectedStudent?.admissionNumber} • {(() => {
                                        const className = selectedStudent?.class?.name || selectedStudent?.class?.className;
                                        const sectionName = selectedStudent?.section?.name || selectedStudent?.section?.sectionName;
                                        if (!className) return 'N/A';
                                        return sectionName ? `Class ${className} - ${sectionName}` : `Class ${className}`;
                                    })()}
                                </Text>
                            </View>
                            <HapticTouchable onPress={() => { setStep('search'); setSearchQuery(''); }}>
                                <View style={s.changeBtn}>
                                    <Text style={s.changeBtnText}>Change</Text>
                                </View>
                            </HapticTouchable>
                        </View>

                        {feeLoading ? (
                            <View style={{ padding: 16, alignItems: 'center' }}>
                                <ActivityIndicator size="small" color="#10B981" />
                            </View>
                        ) : studentFee ? (
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
                                <Text style={s.sectionLabel}>Installments</Text>
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
                                                        <Text style={[s.installmentTitle, isPaid && { color: '#666' }]}>Installment {inst.installmentNumber}</Text>
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
    infoName: { fontSize: 18, fontWeight: '700', color: '#111' },
    infoMeta: { fontSize: 13, color: '#666', marginTop: 2 },
    changeBtn: {
        backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6,
        borderWidth: 1, borderColor: '#e5e5e5',
    },
    changeBtnText: { fontSize: 12, fontWeight: '600', color: '#666' },
    feeRow: {
        flexDirection: 'row', marginTop: 14, paddingTop: 14,
        borderTopWidth: 1, borderTopColor: '#eee',
    },
    feeStat: { flex: 1, alignItems: 'center' },
    feeStatLabel: { fontSize: 11, color: '#999', fontWeight: '500' },
    feeStatValue: { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 4 },

    // Quick fill
    quickFillBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#f5f5f5', borderRadius: 10, paddingVertical: 10, gap: 6,
        borderWidth: 1, borderColor: '#eee',
    },
    quickFillText: { fontSize: 13, fontWeight: '600', color: '#333' },

    // Installments
    sectionLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
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
