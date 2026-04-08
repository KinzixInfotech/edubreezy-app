// app/(screens)/my-child/parent-library.js
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    TextInput,
    Modal,
    Dimensions,
    Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeInRight, FadeIn } from 'react-native-reanimated';
import {
    BookOpen,
    ArrowLeft,
    AlertCircle,
    Clock,
    User,
    AlertTriangle,
    CheckCircle2,
    Calendar,
    DollarSign,
    Search,
    X,
    Tag,
    BookMarked,
    Info,
    ChevronRight,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TABS = [
    { id: 'borrowed', label: 'Borrowed', icon: BookOpen },
    { id: 'catalog', label: 'Catalog', icon: Search },
    { id: 'requests', label: 'Requests', icon: Clock },
    { id: 'history', label: 'History', icon: CheckCircle2 },
];

export default function ParentLibraryScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('borrowed');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBook, setSelectedBook] = useState(null);
    const [showBookModal, setShowBookModal] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);

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
    const parentId = userData?.parentData?.id;
    const parentUserId = userData?.id;
    const studentId = childData?.studentId || childData?.id;

    const { data: libraryData, isLoading } = useQuery({
        queryKey: ['parent-library', schoolId, parentId, studentId],
        queryFn: async () => {
            if (!schoolId || !parentId || !studentId) return null;
            const res = await api.get(
                `/schools/${schoolId}/parents/${parentId}/library?studentId=${studentId}`
            );
            return res.data;
        },
        enabled: !!schoolId && !!parentId && !!studentId,
        staleTime: 60 * 1000,
        placeholderData: (previousData) => previousData,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    const { data: catalogBooks, isLoading: catalogLoading } = useQuery({
        queryKey: ['library-catalog', schoolId, searchQuery],
        queryFn: async () => {
            if (!schoolId) return [];
            const res = await api.get(
                `/schools/${schoolId}/library/books?search=${searchQuery}&limit=50`
            );
            return res.data || [];
        },
        enabled: !!schoolId && activeTab === 'catalog',
        staleTime: 2 * 60 * 1000,
        placeholderData: (previousData) => previousData,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    const borrowedBooks = libraryData?.borrowedBooks || [];
    const pendingRequests = libraryData?.pendingRequests || [];
    const returnHistory = libraryData?.returnHistory || [];
    const summary = libraryData?.summary || {};
    const settings = libraryData?.settings || {};

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['parent-library']);
        await queryClient.invalidateQueries(['library-catalog']);
        setRefreshing(false);
    }, [queryClient]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
        });
    };

    const getDaysUntilDue = (dueDate) => {
        const days = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        if (days < 0) return `${Math.abs(days)}d overdue`;
        if (days === 0) return 'Due today';
        if (days === 1) return 'Due tomorrow';
        return `${days} days left`;
    };

    const openBookDetails = (book) => {
        setSelectedBook(book);
        setShowBookModal(true);
    };

    const handleRequestBook = async (bookId) => {
        if (!schoolId || !studentId) {
            Alert.alert('Error', 'Unable to request book. Student information missing.');
            return;
        }
        setIsRequesting(true);
        try {
            await api.post(`/schools/${schoolId}/library/requests`, {
                userId: studentId,
                bookId,
                userType: 'STUDENT',
                requestedBy: parentUserId,
            });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Success', `Book request submitted for ${childData.name}!`);
            await queryClient.invalidateQueries(['parent-library']);
            setShowBookModal(false);
        } catch (error) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Error', error.response?.data?.error || 'Failed to request book.');
        } finally {
            setIsRequesting(false);
        }
    };

    if (!childData) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}><ArrowLeft size={24} color="#111" /></View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}><Text style={styles.headerTitle}>Library</Text></View>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyState}>
                    <AlertCircle size={48} color="#ccc" />
                    <Text style={styles.emptyTitle}>No Child Selected</Text>
                    <Text style={styles.emptySubtitle}>Please select a child from the home screen</Text>
                </View>
            </SafeAreaView>
        );
    }

    // ── Catalog card ────────────────────────────────────────────────────────
    const CatalogBookCard = ({ book, index }) => (
        <Animated.View entering={FadeInRight.delay(60 + index * 35).duration(400)}>
            <HapticTouchable onPress={() => openBookDetails(book)}>
                <View style={styles.catalogCard}>
                    {book.coverImage ? (
                        <Image source={{ uri: book.coverImage }} style={styles.catalogCover} contentFit="cover" />
                    ) : (
                        <View style={[styles.catalogCover, styles.noCover]}>
                            <BookOpen size={22} color="#9CA3AF" />
                        </View>
                    )}
                    <View style={styles.catalogContent}>
                        <Text style={styles.catalogTitle} numberOfLines={2}>{book.title}</Text>
                        <Text style={styles.catalogAuthor} numberOfLines={1}>by {book.author}</Text>
                        <View style={styles.catalogMeta}>
                            {book.category && (
                                <View style={styles.categoryBadge}>
                                    <Tag size={10} color="#6366F1" />
                                    <Text style={styles.categoryText}>{book.category}</Text>
                                </View>
                            )}
                            <View style={[
                                styles.availabilityBadge,
                                { backgroundColor: book.availableCopies > 0 ? '#D1FAE5' : '#FEE2E2' }
                            ]}>
                                <Text style={[
                                    styles.availabilityText,
                                    { color: book.availableCopies > 0 ? '#10B981' : '#EF4444' }
                                ]}>
                                    {book.availableCopies > 0 ? `${book.availableCopies} avail.` : 'Unavailable'}
                                </Text>
                            </View>
                        </View>
                    </View>
                    <ChevronRight size={16} color="#ccc" />
                </View>
            </HapticTouchable>
        </Animated.View>
    );

    // ── Book detail modal ────────────────────────────────────────────────────
    const BookDetailModal = () => (
        <Modal
            visible={showBookModal}
            animationType="slide"
            transparent
            onRequestClose={() => setShowBookModal(false)}
        >
            <View style={styles.modalOverlay}>
                <Animated.View
                    entering={FadeIn.duration(200)}
                    style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}
                >
                    <View style={styles.modalHandle} />
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Book Details</Text>
                        <HapticTouchable onPress={() => setShowBookModal(false)}>
                            <View style={styles.modalCloseBtn}><X size={20} color="#666" /></View>
                        </HapticTouchable>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
                        {selectedBook && (
                            <>
                                <View style={styles.modalCoverContainer}>
                                    {selectedBook.coverImage ? (
                                        <Image source={{ uri: selectedBook.coverImage }} style={styles.modalCover} contentFit="cover" />
                                    ) : (
                                        <View style={[styles.modalCover, styles.noCoverLarge]}>
                                            <BookOpen size={48} color="#9CA3AF" />
                                        </View>
                                    )}
                                </View>

                                <Text style={styles.modalBookTitle}>{selectedBook.title}</Text>
                                <Text style={styles.modalBookAuthor}>by {selectedBook.author}</Text>

                                <View style={[
                                    styles.modalAvailability,
                                    { backgroundColor: selectedBook.availableCopies > 0 ? '#D1FAE5' : '#FEE2E2' }
                                ]}>
                                    {selectedBook.availableCopies > 0
                                        ? <CheckCircle2 size={16} color="#10B981" />
                                        : <AlertCircle size={16} color="#EF4444" />
                                    }
                                    <Text style={[
                                        styles.modalAvailabilityText,
                                        { color: selectedBook.availableCopies > 0 ? '#10B981' : '#EF4444' }
                                    ]}>
                                        {selectedBook.availableCopies > 0
                                            ? `${selectedBook.availableCopies} of ${selectedBook.totalCopies} copies available`
                                            : 'All copies currently issued'}
                                    </Text>
                                </View>

                                <View style={styles.detailsGrid}>
                                    {[
                                        { icon: Tag, color: '#6366F1', label: 'Category', value: selectedBook.category || 'General' },
                                        { icon: BookMarked, color: '#0EA5E9', label: 'Publisher', value: selectedBook.publisher || 'N/A' },
                                        selectedBook.edition && { icon: Info, color: '#F59E0B', label: 'Edition', value: selectedBook.edition },
                                        selectedBook.ISBN && { icon: Info, color: '#10B981', label: 'ISBN', value: selectedBook.ISBN },
                                    ].filter(Boolean).map((item, i) => {
                                        const Icon = item.icon;
                                        return (
                                            <View key={i} style={styles.detailItem}>
                                                <Icon size={15} color={item.color} />
                                                <Text style={styles.detailLabel}>{item.label}</Text>
                                                <Text style={styles.detailValue}>{item.value}</Text>
                                            </View>
                                        );
                                    })}
                                </View>

                                {selectedBook.description && (
                                    <View style={styles.descriptionContainer}>
                                        <Text style={styles.descriptionLabel}>About this book</Text>
                                        <Text style={styles.descriptionText}>{selectedBook.description}</Text>
                                    </View>
                                )}

                                <View style={styles.requestButtonContainer}>
                                    <HapticTouchable
                                        onPress={() => handleRequestBook(selectedBook.id)}
                                        disabled={isRequesting || selectedBook.availableCopies === 0}
                                    >
                                        <View style={[
                                            styles.requestButton,
                                            (isRequesting || selectedBook.availableCopies === 0) && styles.requestButtonDisabled
                                        ]}>
                                            {isRequesting
                                                ? <><ActivityIndicator size="small" color="#fff" /><Text style={styles.requestButtonText}>Requesting...</Text></>
                                                : <Text style={styles.requestButtonText}>
                                                    {selectedBook.availableCopies > 0
                                                        ? `Request for ${childData.name}`
                                                        : 'Not Available'}
                                                </Text>
                                            }
                                        </View>
                                    </HapticTouchable>
                                </View>
                            </>
                        )}
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}><ArrowLeft size={24} color="#111" /></View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Library</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s books</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {/* Summary banner */}
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.summaryBanner}>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{summary.totalBorrowed || 0}</Text>
                    <Text style={styles.summaryLabel}>Borrowed</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, summary.overdueCount > 0 && { color: '#EF4444' }]}>
                        {summary.overdueCount || 0}
                    </Text>
                    <Text style={styles.summaryLabel}>Overdue</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                    <Text style={[styles.summaryValue, summary.totalFinesDue > 0 && { color: '#F59E0B' }]}>
                        ₹{summary.totalFinesDue || 0}
                    </Text>
                    <Text style={styles.summaryLabel}>Fines</Text>
                </View>
                <View style={styles.summaryDivider} />
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryValue}>{pendingRequests.length}</Text>
                    <Text style={styles.summaryLabel}>Requests</Text>
                </View>
            </Animated.View>

            {/* Tab bar — outside scroll, always visible */}
            <Animated.View entering={FadeInDown.delay(160).duration(400)} style={styles.tabBar}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.tabBarContent}
                >
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <HapticTouchable key={tab.id} onPress={() => setActiveTab(tab.id)}>
                                <View style={[styles.tab, isActive && styles.tabActive]}>
                                    <Icon size={14} color={isActive ? '#0469ff' : '#999'} />
                                    <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                                        {tab.label}
                                    </Text>
                                </View>
                            </HapticTouchable>
                        );
                    })}
                </ScrollView>
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 24 }]}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
            >
                {/* Search bar — catalog only */}
                {activeTab === 'catalog' && (
                    <Animated.View entering={FadeInDown.delay(60).duration(300)}>
                        <View style={styles.searchContainer}>
                            <Search size={17} color="#9CA3AF" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search by title, author, ISBN…"
                                placeholderTextColor="#9CA3AF"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <HapticTouchable onPress={() => setSearchQuery('')}>
                                    <X size={17} color="#9CA3AF" />
                                </HapticTouchable>
                            )}
                        </View>
                    </Animated.View>
                )}

                {/* ── Tab content ─────────────────────────────────────────────── */}
                {isLoading && activeTab !== 'catalog' ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                        <Text style={styles.loadingText}>Loading…</Text>
                    </View>
                ) : activeTab === 'borrowed' ? (
                    borrowedBooks.length > 0 ? (
                        borrowedBooks.map((item, index) => (
                            <Animated.View
                                key={item.transactionId}
                                entering={FadeInRight.delay(80 + index * 55).duration(400)}
                            >
                                <View style={[styles.bookCard, item.isOverdue && styles.bookCardOverdue]}>
                                    {/* Status strip */}
                                    <View style={[styles.bookStrip, { backgroundColor: item.isOverdue ? '#EF4444' : '#0469ff' }]} />
                                    <View style={styles.bookCardInner}>
                                        <View style={styles.bookCardTop}>
                                            <View style={styles.bookCardLeft}>
                                                <Text style={styles.bookTitle} numberOfLines={1}>{item.book.title}</Text>
                                                <Text style={styles.bookAuthor}>by {item.book.author}</Text>
                                            </View>
                                            <View style={[
                                                styles.dueBadge,
                                                { backgroundColor: item.isOverdue ? '#FEE2E2' : '#EEF4FF' }
                                            ]}>
                                                {item.isOverdue
                                                    ? <AlertTriangle size={11} color="#EF4444" />
                                                    : <Clock size={11} color="#0469ff" />
                                                }
                                                <Text style={[
                                                    styles.dueBadgeText,
                                                    { color: item.isOverdue ? '#EF4444' : '#0469ff' }
                                                ]}>
                                                    {getDaysUntilDue(item.dueDate)}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.bookCardBottom}>
                                            <View style={styles.metaChip}>
                                                <Calendar size={12} color="#888" />
                                                <Text style={styles.metaChipText}>Due {formatDate(item.dueDate)}</Text>
                                            </View>
                                            {item.fineAmount > 0 && (
                                                <View style={[styles.metaChip, { backgroundColor: '#FEF3C7' }]}>
                                                    <DollarSign size={12} color="#F59E0B" />
                                                    <Text style={[styles.metaChipText, { color: '#F59E0B', fontWeight: '700' }]}>
                                                        ₹{item.fineAmount} fine
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </View>
                            </Animated.View>
                        ))
                    ) : (
                        <EmptyState icon={BookOpen} title="No Books Borrowed" subtitle={`${childData.name} hasn't borrowed any books`} />
                    )
                ) : activeTab === 'catalog' ? (
                    catalogLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                            <Text style={styles.loadingText}>Loading catalog…</Text>
                        </View>
                    ) : catalogBooks?.length > 0 ? (
                        catalogBooks.map((book, index) => (
                            <CatalogBookCard key={book.id} book={book} index={index} />
                        ))
                    ) : (
                        <EmptyState icon={Search} title="No Books Found" subtitle={searchQuery ? 'Try a different search term' : 'No books in the library catalog'} />
                    )
                ) : activeTab === 'requests' ? (
                    pendingRequests.length > 0 ? (
                        pendingRequests.map((item, index) => (
                            <Animated.View
                                key={item.id}
                                entering={FadeInRight.delay(80 + index * 55).duration(400)}
                            >
                                <View style={styles.requestCard}>
                                    {item.book.coverImage ? (
                                        <Image source={{ uri: item.book.coverImage }} style={styles.requestCover} contentFit="cover" />
                                    ) : (
                                        <View style={[styles.requestCover, styles.noCover]}>
                                            <BookOpen size={18} color="#9CA3AF" />
                                        </View>
                                    )}
                                    <View style={styles.requestContent}>
                                        <View style={styles.requestTopRow}>
                                            <Text style={styles.bookTitle} numberOfLines={1}>{item.book.title}</Text>
                                            <View style={[
                                                styles.statusBadge,
                                                { backgroundColor: item.status === 'APPROVED' ? '#D1FAE5' : '#FEF3C7' }
                                            ]}>
                                                <Text style={[
                                                    styles.statusText,
                                                    { color: item.status === 'APPROVED' ? '#10B981' : '#F59E0B' }
                                                ]}>
                                                    {item.status === 'APPROVED' ? 'Approved' : 'Pending'}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={styles.bookAuthor} numberOfLines={1}>by {item.book.author}</Text>
                                        <View style={styles.metaChip}>
                                            <Calendar size={12} color="#888" />
                                            <Text style={styles.metaChipText}>{formatDate(item.requestDate)}</Text>
                                        </View>
                                    </View>
                                </View>
                            </Animated.View>
                        ))
                    ) : (
                        <EmptyState icon={Clock} title="No Pending Requests" subtitle="No book requests are pending" />
                    )
                ) : (
                    returnHistory.length > 0 ? (
                        returnHistory.map((item, index) => (
                            <Animated.View
                                key={item.transactionId}
                                entering={FadeInRight.delay(80 + index * 55).duration(400)}
                            >
                                <View style={styles.historyCard}>
                                    <View style={styles.historyIconBg}>
                                        <CheckCircle2 size={18} color="#10B981" />
                                    </View>
                                    <View style={styles.historyContent}>
                                        <Text style={styles.bookTitle}>{item.book.title}</Text>
                                        <Text style={styles.bookAuthor}>by {item.book.author}</Text>
                                        <View style={styles.metaChip}>
                                            <Calendar size={12} color="#888" />
                                            <Text style={styles.metaChipText}>Returned {formatDate(item.returnDate)}</Text>
                                        </View>
                                    </View>
                                </View>
                            </Animated.View>
                        ))
                    ) : (
                        <EmptyState icon={CheckCircle2} title="No Return History" subtitle="Previous returns will appear here" />
                    )
                )}
            </ScrollView>

            <BookDetailModal />
        </SafeAreaView>
    );
}

const EmptyState = ({ icon: Icon, title, subtitle }) => (
    <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.emptyState}>
        <View style={styles.emptyIconBg}>
            <Icon size={32} color="#ccc" />
        </View>
        <Text style={styles.emptyTitle}>{title}</Text>
        <Text style={styles.emptySubtitle}>{subtitle}</Text>
    </Animated.View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    backButton: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#f5f5f5',
        alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },

    // Summary banner
    summaryBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF4FF',
        marginHorizontal: 16,
        marginTop: 14,
        marginBottom: 4,
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 8,
    },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryValue: { fontSize: 20, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
    summaryLabel: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '500' },
    summaryDivider: { width: 1, height: 32, backgroundColor: '#d4e3ff' },

    // Tab bar
    tabBar: {
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
        marginTop: 12,
    },
    tabBarContent: {
        paddingHorizontal: 16,
        paddingBottom: 0,
        gap: 4,
    },
    tab: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
        marginBottom: -1,
    },
    tabActive: { borderBottomColor: '#0469ff' },
    tabText: { fontSize: 13, fontWeight: '600', color: '#999' },
    tabTextActive: { color: '#0469ff' },

    // Content
    content: { flex: 1 },
    contentContainer: { padding: 16 },

    // Search
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 14,
        gap: 10,
    },
    searchInput: { flex: 1, fontSize: 14, color: '#111' },

    // Loading
    loadingContainer: { paddingVertical: 60, alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, color: '#666' },

    // Borrowed book card
    bookCard: {
        flexDirection: 'row',
        backgroundColor: '#f8f9fa',
        borderRadius: 14,
        marginBottom: 12,
        overflow: 'hidden',
    },
    bookCardOverdue: { backgroundColor: '#FEF2F2' },
    bookStrip: { width: 4 },
    bookCardInner: { flex: 1, padding: 14 },
    bookCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
    bookCardLeft: { flex: 1, marginRight: 10 },
    bookTitle: { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 3 },
    bookAuthor: { fontSize: 12, color: '#888' },
    dueBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    },
    dueBadgeText: { fontSize: 11, fontWeight: '700' },
    bookCardBottom: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    metaChip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 4,
        borderRadius: 8,
    },
    metaChipText: { fontSize: 12, color: '#666' },

    // Catalog
    catalogCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        gap: 12,
    },
    catalogCover: { width: 56, height: 80, borderRadius: 8 },
    noCover: { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
    catalogContent: { flex: 1 },
    catalogTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 3 },
    catalogAuthor: { fontSize: 12, color: '#888', marginBottom: 8 },
    catalogMeta: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
    categoryBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 3,
        backgroundColor: '#EEF2FF', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    },
    categoryText: { fontSize: 11, fontWeight: '600', color: '#6366F1' },
    availabilityBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
    availabilityText: { fontSize: 11, fontWeight: '600' },

    // Request card
    requestCard: {
        flexDirection: 'row',
        backgroundColor: '#f8f9fa',
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        gap: 12,
        alignItems: 'flex-start',
    },
    requestCover: { width: 44, height: 64, borderRadius: 8 },
    requestContent: { flex: 1 },
    requestTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 3 },
    statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginLeft: 8 },
    statusText: { fontSize: 11, fontWeight: '700' },

    // History
    historyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        gap: 12,
    },
    historyIconBg: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center',
    },
    historyContent: { flex: 1 },

    // Modal
    modalOverlay: {
        flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        maxHeight: '88%',
    },
    modalHandle: {
        width: 36, height: 4, borderRadius: 2,
        backgroundColor: '#e0e0e0', alignSelf: 'center', marginTop: 10, marginBottom: 4,
    },
    modalHeader: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
        borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: '#111' },
    modalCloseBtn: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center',
    },
    modalCoverContainer: { alignItems: 'center', paddingVertical: 20 },
    modalCover: {
        width: 120, height: 170, borderRadius: 12,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15, shadowRadius: 8, elevation: 5,
    },
    noCoverLarge: { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
    modalBookTitle: {
        fontSize: 19, fontWeight: '800', color: '#111',
        textAlign: 'center', paddingHorizontal: 20, marginBottom: 4, letterSpacing: -0.3,
    },
    modalBookAuthor: { fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 14 },
    modalAvailability: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        marginHorizontal: 20, paddingVertical: 10, borderRadius: 12, gap: 8, marginBottom: 16,
    },
    modalAvailabilityText: { fontSize: 13, fontWeight: '600' },
    detailsGrid: {
        flexDirection: 'row', flexWrap: 'wrap',
        paddingHorizontal: 16, gap: 10, marginBottom: 16,
    },
    detailItem: {
        width: (SCREEN_WIDTH - 52) / 2,
        backgroundColor: '#f8f9fa', borderRadius: 12, padding: 12, gap: 4,
    },
    detailLabel: { fontSize: 11, color: '#999' },
    detailValue: { fontSize: 13, fontWeight: '600', color: '#111' },
    descriptionContainer: { paddingHorizontal: 20, marginBottom: 16 },
    descriptionLabel: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 6 },
    descriptionText: { fontSize: 14, lineHeight: 22, color: '#555' },
    requestButtonContainer: { paddingHorizontal: 20, marginBottom: 8 },
    requestButton: {
        backgroundColor: '#0469ff', paddingVertical: 14, borderRadius: 14,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    },
    requestButtonDisabled: { backgroundColor: '#9CA3AF' },
    requestButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },

    // Empty state
    emptyState: { alignItems: 'center', paddingVertical: 56, gap: 12 },
    emptyIconBg: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', paddingHorizontal: 32 },
});
