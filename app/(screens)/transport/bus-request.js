// Bus Request Screen for Parents
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    Alert,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    Plus,
    X,
    Bus,
    MapPin,
    Send,
    FileText,
    User,
    Clock,
    CheckCircle2,
    AlertCircle,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

export default function BusRequestScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        studentId: '',
        requestType: 'NEW',
        preferredStop: '',
        reason: '',
    });

    // Parse child data from params
    const childData = params.childData ? JSON.parse(params.childData) : null;

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const parentId = userData?.parentData?.id || userData?.id;

    // Fetch parent's students
    const { data: studentsData } = useQuery({
        queryKey: ['parent-students', schoolId, parentId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/parents/${parentId}/child`);
            return res.data;
        },
        enabled: !!schoolId && !!parentId,
    });

    const students = studentsData?.children || [];

    // Fetch bus requests
    const { data: requestsData, isLoading } = useQuery({
        queryKey: ['bus-requests', schoolId, parentId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/requests?parentId=${parentId}&schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId && !!parentId,
        staleTime: 1000 * 60 * 2,
    });

    const requests = requestsData?.requests || [];

    // Submit request mutation
    const submitMutation = useMutation({
        mutationFn: async (data) => {
            const res = await api.post('/schools/transport/requests', {
                ...data,
                parentId,
                schoolId,
            });
            return res.data;
        },
        onSuccess: () => {
            Alert.alert('Success', 'Bus request submitted successfully!');
            setShowForm(false);
            setFormData({ studentId: '', requestType: 'NEW', preferredStop: '', reason: '' });
            queryClient.invalidateQueries(['bus-requests']);
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || 'Failed to submit request');
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['bus-requests']);
        setRefreshing(false);
    }, [queryClient]);

    const handleSubmit = () => {
        if (!formData.studentId) {
            Alert.alert('Error', 'Please select a student');
            return;
        }
        if (!formData.preferredStop && formData.requestType !== 'CANCEL') {
            Alert.alert('Error', 'Please enter preferred stop');
            return;
        }
        submitMutation.mutate(formData);
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'PENDING': return { bg: '#FEF3C7', text: '#B45309', icon: Clock };
            case 'APPROVED': return { bg: '#D1FAE5', text: '#15803D', icon: CheckCircle2 };
            case 'REJECTED': return { bg: '#FEE2E2', text: '#B91C1C', icon: AlertCircle };
            case 'IN_REVIEW': return { bg: '#DBEAFE', text: '#1D4ED8', icon: Clock };
            default: return { bg: '#F1F5F9', text: '#475569', icon: Clock };
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case 'NEW': return '🆕 New Service';
            case 'CHANGE_STOP': return '📍 Change Stop';
            case 'CHANGE_ROUTE': return '🔄 Change Route';
            case 'CANCEL': return '❌ Cancel Service';
            default: return type;
        }
    };

    // Set initial student if childData is passed
    useEffect(() => {
        if (childData && !formData.studentId) {
            setFormData(prev => ({ ...prev, studentId: childData.studentId || childData.id }));
        }
    }, [childData]);

    // No user data error state
    if (!userData) {
        return (
            <View style={styles.container}>
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#111" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Bus Request</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <View style={styles.emptyState}>
                    <AlertCircle size={48} color="#ccc" />
                    <Text style={styles.emptyTitle}>Not Logged In</Text>
                    <Text style={styles.emptySubtitle}>Please login to continue</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Bus Request</Text>
                    <Text style={styles.headerSubtitle}>Manage transport requests</Text>
                </View>
                <HapticTouchable onPress={() => setShowForm(!showForm)}>
                    <View style={[styles.addButton, showForm && styles.addButtonActive]}>
                        {showForm ? <X size={20} color="#fff" /> : <Plus size={20} color="#0469ff" />}
                    </View>
                </HapticTouchable>
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                    />
                }
            >
                {/* Child Info Card */}
                {childData && (
                    <Animated.View entering={FadeInDown.delay(100).duration(500)}>
                        <View style={styles.childInfoCard}>
                            <View style={styles.childInfoIcon}>
                                <User size={20} color="#0469ff" />
                            </View>
                            <View style={styles.childInfoContent}>
                                <Text style={styles.childInfoName}>{childData.name}</Text>
                                <Text style={styles.childInfoClass}>
                                    Class {childData.class} - {childData.section}
                                </Text>
                            </View>
                        </View>
                    </Animated.View>
                )}

                {/* New Request Form */}
                {showForm && (
                    <Animated.View entering={FadeInDown.delay(150).duration(500)}>
                        <View style={styles.formCard}>
                            <Text style={styles.formTitle}>New Bus Request</Text>

                            {/* Student Selection */}
                            <Text style={styles.label}>Select Student</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
                                {students.map(student => (
                                    <HapticTouchable
                                        key={student.studentId || student.id}
                                        onPress={() => setFormData({ ...formData, studentId: student.studentId || student.id })}
                                    >
                                        <View style={[
                                            styles.chip,
                                            formData.studentId === (student.studentId || student.id) && styles.chipActive
                                        ]}>
                                            <Text style={[
                                                styles.chipText,
                                                formData.studentId === (student.studentId || student.id) && styles.chipTextActive
                                            ]}>
                                                {student.name}
                                            </Text>
                                        </View>
                                    </HapticTouchable>
                                ))}
                            </ScrollView>

                            {/* Request Type */}
                            <Text style={styles.label}>Request Type</Text>
                            <View style={styles.typeRow}>
                                {['NEW', 'CHANGE_STOP', 'CANCEL'].map(type => (
                                    <HapticTouchable
                                        key={type}
                                        onPress={() => setFormData({ ...formData, requestType: type })}
                                    >
                                        <View style={[
                                            styles.typeBtn,
                                            formData.requestType === type && styles.typeBtnActive
                                        ]}>
                                            <Text style={[
                                                styles.typeBtnText,
                                                formData.requestType === type && styles.typeBtnTextActive
                                            ]}>
                                                {type === 'NEW' ? '🆕 New' : type === 'CHANGE_STOP' ? '📍 Change' : '❌ Cancel'}
                                            </Text>
                                        </View>
                                    </HapticTouchable>
                                ))}
                            </View>

                            {/* Preferred Stop */}
                            {formData.requestType !== 'CANCEL' && (
                                <>
                                    <Text style={styles.label}>Preferred Stop Location</Text>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Enter landmark or address"
                                        placeholderTextColor="#94A3B8"
                                        value={formData.preferredStop}
                                        onChangeText={(text) => setFormData({ ...formData, preferredStop: text })}
                                    />
                                </>
                            )}

                            {/* Reason */}
                            <Text style={styles.label}>Reason (Optional)</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Add any additional details..."
                                placeholderTextColor="#94A3B8"
                                multiline
                                numberOfLines={3}
                                value={formData.reason}
                                onChangeText={(text) => setFormData({ ...formData, reason: text })}
                            />

                            {/* Submit Button */}
                            <HapticTouchable onPress={handleSubmit} disabled={submitMutation.isPending}>
                                <View style={styles.submitBtn}>
                                    {submitMutation.isPending ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Send size={18} color="#fff" />
                                            <Text style={styles.submitBtnText}>Submit Request</Text>
                                        </>
                                    )}
                                </View>
                            </HapticTouchable>
                        </View>
                    </Animated.View>
                )}

                {/* Stats Cards */}
                <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                    <View style={styles.statsRow}>
                        <View style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={[styles.statValue, { color: '#B45309' }]}>
                                {requests.filter(r => r.status === 'PENDING').length}
                            </Text>
                            <Text style={styles.statLabel}>Pending</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#D1FAE5' }]}>
                            <Text style={[styles.statValue, { color: '#15803D' }]}>
                                {requests.filter(r => r.status === 'APPROVED').length}
                            </Text>
                            <Text style={styles.statLabel}>Approved</Text>
                        </View>
                        <View style={[styles.statCard, { backgroundColor: '#FEE2E2' }]}>
                            <Text style={[styles.statValue, { color: '#B91C1C' }]}>
                                {requests.filter(r => r.status === 'REJECTED').length}
                            </Text>
                            <Text style={styles.statLabel}>Rejected</Text>
                        </View>
                    </View>
                </Animated.View>

                {/* Requests List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Your Requests ({requests.length})</Text>

                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : requests.length > 0 ? (
                        requests.map((request, index) => {
                            const statusInfo = getStatusColor(request.status);
                            const StatusIcon = statusInfo.icon;

                            return (
                                <Animated.View
                                    key={request.id}
                                    entering={FadeInRight.delay(300 + index * 80).duration(500)}
                                >
                                    <View style={styles.requestCard}>
                                        <View style={styles.requestHeader}>
                                            <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                                                <StatusIcon size={12} color={statusInfo.text} />
                                                <Text style={[styles.statusText, { color: statusInfo.text }]}>
                                                    {request.status}
                                                </Text>
                                            </View>
                                            <Text style={styles.requestDate}>
                                                {new Date(request.createdAt).toLocaleDateString()}
                                            </Text>
                                        </View>

                                        <Text style={styles.requestStudent}>{request.student?.name}</Text>

                                        <View style={styles.requestTypeRow}>
                                            <Bus size={16} color="#64748B" />
                                            <Text style={styles.requestTypeText}>{getTypeLabel(request.requestType)}</Text>
                                        </View>

                                        {request.preferredStop && (
                                            <View style={styles.requestDetail}>
                                                <MapPin size={16} color="#64748B" />
                                                <Text style={styles.requestDetailText}>{request.preferredStop}</Text>
                                            </View>
                                        )}

                                        {request.adminNotes && (
                                            <View style={styles.adminNotes}>
                                                <Text style={styles.adminNotesLabel}>Admin Response:</Text>
                                                <Text style={styles.adminNotesText}>{request.adminNotes}</Text>
                                            </View>
                                        )}
                                    </View>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                            <View style={styles.emptyState}>
                                <FileText size={48} color="#ccc" />
                                <Text style={styles.emptyTitle}>No Requests Yet</Text>
                                <Text style={styles.emptySubtitle}>
                                    Tap + to create a new bus request
                                </Text>
                            </View>
                        </Animated.View>
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
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
    addButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addButtonActive: {
        backgroundColor: '#EF4444',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    childInfoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 16,
        gap: 12,
    },
    childInfoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    childInfoContent: {
        flex: 1,
    },
    childInfoName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    childInfoClass: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    formCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
    },
    formTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
        marginBottom: 16,
    },
    label: {
        fontSize: 14,
        fontWeight: '600',
        color: '#475569',
        marginBottom: 8,
        marginTop: 12,
    },
    chipScroll: {
        marginBottom: 8,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderRadius: 20,
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    chipActive: {
        backgroundColor: '#0469ff',
        borderColor: '#0469ff',
    },
    chipText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#64748B',
    },
    chipTextActive: {
        color: '#fff',
    },
    typeRow: {
        flexDirection: 'row',
        gap: 10,
    },
    typeBtn: {
        flex: 1,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    typeBtnActive: {
        backgroundColor: '#E3F2FD',
        borderColor: '#0469ff',
    },
    typeBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#64748B',
    },
    typeBtnTextActive: {
        color: '#0469ff',
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 15,
        color: '#111',
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top',
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        marginTop: 20,
        borderRadius: 12,
        backgroundColor: '#10B981',
    },
    submitBtnText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    statsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: '700',
    },
    statLabel: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
        marginBottom: 12,
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    requestCard: {
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
    },
    requestHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        gap: 4,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    requestDate: {
        fontSize: 12,
        color: '#94A3B8',
    },
    requestStudent: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 8,
    },
    requestTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    requestTypeText: {
        fontSize: 14,
        color: '#64748B',
    },
    requestDetail: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    requestDetailText: {
        fontSize: 14,
        color: '#64748B',
    },
    adminNotes: {
        marginTop: 12,
        padding: 12,
        backgroundColor: '#D1FAE5',
        borderRadius: 10,
    },
    adminNotesLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#15803D',
        marginBottom: 4,
    },
    adminNotesText: {
        fontSize: 13,
        color: '#166534',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        gap: 12,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        paddingHorizontal: 32,
    },
});
