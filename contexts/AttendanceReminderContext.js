// contexts/AttendanceReminderContext.js
// Optimized attendance reminder system with local time calculations
// Minimal API load - fetches settings once, calculates windows locally

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';
import api, { API_BASE_URL } from '../lib/api';

const AttendanceReminderContext = createContext();

// Storage keys
const STORAGE_KEYS = {
    ATTENDANCE_SETTINGS: 'attendance_reminder_settings',
    DISMISSED_TODAY: 'attendance_reminder_dismissed',
    SCHEDULED_NOTIFICATIONS: 'attendance_scheduled_notifications',
};

// Reminder types
export const REMINDER_TYPES = {
    CHECK_IN_OPEN: 'CHECK_IN_OPEN',
    LATE_WARNING: 'LATE_WARNING',
    CHECK_IN_CLOSED: 'CHECK_IN_CLOSED',
    CHECK_OUT_OPEN: 'CHECK_OUT_OPEN',
    CHECK_OUT_WARNING: 'CHECK_OUT_WARNING',
};

export function AttendanceReminderProvider({ children }) {
    // Modal states
    const [activeReminder, setActiveReminder] = useState(null);
    const [isReminderVisible, setIsReminderVisible] = useState(false);

    // User and settings state
    const [user, setUser] = useState(null);
    const [attendanceSettings, setAttendanceSettings] = useState(null);
    const [attendanceStatus, setAttendanceStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // Refs for timers
    const timersRef = useRef([]);
    const appState = useRef(AppState.currentState);
    const hasScheduledToday = useRef(false);

    // Check if user is teaching staff
    const isTeachingStaff = user?.role?.name === 'TEACHING_STAFF';

    // Load user from SecureStore
    useEffect(() => {
        const loadUser = async () => {
            try {
                const userStr = await SecureStore.getItemAsync('user');
                if (userStr) {
                    setUser(JSON.parse(userStr));
                }
            } catch (e) {
                console.error('[AttendanceReminder] Error loading user:', e);
            }
        };
        loadUser();
    }, []);

    // Get today's date string for dismissed tracking
    const getTodayKey = () => {
        return new Date().toISOString().split('T')[0];
    };

    // Check if reminder was dismissed today
    const isDismissedToday = async (reminderType) => {
        try {
            const dismissed = await SecureStore.getItemAsync(STORAGE_KEYS.DISMISSED_TODAY);
            if (dismissed) {
                const data = JSON.parse(dismissed);
                return data.date === getTodayKey() && data.types?.includes(reminderType);
            }
        } catch (e) {
            console.error('[AttendanceReminder] Error checking dismissed:', e);
        }
        return false;
    };

    // Mark reminder as dismissed for today
    const dismissReminderForToday = async (reminderType) => {
        try {
            const dismissed = await SecureStore.getItemAsync(STORAGE_KEYS.DISMISSED_TODAY);
            let data = { date: getTodayKey(), types: [] };

            if (dismissed) {
                const parsed = JSON.parse(dismissed);
                if (parsed.date === getTodayKey()) {
                    data = parsed;
                }
            }

            if (!data.types.includes(reminderType)) {
                data.types.push(reminderType);
            }

            await SecureStore.setItemAsync(STORAGE_KEYS.DISMISSED_TODAY, JSON.stringify(data));
        } catch (e) {
            console.error('[AttendanceReminder] Error dismissing reminder:', e);
        }
    };

    // Dismiss current reminder
    const dismissReminder = useCallback(async (dontShowAgainToday = false) => {
        if (dontShowAgainToday && activeReminder) {
            await dismissReminderForToday(activeReminder.type);
        }
        setIsReminderVisible(false);
        setActiveReminder(null);
    }, [activeReminder]);

    // Show a reminder modal
    const showReminder = useCallback(async (type, data = {}) => {
        // Check if dismissed for today
        if (await isDismissedToday(type)) {
            console.log(`[AttendanceReminder] ${type} dismissed for today, skipping`);
            return;
        }

        setActiveReminder({ type, ...data });
        setIsReminderVisible(true);
    }, []);

    // Schedule a local push notification
    const scheduleNotification = async (triggerTime, title, body, identifier) => {
        try {
            const now = new Date();
            if (triggerTime <= now) {
                console.log(`[AttendanceReminder] Skipping past notification: ${identifier}`);
                return null;
            }

            const id = await Notifications.scheduleNotificationAsync({
                content: {
                    title,
                    body,
                    sound: true,
                    data: { type: 'attendance_reminder', identifier },
                },
                trigger: { date: triggerTime },
            });

            console.log(`[AttendanceReminder] Scheduled notification ${identifier} for ${triggerTime}`);
            return id;
        } catch (e) {
            console.error('[AttendanceReminder] Error scheduling notification:', e);
            return null;
        }
    };

    // Cancel all scheduled attendance notifications
    const cancelScheduledNotifications = async () => {
        try {
            const stored = await SecureStore.getItemAsync(STORAGE_KEYS.SCHEDULED_NOTIFICATIONS);
            if (stored) {
                const ids = JSON.parse(stored);
                for (const id of ids) {
                    await Notifications.cancelScheduledNotificationAsync(id);
                }
                await SecureStore.deleteItemAsync(STORAGE_KEYS.SCHEDULED_NOTIFICATIONS);
            }
        } catch (e) {
            console.error('[AttendanceReminder] Error canceling notifications:', e);
        }
    };

    // Store scheduled notification IDs
    const storeNotificationIds = async (ids) => {
        try {
            const filtered = ids.filter(Boolean);
            if (filtered.length > 0) {
                await SecureStore.setItemAsync(STORAGE_KEYS.SCHEDULED_NOTIFICATIONS, JSON.stringify(filtered));
            }
        } catch (e) {
            console.error('[AttendanceReminder] Error storing notification IDs:', e);
        }
    };

    // Fetch attendance settings and status (single API call)
    const fetchAttendanceData = useCallback(async () => {
        if (!user?.id || !user?.schoolId || !isTeachingStaff) {
            setIsLoading(false);
            return;
        }

        try {
            const res = await api.get(`/schools/${user.schoolId}/attendance/mark?userId=${user.id}`);
            const data = res.data;

            setAttendanceSettings(data.config);
            setAttendanceStatus({
                attendance: data.attendance,
                isWorkingDay: data.isWorkingDay,
                dayType: data.dayType,
                windows: data.windows,
            });

            // Cache settings
            await SecureStore.setItemAsync(STORAGE_KEYS.ATTENDANCE_SETTINGS, JSON.stringify({
                config: data.config,
                windows: data.windows,
                timestamp: Date.now(),
            }));

            console.log('[AttendanceReminder] Fetched attendance data');
            return data;
        } catch (e) {
            console.error('[AttendanceReminder] Error fetching attendance data:', e);

            // Try to use cached settings
            try {
                const cached = await SecureStore.getItemAsync(STORAGE_KEYS.ATTENDANCE_SETTINGS);
                if (cached) {
                    const data = JSON.parse(cached);
                    setAttendanceSettings(data.config);
                    console.log('[AttendanceReminder] Using cached settings');
                }
            } catch (cacheError) {
                console.error('[AttendanceReminder] Cache read error:', cacheError);
            }
        } finally {
            setIsLoading(false);
        }
    }, [user, isTeachingStaff]);

    // Schedule all reminders based on current time and settings
    const scheduleReminders = useCallback(async (data) => {
        if (!data || !data.isWorkingDay || hasScheduledToday.current) {
            return;
        }

        const now = new Date();
        const todayStr = getTodayKey();

        // Clear existing timers
        timersRef.current.forEach(timer => clearTimeout(timer));
        timersRef.current = [];

        // Cancel existing notifications
        await cancelScheduledNotifications();

        const { windows, config, attendance } = data;
        const notificationIds = [];

        if (!windows?.checkIn) {
            console.log('[AttendanceReminder] No check-in window, skipping scheduling');
            return;
        }

        const checkInStart = new Date(windows.checkIn.start);
        const checkInEnd = new Date(windows.checkIn.end);
        const checkOutStart = windows.checkOut ? new Date(windows.checkOut.start) : null;
        const checkOutEnd = windows.checkOut ? new Date(windows.checkOut.end) : null;

        const gracePeriodMs = (config?.gracePeriod || 15) * 60 * 1000;
        const graceEnd = new Date(checkInStart.getTime() + gracePeriodMs);

        const isCheckedIn = !!attendance?.checkInTime;
        const isCheckedOut = !!attendance?.checkOutTime;

        // 1. CHECK_IN_OPEN - When check-in window opens
        if (!isCheckedIn && checkInStart > now) {
            const delay = checkInStart.getTime() - now.getTime();

            // Modal reminder
            const timer = setTimeout(async () => {
                await showReminder(REMINDER_TYPES.CHECK_IN_OPEN, {
                    title: '🕐 Check-In Time!',
                    message: 'Good morning! Attendance check-in is now open.',
                    windowEnd: checkInEnd,
                });
            }, delay);
            timersRef.current.push(timer);

            // Push notification
            const notifId = await scheduleNotification(
                checkInStart,
                '🕐 Check-In Open',
                'Attendance check-in is now available. Mark your attendance!',
                'check_in_open'
            );
            notificationIds.push(notifId);
        } else if (!isCheckedIn && now >= checkInStart && now < checkInEnd) {
            // Already in check-in window, show immediately
            await showReminder(REMINDER_TYPES.CHECK_IN_OPEN, {
                title: '🕐 Check-In Available',
                message: 'Attendance check-in is open. Mark your attendance now!',
                windowEnd: checkInEnd,
            });
        }

        // 2. LATE_WARNING - After grace period ends (if not checked in)
        if (!isCheckedIn && graceEnd > now) {
            const delay = graceEnd.getTime() - now.getTime();

            const timer = setTimeout(async () => {
                // Re-check attendance status
                const currentStatus = await api.get(`/schools/${user.schoolId}/attendance/mark?userId=${user.id}`);
                if (!currentStatus.data?.attendance?.checkInTime) {
                    await showReminder(REMINDER_TYPES.LATE_WARNING, {
                        title: '⚠️ Grace Period Ended',
                        message: 'You are now late for check-in! Mark attendance to avoid absence.',
                        isUrgent: true,
                    });
                }
            }, delay);
            timersRef.current.push(timer);

            // Push notification
            const notifId = await scheduleNotification(
                graceEnd,
                '⚠️ Late Warning',
                'Grace period has ended! Check in now to avoid being marked late.',
                'late_warning'
            );
            notificationIds.push(notifId);
        }

        // 3. CHECK_IN_CLOSED - When check-in window closes (if not checked in)
        if (!isCheckedIn && checkInEnd > now) {
            const notifId = await scheduleNotification(
                checkInEnd,
                '🔒 Check-In Closed',
                'Check-in window has closed. Contact admin if you need regularization.',
                'check_in_closed'
            );
            notificationIds.push(notifId);
        }

        // 4. CHECK_OUT_OPEN - When check-out window opens (if checked in)
        if (isCheckedIn && !isCheckedOut && checkOutStart && checkOutStart > now) {
            const delay = checkOutStart.getTime() - now.getTime();

            const timer = setTimeout(async () => {
                await showReminder(REMINDER_TYPES.CHECK_OUT_OPEN, {
                    title: '🏠 Check-Out Time!',
                    message: 'You can now check out. Don\'t forget to mark your exit!',
                    windowEnd: checkOutEnd,
                });
            }, delay);
            timersRef.current.push(timer);

            // Push notification
            const notifId = await scheduleNotification(
                checkOutStart,
                '🏠 Check-Out Open',
                'Check-out window is now open. Mark your exit attendance!',
                'check_out_open'
            );
            notificationIds.push(notifId);
        }

        // 5. CHECK_OUT_WARNING - 15 min before check-out closes (if not checked out)
        if (isCheckedIn && !isCheckedOut && checkOutEnd) {
            const warningTime = new Date(checkOutEnd.getTime() - 15 * 60 * 1000);

            if (warningTime > now) {
                const delay = warningTime.getTime() - now.getTime();

                const timer = setTimeout(async () => {
                    // Re-check status
                    const currentStatus = await api.get(`/schools/${user.schoolId}/attendance/mark?userId=${user.id}`);
                    if (currentStatus.data?.attendance?.checkInTime && !currentStatus.data?.attendance?.checkOutTime) {
                        await showReminder(REMINDER_TYPES.CHECK_OUT_WARNING, {
                            title: '⏰ Check-Out Closing Soon!',
                            message: 'Only 15 minutes left to check out. Don\'t miss it!',
                            isUrgent: true,
                        });
                    }
                }, delay);
                timersRef.current.push(timer);

                // Push notification
                const notifId = await scheduleNotification(
                    warningTime,
                    '⏰ Check-Out Closing',
                    'Only 15 minutes left! Check out before the window closes.',
                    'check_out_warning'
                );
                notificationIds.push(notifId);
            }
        }

        // Store notification IDs
        await storeNotificationIds(notificationIds);
        hasScheduledToday.current = true;

        console.log(`[AttendanceReminder] Scheduled ${timersRef.current.length} timers, ${notificationIds.filter(Boolean).length} notifications`);
    }, [user, showReminder]);

    // Initialize and fetch data
    useEffect(() => {
        if (user && isTeachingStaff) {
            fetchAttendanceData().then(data => {
                if (data) {
                    scheduleReminders(data);
                }
            });
        }
    }, [user, isTeachingStaff, fetchAttendanceData, scheduleReminders]);

    // Handle app state changes
    useEffect(() => {
        const subscription = AppState.addEventListener('change', async (nextAppState) => {
            if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                // App became active - refresh status and reschedule if needed
                console.log('[AttendanceReminder] App became active, checking reminders');

                // Reset scheduling flag at start of new day
                const today = getTodayKey();
                const lastCheck = await SecureStore.getItemAsync('attendance_last_check_date');
                if (lastCheck !== today) {
                    hasScheduledToday.current = false;
                    await SecureStore.setItemAsync('attendance_last_check_date', today);
                }

                if (user && isTeachingStaff) {
                    const data = await fetchAttendanceData();
                    if (data && !hasScheduledToday.current) {
                        await scheduleReminders(data);
                    }
                }
            }
            appState.current = nextAppState;
        });

        return () => subscription.remove();
    }, [user, isTeachingStaff, fetchAttendanceData, scheduleReminders]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            timersRef.current.forEach(timer => clearTimeout(timer));
        };
    }, []);

    // Refresh attendance data (for manual refresh)
    const refreshAttendance = useCallback(async () => {
        setIsLoading(true);
        const data = await fetchAttendanceData();
        if (data) {
            // Reschedule reminders based on new data
            hasScheduledToday.current = false;
            await scheduleReminders(data);
        }
    }, [fetchAttendanceData, scheduleReminders]);

    // DEBUG: Manual trigger for testing reminders at any time
    // Call this from a dev menu or console to test
    const triggerTestReminder = useCallback(async (type = REMINDER_TYPES.CHECK_IN_OPEN) => {
        console.log('[AttendanceReminder] DEBUG: Triggering test reminder:', type);

        const testData = {
            [REMINDER_TYPES.CHECK_IN_OPEN]: {
                title: '🕐 Check-In Time!',
                message: '[TEST] Good morning! Attendance check-in is now open.',
                windowEnd: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
            },
            [REMINDER_TYPES.LATE_WARNING]: {
                title: '⚠️ Grace Period Ended',
                message: '[TEST] You are now late for check-in! Mark attendance to avoid absence.',
                isUrgent: true,
            },
            [REMINDER_TYPES.CHECK_OUT_OPEN]: {
                title: '🏠 Check-Out Time!',
                message: '[TEST] You can now check out. Don\'t forget to mark your exit!',
                windowEnd: new Date(Date.now() + 1 * 60 * 60 * 1000),
            },
            [REMINDER_TYPES.CHECK_OUT_WARNING]: {
                title: '⏰ Check-Out Closing Soon!',
                message: '[TEST] Only 15 minutes left to check out. Don\'t miss it!',
                isUrgent: true,
            },
        };

        const data = testData[type] || testData[REMINDER_TYPES.CHECK_IN_OPEN];
        setActiveReminder({ type, ...data });
        setIsReminderVisible(true);
    }, []);

    const value = {
        // State
        activeReminder,
        isReminderVisible,
        attendanceSettings,
        attendanceStatus,
        isLoading,
        isTeachingStaff,

        // Actions
        dismissReminder,
        refreshAttendance,
        triggerTestReminder, // DEBUG: For testing
    };

    return (
        <AttendanceReminderContext.Provider value={value}>
            {children}
        </AttendanceReminderContext.Provider>
    );
}

// Stable default value to prevent re-renders when used outside provider
const DEFAULT_CONTEXT = {
    activeReminder: null,
    isReminderVisible: false,
    attendanceSettings: null,
    attendanceStatus: null,
    isLoading: false,
    isTeachingStaff: false,
    dismissReminder: () => { },
    refreshAttendance: () => { },
    triggerTestReminder: () => { }, // DEBUG
};

export function useAttendanceReminder() {
    const context = useContext(AttendanceReminderContext);
    // Return stable default if no provider found
    return context || DEFAULT_CONTEXT;
}
