import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { ChevronLeft, UserCheck, Mail, Phone, Trash2, Plus, User, Lock, AlertCircle } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function ManagePrincipalScreen() {
    const [schoolId, setSchoolId] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const queryClient = useQueryClient();

    // Form state for creating new principal
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        contactNumber: '',
    });
    const [formErrors, setFormErrors] = useState({});

    // Load schoolId from stored user
    useEffect(() => {
        (async () => {
            const stored = await SecureStore.getItemAsync('user');
            if (stored) {
                const parsed = JSON.parse(stored);
                setSchoolId(parsed.schoolId || parsed.school?.id);
            }
        })();
    }, []);

    // Fetch current principal
    const { data, isLoading, refetch } = useQuery({
        queryKey: ['school-principal', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/principal`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    const principal = data?.principal;

    // Create principal mutation
    const createMutation = useMutation({
        mutationFn: async (data) => {
            const res = await api.post(`/schools/${schoolId}/principal`, data);
            return res.data;
        },
        onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Success', 'Principal created successfully! They can now log in with their email and password.');
            setFormData({ name: '', email: '', password: '', contactNumber: '' });
            setFormErrors({});
            queryClient.invalidateQueries({ queryKey: ['school-principal', schoolId] });
        },
        onError: (error) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Error', error.response?.data?.error || 'Failed to create principal');
        },
    });

    // Delete principal mutation
    const deleteMutation = useMutation({
        mutationFn: async () => {
            const res = await api.delete(`/schools/${schoolId}/principal`);
            return res.data;
        },
        onSuccess: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert('Success', 'Principal removed successfully');
            queryClient.invalidateQueries({ queryKey: ['school-principal', schoolId] });
        },
        onError: (error) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Alert.alert('Error', error.response?.data?.error || 'Failed to remove principal');
        },
    });

    const onRefresh = async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    };

    const validateForm = () => {
        const errors = {};
        if (!formData.name || formData.name.trim().length < 2) {
            errors.name = 'Name must be at least 2 characters';
        }
        if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            errors.email = 'Valid email is required';
        }
        if (!formData.password || formData.password.length < 6) {
            errors.password = 'Password must be at least 6 characters';
        }
        setFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreate = () => {
        if (!validateForm()) return;

        Alert.alert(
            'Create Principal',
            `Create principal account for ${formData.name}?\n\nThey will be able to log in with:\nEmail: ${formData.email}`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Create', style: 'default', onPress: () => createMutation.mutate(formData) },
            ]
        );
    };

    const handleDelete = () => {
        Alert.alert(
            'Remove Principal',
            `Are you sure you want to remove ${principal.name}?\n\nThis will permanently delete their account and they will no longer be able to log in.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: () => deleteMutation.mutate() },
            ]
        );
    };

    if (isLoading || !schoolId) {
        return (
            <SafeAreaView style={styles.container} edges={['top']}>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#DC2626" />
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
                <Text style={styles.headerTitle}>Manage Principal</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#DC2626" />}
                contentContainerStyle={styles.content}
            >
                {principal ? (
                    // Show current principal
                    <View style={styles.principalCard}>
                        <View style={styles.cardHeader}>
                            <View style={styles.avatarContainer}>
                                {principal.profilePicture && principal.profilePicture !== 'default.png' ? (
                                    <Image source={{ uri: principal.profilePicture }} style={styles.avatar} />
                                ) : (
                                    <View style={styles.avatarPlaceholder}>
                                        <Text style={styles.avatarText}>{principal.name?.[0]?.toUpperCase() || 'P'}</Text>
                                    </View>
                                )}
                            </View>
                            <View style={styles.principalInfo}>
                                <Text style={styles.principalName}>{principal.name}</Text>
                                <View style={styles.roleBadge}>
                                    <UserCheck size={12} color="#DC2626" />
                                    <Text style={styles.roleText}>Principal</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.detailsSection}>
                            <View style={styles.detailRow}>
                                <View style={[styles.detailIcon, { backgroundColor: '#DBEAFE' }]}>
                                    <Mail size={16} color="#3B82F6" />
                                </View>
                                <View style={styles.detailContent}>
                                    <Text style={styles.detailLabel}>Email</Text>
                                    <Text style={styles.detailValue}>{principal.email}</Text>
                                </View>
                            </View>
                            {principal.joinDate && (
                                <View style={styles.detailRow}>
                                    <View style={[styles.detailIcon, { backgroundColor: '#D1FAE5' }]}>
                                        <UserCheck size={16} color="#10B981" />
                                    </View>
                                    <View style={styles.detailContent}>
                                        <Text style={styles.detailLabel}>Joined</Text>
                                        <Text style={styles.detailValue}>
                                            {new Date(principal.joinDate).toLocaleDateString('en-IN', {
                                                day: 'numeric', month: 'short', year: 'numeric'
                                            })}
                                        </Text>
                                    </View>
                                </View>
                            )}
                        </View>

                        <HapticTouchable
                            onPress={handleDelete}
                            disabled={deleteMutation.isPending}
                            style={styles.deleteButton}
                        >
                            {deleteMutation.isPending ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <>
                                    <Trash2 size={18} color="#fff" />
                                    <Text style={styles.deleteButtonText}>Remove Principal</Text>
                                </>
                            )}
                        </HapticTouchable>
                    </View>
                ) : (
                    // Show form to create new principal
                    <View style={styles.formContainer}>
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIcon}>
                                <UserCheck size={32} color="#DC2626" />
                            </View>
                            <Text style={styles.emptyTitle}>No Principal Assigned</Text>
                            <Text style={styles.emptySubtitle}>Create a principal account to manage school operations</Text>
                        </View>

                        <View style={styles.formCard}>
                            <Text style={styles.formTitle}>Create New Principal</Text>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Full Name *</Text>
                                <View style={[styles.inputContainer, formErrors.name && styles.inputError]}>
                                    <User size={18} color="#9CA3AF" />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter principal's name"
                                        placeholderTextColor="#9CA3AF"
                                        value={formData.name}
                                        onChangeText={(text) => setFormData({ ...formData, name: text })}
                                    />
                                </View>
                                {formErrors.name && (
                                    <Text style={styles.errorText}>{formErrors.name}</Text>
                                )}
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Email Address *</Text>
                                <View style={[styles.inputContainer, formErrors.email && styles.inputError]}>
                                    <Mail size={18} color="#9CA3AF" />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="principal@school.com"
                                        placeholderTextColor="#9CA3AF"
                                        keyboardType="email-address"
                                        autoCapitalize="none"
                                        value={formData.email}
                                        onChangeText={(text) => setFormData({ ...formData, email: text })}
                                    />
                                </View>
                                {formErrors.email && (
                                    <Text style={styles.errorText}>{formErrors.email}</Text>
                                )}
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Password *</Text>
                                <View style={[styles.inputContainer, formErrors.password && styles.inputError]}>
                                    <Lock size={18} color="#9CA3AF" />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Min. 6 characters"
                                        placeholderTextColor="#9CA3AF"
                                        secureTextEntry
                                        value={formData.password}
                                        onChangeText={(text) => setFormData({ ...formData, password: text })}
                                    />
                                </View>
                                {formErrors.password && (
                                    <Text style={styles.errorText}>{formErrors.password}</Text>
                                )}
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Phone Number (Optional)</Text>
                                <View style={styles.inputContainer}>
                                    <Phone size={18} color="#9CA3AF" />
                                    <TextInput
                                        style={styles.input}
                                        placeholder="9876543210"
                                        placeholderTextColor="#9CA3AF"
                                        keyboardType="phone-pad"
                                        value={formData.contactNumber}
                                        onChangeText={(text) => setFormData({ ...formData, contactNumber: text })}
                                    />
                                </View>
                            </View>

                            <View style={styles.infoBox}>
                                <AlertCircle size={16} color="#6366F1" />
                                <Text style={styles.infoText}>
                                    The principal will be able to log in immediately with the email and password provided.
                                </Text>
                            </View>

                            <HapticTouchable
                                onPress={handleCreate}
                                disabled={createMutation.isPending}
                                style={styles.createButton}
                            >
                                {createMutation.isPending ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Plus size={20} color="#fff" />
                                        <Text style={styles.createButtonText}>Create Principal</Text>
                                    </>
                                )}
                            </HapticTouchable>
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    headerTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    content: { padding: 16 },

    // Principal Card
    principalCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E5E7EB' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    avatarContainer: { marginRight: 16 },
    avatar: { width: 64, height: 64, borderRadius: 32 },
    avatarPlaceholder: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
    avatarText: { fontSize: 24, fontWeight: '700', color: '#DC2626' },
    principalInfo: { flex: 1 },
    principalName: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginBottom: 6 },
    roleBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', gap: 4 },
    roleText: { fontSize: 12, fontWeight: '600', color: '#DC2626' },

    detailsSection: { borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 16, gap: 12 },
    detailRow: { flexDirection: 'row', alignItems: 'center' },
    detailIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    detailContent: { flex: 1 },
    detailLabel: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
    detailValue: { fontSize: 15, fontWeight: '500', color: '#1F2937' },

    deleteButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626', paddingVertical: 14, borderRadius: 12, marginTop: 20, gap: 8 },
    deleteButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },

    // Form
    formContainer: {},
    emptyState: { alignItems: 'center', paddingVertical: 32 },
    emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1F2937', marginBottom: 8 },
    emptySubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', paddingHorizontal: 32 },

    formCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E5E7EB' },
    formTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 20 },

    inputGroup: { marginBottom: 16 },
    inputLabel: { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 8 },
    inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, height: 50, gap: 10 },
    inputError: { borderColor: '#EF4444' },
    input: { flex: 1, fontSize: 16, color: '#1F2937' },
    errorText: { fontSize: 12, color: '#EF4444', marginTop: 4 },

    infoBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#EEF2FF', padding: 14, borderRadius: 12, marginTop: 8, marginBottom: 20, gap: 10 },
    infoText: { flex: 1, fontSize: 13, color: '#4338CA', lineHeight: 18 },

    createButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#DC2626', paddingVertical: 14, borderRadius: 12, gap: 8 },
    createButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
