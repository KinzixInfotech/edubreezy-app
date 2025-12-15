// Attendance Marking Screen for Conductor
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../../lib/api';

export default function AttendanceMarkingScreen() {
    const { tripId } = useLocalSearchParams();
    const [trip, setTrip] = useState(null);
    const [students, setStudents] = useState([]);
    const [selectedStop, setSelectedStop] = useState(null);
    const [attendance, setAttendance] = useState({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadTripAndStudents();
    }, []);

    const loadTripAndStudents = async () => {
        try {
            const token = await SecureStore.getItemAsync('transportToken');

            // Load trip details
            const tripRes = await fetch(`${API_BASE_URL}/api/schools/transport/trips/${tripId}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (tripRes.ok) {
                const tripData = await tripRes.json();
                setTrip(tripData.trip);

                // Set first stop as default
                if (tripData.trip?.route?.busStops?.length > 0) {
                    setSelectedStop(tripData.trip.route.busStops[0]);
                }

                // Initialize attendance from existing records
                const existingAttendance = {};
                tripData.trip?.attendanceRecords?.forEach(record => {
                    existingAttendance[record.studentId] = record.status;
                });
                setAttendance(existingAttendance);
            }

            // TODO: Load students assigned to route
            // For now, we'll show attendance records from trip
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleMarkAttendance = (studentId, status) => {
        setAttendance(prev => ({ ...prev, [studentId]: status }));
    };

    const submitAttendance = async () => {
        if (!selectedStop) {
            Alert.alert('Select Stop', 'Please select a stop first');
            return;
        }

        const studentsToMark = Object.entries(attendance).map(([studentId, status]) => ({
            studentId,
            status,
        }));

        if (studentsToMark.length === 0) {
            Alert.alert('No Attendance', 'Please mark attendance for at least one student');
            return;
        }

        setSubmitting(true);
        try {
            const token = await SecureStore.getItemAsync('transportToken');
            const staffData = await SecureStore.getItemAsync('transportStaff');
            const staff = staffData ? JSON.parse(staffData) : null;

            let location = null;
            try {
                const loc = await Location.getCurrentPositionAsync({});
                location = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            } catch (e) { }

            const response = await fetch(`${API_BASE_URL}/api/schools/transport/attendance/bulk`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    tripId,
                    stopId: selectedStop.id,
                    markedById: staff?.id,
                    latitude: location?.latitude,
                    longitude: location?.longitude,
                    students: studentsToMark,
                }),
            });

            if (response.ok) {
                const data = await response.json();
                Alert.alert('Success', data.message);
                router.back();
            } else {
                const error = await response.json();
                Alert.alert('Error', error.error || 'Failed to submit attendance');
            }
        } catch (err) {
            Alert.alert('Error', 'Failed to submit attendance');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#6366f1" />
                </View>
            </SafeAreaView>
        );
    }

    const stops = trip?.route?.busStops || [];
    const attendanceRecords = trip?.attendanceRecords || [];

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="light" />
            <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Ionicons name="chevron-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View style={styles.headerContent}>
                    <Text style={styles.headerTitle}>Mark Attendance</Text>
                    <Text style={styles.headerSubtitle}>{trip?.route?.name} • {trip?.tripType}</Text>
                </View>
            </LinearGradient>

            <ScrollView style={styles.content}>
                {/* Stop Selector */}
                <Text style={styles.sectionTitle}>Select Stop</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stopsScroll}>
                    {stops.map(stop => (
                        <TouchableOpacity
                            key={stop.id}
                            style={[styles.stopChip, selectedStop?.id === stop.id && styles.stopChipActive]}
                            onPress={() => setSelectedStop(stop)}
                        >
                            <Text style={[styles.stopChipText, selectedStop?.id === stop.id && styles.stopChipTextActive]}>
                                {stop.orderIndex}. {stop.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Students List */}
                <Text style={styles.sectionTitle}>Students ({attendanceRecords.length})</Text>
                {attendanceRecords.length > 0 ? (
                    attendanceRecords.map(record => (
                        <View key={record.id} style={styles.studentCard}>
                            <View style={styles.studentInfo}>
                                <Text style={styles.studentName}>{record.student?.name}</Text>
                                <Text style={styles.studentId}>{record.student?.admissionNo}</Text>
                            </View>
                            <View style={styles.attendanceButtons}>
                                {['PRESENT', 'ABSENT', 'LATE'].map(status => (
                                    <TouchableOpacity
                                        key={status}
                                        style={[
                                            styles.statusBtn,
                                            attendance[record.studentId] === status && styles[`statusBtn${status}`],
                                        ]}
                                        onPress={() => handleMarkAttendance(record.studentId, status)}
                                    >
                                        <Text style={[
                                            styles.statusBtnText,
                                            attendance[record.studentId] === status && styles.statusBtnTextActive,
                                        ]}>
                                            {status === 'PRESENT' ? '✓' : status === 'ABSENT' ? '✕' : '⏰'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    ))
                ) : (
                    <View style={styles.emptyState}>
                        <Ionicons name="people-outline" size={48} color="#CBD5E1" />
                        <Text style={styles.emptyText}>No students to mark attendance</Text>
                        <Text style={styles.emptySubtext}>Students will appear here when trip progresses</Text>
                    </View>
                )}

                {/* Submit Button */}
                {attendanceRecords.length > 0 && (
                    <TouchableOpacity
                        style={styles.submitBtn}
                        onPress={submitAttendance}
                        disabled={submitting}
                    >
                        <LinearGradient colors={['#10b981', '#059669']} style={styles.submitBtnGradient}>
                            {submitting ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="checkmark-done" size={22} color="#fff" />
                                    <Text style={styles.submitBtnText}>Submit Attendance</Text>
                                </>
                            )}
                        </LinearGradient>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F8FAFC' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { paddingHorizontal: 16, paddingVertical: 20, flexDirection: 'row', alignItems: 'center' },
    backBtn: { padding: 8, marginRight: 12 },
    headerContent: { flex: 1 },
    headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },
    headerSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
    content: { flex: 1, padding: 16 },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1E293B', marginBottom: 12, marginTop: 8 },
    stopsScroll: { marginBottom: 16 },
    stopChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderRadius: 20, marginRight: 10, borderWidth: 1, borderColor: '#E2E8F0' },
    stopChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
    stopChipText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
    stopChipTextActive: { color: '#fff' },
    studentCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, elevation: 1 },
    studentInfo: { flex: 1 },
    studentName: { fontSize: 15, fontWeight: '600', color: '#1E293B' },
    studentId: { fontSize: 13, color: '#64748B', marginTop: 2 },
    attendanceButtons: { flexDirection: 'row', gap: 8 },
    statusBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
    statusBtnPRESENT: { backgroundColor: '#10b981' },
    statusBtnABSENT: { backgroundColor: '#ef4444' },
    statusBtnLATE: { backgroundColor: '#f59e0b' },
    statusBtnText: { fontSize: 16, color: '#64748B' },
    statusBtnTextActive: { color: '#fff' },
    emptyState: { alignItems: 'center', paddingVertical: 48 },
    emptyText: { fontSize: 16, fontWeight: '600', color: '#64748B', marginTop: 12 },
    emptySubtext: { fontSize: 14, color: '#94A3B8', marginTop: 4 },
    submitBtn: { marginTop: 24, marginBottom: 32, borderRadius: 14, overflow: 'hidden' },
    submitBtnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 },
    submitBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
});
