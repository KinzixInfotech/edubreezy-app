// app/(tabs)/attendance.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Pressable,
    ScrollView,
    RefreshControl,
    Alert,
    Platform,
    ActivityIndicator
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
    Calendar,
    Clock,
    MapPin,
    CheckCircle,
    XCircle,
    Clock4,
    AlertCircle,
    TrendingUp,
    Timer
} from 'lucide-react-native';
import api from '../../lib/api';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function SelfAttendance() {
    const [user, setUser] = useState(null);
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [location, setLocation] = useState(null);
    const [locationError, setLocationError] = useState(null);
    const [deviceInfo, setDeviceInfo] = useState(null);

    // === TIMER STATE ===
    const [timeLeft, setTimeLeft] = useState('');
    const [checkInDeadline, setCheckInDeadline] = useState(null);
    const intervalRef = useRef(null);

    // Load user
    useEffect(() => {
        loadUser();
    }, []);

    const loadUser = async () => {
        try {
            const stored = await SecureStore.getItemAsync('user');
            if (stored) {
                const parsed = JSON.parse(stored);
                setUser(parsed);
            } else {
                Alert.alert('Error', 'User not found. Please log in again.');
            }
        } catch (error) {
            console.error('Failed to load user:', error);
            Alert.alert('Error', 'Failed to load user data');
        }
    };

    const user_acc = useMemo(() => user, [user]);
    const userId = user_acc?.id;
    const schoolId = user_acc?.schoolId;

    // === LOCATION & DEVICE ===
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
                console.error('Location error:', err);
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

    // === FETCH ATTENDANCE ===
    const { data, isLoading, error } = useQuery({
        queryKey: ['self-attendance-status', userId, schoolId],
        queryFn: async () => {
            if (!userId || !schoolId) throw new Error('Missing user or school ID');
            const res = await api.get(`/schools/${schoolId}/attendance/mark?userId=${userId}`);
            return res.data;
        },
        enabled: !!userId && !!schoolId,
        refetchInterval: 60000,
        retry: 2,
        onError: (err) => {
            console.error('Query error:', err);
            Alert.alert('Network Error', err.message || 'Failed to load attendance');
        }
    });

    const { attendance, isWorkingDay, dayType, config, monthlyStats } = data || {};

    // === CALCULATE DEADLINE & TIMER ===
    useEffect(() => {
        if (!config?.startTime || !isWorkingDay || attendance?.checkInTime) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }

        const [hours, minutes] = config.startTime.split(':').map(Number);
        const today = new Date();
        const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes);
        const deadline = new Date(start);
        deadline.setHours(deadline.getHours() + 3); // 3-hour window

        setCheckInDeadline(deadline);

        const updateTimer = () => {
            const now = new Date();
            const diff = deadline.getTime() - now.getTime();

            if (diff <= 0) {
                setTimeLeft('Window closed');
                if (intervalRef.current) clearInterval(intervalRef.current);
                return;
            }

            const hrs = Math.floor(diff / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            setTimeLeft(`${hrs}h ${mins}m left`);
        };

        updateTimer();
        intervalRef.current = setInterval(updateTimer, 60000); // Update every minute

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [config?.startTime, isWorkingDay, attendance?.checkInTime]);

    // === MUTATIONS ===
    const checkInMutation = useMutation({
        mutationFn: async () => {
            if (!location) throw new Error('Location not available');
            if (!userId || !schoolId) throw new Error('User not ready');

            return await api.post(`/schools/${schoolId}/attendance/mark`, {
                userId,
                type: 'CHECK_IN',
                location,
                deviceInfo
            });
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] });
            const { isLate, message } = res.data;
            Alert.alert(
                isLate ? 'Checked In (Late)' : 'Checked In',
                message || 'Success!',
                [{ text: 'OK' }]
            );
        },
        onError: (err) => {
            Alert.alert('Check-In Failed', err.message || 'Try again');
        }
    });

    const checkOutMutation = useMutation({
        mutationFn: async () => {
            if (!location) throw new Error('Location not available');
            if (!userId || !schoolId) throw new Error('User not ready');

            return await api.post(`/schools/${schoolId}/attendance/mark`, {
                userId,
                type: 'CHECK_OUT',
                location,
                deviceInfo
            });
        },
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] });
            const { workingHours } = res.data;
            Alert.alert(
                'Checked Out',
                `Worked ${workingHours?.toFixed(2)} hours`,
                [{ text: 'OK' }]
            );
        },
        onError: (err) => {
            Alert.alert('Check-Out Failed', err.message || 'Try again');
        }
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: ['self-attendance-status'] });
        setRefreshing(false);
    };

    // === CONDITIONS ===
    const canCheckIn = isWorkingDay && (!attendance || !attendance.checkInTime);
    const canCheckOut = attendance?.checkInTime && !attendance?.checkOutTime;

    // === RENDER ===
    if (!userId || !schoolId) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loaderText}>Loading user...</Text>
            </View>
        );
    }

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loaderText}>Loading attendance...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.loaderContainer}>
                <AlertCircle size={48} color="#EF4444" />
                <Text style={styles.errorText}>Failed to load</Text>
                <Pressable onPress={onRefresh} style={styles.retryButton}>
                    <Text style={styles.retryText}>Retry</Text>
                </Pressable>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
            }
        >
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <View style={styles.headerTop}>
                    <View>
                        <Text style={styles.headerTitle}>Mark Attendance</Text>
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

            {/* Non-Working Day */}
            {!isWorkingDay && (
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

            {/* === CHECK-IN DEADLINE BADGE === */}
            {isWorkingDay && canCheckIn && checkInDeadline && (
                <Animated.View entering={FadeInDown.delay(250)} style={styles.deadlineCard}>
                    <Timer size={18} color="#F59E0B" />
                    <View style={styles.deadlineContent}>
                        <Text style={styles.deadlineTitle}>Check-in Window</Text>
                        <Text style={styles.deadlineText}>
                            Until {checkInDeadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' • '}
                            <Text style={styles.countdown}>{timeLeft}</Text>
                        </Text>
                    </View>
                </Animated.View>
            )}

            {/* Grace Period Hint */}
            {isWorkingDay && canCheckIn && config && (
                <Animated.View entering={FadeInDown.delay(300)} style={styles.graceHint}>
                    <Clock4 size={16} color="#6366F1" />
                    <Text style={styles.graceText}>
                        Late after {(() => {
                            const [h, m] = config.startTime.split(':').map(Number);
                            const grace = new Date();
                            grace.setHours(h, m + config.gracePeriod, 0, 0);
                            return grace.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        })()}
                    </Text>
                </Animated.View>
            )}

            {/* Status Card */}
            <Animated.View entering={FadeInDown.delay(350)} style={styles.statusCard}>
                {!attendance ? (
                    <>
                        <View style={styles.statusIcon}>
                            <Clock size={48} color="#94A3B8" />
                        </View>
                        <Text style={styles.statusTitle}>Not Marked</Text>
                        <Text style={styles.statusSubtitle}>
                            {config ? `Check in before ${config.startTime}` : 'Ready to mark'}
                        </Text>
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
                                    attendance.status === 'ABSENT' ? <XCircle size={48} color="#EF4444" /> :
                                        <CheckCircle size={48} color="#6366F1" />}
                        </View>
                        <Text style={styles.statusTitle}>
                            {attendance.status === 'PRESENT' ? 'Checked In' :
                                attendance.status === 'LATE' ? 'Late Check-In' :
                                    attendance.status}
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

            {/* Action Buttons */}
            {isWorkingDay && (
                <Animated.View entering={FadeInDown.delay(400)} style={styles.actionContainer}>
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

            {/* Timeline */}
            {attendance && (
                <Animated.View entering={FadeInDown.delay(500)} style={styles.timelineCard}>
                    <Text style={styles.timelineTitle}>Today's Log</Text>
                    <View style={styles.timeline}>
                        {/* Check In */}
                        <View style={styles.timelineItem}>
                            <View style={styles.timelineDot} />
                            <View style={styles.timelineContent}>
                                <Text style={styles.timelineLabel}>Check In</Text>
                                <Text style={styles.timelineValue}>
                                    {attendance.checkInTime
                                        ? new Date(attendance.checkInTime).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })
                                        : '—'}
                                </Text>
                            </View>
                        </View>

                        {/* Check Out */}
                        {attendance.checkOutTime && (
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineDot} />
                                <View style={styles.timelineContent}>
                                    <Text style={styles.timelineLabel}>Check Out</Text>
                                    <Text style={styles.timelineValue}>
                                        {new Date(attendance.checkOutTime).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit'
                                        })}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Working Hours */}
                        {attendance.workingHours > 0 && (
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineDot} />
                                <View style={styles.timelineContent}>
                                    <Text style={styles.timelineLabel}>Hours</Text>
                                    <Text style={styles.timelineValue}>
                                        {attendance.workingHours.toFixed(2)} hrs
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                </Animated.View>
            )}
            {/* Stats */}
            <View style={styles.infoGrid}>
                <Animated.View entering={FadeInDown.delay(600)} style={styles.infoCard}>
                    <Clock size={20} color="#0469ff" />
                    <Text style={styles.infoLabel}>Office Hours</Text>
                    <Text style={styles.infoValue}>
                        {config ? `${config.startTime} – ${config.endTime}` : '—'}
                    </Text>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(700)} style={styles.infoCard}>
                    <TrendingUp size={20} color="#10B981" />
                    <Text style={styles.infoLabel}>This Month</Text>
                    <Text style={styles.infoValue}>
                        {monthlyStats?.attendancePercentage?.toFixed(0)}%
                    </Text>
                </Animated.View>
            </View>

            {/* GeoFencing Info */}
            {config?.enableGeoFencing && (
                <Animated.View entering={FadeInDown.delay(800)} style={styles.locationCard}>
                    <MapPin size={20} color="#0469ff" />
                    <View style={styles.locationInfo}>
                        <Text style={styles.locationTitle}>GeoFencing Active</Text>
                        <Text style={styles.locationDesc}>
                            Must be within {config.allowedRadius}m of school
                        </Text>
                    </View>
                </Animated.View>
            )}

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

// === STYLES ===
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FA' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    loaderText: { fontSize: 16, color: '#666' },
    errorText: { fontSize: 16, color: '#EF4444', marginTop: 8 },
    retryButton: { marginTop: 16, padding: 12, backgroundColor: '#0469ff', borderRadius: 12 },
    retryText: { color: '#fff', fontWeight: '600' },
    header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20, backgroundColor: '#fff' },
    headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    headerTitle: { fontSize: 28, fontWeight: '700', color: '#111', marginBottom: 4 },
    headerDate: { fontSize: 15, color: '#666' },
    locationBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#DCFCE7', borderRadius: 12 },
    locationText: { fontSize: 12, fontWeight: '600', color: '#10B981' },
    errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: 20, padding: 12, backgroundColor: '#FEE2E2', borderRadius: 12 },
    errorCardText: { fontSize: 14, color: '#991B1B' },
    alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, margin: 20, padding: 16, backgroundColor: '#FEF3C7', borderRadius: 16 },
    alertContent: { flex: 1 },
    alertTitle: { fontSize: 16, fontWeight: '600', color: '#92400E', marginBottom: 2 },
    alertMessage: { fontSize: 14, color: '#333' },
    deadlineCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginTop: 12, padding: 12, backgroundColor: '#FFFBEB', borderColor: '#F59E0B', borderWidth: 1, borderRadius: 12 },
    deadlineContent: { flex: 1 },
    deadlineTitle: { fontSize: 13, fontWeight: '600', color: '#92400E' },
    deadlineText: { fontSize: 13, color: '#92400E', marginTop: 2 },
    countdown: { fontWeight: '700', color: '#D97706' },
    graceHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 20, marginTop: 8 },
    graceText: { fontSize: 12, color: '#6366F1', fontWeight: '500' },
    statusCard: { margin: 20, padding: 32, backgroundColor: '#fff', borderRadius: 24, alignItems: 'center' },
    statusIcon: { width: 96, height: 96, borderRadius: 48, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    statusTitle: { fontSize: 24, fontWeight: '700', color: '#111', marginBottom: 4 },
    statusSubtitle: { fontSize: 16, color: '#666' },
    lateBadge: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FEF3C7', borderRadius: 12 },
    lateBadgeText: { fontSize: 14, fontWeight: '600', color: '#92400E' },
    actionContainer: { paddingHorizontal: 20, gap: 12 },
    actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 18, borderRadius: 16, elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
    checkInButton: { backgroundColor: '#0469ff' },
    checkOutButton: { backgroundColor: '#10B981' },
    actionButtonText: { fontSize: 18, fontWeight: '700', color: '#fff' },
    timelineCard: { margin: 20, padding: 20, backgroundColor: '#fff', borderRadius: 16 },
    timelineTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 },
    timeline: { gap: 16 },
    timelineItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#0469ff' },
    timelineContent: { flex: 1 },
    timelineLabel: { fontSize: 13, color: '#666', marginBottom: 2 },
    timelineValue: { fontSize: 16, fontWeight: '600', color: '#111' },
    infoGrid: { flexDirection: 'row', paddingHorizontal: 20, gap: 12 },
    infoCard: { flex: 1, padding: 16, backgroundColor: '#fff', borderRadius: 16, gap: 8 },
    infoLabel: { fontSize: 13, color: '#666' },
    infoValue: { fontSize: 16, fontWeight: '700', color: '#111' },
    locationCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, margin: 20, padding: 16, backgroundColor: '#fff', borderRadius: 16 },
    locationInfo: { flex: 1 },
    locationTitle: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 4 },
    locationDesc: { fontSize: 13, color: '#666', lineHeight: 18 },
});