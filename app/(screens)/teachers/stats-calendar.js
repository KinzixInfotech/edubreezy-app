// Teacher Attendance View with Leave & Regularization
import React, { useState, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, RefreshControl, Dimensions,
    ActivityIndicator, Modal, TextInput, Pressable, Alert
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { z } from 'zod';
import {
    Calendar as CalendarIcon, TrendingUp, Award, AlertCircle, CheckCircle,
    XCircle, Clock, ChevronLeft, ChevronRight, ArrowLeft, Sparkles,
    BarChart3, FileText, Send, X as CloseIcon, AlertTriangle, Info,
    ChevronRight as ChevronRightIcon, Umbrella
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { LineChart } from 'react-native-chart-kit';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';

// Validation Schemas
const leaveSchema = z.object({
    leaveType: z.enum(['CASUAL', 'SICK', 'EARNED', 'EMERGENCY']),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    reason: z.string().min(10, 'Reason must be at least 10 characters'),
    emergencyContact: z.string().optional(),
    emergencyContactPhone: z.string().optional(),
}).refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
    message: "End date must be after start date",
    path: ["endDate"],
});

const regularizationSchema = z.object({
    date: z.string().min(1, 'Date is required'),
    requestedStatus: z.enum(['PRESENT', 'HALF_DAY', 'ON_LEAVE']),
    reason: z.string().min(15, 'Reason must be at least 15 characters'),
}).refine((data) => new Date(data.date) < new Date(), {
    message: "Can only regularize past dates",
    path: ["date"],
});

const getISTDateString = (dateInput = new Date()) => {
    let date;
    if (typeof dateInput === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return dateInput;
        date = new Date(dateInput);
    } else {
        date = new Date(dateInput);
    }
    if (isNaN(date.getTime())) return null;
    const offset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + offset);
    return istDate.toISOString().split('T')[0];
};

// const formatIST = (dateString) => {
//     return new Date(dateString).toLocaleDateString('en-IN', {
//         timeZone: 'Asia/Kolkata',
//         day: 'numeric',
//         month: 'short',
//         year: 'numeric'
//     });
// };

// const formatISTTime = (dateString) => {
//     if (!dateString) return '';
//     return new Date(dateString).toLocaleTimeString('en-IN', {
//         timeZone: 'Asia/Kolkata',
//         hour: '2-digit',
//         minute: '2-digit',
//         hour12: true
//     });
// };

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_WIDTH = SCREEN_WIDTH - 32;
const CALENDAR_DAY_SIZE = CALENDAR_WIDTH / 7;

export default function TeacherAttendanceView() {
    const params = useLocalSearchParams();
    const teacherData = params.teacherData ? JSON.parse(params.teacherData) : null;

    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [graphPeriod, setGraphPeriod] = useState('30d');
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        const offset = 5.5 * 60 * 60 * 1000;
        const ist = new Date(now.getTime() + offset);
        return new Date(ist.getFullYear(), ist.getMonth(), 1);
    });

    // Modal States
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [showRegularizationModal, setShowRegularizationModal] = useState(false);
    const [showStartDatePicker, setShowStartDatePicker] = useState(false);
    const [showEndDatePicker, setShowEndDatePicker] = useState(false);
    const [showRegDatePicker, setShowRegDatePicker] = useState(false);
    const [errors, setErrors] = useState({});

    const [leaveForm, setLeaveForm] = useState({
        leaveType: 'CASUAL',
        startDate: '',
        endDate: '',
        reason: '',
        emergencyContact: '',
        emergencyContactPhone: ''
    });

    const [regularizationForm, setRegularizationForm] = useState({
        date: '',
        requestedStatus: 'PRESENT',
        reason: ''
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
    const teacherId = teacherData?.userId;

    // Fetch attendance stats
    const { data: statsData, isLoading } = useQuery({
        queryKey: ['teacher-attendance-stats', teacherId, currentMonth],
        queryFn: async () => {
            if (!teacherId) return null;
            const month = currentMonth.getMonth() + 1;
            const year = currentMonth.getFullYear();
            const res = await api.get(
                `/schools/${schoolId}/attendance/stats?userId=${teacherId}&month=${month}&year=${year}`
            );
            return res.data;
        },
        enabled: !!teacherId && !!schoolId,
        staleTime: 1000 * 60 * 2,
    });

    // Fetch leave requests
    const { data: leaveData } = useQuery({
        queryKey: ['teacher-leave-requests', teacherId, schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/attendance/admin/leave-management?userId=${teacherId}&status=PENDING,APPROVED,REJECTED`);
            return res.data;
        },
        enabled: !!teacherId && !!schoolId,
    });

    // Fetch regularization requests
    const { data: regData } = useQuery({
        queryKey: ['teacher-regularization-requests', teacherId, schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/attendance/admin/regularization?userId=${teacherId}&status=PENDING,APPROVED,REJECTED`);
            return res.data;
        },
        enabled: !!teacherId && !!schoolId,
    });

    const stats = statsData?.monthlyStats;
    const recentAttendance = statsData?.recentAttendance || [];
    const streak = statsData?.streak;

    // Check if teacher is on approved leave today
    const isOnLeaveToday = () => {
        if (!leaveData?.leaves) return false;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return leaveData.leaves.some(leave => {
            if (leave.status !== 'APPROVED') return false;

            const startDate = new Date(leave.startDate);
            const endDate = new Date(leave.endDate);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            return today >= startDate && today <= endDate;
        });
    };

    // Get today's leave details if on leave
    const getTodayLeaveDetails = () => {
        if (!leaveData?.leaves) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return leaveData.leaves.find(leave => {
            if (leave.status !== 'APPROVED') return false;

            const startDate = new Date(leave.startDate);
            const endDate = new Date(leave.endDate);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            return today >= startDate && today <= endDate;
        });
    };

    const onLeave = isOnLeaveToday();
    const leaveDetails = getTodayLeaveDetails();

    // Leave mutation
    const leaveRequestMutation = useMutation({
        mutationFn: async (data) => {
            return await api.put(`/schools/${schoolId}/attendance/admin/leave-management`, data);
        },
        onSuccess: () => {
            Alert.alert('Success', 'Leave request submitted successfully');
            setShowLeaveModal(false);
            setLeaveForm({
                leaveType: 'CASUAL',
                startDate: '',
                endDate: '',
                reason: '',
                emergencyContact: '',
                emergencyContactPhone: ''
            });
            setErrors({});
            queryClient.invalidateQueries({ queryKey: ['teacher-leave-requests'] });
            queryClient.invalidateQueries({ queryKey: ['teacher-attendance-stats'] });
        },
        onError: (err) => {
            Alert.alert('Failed', err.response?.data?.error || 'Failed to submit leave request');
        }
    });

    // Regularization mutation
    const regularizationMutation = useMutation({
        mutationFn: async (data) => {
            return await api.put(`/schools/${schoolId}/attendance/admin/regularization`, data);
        },
        onSuccess: () => {
            Alert.alert('Success', 'Regularization request submitted successfully');
            setShowRegularizationModal(false);
            setRegularizationForm({
                date: '',
                requestedStatus: 'PRESENT',
                reason: ''
            });
            setErrors({});
            queryClient.invalidateQueries({ queryKey: ['teacher-regularization-requests'] });
        },
        onError: (err) => {
            Alert.alert('Failed', err.response?.data?.error || 'Failed to submit regularization');
        }
    });

    const handleLeaveSubmit = () => {
        try {
            leaveSchema.parse(leaveForm);
            setErrors({});

            const start = new Date(leaveForm.startDate);
            const end = new Date(leaveForm.endDate);
            const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

            leaveRequestMutation.mutate({
                userId: teacherId,
                ...leaveForm,
                totalDays
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                const fieldErrors = {};
                error.errors.forEach((err) => {
                    fieldErrors[err.path[0]] = err.message;
                });
                setErrors(fieldErrors);
                Alert.alert('Validation Error', Object.values(fieldErrors)[0]);
            }
        }
    };

    const handleRegularizationSubmit = () => {
        try {
            regularizationSchema.parse(regularizationForm);
            setErrors({});

            regularizationMutation.mutate({
                userId: teacherId,
                ...regularizationForm
            });
        } catch (error) {
            if (error instanceof z.ZodError) {
                const fieldErrors = {};
                error.errors.forEach((err) => {
                    fieldErrors[err.path[0]] = err.message;
                });
                setErrors(fieldErrors);
                Alert.alert('Validation Error', Object.values(fieldErrors)[0]);
            }
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return 'Select date';
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'APPROVED': return '#10B981';
            case 'REJECTED': return '#EF4444';
            case 'PENDING': return '#F59E0B';
            case 'CANCELLED': return '#6B7280';
            default: return '#6B7280';
        }
    };

    const getStatusBg = (status) => {
        switch (status) {
            case 'APPROVED': return '#D1FAE5';
            case 'REJECTED': return '#FEE2E2';
            case 'PENDING': return '#FEF3C7';
            case 'CANCELLED': return '#F3F4F6';
            default: return '#F3F4F6';
        }
    };

    // Calendar days
    const calendarDays = useMemo(() => {
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
            const dayData = recentAttendance.find(record => {
                return getISTDateString(record.date) === dateStr;
            });

            days.push({
                date: i,
                fullDate: dateStr,
                isToday: dateStr === todayIST,
                attendance: dayData
            });
        }

        return days;
    }, [currentMonth, recentAttendance]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['teacher-attendance-stats']),
            queryClient.invalidateQueries(['teacher-leave-requests']),
            queryClient.invalidateQueries(['teacher-regularization-requests'])
        ]);
        setRefreshing(false);
    }, []);

    const getAttendanceStatusColor = (status) => {
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
        return getAttendanceStatusColor(dayData.attendance.status);
    };

    if (!teacherData) {
        return (
            <View style={styles.loaderContainer}>
                <AlertCircle size={48} color="#999" />
                <Text style={styles.noDataText}>No teacher selected</Text>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButtonCenter}>
                        <Text style={styles.backButtonText}>Go Back</Text>
                    </View>
                </HapticTouchable>
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
                    <Text style={styles.headerTitle}>Attendance</Text>
                    <Text style={styles.headerSubtitle}>
                        {teacherData.name} - {teacherData.designation}
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
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                    </View>
                ) : !stats ? (
                    <Animated.View entering={FadeInDown.delay(300)} style={styles.noDataCard}>
                        <AlertCircle size={48} color="#999" />
                        <Text style={styles.noDataText}>No attendance data available</Text>
                    </Animated.View>
                ) : (
                    <>
                        {/* On Leave Alert */}
                        {onLeave && leaveDetails && (
                            <Animated.View entering={FadeInDown.delay(200)} style={styles.leaveCard}>
                                <Umbrella size={28} color="#3B82F6" />
                                <View style={styles.leaveContent}>
                                    <Text style={styles.leaveTitle}>On Leave Today</Text>
                                    <Text style={styles.leaveSubtitle}>
                                        {leaveDetails.leaveType} Leave • {new Date(leaveDetails.startDate).toLocaleDateString('en-IN')} - {new Date(leaveDetails.endDate).toLocaleDateString('en-IN')}
                                    </Text>
                                    <Text style={styles.leaveReason} numberOfLines={2}>{leaveDetails.reason}</Text>
                                </View>
                            </Animated.View>
                        )}

                        {/* Stats Cards */}
                        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                            <View style={styles.summaryGrid}>
                                <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
                                    <TrendingUp size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>{Math.round(stats.attendancePercentage)}%</Text>
                                    <Text style={styles.summaryLabel}>Attendance</Text>
                                </LinearGradient>

                                <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
                                    <CheckCircle size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>{stats.totalPresent}</Text>
                                    <Text style={styles.summaryLabel}>Present</Text>
                                </LinearGradient>

                                <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
                                    <XCircle size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>{stats.totalAbsent}</Text>
                                    <Text style={styles.summaryLabel}>Absent</Text>
                                </LinearGradient>
                            </View>
                        </Animated.View>

                        {/* Leave & Regularization Buttons */}
                        <Animated.View entering={FadeInDown.delay(350).duration(500)} style={styles.secondaryActions}>
                            <Pressable
                                style={styles.secondaryButton}
                                onPress={() => setShowLeaveModal(true)}
                            >
                                <FileText size={20} color="#3B82F6" />
                                <Text style={styles.secondaryButtonText}>Apply Leave</Text>
                            </Pressable>

                            <Pressable
                                style={styles.secondaryButton}
                                onPress={() => setShowRegularizationModal(true)}
                            >
                                <AlertCircle size={20} color="#F59E0B" />
                                <Text style={styles.secondaryButtonText}>Regularize</Text>
                            </Pressable>
                        </Animated.View>

                        {/* Calendar Section */}
                        <Animated.View entering={FadeInDown.delay(600).duration(500)} style={styles.calendarCard}>
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
                                    const isWeekend = new Date(day.fullDate).getDay() === 0 || new Date(day.fullDate).getDay() === 6;
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
                                                                { backgroundColor: getAttendanceStatusColor(day.attendance.status) }
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
                        </Animated.View>

                        {/* Leave Requests */}
                        {leaveData?.leaves && leaveData.leaves.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(400)} style={styles.requestSection}>
                                <Text style={styles.sectionTitle}>Leave Requests</Text>
                                <View style={{ marginTop: 20 }}>
                                    {leaveData.leaves.map((leave) => (
                                        <View key={leave.id} style={styles.requestCard}>
                                            <View style={styles.requestHeader}>
                                                <View style={[styles.statusBadge, { backgroundColor: getStatusBg(leave.status) }]}>
                                                    <Text style={[styles.statusBadgeText, { color: getStatusColor(leave.status) }]}>
                                                        {leave.status}
                                                    </Text>
                                                </View>
                                                <Text style={styles.leaveType}>{leave.leaveType}</Text>
                                            </View>
                                            <View style={styles.requestBody}>
                                                <View style={styles.requestRow}>
                                                    <CalendarIcon size={16} color="#666" />
                                                    <Text style={styles.requestDate}>
                                                        {new Date(leave.startDate).toLocaleDateString('en-IN')} - {new Date(leave.endDate).toLocaleDateString('en-IN')}
                                                    </Text>
                                                    <Text style={styles.requestDays}>({leave.totalDays} days)</Text>
                                                </View>
                                                <Text style={styles.requestReason} numberOfLines={2}>{leave.reason}</Text>
                                                {leave.status === 'REJECTED' && leave.reviewRemarks && (
                                                    <View style={styles.remarksBox}>
                                                        <AlertTriangle size={14} color="#EF4444" />
                                                        <Text style={styles.remarksText}>{leave.reviewRemarks}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </Animated.View>
                        )}

                        {/* Regularization Requests */}
                        {regData?.requests && regData.requests.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(450)} style={styles.requestSection}>
                                <Text style={styles.sectionTitle}>Regularization Requests</Text>
                                <View style={{ marginTop: 20 }}>
                                    {regData.requests.map((req) => (
                                        <View key={req.id} style={styles.requestCard}>
                                            <View style={styles.requestHeader}>
                                                <View style={[styles.statusBadge, { backgroundColor: getStatusBg(req.approvalStatus) }]}>
                                                    <Text style={[styles.statusBadgeText, { color: getStatusColor(req.approvalStatus) }]}>
                                                        {req.approvalStatus}
                                                    </Text>
                                                </View>
                                                <Text style={styles.leaveType}>{req.status}</Text>
                                            </View>
                                            <View style={styles.requestBody}>
                                                <View style={styles.requestRow}>
                                                    <CalendarIcon size={16} color="#666" />
                                                    <Text style={styles.requestDate}>
                                                        {new Date(req.date).toLocaleDateString('en-IN')}
                                                    </Text>
                                                    <Text style={styles.requestDays}>({req.daysOld} days ago)</Text>
                                                </View>
                                                <Text style={styles.requestReason} numberOfLines={2}>{req.remarks}</Text>
                                                {req.approvalStatus === 'REJECTED' && req.approvalRemarks && (
                                                    <View style={styles.remarksBox}>
                                                        <AlertTriangle size={14} color="#EF4444" />
                                                        <Text style={styles.remarksText}>{req.approvalRemarks}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </Animated.View>
                        )}

                        <View style={{ height: 40 }} />
                    </>
                )}
            </ScrollView>

            {/* Leave Request Modal */}
            <Modal
                visible={showLeaveModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowLeaveModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Apply for Leave</Text>
                            <Pressable onPress={() => setShowLeaveModal(false)}>
                                <CloseIcon size={24} color="#666" />
                            </Pressable>
                        </View>

                        <ScrollView style={styles.modalForm} contentContainerStyle={{ paddingBottom: 30 }}>
                            <Text style={styles.inputLabel}>Leave Type</Text>
                            <View style={styles.pickerContainer}>
                                {['CASUAL', 'SICK', 'EARNED', 'EMERGENCY'].map((type) => (
                                    <Pressable
                                        key={type}
                                        style={[
                                            styles.pickerOption,
                                            leaveForm.leaveType === type && styles.pickerOptionActive
                                        ]}
                                        onPress={() => setLeaveForm({ ...leaveForm, leaveType: type })}
                                    >
                                        <Text style={[
                                            styles.pickerOptionText,
                                            leaveForm.leaveType === type && styles.pickerOptionTextActive
                                        ]}>
                                            {type}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            <Text style={styles.inputLabel}>Start Date *</Text>
                            <Pressable
                                style={[styles.dateInput, errors.startDate && styles.inputError]}
                                onPress={() => setShowStartDatePicker(true)}
                            >
                                <CalendarIcon size={18} color="#666" />
                                <Text style={styles.dateText}>{formatDate(leaveForm.startDate)}</Text>
                                <ChevronRightIcon size={18} color="#666" />
                            </Pressable>
                            {errors.startDate && <Text style={styles.errorText}>{errors.startDate}</Text>}

                            {showStartDatePicker && (
                                <DateTimePicker
                                    value={leaveForm.startDate ? new Date(leaveForm.startDate) : new Date()}
                                    mode="date"
                                    display="default"
                                    onChange={(event, selectedDate) => {
                                        setShowStartDatePicker(false);
                                        if (selectedDate) {
                                            setLeaveForm({ ...leaveForm, startDate: selectedDate.toISOString().split('T')[0] });
                                        }
                                    }}
                                />
                            )}

                            <Text style={styles.inputLabel}>End Date *</Text>
                            <Pressable
                                style={[styles.dateInput, errors.endDate && styles.inputError]}
                                onPress={() => setShowEndDatePicker(true)}
                            >
                                <CalendarIcon size={18} color="#666" />
                                <Text style={styles.dateText}>{formatDate(leaveForm.endDate)}</Text>
                                <ChevronRightIcon size={18} color="#666" />
                            </Pressable>
                            {errors.endDate && <Text style={styles.errorText}>{errors.endDate}</Text>}

                            {showEndDatePicker && (
                                <DateTimePicker
                                    value={leaveForm.endDate ? new Date(leaveForm.endDate) : new Date()}
                                    mode="date"
                                    display="default"
                                    minimumDate={leaveForm.startDate ? new Date(leaveForm.startDate) : new Date()}
                                    onChange={(event, selectedDate) => {
                                        setShowEndDatePicker(false);
                                        if (selectedDate) {
                                            setLeaveForm({ ...leaveForm, endDate: selectedDate.toISOString().split('T')[0] });
                                        }
                                    }}
                                />
                            )}

                            <Text style={styles.inputLabel}>Reason *</Text>
                            <TextInput
                                style={[styles.input, styles.textArea, errors.reason && styles.inputError]}
                                placeholder="Enter reason for leave (min 10 characters)"
                                value={leaveForm.reason}
                                placeholderTextColor={'gray'}
                                onChangeText={(text) => setLeaveForm({ ...leaveForm, reason: text })}
                                multiline
                                numberOfLines={4}
                            />
                            {errors.reason && <Text style={styles.errorText}>{errors.reason}</Text>}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <Pressable
                                style={[styles.modalButton, styles.modalButtonSecondary]}
                                onPress={() => {
                                    setShowLeaveModal(false);
                                    setErrors({});
                                }}
                            >
                                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.modalButton, styles.modalButtonPrimary]}
                                onPress={handleLeaveSubmit}
                                disabled={leaveRequestMutation.isPending}
                            >
                                {leaveRequestMutation.isPending ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Send size={18} color="#fff" />
                                        <Text style={styles.modalButtonTextPrimary}>Submit</Text>
                                    </>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Regularization Modal */}
            <Modal
                visible={showRegularizationModal}
                transparent
                animationType="slide"
                onRequestClose={() => setShowRegularizationModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Attendance Regularization</Text>
                            <Pressable onPress={() => setShowRegularizationModal(false)}>
                                <CloseIcon size={24} color="#666" />
                            </Pressable>
                        </View>

                        <ScrollView style={styles.modalForm}>
                            <View style={styles.infoBox}>
                                <Info size={18} color="#3B82F6" />
                                <Text style={styles.infoBoxText}>
                                    Request to regularize past attendance records. This requires admin approval.
                                </Text>
                            </View>

                            <Text style={styles.inputLabel}>Date *</Text>
                            <Pressable
                                style={[styles.dateInput, errors.date && styles.inputError]}
                                onPress={() => setShowRegDatePicker(true)}
                            >
                                <CalendarIcon size={18} color="#666" />
                                <Text style={styles.dateText}>{formatDate(regularizationForm.date)}</Text>
                                <ChevronRightIcon size={18} color="#666" />
                            </Pressable>
                            {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}

                            {showRegDatePicker && (
                                <DateTimePicker
                                    value={regularizationForm.date ? new Date(regularizationForm.date) : new Date()}
                                    mode="date"
                                    display="default"
                                    maximumDate={new Date(Date.now() - 86400000)}
                                    onChange={(event, selectedDate) => {
                                        setShowRegDatePicker(false);
                                        if (selectedDate) {
                                            setRegularizationForm({ ...regularizationForm, date: selectedDate.toISOString().split('T')[0] });
                                        }
                                    }}
                                />
                            )}

                            <Text style={styles.inputLabel}>Requested Status</Text>
                            <View style={styles.pickerContainer}>
                                {['PRESENT', 'HALF_DAY', 'ON_LEAVE'].map((status) => (
                                    <Pressable
                                        key={status}
                                        style={[
                                            styles.pickerOption,
                                            regularizationForm.requestedStatus === status && styles.pickerOptionActive
                                        ]}
                                        onPress={() => setRegularizationForm({ ...regularizationForm, requestedStatus: status })}
                                    >
                                        <Text style={[
                                            styles.pickerOptionText,
                                            regularizationForm.requestedStatus === status && styles.pickerOptionTextActive
                                        ]}>
                                            {status.replace('_', ' ')}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>

                            <Text style={styles.inputLabel}>Reason *</Text>
                            <TextInput
                                style={[styles.input, styles.textArea, errors.reason && styles.inputError]}
                                placeholder="Explain why regularization is needed (min 15 characters)"
                                value={regularizationForm.reason}
                                onChangeText={(text) => setRegularizationForm({ ...regularizationForm, reason: text })}
                                multiline
                                placeholderTextColor={'gray'}
                                numberOfLines={4}
                            />
                            {errors.reason && <Text style={styles.errorText}>{errors.reason}</Text>}
                        </ScrollView>

                        <View style={styles.modalActions}>
                            <Pressable
                                style={[styles.modalButton, styles.modalButtonSecondary]}
                                onPress={() => {
                                    setShowRegularizationModal(false);
                                    setErrors({});
                                }}
                            >
                                <Text style={styles.modalButtonTextSecondary}>Cancel</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.modalButton, styles.modalButtonPrimary]}
                                onPress={handleRegularizationSubmit}
                                disabled={regularizationMutation.isPending}
                            >
                                {regularizationMutation.isPending ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <Send size={18} color="#fff" />
                                        <Text style={styles.modalButtonTextPrimary}>Submit</Text>
                                    </>
                                )}
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
    backButtonCenter: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#0469ff', borderRadius: 12 },
    backButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
    content: { flex: 1, padding: 16 },
    loadingContainer: { padding: 40, alignItems: 'center' },
    noDataCard: { padding: 40, alignItems: 'center', gap: 12, backgroundColor: '#f8f9fa', borderRadius: 16, marginTop: 20 },
    noDataText: { fontSize: 16, color: '#999' },

    leaveCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 16, padding: 20, backgroundColor: '#EFF6FF', borderRadius: 20, borderWidth: 2, borderColor: '#BFDBFE' },
    leaveContent: { flex: 1 },
    leaveTitle: { fontSize: 18, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },
    leaveSubtitle: { fontSize: 14, color: '#3B82F6', marginBottom: 8, fontWeight: '500' },
    leaveReason: { fontSize: 14, color: '#1E40AF', lineHeight: 20 },

    summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    summaryCard: { flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', gap: 8 },
    summaryValue: { fontSize: 20, fontWeight: '700', color: '#fff' },
    summaryLabel: { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },

    secondaryActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
    secondaryButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 2, borderColor: '#E2E8F0' },
    secondaryButtonText: { fontSize: 14, fontWeight: '600', color: '#111' },

    requestSection: { marginBottom: 16 },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 12 },
    requestCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
    requestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    statusBadgeText: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    leaveType: { fontSize: 13, fontWeight: '600', color: '#666' },
    requestBody: { gap: 8 },
    requestRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    requestDate: { fontSize: 14, color: '#111', fontWeight: '500' },
    requestDays: { fontSize: 13, color: '#666' },
    requestReason: { fontSize: 14, color: '#666', lineHeight: 20 },
    remarksBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, backgroundColor: '#FEE2E2', borderRadius: 8, marginTop: 4 },
    remarksText: { flex: 1, fontSize: 13, color: '#991B1B' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    modalTitle: { fontSize: 20, fontWeight: '700', color: '#111' },
    modalForm: { padding: 20, maxHeight: 500 },
    inputLabel: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 8, marginTop: 12 },
    input: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#E2E8F0' },
    inputError: { borderColor: '#EF4444', borderWidth: 2 },
    textArea: { height: 100, textAlignVertical: 'top' },
    dateInput: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8F9FA', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
    dateText: { flex: 1, fontSize: 15, color: '#111' },
    pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    pickerOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 2, borderColor: '#E2E8F0', backgroundColor: '#fff' },
    pickerOptionActive: { borderColor: '#0469ff', backgroundColor: '#EEF2FF' },
    pickerOptionText: { fontSize: 13, fontWeight: '600', color: '#666' },
    pickerOptionTextActive: { color: '#0469ff' },
    infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, backgroundColor: '#EEF2FF', borderRadius: 12, marginBottom: 16 },
    infoBoxText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 18 },
    modalActions: { flexDirection: 'row', gap: 12, padding: 20, marginBottom: 20, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    modalButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
    modalButtonSecondary: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
    modalButtonPrimary: { backgroundColor: '#0469ff' },
    modalButtonTextSecondary: { fontSize: 16, fontWeight: '600', color: '#475569' },
    modalButtonTextPrimary: { fontSize: 16, fontWeight: '700', color: '#fff' },
    errorText: { fontSize: 12, color: '#EF4444', marginTop: 4 },

    calendarCard: { padding: 16, backgroundColor: '#fff', borderRadius: 16, marginBottom: 16 },
    calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
    calendarTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
    calendarControls: { flexDirection: 'row', gap: 8 },
    todayButton: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#E3F2FD', borderRadius: 8 },
    todayButtonText: { fontSize: 13, fontWeight: '600', color: '#0469ff' },
    navButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    weekdayHeader: { flexDirection: 'row', marginBottom: 8 },
    weekdayCell: { width: CALENDAR_DAY_SIZE, alignItems: 'center', paddingVertical: 8 },
    weekendHeader: { backgroundColor: '#f8f9fa' },
    weekdayText: { fontSize: 12, fontWeight: '600', color: '#666' },
    calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    dayCell: { width: CALENDAR_DAY_SIZE - 5, height: CALENDAR_DAY_SIZE * 0.85, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderRadius: 7, borderColor: 'transparent' },
    otherMonthDay: { opacity: 0 },
    dayText: { fontSize: 14, fontWeight: '600', color: '#111', marginBottom: 4 },
    todayText: { color: '#0469ff', fontWeight: '700' },
    eventIndicators: { flexDirection: 'row', gap: 2, marginTop: 2 },
    eventDot: { width: 6, height: 6, borderRadius: 3 },
    legend: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 12, height: 12, borderRadius: 6 },
    legendText: { fontSize: 11, color: '#666', fontWeight: '600' },
});