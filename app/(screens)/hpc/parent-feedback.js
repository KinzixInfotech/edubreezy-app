// Parent Feedback Screen - HPC
// Parents provide feedback on their child's learning journey
import React, { useState, useCallback } from 'react';
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
    Heart,
    Home,
    Eye,
    CheckCircle,
    MessageSquare,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

// Option Button Component
const OptionButton = ({ options, value, onChange, label }) => {
    return (
        <View style={styles.optionContainer}>
            <Text style={styles.optionLabel}>{label}</Text>
            <View style={styles.optionRow}>
                {options.map((option) => (
                    <HapticTouchable
                        key={option.value}
                        onPress={() => onChange(option.value)}
                    >
                        <View style={[
                            styles.optionPill,
                            value === option.value && { backgroundColor: option.color, borderColor: option.color }
                        ]}>
                            <Text style={[
                                styles.optionText,
                                value === option.value && { color: '#fff' }
                            ]}>
                                {option.label}
                            </Text>
                        </View>
                    </HapticTouchable>
                ))}
            </View>
        </View>
    );
};

const INTEREST_OPTIONS = [
    { value: 'High', label: 'High', color: '#10B981' },
    { value: 'Moderate', label: 'Moderate', color: '#F59E0B' },
    { value: 'Low', label: 'Low', color: '#EF4444' },
];

const PARTICIPATION_OPTIONS = [
    { value: 'Active', label: 'Active', color: '#10B981' },
    { value: 'Needs Encouragement', label: 'Needs Encouragement', color: '#F59E0B' },
];

export default function ParentFeedbackScreen() {
    const params = useLocalSearchParams();

    // Support both childData JSON and direct studentId/studentName params
    const childData = params.childData ? JSON.parse(params.childData) :
        (params.studentId ? { studentId: params.studentId, name: params.studentName } : null);
    const termNumber = params.termNumber ? Number(params.termNumber) : 1;

    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    // Form state
    const [childInterest, setChildInterest] = useState('');
    const [homeParticipation, setHomeParticipation] = useState('');
    const [observations, setObservations] = useState('');
    const [suggestions, setSuggestions] = useState('');

    // Get user data (parent)
    const { data: userData, isLoading: isUserLoading } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const parentId = userData?.parentProfileId || userData?.id; // Handle different parent ID structures
    const studentId = childData?.userId || childData?.studentId;

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
        queryKey: ['parent-feedback', schoolId, studentId, parentId, academicYear?.id, termNumber],
        queryFn: async () => {
            const params = new URLSearchParams({
                studentId,
                parentId,
                ...(academicYear?.id && { academicYearId: academicYear.id }),
                termNumber: termNumber.toString(),
            });
            const res = await api.get(`/schools/${schoolId}/hpc/parent-feedback?${params}`);
            return res.data?.feedback?.[0] || null;
        },
        enabled: !!schoolId && !!studentId && !!parentId && !!academicYear?.id,
        staleTime: 1000 * 60 * 5,
        onSuccess: (data) => {
            if (data) {
                setChildInterest(data.childInterest || '');
                setHomeParticipation(data.homeParticipation || '');
                setObservations(data.observations || '');
                setSuggestions(data.suggestions || '');
            }
        },
    });

    // Submit feedback mutation
    const submitMutation = useMutation({
        mutationFn: async () => {
            return api.post(`/schools/${schoolId}/hpc/parent-feedback`, {
                studentId,
                parentId,
                academicYearId: academicYear?.id,
                termNumber,
                childInterest,
                homeParticipation,
                observations,
                suggestions,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['parent-feedback'] });
            queryClient.invalidateQueries({ queryKey: ['hpc-report'] });
            Alert.alert('Thank You!', 'Your feedback has been submitted.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        },
        onError: (error) => {
            Alert.alert('Error', error.message || 'Failed to save feedback');
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: ['parent-feedback'] });
        setRefreshing(false);
    }, [queryClient]);

    const handleSubmit = () => {
        if (!childInterest && !homeParticipation && !observations.trim()) {
            Alert.alert('Required', 'Please provide at least one response before submitting.');
            return;
        }
        submitMutation.mutate();
    };

    const isLoading = feedbackLoading || isUserLoading || !schoolId;
    const canSubmit = childInterest || homeParticipation || observations.trim();

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#10B981" />
                <Text style={styles.loadingText}>Loading feedback form...</Text>
            </View>
        );
    }

    if (!childData) {
        return (
            <View style={styles.loaderContainer}>
                <MessageSquare size={48} color="#999" />
                <Text style={styles.noDataText}>No child selected</Text>
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
                colors={['#10B981', '#059669']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                {/* Background Pattern */}
                <Text style={{ position: 'absolute', top: 20, right: 60, fontSize: 28, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>♡</Text>
                <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.04)' }} />

                <View style={styles.headerRow}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Parent Feedback</Text>
                        <Text style={styles.headerSubtitle}>{childData.name} • Term {termNumber}</Text>
                    </View>
                    <HapticTouchable
                        onPress={handleSubmit}
                        disabled={submitMutation.isPending || !canSubmit}
                    >
                        <View style={[styles.saveButton, (!canSubmit || submitMutation.isPending) && { opacity: 0.5 }]}>
                            {submitMutation.isPending ? (
                                <ActivityIndicator size="small" color="#10B981" />
                            ) : (
                                <Save size={20} color="#10B981" />
                            )}
                        </View>
                    </HapticTouchable>
                </View>

                {/* Info Card */}
                <View style={styles.infoCard}>
                    <Heart size={18} color="#fff" />
                    <Text style={styles.infoText}>
                        Your insights help us understand your child better. Schools value your feedback!
                    </Text>
                </View>
            </LinearGradient>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />
                }
            >
                {/* Child's Interest */}
                <Animated.View entering={FadeInDown.delay(100)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#EC4899' + '20' }]}>
                            <Heart size={20} color="#EC4899" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>Child's Interest in Learning</Text>
                            <Text style={styles.questionSubtitle}>How interested is your child in school activities?</Text>
                        </View>
                    </View>
                    <OptionButton
                        options={INTEREST_OPTIONS}
                        value={childInterest}
                        onChange={setChildInterest}
                    />
                </Animated.View>

                {/* Home Participation */}
                <Animated.View entering={FadeInDown.delay(200)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#0469ff' + '20' }]}>
                            <Home size={20} color="#0469ff" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>Home Participation</Text>
                            <Text style={styles.questionSubtitle}>Does your child participate in learning at home?</Text>
                        </View>
                    </View>
                    <OptionButton
                        options={PARTICIPATION_OPTIONS}
                        value={homeParticipation}
                        onChange={setHomeParticipation}
                    />
                </Animated.View>

                {/* Observations */}
                <Animated.View entering={FadeInDown.delay(300)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#8B5CF6' + '20' }]}>
                            <Eye size={20} color="#8B5CF6" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>Your Observations</Text>
                            <Text style={styles.questionOptional}>Optional</Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Share any observations about your child's learning journey..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={observations}
                        onChangeText={setObservations}
                        textAlignVertical="top"
                    />
                </Animated.View>

                {/* Suggestions */}
                <Animated.View entering={FadeInDown.delay(400)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#F59E0B' + '20' }]}>
                            <MessageSquare size={20} color="#F59E0B" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>Suggestions for School</Text>
                            <Text style={styles.questionOptional}>Optional</Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Any suggestions or feedback for the school..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={suggestions}
                        onChangeText={setSuggestions}
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
                        colors={canSubmit ? ['#10B981', '#059669'] : ['#D1D5DB', '#9CA3AF']}
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
        backgroundColor: '#10B981',
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
    questionSubtitle: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    questionOptional: {
        fontSize: 11,
        color: '#999',
        fontWeight: '500',
        marginTop: 2,
    },
    optionContainer: {
        marginTop: 4,
    },
    optionLabel: {
        fontSize: 13,
        color: '#666',
        marginBottom: 8,
    },
    optionRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    optionPill: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#e5e7eb',
        backgroundColor: '#f8f9fa',
    },
    optionText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
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
});
