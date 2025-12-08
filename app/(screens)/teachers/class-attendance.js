// app/(screens)/teachers/class-attendance.js
// Teacher view for viewing class students' attendance
import React, { useState, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Dimensions,
    ActivityIndicator,
    TextInput,
    Modal,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    Calendar as CalendarIcon,
    TrendingUp,
    Award,
    AlertCircle,
    CheckCircle,
    XCircle,
    Clock,
    ChevronLeft,
    ChevronRight,
    ArrowLeft,
    Search,
    Users,
    BarChart3,
    X as CloseIcon,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { LineChart } from 'react-native-chart-kit';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';

const getISTDateString = (dateInput = new Date()) => {
    let date;
    if (typeof dateInput === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            return dateInput;
        }
        date = new Date(dateInput);
    } else {
        date = new Date(dateInput);
    }
    if (isNaN(date.getTime())) return null;
    const offset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + offset);
    return istDate.toISOString().split('T')[0];
};

const formatIST = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

const formatISTTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_WIDTH = SCREEN_WIDTH - 32;
const CALENDAR_DAY_SIZE = CALENDAR_WIDTH / 7;

export default function TeacherClassAttendance() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [showStudentModal, setShowStudentModal] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        const offset = 5.5 * 60 * 60 * 1000;
        const ist = new Date(now.getTime() + offset);
        return new Date(ist.getFullYear(), ist.getMonth(), 1);
    });

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

    // Fetch teacher's students
    const { data: studentsData, isLoading: studentsLoading } = useQuery({
        queryKey: ['teacher-students', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return null;
            const res = await api.get(
                `/schools/${schoolId}/teachers/${teacherId}/students`
            );
            return res.data;
        },
        enabled: !!schoolId && !!teacherId,
        staleTime: 1000 * 60 * 5,
    });

    // Fetch class-level attendance stats
    const { data: classStatsData } = useQuery({
        queryKey: ['class-attendance-stats', schoolId, teacherId, currentMonth],
        queryFn: async () => {
            if (!schoolId || !teacherId) return null;
            const month = currentMonth.getMonth() + 1;
            const year = currentMonth.getFullYear();
            const res = await api.get(
                `/schools/${schoolId}/teachers/${teacherId}/attendance-stats?month=${month}&year=${year}`
            );
            return res.data;
        },
        enabled: !!schoolId && !!teacherId,
        staleTime: 1000 * 60 * 2,
    });

    // Fetch selected student's attendance details for current month
    const { data: studentStatsData, isLoading: studentStatsLoading } = useQuery({
        queryKey: ['student-attendance-detail', selectedStudent?.id, currentMonth.getMonth(), currentMonth.getFullYear()],
        queryFn: async () => {
            if (!selectedStudent?.id) return null;
            const month = currentMonth.getMonth() + 1;
            const year = currentMonth.getFullYear();
            const res = await api.get(
                `/schools/${schoolId}/attendance/stats?userId=${selectedStudent?.id}&month=${month}&year=${year}`
            );
            return res.data;
        },
        enabled: !!selectedStudent?.id && !!schoolId,
        staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    });

    const students = studentsData?.students || [];
    const classStats = classStatsData?.classStats;
    const studentDetailStats = studentStatsData?.monthlyStats;
    const studentRecentAttendance = studentStatsData?.recentAttendance || [];

    // Filter students by search query
    const filteredStudents = useMemo(() => {
        if (!searchQuery.trim()) return students;
        const query = searchQuery.toLowerCase();
        return students.filter(student =>
            student.name.toLowerCase().includes(query) ||
            student.rollNumber?.toString().includes(query)
        );
    }, [students, searchQuery]);

    // Calendar days generation for selected student
    const calendarDays = useMemo(() => {
        if (!selectedStudent) return [];

        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const days = [];
        const firstDay = new Date(year, month, 1);

        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push({ date: null, isOtherMonth: true });
        }

        const todayIST = getISTDateString();

        for (let i = 1; i <= 31; i++) {
            if (i > new Date(year, month + 1, 0).getDate()) break;

            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayData = studentRecentAttendance.find(record => {
                const serverDate = record.date;
                if (!serverDate) return false;
                if (serverDate === dateStr) return true;
                if (typeof serverDate === 'string' && serverDate.includes('T')) {
                    return getISTDateString(serverDate) === dateStr;
                }
                try {
                    return getISTDateString(serverDate) === dateStr;
                } catch (e) {
                    return false;
                }
            });

            days.push({
                date: i,
                fullDate: dateStr,
                isToday: dateStr === todayIST,
                attendance: dayData
            });
        }

        return days;
    }, [currentMonth, studentRecentAttendance, selectedStudent]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['teacher-students']),
            queryClient.invalidateQueries(['class-attendance-stats']),
            queryClient.invalidateQueries(['student-attendance-detail']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'PRESENT': return '#51CF66';
            case 'ABSENT': return '#FF6B6B';
            case 'LATE': return '#FFB020';
            case 'HALF_DAY': return '#FF8C42';
            case 'ON_LEAVE': return '#8B5CF6';
            default: return '#94A3B8';
        }
    };

    const getDayBorderColor = (dayData) => {
        if (!dayData?.attendance) return 'transparent';
        const status = dayData.attendance.status;
        if (status === 'PRESENT') return '#51CF66';
        if (status === 'ABSENT') return '#FF6B6B';
        if (status === 'LATE') return '#FFB020';
        if (status === 'HALF_DAY') return '#FF8C42';
        if (status === 'ON_LEAVE') return '#8B5CF6';
        return 'transparent';
    };

    const openStudentDetail = (student) => {
        setSelectedStudent(student);
        setShowStudentModal(true);
    };

    const closeStudentDetail = () => {
        setSelectedStudent(null);
        setShowStudentModal(false);
    };

    if (studentsLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loaderText}>Loading students...</Text>
            </View>
        );
    }

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
                    <Text style={styles.headerTitle}>Class Attendance</Text>
                    <Text style={styles.headerSubtitle}>
                        {students.length} Student{students.length !== 1 ? 's' : ''}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
            >
                {/* Class Stats */}
                {classStats && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.summaryGrid}>
                            <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
                                <TrendingUp size={24} color="#fff" />
                                <Text style={styles.summaryValue}>{Math.round(classStats.averageAttendance || 0)}%</Text>
                                <Text style={styles.summaryLabel}>Class Avg</Text>
                            </LinearGradient>

                            <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
                                <CheckCircle size={24} color="#fff" />
                                <Text style={styles.summaryValue}>{classStats.totalPresent || 0}</Text>
                                <Text style={styles.summaryLabel}>Present</Text>
                            </LinearGradient>

                            <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
                                <XCircle size={24} color="#fff" />
                                <Text style={styles.summaryValue}>{classStats.totalAbsent || 0}</Text>
                                <Text style={styles.summaryLabel}>Absent</Text>
                            </LinearGradient>
                        </View>
                    </Animated.View>
                )}

                {/* Search Bar */}
                <Animated.View entering={FadeInDown.delay(300).duration(400)}>
                    <View style={styles.searchContainer}>
                        <Search size={18} color="#9CA3AF" />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Search by name or roll number..."
                            placeholderTextColor="#9CA3AF"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                        />
                        {searchQuery.length > 0 && (
                            <HapticTouchable onPress={() => setSearchQuery('')}>
                                <CloseIcon size={18} color="#9CA3AF" />
                            </HapticTouchable>
                        )}
                    </View>
                </Animated.View>

                {/* Student List */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Students</Text>
                    <Text style={styles.studentCount}>{filteredStudents.length}</Text>
                </View>

                {filteredStudents.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Users size={48} color="#ccc" />
                        <Text style={styles.emptyText}>
                            {searchQuery ? 'No students found' : 'No students in your class'}
                        </Text>
                    </View>
                ) : (
                    filteredStudents.map((student, idx) => (
                        <Animated.View key={student.id} entering={FadeInRight.delay(400 + idx * 50)}>
                            <HapticTouchable onPress={() => openStudentDetail(student)}>
                                <View style={styles.studentCard}>
                                    <View style={styles.studentAvatar}>
                                        <Text style={styles.studentInitial}>
                                            {student.name.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                    <View style={styles.studentInfo}>
                                        <Text style={styles.studentName}>{student.name}</Text>
                                        <Text style={styles.studentMeta}>
                                            Roll No: {student.rollNumber || 'N/A'}
                                        </Text>
                                    </View>
                                    <View style={styles.studentStats}>
                                        <Text style={[
                                            styles.attendancePercent,
                                            { color: (student.attendancePercent || 0) >= 75 ? '#51CF66' : '#FF6B6B' }
                                        ]}>
                                            {Math.round(student.attendancePercent || 0)}%
                                        </Text>
                                        <Text style={styles.attendanceLabel}>Attendance</Text>
                                    </View>
                                </View>
                            </HapticTouchable>
                        </Animated.View>
                    ))
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Student Detail Modal */}
            <Modal
                visible={showStudentModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={closeStudentDetail}
            >
                {selectedStudent && (
                    <View style={styles.modalContainer}>
                        {/* Modal Header */}
                        <View style={styles.modalHeader}>
                            <HapticTouchable onPress={closeStudentDetail}>
                                <View style={styles.backButton}>
                                    <ArrowLeft size={24} color="#111" />
                                </View>
                            </HapticTouchable>
                            <View style={styles.headerCenter}>
                                <Text style={styles.headerTitle}>{selectedStudent.name}</Text>
                                <Text style={styles.headerSubtitle}>
                                    Roll No: {selectedStudent.rollNumber || 'N/A'}
                                </Text>
                            </View>
                            <View style={{ width: 40 }} />
                        </View>

                        <ScrollView
                            style={styles.modalContent}
                            showsVerticalScrollIndicator={false}
                            refreshControl={
                                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                            }
                        >
                            {studentStatsLoading ? (
                                <View style={styles.loadingContainer}>
                                    <ActivityIndicator size="large" color="#0469ff" />
                                </View>
                            ) : !studentDetailStats ? (
                                <View style={styles.noDataCard}>
                                    <AlertCircle size={48} color="#999" />
                                    <Text style={styles.noDataText}>No attendance data available</Text>
                                </View>
                            ) : (
                                <>
                                    {/* Student Stats */}
                                    <View style={styles.summaryGrid}>
                                        <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
                                            <TrendingUp size={24} color="#fff" />
                                            <Text style={styles.summaryValue}>
                                                {Math.round(studentDetailStats.attendancePercentage)}%
                                            </Text>
                                            <Text style={styles.summaryLabel}>Attendance</Text>
                                        </LinearGradient>

                                        <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
                                            <CheckCircle size={24} color="#fff" />
                                            <Text style={styles.summaryValue}>{studentDetailStats.totalPresent}</Text>
                                            <Text style={styles.summaryLabel}>Present</Text>
                                        </LinearGradient>

                                        <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
                                            <XCircle size={24} color="#fff" />
                                            <Text style={styles.summaryValue}>{studentDetailStats.totalAbsent}</Text>
                                            <Text style={styles.summaryLabel}>Absent</Text>
                                        </LinearGradient>
                                    </View>

                                    {/* Calendar */}
                                    <View style={styles.sectionHeader}>
                                        <Text style={styles.sectionTitle}>Monthly Overview</Text>
                                    </View>

                                    <View style={styles.calendarCard}>
                                        <View style={styles.calendarHeader}>
                                            <Text style={styles.calendarTitle}>
                                                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                            </Text>

                                            <View style={styles.calendarControls}>
                                                <HapticTouchable onPress={() => {
                                                    const newDate = new Date();
                                                    setCurrentMonth(new Date(newDate.getFullYear(), newDate.getMonth(), 1));
                                                }}>
                                                    <View style={styles.todayButton}>
                                                        <Text style={styles.todayButtonText}>Today</Text>
                                                    </View>
                                                </HapticTouchable>

                                                <HapticTouchable onPress={() => {
                                                    const newDate = new Date(currentMonth);
                                                    newDate.setMonth(newDate.getMonth() - 1);
                                                    setCurrentMonth(newDate);
                                                }}>
                                                    <View style={styles.navButton}>
                                                        <ChevronLeft size={20} color="#666" />
                                                    </View>
                                                </HapticTouchable>

                                                <HapticTouchable onPress={() => {
                                                    const newDate = new Date(currentMonth);
                                                    newDate.setMonth(newDate.getMonth() + 1);
                                                    setCurrentMonth(newDate);
                                                }}>
                                                    <View style={styles.navButton}>
                                                        <ChevronRight size={20} color="#666" />
                                                    </View>
                                                </HapticTouchable>
                                            </View>
                                        </View>

                                        {/* Weekday Headers */}
                                        <View style={styles.weekdayHeader}>
                                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                                <View
                                                    key={idx}
                                                    style={[
                                                        styles.weekdayCell,
                                                        (idx === 0 || idx === 6) && styles.weekendHeader
                                                    ]}
                                                >
                                                    <Text style={styles.weekdayText}>{day}</Text>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Calendar Grid */}
                                        <View style={styles.calendarGrid}>
                                            {calendarDays.map((day, idx) => {
                                                const isWeekend = day.fullDate && (new Date(day.fullDate).getDay() === 0 || new Date(day.fullDate).getDay() === 6);
                                                const borderColor = day.isToday ? '#0469ff' : getDayBorderColor(day);
                                                const bgColor = day.isToday ? '#E3F2FD' : (isWeekend && !day.isOtherMonth ? '#f8f9fa' : '#fff');

                                                return (
                                                    <View
                                                        key={idx}
                                                        style={[
                                                            styles.dayCell,
                                                            day.isOtherMonth && styles.otherMonthDay,
                                                            {
                                                                borderColor: borderColor,
                                                                backgroundColor: bgColor
                                                            }
                                                        ]}
                                                    >
                                                        {!day.isOtherMonth && (
                                                            <>
                                                                <Text style={[
                                                                    styles.dayText,
                                                                    day.isToday && styles.todayText
                                                                ]}>
                                                                    {day.date}
                                                                </Text>
                                                                {day.attendance && (
                                                                    <View style={styles.eventIndicators}>
                                                                        <View style={[
                                                                            styles.eventDot,
                                                                            { backgroundColor: getStatusColor(day.attendance.status) }
                                                                        ]} />
                                                                    </View>
                                                                )}
                                                            </>
                                                        )}
                                                    </View>
                                                );
                                            })}
                                        </View>

                                        {/* Legend */}
                                        <View style={styles.legend}>
                                            <View style={styles.legendItem}>
                                                <View style={[styles.legendDot, { backgroundColor: '#51CF66' }]} />
                                                <Text style={styles.legendText}>Present</Text>
                                            </View>
                                            <View style={styles.legendItem}>
                                                <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
                                                <Text style={styles.legendText}>Absent</Text>
                                            </View>
                                            <View style={styles.legendItem}>
                                                <View style={[styles.legendDot, { backgroundColor: '#FFB020' }]} />
                                                <Text style={styles.legendText}>Late</Text>
                                            </View>
                                            <View style={styles.legendItem}>
                                                <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
                                                <Text style={styles.legendText}>Leave</Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View style={{ height: 40 }} />
                                </>
                            )}
                        </ScrollView>
                    </View>
                )}
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loaderText: {
        fontSize: 16,
        color: '#666',
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
    summaryGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    summaryCard: {
        flex: 1,
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
        gap: 8,
    },
    summaryValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    summaryLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '600',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
        marginBottom: 16,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#111',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    studentCount: {
        fontSize: 14,
        color: '#666',
        fontWeight: '600',
    },
    studentCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    studentAvatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    studentInitial: {
        fontSize: 18,
        fontWeight: '700',
        color: '#0469ff',
    },
    studentInfo: {
        flex: 1,
    },
    studentName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
        marginBottom: 4,
    },
    studentMeta: {
        fontSize: 13,
        color: '#666',
    },
    studentStats: {
        alignItems: 'flex-end',
    },
    attendancePercent: {
        fontSize: 20,
        fontWeight: '700',
    },
    attendanceLabel: {
        fontSize: 11,
        color: '#666',
        marginTop: 2,
    },
    emptyState: {
        paddingVertical: 60,
        alignItems: 'center',
        gap: 12,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
    modalContainer: {
        flex: 1,
        backgroundColor: '#fff',
    },
    modalHeader: {
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
    modalContent: {
        flex: 1,
        padding: 16,
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    noDataCard: {
        padding: 40,
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
    },
    noDataText: {
        fontSize: 16,
        color: '#999',
    },
    calendarCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    calendarTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    calendarControls: {
        flexDirection: 'row',
        gap: 8,
    },
    todayButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#E3F2FD',
        borderRadius: 8,
    },
    todayButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#0469ff',
    },
    navButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekdayHeader: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    weekdayCell: {
        width: CALENDAR_DAY_SIZE,
        height: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekendHeader: {
        backgroundColor: '#f8f9fa',
    },
    weekdayText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: CALENDAR_DAY_SIZE,
        height: CALENDAR_DAY_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#f0f0f0',
        position: 'relative',
    },
    otherMonthDay: {
        opacity: 0,
    },
    dayText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#111',
    },
    todayText: {
        color: '#0469ff',
        fontWeight: '700',
    },
    eventIndicators: {
        position: 'absolute',
        bottom: 4,
        flexDirection: 'row',
        gap: 2,
    },
    eventDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    legend: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    legendText: {
        fontSize: 12,
        color: '#666',
    },
});
