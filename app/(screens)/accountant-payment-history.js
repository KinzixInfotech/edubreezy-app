import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    FlatList,
    TextInput,
    ActivityIndicator,
    Platform,
    RefreshControl,
    TouchableOpacity,
    Share,
    Alert,
    Dimensions,
} from 'react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
    ArrowLeft,
    Search,
    ChevronRight,
    ChevronDown,
    X,
    Receipt,
    CheckCircle,
    Clock,
    Download,
    Share2,
    ExternalLink,
    FileText,
    AlertCircle,
    UserX,
    Inbox,
} from 'lucide-react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { Image } from 'expo-image';
import HapticTouchable from '../components/HapticTouch';
import api from '../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const METHOD_ICONS = {
    CASH: '💵',
    UPI: '📱',
    ONLINE: '🌐',
    CHEQUE: '📝',
    CARD: '💳',
    NET_BANKING: '🏦',
    BANK_TRANSFER: '🏦',
    DEMAND_DRAFT: '📄',
    WALLET: '👛',
};

const getMethodIcon = (method) =>
    METHOD_ICONS[method?.toUpperCase()] ?? '💳';

const formatCurrency = (amount) =>
    `₹${(Number(amount) || 0).toLocaleString('en-IN')}`;

// ─────────────────────────────────────────────
// EMPTY STATE COMPONENT
// ─────────────────────────────────────────────
function EmptyState({ icon: Icon, title, subtitle, iconColor = '#CBD5E1' }) {
    return (
        <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: `${iconColor}18` }]}>
                <Icon size={32} color={iconColor} />
            </View>
            <Text style={styles.emptyTitle}>{title}</Text>
            {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
        </View>
    );
}

// ─────────────────────────────────────────────
// PAYMENT CARD COMPONENT
// ─────────────────────────────────────────────
function PaymentCard({ payment, index, onView, onShare, onMore, showStudentName = false }) {
    const isPaid = payment.status === 'SUCCESS';

    return (
        <Animated.View entering={FadeInDown.delay(index * 40).duration(280)}>
            <View style={styles.paymentCard}>
                {/* Top Row */}
                <View style={styles.paymentTopRow}>
                    <View style={styles.methodIconWrap}>
                        <Text style={styles.methodEmoji}>{getMethodIcon(payment.paymentMethod)}</Text>
                    </View>
                    <View style={styles.paymentMainInfo}>
                        <Text style={styles.paymentAmount}>{formatCurrency(payment.amount)}</Text>
                        <Text style={styles.paymentMeta} numberOfLines={1}>
                            {showStudentName && payment.studentName ? `${payment.studentName} • ` : ''}
                            {payment.paymentMethod ?? 'N/A'} •{' '}
                            {payment.paymentDate
                                ? new Date(payment.paymentDate).toLocaleDateString('en-IN', {
                                    day: 'numeric', month: 'short', year: 'numeric',
                                })
                                : '—'}
                        </Text>
                    </View>
                    <View style={[styles.statusPill, isPaid ? styles.statusPillPaid : styles.statusPillPending]}>
                        {isPaid
                            ? <CheckCircle size={11} color="#059669" />
                            : <Clock size={11} color="#D97706" />}
                        <Text style={[styles.statusPillText, isPaid ? { color: '#059669' } : { color: '#D97706' }]}>
                            {isPaid ? 'Paid' : (payment.status ?? 'Pending')}
                        </Text>
                    </View>
                </View>

                {/* Receipt number */}
                {payment.receiptNumber ? (
                    <View style={styles.receiptRow}>
                        <Receipt size={11} color="#94A3B8" />
                        <Text style={styles.receiptText}>{payment.receiptNumber}</Text>
                        {payment.referenceNumber ? (
                            <Text style={styles.refText}>• Ref: {payment.referenceNumber}</Text>
                        ) : null}
                    </View>
                ) : null}

                {/* Student name badge (for recent tab) */}
                {showStudentName && (payment.className || payment.sectionName) ? (
                    <View style={styles.studentMetaRow}>
                        <View style={styles.classPill}>
                            <Text style={styles.classPillText}>
                                {payment.className ?? ''}
                                {payment.sectionName ? ` - ${payment.sectionName}` : ''}
                            </Text>
                        </View>
                        <Text style={styles.admNoText}>{payment.admissionNo ?? ''}</Text>
                    </View>
                ) : null}

                {/* Installment tags */}
                {payment.installmentSummary?.length > 0 ? (
                    <View style={styles.installmentTagsRow}>
                        {payment.installmentSummary.map((ip, i) => (
                            <View key={ip.id ?? ip.installmentNumber ?? i} style={styles.installmentTag}>
                                <Text style={styles.installmentTagText}>
                                    {ip.monthLabel ?? `Inst. ${ip.installmentNumber ?? i + 1}`}
                                    {ip.allocatedAmount != null ? ` — ${formatCurrency(ip.allocatedAmount)}` : ''}
                                </Text>
                            </View>
                        ))}
                    </View>
                ) : null}

                {/* Actions */}
                <View style={styles.actionRow}>
                    <HapticTouchable onPress={() => onView(payment)} style={styles.actionBtn}>
                        <ExternalLink size={13} color="#4F46E5" />
                        <Text style={styles.actionBtnText}>View</Text>
                    </HapticTouchable>
                    <HapticTouchable onPress={() => onShare(payment)} style={styles.actionBtn}>
                        <Share2 size={13} color="#4F46E5" />
                        <Text style={styles.actionBtnText}>Share</Text>
                    </HapticTouchable>
                    <HapticTouchable onPress={() => onMore(payment)} style={styles.actionBtn}>
                        <Download size={13} color="#4F46E5" />
                        <Text style={styles.actionBtnText}>More</Text>
                    </HapticTouchable>
                </View>
            </View>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────
export default function AccountantPaymentHistoryScreen() {
    const params = useLocalSearchParams();

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });
    const schoolId = userData?.schoolId;

    // step: 'search' → select student → 'student_history'
    // OR tap receipt icon in header → 'recent_history' (no student needed)
    const [step, setStep] = useState('search');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedClassFilter, setSelectedClassFilter] = useState(null);
    const [selectedSectionFilter, setSelectedSectionFilter] = useState(null);
    const [showClassDropdown, setShowClassDropdown] = useState(false);
    const [showSectionDropdown, setShowSectionDropdown] = useState(false);

    // Accept pre-selected student from route params
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
                setStep('student_history');
            }
        } catch {
            // ignore
        }
    }, [params?.selectedStudent]);

    // ── Academic Year ──
    const { data: academicYear } = useQuery({
        queryKey: ['academic-years', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId,
        select: (data) => data?.find(y => y.isActive),
    });

    // ── Classes for filter ──
    const { data: classesData } = useQuery({
        queryKey: ['classes', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/classes`);
            return res.data;
        },
        enabled: !!schoolId,
    });

    const uniqueClasses = useMemo(() => {
        if (!classesData?.length) return [];
        return [...new Set(classesData.map(c => c.className).filter(Boolean))].sort((a, b) => {
            const numA = parseInt(a) || 0;
            const numB = parseInt(b) || 0;
            return numA !== numB ? numA - numB : a.localeCompare(b);
        });
    }, [classesData]);

    const uniqueSections = useMemo(() => {
        if (!classesData?.length || !selectedClassFilter) return [];
        const match = classesData.find(c => c.className === selectedClassFilter);
        return match?.sections?.map(s => s.name).filter(Boolean).sort() ?? [];
    }, [classesData, selectedClassFilter]);

    // ── Student search (infinite) ──
    const {
        data: studentsPages,
        isLoading: studentsLoading,
        isFetchingNextPage: studentsFetchingNext,
        fetchNextPage: fetchNextStudents,
        hasNextPage: hasMoreStudents,
        refetch: refetchStudents,
    } = useInfiniteQuery({
        queryKey: ['acc-hist-students', schoolId, searchQuery, selectedClassFilter, selectedSectionFilter],
        queryFn: async ({ pageParam = 1 }) => {
            const p = new URLSearchParams({ page: String(pageParam), limit: '25' });
            if (searchQuery) p.set('search', searchQuery);
            const res = await api.get(`/schools/${schoolId}/director/students?${p.toString()}`);
            return res.data;
        },
        enabled: step === 'search' && !!schoolId,
        staleTime: 30_000,
        initialPageParam: 1,
        getNextPageParam: (last) => last?.pagination?.nextPage ?? undefined,
    });

    const filteredStudents = useMemo(() => {
        const base = studentsPages?.pages?.flatMap(p => p?.students ?? []) ?? [];
        return base
            .filter(s => !selectedClassFilter || (s.class?.name || s.class?.className) === selectedClassFilter)
            .filter(s => !selectedSectionFilter || (s.section?.name || s.section?.sectionName) === selectedSectionFilter);
    }, [studentsPages, selectedClassFilter, selectedSectionFilter]);

    // ── Student-specific payment history ──
    const {
        data: studentPayments,
        isLoading: studentPaymentsLoading,
        isError: studentPaymentsError,
        refetch: refetchStudentPayments,
    } = useQuery({
        queryKey: ['acc-student-payments', selectedStudent?.id, academicYear?.id],
        queryFn: async () => {
            const res = await api.get(
                `/schools/fee/payments/by-student?studentId=${selectedStudent.id}&academicYearId=${academicYear.id}`
            );
            return res.data;
        },
        enabled: step === 'student_history' && !!selectedStudent?.id && !!academicYear?.id,
    });

    const { data: studentFeeDetail } = useQuery({
        queryKey: ['acc-student-fee-meta', selectedStudent?.id, academicYear?.id],
        queryFn: async () => {
            const res = await api.get(
                `/schools/fee/students/${selectedStudent.id}?academicYearId=${academicYear.id}`
            );
            return res.data;
        },
        enabled: step === 'student_history' && !!selectedStudent?.id && !!academicYear?.id,
    });

    // ── All recent payments (infinite, only loaded when step === 'recent_history') ──
    const {
        data: recentPages,
        isLoading: recentLoading,
        isError: recentError,
        isFetchingNextPage: recentFetchingNext,
        fetchNextPage: fetchNextRecent,
        hasNextPage: hasMoreRecent,
        refetch: refetchRecent,
    } = useInfiniteQuery({
        queryKey: ['acc-recent-payments', schoolId, academicYear?.id, searchQuery, selectedClassFilter, selectedSectionFilter],
        queryFn: async ({ pageParam = 1 }) => {
            const p = new URLSearchParams({
                schoolId,
                academicYearId: academicYear?.id ?? '',
                page: String(pageParam),
                limit: '20',
            });
            if (searchQuery) p.set('search', searchQuery);
            if (selectedClassFilter) p.set('className', selectedClassFilter);
            if (selectedSectionFilter) p.set('sectionName', selectedSectionFilter);
            const res = await api.get(`/schools/fee/payments?${p.toString()}`);
            return res.data;
        },
        enabled: step === 'recent_history' && !!schoolId && !!academicYear?.id,
        initialPageParam: 1,
        getNextPageParam: (last) => last?.pagination?.nextPage ?? undefined,
    });

    const recentFeed = useMemo(
        () => recentPages?.pages?.flatMap(p => p?.items ?? []) ?? [],
        [recentPages]
    );

    // ── Handlers ──
    const handleStudentSelect = useCallback((student) => {
        setSelectedStudent({
            ...student,
            id: student.id,
            userId: student.id,
            admissionNo: student.admissionNumber ?? student.admissionNo,
        });
        setStep('student_history');
        setShowClassDropdown(false);
        setShowSectionDropdown(false);
    }, []);

    const handleBack = useCallback(() => {
        if (step === 'student_history' || step === 'recent_history') {
            setStep('search');
            setSearchQuery('');
            setSelectedStudent(null);
        } else {
            router.back();
        }
    }, [step]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            if (step === 'student_history') await refetchStudentPayments();
            else if (step === 'recent_history') await refetchRecent();
            else await refetchStudents();
        } finally {
            setRefreshing(false);
        }
    }, [step, refetchStudentPayments, refetchRecent, refetchStudents]);

    const handleViewReceipt = useCallback(async (payment) => {
        if (!payment?.receiptUrl) {
            Alert.alert('Receipt unavailable', 'No receipt file is attached to this payment yet.');
            return;
        }
        try {
            await WebBrowser.openBrowserAsync(payment.receiptUrl);
        } catch {
            Alert.alert('Error', 'Could not open the receipt.');
        }
    }, []);

    const handleShareReceipt = useCallback(async (payment) => {
        if (!payment?.receiptUrl) {
            Alert.alert('Receipt unavailable', 'No receipt file is attached to this payment yet.');
            return;
        }
        await Share.share({
            message: `Receipt ${payment.receiptNumber ?? ''}\n${payment.receiptUrl}`,
            url: payment.receiptUrl,
            title: 'Payment Receipt',
        });
    }, []);

    const handleMoreReceipt = useCallback(async (payment) => {
        if (!payment?.receiptUrl) {
            Alert.alert('Receipt unavailable', 'No receipt file is attached to this payment yet.');
            return;
        }
        Alert.alert(
            payment.receiptNumber ?? 'Receipt',
            'What would you like to do?',
            [
                { text: 'View', onPress: () => handleViewReceipt(payment) },
                { text: 'Share', onPress: () => handleShareReceipt(payment) },
                {
                    text: 'Download',
                    onPress: async () => {
                        try {
                            const fileUri = `${FileSystem.cacheDirectory}${payment.receiptNumber ?? payment.id}.pdf`;
                            const result = await FileSystem.downloadAsync(payment.receiptUrl, fileUri);
                            if (await Sharing.isAvailableAsync()) {
                                await Sharing.shareAsync(result.uri, {
                                    mimeType: 'application/pdf',
                                    dialogTitle: 'Save Receipt',
                                });
                            } else {
                                Alert.alert('Downloaded', `Saved to ${result.uri}`);
                            }
                        } catch {
                            Alert.alert('Error', 'Could not download the receipt.');
                        }
                    },
                },
                { text: 'Cancel', style: 'cancel' },
            ]
        );
    }, [handleViewReceipt, handleShareReceipt]);

    const handleShareReport = useCallback(async () => {
        const list = step === 'recent_history' ? recentFeed : (studentPayments ?? []);
        const total = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const summary = studentFeeDetail?.summary;
        await Share.share({
            title: step === 'recent_history' ? 'All Recent Payments' : `${selectedStudent?.name ?? 'Student'} Report`,
            message: [
                step === 'recent_history' ? 'All Recent Payments Report' : `${selectedStudent?.name ?? 'Student'} Payment Report`,
                `Transactions: ${list.length}`,
                `Total Collected: ${formatCurrency(total)}`,
                summary ? `Expected: ${formatCurrency(summary.expectedCollection)}` : null,
                summary ? `Pending: ${formatCurrency(summary.feesPendingAcrossYear)}` : null,
            ].filter(Boolean).join('\n'),
        });
    }, [step, recentFeed, studentPayments, studentFeeDetail, selectedStudent]);

    // ─────────────────────────────────────────
    // RENDER: SEARCH STEP
    // ─────────────────────────────────────────
    const renderStudentItem = useCallback(({ item: student, index }) => {
        const className = student.class?.name || student.class?.className || '';
        const sectionName = student.section?.name || '';
        const hasAvatar = !!student.profilePicture;

        return (
            <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 300)).duration(250)}>
                <HapticTouchable onPress={() => handleStudentSelect(student)}>
                    <View style={styles.studentCard}>
                        {hasAvatar ? (
                            <Image
                                source={{ uri: student.profilePicture }}
                                style={styles.studentAvatar}
                                contentFit="cover"
                            />
                        ) : (
                            <View style={styles.studentAvatar}>
                                <Text style={styles.studentAvatarText}>
                                    {student.name?.charAt(0)?.toUpperCase() ?? '?'}
                                </Text>
                            </View>
                        )}
                        <View style={styles.studentCardBody}>
                            <Text style={styles.studentName} numberOfLines={1}>{student.name}</Text>
                            <View style={styles.studentMetaRow}>
                                {(className || sectionName) ? (
                                    <View style={styles.classPill}>
                                        <Text style={styles.classPillText}>
                                            {className}{sectionName ? ` - ${sectionName}` : ''}
                                        </Text>
                                    </View>
                                ) : null}
                                <Text style={styles.admNoText}>
                                    {student.admissionNumber ?? student.admissionNo ?? 'N/A'}
                                </Text>
                            </View>
                        </View>
                        <ChevronRight size={16} color="#CBD5E1" />
                    </View>
                </HapticTouchable>
            </Animated.View>
        );
    }, [handleStudentSelect]);

    const renderSearch = () => (
        <View style={{ flex: 1 }}>
            {/* Search bar — outside FlatList so z-index works */}
            <Animated.View entering={FadeInDown.delay(120).duration(350)} style={styles.searchBarWrap}>
                <View style={styles.searchBar}>
                    <Search size={18} color="#4F46E5" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by name or admission no..."
                        placeholderTextColor="#94A3B8"
                        value={searchQuery}
                        onChangeText={(t) => {
                            setSearchQuery(t);
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
                        }}>
                            <View style={styles.clearBtn}>
                                <X size={13} color="#fff" />
                            </View>
                        </HapticTouchable>
                    )}
                </View>
            </Animated.View>

            {/* Class / Section dropdowns — outside FlatList */}
            {uniqueClasses.length > 0 && (
                <Animated.View entering={FadeInDown.delay(180).duration(300)} style={styles.filterRow}>
                    {/* Class */}
                    <View style={[styles.filterCol, { zIndex: 110 }]}>
                        <TouchableOpacity
                            style={[styles.dropdownTrigger, selectedClassFilter && styles.dropdownTriggerActive]}
                            onPress={() => { setShowClassDropdown(v => !v); setShowSectionDropdown(false); }}
                            activeOpacity={0.75}
                        >
                            <Text style={[styles.dropdownTriggerText, selectedClassFilter && styles.dropdownTriggerTextActive]}>
                                {selectedClassFilter ? `Class ${selectedClassFilter}` : 'All Classes'}
                            </Text>
                            <ChevronDown size={13} color={selectedClassFilter ? '#4F46E5' : '#94A3B8'} />
                        </TouchableOpacity>
                        {showClassDropdown && (
                            <View style={styles.dropdownMenu}>
                                <ScrollView style={{ maxHeight: 210 }} nestedScrollEnabled>
                                    {[null, ...uniqueClasses].map((cls, i) => (
                                        <TouchableOpacity
                                            key={cls ?? '__all__'}
                                            style={[styles.dropdownItem, selectedClassFilter === cls && styles.dropdownItemActive]}
                                            onPress={() => {
                                                setSelectedClassFilter(cls);
                                                setSelectedSectionFilter(null);
                                                setShowClassDropdown(false);
                                            }}
                                        >
                                            <Text style={[styles.dropdownItemText, selectedClassFilter === cls && styles.dropdownItemTextActive]}>
                                                {cls ? `Class ${cls}` : 'All Classes'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>

                    {/* Section */}
                    <View style={[styles.filterCol, { zIndex: 100 }]}>
                        <TouchableOpacity
                            style={[
                                styles.dropdownTrigger,
                                selectedSectionFilter && styles.dropdownTriggerActive,
                                !selectedClassFilter && styles.dropdownTriggerDisabled,
                            ]}
                            onPress={() => {
                                if (!selectedClassFilter) return;
                                setShowSectionDropdown(v => !v);
                                setShowClassDropdown(false);
                            }}
                            activeOpacity={selectedClassFilter ? 0.75 : 1}
                        >
                            <Text style={[
                                styles.dropdownTriggerText,
                                selectedSectionFilter && styles.dropdownTriggerTextActive,
                                !selectedClassFilter && { color: '#CBD5E1' },
                            ]}>
                                {selectedSectionFilter ?? 'All Sections'}
                            </Text>
                            <ChevronDown size={13} color={selectedSectionFilter ? '#4F46E5' : '#CBD5E1'} />
                        </TouchableOpacity>
                        {showSectionDropdown && uniqueSections.length > 0 && (
                            <View style={styles.dropdownMenu}>
                                <ScrollView style={{ maxHeight: 210 }} nestedScrollEnabled>
                                    {[null, ...uniqueSections].map((sec) => (
                                        <TouchableOpacity
                                            key={sec ?? '__all__'}
                                            style={[styles.dropdownItem, selectedSectionFilter === sec && styles.dropdownItemActive]}
                                            onPress={() => {
                                                setSelectedSectionFilter(sec);
                                                setShowSectionDropdown(false);
                                            }}
                                        >
                                            <Text style={[styles.dropdownItemText, selectedSectionFilter === sec && styles.dropdownItemTextActive]}>
                                                {sec ?? 'All Sections'}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                </Animated.View>
            )}

            {filteredStudents.length > 0 && (
                <View style={styles.resultCountRow}>
                    <Text style={styles.resultCountText}>
                        {filteredStudents.length} loaded{hasMoreStudents ? ' • more available' : ''}
                    </Text>
                </View>
            )}

            <FlatList
                data={filteredStudents}
                keyExtractor={(item) => item.id}
                renderItem={renderStudentItem}
                style={{ flex: 1 }}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 }}
                onEndReachedThreshold={0.35}
                onEndReached={() => { if (hasMoreStudents && !studentsFetchingNext) fetchNextStudents(); }}
                refreshing={false}
                onRefresh={refetchStudents}
                ListEmptyComponent={
                    studentsLoading
                        ? <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color="#4F46E5" /></View>
                        : <EmptyState icon={UserX} title="No students found" subtitle="Try a different search or filter" iconColor="#94A3B8" />
                }
                ListFooterComponent={studentsFetchingNext
                    ? <View style={{ paddingVertical: 16 }}><ActivityIndicator color="#4F46E5" /></View>
                    : <View style={{ height: 8 }} />}
            />
        </View>
    );

    // ─────────────────────────────────────────
    // RENDER: STUDENT HISTORY
    // ─────────────────────────────────────────
    const renderStudentHistory = () => {
        const profile = studentFeeDetail?.studentProfile;
        const summary = studentFeeDetail?.summary;
        const hasAvatar = !!profile?.profilePicture;
        const collectionProgress = summary?.collectionProgress ?? 0;

        return (
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#4F46E5']}
                        tintColor="#4F46E5"
                    />
                }
            >
                {/* Student info card */}
                <Animated.View entering={FadeInDown.duration(300)}>
                    <View style={styles.infoCard}>
                        <View style={styles.infoCardTopRow}>
                            {hasAvatar ? (
                                <Image source={{ uri: profile.profilePicture }} style={styles.infoAvatar} contentFit="cover" />
                            ) : (
                                <View style={[styles.infoAvatar, styles.infoAvatarFallback]}>
                                    <Text style={styles.infoAvatarText}>
                                        {selectedStudent?.name?.charAt(0)?.toUpperCase() ?? '?'}
                                    </Text>
                                </View>
                            )}
                            <View style={styles.infoCardNameBlock}>
                                <Text style={styles.infoName} numberOfLines={1}>{selectedStudent?.name}</Text>
                                <View style={styles.studentMetaRow}>
                                    <View style={styles.classPill}>
                                        <Text style={styles.classPillText}>
                                            {selectedStudent?.class?.name
                                                ?? selectedStudent?.class?.className
                                                ?? profile?.className
                                                ?? 'N/A'}
                                        </Text>
                                    </View>
                                    <Text style={styles.admNoText}>
                                        {selectedStudent?.admissionNo ?? selectedStudent?.admissionNumber ?? ''}
                                    </Text>
                                </View>
                            </View>
                            <HapticTouchable onPress={() => { setStep('search'); setSearchQuery(''); setSelectedStudent(null); }}>
                                <View style={styles.changeBtn}>
                                    <Text style={styles.changeBtnText}>Change</Text>
                                </View>
                            </HapticTouchable>
                        </View>

                        {/* Guardian info */}
                        {(profile?.fatherName || profile?.motherName || profile?.guardianName) ? (
                            <View style={styles.guardianBlock}>
                                {profile.fatherName ? <Text style={styles.guardianLine}>Father: {profile.fatherName}</Text> : null}
                                {profile.motherName ? <Text style={styles.guardianLine}>Mother: {profile.motherName}</Text> : null}
                                {profile.guardianName ? (
                                    <Text style={styles.guardianLine}>
                                        {profile.guardianRelation ?? 'Guardian'}: {profile.guardianName}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}

                        {/* Fee summary */}
                        {summary ? (
                            <>
                                <View style={styles.feeStatsRow}>
                                    <View style={styles.feeStat}>
                                        <Text style={styles.feeStatValue}>{formatCurrency(summary.expectedCollection)}</Text>
                                        <Text style={styles.feeStatLabel}>Expected</Text>
                                    </View>
                                    <View style={[styles.feeStat, styles.feeStatBorder]}>
                                        <Text style={[styles.feeStatValue, { color: '#059669' }]}>{formatCurrency(summary.totalFeesCollected)}</Text>
                                        <Text style={styles.feeStatLabel}>Collected</Text>
                                    </View>
                                    <View style={[styles.feeStat, styles.feeStatBorder]}>
                                        <Text style={[styles.feeStatValue, { color: '#DC2626' }]}>{formatCurrency(summary.feesPendingAcrossYear)}</Text>
                                        <Text style={styles.feeStatLabel}>Pending</Text>
                                    </View>
                                </View>
                                {/* Progress bar */}
                                <View style={styles.progressSection}>
                                    <View style={styles.progressLabelRow}>
                                        <Text style={styles.progressLabel}>Collection Progress</Text>
                                        <Text style={styles.progressValue}>{collectionProgress}%</Text>
                                    </View>
                                    <View style={styles.progressTrack}>
                                        <View style={[styles.progressFill, { width: `${Math.min(collectionProgress, 100)}%` }]} />
                                    </View>
                                </View>
                            </>
                        ) : null}
                    </View>
                </Animated.View>

                {/* Payments */}
                <View style={styles.paymentsSectionHeader}>
                    <Text style={styles.sectionTitle}>Payment History</Text>
                    {studentPayments?.length > 0 && (
                        <Text style={styles.sectionCount}>{studentPayments.length} payment{studentPayments.length !== 1 ? 's' : ''}</Text>
                    )}
                </View>

                {studentPaymentsLoading ? (
                    <View style={{ padding: 40, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color="#4F46E5" />
                        <Text style={styles.loadingText}>Loading payments…</Text>
                    </View>
                ) : studentPaymentsError ? (
                    <EmptyState
                        icon={AlertCircle}
                        title="Could not load payments"
                        subtitle="Pull to refresh and try again"
                        iconColor="#EF4444"
                    />
                ) : studentPayments?.length > 0 ? (
                    studentPayments.map((payment, index) => (
                        <PaymentCard
                            key={payment.id}
                            payment={payment}
                            index={index}
                            onView={handleViewReceipt}
                            onShare={handleShareReceipt}
                            onMore={handleMoreReceipt}
                            showStudentName={false}
                        />
                    ))
                ) : (
                    <EmptyState
                        icon={Inbox}
                        title="No payments recorded"
                        subtitle="No payments have been made for this student yet"
                        iconColor="#94A3B8"
                    />
                )}
            </ScrollView>
        );
    };

    // ─────────────────────────────────────────
    // RENDER: ALL RECENT PAYMENTS
    // ─────────────────────────────────────────
    const renderRecentHistory = () => (
        <View style={{ flex: 1 }}>
            {/* Filters for recent view */}
            <View style={[styles.filterRow, { zIndex: 200 }]}>
                <View style={styles.searchBarWrapInline}>
                    <View style={styles.searchBarCompact}>
                        <Search size={15} color="#94A3B8" />
                        <TextInput
                            style={styles.searchInputCompact}
                            placeholder="Search student or admission…"
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCorrect={false}
                        />
                        {searchQuery.length > 0 && (
                            <HapticTouchable onPress={() => setSearchQuery('')}>
                                <X size={13} color="#94A3B8" />
                            </HapticTouchable>
                        )}
                    </View>
                </View>
            </View>

            <FlatList
                data={recentFeed}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4F46E5']} tintColor="#4F46E5" />
                }
                onEndReachedThreshold={0.35}
                onEndReached={() => { if (hasMoreRecent && !recentFetchingNext) fetchNextRecent(); }}
                renderItem={({ item, index }) => (
                    <PaymentCard
                        key={item.id}
                        payment={item}
                        index={index}
                        onView={handleViewReceipt}
                        onShare={handleShareReceipt}
                        onMore={handleMoreReceipt}
                        showStudentName={true}   // ← shows student name + class in each card
                    />
                )}
                ListEmptyComponent={
                    recentLoading
                        ? <View style={{ padding: 40, alignItems: 'center' }}><ActivityIndicator size="large" color="#4F46E5" /><Text style={styles.loadingText}>Loading payments…</Text></View>
                        : recentError
                            ? <EmptyState icon={AlertCircle} title="Could not load payments" subtitle="Pull to refresh and try again" iconColor="#EF4444" />
                            : <EmptyState icon={Inbox} title="No payments found" subtitle="No payments recorded for this period" iconColor="#94A3B8" />
                }
                ListFooterComponent={recentFetchingNext
                    ? <View style={{ paddingVertical: 16 }}><ActivityIndicator color="#4F46E5" /></View>
                    : recentFeed.length > 0
                        ? <Text style={styles.endOfListText}>End of results</Text>
                        : null}
            />
        </View>
    );

    // ─────────────────────────────────────────
    // HEADER TITLE / SUBTITLE
    // ─────────────────────────────────────────
    const headerTitle =
        step === 'search' ? 'Payment History'
            : step === 'student_history' ? selectedStudent?.name ?? 'Payment History'
                : 'All Recent Payments';

    const headerSubtitle =
        step === 'search' ? 'Select a student to view their history'
            : step === 'student_history' ? `${selectedStudent?.admissionNo ?? ''}`
                : academicYear?.name ?? '';

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* ── HEADER ── */}
            <Animated.View
                entering={FadeInDown.duration(350)}
                style={[styles.header, Platform.OS === 'ios' && { paddingTop: 60 }]}
            >
                <HapticTouchable onPress={handleBack}>
                    <View style={styles.headerBtn}>
                        <ArrowLeft size={22} color="#0F172A" />
                    </View>
                </HapticTouchable>

                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{headerTitle}</Text>
                    {headerSubtitle ? (
                        <Text style={styles.headerSubtitle} numberOfLines={1}>{headerSubtitle}</Text>
                    ) : null}
                </View>

                {/* Right button: only show receipt icon on search step (→ opens recent_history),
                    and share icon when viewing student or recent history */}
                {step === 'search' ? (
                    <HapticTouchable onPress={() => { setStep('recent_history'); setSearchQuery(''); }}>
                        <View style={styles.headerBtn}>
                            <Receipt size={18} color="#4F46E5" />
                        </View>
                    </HapticTouchable>
                ) : (
                    <HapticTouchable onPress={handleShareReport}>
                        <View style={styles.headerBtn}>
                            <FileText size={18} color="#4F46E5" />
                        </View>
                    </HapticTouchable>
                )}
            </Animated.View>

            {/* ── CONTENT ── */}
            {step === 'search' && renderSearch()}
            {step === 'student_history' && renderStudentHistory()}
            {step === 'recent_history' && renderRecentHistory()}
        </View>
    );
}

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FAFAFA' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: Platform.OS === 'android' ? 16 : 50,
        paddingBottom: 14,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        gap: 8,
    },
    headerBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F8FAFC',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },
    headerSubtitle: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

    // Search
    searchBarWrap: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 13 : 9,
        gap: 10,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
            android: { elevation: 2 },
        }),
    },
    searchInput: { flex: 1, fontSize: 14, color: '#0F172A', fontWeight: '500', paddingVertical: 0 },
    clearBtn: {
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center',
    },

    // Inline search for recent view
    searchBarWrapInline: { flex: 1 },
    searchBarCompact: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F1F5F9',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 9,
        gap: 8,
    },
    searchInputCompact: { flex: 1, fontSize: 13, color: '#0F172A', paddingVertical: 0 },

    // Filters
    filterRow: {
        flexDirection: 'row',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    filterCol: { flex: 1, position: 'relative' },
    dropdownTrigger: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
    },
    dropdownTriggerActive: { borderColor: '#A5B4FC', backgroundColor: '#EEF2FF' },
    dropdownTriggerDisabled: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
    dropdownTriggerText: { fontSize: 13, fontWeight: '500', color: '#64748B' },
    dropdownTriggerTextActive: { color: '#4F46E5', fontWeight: '600' },
    dropdownMenu: {
        position: 'absolute',
        top: 46,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        zIndex: 300,
        overflow: 'hidden',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
            android: { elevation: 10 },
        }),
    },
    dropdownItem: {
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: '#F8FAFC',
    },
    dropdownItemActive: { backgroundColor: '#EEF2FF' },
    dropdownItemText: { fontSize: 13, color: '#475569' },
    dropdownItemTextActive: { color: '#4F46E5', fontWeight: '600' },

    // Result count
    resultCountRow: { paddingHorizontal: 18, paddingBottom: 6 },
    resultCountText: { fontSize: 11, color: '#94A3B8', fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.4 },

    // Student card
    studentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 13,
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        marginBottom: 8,
        gap: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
            android: { elevation: 1 },
        }),
    },
    studentAvatar: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
    },
    studentAvatarText: { fontSize: 17, fontWeight: '800', color: '#4F46E5' },
    studentCardBody: { flex: 1 },
    studentName: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
    studentMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
    classPill: {
        backgroundColor: '#ECFDF5', paddingHorizontal: 7, paddingVertical: 2,
        borderRadius: 6, borderWidth: 1, borderColor: '#A7F3D0',
    },
    classPillText: { fontSize: 10, fontWeight: '700', color: '#059669' },
    admNoText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },

    // Info card (student detail)
    infoCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        marginBottom: 4,
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
            android: { elevation: 2 },
        }),
    },
    infoCardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    infoAvatar: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden' },
    infoAvatarFallback: { backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
    infoAvatarText: { fontSize: 20, fontWeight: '800', color: '#4F46E5' },
    infoCardNameBlock: { flex: 1 },
    infoName: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
    changeBtn: {
        backgroundColor: '#F8FAFC',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    changeBtnText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
    guardianBlock: { marginTop: 12, gap: 3 },
    guardianLine: { fontSize: 12, color: '#475569' },

    // Fee stats
    feeStatsRow: {
        flexDirection: 'row',
        marginTop: 14,
        paddingTop: 14,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    feeStat: { flex: 1, alignItems: 'center' },
    feeStatBorder: { borderLeftWidth: 1, borderLeftColor: '#F1F5F9' },
    feeStatValue: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
    feeStatLabel: { fontSize: 10, color: '#94A3B8', marginTop: 3, fontWeight: '500' },

    // Progress bar
    progressSection: { marginTop: 14 },
    progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    progressLabel: { fontSize: 12, fontWeight: '600', color: '#475569' },
    progressValue: { fontSize: 12, fontWeight: '800', color: '#4F46E5' },
    progressTrack: { height: 8, borderRadius: 999, backgroundColor: '#F1F5F9', overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 999, backgroundColor: '#4F46E5' },

    // Section header
    paymentsSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 20,
        marginBottom: 10,
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
    sectionCount: { fontSize: 12, color: '#94A3B8', fontWeight: '500' },

    // Payment card
    paymentCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
            android: { elevation: 1 },
        }),
    },
    paymentTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    methodIconWrap: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#F8FAFC',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: '#F1F5F9',
    },
    methodEmoji: { fontSize: 20 },
    paymentMainInfo: { flex: 1 },
    paymentAmount: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
    paymentMeta: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
    },
    statusPillPaid: { backgroundColor: '#D1FAE5' },
    statusPillPending: { backgroundColor: '#FEF3C7' },
    statusPillText: { fontSize: 10, fontWeight: '700' },

    receiptRow: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F8FAFC',
    },
    receiptText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
    refText: { fontSize: 11, color: '#94A3B8' },

    installmentTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
    installmentTag: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8, paddingVertical: 3,
        borderRadius: 6, borderWidth: 1, borderColor: '#C7D2FE',
    },
    installmentTagText: { fontSize: 10, color: '#4F46E5', fontWeight: '600' },

    actionRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
    actionBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 5, backgroundColor: '#EEF2FF', borderRadius: 10, paddingVertical: 9,
    },
    actionBtnText: { fontSize: 11, fontWeight: '700', color: '#4F46E5' },

    // Empty state
    emptyState: { padding: 40, alignItems: 'center' },
    emptyIconWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    emptyTitle: { fontSize: 15, fontWeight: '700', color: '#334155', textAlign: 'center' },
    emptySubtitle: { fontSize: 13, color: '#94A3B8', marginTop: 5, textAlign: 'center', lineHeight: 19 },

    // Misc
    loadingText: { fontSize: 13, color: '#94A3B8', marginTop: 10 },
    endOfListText: { textAlign: 'center', fontSize: 12, color: '#CBD5E1', paddingVertical: 16, fontWeight: '500' },
});