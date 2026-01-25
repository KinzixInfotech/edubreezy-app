import { View, Text, StyleSheet, RefreshControl, ActivityIndicator, FlatList, Image, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { ChevronLeft, UserCheck, UserX, Clock, Users, Calendar, GraduationCap, Briefcase, UserCog, Search, X } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';

// Category definitions
const CATEGORIES = [
    { key: 'student', label: 'Students', icon: GraduationCap, color: '#3B82F6' },
    { key: 'teacher', label: 'Teachers', icon: Briefcase, color: '#8B5CF6' },
    { key: 'staff', label: 'Staff', icon: UserCog, color: '#F59E0B' },
];

export default function AttendanceViewScreen() {
    const { schoolId, type: initialType } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all'); // all, present, absent, late
    const [category, setCategory] = useState(initialType || 'student'); // student, teacher, staff
    const [searchQuery, setSearchQuery] = useState('');

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['attendance-today', schoolId, filter, category],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/attendance/today`, {
                params: {
                    status: filter !== 'all' ? filter : undefined,
                    type: category // Pass category to API (student, teacher, staff)
                }
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

    const attendance = data?.attendance || [];
    const summary = data?.summary || { total: 0, present: 0, absent: 0, late: 0, percentage: 0 };
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Filter attendance by search query   
    const filteredAttendance = useMemo(() => {
        if (!searchQuery.trim()) return attendance;
        const query = searchQuery.toLowerCase();
        return attendance.filter(item => {
            const name = (item.name || '').toLowerCase();
            const classSection = `${item.class || ''} ${item.section || ''}`.toLowerCase();
            const subject = (item.subject || '').toLowerCase();
            const designation = (item.designation || '').toLowerCase();
            return name.includes(query) || classSection.includes(query) || subject.includes(query) || designation.includes(query);
        });
    }, [attendance, searchQuery]);

    const getStatusColor = (status) => {
        switch (status?.toLowerCase()) {
            case 'present': return { bg: '#DCFCE7', text: '#16A34A' };
            case 'absent': return { bg: '#FEE2E2', text: '#DC2626' };
            case 'late': return { bg: '#FEF3C7', text: '#D97706' };
            default: return { bg: '#F3F4F6', text: '#6B7280' };
        }
    };

    const getCategoryLabel = () => {
        switch (category) {
            case 'teacher': return 'teachers';
            case 'staff': return 'staff members';
            default: return 'students';
        }
    };

    // Check if profile picture is valid (not null, empty, or default.png)
    const hasValidProfilePicture = (url) => {
        if (!url) return false;
        if (url === 'default.png') return false;
        if (url.includes('default.png')) return false;
        return true;
    };

    const renderPerson = ({ item }) => {
        const statusColors = getStatusColor(item.status);
        const showInitials = !hasValidProfilePicture(item.profilePicture);

        return (
            <View style={styles.personCard}>
                {showInitials ? (
                    <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: CATEGORIES.find(c => c.key === category)?.color + '20' }]}>
                        <Text style={[styles.avatarText, { color: CATEGORIES.find(c => c.key === category)?.color }]}>
                            {item.name?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                    </View>
                ) : (
                    <Image source={{ uri: item.profilePicture }} style={styles.avatar} />
                )}
                <View style={styles.personInfo}>
                    <Text style={styles.personName}>{item.name || 'Unknown'}</Text>
                    {/* Show different info based on category */}
                    {category === 'student' && (
                        <Text style={styles.personSubtext}>{item.class} • {item.section}</Text>
                    )}
                    {category === 'teacher' && (
                        <Text style={styles.personSubtext}>{item.subject || item.department || 'Teacher'}</Text>
                    )}
                    {category === 'staff' && (
                        <Text style={styles.personSubtext}>{item.designation || item.department || 'Staff'}</Text>
                    )}
                    {item.markedAt && (
                        <Text style={styles.markedAt}>Marked at {new Date(item.markedAt).toLocaleTimeString()}</Text>
                    )}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusColors.bg }]}>
                    {item.status?.toLowerCase() === 'present' && <UserCheck size={14} color={statusColors.text} />}
                    {item.status?.toLowerCase() === 'absent' && <UserX size={14} color={statusColors.text} />}
                    {item.status?.toLowerCase() === 'late' && <Clock size={14} color={statusColors.text} />}
                    <Text style={[styles.statusText, { color: statusColors.text }]}>{item.status}</Text>
                </View>
            </View>
        );
    };

    const ListHeader = () => (
        <>
            {/* Date Header */}
            <View style={styles.dateHeader}>
                <Calendar size={18} color="#6B7280" />
                <Text style={styles.dateText}>{today}</Text>
            </View>

            {/* Category Tabs */}
            <View style={styles.categoryContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
                    {CATEGORIES.map((cat) => {
                        const Icon = cat.icon;
                        const isActive = category === cat.key;
                        return (
                            <HapticTouchable
                                key={cat.key}
                                onPress={() => {
                                    setCategory(cat.key);
                                    setFilter('all'); // Reset filter when changing category
                                }}
                            >
                                <View style={[
                                    styles.categoryTab,
                                    isActive && { backgroundColor: cat.color, borderColor: cat.color }
                                ]}>
                                    <Icon size={16} color={isActive ? '#FFFFFF' : cat.color} />
                                    <Text style={[
                                        styles.categoryTabText,
                                        isActive && { color: '#FFFFFF' }
                                    ]}>
                                        {cat.label}
                                    </Text>
                                </View>
                            </HapticTouchable>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
                <View style={[styles.summaryCard, { backgroundColor: '#F3F4F6' }]}>
                    <Users size={18} color="#6B7280" />
                    <Text style={styles.summaryValue}>{summary.total}</Text>
                    <Text style={styles.summaryLabel}>Total</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#DCFCE7' }]}>
                    <UserCheck size={18} color="#16A34A" />
                    <Text style={styles.summaryValue}>{summary.present}</Text>
                    <Text style={styles.summaryLabel}>Present</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#FEE2E2' }]}>
                    <UserX size={18} color="#DC2626" />
                    <Text style={styles.summaryValue}>{summary.absent}</Text>
                    <Text style={styles.summaryLabel}>Absent</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#FEF3C7' }]}>
                    <Clock size={18} color="#D97706" />
                    <Text style={styles.summaryValue}>{summary.late || 0}</Text>
                    <Text style={styles.summaryLabel}>Late</Text>
                </View>
            </View>

            {/* Attendance Percentage */}
            <View style={styles.percentageCard}>
                <Text style={styles.percentageLabel}>Today's Attendance Rate</Text>
                <Text style={[styles.percentageValue, { color: summary.percentage >= 80 ? '#16A34A' : summary.percentage >= 60 ? '#D97706' : '#DC2626' }]}>
                    {summary.percentage}%
                </Text>
            </View>

            {/* Status Filter Tabs */}
            <View style={styles.filterContainer}>
                {['all', 'present', 'absent', 'late'].map((f) => (
                    <HapticTouchable key={f} onPress={() => setFilter(f)} style={{ flex: 1 }}>
                        <View style={[
                            styles.filterTab,
                            filter === f && (f === 'present' ? styles.filterTabPresent : f === 'absent' ? styles.filterTabAbsent : f === 'late' ? styles.filterTabLate : styles.filterTabActive)
                        ]}>
                            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                                {f.charAt(0).toUpperCase() + f.slice(1)}
                            </Text>
                        </View>
                    </HapticTouchable>
                ))}
            </View>

            {/* Section Title */}
            <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Attendance Records</Text>
                <Text style={styles.sectionCount}>{filteredAttendance.length} {getCategoryLabel()}</Text>
            </View>
        </>
    );

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <ChevronLeft size={24} color="#1F2937" />
                    </HapticTouchable>
                    <Text style={styles.headerTitle}>Attendance</Text>
                    <View style={{ width: 24 }} />
                </View>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style='dark' />
            <Stack.Screen options={{ headerShown: false }} />

            {/* Fixed Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Attendance</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Search Bar - Fixed outside FlatList to prevent keyboard dismissal */}
            <View style={styles.searchContainer}>
                <Search size={18} color="#9CA3AF" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder={`Search ${getCategoryLabel()}...`}
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                    <HapticTouchable onPress={() => setSearchQuery('')} style={styles.clearButton}>
                        <X size={16} color="#6B7280" />
                    </HapticTouchable>
                )}
            </View>
            {/* Attendance List with Header */}
            <FlatList
                data={filteredAttendance}
                renderItem={renderPerson}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
                ListHeaderComponent={ListHeader}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        {searchQuery ? (
                            <>
                                <Search size={48} color="#D1D5DB" />
                                <Text style={styles.emptyText}>No results found</Text>
                                <Text style={styles.emptySubtext}>Try searching with a different name</Text>
                            </>
                        ) : (
                            <>
                                <UserCheck size={48} color="#D1D5DB" />
                                <Text style={styles.emptyText}>No attendance records for today</Text>
                                <Text style={styles.emptySubtext}>
                                    {category === 'student' ? 'Student' : category === 'teacher' ? 'Teacher' : 'Staff'} attendance hasn't been marked yet
                                </Text>
                            </>
                        )}
                    </View>
                }
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB'
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1F2937'
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    dateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        gap: 8,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
    },
    dateText: {
        fontSize: 14,
        color: '#6B7280'
    },
    // Category tabs
    categoryContainer: {
        backgroundColor: '#FFFFFF',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB'
    },
    categoryScroll: {
        paddingHorizontal: 16,
        gap: 10
    },
    categoryTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: '#F9FAFB',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        gap: 6
    },
    categoryTabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#4B5563'
    },
    summaryContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 8
    },
    summaryCard: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        alignItems: 'center'
    },
    summaryValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#1F2937',
        marginTop: 4
    },
    summaryLabel: {
        fontSize: 11,
        color: '#6B7280',
        marginTop: 2
    },
    percentageCard: {
        marginHorizontal: 16,
        marginBottom: 16,
        padding: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    percentageLabel: {
        fontSize: 14,
        color: '#6B7280'
    },
    percentageValue: {
        fontSize: 28,
        fontWeight: '700'
    },
    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 16,
        gap: 8
    },
    filterTab: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#F3F4F6',
        alignItems: 'center'
    },
    filterTabActive: {
        backgroundColor: '#3B82F6'
    },
    filterTabPresent: {
        backgroundColor: '#16A34A'
    },
    filterTabAbsent: {
        backgroundColor: '#DC2626'
    },
    filterTabLate: {
        backgroundColor: '#D97706'
    },
    filterText: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '500'
    },
    filterTextActive: {
        color: '#FFFFFF',
        fontWeight: '600'
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937'
    },
    sectionCount: {
        fontSize: 14,
        color: '#6B7280'
    },
    listContainer: {
        paddingBottom: 24,
        flexGrow: 1
    },
    personCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 14,
        borderRadius: 12,
        marginBottom: 10,
        marginHorizontal: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB'
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22
    },
    avatarPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center'
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '600'
    },
    personInfo: {
        flex: 1,
        marginLeft: 12
    },
    personName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1F2937'
    },
    personSubtext: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2
    },
    markedAt: {
        fontSize: 11,
        color: '#9CA3AF',
        marginTop: 2
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        textTransform: 'capitalize'
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60
    },
    emptyText: {
        fontSize: 16,
        color: '#6B7280',
        marginTop: 16,
        fontWeight: '500'
    },
    emptySubtext: {
        fontSize: 14,
        color: '#9CA3AF',
        marginTop: 4
    },
    // Search styles
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 8,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        height: 44
    },
    searchIcon: {
        marginRight: 8
    },
    searchInput: {
        flex: 1,
        fontSize: 15,
        color: '#1F2937',
        paddingVertical: 0
    },
    clearButton: {
        padding: 4
    }
});
