import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, FlatList, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { BookOpen, ChevronLeft, Book, AlertTriangle, Clock, CheckCircle, Search, X, Barcode, Copy } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

export default function LibraryScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('catalog'); // catalog, transactions
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBook, setSelectedBook] = useState(null);
    const [showBookModal, setShowBookModal] = useState(false);
    const [filter, setFilter] = useState('all'); // all, available, unavailable
    const [sortBy, setSortBy] = useState('title'); // title, newest, oldest

    const FILTERS = [
        { key: 'all', label: 'All' },
        { key: 'available', label: 'Available' },
        { key: 'unavailable', label: 'Unavailable' },
    ];

    const SORT_OPTIONS = [
        { key: 'title', label: 'A-Z' },
        { key: 'newest', label: 'Newest' },
        { key: 'oldest', label: 'Oldest' },
    ];

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

    // Fetch library summary
    const { data: summaryData, refetch: refetchSummary } = useQuery({
        queryKey: ['director-library-summary', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/library`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    // Fetch catalog using useQuery with simple pagination
    const [page, setPage] = useState(0);
    const ITEMS_PER_PAGE = 30;

    const { data: catalogBooks = [], isLoading: catalogLoading, refetch: refetchCatalog } = useQuery({
        queryKey: ['library-catalog', schoolId, searchQuery],
        queryFn: async () => {
            if (!schoolId) return [];
            const res = await api.get(
                `/schools/${schoolId}/library/books?search=${searchQuery}&limit=100`
            );
            return res.data || [];
        },
        enabled: !!schoolId && activeTab === 'catalog',
        staleTime: 1000 * 60 * 5,
    });

    // For compatibility - these won't be used but prevent errors
    const hasNextPage = false;
    const isFetchingNextPage = false;
    const fetchNextPage = () => { };

    // Fetch transactions
    const { data: transactionsData, isLoading: transactionsLoading } = useQuery({
        queryKey: ['director-library-transactions', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/library/transactions?limit=50`);
            return res.data?.transactions || [];
        },
        enabled: !!schoolId && activeTab === 'transactions',
        staleTime: 60 * 1000,
    });

    const isLoading = activeTab === 'catalog' ? catalogLoading : transactionsLoading;

    // Derived data
    const summary = summaryData?.summary || {};
    const rawBooks = catalogBooks || [];
    const recentTransactions = transactionsData || [];

    // Apply filters and sorting to books
    const books = rawBooks
        .filter(book => {
            if (filter === 'available') return book.availableCopies > 0;
            if (filter === 'unavailable') return book.availableCopies === 0;
            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
            if (sortBy === 'newest') return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            if (sortBy === 'oldest') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
            return 0;
        });

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            refetchSummary(),
        ]);
        setRefreshing(false);
    };

    const openBookDetails = (book) => {
        setSelectedBook(book);
        setShowBookModal(true);
    };

    const renderBook = ({ item }) => (
        <HapticTouchable onPress={() => openBookDetails(item)}>
            <View style={styles.bookCard}>
                {item.coverImage ? (
                    <Image source={{ uri: item.coverImage }} style={styles.bookCover} contentFit="cover" />
                ) : (
                    <View style={[styles.bookCover, styles.noCover]}>
                        <Book size={24} color="#9CA3AF" />
                    </View>
                )}
                <View style={styles.bookInfo}>
                    <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.bookAuthor}>{item.author}</Text>
                    <View style={styles.bookMeta}>
                        <View style={styles.metaBadge}>
                            <Text style={styles.metaText}>{item.category || 'General'}</Text>
                        </View>
                        <View style={[styles.availabilityBadge, { backgroundColor: item.availableCopies > 0 ? '#D1FAE5' : '#FEE2E2' }]}>
                            <Text style={[styles.availabilityText, { color: item.availableCopies > 0 ? '#10B981' : '#EF4444' }]}>
                                {item.availableCopies > 0 ? `${item.availableCopies} available` : 'Not available'}
                            </Text>
                        </View>
                    </View>
                </View>
                <View style={styles.copyCount}>
                    <Text style={styles.copyNumber}>{item.totalCopies || item.copies || 0}</Text>
                    <Text style={styles.copyLabel}>copies</Text>
                </View>
            </View>
        </HapticTouchable>
    );

    const renderTransaction = ({ item }) => (
        <View style={styles.txnCard}>
            <View style={[styles.txnIcon, { backgroundColor: item.status === 'BORROWED' ? '#FEF3C7' : '#DCFCE7' }]}>
                <BookOpen size={20} color={item.status === 'BORROWED' ? '#D97706' : '#16A34A'} />
            </View>
            <View style={styles.txnInfo}>
                <Text style={styles.txnBook}>{item.bookTitle}</Text>
                <Text style={styles.txnAuthor}>{item.author}</Text>
                <Text style={styles.txnDate}>
                    {item.issueDate ? new Date(item.issueDate).toLocaleDateString() : 'N/A'}
                    {item.isOverdue && ' • Overdue'}
                </Text>
            </View>
            <View style={[styles.txnBadge, { backgroundColor: item.status === 'BORROWED' ? '#FEF3C7' : '#DCFCE7' }]}>
                <Text style={[styles.txnType, { color: item.status === 'BORROWED' ? '#D97706' : '#16A34A' }]}>
                    {item.status}
                </Text>
            </View>
        </View>
    );

    const ListHeader = () => (
        <>
            {/* Summary Cards */}
            <View style={styles.statsGrid}>
                <View style={[styles.statCard, { backgroundColor: '#EFF6FF' }]}>
                    <Book size={24} color="#3B82F6" />
                    <Text style={styles.statValue}>{summary.totalBooks || 0}</Text>
                    <Text style={styles.statLabel}>Total Books</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#DCFCE7' }]}>
                    <CheckCircle size={24} color="#16A34A" />
                    <Text style={styles.statValue}>{summary.availableBooks || 0}</Text>
                    <Text style={styles.statLabel}>Available</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
                    <Clock size={24} color="#D97706" />
                    <Text style={styles.statValue}>{summary.issuedBooks || 0}</Text>
                    <Text style={styles.statLabel}>Issued</Text>
                </View>
                <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
                    <AlertTriangle size={24} color="#DC2626" />
                    <Text style={styles.statValue}>{summary.overdueBooks || 0}</Text>
                    <Text style={styles.statLabel}>Overdue</Text>
                </View>
            </View>

            {/* Pending Requests Alert */}
            {summary.pendingRequests > 0 && (
                <View style={styles.alertCard}>
                    <AlertTriangle size={20} color="#D97706" />
                    <Text style={styles.alertText}>
                        {summary.pendingRequests} pending book requests need approval
                    </Text>
                </View>
            )}

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Search size={20} color="#9CA3AF" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search books..."
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {/* Filters (for catalog tab only) */}
            {activeTab === 'catalog' && (
                <View style={styles.filtersRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        <View style={styles.filterChips}>
                            {FILTERS.map(f => (
                                <HapticTouchable key={f.key} onPress={() => setFilter(f.key)}>
                                    <View style={[styles.filterChip, filter === f.key && styles.filterChipActive]}>
                                        <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                                            {f.label}
                                        </Text>
                                    </View>
                                </HapticTouchable>
                            ))}
                            <View style={styles.filterDivider} />
                            {SORT_OPTIONS.map(s => (
                                <HapticTouchable key={s.key} onPress={() => setSortBy(s.key)}>
                                    <View style={[styles.sortChip, sortBy === s.key && styles.sortChipActive]}>
                                        <Text style={[styles.sortChipText, sortBy === s.key && styles.sortChipTextActive]}>
                                            {s.label}
                                        </Text>
                                    </View>
                                </HapticTouchable>
                            ))}
                        </View>
                    </ScrollView>
                </View>
            )}

            {/* Tabs */}
            <View style={styles.tabContainer}>
                <HapticTouchable style={{ flex: 1 }} onPress={() => setActiveTab('catalog')}>
                    <View style={[styles.tab, activeTab === 'catalog' && styles.tabActive]}>
                        <Book size={18} color={activeTab === 'catalog' ? '#3B82F6' : '#6B7280'} />
                        <Text style={[styles.tabText, activeTab === 'catalog' && styles.tabTextActive]}>
                            Catalog ({books.length})
                        </Text>
                    </View>
                </HapticTouchable>
                <HapticTouchable style={{ flex: 1 }} onPress={() => setActiveTab('transactions')}>
                    <View style={[styles.tab, activeTab === 'transactions' && styles.tabActive]}>
                        <BookOpen size={18} color={activeTab === 'transactions' ? '#3B82F6' : '#6B7280'} />
                        <Text style={[styles.tabText, activeTab === 'transactions' && styles.tabTextActive]}>
                            Transactions ({recentTransactions.length})
                        </Text>
                    </View>
                </HapticTouchable>
            </View>
        </>
    );

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#0EA5E9" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style='dark' />
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Library</Text>
                <View style={{ width: 24 }} />
            </View>

            <FlatList
                data={activeTab === 'catalog' ? books : recentTransactions}
                renderItem={activeTab === 'catalog' ? renderBook : renderTransaction}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={ListHeader}
                contentContainerStyle={styles.listContainer}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Book size={48} color="#D1D5DB" />
                        <Text style={styles.emptyText}>
                            {activeTab === 'catalog' ? 'No books found' : 'No transactions'}
                        </Text>
                    </View>
                }
                // Infinite scroll for catalog
                onEndReached={() => {
                    if (activeTab === 'catalog' && hasNextPage && !isFetchingNextPage) {
                        fetchNextPage();
                    }
                }}
                onEndReachedThreshold={0.5}
                ListFooterComponent={
                    isFetchingNextPage ? (
                        <View style={styles.loadMoreContainer}>
                            <ActivityIndicator size="small" color="#3B82F6" />
                            <Text style={styles.loadMoreText}>Loading more...</Text>
                        </View>
                    ) : null
                }
                // Performance optimizations
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={10}
                removeClippedSubviews={true}
                updateCellsBatchingPeriod={50}
            />

            {/* Book Detail Modal */}
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
                                                <Book size={48} color="#9CA3AF" />
                                            </View>
                                        )}
                                    </View>

                                    <Text style={styles.modalBookTitle}>{selectedBook.title}</Text>
                                    <Text style={styles.modalBookAuthor}>by {selectedBook.author}</Text>

                                    {selectedBook.isbn && (
                                        <Text style={styles.modalIsbn}>ISBN: {selectedBook.isbn}</Text>
                                    )}

                                    <View style={[styles.modalAvailability, { backgroundColor: selectedBook.availableCopies > 0 ? '#D1FAE5' : '#FEE2E2' }]}>
                                        {selectedBook.availableCopies > 0 ? (
                                            <CheckCircle size={18} color="#10B981" />
                                        ) : (
                                            <AlertTriangle size={18} color="#EF4444" />
                                        )}
                                        <Text style={[styles.modalAvailabilityText, { color: selectedBook.availableCopies > 0 ? '#10B981' : '#EF4444' }]}>
                                            {selectedBook.availableCopies > 0
                                                ? `${selectedBook.availableCopies} of ${selectedBook.totalCopies} copies available`
                                                : 'All copies currently issued'}
                                        </Text>
                                    </View>

                                    {selectedBook.description && (
                                        <View style={styles.descriptionContainer}>
                                            <Text style={styles.descriptionLabel}>About this book</Text>
                                            <Text style={styles.descriptionText}>{selectedBook.description}</Text>
                                        </View>
                                    )}

                                    {/* Copies List - Using FlatList for optimization */}
                                    {selectedBook.copies && selectedBook.copies.length > 0 && (
                                        <View style={styles.copiesSection}>
                                            <Text style={styles.copiesSectionTitle}>Copies ({selectedBook.copies.length})</Text>
                                            <FlatList
                                                data={selectedBook.copies}
                                                keyExtractor={(copy, idx) => copy.id || String(idx)}
                                                renderItem={({ item: copy }) => (
                                                    <View style={styles.copyCard}>
                                                        <View style={styles.copyInfo}>
                                                            <View style={styles.copyRow}>
                                                                <Barcode size={14} color="#6B7280" />
                                                                <Text style={styles.copyBarcode}>{copy.barcode || 'No barcode'}</Text>
                                                            </View>
                                                            <Text style={styles.copyLocation}>{copy.location || 'No location'}</Text>
                                                        </View>
                                                        <View style={[styles.copyStatusBadge, { backgroundColor: copy.status === 'AVAILABLE' ? '#D1FAE5' : '#FEF3C7' }]}>
                                                            <Text style={[styles.copyStatusText, { color: copy.status === 'AVAILABLE' ? '#10B981' : '#D97706' }]}>
                                                                {copy.status}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                )}
                                                scrollEnabled={false}
                                                initialNumToRender={10}
                                                maxToRenderPerBatch={10}
                                                windowSize={5}
                                                removeClippedSubviews={true}
                                                getItemLayout={(data, index) => ({
                                                    length: 60,
                                                    offset: 60 * index,
                                                    index,
                                                })}
                                            />
                                        </View>
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
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, gap: 12 },
    statCard: { width: '47%', padding: 16, borderRadius: 16, alignItems: 'center' },
    statValue: { fontSize: 24, fontWeight: '700', color: '#1F2937', marginTop: 8 },
    statLabel: { fontSize: 13, color: '#6B7280', marginTop: 4 },
    alertCard: { marginHorizontal: 16, marginBottom: 16, padding: 16, backgroundColor: '#FFFBEB', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#FDE68A' },
    alertText: { flex: 1, fontSize: 14, color: '#92400E' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 16, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    searchInput: { flex: 1, marginLeft: 12, fontSize: 16, color: '#1F2937' },
    tabContainer: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 16, backgroundColor: '#F3F4F6', borderRadius: 12, padding: 4 },
    tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 6 },
    tabActive: { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
    tabText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    tabTextActive: { color: '#3B82F6', fontWeight: '600' },
    listContainer: { paddingBottom: 24 },
    bookCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    bookIcon: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
    bookInfo: { flex: 1, marginLeft: 12 },
    bookTitle: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    bookAuthor: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    bookMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
    metaBadge: { backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    metaText: { fontSize: 11, color: '#6B7280' },
    availabilityBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
    availabilityText: { fontSize: 11, fontWeight: '600' },
    bookIsbn: { fontSize: 11, color: '#9CA3AF' },
    copyCount: { alignItems: 'center', paddingLeft: 12 },
    copyNumber: { fontSize: 18, fontWeight: '700', color: '#3B82F6' },
    copyLabel: { fontSize: 11, color: '#9CA3AF' },
    txnCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    txnIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    txnInfo: { flex: 1, marginLeft: 12 },
    txnBook: { fontSize: 15, fontWeight: '600', color: '#1F2937' },
    txnAuthor: { fontSize: 13, color: '#6B7280', marginTop: 2 },
    txnDate: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
    txnBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
    txnType: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
    emptyState: { padding: 48, alignItems: 'center' },
    emptyText: { fontSize: 14, color: '#9CA3AF', marginTop: 12 },
    // Book cover styles
    bookCover: { width: 60, height: 80, borderRadius: 8, backgroundColor: '#E5E7EB' },
    noCover: { alignItems: 'center', justifyContent: 'center' },
    // Filter styles
    filtersRow: { marginHorizontal: 16, marginBottom: 12 },
    filterChips: { flexDirection: 'row', gap: 8, paddingRight: 16 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
    filterChipActive: { backgroundColor: '#3B82F6' },
    filterChipText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    filterChipTextActive: { color: '#FFFFFF' },
    filterDivider: { width: 1, height: 24, backgroundColor: '#E5E7EB', marginHorizontal: 4 },
    sortChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
    sortChipActive: { backgroundColor: '#6366F1' },
    sortChipText: { fontSize: 13, color: '#6B7280', fontWeight: '500' },
    sortChipTextActive: { color: '#FFFFFF' },
    // Modal styles
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
    modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
    modalCoverContainer: { alignItems: 'center', marginBottom: 20 },
    modalCover: { width: 140, height: 200, borderRadius: 12 },
    noCoverLarge: { backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' },
    modalBookTitle: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 8 },
    modalBookAuthor: { fontSize: 16, color: '#666', textAlign: 'center', marginBottom: 8 },
    modalIsbn: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginBottom: 16 },
    modalAvailability: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 12, marginBottom: 20 },
    modalAvailabilityText: { fontSize: 14, fontWeight: '600' },
    descriptionContainer: { marginTop: 16 },
    descriptionLabel: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 8 },
    descriptionText: { fontSize: 14, color: '#666', lineHeight: 20 },
    // Copies section styles
    copiesSection: { marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
    copiesSectionTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 12 },
    copyCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 10, marginBottom: 8 },
    copyInfo: { flex: 1 },
    copyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    copyBarcode: { fontSize: 14, fontWeight: '600', color: '#374151', fontFamily: 'monospace' },
    copyLocation: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
    copyStatusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    copyStatusText: { fontSize: 11, fontWeight: '600' },
    // Load more styles
    loadMoreContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
    loadMoreText: { fontSize: 14, color: '#6B7280' },
});
