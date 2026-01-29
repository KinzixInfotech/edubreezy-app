import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Platform
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
    ArrowLeft,
    MessageSquare,
    Users,
    User,
    GraduationCap,
    Calendar,
    ChevronRight
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

export default function TeacherFeedbackViewScreen() {
    const params = useLocalSearchParams();
    const childData = params.childData ? JSON.parse(params.childData) : null;
    const termNumber = params.termNumber ? Number(params.termNumber) : 1;

    // Get user data (teacher)
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const studentId = childData?.userId;

    // Fetch active academic year
    const { data: academicYear } = useQuery({
        queryKey: ['academic-year-active', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
            return res.data?.find((y) => y.isActive);
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 10,
    });

    // Fetch parent feedback
    const { data: parentFeedback, isLoading: parentLoading } = useQuery({
        queryKey: ['parent-feedback-for-teacher', schoolId, studentId, academicYear?.id, termNumber],
        queryFn: async () => {
            const params = new URLSearchParams({
                studentId,
                ...(academicYear?.id && { academicYearId: academicYear.id }),
                termNumber: termNumber.toString(),
            });
            const res = await api.get(`/schools/${schoolId}/hpc/parent-feedback?${params}`);
            return res.data?.feedback || [];
        },
        enabled: !!schoolId && !!studentId && !!academicYear?.id,
        staleTime: 1000 * 60 * 5,
    });

    // Fetch student reflection
    const { data: studentReflection, isLoading: studentLoading } = useQuery({
        queryKey: ['student-reflection-for-teacher', schoolId, studentId, academicYear?.id, termNumber],
        queryFn: async () => {
            const params = new URLSearchParams({
                studentId,
                ...(academicYear?.id && { academicYearId: academicYear.id }),
                termNumber: termNumber.toString(),
            });
            const res = await api.get(`/schools/${schoolId}/hpc/reflections?${params}`);
            return res.data?.reflections?.[0] || null;
        },
        enabled: !!schoolId && !!studentId && !!academicYear?.id,
        staleTime: 1000 * 60 * 5,
    });

    const isLoading = parentLoading || studentLoading;
    const hasParentFeedback = parentFeedback?.length > 0;
    const hasStudentReflection = !!studentReflection;

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loadingText}>Loading feedback...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Header */}
            <LinearGradient
                colors={['#8B5CF6', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                <View style={styles.headerRow}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Received Feedback</Text>
                        <Text style={styles.headerSubtitle}>{childData?.name} • Term {termNumber}</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
            </LinearGradient>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {!hasParentFeedback && !hasStudentReflection && (
                    <View style={styles.emptyState}>
                        <MessageSquare size={48} color="#ddd" />
                        <Text style={styles.emptyText}>No feedback received yet</Text>
                        <Text style={styles.emptySubtext}>Parent and student inputs will appear here</Text>
                    </View>
                )}

                {/* Student Reflection Section */}
                {hasStudentReflection && (
                    <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIconBox, { backgroundColor: '#E0F2FE' }]}>
                                <GraduationCap size={20} color="#0284C7" />
                            </View>
                            <Text style={styles.sectionTitle}>Student Reflection</Text>
                        </View>

                        <View style={styles.card}>
                            <View style={styles.cardHeader}>
                                <Text style={styles.cardTitle}>Self Review</Text>
                                <Text style={styles.dateText}>
                                    {new Date(studentReflection.submittedAt).toLocaleDateString()}
                                </Text>
                            </View>

                            {studentReflection.proudMoments && (
                                <View style={styles.feedbackItem}>
                                    <Text style={styles.label}>Proud Moments</Text>
                                    <Text style={styles.value}>{studentReflection.proudMoments}</Text>
                                </View>
                            )}

                            {studentReflection.challenges && (
                                <View style={styles.feedbackItem}>
                                    <Text style={styles.label}>Challenges Faced</Text>
                                    <Text style={styles.value}>{studentReflection.challenges}</Text>
                                </View>
                            )}

                            {studentReflection.goals && (
                                <View style={styles.feedbackItem}>
                                    <Text style={styles.label}>My Goals</Text>
                                    <Text style={styles.value}>{studentReflection.goals}</Text>
                                </View>
                            )}

                            {studentReflection.helpNeeded && (
                                <View style={styles.feedbackItem}>
                                    <Text style={styles.label}>Support Needed</Text>
                                    <Text style={styles.value}>{studentReflection.helpNeeded}</Text>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                )}

                {/* Parent Feedback Section */}
                {hasParentFeedback && (
                    <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <View style={[styles.sectionIconBox, { backgroundColor: '#FCE7F3' }]}>
                                <Users size={20} color="#DB2777" />
                            </View>
                            <Text style={styles.sectionTitle}>Parent Feedback ({parentFeedback.length})</Text>
                        </View>

                        {parentFeedback.map((fb, index) => (
                            <View key={fb.id || index} style={styles.card}>
                                <View style={styles.cardHeader}>
                                    <View style={styles.userInfo}>
                                        <View style={styles.avatar}>
                                            <User size={16} color="#666" />
                                        </View>
                                        <Text style={styles.userName}>{fb.parent?.user?.name || 'Parent'}</Text>
                                    </View>
                                    <Text style={styles.dateText}>
                                        {new Date(fb.submittedAt).toLocaleDateString()}
                                    </Text>
                                </View>

                                {fb.observations && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.label}>Observations</Text>
                                        <Text style={styles.value}>{fb.observations}</Text>
                                    </View>
                                )}

                                {fb.suggestions && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.label}>Suggestions</Text>
                                        <Text style={styles.value}>{fb.suggestions}</Text>
                                    </View>
                                )}

                                <View style={styles.row}>
                                    {fb.childInterest && (
                                        <View style={styles.badgeItem}>
                                            <Text style={styles.badgeLabel}>Interest</Text>
                                            <Text style={styles.badgeValue}>{fb.childInterest}</Text>
                                        </View>
                                    )}
                                    {fb.homeParticipation && (
                                        <View style={styles.badgeItem}>
                                            <Text style={styles.badgeLabel}>Participation</Text>
                                            <Text style={styles.badgeValue}>{fb.homeParticipation}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        ))}
                    </Animated.View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        color: '#666',
        fontSize: 14,
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 20,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        marginTop: 2,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        opacity: 0.7,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 18,
        fontWeight: '600',
        color: '#666',
    },
    emptySubtext: {
        marginTop: 4,
        fontSize: 14,
        color: '#999',
    },
    section: {
        marginBottom: 24,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 10,
    },
    sectionIconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1e293b',
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        paddingBottom: 12,
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#334155',
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    userName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#334155',
    },
    dateText: {
        fontSize: 12,
        color: '#94a3b8',
    },
    feedbackItem: {
        marginBottom: 16,
    },
    label: {
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '600',
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    value: {
        fontSize: 14,
        color: '#334155',
        lineHeight: 22,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 4,
    },
    badgeItem: {
        backgroundColor: '#f8fafc',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        flex: 1,
    },
    badgeLabel: {
        fontSize: 10,
        color: '#64748b',
        marginBottom: 2,
    },
    badgeValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0f172a',
    },
});
