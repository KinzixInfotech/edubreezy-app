import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Pressable, ScrollView, RefreshControl,
    Alert, ActivityIndicator, AppState, Platform, Modal, TextInput
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withTiming, withRepeat } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { z } from 'zod';
import {
    Calendar, Clock, MapPin, CheckCircle, XCircle, Clock4, AlertCircle,
    TrendingUp, Timer, Zap, FileText, Send, X as CloseIcon, AlertTriangle,
    Info, ChevronRight, Umbrella
} from 'lucide-react-native';
import api from '../../../lib/api';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Zod Schemas
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

export default function SelfAttendance() {
    const [user, setUser] = useState(null);
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState(null);
    const [deviceInfo, setDeviceInfo] = useState(null);
    const [liveHours, setLiveHours] = useState(0);
    const pulseAnim = useSharedValue(1);
    const intervalRef = useRef(null);
    const appState = useRef(AppState.currentState);

    // Leave & Regularization Modals
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

    useEffect(() => {
        loadUser();
    }, []);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => subscription.remove();
    }, []);

    const handleAppStateChange = (nextState) => {
        if (appState.current.match(/inactive|background/) && nextState === 'active') {
            queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] });
        }
        appState.current = nextState;
    };

    const loadUser = async () => {
        try {
            const stored = await SecureStore.getItemAsync('user');
            if (stored) setUser(JSON.parse(stored));
        } catch (error) {
            Alert.alert('Error', 'Failed to load user data');
        }
    };

    const userId = user?.id;
    const schoolId = user?.schoolId;
    const isTeacher = user?.role?.name === 'TEACHING_STAFF';

    // Get location & device info
    useEffect(() => {
        if (!userId || !schoolId) return;

        (async () => {
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    setLocationError('Location permission denied');
                    return;
                }

                const loc = await Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.High,
                    timeout: 15000
                });

                setLocation({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    accuracy: loc.coords.accuracy
                });
            } catch (err) {
                setLocationError(err.message || 'Failed to get location');
            }

            setDeviceInfo({
                deviceId: Device.modelName,
                platform: Platform.OS,
                osVersion: Platform.Version,
                appVersion: '1.0.0'
            });
        })();
    }, [userId, schoolId]);

    // Fetch attendance status
    const { data, isLoading, error } = useQuery({
        queryKey: ['self-attendance-status', userId, schoolId],
        queryFn: async () => {
            if (!userId || !schoolId) throw new Error('Missing user or school ID');
            const res = await api.get(`/schools/${schoolId}/attendance/mark?userId=${userId}`);
            return res.data;
        },
        enabled: !!userId && !!schoolId,
        refetchInterval: 30000,
        retry: 2,
    });

    // Fetch leave requests
    const { data: leaveData } = useQuery({
        queryKey: ['leave-requests', userId, schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/attendance/admin/leave-management?userId=${userId}&status=PENDING,APPROVED,REJECTED`);
            return res.data;
        },
        enabled: !!userId && !!schoolId,
    });

    const { attendance, isWorkingDay, dayType, config, windows, monthlyStats } = data || {};

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

    // Live timer effect
    useEffect(() => {
        if (!attendance?.checkInTime) {
            setLiveHours(0);
            return;
        }

        if (attendance?.checkOutTime) {
            setLiveHours(attendance.workingHours || 0);
            if (intervalRef.current) clearInterval(intervalRef.current);
            pulseAnim.value = withTiming(1);
            return;
        }

        if (attendance.liveWorkingHours !== undefined) {
            setLiveHours(attendance.liveWorkingHours);
            pulseAnim.value = withRepeat(withTiming(1.2, { duration: 800 }), -1, true);
        }

        const checkInTime = new Date(attendance.checkInTime).getTime();
        const update = () => {
            const diff = (Date.now() - checkInTime) / (1000 * 60 * 60);
            setLiveHours(Number(diff.toFixed(2)));
        };

        update();
        intervalRef.current = setInterval(update, 1000);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            pulseAnim.value = withTiming(1);
        };
    }, [attendance?.checkInTime, attendance?.checkOutTime, attendance?.liveWorkingHours]);

    const animatedPulse = useAnimatedStyle(() => ({
        transform: [{ scale: pulseAnim.value }],
    }));

    // Check-in mutation
    const checkInMutation = useMutation({
        mutationFn: async () => {
            if (!location) throw new Error('Location not available');
            return await api.post(`/schools/${schoolId}/attendance/mark`, {
                userId,
                type: 'CHECK_IN',
                location,
                deviceInfo
            });
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] });
            if (!res.data.success) {
                Alert.alert('Cannot Check In', res.data.message);
                return;
            }
            Alert.alert(
                res.data.isLate ? 'Checked In (Late)' : 'Checked In',
                res.data.message
            );
        },
        onError: (err) => {
            Alert.alert('Check-In Failed', err.response?.data?.error || err.message);
        }
    });

    // Check-out mutation
    const checkOutMutation = useMutation({
        mutationFn: async () => {
            if (!location) throw new Error('Location not available');
            return await api.post(`/schools/${schoolId}/attendance/mark`, {
                userId,
                type: 'CHECK_OUT',
                location,
                deviceInfo
            });
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] });
            if (!res.data.success) {
                Alert.alert('Cannot Check Out', res.data.message);
                return;
            }
            Alert.alert('Checked Out', res.data.message);
        },
        onError: (err) => {
            Alert.alert('Check-Out Failed', err.response?.data?.error || err.message);
        }
    });

    // Leave request mutation
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
            queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
            queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] });
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
            queryClient.invalidateQueries({ queryKey: ['regularization-requests'] });
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
                userId,
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
                userId,
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

    const onRefresh = async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] }),
            queryClient.invalidateQueries({ queryKey: ['leave-requests'] }),
            queryClient.invalidateQueries({ queryKey: ['regularization-requests'] })
        ]);
        setRefreshing(false);
    };

    const canCheckIn = isWorkingDay && !onLeave && windows?.checkIn?.isOpen && !attendance?.checkInTime;
    const canCheckOut = isWorkingDay && !onLeave && windows?.checkOut?.isOpen && attendance?.checkInTime && !attendance?.checkOutTime;

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

    const getTimeRemaining = (endTime) => {
        if (!endTime) return '';
        const end = new Date(endTime);
        const diff = end - new Date();
        if (diff <= 0) return 'Closed';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${mins}m left`;
    };

    if (!userId || !schoolId || !isTeacher) {
        return (
            <View style={styles.loaderContainer}>
                <AlertCircle size={48} color="#EF4444" />
                <Text style={styles.loaderText}>Only teachers can mark attendance</Text>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loaderText}>Loading...</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
        >
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.headerTitle}>Attendance</Text>
                        <Text style={styles.headerDate}>
                            {new Date().toLocaleDateString('en-US', {
                                weekday: 'long',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </Text>
                    </View>
                    {config?.enableGeoFencing && location && (
                        <View style={styles.locationBadge}>
                            <MapPin size={16} color="#10B981" />
                            <Text style={styles.locationText}>GPS Ready</Text>
                        </View>
                    )}
                </View>
            </Animated.View>

            {/* Location Error */}
            {locationError && (
                <Animated.View entering={FadeInDown.delay(100)} style={styles.errorCard}>
                    <AlertCircle size={20} color="#EF4444" />
                    <Text style={styles.errorCardText}>{locationError}</Text>
                </Animated.View>
            )}

            {/* On Leave Alert */}
            {onLeave && leaveDetails && (
                <Animated.View entering={FadeInDown.delay(200)} style={styles.leaveCard}>
                    <Umbrella size={28} color="#3B82F6" />
                    <View style={styles.leaveContent}>
                        <Text style={styles.leaveTitle}>You're on Leave</Text>
                        <Text style={styles.leaveSubtitle}>
                            {leaveDetails.leaveType} Leave • {new Date(leaveDetails.startDate).toLocaleDateString('en-IN')} - {new Date(leaveDetails.endDate).toLocaleDateString('en-IN')}
                        </Text>
                        <Text style={styles.leaveReason} numberOfLines={2}>{leaveDetails.reason}</Text>
                    </View>
                </Animated.View>
            )}

            {/* Non-Working Day */}
            {!isWorkingDay && !onLeave && (
                <Animated.View entering={FadeInDown.delay(200)} style={styles.alertCard}>
                    <AlertCircle size={24} color="#F59E0B" />
                    <View style={styles.alertContent}>
                        <Text style={styles.alertTitle}>
                            {dayType === 'HOLIDAY' ? `Holiday: ${data?.holidayName}` : dayType}
                        </Text>
                        <Text style={styles.alertMessage}>No attendance required today</Text>
                    </View>
                </Animated.View>
            )}

            {/* Live Timer */}
            {!onLeave && attendance?.checkInTime && !attendance?.checkOutTime && (
                <Animated.View entering={FadeInDown.delay(350)} style={styles.timerCard}>
                    <Animated.View style={[styles.pulseCircle, animatedPulse]} />
                    <View style={styles.timerContent}>
                        <Zap size={28} color="#F59E0B" />
                        <Text style={styles.timerLabel}>Live Working Time</Text>
                        <Text style={styles.timerValue}>{liveHours.toFixed(2)} hrs</Text>
                        <Text style={styles.timerSub}>
                            Since {new Date(attendance.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </View>
                </Animated.View>
            )}

            {/* Status Card */}
            {!onLeave && (
                <Animated.View entering={FadeInDown.delay(400)} style={styles.statusCard}>
                    {!attendance ? (
                        <>
                            <View style={styles.statusIcon}>
                                <Clock size={48} color="#94A3B8" />
                            </View>
                            <Text style={styles.statusTitle}>Not Marked</Text>
                            <Text style={styles.statusSubtitle}>Ready to check in</Text>
                        </>
                    ) : (
                        <>
                            <View style={[
                                styles.statusIcon,
                                {
                                    backgroundColor:
                                        attendance.status === 'PRESENT' ? '#DCFCE7' :
                                            attendance.status === 'LATE' ? '#FEF3C7' :
                                                attendance.status === 'ABSENT' ? '#FEE2E2' : '#E0E7FF'
                                }
                            ]}>
                                {attendance.status === 'PRESENT' ? <CheckCircle size={48} color="#10B981" /> :
                                    attendance.status === 'LATE' ? <Clock4 size={48} color="#F59E0B" /> :
                                        <XCircle size={48} color="#EF4444" />}
                            </View>
                            <Text style={styles.statusTitle}>
                                {attendance.status === 'PRESENT' ? 'Checked In' :
                                    attendance.status === 'LATE' ? 'Late Check-In' :
                                        attendance.status?.replaceAll('_', ' ')
                                }
                            </Text>
                            {attendance.checkInTime && (
                                <Text style={styles.statusSubtitle}>
                                    {new Date(attendance.checkInTime).toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </Text>
                            )}
                            {attendance.lateByMinutes > 0 && (
                                <View style={styles.lateBadge}>
                                    <Text style={styles.lateBadgeText}>
                                        Late by {attendance.lateByMinutes} min
                                    </Text>
                                </View>
                            )}
                        </>
                    )}
                </Animated.View>
            )}

            {/* Action Buttons - Only show if working day and not on leave */}
            {isWorkingDay && !onLeave && (
                <Animated.View entering={FadeInDown.delay(500)} style={styles.actionContainer}>
                    {canCheckIn && (
                        <AnimatedPressable
                            entering={FadeInUp.delay(100)}
                            style={[styles.actionButton, styles.checkInButton]}
                            onPress={() => checkInMutation.mutate()}
                            disabled={checkInMutation.isPending || !location}
                        >
                            {checkInMutation.isPending ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <CheckCircle size={24} color="#fff" />
                                    <Text style={styles.actionButtonText}>Check In Now</Text>
                                </>
                            )}
                        </AnimatedPressable>
                    )}

                    {canCheckOut && (
                        <AnimatedPressable
                            entering={FadeInUp.delay(200)}
                            style={[styles.actionButton, styles.checkOutButton]}
                            onPress={() => checkOutMutation.mutate()}
                            disabled={checkOutMutation.isPending}
                        >
                            {checkOutMutation.isPending ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Clock size={24} color="#fff" />
                                    <Text style={styles.actionButtonText}>Check Out</Text>
                                </>
                            )}
                        </AnimatedPressable>
                    )}
                </Animated.View>
            )}

            {/* Leave & Regularization Buttons */}
            <Animated.View entering={FadeInDown.delay(550)} style={styles.secondaryActions}>
                <Pressable
                    style={styles.secondaryButton}
                    onPress={() => setShowLeaveModal(true)}
                >
                    <FileText size={20} color="#3B82F6" />
                    <Text style={styles.secondaryButtonText}>Apply Leave</Text>
                </Pressable>
            </Animated.View>

            {/* Windows Info - Only show if working day and not on leave */}
            {isWorkingDay && !onLeave && windows?.checkIn && (
                <Animated.View entering={FadeInDown.delay(250)} style={styles.windowCard}>
                    <View style={styles.windowHeader}>
                        <Timer size={18} color="#0469ff" />
                        <Text style={styles.windowTitle}>Check-In Window</Text>
                    </View>
                    <Text style={styles.windowTime}>
                        {new Date(windows.checkIn.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' - '}
                        {new Date(windows.checkIn.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {windows.checkIn.isOpen ? (
                        <View style={[styles.windowStatus, { backgroundColor: '#DCFCE7' }]}>
                            <CheckCircle size={14} color="#10B981" />
                            <Text style={[styles.windowStatusText, { color: '#10B981' }]}>
                                Open • {getTimeRemaining(windows.checkIn.end)}
                            </Text>
                        </View>
                    ) : (
                        <View style={[styles.windowStatus, { backgroundColor: '#FEE2E2' }]}>
                            <XCircle size={14} color="#EF4444" />
                            <Text style={[styles.windowStatusText, { color: '#EF4444' }]}>
                                Closed
                            </Text>
                        </View>
                    )}
                </Animated.View>
            )}

            {isWorkingDay && !onLeave && windows?.checkOut && attendance?.checkInTime && (
                <Animated.View entering={FadeInDown.delay(300)} style={styles.checkOutCard}>
                    <View style={styles.windowHeader}>
                        <Timer size={18} color="#10B981" />
                        <Text style={styles.windowTitle}>Check-Out Window</Text>
                    </View>
                    <Text style={styles.windowTime}>
                        {new Date(windows.checkOut.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {' - '}
                        {new Date(windows.checkOut.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {windows.checkOut.minTime && (
                        <View style={styles.minTimeHint}>
                            <Info size={14} color="#F59E0B" />
                            <Text style={styles.minTimeText}>
                                Minimum {config?.halfDayHours || 4}h • Available after{' '}
                                {new Date(windows.checkOut.minTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>
                    )}
                    {windows.checkOut.isOpen ? (
                        <View style={[styles.windowStatus, { backgroundColor: '#DCFCE7' }]}>
                            <CheckCircle size={14} color="#10B981" />
                            <Text style={[styles.windowStatusText, { color: '#10B981' }]}>
                                Open • {getTimeRemaining(windows.checkOut.end)}
                            </Text>
                        </View>
                    ) : (
                        <View style={[styles.windowStatus, { backgroundColor: '#FEE2E2' }]}>
                            <XCircle size={14} color="#EF4444" />
                            <Text style={[styles.windowStatusText, { color: '#EF4444' }]}>
                                {new Date() < new Date(windows.checkOut.start) ? 'Opens soon' : 'Closed'}
                            </Text>
                        </View>
                    )}
                </Animated.View>
            )}

            {/* Stats */}
            <View style={styles.infoGrid}>
                <Animated.View entering={FadeInDown.delay(700)} style={styles.infoCard}>
                    <Clock size={20} color="#0469ff" />
                    <Text style={styles.infoLabel}>Office Hours</Text>
                    <Text style={styles.infoValue}>
                        {config ? `${config.startTime} – ${config.endTime}` : '—'}
                    </Text>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(750)} style={styles.infoCard}>
                    <TrendingUp size={20} color="#10B981" />
                    <Text style={styles.infoLabel}>This Month</Text>
                    <Text style={styles.infoValue}>
                        {monthlyStats?.attendancePercentage?.toFixed(0)}%
                    </Text>
                </Animated.View>
            </View>

            {/* Leave Requests Section */}
            {leaveData?.leaves && leaveData.leaves.length > 0 && (
                <Animated.View entering={FadeInDown.delay(600)} style={styles.requestSection}>
                    <Text style={styles.sectionTitle}>Leave Requests</Text>
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
                                    <Calendar size={16} color="#666" />
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
                </Animated.View>
            )}

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

                        <ScrollView style={styles.modalForm} contentContainerStyle={{
                            paddingBottom: 30,
                        }}>
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
                                <Calendar size={18} color="#666" />
                                <Text style={styles.dateText}>{formatDate(leaveForm.startDate)}</Text>
                                <ChevronRight size={18} color="#666" />
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
                                <Calendar size={18} color="#666" />
                                <Text style={styles.dateText}>{formatDate(leaveForm.endDate)}</Text>
                                <ChevronRight size={18} color="#666" />
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
                                onChangeText={(text) => setLeaveForm({ ...leaveForm, reason: text })}
                                multiline
                                numberOfLines={4}
                            />
                            {errors.reason && <Text style={styles.errorText}>{errors.reason}</Text>}

                            <Text style={styles.inputLabel}>Emergency Contact (Optional)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Contact name"
                                value={leaveForm.emergencyContact}
                                onChangeText={(text) => setLeaveForm({ ...leaveForm, emergencyContact: text })}
                            />

                            <Text style={styles.inputLabel}>Emergency Phone (Optional)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="Contact number"
                                value={leaveForm.emergencyContactPhone}
                                onChangeText={(text) => setLeaveForm({ ...leaveForm, emergencyContactPhone: text })}
                                keyboardType="phone-pad"
                            />
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

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loaderText: { fontSize: 16, color: '#666', marginTop: 8 },
    errorText: { fontSize: 12, color: '#EF4444', marginTop: 4 },

    header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#fff' },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerTitle: { fontSize: 28, fontWeight: '700', color: '#111', marginBottom: 4 },
    headerDate: { fontSize: 15, color: '#666' },
    locationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#DCFCE7', borderRadius: 12 },
    locationText: { fontSize: 12, fontWeight: '600', color: '#10B981' },

    errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 20, padding: 12, backgroundColor: '#FEE2E2', borderRadius: 12 },
    errorCardText: { flex: 1, fontSize: 14, color: '#991B1B' },

    leaveCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, margin: 20, padding: 20, backgroundColor: '#EFF6FF', borderRadius: 20, borderWidth: 2, borderColor: '#BFDBFE' },
    leaveContent: { flex: 1 },
    leaveTitle: { fontSize: 18, fontWeight: '700', color: '#1E40AF', marginBottom: 4 },
    leaveSubtitle: { fontSize: 14, color: '#3B82F6', marginBottom: 8, fontWeight: '500' },
    leaveReason: { fontSize: 14, color: '#1E40AF', lineHeight: 20 },

    alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 20, padding: 16, backgroundColor: '#FEF3C7', borderRadius: 16 },
    alertContent: { flex: 1 },
    alertTitle: { fontSize: 16, fontWeight: '600', color: '#92400E', marginBottom: 2 },
    alertMessage: { fontSize: 14, color: '#333' },

    timerCard: { margin: 20, padding: 24, backgroundColor: '#FFF7ED', borderRadius: 24, flexDirection: 'row', alignItems: 'center', gap: 16, borderWidth: 1.5, borderColor: '#FED7AA', overflow: 'hidden' },
    pulseCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FF9800', opacity: 0.2, position: 'absolute', left: -20, top: -20 },
    timerContent: { flex: 1 },
    timerLabel: { fontSize: 14, color: '#92400E', fontWeight: '600', marginBottom: 4 },
    timerValue: { fontSize: 36, fontWeight: '800', color: '#D97706', letterSpacing: -1 },
    timerSub: { fontSize: 13, color: '#92400E', marginTop: 2 },

    statusCard: { margin: 20, padding: 32, backgroundColor: '#fff', borderRadius: 24, alignItems: 'center' },
    statusIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    statusTitle: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 4 },
    statusSubtitle: { fontSize: 16, color: '#666' },
    lateBadge: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FEF3C7', borderRadius: 12 },
    lateBadgeText: { fontSize: 14, fontWeight: '600', color: '#92400E' },

    actionContainer: { paddingHorizontal: 20, gap: 12 },
    actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 18, borderRadius: 16 },
    checkInButton: { backgroundColor: '#0469ff' },
    checkOutButton: { backgroundColor: '#10B981' },
    actionButtonText: { fontSize: 18, fontWeight: '700', color: '#fff' },

    secondaryActions: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginTop: 12 },
    secondaryButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: '#fff', borderRadius: 12, borderWidth: 2, borderColor: '#E2E8F0' },
    secondaryButtonText: { fontSize: 14, fontWeight: '600', color: '#111' },

    requestSection: { margin: 20, marginTop: 12 },
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
    modalForm: { padding: 20, maxHeight: 500, paddingBottom: 50 },
    infoGrid: { flexDirection: 'row', paddingHorizontal: 20, gap: 12, marginTop: 12 },
    infoCard: { flex: 1, padding: 16, backgroundColor: '#fff', borderRadius: 16, gap: 8 },
    infoLabel: { fontSize: 13, color: '#666' },
    infoValue: { fontSize: 16, fontWeight: '700', color: '#111' },
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

    windowCard: { margin: 20, marginTop: 12, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
    checkOutCard: { margin: 20, marginTop: 2, padding: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },

    windowHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    windowTitle: { fontSize: 15, fontWeight: '600', color: '#111' },
    windowTime: { fontSize: 14, color: '#666', marginBottom: 8 },
    windowStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
    windowStatusText: { fontSize: 13, fontWeight: '600' },
    minTimeHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, padding: 8, backgroundColor: '#FFFBEB', borderRadius: 8 },
    minTimeText: { flex: 1, fontSize: 12, color: '#92400E' },

    infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, backgroundColor: '#EEF2FF', borderRadius: 12, marginBottom: 16 },
    infoBoxText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 18 },

    modalActions: { flexDirection: 'row', gap: 12, padding: 20, marginBottom: 20, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    modalButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
    modalButtonSecondary: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
    modalButtonPrimary: { backgroundColor: '#0469ff' },
    modalButtonTextSecondary: { fontSize: 16, fontWeight: '600', color: '#475569' },
    modalButtonTextPrimary: { fontSize: 16, fontWeight: '700', color: '#fff' },
});