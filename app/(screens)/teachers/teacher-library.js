
// app/(screens)/teachers/teacher-library.js
// Teacher library - browse catalog, borrow books, monitor class borrowings
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
    Platform,
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
    DollarSign,
    Search,
    X,
    Tag,
    BookMarked,
    Info,
    Users,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TABS = [
    { id: 'my-books', label: 'My Books' },
    { id: 'catalog', label: 'Catalog' },
    { id: 'requests', label: 'Requests' },
    { id: 'class-monitor', label: 'Class Monitor' },
    { id: 'history', label: 'History' },
];

export default function TeacherLibraryScreen() {
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
    const teacherId = userData?.id;

    // Debug logging
    console.log('👤 Teacher Library - SchoolId:', schoolId, 'TeacherId:', teacherId, 'ActiveTab:', activeTab);

    // Fetch teacher's borrowed books
    const { data: myBooksData, isLoading: myBooksLoading } = useQuery({
        queryKey: ['teacher-library-borrowed', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return null;
            const res = await api.get(
                `/schools/${schoolId}/library/transactions?userId=${teacherId}&status=ISSUED`
            );
            const data = res.data;
            const transactions = data.transactions || [];
            // Map transactions to flatten book details if needed by UI
            return transactions.map(t => ({
                ...t,
                book: t.book || t.copy?.book // Handle both direct book relation or nested via copy
            }));
        },
        enabled: !!schoolId && !!teacherId && activeTab === 'my-books',
        staleTime: 1000 * 60 * 2,
    });

    // Fetch teacher's fines
    const { data: finesData } = useQuery({
        queryKey: ['teacher-library-fines', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return null;
            const res = await api.get(
                `/schools/${schoolId}/library/fines?userId=${teacherId}`
            );
            return res.data;
        },
        enabled: !!schoolId && !!teacherId && activeTab === 'my-books',
        staleTime: 1000 * 60 * 2,
    });

    // Fetch catalog
    const { data: catalogBooks, isLoading: catalogLoading, isError, error } = useQuery({
        queryKey: ['library-catalog', schoolId, searchQuery],
        queryFn: async () => {
            if (!schoolId) return [];
            console.log('📚 Fetching catalog for schoolId:', schoolId, 'search:', searchQuery);
            const res = await api.get(
                `/schools/${schoolId}/library/books?search=${searchQuery}&limit=50`
            );
            console.log('📚 Catalog response:', res.data?.length || 0, 'books');
            return res.data || [];
        },
        enabled: !!schoolId && activeTab === 'catalog',
        staleTime: 1000 * 60 * 5,
    });

    console.log('📚 Catalog Query State - Enabled:', (!!schoolId && activeTab === 'catalog'), 'Loading:', catalogLoading, 'Data:', catalogBooks?.length, 'Error:', error);

    // Fetch teacher's requests
    const { data: requestsData, isLoading: requestsLoading } = useQuery({
        queryKey: ['teacher-library-requests', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return [];
            const res = await api.get(
                `/schools/${schoolId}/library/requests?userId=${teacherId}`
            );
            return res.data || [];
        },
        enabled: !!schoolId && !!teacherId && activeTab === 'requests',
        staleTime: 1000 * 60 * 2,
    });

    // Fetch class borrowings (students from teacher's classes)
    const { data: classBorrowingsData, isLoading: classBorrowingsLoading } = useQuery({
        queryKey: ['teacher-class-borrowings', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return [];
            // This endpoint needs to be created on backend
            const res = await api.get(
                `/schools/${schoolId}/teachers/${teacherId}/library/class-borrowings`
            );
            return res.data || [];
        },
        enabled: !!schoolId && !!teacherId && activeTab === 'class-monitor',
        staleTime: 1000 * 60 * 5,
    });

    // Fetch history
    const { data: historyData, isLoading: historyLoading } = useQuery({
        queryKey: ['teacher-library-history', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return [];
            const res = await api.get(
                `/schools/${schoolId}/library/transactions?userId=${teacherId}&status=RETURNED`
            );
            return res.data || [];
        },
        enabled: !!schoolId && !!teacherId && activeTab === 'history',
        staleTime: 1000 * 60 * 5,
    });

    const borrowedBooks = myBooksData || [];
    const fines = Array.isArray(finesData) ? finesData : [];
    const totalFines = fines.reduce((sum, fine) => sum + (fine.amount || 0), 0);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['teacher-library']);
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
        if (!schoolId || !teacherId) {
            Alert.alert('Error', 'Unable to request book. User information missing.');
            return;
        }

        setIsRequesting(true);
        try {
            await api.post(`/schools/${schoolId}/library/requests`, {
                userId: teacherId,
                bookId: bookId,
                userType: 'TEACHER',
            });

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Success', 'Book request submitted successfully!');

            // Refresh requests data
            await queryClient.invalidateQueries(['teacher-library-requests']);
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
                                <Text style={styles.modalBookAuthor}>by {selectedBook.author}</Text>

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

                                {selectedBook.description && (
                                    <View style={styles.descriptionContainer}>
                                        <Text style={styles.descriptionLabel}>About this book</Text>
                                        <Text style={styles.descriptionText}>{selectedBook.description}</Text>
                                    </View>
                                )}

                                {/* Request Book Button */}
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
                                                <>
                                                    <ActivityIndicator size="small" color="#fff" />
                                                    <Text style={styles.requestButtonText}>Requesting...</Text>
                                                </>
                                            ) : (
                                                <Text style={styles.requestButtonText}>
                                                    {selectedBook.availableCopies > 0 ? 'Request This Book' : 'Not Available'}
                                                </Text>
                                            )}
                                        </View>
                                    </HapticTouchable>
                                </View>
                            </>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );

    return (
        <View style={styles.container}>
            <StatusBar style='dark' />
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Library</Text>
                    <Text style={styles.headerSubtitle}>Browse & Manage Books</Text>
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
                {/* Summary Cards (for My Books tab) */}
                {activeTab === 'my-books' && (
                    <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                        <View style={styles.statsRow}>
                            <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
                                <BookOpen size={20} color="#0469ff" />
                                <Text style={styles.statValue}>{borrowedBooks.length}</Text>
                                <Text style={styles.statLabel}>Borrowed</Text>
                            </View>
                            <View style={[styles.statCard, { backgroundColor: totalFines > 0 ? '#FEF3C7' : '#F3F4F6' }]}>
                                <DollarSign size={20} color={totalFines > 0 ? '#F59E0B' : '#666'} />
                                <Text style={[styles.statValue, totalFines > 0 && { color: '#F59E0B' }]}>
                                    ₹{totalFines}
                                </Text>
                                <Text style={styles.statLabel}>Fines</Text>
                            </View>
                        </View>
                    </Animated.View>
                )}

                {/* Tabs */}
                <Animated.View entering={FadeInDown.delay(200).duration(500)}>
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
                    <Animated.View entering={FadeInDown.delay(250).duration(400)}>
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
                    {activeTab === 'my-books' ? (
                        myBooksLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#0469ff" />
                            </View>
                        ) : borrowedBooks.length > 0 ? (
                            borrowedBooks.map((item, index) => (
                                <Animated.View
                                    key={item.id}
                                    entering={FadeInRight.delay(300 + index * 60).duration(500)}
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

                                        <Text style={styles.bookTitle}>{item.book?.title}</Text>
                                        <Text style={styles.bookAuthor}>by {item.book?.author}</Text>

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
                                    </View>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <BookOpen size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Books Borrowed</Text>
                                <Text style={styles.emptySubtitle}>
                                    You haven't borrowed any library books
                                </Text>
                            </View>
                        )
                    ) : activeTab === 'catalog' ? (
                        catalogLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#0469ff" />
                            </View>
                        ) : catalogBooks && catalogBooks.length > 0 ? (
                            catalogBooks.map((book, index) => (
                                <CatalogBookCard key={book.id} book={book} index={index} />
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <Search size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Books Found</Text>
                                <Text style={styles.emptySubtitle}>
                                    {searchQuery ? 'Try a different search term' : 'No books in the catalog'}
                                </Text>
                            </View>
                        )
                    ) : activeTab === 'requests' ? (
                        requestsLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#0469ff" />
                            </View>
                        ) : requestsData && requestsData.length > 0 ? (
                            requestsData.map((request, index) => (
                                <Animated.View
                                    key={request.id}
                                    entering={FadeInRight.delay(300 + index * 60).duration(500)}
                                >
                                    <View style={styles.requestCard}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.bookTitle}>{request.book?.title}</Text>

                                            {/* Pickup Details for Approved Requests */}
                                            {request.status === 'APPROVED' && request.pickupCode && (
                                                <View style={styles.pickupContainer}>
                                                    <View style={styles.pickupCodeBox}>
                                                        {/* <Text style={styles.pickupLabel}>Scan Pickup Code</Text> */}
                                                        {/* <Text style={styles.pickupCode}>{request.pickupCode}</Text> */}

                                                        <View style={[
                                                            styles.requestBadge,
                                                            {
                                                                backgroundColor: request.status === 'APPROVED' ? '#D1FAE5'
                                                                    : request.status === 'COLLECTED' ? '#DBEAFE'
                                                                        : request.status === 'REJECTED' ? '#FEE2E2'
                                                                            : request.status === 'EXPIRED' ? '#F3F4F6'
                                                                                : '#FEF3C7'
                                                            }
                                                        ]}>
                                                            <Text style={[
                                                                styles.requestStatus,
                                                                {
                                                                    color: request.status === 'APPROVED' ? '#10B981'
                                                                        : request.status === 'COLLECTED' ? '#2563EB'
                                                                            : request.status === 'REJECTED' ? '#EF4444'
                                                                                : request.status === 'EXPIRED' ? '#6B7280'
                                                                                    : '#D97706'
                                                                }
                                                            ]}>
                                                                {request.status}
                                                            </Text>
                                                        </View>
                                                    </View>

                                                    {/* Pickup Code Display */}
                                                    <View style={styles.barcodeContainer}>
                                                        <Text style={{
                                                            fontSize: 28,
                                                            fontWeight: 'bold',
                                                            letterSpacing: 4,
                                                            color: '#000',
                                                            fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'
                                                        }}>
                                                            {request.pickupCode}
                                                        </Text>
                                                        <Text style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                                                            SHOW THIS CODE AT LIBRARY
                                                        </Text>
                                                    </View>

                                                    <View style={styles.pickupDateContainer}>
                                                        <Calendar size={14} color="#10B981" />
                                                        <Text style={styles.pickupDateText}>
                                                            Pickup by: {formatDate(request.pickupDate)}
                                                        </Text>
                                                    </View>

                                                    {/* Book Copy Barcode */}
                                                    {request.copy?.barcode && (
                                                        <View style={styles.bookBarcodeContainer}>
                                                            <Text style={styles.bookBarcodeLabel}>Book Barcode</Text>
                                                            <Text style={styles.bookBarcodeText}>{request.copy.barcode}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            )}
                                        </View>

                                    </View>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <Clock size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Requests</Text>
                                <Text style={styles.emptySubtitle}>
                                    You don't have any pending book requests
                                </Text>
                            </View>
                        )
                    ) : activeTab === 'class-monitor' ? (
                        classBorrowingsLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#0469ff" />
                            </View>
                        ) : classBorrowingsData && classBorrowingsData.length > 0 ? (
                            classBorrowingsData.map((item, index) => (
                                <Animated.View
                                    key={item.id}
                                    entering={FadeInRight.delay(300 + index * 60).duration(500)}
                                >
                                    <View style={styles.classCard}>
                                        <View style={styles.studentInfo}>
                                            <User size={16} color="#666" />
                                            <Text style={styles.studentName}>{item.student?.name}</Text>
                                            <Text style={styles.studentClass}>
                                                ({item.student?.class?.className} - {item.student?.section?.name})
                                            </Text>
                                        </View>
                                        <Text style={styles.bookTitle}>{item.book?.title}</Text>
                                        <Text style={styles.metaText}>Due: {formatDate(item.dueDate)}</Text>
                                    </View>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <Users size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Student Borrowings</Text>
                                <Text style={styles.emptySubtitle}>
                                    No students from your classes have borrowed books
                                </Text>
                            </View>
                        )
                    ) : activeTab === 'history' ? (
                        historyLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#0469ff" />
                            </View>
                        ) : historyData && historyData.length > 0 ? (
                            historyData.map((item, index) => (
                                <Animated.View
                                    key={item.id}
                                    entering={FadeInRight.delay(300 + index * 60).duration(500)}
                                >
                                    <View style={styles.historyCard}>
                                        <Text style={styles.bookTitle}>{item.book?.title}</Text>
                                        <Text style={styles.metaText}>
                                            Returned: {formatDate(item.returnedAt)}
                                        </Text>
                                    </View>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={styles.emptyState}>
                                <Clock size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No History</Text>
                                <Text style={styles.emptySubtitle}>
                                    You haven't returned any books yet
                                </Text>
                            </View>
                        )
                    ) : null}
                </View>

                <View style={{ height: 30 }} />
            </ScrollView>

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
        fontSize: 20,
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
    },
    section: {
        padding: 16,
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        padding: 16,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111',
        marginTop: 8,
    },
    statLabel: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    tabsScrollContainer: {
        marginTop: 16,
    },
    tabsContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 8,
    },
    tab: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
    },
    tabActive: {
        backgroundColor: '#0469ff',
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
    },
    tabTextActive: {
        color: '#fff',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        paddingHorizontal: 16,
        marginHorizontal: 16,
        marginTop: 16,
        height: 48,
        gap: 8,
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
    bookCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    bookCardOverdue: {
        borderColor: '#FEE2E2',
        backgroundColor: '#FEF2F2',
    },
    bookHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
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
        gap: 4,
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    overdueText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#EF4444',
    },
    bookTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
        marginBottom: 4,
    },
    bookAuthor: {
        fontSize: 14,
        color: '#666',
        marginBottom: 12,
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
        color: '#D1D5DB',
        fontSize: 13,
    },
    catalogCard: {
        flexDirection: 'row',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        gap: 12,
    },
    catalogCover: {
        width: 60,
        height: 90,
        borderRadius: 8,
        backgroundColor: '#E5E7EB',
    },
    noCover: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    catalogContent: {
        flex: 1,
        justifyContent: 'center',
    },
    catalogTitle: {
        fontSize: 15,
        fontWeight: '600',
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
        gap: 8,
    },
    categoryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    categoryText: {
        fontSize: 11,
        color: '#6366F1',
        fontWeight: '600',
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
    requestCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    requestBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    requestStatus: {
        fontSize: 12,
        fontWeight: '600',
    },
    classCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    studentInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 8,
    },
    studentName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    studentClass: {
        fontSize: 12,
        color: '#666',
    },
    historyCard: {
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#999',
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#ccc',
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 40,
        maxHeight: '90%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111',
    },
    modalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalCoverContainer: {
        alignItems: 'center',
        marginBottom: 20,
    },
    modalCover: {
        width: 140,
        height: 200,
        borderRadius: 12,
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
        marginBottom: 8,
    },
    modalBookAuthor: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 20,
    },
    modalAvailability: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 12,
        borderRadius: 12,
        marginBottom: 20,
    },
    modalAvailabilityText: {
        fontSize: 14,
        fontWeight: '600',
    },
    descriptionContainer: {
        marginTop: 20,
    },
    descriptionLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
        marginBottom: 8,
    },
    descriptionText: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    requestButton: {
        backgroundColor: '#0469ff',
        paddingVertical: 14,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    requestButtonDisabled: {
        backgroundColor: '#9CA3AF',
    },
    requestButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    pickupContainer: {
        marginTop: 12,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    pickupCodeBox: {
        alignItems: 'center',
        marginBottom: 12,
        backgroundColor: '#F3F4F6',
        padding: 8,
        borderRadius: 8,
    },
    pickupLabel: {
        fontSize: 12,
        color: '#666',
        fontWeight: '500',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    pickupCode: {
        fontSize: 24,
        fontWeight: '700',
        color: '#0469ff',
        letterSpacing: 2,
    },
    barcodeContainer: {
        alignItems: 'center',
        height: 50,
        marginBottom: 12,
        overflow: 'hidden',
    },
    barcodeImage: {
        width: 200,
        height: 50,
    },
    pickupDateContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 8,
    },
    pickupDateText: {
        fontSize: 12,
        color: '#10B981',
        fontWeight: '600',
    },
    bookBarcodeContainer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        alignItems: 'center',
    },
    bookBarcodeLabel: {
        fontSize: 10,
        color: '#9CA3AF',
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    bookBarcodeText: {
        fontSize: 13,
        fontWeight: '500',
        color: '#374151',
        fontFamily: 'monospace',
    },
});
