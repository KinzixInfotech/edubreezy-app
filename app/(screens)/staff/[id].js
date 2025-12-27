import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ChevronLeft, Mail, Phone, MapPin, Calendar, Briefcase, GraduationCap, User } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function StaffDetailScreen() {
    const { id, schoolId } = useLocalSearchParams();
    const [refreshing, setRefreshing] = useState(false);

    const { data: staff, isLoading, refetch } = useQuery({
        queryKey: ['staff-detail', id],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/staff/${id}`);
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

    const isTeaching = staff?.type === 'teaching' || staff?.role?.name === 'TEACHING_STAFF';

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <Stack.Screen options={{ headerShown: false }} />

            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ChevronLeft size={24} color="#1F2937" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Staff Details</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Profile Card */}
                <View style={styles.profileCard}>
                    {staff?.profilePicture ? (
                        <Image source={{ uri: staff.profilePicture }} style={styles.profileImage} />
                    ) : (
                        <View style={[styles.profileImage, styles.profilePlaceholder]}>
                            <Text style={styles.profileInitial}>{staff?.name?.charAt(0)?.toUpperCase() || '?'}</Text>
                        </View>
                    )}
                    <Text style={styles.profileName}>{staff?.name || 'Unknown'}</Text>
                    <Text style={styles.profileRole}>{staff?.designation || 'Staff'}</Text>
                    <View style={[styles.typeBadge, { backgroundColor: isTeaching ? '#DBEAFE' : '#FEF3C7' }]}>
                        {isTeaching ? (
                            <GraduationCap size={16} color="#3B82F6" />
                        ) : (
                            <Briefcase size={16} color="#D97706" />
                        )}
                        <Text style={[styles.typeText, { color: isTeaching ? '#3B82F6' : '#D97706' }]}>
                            {isTeaching ? 'Teaching Staff' : 'Non-Teaching Staff'}
                        </Text>
                    </View>
                </View>

                {/* Info Cards */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Personal Information</Text>

                    <View style={styles.infoCard}>
                        <InfoRow icon={User} label="Employee ID" value={staff?.employeeId || 'N/A'} />
                        <InfoRow icon={Mail} label="Email" value={staff?.email || 'N/A'} />
                        <InfoRow icon={Phone} label="Phone" value={staff?.phone || staff?.contactNumber || 'N/A'} />
                        <InfoRow icon={Calendar} label="Date of Birth" value={staff?.dob || 'N/A'} />
                        <InfoRow icon={MapPin} label="Address" value={staff?.address || 'N/A'} isLast />
                    </View>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Work Information</Text>

                    <View style={styles.infoCard}>
                        <InfoRow icon={Briefcase} label="Department" value={staff?.department || 'N/A'} />
                        <InfoRow icon={GraduationCap} label="Designation" value={staff?.designation || 'N/A'} />
                        <InfoRow icon={Calendar} label="Joining Date" value={staff?.joiningDate || 'N/A'} isLast />
                    </View>
                </View>

                {/* Status */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Status</Text>
                    <View style={[styles.statusCard, { backgroundColor: staff?.status === 'ACTIVE' || staff?.status === 'active' ? '#DCFCE7' : '#FEE2E2' }]}>
                        <Text style={[styles.statusText, { color: staff?.status === 'ACTIVE' || staff?.status === 'active' ? '#16A34A' : '#DC2626' }]}>
                            {staff?.status || 'Active'}
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
    profileRole: { fontSize: 16, color: '#6B7280', marginTop: 4 },
    typeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 12, gap: 8 },
    typeText: { fontSize: 14, fontWeight: '500' },
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
