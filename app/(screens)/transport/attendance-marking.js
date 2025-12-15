// Attendance Marking Screen for Conductor
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Dimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, Check, X, Clock, MapPin, Users, Save } from 'lucide-react-native';
import { router, useLocalSearchParams } from 'expo-router';
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
    const [selectedStop, setSelectedStop] = useState(null);
    const [attendance, setAttendance] = useState({});

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

    // Initialize state when data loads
    useEffect(() => {
        if (trip) {
            if (!selectedStop && stops.length > 0) {
                setSelectedStop(stops[0]);
            }

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
            <StatusBar style="dark" />

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
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stopsScroll}>
                        {stops.map(stop => (
                            <HapticTouchable
                                key={stop.id}
                                style={[styles.stopChip, selectedStop?.id === stop.id && styles.stopChipActive]}
                                onPress={() => setSelectedStop(stop)}
                            >
                                <Text style={[styles.stopChipText, selectedStop?.id === stop.id && styles.stopChipTextActive]}>
                                    {stop.orderIndex}. {stop.name}
                                </Text>
                            </HapticTouchable>
                        ))}
                    </ScrollView>
                </View>

                {/* Students List */}
                <ScrollView style={styles.listContainer} contentContainerStyle={{ paddingBottom: 100 }}>
                    {attendanceRecords.length > 0 ? (
                        attendanceRecords.map((record, index) => (
                            <Animated.View
                                key={record.id}
                                entering={FadeInDown.delay(index * 50).duration(400)}
                                style={styles.studentCard}
                            >
                                <View style={styles.studentInfo}>
                                    <View style={styles.avatar}>
                                        <Text style={styles.avatarText}>{record.student?.name?.[0] || 'S'}</Text>
                                    </View>
                                    <View>
                                        <Text style={styles.studentName}>{record.student?.name}</Text>
                                        <Text style={styles.studentId}>{record.student?.admissionNo}</Text>
                                    </View>
                                </View>

                                <View style={styles.actionRow}>
                                    <HapticTouchable
                                        style={[styles.statusBtn, styles.btnPresent, attendance[record.studentId] === 'PRESENT' && styles.btnPresentActive]}
                                        onPress={() => handleMarkAttendance(record.studentId, 'PRESENT')}
                                    >
                                        <Check size={18} color={attendance[record.studentId] === 'PRESENT' ? '#fff' : '#16A34A'} />
                                    </HapticTouchable>

                                    <HapticTouchable
                                        style={[styles.statusBtn, styles.btnAbsent, attendance[record.studentId] === 'ABSENT' && styles.btnAbsentActive]}
                                        onPress={() => handleMarkAttendance(record.studentId, 'ABSENT')}
                                    >
                                        <X size={18} color={attendance[record.studentId] === 'ABSENT' ? '#fff' : '#EF4444'} />
                                    </HapticTouchable>

                                    <HapticTouchable
                                        style={[styles.statusBtn, styles.btnLate, attendance[record.studentId] === 'LATE' && styles.btnLateActive]}
                                        onPress={() => handleMarkAttendance(record.studentId, 'LATE')}
                                    >
                                        <Clock size={18} color={attendance[record.studentId] === 'LATE' ? '#fff' : '#D97706'} />
                                    </HapticTouchable>
                                </View>
                            </Animated.View>
                        ))
                    ) : (
                        <View style={styles.emptyState}>
                            <Users size={48} color="#CBD5E1" />
                            <Text style={styles.emptyText}>No students to list</Text>
                            <Text style={styles.emptySubtext}>Students will appear once trip starts</Text>
                        </View>
                    )}
                </ScrollView>

                {/* Submit Fab */}
                {attendanceRecords.length > 0 && (
                    <View style={styles.footer}>
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
        backgroundColor: '#4F46E5',
        borderColor: '#4F46E5',
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
        backgroundColor: '#4F46E5',
        borderRadius: 14,
        paddingVertical: 16,
        flexDirection: 'row',
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