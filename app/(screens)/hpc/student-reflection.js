// Student Self-Reflection Screen - HPC
// Students submit their termly reflections for NEP 2020 compliance
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
    Lightbulb,
    HelpCircle,
    Target,
    CheckCircle,
    Sparkles,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

export default function StudentReflectionScreen() {
    const params = useLocalSearchParams();
    const termNumber = params.termNumber ? Number(params.termNumber) : 1;

    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    // Form state
    const [learnedWell, setLearnedWell] = useState('');
    const [foundDifficult, setFoundDifficult] = useState('');
    const [wantToImprove, setWantToImprove] = useState('');

    // Get user data (student)
    const { data: userData, isLoading: isUserLoading } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const studentId = userData?.id;

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

    // Fetch existing reflection
    const { data: existingReflection, isLoading: reflectionLoading } = useQuery({
        queryKey: ['student-reflection', schoolId, studentId, academicYear?.id, termNumber],
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
        onSuccess: (data) => {
            if (data) {
                setLearnedWell(data.learnedWell || '');
                setFoundDifficult(data.foundDifficult || '');
                setWantToImprove(data.wantToImprove || '');
            }
        },
    });

    // Submit reflection mutation
    const submitMutation = useMutation({
        mutationFn: async () => {
            return api.post(`/schools/${schoolId}/hpc/reflections`, {
                studentId,
                academicYearId: academicYear?.id,
                termNumber,
                learnedWell,
                foundDifficult,
                wantToImprove,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['student-reflection'] });
            queryClient.invalidateQueries({ queryKey: ['hpc-report'] });
            Alert.alert('Saved!', 'Your reflection has been submitted.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        },
        onError: (error) => {
            Alert.alert('Error', error.message || 'Failed to save reflection');
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: ['student-reflection'] });
        setRefreshing(false);
    }, [queryClient]);

    const handleSubmit = () => {
        if (!learnedWell.trim()) {
            Alert.alert('Required', 'Please fill in "What did you learn well?" before submitting.');
            return;
        }
        submitMutation.mutate();
    };

    const isLoading = reflectionLoading || isUserLoading || !schoolId;
    const canSubmit = learnedWell.trim().length > 0;

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.loadingText}>Loading your reflection...</Text>
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
                colors={['#8B5CF6', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                {/* Background Pattern */}
                <Text style={{ position: 'absolute', top: 20, right: 60, fontSize: 28, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>✦</Text>
                <Text style={{ position: 'absolute', top: 70, right: 25, fontSize: 18, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>★</Text>
                <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.04)' }} />

                <View style={styles.headerRow}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>My Reflection</Text>
                        <Text style={styles.headerSubtitle}>Term {termNumber}</Text>
                    </View>
                    <HapticTouchable
                        onPress={handleSubmit}
                        disabled={submitMutation.isPending || !canSubmit}
                    >
                        <View style={[styles.saveButton, (!canSubmit || submitMutation.isPending) && { opacity: 0.5 }]}>
                            {submitMutation.isPending ? (
                                <ActivityIndicator size="small" color="#8B5CF6" />
                            ) : (
                                <Save size={20} color="#8B5CF6" />
                            )}
                        </View>
                    </HapticTouchable>
                </View>

                {/* Info Card */}
                <View style={styles.infoCard}>
                    <Sparkles size={18} color="#fff" />
                    <Text style={styles.infoText}>
                        Share your learning journey this term. Your voice matters!
                    </Text>
                </View>
            </LinearGradient>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8B5CF6" />
                }
            >
                {/* Question 1 - Required */}
                <Animated.View entering={FadeInDown.delay(100)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#10B981' + '20' }]}>
                            <Lightbulb size={20} color="#10B981" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>What did you learn well?</Text>
                            <Text style={styles.questionRequired}>Required</Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Share your achievements and learnings..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={learnedWell}
                        onChangeText={setLearnedWell}
                        textAlignVertical="top"
                    />
                </Animated.View>

                {/* Question 2 */}
                <Animated.View entering={FadeInDown.delay(200)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#F59E0B' + '20' }]}>
                            <HelpCircle size={20} color="#F59E0B" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>What was difficult?</Text>
                            <Text style={styles.questionOptional}>Optional</Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Anything you found challenging..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={foundDifficult}
                        onChangeText={setFoundDifficult}
                        textAlignVertical="top"
                    />
                </Animated.View>

                {/* Question 3 */}
                <Animated.View entering={FadeInDown.delay(300)} style={styles.questionCard}>
                    <View style={styles.questionHeader}>
                        <View style={[styles.iconBox, { backgroundColor: '#EC4899' + '20' }]}>
                            <Target size={20} color="#EC4899" />
                        </View>
                        <View style={styles.questionTextContainer}>
                            <Text style={styles.questionTitle}>What do you want to improve?</Text>
                            <Text style={styles.questionOptional}>Optional</Text>
                        </View>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="Your goals for the next term..."
                        placeholderTextColor="#999"
                        multiline
                        numberOfLines={4}
                        value={wantToImprove}
                        onChangeText={setWantToImprove}
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
                        colors={canSubmit ? ['#8B5CF6', '#7C3AED'] : ['#D1D5DB', '#9CA3AF']}
                        style={styles.submitButton}
                    >
                        {submitMutation.isPending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <CheckCircle size={20} color="#fff" />
                                <Text style={styles.submitText}>Submit Reflection</Text>
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
});
