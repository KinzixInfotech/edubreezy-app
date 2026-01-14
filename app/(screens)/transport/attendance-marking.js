// Attendance Marking Screen for Driver/Conductor
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, Alert, Dimensions, ActivityIndicator, FlatList, TextInput, Image, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, Check, X, Users, Save, Search, CheckCircle2, Clock } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router'
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import Animated, { FadeInDown } from 'react-native-reanimated';

const { width } = Dimensions.get('window');

export default function AttendanceMarkingScreen() {
    const { tripId } = useLocalSearchParams();
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();
    const [selectedStop, setSelectedStop] = useState(null);
    const [attendance, setAttendance] = useState({});
    const [searchQuery, setSearchQuery] = useState('');

    // Fetch Trip Details & Attendance
    const { data: tripData, isLoading } = useQuery({
        queryKey: ['trip-attendance', tripId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/trips/${tripId}`);
            return res.data;
        },
        enabled: !!tripId,
    });

    const trip = tripData?.trip;
    const stops = trip?.route?.busStops || [];
    const attendanceRecords = trip?.attendanceRecords || [];
    const routeId = trip?.routeId;
    const schoolId = trip?.route?.schoolId;

    // Fetch students assigned to this route
    const { data: routeStudentsData, isLoading: studentsLoading } = useQuery({
        queryKey: ['route-students', routeId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/student-routes?schoolId=${schoolId}&routeId=${routeId}&limit=100`);
            return res.data;
        },
        enabled: !!routeId && !!schoolId,
    });

    // Get students from route assignments (these are students assigned to the route)
    const routeStudents = routeStudentsData?.assignments?.map(a => ({
        id: a.studentId,
        studentId: a.studentId,
        name: a.student?.name,
        admissionNo: a.student?.admissionNo,
        rollNumber: a.student?.rollNumber,
        profilePicture: a.student?.user?.profilePicture,
        className: a.student?.section?.class?.className,
        sectionName: a.student?.section?.name,
        student: a.student,
    })) || [];

    // Filter students based on search query
    const filteredStudents = useMemo(() => {
        if (!searchQuery.trim()) return routeStudents;
        const query = searchQuery.toLowerCase();
        return routeStudents.filter(s =>
            s.name?.toLowerCase().includes(query) ||
            s.rollNumber?.toString().includes(query) ||
            s.admissionNo?.toLowerCase().includes(query)
        );
    }, [routeStudents, searchQuery]);

    // Calculate attendance summary from existing records
    const attendanceSummary = useMemo(() => {
        if (!attendanceRecords || attendanceRecords.length === 0) return null;

        const presentCount = attendanceRecords.filter(r => r.status === 'PRESENT').length;
        const absentCount = attendanceRecords.filter(r => r.status === 'ABSENT').length;
        const lateCount = attendanceRecords.filter(r => r.status === 'LATE').length;
        const lastMarkedAt = attendanceRecords[0]?.markedAt;

        return {
            total: attendanceRecords.length,
            present: presentCount,
            absent: absentCount,
            late: lateCount,
            markedAt: lastMarkedAt ? new Date(lastMarkedAt) : null,
            isComplete: attendanceRecords.length >= routeStudents.length && routeStudents.length > 0,
        };
    }, [attendanceRecords, routeStudents.length]);

    // Initialize state when data loads
    useEffect(() => {
        if (trip) {
            if (!selectedStop && stops.length > 0) {
                setSelectedStop(stops[0]);
            }

            // Pre-populate attendance from existing records
            const initialAttendance = {};
            attendanceRecords.forEach(record => {
                initialAttendance[record.studentId] = record.status;
            });
            setAttendance(initialAttendance);
        }
    }, [trip]);

    const handleMarkAttendance = (studentId, status) => {
        setAttendance(prev => ({ ...prev, [studentId]: status }));
    };

    // Mark all students as present
    const handleMarkAllPresent = () => {
        const allPresent = {};
        routeStudents.forEach(student => {
            allPresent[student.studentId] = 'PRESENT';
        });
        setAttendance(allPresent);
    };

    // Submit Attendance Mutation
    const submitMutation = useMutation({
        mutationFn: async (data) => {
            return await api.post('/schools/transport/attendance/bulk', data);
        },
        onSuccess: (data) => {
            Alert.alert('Success', data.data.message);
            queryClient.invalidateQueries(['trip-attendance', tripId]);
            queryClient.invalidateQueries(['conductor-trips']);
            router.back();
        },
        onError: (error) => {
            Alert.alert('Error', error?.response?.data?.error || 'Failed to submit attendance');
        }
    });

    const handleSubmit = async () => {
        if (!selectedStop) {
            Alert.alert('Select Stop', 'Please select a stop first');
            return;
        }

        const studentsToMark = Object.entries(attendance).map(([studentId, status]) => ({
            studentId,
            status,
        }));

        if (studentsToMark.length === 0) {
            Alert.alert('No Changes', 'Mark attendance for at least one student');
            return;
        }

        try {
            const staffData = await SecureStore.getItemAsync('user');
            const staff = staffData ? JSON.parse(staffData) : null;

            let location = null;
            try {
                const loc = await Location.getCurrentPositionAsync({});
                location = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            } catch (e) { }

            submitMutation.mutate({
                tripId,
                stopId: selectedStop.id,
                markedById: staff?.id,
                latitude: location?.latitude,
                longitude: location?.longitude,
                students: studentsToMark,
            });
        } catch (err) {
            console.error(err);
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.centerContent}>
                    <ActivityIndicator size="large" color="#4F46E5" />
                    <Text style={{ marginTop: 12, color: '#64748B' }}>Loading students...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* StatusBar removed - using global */}

            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color="#111" />
                </HapticTouchable>
                <View>
                    <Text style={styles.headerTitle}>Mark Attendance</Text>
                    <Text style={styles.headerSubtitle}>{trip?.route?.name} • {trip?.tripType}</Text>
                </View>
            </View>

            <View style={styles.content}>
                {/* Stop Selector */}
                <View style={styles.stopsContainer}>
                    <Text style={styles.sectionLabel}>Select Stop</Text>
                    <FlatList
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.stopsScroll}
                        data={[{ id: null, name: 'All Stops', isAll: true }, ...stops]}
                        keyExtractor={(item) => item.id?.toString() || 'all'}
                        renderItem={({ item }) => (
                            <HapticTouchable
                                style={[
                                    styles.stopChip,
                                    item.isAll
                                        ? (selectedStop === null && styles.stopChipActive)
                                        : (selectedStop?.id === item.id && styles.stopChipActive)
                                ]}
                                onPress={() => setSelectedStop(item.isAll ? null : item)}
                            >
                                <Text style={[
                                    styles.stopChipText,
                                    item.isAll
                                        ? (selectedStop === null && styles.stopChipTextActive)
                                        : (selectedStop?.id === item.id && styles.stopChipTextActive)
                                ]}>
                                    {item.isAll ? 'All Stops' : `${item.orderIndex}. ${item.name}`}
                                </Text>
                            </HapticTouchable>
                        )}
                    />
                </View>
                {/* Attendance Already Marked Banner */}
                {attendanceSummary && (
                    <View style={[
                        styles.summaryBanner,
                        attendanceSummary.isComplete && styles.summaryBannerComplete
                    ]}>
                        <View style={styles.summaryHeader}>
                            <CheckCircle2 size={18} color={attendanceSummary.isComplete ? "#16A34A" : "#0068fd"} />
                            <Text style={[
                                styles.summaryTitle,
                                attendanceSummary.isComplete && styles.summaryTitleComplete
                            ]}>
                                {attendanceSummary.isComplete ? 'Attendance Complete' : 'Attendance Marked'}
                            </Text>
                            {attendanceSummary.markedAt && (
                                <Text style={styles.summaryTime}>
                                    {attendanceSummary.markedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            )}
                        </View>
                        <View style={styles.summaryStats}>
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{attendanceSummary.present}</Text>
                                <Text style={styles.statLabel}>Present</Text>
                            </View>
                            <View style={[styles.statItem, styles.statItemRed]}>
                                <Text style={[styles.statValue, styles.statValueRed]}>{attendanceSummary.absent}</Text>
                                <Text style={styles.statLabel}>Absent</Text>
                            </View>
                            {attendanceSummary.late > 0 && (
                                <View style={[styles.statItem, styles.statItemOrange]}>
                                    <Text style={[styles.statValue, styles.statValueOrange]}>{attendanceSummary.late}</Text>
                                    <Text style={styles.statLabel}>Late</Text>
                                </View>
                            )}
                        </View>
                    </View>
                )}

                {/* Search & Actions Bar */}
                <View style={styles.searchSection}>
                    <View style={styles.searchBox}>
                        <Search size={18} color="#94A3B8" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search by name, roll no, or admission no..."
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                    </View>
                    {routeStudents.length > 0 && (
                        <HapticTouchable style={styles.markAllBtn} onPress={handleMarkAllPresent}>
                            <CheckCircle2 size={16} color="#fff" />
                            <Text style={styles.markAllText}>All Present</Text>
                        </HapticTouchable>
                    )}
                </View>

                {/* Students Count */}
                {routeStudents.length > 0 && (
                    <View style={styles.countBar}>
                        <Text style={styles.countText}>
                            {filteredStudents.length} of {routeStudents.length} student{routeStudents.length !== 1 ? 's' : ''}
                        </Text>
                        <Text style={styles.markedText}>
                            {Object.keys(attendance).length} marked
                        </Text>
                    </View>
                )}

                {/* Students List with FlatList for optimization */}
                {studentsLoading ? (
                    <View style={styles.emptyState}>
                        <ActivityIndicator size="large" color="#4F46E5" />
                        <Text style={styles.emptySubtext}>Loading students...</Text>
                    </View>
                ) : filteredStudents.length > 0 ? (
                    <FlatList
                        data={filteredStudents}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item: student, index }) => (
                            <Animated.View
                                entering={index < 10 ? FadeInDown.delay(index * 30).duration(300) : undefined}
                                style={[
                                    styles.studentCard,
                                    attendance[student.studentId] === 'PRESENT' && styles.cardPresent,
                                    attendance[student.studentId] === 'ABSENT' && styles.cardAbsent,
                                ]}
                            >
                                <View style={styles.studentInfo}>
                                    {/* Profile Picture or Avatar */}
                                    {student.profilePicture && student.profilePicture !== 'default.png' ? (
                                        <Image
                                            source={{ uri: student.profilePicture }}
                                            style={styles.profileImage}
                                        />
                                    ) : (
                                        <View style={styles.avatar}>
                                            <Text style={styles.avatarText}>{student.name?.[0] || 'S'}</Text>
                                        </View>
                                    )}

                                    <View style={styles.studentDetails}>
                                        <Text style={styles.studentName}>{student.name}</Text>
                                        <View style={styles.studentMeta}>
                                            {student.rollNumber && (
                                                <Text style={styles.metaText}>Roll: {student.rollNumber}</Text>
                                            )}
                                            {student.admissionNo && (
                                                <Text style={styles.metaText}>Adm: {student.admissionNo}</Text>
                                            )}
                                        </View>
                                        {student.className && (
                                            <Text style={styles.classText}>
                                                {student.className}{student.sectionName ? ` - ${student.sectionName}` : ''}
                                            </Text>
                                        )}
                                    </View>
                                </View>

                                {/* Attendance Buttons - Only Present & Absent for Driver */}
                                <View style={styles.actionRow}>
                                    <HapticTouchable
                                        style={[
                                            styles.statusBtn,
                                            styles.btnPresent,
                                            attendance[student.studentId] === 'PRESENT' && styles.btnPresentActive
                                        ]}
                                        onPress={() => handleMarkAttendance(student.studentId, 'PRESENT')}
                                    >
                                        <Check size={20} color={attendance[student.studentId] === 'PRESENT' ? '#fff' : '#16A34A'} />
                                    </HapticTouchable>

                                    <HapticTouchable
                                        style={[
                                            styles.statusBtn,
                                            styles.btnAbsent,
                                            attendance[student.studentId] === 'ABSENT' && styles.btnAbsentActive
                                        ]}
                                        onPress={() => handleMarkAttendance(student.studentId, 'ABSENT')}
                                    >
                                        <X size={20} color={attendance[student.studentId] === 'ABSENT' ? '#fff' : '#EF4444'} />
                                    </HapticTouchable>
                                </View>
                            </Animated.View>
                        )}
                    />
                ) : routeStudents.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Users size={48} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No students assigned</Text>
                        <Text style={styles.emptySubtext}>Assign students to this route from dashboard</Text>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <Search size={48} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No results found</Text>
                        <Text style={styles.emptySubtext}>Try a different search term</Text>
                    </View>
                )}

                {/* Submit Fab */}
                {routeStudents.length > 0 && (
                    <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
                        <HapticTouchable
                            style={styles.submitButton}
                            onPress={handleSubmit}
                            disabled={submitMutation.isPending}
                        >
                            {submitMutation.isPending ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Save size={20} color="#fff" />
                                    <Text style={styles.submitText}>Submit Attendance</Text>
                                </>
                            )}
                        </HapticTouchable>
                    </View>
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    centerContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
        backgroundColor: '#fff',
    },
    backButton: {
        padding: 8,
        marginRight: 8,
        borderRadius: 20,
        backgroundColor: '#F8FAFC',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0F172A',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#64748B',
    },
    content: {
        flex: 1,
    },
    stopsContainer: {
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
        marginLeft: 16,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    stopsScroll: {
        paddingHorizontal: 16,
        paddingBottom: 4,
    },
    stopChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    stopChipActive: {
        backgroundColor: '#0068fd',
        borderColor: '#0068fd',
    },
    stopChipText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748B',
    },
    stopChipTextActive: {
        color: '#fff',
    },
    listContainer: {
        flex: 1,
        padding: 16,
    },
    studentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#F1F5F9',
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    studentInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#475569',
    },
    studentName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#0F172A',
    },
    studentId: {
        fontSize: 12,
        color: '#64748B',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 8,
    },
    statusBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    btnPresent: { backgroundColor: '#DCFCE7', borderColor: '#DCFCE7' },
    btnPresentActive: { backgroundColor: '#16A34A', borderColor: '#16A34A' },

    btnAbsent: { backgroundColor: '#FEE2E2', borderColor: '#FEE2E2' },
    btnAbsentActive: { backgroundColor: '#EF4444', borderColor: '#EF4444' },

    btnLate: { backgroundColor: '#FEF3C7', borderColor: '#FEF3C7' },
    btnLateActive: { backgroundColor: '#D97706', borderColor: '#D97706' },

    // Attendance Summary Banner
    summaryBanner: {
        backgroundColor: '#EFF6FF',
        marginHorizontal: 16,
        marginTop: 12,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#BFDBFE',
    },
    summaryBannerComplete: {
        backgroundColor: '#F0FDF4',
        borderColor: '#86EFAC',
    },
    summaryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    summaryTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0068fd',
        flex: 1,
    },
    summaryTitleComplete: {
        color: '#16A34A',
    },
    summaryTime: {
        fontSize: 12,
        fontWeight: '600',
        color: '#64748B',
        backgroundColor: '#fff',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    summaryStats: {
        flexDirection: 'row',
        gap: 12,
    },
    statItem: {
        flex: 1,
        backgroundColor: '#DCFCE7',
        borderRadius: 10,
        padding: 12,
        alignItems: 'center',
    },
    statItemRed: {
        backgroundColor: '#FEE2E2',
    },
    statItemOrange: {
        backgroundColor: '#FEF3C7',
    },
    statValue: {
        fontSize: 20,
        fontWeight: '800',
        color: '#16A34A',
    },
    statValueRed: {
        color: '#EF4444',
    },
    statValueOrange: {
        color: '#D97706',
    },
    statLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748B',
        marginTop: 2,
    },

    // New styles for enhanced UI
    searchSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 10,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#F1F5F9',
    },
    searchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        gap: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: '#0F172A',
        padding: 0,
    },
    markAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#16A34A',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 10,
        gap: 6,
    },
    markAllText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#fff',
    },
    countBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#F8FAFC',
    },
    countText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
    markedText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#16A34A',
    },
    profileImage: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F1F5F9',
    },
    studentDetails: {
        flex: 1,
    },
    studentMeta: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 2,
    },
    metaText: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: '500',
    },
    classText: {
        fontSize: 11,
        color: '#94A3B8',
        marginTop: 2,
    },
    cardPresent: {
        borderColor: '#86EFAC',
        backgroundColor: '#F0FDF4',
    },
    cardAbsent: {
        borderColor: '#FCA5A5',
        backgroundColor: '#FEF2F2',
    },

    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#64748B',
        marginTop: 16,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#94A3B8',
        marginTop: 4,
    },
    footer: {
        padding: 16,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
    },
    submitButton: {
        backgroundColor: '#0068fd',
        borderRadius: 14,
        paddingVertical: 16,
        flexDirection: 'row',
        marginBottom: 20,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    submitText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
});