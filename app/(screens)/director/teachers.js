import { View, Text, StyleSheet, RefreshControl, TextInput, ActivityIndicator, FlatList, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Users, Search, ChevronLeft, GraduationCap, Briefcase } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function TeachersScreen() {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all'); // all, active, on-leave

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

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['director-teachers', schoolId, debouncedSearch, filter, statusFilter],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/teachers`, {
                params: {
                    search: debouncedSearch,
                    type: filter !== 'all' ? filter : undefined,
                    status: statusFilter !== 'all' ? (statusFilter === 'active' ? 'ACTIVE' : 'ON_LEAVE') : undefined
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

    const teachers = data?.staff || [];
    const summary = data?.summary || { total: 0, teaching: 0, nonTeaching: 0 };

    const getInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(' ').filter(Boolean);
        if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    };

    const renderTeacher = ({ item }) => {
        const hasValidPic = item.profilePicture !== 'default.png' && item.profilePicture.length > 0;
        return (
            <HapticTouchable onPress={() => router.push({ pathname: `/staff/${item.id}`, params: { schoolId } })}>
                <View style={styles.teacherCard}>
                    {hasValidPic ? (
                        <Image source={{ uri: item.profilePicture }} style={styles.avatar} />
                    ) : (
                        <View style={[styles.avatar, styles.avatarPlaceholder, { backgroundColor: item.type === 'teaching' ? '#DBEAFE' : '#FEF3C7' }]}>
                            <Text style={[styles.avatarText, { color: item.type === 'teaching' ? '#3B82F6' : '#D97706' }]}>
                                {getInitials(item.name)}
                            </Text>
                        </View>
                    )}
                    <View style={styles.teacherInfo}>
                        <Text style={styles.teacherName}>{item.name || 'Unknown'}</Text>
                        <Text style={styles.teacherRole}>{item.designation || item.type}</Text>
                        <Text style={styles.employeeId}>ID: {item.employeeId || 'N/A'}</Text>
                    </View>
                    <View style={[styles.typeBadge, { backgroundColor: item.type === 'teaching' ? '#DBEAFE' : '#FEF3C7' }]}>
                        {item.type === 'teaching' ? (
                            <GraduationCap size={16} color="#3B82F6" />
                        ) : (
                            <Briefcase size={16} color="#D97706" />
                        )}
                    </View>
                </View>
            </HapticTouchable>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Teachers & Staff</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.summaryContainer}>
                <View style={[styles.summaryCard, { backgroundColor: '#F3F4F6' }]}>
                    <Users size={20} color="#6B7280" />
                    <Text style={styles.summaryValue}>{summary.total}</Text>
                    <Text style={styles.summaryLabel}>Total</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#EFF6FF' }]}>
                    <GraduationCap size={20} color="#3B82F6" />
                    <Text style={styles.summaryValue}>{summary.teaching}</Text>
                    <Text style={styles.summaryLabel}>Teaching</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#FEF3C7' }]}>
                    <Briefcase size={20} color="#D97706" />
                    <Text style={styles.summaryValue}>{summary.nonTeaching}</Text>
                    <Text style={styles.summaryLabel}>Non-Teaching</Text>
                </View>
            </View>

            {/* Type Filter */}
            <View style={styles.filterContainer}>
                {['all', 'teaching', 'non-teaching'].map((f) => (
                    <HapticTouchable key={f} onPress={() => setFilter(f)}>
                        <View style={[styles.filterTab, filter === f && styles.filterTabActive]}>
                            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                                {f === 'non-teaching' ? 'Non-Teaching' : f.charAt(0).toUpperCase() + f.slice(1)}
                            </Text>
                        </View>
                    </HapticTouchable>
                ))}
            </View>

            {/* Status Filter */}
            <View style={styles.filterContainer}>
                {['all', 'active', 'on-leave'].map((s) => (
                    <HapticTouchable key={s} onPress={() => setStatusFilter(s)}>
                        <View style={[styles.statusTab, statusFilter === s && (s === 'active' ? styles.statusTabActive : s === 'on-leave' ? styles.statusTabLeave : styles.filterTabActive)]}>
                            <Text style={[styles.filterText, statusFilter === s && styles.filterTextActive]}>
                                {s === 'on-leave' ? 'On Leave' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </Text>
                        </View>
                    </HapticTouchable>
                ))}
            </View>

            <View style={styles.searchContainer}>
                <Search size={20} color="#9CA3AF" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search staff..."
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#3B82F6" />
                </View>
            ) : (
                <FlatList
                    data={teachers}
                    renderItem={renderTeacher}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContainer}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Users size={48} color="#D1D5DB" />
                            <Text style={styles.emptyText}>No staff found</Text>
                        </View>
                    }
                    // Performance optimizations for large lists
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={5}
                    removeClippedSubviews={true}
                    getItemLayout={(data, index) => ({
                        length: 92, // card height (80) + marginBottom (12)
                        offset: 92 * index,
                        index,
                    })}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    headerTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
    summaryContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, gap: 12 },
    summaryCard: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
    summaryValue: { fontSize: 24, fontWeight: '700', color: '#1F2937', marginTop: 8 },
    summaryLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },
    filterContainer: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16, gap: 8 },
    filterTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
    filterTabActive: { backgroundColor: '#3B82F6' },
    filterText: { fontSize: 14, color: '#6B7280' },
    filterTextActive: { color: '#FFFFFF', fontWeight: '500' },
    statusTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6' },
    statusTabActive: { backgroundColor: '#10B981' },
    statusTabLeave: { backgroundColor: '#EF4444' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', marginHorizontal: 16, marginBottom: 16, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    searchInput: { flex: 1, marginLeft: 12, fontSize: 16, color: '#1F2937' },
    listContainer: { paddingHorizontal: 16, paddingBottom: 24 },
    teacherCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB' },
    avatar: { width: 48, height: 48, borderRadius: 24 },
    avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 18, fontWeight: '600' },
    teacherInfo: { flex: 1, marginLeft: 12 },
    teacherName: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
    teacherRole: { fontSize: 14, color: '#6B7280', marginTop: 2, textTransform: 'capitalize' },
    employeeId: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
    typeBadge: { padding: 8, borderRadius: 8 },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 16, color: '#9CA3AF', marginTop: 12 },
});
