import { View, Text, StyleSheet, RefreshControl, TextInput, ActivityIndicator, FlatList, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Users, Search, ChevronLeft, UserCheck, UserX, ChevronDown, X } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function StudentsScreen() {
    const { schoolId } = useLocalSearchParams();

    const [searchQuery, setSearchQuery] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [selectedClass, setSelectedClass] = useState(null);
    const [selectedSection, setSelectedSection] = useState(null);
    const [showClassFilter, setShowClassFilter] = useState(false);
    const [showSectionFilter, setShowSectionFilter] = useState(false);

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['director-students', schoolId, searchQuery, selectedClass, selectedSection],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/director/students`, {
                params: {
                    search: searchQuery,
                    classId: selectedClass?.id,
                    sectionId: selectedSection?.id
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

    const students = data?.students || [];
    const summary = data?.summary || { total: 0, active: 0, inactive: 0 };
    const classes = data?.classes || [];
    const sections = useMemo(() => {
        if (!selectedClass) return data?.sections || [];
        return (data?.sections || []).filter(s => s.classId === selectedClass.id);
    }, [data?.sections, selectedClass]);

    const clearFilters = () => {
        setSelectedClass(null);
        setSelectedSection(null);
    };

    const renderStudent = ({ item }) => (
        <HapticTouchable onPress={() => router.push({ pathname: `/student/${item.id}`, params: { schoolId } })}>
            <View style={styles.studentCard}>
                {item.profilePicture ? (
                    <Image source={{ uri: item.profilePicture }} style={styles.avatar} />
                ) : (
                    <View style={[styles.avatar, styles.avatarPlaceholder]}>
                        <Text style={styles.avatarText}>
                            {item.name?.charAt(0)?.toUpperCase() || '?'}
                        </Text>
                    </View>
                )}
                <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{item.name || 'Unknown'}</Text>
                    <Text style={styles.studentClass}>
                        {item.class?.name || 'No Class'} {item.section?.name ? `• ${item.section.name}` : ''}
                    </Text>
                    <Text style={styles.admissionNo}>Adm: {item.admissionNumber || 'N/A'}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: item.status === 'active' ? '#DCFCE7' : '#FEE2E2' }]}>
                    <Text style={[styles.statusText, { color: item.status === 'active' ? '#16A34A' : '#DC2626' }]}>
                        {item.status}
                    </Text>
                </View>
            </View>
        </HapticTouchable>
    );

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Students</Text>
                <View style={{ width: 24 }} />
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
                <View style={[styles.summaryCard, { backgroundColor: '#EFF6FF' }]}>
                    <Users size={20} color="#3B82F6" />
                    <Text style={styles.summaryValue}>{summary.total}</Text>
                    <Text style={styles.summaryLabel}>Total</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#DCFCE7' }]}>
                    <UserCheck size={20} color="#16A34A" />
                    <Text style={styles.summaryValue}>{summary.active}</Text>
                    <Text style={styles.summaryLabel}>Active</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: '#FEE2E2' }]}>
                    <UserX size={20} color="#DC2626" />
                    <Text style={styles.summaryValue}>{summary.inactive}</Text>
                    <Text style={styles.summaryLabel}>Inactive</Text>
                </View>
            </View>

            {/* Filters */}
            <View style={styles.filtersContainer}>
                {/* Class Filter */}
                <HapticTouchable
                    style={[styles.filterButton, selectedClass && styles.filterButtonActive]}
                    onPress={() => {
                        setShowClassFilter(!showClassFilter);
                        setShowSectionFilter(false);
                    }}
                >
                    <Text style={[styles.filterButtonText, selectedClass && styles.filterButtonTextActive]}>
                        {selectedClass?.name || 'All Classes'}
                    </Text>
                    <ChevronDown size={16} color={selectedClass ? '#3B82F6' : '#6B7280'} />
                </HapticTouchable>

                {/* Section Filter */}
                <HapticTouchable
                    style={[styles.filterButton, selectedSection && styles.filterButtonActive]}
                    onPress={() => {
                        setShowSectionFilter(!showSectionFilter);
                        setShowClassFilter(false);
                    }}
                >
                    <Text style={[styles.filterButtonText, selectedSection && styles.filterButtonTextActive]}>
                        {selectedSection?.name || 'All Sections'}
                    </Text>
                    <ChevronDown size={16} color={selectedSection ? '#3B82F6' : '#6B7280'} />
                </HapticTouchable>

                {/* Clear Filters */}
                {(selectedClass || selectedSection) && (
                    <HapticTouchable style={styles.clearButton} onPress={clearFilters}>
                        <X size={16} color="#EF4444" />
                    </HapticTouchable>
                )}
            </View>

            {/* Class Dropdown */}
            {showClassFilter && (
                <View style={styles.dropdown}>
                    <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                        <HapticTouchable
                            style={styles.dropdownItem}
                            onPress={() => {
                                setSelectedClass(null);
                                setSelectedSection(null);
                                setShowClassFilter(false);
                            }}
                        >
                            <Text style={styles.dropdownItemText}>All Classes</Text>
                        </HapticTouchable>
                        {classes.map((cls) => (
                            <HapticTouchable
                                key={cls.id}
                                style={[styles.dropdownItem, selectedClass?.id === cls.id && styles.dropdownItemActive]}
                                onPress={() => {
                                    setSelectedClass(cls);
                                    setSelectedSection(null);
                                    setShowClassFilter(false);
                                }}
                            >
                                <Text style={[styles.dropdownItemText, selectedClass?.id === cls.id && styles.dropdownItemTextActive]}>
                                    {cls.name}
                                </Text>
                            </HapticTouchable>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Section Dropdown */}
            {showSectionFilter && (
                <View style={styles.dropdown}>
                    <ScrollView style={styles.dropdownScroll} nestedScrollEnabled>
                        <HapticTouchable
                            style={styles.dropdownItem}
                            onPress={() => {
                                setSelectedSection(null);
                                setShowSectionFilter(false);
                            }}
                        >
                            <Text style={styles.dropdownItemText}>All Sections</Text>
                        </HapticTouchable>
                        {sections.map((sec) => (
                            <HapticTouchable
                                key={sec.id}
                                style={[styles.dropdownItem, selectedSection?.id === sec.id && styles.dropdownItemActive]}
                                onPress={() => {
                                    setSelectedSection(sec);
                                    setShowSectionFilter(false);
                                }}
                            >
                                <Text style={[styles.dropdownItemText, selectedSection?.id === sec.id && styles.dropdownItemTextActive]}>
                                    {sec.name}
                                </Text>
                            </HapticTouchable>
                        ))}
                        {sections.length === 0 && (
                            <View style={styles.dropdownEmpty}>
                                <Text style={styles.dropdownEmptyText}>No sections available</Text>
                            </View>
                        )}
                    </ScrollView>
                </View>
            )}

            {/* Search Bar */}
            <View style={styles.searchContainer}>
                <Search size={20} color="#9CA3AF" />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search students..."
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
            </View>

            {/* Students List */}
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#3B82F6" />
                </View>
            ) : (
                <FlatList
                    data={students}
                    renderItem={renderStudent}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContainer}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Users size={48} color="#D1D5DB" />
                            <Text style={styles.emptyText}>No students found</Text>
                        </View>
                    }
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#1F2937',
    },
    summaryContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 16,
        gap: 12,
    },
    summaryCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#1F2937',
        marginTop: 8,
    },
    summaryLabel: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 4,
    },
    filtersContainer: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        marginBottom: 12,
        gap: 8,
    },
    filterButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    filterButtonActive: {
        borderColor: '#3B82F6',
        backgroundColor: '#EFF6FF',
    },
    filterButtonText: {
        fontSize: 14,
        color: '#6B7280',
    },
    filterButtonTextActive: {
        color: '#3B82F6',
        fontWeight: '500',
    },
    clearButton: {
        backgroundColor: '#FEE2E2',
        padding: 10,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dropdown: {
        position: 'absolute',
        top: 235,
        left: 16,
        right: 16,
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        zIndex: 1000,
        maxHeight: 200,
    },
    dropdownScroll: {
        maxHeight: 200,
    },
    dropdownItem: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    dropdownItemActive: {
        backgroundColor: '#EFF6FF',
    },
    dropdownItemText: {
        fontSize: 14,
        color: '#1F2937',
    },
    dropdownItemTextActive: {
        color: '#3B82F6',
        fontWeight: '600',
    },
    dropdownEmpty: {
        padding: 16,
        alignItems: 'center',
    },
    dropdownEmptyText: {
        fontSize: 14,
        color: '#9CA3AF',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        marginHorizontal: 16,
        marginBottom: 16,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    searchInput: {
        flex: 1,
        marginLeft: 12,
        fontSize: 16,
        color: '#1F2937',
    },
    listContainer: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    studentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    avatarPlaceholder: {
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#3B82F6',
    },
    studentInfo: {
        flex: 1,
        marginLeft: 12,
    },
    studentName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1F2937',
    },
    studentClass: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    admissionNo: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '500',
        textTransform: 'capitalize',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        fontSize: 16,
        color: '#9CA3AF',
        marginTop: 12,
    },
});
