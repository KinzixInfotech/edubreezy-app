import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, FlatList, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BookOpen, ChevronLeft, Book, AlertTriangle, Clock, CheckCircle, Search } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function LibraryScreen() {
    const { schoolId } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState('catalog'); // catalog, transactions
    const [searchQuery, setSearchQuery] = useState('');

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['director-library', schoolId, searchQuery],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/library`, {
                params: { search: searchQuery }
            });
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    const summary = data?.summary || {};
    const books = data?.books || [];
    const recentTransactions = data?.recentTransactions || [];

    const renderBook = ({ item }) => (
        <View style={styles.bookCard}>
            <View style={styles.bookIcon}>
                <Book size={24} color="#3B82F6" />
            </View>
            <View style={styles.bookInfo}>
                <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.bookAuthor}>{item.author}</Text>
                <View style={styles.bookMeta}>
                    <View style={styles.metaBadge}>
                        <Text style={styles.metaText}>{item.category}</Text>
                    </View>
                    {item.isbn && (
                        <Text style={styles.bookIsbn}>ISBN: {item.isbn}</Text>
                    )}
                </View>
            </View>
            <View style={styles.copyCount}>
                <Text style={styles.copyNumber}>{item.copies}</Text>
                <Text style={styles.copyLabel}>copies</Text>
            </View>
        </View>
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
            />
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
});
