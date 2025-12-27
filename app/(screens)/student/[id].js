import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronLeft, Mail, Phone, MapPin, Calendar, BookOpen, User, Users, GraduationCap } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function StudentDetailScreen() {
    const { id, schoolId } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);

    console.log('📱 Student Detail Params:', { id, schoolId });

    const { data: student, isLoading, error, refetch } = useQuery({
        queryKey: ['student-detail', id],
        queryFn: async () => {
            console.log('📡 Fetching student:', `/schools/${schoolId}/students/${id}`);
            const res = await api.get(`/schools/${schoolId}/students/${id}`);
            console.log('📦 Student data:', res.data);
            return res.data;
        },
        enabled: !!id && !!schoolId,
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#3B82F6" />
                </View>
            </SafeAreaView>
        );
    }

    if (error || !student) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <ChevronLeft size={24} color="#1F2937" />
                    </HapticTouchable>
                    <Text style={styles.headerTitle}>Student Details</Text>
                    <View style={{ width: 24 }} />
                </View>
                <View style={styles.loadingContainer}>
                    <Text style={{ color: '#EF4444', fontSize: 16 }}>
                        {error?.message || 'Student not found'}
                    </Text>
                    <Text style={{ color: '#9CA3AF', marginTop: 8 }}>
                        ID: {id} | School: {schoolId}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Student Details</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Profile Card */}
                <View style={styles.profileCard}>
                    {student?.profilePicture ? (
                        <Image source={{ uri: student.profilePicture }} style={styles.profileImage} />
                    ) : (
                        <View style={[styles.profileImage, styles.profilePlaceholder]}>
                            <Text style={styles.profileInitial}>{student?.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                        </View>
                    )}
                    <Text style={styles.profileName}>{student?.name || 'Unknown'}</Text>
                    <Text style={styles.profileClass}>
                        {student?.class?.name || student?.className || 'No Class'}
                        {student?.section?.name ? ` • ${student.section.name}` : ''}
                    </Text>
                    <View style={styles.admissionBadge}>
                        <Text style={styles.admissionText}>Adm No: {student?.admissionNo || student?.admissionNumber || 'N/A'}</Text>
                    </View>
                </View>

                {/* Info Cards */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Personal Information</Text>

                    <View style={styles.infoCard}>
                        <InfoRow icon={User} label="Full Name" value={student?.name || 'N/A'} />
                        <InfoRow icon={Mail} label="Email" value={student?.email || 'N/A'} />
                        <InfoRow icon={Phone} label="Phone" value={student?.phone || student?.contactNumber || 'N/A'} />
                        <InfoRow icon={Calendar} label="Date of Birth" value={student?.dob || 'N/A'} />
                        <InfoRow icon={User} label="Gender" value={student?.gender || 'N/A'} />
                        <InfoRow icon={MapPin} label="Address" value={student?.address || 'N/A'} isLast />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Academic Information</Text>

                    <View style={styles.infoCard}>
                        <InfoRow icon={BookOpen} label="Class" value={student?.class?.name || student?.className || 'N/A'} />
                        <InfoRow icon={GraduationCap} label="Section" value={student?.section?.name || 'N/A'} />
                        <InfoRow icon={Calendar} label="Roll Number" value={student?.rollNo || 'N/A'} />
                        <InfoRow icon={Calendar} label="Admission Date" value={student?.admissionDate || 'N/A'} isLast />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Guardian Information</Text>

                    <View style={styles.infoCard}>
                        <InfoRow icon={Users} label="Father's Name" value={student?.fatherName || 'N/A'} />
                        <InfoRow icon={Users} label="Mother's Name" value={student?.motherName || 'N/A'} />
                        <InfoRow icon={Phone} label="Guardian Phone" value={student?.guardianPhone || student?.parentPhone || 'N/A'} isLast />
                    </View>
                </View>

                {/* Status */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Status</Text>
                    <View style={[styles.statusCard, { backgroundColor: student?.status === 'ACTIVE' || student?.status === 'active' ? '#DCFCE7' : '#FEE2E2' }]}>
                        <Text style={[styles.statusText, { color: student?.status === 'ACTIVE' || student?.status === 'active' ? '#16A34A' : '#DC2626' }]}>
                            {student?.status || 'Active'}
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const InfoRow = ({ icon: Icon, label, value, isLast }) => (
    <View style={[styles.infoRow, !isLast && styles.infoRowBorder]}>
        <View style={styles.infoIcon}>
            <Icon size={18} color="#6B7280" />
        </View>
        <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
        </View>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    headerTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    profileCard: { alignItems: 'center', padding: 24, backgroundColor: '#FFFFFF', margin: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB' },
    profileImage: { width: 100, height: 100, borderRadius: 50 },
    profilePlaceholder: { backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center' },
    profileInitial: { fontSize: 40, fontWeight: '700', color: '#3B82F6' },
    profileName: { fontSize: 22, fontWeight: '700', color: '#1F2937', marginTop: 16 },
    profileClass: { fontSize: 16, color: '#6B7280', marginTop: 4 },
    admissionBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 12 },
    admissionText: { fontSize: 14, fontWeight: '600', color: '#3B82F6' },
    section: { paddingHorizontal: 16, marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 12 },
    infoCard: { backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' },
    infoRow: { flexDirection: 'row', padding: 16, alignItems: 'center' },
    infoRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    infoIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    infoContent: { flex: 1, marginLeft: 12 },
    infoLabel: { fontSize: 12, color: '#9CA3AF' },
    infoValue: { fontSize: 15, color: '#1F2937', fontWeight: '500', marginTop: 2 },
    statusCard: { padding: 16, borderRadius: 12, alignItems: 'center' },
    statusText: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
});
