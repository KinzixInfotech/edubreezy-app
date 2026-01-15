// app/(screens)/my-child/parent-library.js
// Parent view of child's library - borrowed books, fines, overdue status, and catalog
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
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
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
    DollarSign,
    Search,
    X,
    Tag,
    BookMarked,
    Info,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TABS = [
    { id: 'borrowed', label: 'Borrowed' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'requests', label: 'Requests' },
    { id: 'history', label: 'History' },
];

export default function ParentLibraryScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('borrowed');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBook, setSelectedBook] = useState(null);
    const [showBookModal, setShowBookModal] = useState(false);

    // Parse child data from params
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
    const studentId = childData?.studentId || childData?.id;

    // Fetch library data
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
        staleTime: 1000 * 60 * 2,
    });

    // Fetch all library books (catalog)
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

    // No child data error state
    if (!childData) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#111" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Library</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyState}>
                    <AlertCircle size={48} color="#ccc" />
                    <Text style={styles.emptyTitle}>No Child Selected</Text>
                    <Text style={styles.emptySubtitle}>
                        Please select a child from the home screen
                    </Text>
                </View>
            </View>
        );
    }

    // Catalog Book Card Component
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
                        <Text style={styles.catalogAuthor} numberOfLines={1}>by {book.author}</Text>
                        <View style={styles.catalogMeta}>
                            <View style={styles.categoryBadge}>
                                <Tag size={10} color="#6366F1" />
                                <Text style={styles.categoryText}>{book.category || 'General'}</Text>
                            </View>
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

    // Book Detail Modal
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
                                {/* Cover Image */}
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

                                {/* Title & Author */}
                                <Text style={styles.modalBookTitle}>{selectedBook.title}</Text>
                                <Text style={styles.modalBookAuthor}>by {selectedBook.author}</Text>

                                {/* Availability */}
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

                                {/* Details Grid */}
                                <View style={styles.detailsGrid}>
                                    <View style={styles.detailItem}>
                                        <Tag size={16} color="#6366F1" />
                                        <Text style={styles.detailLabel}>Category</Text>
                                        <Text style={styles.detailValue}>{selectedBook.category || 'General'}</Text>
                                    </View>
                                    <View style={styles.detailItem}>
                                        <BookMarked size={16} color="#0EA5E9" />
                                        <Text style={styles.detailLabel}>Publisher</Text>
                                        <Text style={styles.detailValue}>{selectedBook.publisher || 'N/A'}</Text>
                                    </View>
                                    {selectedBook.edition && (
                                        <View style={styles.detailItem}>
                                            <Info size={16} color="#F59E0B" />
                                            <Text style={styles.detailLabel}>Edition</Text>
                                            <Text style={styles.detailValue}>{selectedBook.edition}</Text>
                                        </View>
                                    )}
                                    {selectedBook.ISBN && (
                                        <View style={styles.detailItem}>
                                            <Info size={16} color="#10B981" />
                                            <Text style={styles.detailLabel}>ISBN</Text>
                                            <Text style={styles.detailValue}>{selectedBook.ISBN}</Text>
                                        </View>
                                    )}
                                </View>

                                {/* Description */}
                                {selectedBook.description && (
                                    <View style={styles.descriptionContainer}>
                                        <Text style={styles.descriptionLabel}>About this book</Text>
                                        <Text style={styles.descriptionText}>{selectedBook.description}</Text>
                                    </View>
                                )}
                            </>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Library</Text>
                    <Text style={styles.headerSubtitle}>{childData.name}'s books</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                    />
                }
            >
                {/* Child Info Card */}
                <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                    <View style={styles.childInfoCard}>
                        <View style={styles.childInfoIcon}>
                            <User size={20} color="#0469ff" />
                        </View>
                        <View style={styles.childInfoContent}>
                            <Text style={styles.childInfoName}>{childData.name}</Text>
                            <Text style={styles.childInfoClass}>
                                Class {childData.class} - {childData.section} • Roll: {childData.rollNo}
                            </Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Summary Cards */}
                <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                    <View style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
                            <BookOpen size={20} color="#0469ff" />
                            <Text style={styles.statValue}>{summary.totalBorrowed || 0}</Text>
                            <Text style={styles.statLabel}>Borrowed</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: summary.overdueCount > 0 ? '#FEE2E2' : '#D1FAE5' }]}>
                            {summary.overdueCount > 0 ? (
                                <AlertTriangle size={20} color="#EF4444" />
                            ) : (
                                <CheckCircle2 size={20} color="#10B981" />
                            )}
                            <Text style={[styles.statValue, summary.overdueCount > 0 && { color: '#EF4444' }]}>
                                {summary.overdueCount || 0}
                            </Text>
                            <Text style={styles.statLabel}>Overdue</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: summary.totalFinesDue > 0 ? '#FEF3C7' : '#F3F4F6' }]}>
                            <DollarSign size={20} color={summary.totalFinesDue > 0 ? '#F59E0B' : '#666'} />
                            <Text style={[styles.statValue, summary.totalFinesDue > 0 && { color: '#F59E0B' }]}>
                                ₹{summary.totalFinesDue || 0}
                            </Text>
                            <Text style={styles.statLabel}>Fines</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Tabs */}
                <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.tabsScrollContainer}
                    >
                        <View style={styles.tabsContainer}>
                            {TABS.map((tab) => (
                                <HapticTouchable
                                    key={tab.id}
                                    onPress={() => setActiveTab(tab.id)}
                                >
                                    <View style={[
                                        styles.tab,
                                        activeTab === tab.id && styles.tabActive
                                    ]}>
                                        <Text style={[
                                            styles.tabText,
                                            activeTab === tab.id && styles.tabTextActive
                                        ]}>
                                            {tab.label}
                                        </Text>
                                    </View>
                                </HapticTouchable>
                            ))}
                        </View>
                    </ScrollView>
                </Animated.View>

                {/* Search Bar for Catalog */}
                {activeTab === 'catalog' && (
                    <Animated.View entering={FadeInDown.delay(350).duration(400)}>
                        <View style={styles.searchContainer}>
                            <Search size={18} color="#9CA3AF" />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search books by title, author, ISBN..."
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
                    </Animated.View>
                )}

                {/* Tab Content */}
                <View style={styles.section}>
                    {isLoading && activeTab !== 'catalog' ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : activeTab === 'borrowed' ? (
                        borrowedBooks.length > 0 ? (
                            borrowedBooks.map((item, index) => (
                                <Animated.View
                                    key={item.transactionId}
                                    entering={FadeInRight.delay(400 + index * 60).duration(500)}
                                >
                                    <View style={[
                                        styles.bookCard,
                                        item.isOverdue && styles.bookCardOverdue
                                    ]}>
                                        <View style={styles.bookHeader}>
                                            <View style={[
                                                styles.bookIcon,
                                                item.isOverdue && { backgroundColor: '#FEE2E2' }
                                            ]}>
                                                <BookOpen size={18} color={item.isOverdue ? '#EF4444' : '#0469ff'} />
                                            </View>
                                            {item.isOverdue && (
                                                <View style={styles.overdueBadge}>
                                                    <AlertTriangle size={12} color="#EF4444" />
                                                    <Text style={styles.overdueText}>Overdue</Text>
                                                </View>
                                            )}
                                        </View>

                                        <Text style={styles.bookTitle}>{item.book.title}</Text>
                                        <Text style={styles.bookAuthor}>by {item.book.author}</Text>

                                        <View style={styles.bookMeta}>
                                            <View style={styles.metaItem}>
                                                <Calendar size={14} color="#666" />
                                                <Text style={[
                                                    styles.metaText,
                                                    item.isOverdue && { color: '#EF4444', fontWeight: '600' }
                                                ]}>
                                                    {getDaysUntilDue(item.dueDate)}
                                                </Text>
                                            </View>
                                            <Text style={styles.metaDivider}>•</Text>
                                            <Text style={styles.metaText}>
                                                Due: {formatDate(item.dueDate)}
                                            </Text>
                                        </View>

                                        {item.fineAmount > 0 && (
                                            <View style={styles.fineContainer}>
                                                <DollarSign size={14} color="#F59E0B" />
                                                <Text style={styles.fineText}>
                                                    Fine: ₹{item.fineAmount} ({item.daysOverdue} days × ₹{settings.finePerDay}/day)
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <BookOpen size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Books Borrowed</Text>
                                <Text style={styles.emptySubtitle}>
                                    {childData.name} hasn't borrowed any library books
                                </Text>
                            </View>
                        )
                    ) : activeTab === 'catalog' ? (
                        catalogLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#0469ff" />
                            </View>
                        ) : catalogBooks && catalogBooks.length > 0 ? (
                            <View style={styles.catalogGrid}>
                                {catalogBooks.map((book, index) => (
                                    <CatalogBookCard key={book.id} book={book} index={index} />
                                ))}
                            </View>
                        ) : (
                            <View style={styles.emptyState}>
                                <Search size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Books Found</Text>
                                <Text style={styles.emptySubtitle}>
                                    {searchQuery ? 'Try a different search term' : 'No books in the library catalog'}
                                </Text>
                            </View>
                        )
                    ) : activeTab === 'requests' ? (
                        pendingRequests.length > 0 ? (
                            pendingRequests.map((item, index) => (
                                <Animated.View
                                    key={item.id}
                                    entering={FadeInRight.delay(400 + index * 60).duration(500)}
                                >
                                    <View style={styles.requestCard}>
                                        <View style={styles.requestCoverContainer}>
                                            {item.book.coverImage ? (
                                                <Image
                                                    source={{ uri: item.book.coverImage }}
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

                                            <View style={styles.requestMeta}>
                                                <View style={styles.metaItem}>
                                                    <Calendar size={12} color="#666" />
                                                    <Text style={styles.metaText}>
                                                        Requested: {formatDate(item.requestDate)}
                                                    </Text>
                                                </View>
                                                {item.book.category && (
                                                    <>
                                                        <Text style={styles.metaDivider}>•</Text>
                                                        <Text style={styles.metaText}>{item.book.category}</Text>
                                                    </>
                                                )}
                                            </View>

                                            {item.remarks && (
                                                <Text style={styles.remarksText} numberOfLines={1}>
                                                    Note: {item.remarks}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <Clock size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Pending Requests</Text>
                                <Text style={styles.emptySubtitle}>
                                    No book requests are pending
                                </Text>
                            </View>
                        )
                    ) : (
                        returnHistory.length > 0 ? (
                            returnHistory.map((item, index) => (
                                <Animated.View
                                    key={item.transactionId}
                                    entering={FadeInRight.delay(400 + index * 60).duration(500)}
                                >
                                    <View style={styles.historyCard}>
                                        <View style={[styles.bookIcon, { backgroundColor: '#D1FAE5' }]}>
                                            <CheckCircle2 size={18} color="#10B981" />
                                        </View>
                                        <View style={styles.historyContent}>
                                            <Text style={styles.bookTitle}>{item.book.title}</Text>
                                            <Text style={styles.historyDate}>
                                                Returned: {formatDate(item.returnDate)}
                                            </Text>
                                        </View>
                                    </View>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <CheckCircle2 size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Return History</Text>
                                <Text style={styles.emptySubtitle}>
                                    Previous returns will appear here
                                </Text>
                            </View>
                        )
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Book Detail Modal */}
            <BookDetailModal />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    childInfoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 16,
        gap: 12,
    },
    childInfoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    childInfoContent: {
        flex: 1,
    },
    childInfoName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    childInfoClass: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        padding: 14,
        borderRadius: 12,
        alignItems: 'center',
        gap: 4,
    },
    statValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111',
    },
    statLabel: {
        fontSize: 11,
        color: '#666',
    },
    tabsScrollContainer: {
        marginBottom: 16,
    },
    tabsContainer: {
        flexDirection: 'row',
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        padding: 4,
        gap: 4,
    },
    tab: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        alignItems: 'center',
        borderRadius: 8,
    },
    tabActive: {
        backgroundColor: '#fff',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    tabTextActive: {
        color: '#0469ff',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 16,
        gap: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#111',
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    section: {
        marginBottom: 20,
    },
    // Catalog Styles
    catalogGrid: {
        gap: 12,
    },
    catalogCard: {
        flexDirection: 'row',
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 12,
        gap: 12,
    },
    catalogCover: {
        width: 70,
        height: 100,
        borderRadius: 8,
    },
    noCover: {
        backgroundColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    catalogContent: {
        flex: 1,
        justifyContent: 'center',
    },
    catalogTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111',
        marginBottom: 4,
    },
    catalogAuthor: {
        fontSize: 13,
        color: '#666',
        marginBottom: 8,
    },
    catalogMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    categoryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
    },
    categoryText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#6366F1',
    },
    // Request Card Styles
    requestCoverContainer: {
        marginRight: 12,
    },
    requestCover: {
        width: 50,
        height: 75,
        borderRadius: 8,
    },
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    requestMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 6,
    },
    remarksText: {
        fontSize: 12,
        color: '#666',
        fontStyle: 'italic',
        marginTop: 4,
    },

    availabilityBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    availabilityText: {
        fontSize: 11,
        fontWeight: '600',
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '85%',
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 12,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    modalCloseBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalCoverContainer: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    modalCover: {
        width: 140,
        height: 200,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
    },
    noCoverLarge: {
        backgroundColor: '#E5E7EB',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBookTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111',
        textAlign: 'center',
        paddingHorizontal: 20,
        marginBottom: 6,
    },
    modalBookAuthor: {
        fontSize: 15,
        color: '#666',
        textAlign: 'center',
        marginBottom: 16,
    },
    modalAvailability: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        gap: 8,
        marginBottom: 20,
    },
    modalAvailabilityText: {
        fontSize: 14,
        fontWeight: '600',
    },
    detailsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 16,
        gap: 12,
        marginBottom: 20,
    },
    detailItem: {
        width: (SCREEN_WIDTH - 52) / 2,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 14,
        gap: 6,
    },
    detailLabel: {
        fontSize: 12,
        color: '#666',
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    descriptionContainer: {
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    descriptionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
        marginBottom: 8,
    },
    descriptionText: {
        fontSize: 14,
        lineHeight: 22,
        color: '#444',
    },
    // Existing Styles
    bookCard: {
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#0469ff',
    },
    bookCardOverdue: {
        borderLeftColor: '#EF4444',
        backgroundColor: '#FEF2F2',
    },
    bookHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    bookIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    overdueBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: '#FEE2E2',
        borderRadius: 12,
        gap: 4,
    },
    overdueText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#EF4444',
    },
    bookTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 4,
    },
    bookAuthor: {
        fontSize: 13,
        color: '#666',
        marginBottom: 10,
    },
    bookMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    metaText: {
        fontSize: 13,
        color: '#666',
    },
    metaDivider: {
        fontSize: 13,
        color: '#ccc',
    },
    fineContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    fineText: {
        fontSize: 13,
        color: '#F59E0B',
        fontWeight: '600',
    },
    requestCard: {
        flexDirection: 'row',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
        gap: 12,
    },
    requestContent: {
        flex: 1,
    },
    statusBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        marginTop: 8,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    historyCard: {
        flexDirection: 'row',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
        gap: 12,
    },
    historyContent: {
        flex: 1,
    },
    historyDate: {
        fontSize: 13,
        color: '#666',
        marginTop: 4,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        paddingHorizontal: 32,
    },
});
