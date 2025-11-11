// Mobile Self Attendance - app/(tabs)/attendance.jsx
import React, { useState, useEffect } from 'react';
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
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
    Calendar,
    Clock,
    MapPin,
    CheckCircle,
    XCircle,
    Clock4,
    AlertCircle,
    TrendingUp
} from 'lucide-react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function SelfAttendance() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [location, setLocation] = useState(null);
    const [deviceInfo, setDeviceInfo] = useState(null);

    // Get location and device info
    useEffect(() => {
        (async () => {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const loc = await Location.getCurrentPositionAsync({});
                setLocation({
                    latitude: loc.coords.latitude,
                    longitude: loc.coords.longitude,
                    accuracy: loc.coords.accuracy
                });
            }

            setDeviceInfo({
                deviceId: Device.modelName,
                platform: Platform.OS,
                osVersion: Platform.Version
            });
        })();
    }, []);

    // Fetch today's attendance status
    const { data, isLoading } = useQuery({
        queryKey: ['self-attendance-status'],
        queryFn: async () => {
            const res = await fetch(`/api/schools/school-id/attendance/mark?userId=user-id`);
            return res.json();
        },
        refetchInterval: 60000, // Refresh every minute
    });

    const { attendance, isWorkingDay, dayType, config } = data || {};

    // Check-in mutation
    const checkInMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/schools/school-id/attendance/mark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: 'user-id', // Replace with actual user ID
                    type: 'CHECK_IN',
                    location,
                    deviceInfo
                })
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.message || result.error);
            return result;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['self-attendance-status']);
            Alert.alert(
                data.isLate ? 'Checked In (Late)' : 'Checked In',
                data.message,
                [{ text: 'OK' }]
            );
        },
        onError: (error) => {
            Alert.alert('Error', error.message);
        }
    });

    // Check-out mutation
    const checkOutMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch('/api/schools/school-id/attendance/mark', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: 'user-id',
                    type: 'CHECK_OUT',
                    location,
                    deviceInfo
                })
            });
            const result = await res.json();
            if (!result.success) throw new Error(result.message || result.error);
            return result;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries(['self-attendance-status']);
            Alert.alert(
                'Checked Out',
                `Working hours: ${data.workingHours?.toFixed(2)} hours`,
                [{ text: 'OK' }]
            );
        },
        onError: (error) => {
            Alert.alert('Error', error.message);
        }
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['self-attendance-status']);
        setRefreshing(false);
    };

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
            </View>
        );
    }

    const canCheckIn = isWorkingDay && !attendance;
    const canCheckOut = attendance && attendance.checkInTime && !attendance.checkOutTime;
    const isCheckedIn = attendance && attendance.checkInTime && !attendance.checkOutTime;

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
                        <Text style={styles.headerDate}>{new Date().toLocaleDateString('en-US', {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric'
                        })}</Text>
                    </View>
                    {config?.enableGeoFencing && (
                        <View style={styles.locationBadge}>
                            <MapPin size={16} color="#10B981" />
                            <Text style={styles.locationText}>GPS Active</Text>
                        </View>
                    )}
                </View>
            </Animated.View>

            {/* Working Day Status */}
            {!isWorkingDay && (
                <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.alertCard}>
                    <AlertCircle size={24} color="#F59E0B" />
                    <View style={styles.alertContent}>
                        <Text style={styles.alertTitle}>
                            {dayType === 'HOLIDAY' ? 'Holiday' : dayType === 'WEEKEND' ? 'Weekend' : 'Non-Working Day'}
                        </Text>
                        <Text style={styles.alertMessage}>Attendance marking is not required today</Text>
                    </View>
                </Animated.View>
            )}

            {/* Current Status Card */}
            <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.statusCard}>
                {!attendance ? (
                    <>
                        <View style={styles.statusIcon}>
                            <Clock size={48} color="#94A3B8" />
                        </View>
                        <Text style={styles.statusTitle}>Not Marked Yet</Text>
                        <Text style={styles.statusSubtitle}>
                            {config ? `Check-in before ${config.startTime}` : 'Mark your attendance'}
                        </Text>
                    </>
                ) : (
                    <>
                        <View style={[
                            styles.statusIcon,
                            {
                                backgroundColor: attendance.status === 'PRESENT' ? '#DCFCE7' :
                                    attendance.status === 'LATE' ? '#FEF3C7' : '#FEE2E2'
                            }
                        ]}>
                            {attendance.status === 'PRESENT' ? (
                                <CheckCircle size={48} color="#10B981" />
                            ) : attendance.status === 'LATE' ? (
                                <Clock4 size={48} color="#F59E0B" />
                            ) : (
                                <XCircle size={48} color="#EF4444" />
                            )}
                        </View>
                        <Text style={styles.statusTitle}>
                            {attendance.status === 'PRESENT' ? 'Checked In' :
                                attendance.status === 'LATE' ? 'Checked In (Late)' :
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
                        {attendance.isLateCheckIn && (
                            <View style={styles.lateBadge}>
                                <Text style={styles.lateBadgeText}>
                                    Late by {attendance.lateByMinutes} minutes
                                </Text>
                            </View>
                        )}
                    </>
                )}
            </Animated.View>

            {/* Action Buttons */}
            {isWorkingDay && (
                <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.actionContainer}>
                    {canCheckIn && (
                        <AnimatedPressable
                            entering={FadeInUp.delay(500).duration(400)}
                            style={[styles.actionButton, styles.checkInButton]}
                            onPress={() => checkInMutation.mutate()}
                            disabled={checkInMutation.isPending}
                        >
                            {checkInMutation.isPending ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <CheckCircle size={24} color="#fff" />
                                    <Text style={styles.actionButtonText}>Check In</Text>
                                </>
                            )}
                        </AnimatedPressable>
                    )}

                    {canCheckOut && (
                        <AnimatedPressable
                            entering={FadeInUp.delay(600).duration(400)}
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

            {/* Today's Timeline */}
            {attendance && (
                <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.timelineCard}>
                    <Text style={styles.timelineTitle}>Today's Timeline</Text>
                    <View style={styles.timeline}>
                        <View style={styles.timelineItem}>
                            <View style={styles.timelineDot} />
                            <View style={styles.timelineContent}>
                                <Text style={styles.timelineLabel}>Check In</Text>
                                <Text style={styles.timelineValue}>
                                    {attendance.checkInTime
                                        ? new Date(attendance.checkInTime).toLocaleTimeString()
                                        : '-'}
                                </Text>
                            </View>
                        </View>

                        {attendance.checkOutTime && (
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineDot} />
                                <View style={styles.timelineContent}>
                                    <Text style={styles.timelineLabel}>Check Out</Text>
                                    <Text style={styles.timelineValue}>
                                        {new Date(attendance.checkOutTime).toLocaleTimeString()}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {attendance.workingHours > 0 && (
                            <View style={styles.timelineItem}>
                                <View style={styles.timelineDot} />
                                <View style={styles.timelineContent}>
                                    <Text style={styles.timelineLabel}>Working Hours</Text>
                                    <Text style={styles.timelineValue}>
                                        {attendance.workingHours.toFixed(2)} hours
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                </Animated.View>
            )}

            {/* Info Cards */}
            <View style={styles.infoGrid}>
                <Animated.View entering={FadeInDown.delay(600).duration(400)} style={styles.infoCard}>
                    <Clock size={20} color="#0469ff" />
                    <Text style={styles.infoLabel}>Office Hours</Text>
                    <Text style={styles.infoValue}>
                        {config ? `${config.startTime} - ${config.endTime}` : 'Not set'}
                    </Text>
                </Animated.View>

                <Animated.View entering={FadeInDown.delay(700).duration(400)} style={styles.infoCard}>
                    <TrendingUp size={20} color="#10B981" />
                    <Text style={styles.infoLabel}>This Month</Text>
                    <Text style={styles.infoValue}>-</Text>
                </Animated.View>
            </View>

            {/* Location Info */}
            {config?.enableGeoFencing && (
                <Animated.View entering={FadeInDown.delay(800).duration(400)} style={styles.locationCard}>
                    <MapPin size={20} color="#0469ff" />
                    <View style={styles.locationInfo}>
                        <Text style={styles.locationTitle}>Location Verification</Text>
                        <Text style={styles.locationDesc}>
                            You must be within {config.allowedRadius}m of school to mark attendance
                        </Text>
                    </View>
                </Animated.View>
            )}

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 20,
        backgroundColor: '#fff',
    },
    headerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111',
        marginBottom: 4,
    },
    headerDate: {
        fontSize: 15,
        color: '#666',
    },
    locationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#DCFCE7',
        borderRadius: 12,
    },
    locationText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#10B981',
    },
    alertCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        margin: 20,
        padding: 16,
        backgroundColor: '#FEF3C7',
        borderRadius: 16,
    },
    alertContent: {
        flex: 1,
    },
    alertTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#92400E',
        marginBottom: 2,
    },
    alertMessage: {
        fontSize: 14,
        color: '#92400E',
    },
    statusCard: {
        margin: 20,
        padding: 32,
        backgroundColor: '#fff',
        borderRadius: 24,
        alignItems: 'center',
        // shadowColor: '#000',
        // shadowOffset: { width: 0, height: 2 },
        // shadowOpacity: 0.1,
        // shadowRadius: 8,
        // elevation: 4,
    },
    statusIcon: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    statusTitle: {
        fontSize: 24,
        fontWeight: '700',
        color: '#111',
        marginBottom: 4,
    },
    statusSubtitle: {
        fontSize: 16,
        color: '#666',
    },
    lateBadge: {
        marginTop: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#FEF3C7',
        borderRadius: 12,
    },
    lateBadgeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#92400E',
    },
    actionContainer: {
        paddingHorizontal: 20,
        gap: 12,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 18,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
    },
    checkInButton: {
        backgroundColor: '#0469ff',
    },
    checkOutButton: {
        backgroundColor: '#10B981',
    },
    actionButtonText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    timelineCard: {
        margin: 20,
        padding: 20,
        backgroundColor: '#fff',
        borderRadius: 16,
    },
    timelineTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
        marginBottom: 16,
    },
    timeline: {
        gap: 16,
    },
    timelineItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    timelineDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#0469ff',
    },
    timelineContent: {
        flex: 1,
    },
    timelineLabel: {
        fontSize: 13,
        color: '#666',
        marginBottom: 2,
    },
    timelineValue: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    infoGrid: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 12,
    },
    infoCard: {
        flex: 1,
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 16,
        gap: 8,
    },
    infoLabel: {
        fontSize: 13,
        color: '#666',
    },
    infoValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    locationCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        margin: 20,
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 16,
    },
    locationInfo: {
        flex: 1,
    },
    locationTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
        marginBottom: 4,
    },
    locationDesc: {
        fontSize: 13,
        color: '#666',
        lineHeight: 18,
    },
});