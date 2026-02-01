import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, Pressable, ScrollView, RefreshControl,
    Alert, ActivityIndicator, AppState, Platform, Modal, TextInput,
    KeyboardAvoidingView
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import Animated, { FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, withTiming, withRepeat } from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import { z } from 'zod';
import {
    Calendar, Clock, MapPin, CheckCircle, XCircle, Clock4, AlertCircle,
    TrendingUp, Timer, Zap, FileText, Send, X as CloseIcon, AlertTriangle,
    Info, ChevronRight, Umbrella, Bell, LogOut, ArrowLeft
} from 'lucide-react-native';
import { router } from 'expo-router';
import api, { API_BASE_URL } from '../../../lib/api';
import { getSchoolLocation, isNearSchool, getDistanceMeters, formatDistance } from '../../../lib/geofence-service';
import { useAttendanceReminder, REMINDER_TYPES } from '../../../contexts/AttendanceReminderContext';
import { StatusBar } from 'expo-status-bar';

// Configure notification handler
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
    }),
});

// Storage keys for background persistence
const STORAGE_KEYS = {
    CHECK_IN_TIME: 'attendance_check_in_time',
    NOTIFICATION_IDS: 'attendance_notification_ids',
};

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
    const { triggerTestReminder } = useAttendanceReminder(); // DEBUG: For testing reminders
    const [refreshing, setRefreshing] = useState(false);
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState(null);
    const [deviceInfo, setDeviceInfo] = useState(null);
    const [schoolLocation, setSchoolLocation] = useState(null);
    const [distanceToSchool, setDistanceToSchool] = useState(null);
    const [isWithinRadius, setIsWithinRadius] = useState(false);
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
            if (stored) {
                const userData = JSON.parse(stored);
                setUser(userData);

                // Fetch school location settings
                if (userData.schoolId) {
                    try {
                        const sLoc = await getSchoolLocation(userData.schoolId, API_BASE_URL);
                        setSchoolLocation(sLoc);
                        console.log('School location loaded for attendance:', sLoc);
                    } catch (e) {
                        console.error('Failed to load school location:', e);
                    }
                }
            }
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

                // Calculate distance if school location is available and geofencing is enabled
                if (schoolLocation?.enableGeoFencing && schoolLocation?.latitude && schoolLocation?.longitude) {
                    const dist = getDistanceMeters(
                        loc.coords.latitude,
                        loc.coords.longitude,
                        schoolLocation.latitude,
                        schoolLocation.longitude
                    );
                    setDistanceToSchool(Math.round(dist));

                    const radius = schoolLocation.attendanceRadius || 500;
                    setIsWithinRadius(dist <= radius);
                } else if (schoolLocation?.latitude && schoolLocation?.longitude) {
                    // School location exists but geofencing is disabled - calculate distance for display only
                    const dist = getDistanceMeters(
                        loc.coords.latitude,
                        loc.coords.longitude,
                        schoolLocation.latitude,
                        schoolLocation.longitude
                    );
                    setDistanceToSchool(Math.round(dist));
                    setIsWithinRadius(true); // Always allow if geofencing is disabled
                } else {
                    // No school location configured - allow attendance
                    setIsWithinRadius(true);
                }
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
    }, [userId, schoolId, schoolLocation]);

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

    // ========== NOTIFICATION HELPERS ==========

    // Request notification permissions
    const requestNotificationPermission = async () => {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }

        return finalStatus === 'granted';
    };

    // Schedule check-out reminder notifications
    const scheduleCheckOutReminders = async (checkOutWindowStart, checkOutWindowEnd) => {
        try {
            const hasPermission = await requestNotificationPermission();
            if (!hasPermission) return;

            // Cancel any existing attendance notifications
            await cancelAttendanceNotifications();

            const notificationIds = [];
            const now = new Date();
            const windowStart = new Date(checkOutWindowStart);
            const windowEnd = new Date(checkOutWindowEnd);

            // 1. Notification when check-out window opens
            if (windowStart > now) {
                const id = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: '🔔 Check-out is now available!',
                        body: `You can now check out. Don't forget to mark your attendance before ${windowEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                        sound: true,
                    },
                    trigger: { date: windowStart },
                });
                notificationIds.push(id);
            }

            // 2. Reminder 15 minutes before window closes
            const reminderTime = new Date(windowEnd.getTime() - 15 * 60 * 1000);
            if (reminderTime > now) {
                const id = await Notifications.scheduleNotificationAsync({
                    content: {
                        title: '⏰ Check-out window closing soon!',
                        body: 'Only 15 minutes left to check out. Open the app now.',
                        sound: true,
                    },
                    trigger: { date: reminderTime },
                });
                notificationIds.push(id);
            }

            // Store notification IDs for later cancellation
            await SecureStore.setItemAsync(
                STORAGE_KEYS.NOTIFICATION_IDS,
                JSON.stringify(notificationIds)
            );

            console.log('[Notifications] Scheduled', notificationIds.length, 'reminders');
        } catch (error) {
            console.error('[Notifications] Failed to schedule:', error);
        }
    };

    // Cancel scheduled attendance notifications
    const cancelAttendanceNotifications = async () => {
        try {
            const storedIds = await SecureStore.getItemAsync(STORAGE_KEYS.NOTIFICATION_IDS);
            if (storedIds) {
                const ids = JSON.parse(storedIds);
                for (const id of ids) {
                    await Notifications.cancelScheduledNotificationAsync(id);
                }
                await SecureStore.deleteItemAsync(STORAGE_KEYS.NOTIFICATION_IDS);
            }
        } catch (error) {
            console.error('[Notifications] Failed to cancel:', error);
        }
    };

    // Save check-in time for background persistence
    const saveCheckInState = async (checkInTime) => {
        try {
            await SecureStore.setItemAsync(
                STORAGE_KEYS.CHECK_IN_TIME,
                checkInTime.toISOString()
            );
        } catch (error) {
            console.error('[Storage] Failed to save check-in state:', error);
        }
    };

    // Clear check-in state after check-out
    const clearCheckInState = async () => {
        try {
            await SecureStore.deleteItemAsync(STORAGE_KEYS.CHECK_IN_TIME);
        } catch (error) {
            console.error('[Storage] Failed to clear check-in state:', error);
        }
    };

    // ========== UX MESSAGE HELPERS ==========

    // Get contextual message for check-in window status
    const getCheckInStatusMessage = () => {
        if (!windows?.checkIn) return '';

        const now = new Date();
        const start = new Date(windows.checkIn.start);
        const end = new Date(windows.checkIn.end);

        if (windows.checkIn.isOpen) {
            const remaining = getTimeRemaining(windows.checkIn.end);
            return attendance?.checkInTime
                ? `Checked in at ${new Date(attendance.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : `Window open • ${remaining}`;
        } else if (now < start) {
            return `Opens at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        } else {
            // Closed - show when it opens tomorrow
            const tomorrow = new Date(start);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return `Closed • Opens tomorrow at ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
    };

    // Get contextual message for check-out window status
    const getCheckOutStatusMessage = () => {
        if (!windows?.checkOut || !attendance?.checkInTime) return '';

        const now = new Date();
        const start = new Date(windows.checkOut.start);
        const end = new Date(windows.checkOut.end);

        if (windows.checkOut.isOpen) {
            const remaining = getTimeRemaining(windows.checkOut.end);
            return `Ready to check out • ${remaining}`;
        } else if (now < start) {
            const timeUntil = Math.round((start - now) / (1000 * 60));
            if (timeUntil > 60) {
                return `Opens in ${Math.floor(timeUntil / 60)}h ${timeUntil % 60}m`;
            }
            return `Opens in ${timeUntil} minutes`;
        } else {
            return `Window closed • Request regularization if needed`;
        }
    };

    // Get work progress message
    const getWorkProgressMessage = () => {
        if (!attendance?.checkInTime || attendance?.checkOutTime) return '';

        const minHours = config?.halfDayHours || 4;
        const fullHours = config?.fullDayHours || 8;

        if (liveHours >= fullHours) {
            return `✨ Full day completed! You can check out now.`;
        } else if (liveHours >= minHours) {
            return `✓ Minimum ${minHours}h completed • Full day at ${fullHours}h`;
        } else {
            const remaining = (minHours - liveHours).toFixed(1);
            return `${remaining}h more for minimum ${minHours}h requirement`;
        }
    };

    // Check-in mutation
    const checkInMutation = useMutation({
        mutationFn: async () => {
            if (!location) throw new Error('Location not available');

            // Proximity Check - only enforce if geofencing is enabled
            if (config?.enableGeoFencing && schoolLocation?.enableGeoFencing && isWithinRadius === false) {
                const radius = config?.allowedRadius || schoolLocation.attendanceRadius || 500;
                throw new Error(`You are too far from school. Please ensure you are within ${radius}m.`);
            }

            return await api.post(`/schools/${schoolId}/attendance/mark`, {
                userId,
                type: 'CHECK_IN',
                location,
                deviceInfo
            });
        },
        onSuccess: async (res) => {
            queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] });
            if (!res.data.success) {
                Alert.alert('Cannot Check In', res.data.message);
                return;
            }

            // Save check-in state for background persistence
            await saveCheckInState(new Date());

            // Schedule check-out reminder notifications
            if (windows?.checkOut) {
                await scheduleCheckOutReminders(windows.checkOut.start, windows.checkOut.end);
            }

            Alert.alert(
                res.data.isLate ? '⏰ Checked In (Late)' : '✅ Checked In Successfully',
                res.data.isLate
                    ? `You're ${res.data.lateByMinutes} minutes late. Your attendance has been marked.`
                    : 'Your attendance has been marked. Check-out reminders scheduled!'
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

            // Proximity Check - only enforce if geofencing is enabled
            if (config?.enableGeoFencing && schoolLocation?.enableGeoFencing && isWithinRadius === false) {
                const radius = config?.allowedRadius || schoolLocation.attendanceRadius || 500;
                throw new Error(`You are too far from school. Please ensure you are within ${radius}m.`);
            }

            return await api.post(`/schools/${schoolId}/attendance/mark`, {
                userId,
                type: 'CHECK_OUT',
                location,
                deviceInfo
            });
        },
        onSuccess: async (res) => {
            queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] });
            if (!res.data.success) {
                Alert.alert('Cannot Check Out', res.data.message);
                return;
            }

            // Cancel scheduled notifications and clear state
            await cancelAttendanceNotifications();
            await clearCheckInState();

            Alert.alert(
                '✅ Checked Out Successfully',
                `Total working hours: ${res.data.workingHours?.toFixed(2) || liveHours.toFixed(2)}h. See you tomorrow!`
            );
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
        <View style={styles.container}>
            <StatusBar style='dark' />
            {/* Header - Fixed/Sticky */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ArrowLeft size={24} color="#111" />
                </Pressable>
                <Text style={styles.headerTitle}>Attendance</Text>
                {config?.enableGeoFencing && location ? (
                    <View style={[styles.locationBadge, !isWithinRadius && styles.locationBadgeError]}>
                        {isWithinRadius ? (
                            <MapPin size={14} color="#10B981" />
                        ) : (
                            <AlertCircle size={14} color="#EF4444" />
                        )}
                        <Text style={[styles.locationText, !isWithinRadius && styles.locationTextError]}>
                            {isWithinRadius
                                ? `${distanceToSchool ? formatDistance(distanceToSchool) : 'Ready'}`
                                : `${distanceToSchool ? formatDistance(distanceToSchool) : '...'}`
                            }
                        </Text>
                    </View>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </Animated.View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 20 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >

                {/* Date Subheader */}
                <View style={styles.dateHeader}>
                    <Text style={styles.headerDate}>
                        {new Date().toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric'
                        })}
                    </Text>
                </View>

                {/* DEBUG: Test Reminder Buttons - Remove in production */}
                {__DEV__ && (
                    <View style={{ padding: 16, backgroundColor: '#FEF3C7', margin: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F59E0B' }}>
                        <Text style={{ fontWeight: '700', fontSize: 14, color: '#92400E', marginBottom: 8 }}>🧪 DEV: Test Reminders</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            <Pressable
                                onPress={() => triggerTestReminder(REMINDER_TYPES.CHECK_IN_OPEN)}
                                style={{ backgroundColor: '#10B981', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Check-In</Text>
                            </Pressable>
                            <Pressable
                                onPress={() => triggerTestReminder(REMINDER_TYPES.LATE_WARNING)}
                                style={{ backgroundColor: '#F59E0B', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Late Warning</Text>
                            </Pressable>
                            <Pressable
                                onPress={() => triggerTestReminder(REMINDER_TYPES.CHECK_OUT_OPEN)}
                                style={{ backgroundColor: '#3B82F6', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Check-Out</Text>
                            </Pressable>
                            <Pressable
                                onPress={() => triggerTestReminder(REMINDER_TYPES.CHECK_OUT_WARNING)}
                                style={{ backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Checkout Warn</Text>
                            </Pressable>
                        </View>
                    </View>
                )}

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

                {/* Live Timer - Enhanced with work progress */}
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
                            {/* Work Progress Indicator */}
                            <View style={styles.progressHint}>
                                <Text style={styles.progressText}>{getWorkProgressMessage()}</Text>
                            </View>
                        </View>
                    </Animated.View>
                )}

                {/* Status Card - Enhanced with contextual guidance */}
                {!onLeave && (
                    <Animated.View entering={FadeInDown.delay(400)} style={styles.statusCard}>
                        {/* No attendance OR attendance with no checkInTime = Not Marked */}
                        {(!attendance || !attendance.checkInTime) && attendance?.status !== 'ABSENT' ? (
                            <>
                                <View style={[styles.statusIcon, { backgroundColor: '#F1F5F9' }]}>
                                    <Clock size={48} color="#94A3B8" />
                                </View>
                                <Text style={styles.statusTitle}>Not Marked Yet</Text>
                                <Text style={styles.statusSubtitle}>
                                    {windows?.checkIn?.isOpen
                                        ? `Window open until ${new Date(windows.checkIn.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                        : getCheckInStatusMessage() || 'Check-in window not available'}
                                </Text>
                                {canCheckIn && location && (
                                    <View style={styles.statusHintBox}>
                                        <CheckCircle size={16} color="#10B981" />
                                        <Text style={styles.statusHintText}>Ready to check in! Tap the button below.</Text>
                                    </View>
                                )}
                                {!location && locationError && (
                                    <View style={[styles.statusHintBox, { backgroundColor: '#FEF2F2' }]}>
                                        <AlertCircle size={16} color="#EF4444" />
                                        <Text style={[styles.statusHintText, { color: '#991B1B' }]}>Enable location to check in</Text>
                                    </View>
                                )}
                                {config?.enableGeoFencing && location && !isWithinRadius && schoolLocation && (
                                    <View style={[styles.statusHintBox, { backgroundColor: '#FEF2F2' }]}>
                                        <AlertTriangle size={16} color="#DC2626" />
                                        <Text style={[styles.statusHintText, { color: '#991B1B' }]}>
                                            You are too far from school ({distanceToSchool ? formatDistance(distanceToSchool) : 'calculating...'}).
                                            Radius: {config?.allowedRadius || schoolLocation.attendanceRadius || 500}m
                                        </Text>
                                    </View>
                                )}
                                {!windows?.checkIn?.isOpen && !canCheckIn && (
                                    <View style={[styles.statusHintBox, { backgroundColor: '#FEF3C7' }]}>
                                        <AlertTriangle size={16} color="#D97706" />
                                        <Text style={[styles.statusHintText, { color: '#92400E' }]}>
                                            Check-in window is closed. Apply for regularization if needed.
                                        </Text>
                                    </View>
                                )}
                            </>
                        ) : attendance?.status === 'ABSENT' ? (
                            <>
                                <View style={[styles.statusIcon, { backgroundColor: '#FEE2E2' }]}>
                                    <XCircle size={48} color="#EF4444" />
                                </View>
                                <Text style={styles.statusTitle}>Marked Absent</Text>
                                <Text style={styles.statusSubtitle}>
                                    {attendance.remarks || 'You missed the check-in window today'}
                                </Text>
                                <View style={[styles.statusHintBox, { backgroundColor: '#FEF3C7' }]}>
                                    <AlertTriangle size={16} color="#D97706" />
                                    <Text style={[styles.statusHintText, { color: '#92400E' }]}>
                                        Think this is a mistake? Apply for regularization below.
                                    </Text>
                                </View>
                            </>
                        ) : attendance?.checkOutTime ? (
                            <>
                                <View style={[styles.statusIcon, { backgroundColor: '#DCFCE7' }]}>
                                    <CheckCircle size={48} color="#10B981" />
                                </View>
                                <Text style={styles.statusTitle}>Day Complete ✨</Text>
                                <Text style={styles.statusSubtitle}>
                                    {attendance.workingHours?.toFixed(1) || '0'}h worked today
                                </Text>
                                <View style={styles.timeRangeRow}>
                                    <Text style={styles.timeRangeText}>
                                        {new Date(attendance.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {' → '}
                                        {new Date(attendance.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </View>
                            </>
                        ) : attendance?.checkInTime ? (
                            <>
                                <View style={[
                                    styles.statusIcon,
                                    { backgroundColor: attendance.status === 'LATE' ? '#FEF3C7' : '#DCFCE7' }
                                ]}>
                                    {attendance.status === 'LATE' ? (
                                        <Clock4 size={48} color="#F59E0B" />
                                    ) : (
                                        <CheckCircle size={48} color="#10B981" />
                                    )}
                                </View>
                                <Text style={styles.statusTitle}>
                                    {attendance.status === 'LATE' ? 'Checked In (Late)' : 'Checked In'}
                                </Text>
                                <Text style={styles.statusSubtitle}>
                                    at {new Date(attendance.checkInTime).toLocaleTimeString('en-US', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </Text>
                                {attendance.lateByMinutes > 0 && (
                                    <View style={styles.lateBadge}>
                                        <Text style={styles.lateBadgeText}>
                                            Late by {attendance.lateByMinutes} min
                                        </Text>
                                    </View>
                                )}
                                {/* Check-out hint */}
                                {!canCheckOut && windows?.checkOut && (
                                    <View style={[styles.statusHintBox, { backgroundColor: '#EEF2FF' }]}>
                                        <Info size={16} color="#4F46E5" />
                                        <Text style={[styles.statusHintText, { color: '#3730A3' }]}>
                                            {getCheckOutStatusMessage()}
                                        </Text>
                                    </View>
                                )}
                            </>
                        ) : null}
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
                    <Pressable
                        style={styles.secondaryButton}
                        onPress={() => setShowRegularizationModal(true)}
                    >
                        <Calendar size={20} color="#F59E0B" />
                        <Text style={styles.secondaryButtonText}>Regularization</Text>
                    </Pressable>
                </Animated.View>

                {/* Windows Info - Enhanced with contextual messages */}
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
                                    {getCheckInStatusMessage()}
                                </Text>
                            </View>
                        ) : (
                            <View style={[styles.windowStatus, { backgroundColor: '#FEE2E2' }]}>
                                <XCircle size={14} color="#EF4444" />
                                <Text style={[styles.windowStatusText, { color: '#EF4444' }]}>
                                    {getCheckInStatusMessage()}
                                </Text>
                            </View>
                        )}
                    </Animated.View>
                )}

                {isWorkingDay && !onLeave && windows?.checkOut && attendance?.checkInTime && (
                    <Animated.View entering={FadeInDown.delay(300)} style={styles.checkOutCard}>
                        <View style={styles.windowHeader}>
                            <LogOut size={18} color="#10B981" />
                            <Text style={styles.windowTitle}>Check-Out Window</Text>
                        </View>
                        <Text style={styles.windowTime}>
                            {new Date(windows.checkOut.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' - '}
                            {new Date(windows.checkOut.end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        {windows.checkOut.minTime && !windows.checkOut.isOpen && (
                            <View style={styles.minTimeHint}>
                                <Info size={14} color="#F59E0B" />
                                <Text style={styles.minTimeText}>
                                    Minimum {config?.halfDayHours || 4}h required • Available after{' '}
                                    {new Date(windows.checkOut.minTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            </View>
                        )}
                        {windows.checkOut.isOpen ? (
                            <View style={[styles.windowStatus, { backgroundColor: '#DCFCE7' }]}>
                                <CheckCircle size={14} color="#10B981" />
                                <Text style={[styles.windowStatusText, { color: '#10B981' }]}>
                                    {getCheckOutStatusMessage()}
                                </Text>
                            </View>
                        ) : (
                            <View style={[styles.windowStatus, { backgroundColor: new Date() < new Date(windows.checkOut.start) ? '#FEF3C7' : '#FEE2E2' }]}>
                                {new Date() < new Date(windows.checkOut.start) ? (
                                    <Clock4 size={14} color="#F59E0B" />
                                ) : (
                                    <XCircle size={14} color="#EF4444" />
                                )}
                                <Text style={[styles.windowStatusText, { color: new Date() < new Date(windows.checkOut.start) ? '#92400E' : '#EF4444' }]}>
                                    {getCheckOutStatusMessage()}
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
                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
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
                    </KeyboardAvoidingView>
                </Modal>

                {/* Regularization Request Modal - with KeyboardAvoidingView and IST timezone fix */}
                <Modal
                    visible={showRegularizationModal}
                    transparent
                    animationType="slide"
                    onRequestClose={() => setShowRegularizationModal(false)}
                >
                    <KeyboardAvoidingView
                        style={{ flex: 1 }}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                    >
                        <View style={styles.modalOverlay}>
                            <View style={styles.modalContent}>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>Request Regularization</Text>
                                    <Pressable onPress={() => setShowRegularizationModal(false)}>
                                        <CloseIcon size={24} color="#666" />
                                    </Pressable>
                                </View>

                                <ScrollView style={styles.modalForm} contentContainerStyle={{ paddingBottom: 30 }}>
                                    <View style={styles.infoBox}>
                                        <Info size={18} color="#1E40AF" />
                                        <Text style={styles.infoBoxText}>
                                            Submit a regularization request for days when you couldn't check in/out properly. Only past dates can be regularized.
                                        </Text>
                                    </View>

                                    <Text style={styles.inputLabel}>Date to Regularize *</Text>
                                    <Pressable
                                        style={[styles.dateInput, errors.date && styles.inputError]}
                                        onPress={() => setShowRegDatePicker(true)}
                                    >
                                        <Calendar size={18} color="#666" />
                                        <Text style={styles.dateText}>
                                            {regularizationForm.date ? new Date(regularizationForm.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Select date'}
                                        </Text>
                                        <ChevronRight size={18} color="#666" />
                                    </Pressable>
                                    {errors.date && <Text style={styles.errorText}>{errors.date}</Text>}

                                    {showRegDatePicker && (
                                        <DateTimePicker
                                            value={regularizationForm.date ? new Date(regularizationForm.date) : new Date()}
                                            mode="date"
                                            display="default"
                                            maximumDate={new Date(Date.now() - 24 * 60 * 60 * 1000)}
                                            onChange={(event, selectedDate) => {
                                                setShowRegDatePicker(false);
                                                if (selectedDate) {
                                                    // Fix timezone: Use IST offset to ensure correct date
                                                    const istOffset = 5.5 * 60 * 60 * 1000; // IST is UTC+5:30
                                                    const localDate = new Date(selectedDate.getTime() + istOffset);
                                                    const dateStr = localDate.toISOString().split('T')[0];
                                                    setRegularizationForm({ ...regularizationForm, date: dateStr });
                                                }
                                            }}
                                        />
                                    )}

                                    <Text style={styles.inputLabel}>Requested Status *</Text>
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
                                                ]                              <Text style={styles.modalButtonTextPrimary}>Submit</Text>
                                            </>
                                        )}
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loaderText: { fontSize: 16, color: '#666', marginTop: 8 },
    errorText: { fontSize: 12, color: '#EF4444', marginTop: 4 },
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
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    dateHeader: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    headerDate: { fontSize: 14, color: '#666' },
    locationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#DCFCE7', borderRadius: 12 },
    locationText: { fontSize: 11, fontWeight: '600', color: '#10B981' },
    locationBadgeError: { backgroundColor: '#FEE2E2' },
    locationTextError: { color: '#EF4444' },

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
    statusTitle: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 4, textAlign: 'center' },
    statusSubtitle: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 22 },
    lateBadge: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FEF3C7', borderRadius: 12 },
    lateBadgeText: { fontSize: 14, fontWeight: '600', color: '#92400E' },

    // Enhanced status card hint styles
    statusHintBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#DCFCE7', borderRadius: 12, maxWidth: '100%' },
    statusHintText: { flex: 1, fontSize: 13, color: '#166534', lineHeight: 18 },
    timeRangeRow: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F1F5F9', borderRadius: 10 },
    timeRangeText: { fontSize: 14, color: '#475569', fontWeight: '500' },

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

    // Work progress styles for timer card
    progressHint: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#FED7AA' },
    progressText: { fontSize: 13, color: '#92400E', fontWeight: '500', textAlign: 'center' },

    infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, backgroundColor: '#EEF2FF', borderRadius: 12, marginBottom: 16 },
    infoBoxText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 18 },

    modalActions: { flexDirection: 'row', gap: 12, padding: 20, marginBottom: 20, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
    modalButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
    modalButtonSecondary: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
    modalButtonPrimary: { backgroundColor: '#0469ff' },
    modalButtonTextSecondary: { fontSize: 16, fontWeight: '600', color: '#475569' },
    modalButtonTextPrimary: { fontSize: 16, fontWeight: '700', color: '#fff' },
});