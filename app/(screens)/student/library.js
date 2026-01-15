// app/(screens)/student/library.js
// Student Library - Browse catalog, borrow books, track requests
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
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    BookOpen,
    ArrowLeft,
    AlertCircle,
    Clock,
    User,
    AlertTriangle,
    CheckCircle2,
    Calendar,
    Search,
    X,
    Tag,
    BookMarked,
    Info,
    DollarSign,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TABS = [
    { id: 'my-books', label: 'My Books' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'requests', label: 'Requests' },
    { id: 'history', label: 'History' },
];

export default function StudentLibraryScreen() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('my-books');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBook, setSelectedBook] = useState(null);
    const [showBookModal, setShowBookModal] = useState(false);
    const [isRequesting, setIsRequesting] = useState(false);

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const studentId = userData?.studentdatafull?.userId || userData?.id;

    // Fetch student's borrowed books
    const { data: myBooksData, isLoading: myBooksLoading } = useQuery({
        queryKey: ['student-library-borrowed', schoolId, studentId],
        queryFn: async () => {
            if (!schoolId || !studentId) return [];
            const res = await api.get(
                `/schools/${schoolId}/library/transactions?userId=${studentId}&status=ISSUED`
            );
            const transactions = res.data?.transactions || [];
            const today = new Date();
            return transactions.map(t => {
                const dueDate = new Date(t.dueDate);
                return {
                    ...t,
                    book: t.book || t.copy?.book,
                    isOverdue: dueDate < today,
                };
            });
        },
        enabled: !!schoolId && !!studentId && activeTab === 'my-books',
        staleTime: 1000 * 60 * 2,
    });

    // Fetch student's fines
    const { data: finesData } = useQuery({
        queryKey: ['student-library-fines', schoolId, studentId],
        queryFn: async () => {
            if (!schoolId || !studentId) return [];
            const res = await api.get(`/schools/${schoolId}/library/fines?userId=${studentId}`);
            return res.data || [];
        },
        enabled: !!schoolId && !!studentId && activeTab === 'my-books',
        staleTime: 1000 * 60 * 2,
    });

    // Fetch catalog
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
        staleTime: 1000 * 60 * 5,
    });

    // Fetch student's requests
    const { data: requestsData, isLoading: requestsLoading } = useQuery({
        queryKey: ['student-library-requests', schoolId, studentId],
        queryFn: async () => {
            if (!schoolId || !studentId) return [];
            const res = await api.get(
                `/schools/${schoolId}/library/requests?userId=${studentId}`
            );
            return res.data || [];
        },
        enabled: !!schoolId && !!studentId && activeTab === 'requests',
        staleTime: 1000 * 60 * 2,
    });

    // Fetch history
    const { data: historyData, isLoading: historyLoading } = useQuery({
        queryKey: ['student-library-history', schoolId, studentId],
        queryFn: async () => {
            if (!schoolId || !studentId) return [];
            const res = await api.get(
                `/schools/${schoolId}/library/transactions?userId=${studentId}&status=RETURNED`
            );
            return res.data?.transactions || res.data || [];
        },
        enabled: !!schoolId && !!studentId && activeTab === 'history',
        staleTime: 1000 * 60 * 5,
    });


    const borrowedBooks = myBooksData || [];
    const fines = Array.isArray(finesData) ? finesData : [];
    const totalFines = fines.reduce((sum, fine) => sum + (fine.amount || 0), 0);
    const overdueBooks = borrowedBooks.filter(b => b.isOverdue).length;

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['student-library']);
        await queryClient.invalidateQueries(['library-catalog']);
        setRefreshing(false);
    }, [queryClient]);

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    const getDaysUntilDue = (dueDate) => {
        const due = new Date(dueDate);
        const today = new Date();
        const days = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
        if (days < 0) return `${Math.abs(days)} days overdue`;
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
            Alert.alert('Error', 'Unable to request book. User information missing.');
            return;
        }

        setIsRequesting(true);
        try {
            await api.post(`/schools/${schoolId}/library/requests`, {
                userId: studentId,
                bookId: bookId,
                userType: 'STUDENT',
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Success', 'Book request submitted successfully!');
            await queryClient.invalidateQueries(['student-library-requests']);
            setShowBookModal(false);
        } catch (error) {
            console.error('Request book error:', error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Error', error.response?.data?.error || 'Failed to request book. Please try again.');
        } finally {
            setIsRequesting(false);
        }
    };

    const CatalogBookCard = ({ book, index }) => (
        <Animated.View entering={FadeInRight.delay(100 + index * 40).duration(400)}>
            <HapticTouchable onPress={() => openBookDetails(book)}>
                <View style={styles.catalogCard}>
                    {book.coverImage ? (
                        <Image
                            source={{ uri: book.coverImage }}
                            style={styles.catalogCover}
                            contentFit="cover"
                        />
                    ) : (
                        <View style={[styles.catalogCover, styles.noCover]}>
                            <BookOpen size={24} color="#9CA3AF" />
                        </View>
                    )}
                    <View style={styles.catalogContent}>
                        <Text style={styles.catalogTitle} numberOfLines={2}>{book.title}</Text>
                        <Text style={styles.catalogAuthor} numberOfLines={1}>{book.author}</Text>
                        <View style={styles.catalogMeta}>
                            <View style={[
                                styles.availabilityBadge,
                                { backgroundColor: book.availableCopies > 0 ? '#D1FAE5' : '#FEE2E2' }
                            ]}>
                                <Text style={[
                                    styles.availabilityText,
                                    { color: book.availableCopies > 0 ? '#10B981' : '#EF4444' }
                                ]}>
                                    {book.availableCopies > 0 ? `${book.availableCopies} available` : 'Not available'}
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
            </HapticTouchable>
        </Animated.View>
    );

    const BookDetailModal = () => (
        <Modal
            visible={showBookModal}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowBookModal(false)}
        >
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Book Details</Text>
                        <HapticTouchable onPress={() => setShowBookModal(false)}>
                            <View style={styles.modalCloseBtn}>
                                <X size={20} color="#666" />
                            </View>
                        </HapticTouchable>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {selectedBook && (
                            <>
                                <View style={styles.modalCoverContainer}>
                                    {selectedBook.coverImage ? (
                                        <Image
                                            source={{ uri: selectedBook.coverImage }}
                                            style={styles.modalCover}
                                            contentFit="cover"
                                        />
                                    ) : (
                                        <View style={[styles.modalCover, styles.noCoverLarge]}>
                                            <BookOpen size={48} color="#9CA3AF" />
                                        </View>
                                    )}
                                </View>

                                <Text style={styles.modalBookTitle}>{selectedBook.title}</Text>
                                <Text style={styles.modalBookAuthor}>{selectedBook.author}</Text>

                                {selectedBook.category && (
                                    <View style={styles.categoryBadge}>
                                        <Tag size={14} color="#666" />
                                        <Text style={styles.categoryText}>Category: {selectedBook.category?.name || selectedBook.category}</Text>
                                    </View>
                                )}

                                {(selectedBook.availableCopies !== undefined) && (
                                    <View style={[
                                        styles.modalAvailability,
                                        { backgroundColor: selectedBook.availableCopies > 0 ? '#D1FAE5' : '#FEE2E2' }
                                    ]}>
                                        {selectedBook.availableCopies > 0 ? (
                                            <CheckCircle2 size={18} color="#10B981" />
                                        ) : (
                                            <AlertCircle size={18} color="#EF4444" />
                                        )}
                                        <Text style={[
                                            styles.modalAvailabilityText,
                                            { color: selectedBook.availableCopies > 0 ? '#10B981' : '#EF4444' }
                                        ]}>
                                            {selectedBook.availableCopies > 0
                                                ? `${selectedBook.availableCopies} of ${selectedBook.totalCopies} copies available`
                                                : 'All copies currently issued'}
                                        </Text>
                                    </View>
                                )}

                                {selectedBook.description && (
                                    <View style={styles.descriptionContainer}>
                                        <Text style={styles.descriptionLabel}>Description</Text>
                                        <Text style={styles.descriptionText}>{selectedBook.description}</Text>
                                    </View>
                                )}

                                {selectedBook.availableCopies !== undefined && (
                                    <View style={{ marginTop: 20, marginBottom: 10 }}>
                                        <HapticTouchable
                                            onPress={() => handleRequestBook(selectedBook.id)}
                                            disabled={isRequesting || selectedBook.availableCopies === 0}
                                        >
                                            <View style={[
                                                styles.requestButton,
                                                (isRequesting || selectedBook.availableCopies === 0) && styles.requestButtonDisabled
                                            ]}>
                                                {isRequesting ? (
                                                    <ActivityIndicator color="#fff" />
                                                ) : (
                                                    <Text style={styles.requestButtonText}>
                                                        {selectedBook.availableCopies > 0 ? 'Request This Book' : 'Not Available'}
                                                    </Text>
                                                )}
                                            </View>
                                        </HapticTouchable>
                                    </View>
                                )}
                            </>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'my-books':
                if (myBooksLoading) {
                    return <View style={styles.loader}><ActivityIndicator size="large" color="#0469ff" /></View>;
                }
                return (
                    <>
                        {/* Summary Stats */}
                        <Animated.View entering={FadeInDown.duration(400)} style={styles.statsRow}>
                            <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
                                <BookOpen size={20} color="#0469ff" />
                                <Text style={styles.statValue}>{borrowedBooks.length}</Text>
                                <Text style={styles.statLabel}>Borrowed</Text>
                            </View>
                            <View style={[styles.statCard, { backgroundColor: overdueBooks > 0 ? '#FEE2E2' : '#F3F4F6' }]}>
                                <AlertTriangle size={20} color={overdueBooks > 0 ? '#EF4444' : '#666'} />
                                <Text style={[styles.statValue, overdueBooks > 0 && { color: '#EF4444' }]}>{overdueBooks}</Text>
                                <Text style={styles.statLabel}>Overdue</Text>
                            </View>
                            <View style={[styles.statCard, { backgroundColor: totalFines > 0 ? '#FEF3C7' : '#F3F4F6' }]}>
                                <DollarSign size={20} color={totalFines > 0 ? '#F59E0B' : '#666'} />
                                <Text style={[styles.statValue, totalFines > 0 && { color: '#F59E0B' }]}>₹{totalFines}</Text>
                                <Text style={styles.statLabel}>Fines</Text>
                            </View>
                        </Animated.View>

                        {/* Books List */}
                        {borrowedBooks.length === 0 ? (
                            <View style={styles.emptyState}>
                                <BookOpen size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Borrowed Books</Text>
                                <Text style={styles.emptySubtitle}>Browse the catalog to find books</Text>
                            </View>
                        ) : (
                            borrowedBooks.map((item, index) => {
                                const daysInfo = getDaysUntilDue(item.dueDate);
                                const book = item.book;
                                return (
                                    <Animated.View key={item.id} entering={FadeInRight.delay(100 + index * 80).duration(400)}>
                                        <HapticTouchable onPress={() => openBookDetails(book)}>
                                            <View style={[styles.myBookCard, item.isOverdue && styles.myBookCardOverdue]}>
                                                {book?.coverImage ? (
                                                    <Image
                                                        source={{ uri: book.coverImage }}
                                                        style={styles.myBookCover}
                                                        contentFit="cover"
                                                    />
                                                ) : (
                                                    <View style={[styles.myBookCover, styles.noCover]}>
                                                        <BookOpen size={28} color="#9CA3AF" />
                                                    </View>
                                                )}
                                                <View style={styles.myBookContent}>
                                                    <View style={styles.myBookHeader}>
                                                        <Text style={styles.myBookTitle} numberOfLines={2}>{book?.title || 'Unknown'}</Text>
                                                        {item.isOverdue && (
                                                            <View style={styles.overdueBadge}>
                                                                <AlertTriangle size={10} color="#EF4444" />
                                                                <Text style={styles.overdueText}>Overdue</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={styles.myBookAuthor} numberOfLines={1}>{book?.author || ''}</Text>
                                                    <View style={styles.myBookMeta}>
                                                        <View style={styles.metaItem}>
                                                            <Calendar size={12} color="#666" />
                                                            <Text style={[styles.metaText, item.isOverdue && { color: '#EF4444', fontWeight: '600' }]}>
                                                                {daysInfo}
                                                            </Text>
                                                        </View>
                                                        <Text style={styles.metaDivider}>•</Text>
                                                        <Text style={styles.metaText}>Due: {formatDate(item.dueDate)}</Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </HapticTouchable>
                                    </Animated.View>
                                );
                            })
                        )}
                    </>
                );

            case 'catalog':
                return (
                    <View>
                        <View style={styles.searchContainer}>
                            <Search size={20} color="#999" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search books..."
                                placeholderTextColor="#999"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                            />
                            {searchQuery.length > 0 && (
                                <HapticTouchable onPress={() => setSearchQuery('')}>
                                    <X size={20} color="#999" />
                                </HapticTouchable>
                            )}
                        </View>
                        {catalogLoading ? (
                            <View style={styles.loader}><ActivityIndicator size="large" color="#0469ff" /></View>
                        ) : !catalogBooks?.length ? (
                            <View style={styles.emptyState}>
                                <Search size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Books Found</Text>
                                <Text style={styles.emptySubtitle}>Try a different search term</Text>
                            </View>
                        ) : (
                            catalogBooks.map((book, index) => (
                                <CatalogBookCard key={book.id} book={book} index={index} />
                            ))
                        )}
                    </View>
                );

            case 'requests':
                if (requestsLoading) {
                    return <View style={styles.loader}><ActivityIndicator size="large" color="#0469ff" /></View>;
                }
                if (!requestsData?.length) {
                    return (
                        <View style={styles.emptyState}>
                            <BookMarked size={48} color="#ccc" />
                            <Text style={styles.emptyTitle}>No Requests</Text>
                            <Text style={styles.emptySubtitle}>Browse the catalog to request books</Text>
                        </View>
                    );
                }
                return requestsData.map((request, index) => {
                    const statusColors = {
                        PENDING: { bg: '#FEF3C7', text: '#F59E0B' },
                        APPROVED: { bg: '#D1FAE5', text: '#10B981' },
                        COLLECTED: { bg: '#DBEAFE', text: '#0469ff' },
                        REJECTED: { bg: '#FEE2E2', text: '#EF4444' },
                        RETURNED: { bg: '#E5E7EB', text: '#6B7280' },
                    };
                    const colors = statusColors[request.status] || statusColors.PENDING;
                    return (
                        <Animated.View key={request.id} entering={FadeInRight.delay(index * 80).duration(400)}>
                            <View style={styles.requestCard}>
                                <View style={styles.requestCoverContainer}>
                                    {request.book.coverImage ? (
                                        <Image
                                            source={{ uri: request.book.coverImage }}
                                            style={styles.requestCover}
                                            contentFit="cover"
                                        />
                                    ) : (
                                        <View style={[styles.requestCover, styles.noCover]}>
                                            <BookOpen size={20} color="#9CA3AF" />
                                        </View>
                                    )}
                                </View>
                                <View style={styles.requestContent}>
                                    <View style={styles.requestHeader}>
                                        <Text style={styles.requestTitle} numberOfLines={1}>
                                            {request.book?.title || 'Unknown Book'}
                                        </Text>
                                        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
                                            <Text style={[styles.statusText, { color: colors.text }]}>{request.status}</Text>
                                        </View>
                                    </View>

                                    <Text style={styles.bookAuthor} numberOfLines={1}>by {request.book?.author}</Text>

                                    <View style={styles.requestMeta}>
                                        <View style={styles.metaItem}>
                                            <Calendar size={12} color="#666" />
                                            <Text style={styles.metaText}>
                                                Requested: {formatDate(request.createdAt)}
                                            </Text>
                                        </View>
                                        {request.book?.category && (
                                            <>
                                                <Text style={styles.metaDivider}>•</Text>
                                                <Text style={styles.metaText}>
                                                    {request.book.category?.name || request.book.category}
                                                </Text>
                                            </>
                                        )}
                                    </View>

                                    {request.pickupCode && request.status === 'APPROVED' && (
                                        <View style={styles.pickupCodeContainer}>
                                            <Text style={styles.pickupCodeLabel}>Pickup Code:</Text>
                                            <Text style={styles.pickupCode}>{request.pickupCode}</Text>
                                        </View>
                                    )}

                                    {request.remarks && (
                                        <Text style={styles.remarksText} numberOfLines={1}>
                                            Note: {request.remarks}
                                        </Text>
                                    )}
                                </View>
                            </View>
                        </Animated.View>
                    );
                });

            case 'history':
                if (historyLoading) {
                    return <View style={styles.loader}><ActivityIndicator size="large" color="#0469ff" /></View>;
                }
                const historyList = Array.isArray(historyData) ? historyData : [];
                if (!historyList.length) {
                    return (
                        <View style={styles.emptyState}>
                            <Clock size={48} color="#ccc" />
                            <Text style={styles.emptyTitle}>No History</Text>
                            <Text style={styles.emptySubtitle}>Your returned books will appear here</Text>
                        </View>
                    );
                }
                return historyList.map((item, index) => (
                    <Animated.View key={item.id} entering={FadeInRight.delay(index * 80).duration(400)}>
                        <View style={styles.historyCard}>
                            <View style={[styles.bookIcon, { backgroundColor: '#E5E7EB' }]}>
                                <CheckCircle2 size={24} color="#6B7280" />
                            </View>
                            <View style={styles.bookInfo}>
                                <Text style={styles.bookTitle} numberOfLines={1}>
                                    {item.book?.title || item.copy?.book?.title || 'Unknown'}
                                </Text>
                                <Text style={styles.historyDates}>
                                    {formatDate(item.issueDate)} → {formatDate(item.returnDate)}
                                </Text>
                            </View>
                        </View>
                    </Animated.View>
                ));

            default:
                return null;
        }
    };

    return (
        <View style={styles.container}>
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Library</Text>
                    <Text style={styles.headerSubtitle}>Browse & Borrow</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <View style={styles.tabsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                    {TABS.map((tab) => (
                        <HapticTouchable key={tab.id} onPress={() => setActiveTab(tab.id)}>
                            <View style={[styles.tab, activeTab === tab.id && styles.activeTab]}>
                                <Text style={[styles.tabText, activeTab === tab.id && styles.activeTabText]}>
                                    {tab.label}
                                </Text>
                            </View>
                        </HapticTouchable>
                    ))}
                </ScrollView>
            </View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {renderContent()}
                <View style={{ height: 40 }} />
            </ScrollView>

            <BookDetailModal />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
    tabsContainer: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    tabs: { paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
    tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f5f5f5' },
    activeTab: { backgroundColor: '#0469ff' },
    tabText: { fontSize: 14, fontWeight: '600', color: '#666' },
    activeTabText: { color: '#fff' },
    content: { flex: 1, padding: 16 },
    loader: { paddingVertical: 60, alignItems: 'center' },
    emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center' },
    bookCard: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderRadius: 12, padding: 14, marginBottom: 10, alignItems: 'center', gap: 12 },
    bookIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    bookInfo: { flex: 1 },
    bookTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
    bookAuthor: { fontSize: 13, color: '#666', marginTop: 2 },
    dueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 6, alignSelf: 'flex-start' },
    dueText: { fontSize: 11, fontWeight: '600' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, gap: 10 },
    searchInput: { flex: 1, fontSize: 15, color: '#111' },
    catalogCard: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderRadius: 12, padding: 12, marginBottom: 10, gap: 12 },
    catalogCover: { width: 60, height: 80, borderRadius: 8, backgroundColor: '#e5e7eb' },
    noCover: { alignItems: 'center', justifyContent: 'center' },
    catalogContent: { flex: 1, justifyContent: 'center' },
    catalogTitle: { fontSize: 15, fontWeight: '700', color: '#111' },
    catalogAuthor: { fontSize: 13, color: '#666', marginTop: 2 },
    catalogMeta: { marginTop: 8 },
    availabilityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
    availabilityText: { fontSize: 11, fontWeight: '600' },
    requestCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: 12, padding: 14, marginBottom: 10 },
    requestInfo: { flex: 1 },
    requestTitle: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1, marginRight: 8 },
    requestDate: { fontSize: 12, color: '#999', marginTop: 2 },
    // New Request Card Styles
    requestCoverContainer: { marginRight: 12 },
    requestCover: { width: 50, height: 75, borderRadius: 8 },
    requestContent: { flex: 1 },
    requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 },
    requestMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
    remarksText: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 4 },
    pickupCodeContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
    pickupCodeLabel: { fontSize: 11, color: '#666' },
    pickupCode: { fontSize: 13, fontWeight: '700', color: '#10B981', backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
    statusText: { fontSize: 11, fontWeight: '700' },
    historyCard: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderRadius: 12, padding: 14, marginBottom: 10, alignItems: 'center', gap: 12 },
    historyDates: { fontSize: 12, color: '#666', marginTop: 2 },
    // Modal - bottom sheet style like teacher
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
    modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    modalCoverContainer: { alignItems: 'center', marginBottom: 20 },
    modalCover: { width: 140, height: 200, borderRadius: 12 },
    noCoverLarge: { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
    modalBookTitle: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 8 },
    modalBookAuthor: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 20 },
    categoryBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 },
    categoryText: { fontSize: 14, color: '#666' },
    modalAvailability: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, marginBottom: 20 },
    modalAvailabilityText: { fontSize: 14, fontWeight: '600' },
    descriptionContainer: { marginTop: 10 },
    descriptionLabel: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 8 },
    descriptionText: { fontSize: 14, color: '#666', lineHeight: 22 },
    requestButton: { backgroundColor: '#0469ff', borderRadius: 12, padding: 16, alignItems: 'center' },
    requestButtonDisabled: { backgroundColor: '#ccc' },
    requestButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
    // Stats row
    statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    statCard: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12, gap: 4 },
    statValue: { fontSize: 20, fontWeight: '700', color: '#111' },
    statLabel: { fontSize: 11, color: '#666' },
    // My Books card with cover
    myBookCard: { flexDirection: 'row', backgroundColor: '#f8f9fa', borderRadius: 16, padding: 12, marginBottom: 12, gap: 14 },
    myBookCardOverdue: { borderWidth: 1, borderColor: '#FECACA' },
    myBookCover: { width: 70, height: 100, borderRadius: 10, backgroundColor: '#e5e7eb' },
    myBookContent: { flex: 1, justifyContent: 'center' },
    myBookHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    myBookTitle: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
    myBookAuthor: { fontSize: 13, color: '#666', marginTop: 2 },
    myBookMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { fontSize: 12, color: '#666' },
    metaDivider: { fontSize: 12, color: '#ccc' },
    overdueBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
    overdueText: { fontSize: 10, fontWeight: '600', color: '#EF4444' },
});
