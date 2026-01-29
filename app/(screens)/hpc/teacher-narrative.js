// Teacher Narrative Feedback Screen - HPC
// Teachers provide structured feedback on student strengths, areas to improve, and suggestions
import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Alert,
    TextInput,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
    ArrowLeft,
    Save,
    Star,
    TrendingUp,
    Lightbulb,
    MessageSquare,
    CheckCircle,
    Users,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

export default function TeacherNarrativeScreen() {
    const params = useLocalSearchParams();
    const childData = params.childData ? JSON.parse(params.childData) : null;
    const termNumber = params.termNumber ? Number(params.termNumber) : 1;

    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    // Form state
    const [strengths, setStrengths] = useState('');
    const [areasToImprove, setAreasToImprove] = useState('');
    const [suggestions, setSuggestions] = useState('');
    const [overallRemarks, setOverallRemarks] = useState('');

    // Get user data (teacher)
    const { data: userData, isLoading: isUserLoading } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const teacherId = userData?.id;
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

    // Fetch existing feedback
    const { data: existingFeedback, isLoading: feedbackLoading } = useQuery({
        queryKey: ['teacher-feedback', schoolId, studentId, teacherId, academicYear?.id, termNumber],
        queryFn: async () => {
            const params = new URLSearchParams({
                studentId,
                teacherId,
                ...(academicYear?.id && { academicYearId: academicYear.id }),
                termNumber: termNumber.toString(),
            });
            const res = await api.get(`/schools/${schoolId}/hpc/teacher-feedback?${params}`);
            return res.data?.feedback?.[0] || null;
        },
        enabled: !!schoolId && !!studentId && !!teacherId && !!academicYear?.id,
        staleTime: 1000 * 60 * 5,
    });

    // Populate form from existing feedback (React Query v5 compatible)
    useEffect(() => {
        if (existingFeedback) {
            setStrengths(existingFeedback.strengths || '');
            setAreasToImprove(existingFeedback.areasToImprove || '');
            setSuggestions(existingFeedback.suggestions || '');
            setOverallRemarks(existingFeedback.overallRemarks || '');
        }
    }, [existingFeedback]);

    // Fetch parent feedback for this student (for teacher visibility)
    const { data: parentFeedback } = useQuery({
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

    // Fetch student self-reflection (for teacher visibility)
    const { data: studentReflection } = useQuery({
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

    // Submit feedback mutation
    const submitMutation = useMutation({
        mutationFn: async () => {
            return api.post(`/schools/${schoolId}/hpc/teacher-feedback`, {
                studentId,
                teacherId,
                academicYearId: academicYear?.id,
                termNumber,
                strengths,
                areasToImprove,
                suggestions,
                overallRemarks,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teacher-feedback'] });
            queryClient.invalidateQueries({ queryKey: ['hpc-report'] });
            Alert.alert('Saved!', 'Your feedback has been submitted.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        },
        onError: (error) => {
            Alert.alert('Error', error.message || 'Failed to save feedback');
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: ['teacher-feedback'] });
        setRefreshing(false);
    }, [queryClient]);

    const handleSubmit = () => {
        if (!strengths.trim()) {
            Alert.alert('Required', 'Please fill in "Key Strengths" before submitting.');
            return;
        }
        submitMutation.mutate();
    };

    const isLoading = feedbackLoading || isUserLoading || !schoolId;
    const canSubmit = strengths.trim().length > 0;

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loadingText}>Loading feedback form...</Text>
            </View>
        );
    }

    if (!childData) {
        return (
            <View style={styles.loaderContainer}>
                <MessageSquare size={48} color="#999" />
                <Text style={styles.noDataText}>No student selected</Text>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButtonCenter}>
                        <Text style={styles.backBtnText}>Go Back</Text>
                    </View>
                </HapticTouchable>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <StatusBar style="light" />

            {/* Header */}
            <LinearGradient
                colors={['#0469ff', '#0358dd']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                {/* Background Pattern */}
                <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.04)' }} />

                <View style={styles.headerRow}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Teacher Feedback</Text>
                        <Text style={styles.headerSubtitle}>{childData.name} • Term {termNumber}</Text>
                    </View>
                    <HapticTouchable
                        onPress={handleSubmit}
                        disabled={submitMutation.isPending || !canSubmit}
                    >
                        <View style={[styles.saveButton, (!canSubmit || submitMutation.isPending) && { opacity: 0.5 }]}>
                            {submitMutation.isPending ? (
                                <ActivityIndicator size="small" color="#0469ff" />
                            ) : (
                                <Save size={20} color="#0469ff" />
                            )}
                        </View>
                    </HapticTouchable>
                </View>

                {/* Info Card */}
                <View style={styles.infoCard}>
                    <MessageSquare size={18} color="#fff" />
                    <Text style={styles.infoText}>
                        Provide narrative feedback highlighting the student's growth and areas for development.
                    </Text>
                </View>
            </LinearGradient>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
            >
                {/* Parent & Student Feedback Section - Teacher can see feedback from parents/students */}
                {(parentFeedback?.length > 0 || studentReflection) && (
                    <Animated.View entering={FadeInDown.delay(500)} style={styles.feedbackVisibilitySection}>
                        <View style={styles.sectionHeader}>
                            <Users size={18} color="#8B5CF6" />
                            <Text style={styles.sectionTitle}>Family & Student Input</Text>
                        </View>

                        {/* Parent Feedback */}
                        {parentFeedback?.length > 0 && parentFeedback.map((fb, index) => (
                            <View key={fb.id || index} style={styles.feedbackCard}>
                                <View style={styles.feedbackCardHeader}>
                                    <View style={[styles.feedbackBadge, { backgroundColor: '#EC4899' + '20' }]}>
                                        <Text style={[styles.feedbackBadgeText, { color: '#EC4899' }]}>Parent</Text>
                                    </View>
                                    <Text style={styles.feedbackName}>{fb.parent?.user?.name || 'Parent'}</Text>
                                </View>
                                {fb.childInterest && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.feedbackLabel}>Child's Interest Level</Text>
                                        <Text style={styles.feedbackValue}>{fb.childInterest}</Text>
                                    </View>
                                )}
                                {fb.homeParticipation && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.feedbackLabel}>Home Participation</Text>
                                        <Text style={styles.feedbackValue}>{fb.homeParticipation}</Text>
                                    </View>
                                )}
                                {fb.observations && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.feedbackLabel}>Observations</Text>
                                        <Text style={styles.feedbackText}>{fb.observations}</Text>
                                    </View>
                                )}
                                {fb.suggestions && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.feedbackLabel}>Suggestions</Text>
                                        <Text style={styles.feedbackText}>{fb.suggestions}</Text>
                                    </View>
                                )}
                            </View>
                        ))}

                        {/* Student Reflection */}
                        {studentReflection && (
                            <View style={styles.feedbackCard}>
                                <View style={styles.feedbackCardHeader}>
                                    <View style={[styles.feedbackBadge, { backgroundColor: '#8B5CF6' + '20' }]}>
                                        <Text style={[styles.feedbackBadgeText, { color: '#8B5CF6' }]}>Student</Text>
                                    </View>
                                    <Text style={styles.feedbackName}>Self Reflection</Text>
                                </View>
                                {studentReflection.proudMoments && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.feedbackLabel}>Proud Moments</Text>
                                        <Text style={styles.feedbackText}>{studentReflection.proudMoments}</Text>
                                    </View>
                                )}
                                {studentReflection.challenges && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.feedbackLabel}>Challenges</Text>
                                        <Text style={styles.feedbackText}>{studentReflection.challenges}</Text>
                                    </View>
                                )}
                                {studentReflection.goals && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.feedbackLabel}>Goals</Text>
                                        <Text style={styles.feedbackText}>{studentReflection.goals}</Text>
                                    </View>
                                )}
                                {studentReflection.helpNeeded && (
                                    <View style={styles.feedbackItem}>
                                        <Text style={styles.feedbackLabel}>Help Needed From</Text>
                                        <Text style={styles.feedbackText}>{studentReflection.helpNeeded}</Text>
                                    </View>
                                )}
                            </View>
                        )}
                    </Animated.View>
                )}

                {/* Strengths - Required */}
                <Animated.View entering={FadeInDown.delay(100)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#10B981' + '20' }]}>
                            <Star size={20} color="#10B981" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>Key Strengths</Text>
                            <Text style={styles.questionRequired}>Required</Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="What does the student excel at? Key achievements..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={strengths}
                        onChangeText={setStrengths}
                        textAlignVertical="top"
                    />
                </Animated.View>

                {/* Areas to Improve */}
                <Animated.View entering={FadeInDown.delay(200)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#F59E0B' + '20' }]}>
                            <TrendingUp size={20} color="#F59E0B" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>Areas to Improve</Text>
                            <Text style={styles.questionOptional}>Optional</Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Where can the student grow? Skills to develop..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={areasToImprove}
                        onChangeText={setAreasToImprove}
                        textAlignVertical="top"
                    />
                </Animated.View>

                {/* Suggested Actions */}
                <Animated.View entering={FadeInDown.delay(300)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#8B5CF6' + '20' }]}>
                            <Lightbulb size={20} color="#8B5CF6" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>Suggested Actions</Text>
                            <Text style={styles.questionOptional}>Optional</Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Recommendations for the student and parents..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={suggestions}
                        onChangeText={setSuggestions}
                        textAlignVertical="top"
                    />
                </Animated.View>

                {/* Overall Remarks */}
                <Animated.View entering={FadeInDown.delay(400)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#EC4899' + '20' }]}>
                            <MessageSquare size={20} color="#EC4899" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>Overall Remarks</Text>
                            <Text style={styles.questionOptional}>Optional</Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Any additional observations or notes..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={overallRemarks}
                        onChangeText={setOverallRemarks}
                        textAlignVertical="top"
                    />
                </Animated.View>

                {/* Submit Button */}
                <HapticTouchable
                    onPress={handleSubmit}
                    disabled={submitMutation.isPending || !canSubmit}
                    style={{ marginTop: 16 }}
                >
                    <LinearGradient
                        colors={canSubmit ? ['#0469ff', '#0358dd'] : ['#D1D5DB', '#9CA3AF']}
                        style={styles.submitButton}
                    >
                        {submitMutation.isPending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <CheckCircle size={20} color="#fff" />
                                <Text style={styles.submitText}>Submit Feedback</Text>
                            </>
                        )}
                    </LinearGradient>
                </HapticTouchable>

                {/* View Received Feedback Link */}
                <HapticTouchable
                    onPress={() => router.push({
                        pathname: '/hpc/teacher-feedback-view',
                        params: {
                            childData: JSON.stringify(childData),
                            termNumber: termNumber
                        }
                    })}
                    style={styles.viewFeedbackCard}
                >
                    <LinearGradient
                        colors={['#F3E8FF', '#E9D5FF']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.viewFeedbackContent}
                    >
                        <View style={styles.viewFeedbackIcon}>
                            <Users size={24} color="#9333EA" />
                        </View>
                        <View style={styles.viewFeedbackTextContainer}>
                            <Text style={styles.viewFeedbackTitle}>View Received Feedback</Text>
                            <Text style={styles.viewFeedbackSubtitle}>
                                See inputs from parents and student reflection
                            </Text>
                        </View>
                        <View style={styles.viewFeedbackArrow}>
                            <ArrowLeft size={20} color="#9333EA" style={{ transform: [{ rotate: '180deg' }] }} />
                        </View>
                    </LinearGradient>
                </HapticTouchable>

                <View style={{ height: 40 }} />

            </ScrollView>
        </KeyboardAvoidingView>
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
        gap: 16,
        backgroundColor: '#fff',
    },
    loadingText: {
        fontSize: 14,
        color: '#666',
    },
    noDataText: {
        fontSize: 16,
        color: '#666',
        marginTop: 8,
    },
    backButtonCenter: {
        marginTop: 20,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#0469ff',
        borderRadius: 12,
    },
    backBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        paddingTop: 60,
        paddingHorizontal: 16,
        paddingBottom: 20,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
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
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
    },
    headerSubtitle: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.8)',
        marginTop: 2,
    },
    saveButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        padding: 14,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#fff',
        fontWeight: '500',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    questionCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    questionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    iconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    questionTextContainer: {
        flex: 1,
        marginLeft: 12,
    },
    questionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1a1a2e',
    },
    questionRequired: {
        fontSize: 11,
        color: '#EF4444',
        fontWeight: '600',
        marginTop: 2,
    },
    questionOptional: {
        fontSize: 11,
        color: '#999',
        fontWeight: '500',
        marginTop: 2,
    },
    textInput: {
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 14,
        fontSize: 14,
        color: '#333',
        minHeight: 100,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    submitButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        borderRadius: 14,
        gap: 10,
    },
    submitText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    viewFeedbackCard: {
        marginBottom: 24,
        marginTop: 8,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E9D5FF',
    },
    viewFeedbackContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    viewFeedbackIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    viewFeedbackTextContainer: {
        flex: 1,
        marginLeft: 14,
    },
    viewFeedbackTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#6B21A8',
    },
    viewFeedbackSubtitle: {
        fontSize: 12,
        color: '#7E22CE',
        marginTop: 2,
        opacity: 0.8,
    },
    viewFeedbackArrow: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
