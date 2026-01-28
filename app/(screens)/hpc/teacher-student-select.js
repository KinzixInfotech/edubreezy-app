import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    Image,
    Dimensions,
    RefreshControl
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    Search,
    Users,
    Filter,
} from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function TeacherStudentSelectScreen() {
    const queryClient = useQueryClient();
    const params = useLocalSearchParams();
    const teacherData = params.teacherData ? JSON.parse(params.teacherData) : {};

    // Robust ID resolving
    const schoolId = params.schoolId || teacherData?.schoolId || teacherData?.school?.id;
    const teacherId = params.teacherId || teacherData?.id;

    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSectionId, setSelectedSectionId] = useState('all');

    // 1. Fetch Teacher Data (to get fresh sections/classes and ensure ID consistency)
    const { data: fetchedTeacherData } = useQuery({
        queryKey: ['teacher-profile', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return null;
            const res = await api.get(`/schools/${schoolId}/teachers/${teacherId}`);
            return res.data?.teacher;
        },
        enabled: !!schoolId && !!teacherId,
    });

    // Merge passed data with fetched data
    const activeTeacherData = fetchedTeacherData || teacherData;

    // Combine Classes (Class Teacher) and Sections (Subject Teacher) for tabs
    const assignedSections = useMemo(() => {
        if (!activeTeacherData) return [];

        const tabs = [];

        // Add assigned sections
        if (activeTeacherData.sectionsAssigned?.length > 0) {
            tabs.push(...activeTeacherData.sectionsAssigned);
        }

        // Add class teacher classes (treated as sections for filtering)
        if (activeTeacherData.Class?.length > 0) {
            activeTeacherData.Class.forEach(c => {
                // Avoid duplicates if class is already covered by section assignment (simplistic check)
                // For now, just add them. Filter logic will handle it.
                // We need a unique ID. Using classId might conflict with sectionId if they share number space?
                // Usually IDs are unique UUIDs or high numbers. 
                // Wait, Class ID and Section ID are ints.
                // Let's assume they are distinct enough or we handle them.
                // Actually, my filtering logic uses `s.sectionId`.
                // If I select a Class Tab, I want students with `s.classId === classId`.

                // We need a way to distinguish Class Tab vs Section Tab in filteredStudents.
                // Let's stick to sections for now as per user request to "remove All Classes".
                // But if teacher is Class Teacher, they need to see their class.
                // Add a field `type: 'class'` to the tab item.

                tabs.push({
                    id: c.id,
                    name: `${c.className} (Class Teacher)`,
                    type: 'class',
                    class: c // redundant structure matching
                });
            });
        }

        return tabs;
    }, [activeTeacherData]);

    // Update selected section when sections load
    React.useEffect(() => {
        if (assignedSections.length > 0 && (selectedSectionId === 'all' || !selectedSectionId)) {
            setSelectedSectionId(assignedSections[0].id);
        }
    }, [assignedSections.length]); // Only run when length changes to avoid reset on every render

    // Fetch students for all assigned sections
    const { data: students, isLoading, refetch } = useQuery({
        queryKey: ['teacher-students-hpc', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return [];

            const res = await api.get(`/schools/${schoolId}/teachers/${teacherId}/students`);

            return (res.data?.students || []).map(s => ({
                id: s.studentId,
                studentId: s.studentId,
                userId: s.id,
                name: s.name,
                email: s.email,
                profilePicture: s.profilePicture,
                rollNumber: s.rollNumber,
                admissionNo: s.admissionNo,
                className: s.class?.className || s.section?.class?.className || '',
                classId: s.class?.id, // Added classId for filtering
                sectionName: s.section?.name || '',
                sectionId: s.section?.id
            }));
        },
        enabled: !!schoolId && !!teacherId,
        staleTime: 1000 * 60 * 5,
    });

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['teacher-profile', schoolId, teacherId]),
            refetch()
        ]);
        setRefreshing(false);
    };

    // Filtering logic
    const filteredStudents = useMemo(() => {
        if (!students) return [];

        let result = students;

        // Filter by section/class
        if (selectedSectionId !== 'all') {
            // Find the selected tab object to know if it's a class or section
            const selectedTab = assignedSections.find(s => s.id == selectedSectionId);

            if (selectedTab?.type === 'class') {
                // Filter by Class ID
                result = result.filter(s => s.classId == selectedSectionId); // Loose equality
            } else {
                // Filter by Section ID
                result = result.filter(s => s.sectionId == selectedSectionId); // Loose equality
            }
        }

        // Filter by search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(s =>
                s.name?.toLowerCase().includes(query) ||
                s.admissionNo?.toLowerCase().includes(query) ||
                s.email?.toLowerCase().includes(query) ||
                (s.rollNumber && String(s.rollNumber).toLowerCase().includes(query))
            );
        }

        return result.sort((a, b) => {
            const rollA = parseInt(a.rollNumber) || 9999;
            const rollB = parseInt(b.rollNumber) || 9999;
            return rollA - rollB;
        });
    }, [students, selectedSectionId, searchQuery, assignedSections]);

    const [selectedTerm, setSelectedTerm] = useState(1);

    const handleStudentSelect = (student) => {
        router.push({
            pathname: '/hpc/teacher-assess',
            params: {
                childData: JSON.stringify({
                    studentId: student.id,
                    name: student.name,
                    ...student
                }),
                termNumber: selectedTerm
            }
        });
    };

    const renderStudentItem = ({ item, index }) => (
        <Animated.View entering={FadeInRight.delay(index * 50).duration(400)}>
            <HapticTouchable onPress={() => handleStudentSelect(item)}>
                <View style={styles.studentCard}>
                    <View style={styles.avatarContainer}>
                        {item.profilePicture && item.profilePicture !== 'default.png' ? (
                            <Image source={{ uri: item.profilePicture }} style={styles.avatar} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarInitial}>
                                    {item.name?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'S'}
                                </Text>
                            </View>
                        )}
                    </View>
                    <View style={styles.studentInfo}>
                        <Text style={styles.studentName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.studentDetails}>
                            Class {item.className}-{item.sectionName} • Roll: {item.rollNumber || 'N/A'}
                        </Text>
                        <Text style={styles.admissionNo}>Adm: {item.admissionNo}</Text>
                    </View>
                    <View style={styles.arrowContainer}>
                        {/* Simple chevron or action icon */}
                        <View style={{ width: 8, height: 8, borderTopWidth: 2, borderRightWidth: 2, borderColor: '#ccc', transform: [{ rotate: '45deg' }] }} />
                    </View>
                </View>
            </HapticTouchable>
        </Animated.View>
    );

    if (!teacherData) {
        return (
            <View style={styles.centerContainer}>
                <Text>No teacher data provided</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Header */}
            <LinearGradient
                colors={['#8B5CF6', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                <View style={styles.headerRow}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <Text style={styles.headerTitle}>Select Student</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Term Selector */}
                <View style={styles.termContainer}>
                    <View style={styles.termSelector}>
                        <TouchableOpacity
                            style={[styles.termButton, selectedTerm === 1 && styles.termButtonActive]}
                            onPress={() => setSelectedTerm(1)}
                        >
                            <Text style={[styles.termText, selectedTerm === 1 && styles.termTextActive]}>Term 1</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.termButton, selectedTerm === 2 && styles.termButtonActive]}
                            onPress={() => setSelectedTerm(2)}
                        >
                            <Text style={[styles.termText, selectedTerm === 2 && styles.termTextActive]}>Term 2</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <Search size={20} color="#fff" style={{ opacity: 0.7 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search by name, roll no..."
                        placeholderTextColor="rgba(255,255,255,0.6)"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                </View>
            </LinearGradient>

            {/* Section Filter Tabs */}
            <View style={styles.filterContainer}>
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    // Removed "All Classes" as requested
                    data={assignedSections.map(s => ({
                        id: s.id,
                        name: `${s.class?.className}-${s.name}`
                    }))}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
                    renderItem={({ item }) => {
                        const isSelected = selectedSectionId === item.id;
                        return (
                            <TouchableOpacity
                                onPress={() => setSelectedSectionId(item.id)}
                                activeOpacity={0.7}
                            >
                                <View style={[
                                    styles.filterChip,
                                    isSelected && styles.filterChipSelected
                                ]}>
                                    <Text style={[
                                        styles.filterText,
                                        isSelected && styles.filterTextSelected
                                    ]}>
                                        {item.name}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>

            {/* Student List */}
            {isLoading ? (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color="#8B5CF6" />
                    <Text style={styles.loadingText}>Loading students...</Text>
                </View>
            ) : (
                <FlatList
                    data={filteredStudents}
                    keyExtractor={item => item.id}
                    renderItem={renderStudentItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Users size={48} color="#ddd" />
                            <Text style={styles.emptyText}>
                                {searchQuery ? 'No students found matching your search' : 'No students found'}
                            </Text>
                            <TouchableOpacity onPress={onRefresh} style={{ marginTop: 20 }}>
                                <Text style={{ color: '#8B5CF6', fontWeight: '600' }}>Tap to Refresh</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 20,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 46,
    },
    searchInput: {
        flex: 1,
        marginLeft: 10,
        color: '#fff',
        fontSize: 16,
    },
    filterContainer: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    filterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#f0f0f0',
        borderWidth: 1,
        borderColor: '#eee',
    },
    filterChipSelected: {
        backgroundColor: '#8B5CF6',
        borderColor: '#8B5CF6',
    },
    filterText: {
        fontSize: 14,
        color: '#666',
        fontWeight: '500',
    },
    filterTextSelected: {
        color: '#fff',
        fontWeight: '600',
    },
    termContainer: {
        marginBottom: 16,
    },
    termSelector: {
        flexDirection: 'row',
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 12,
        padding: 4,
    },
    termButton: {
        flex: 1,
        paddingVertical: 8,
        alignItems: 'center',
        borderRadius: 8,
    },
    termButtonActive: {
        backgroundColor: '#fff',
    },
    termText: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgba(255,255,255,0.8)',
    },
    termTextActive: {
        color: '#8B5CF6',
    },
    listContent: {
        padding: 16,
        paddingBottom: 40,
    },
    studentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 12,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    avatarContainer: {
        marginRight: 16,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#f0f0f0',
    },
    avatarPlaceholder: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#F3E8FF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarInitial: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#8B5CF6',
    },
    studentInfo: {
        flex: 1,
    },
    studentName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    studentDetails: {
        fontSize: 14,
        color: '#666',
        marginBottom: 2,
    },
    admissionNo: {
        fontSize: 12,
        color: '#999',
    },
    arrowContainer: {
        paddingLeft: 10,
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 10,
        color: '#666',
    },
    emptyContainer: {
        marginTop: 60,
        alignItems: 'center',
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: '#999',
    },
});
