// Student Reflection Screen - HPC Self-Assessment
// Students can submit their term reflection
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
    ArrowLeft,
    Send,
    Lightbulb,
    Target,
    AlertTriangle,
    Sparkles,
    CheckCircle,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

export default function StudentReflectionScreen() {
    const params = useLocalSearchParams();
    const termNumber = params.termNumber ? Number(params.termNumber) : 1;

    const queryClient = useQueryClient();
    const [formData, setFormData] = useState({
        whatLearned: '',
        whatFoundDifficult: '',
        whatToImprove: '',
        goalsForNextTerm: '',
    });

    // Get user data
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
    const { data: existingReflection, isLoading } = useQuery({
        queryKey: ['student-reflection', schoolId, studentId, academicYear?.id, termNumber],
        queryFn: async () => {
            const params = new URLSearchParams({
                studentId,
                ...(academicYear?.id && { academicYearId: academicYear.id }),
                termNumber: termNumber.toString(),
            });
            const res = await api.get(`/schools/${schoolId}/hpc/reflections?${params}`);
            return res.data?.reflection;
        },
        enabled: !!schoolId && !!studentId && !!academicYear?.id,
        staleTime: 1000 * 60 * 5,
        onSuccess: (data) => {
            if (data) {
                setFormData({
                    whatLearned: data.whatLearned || '',
                    whatFoundDifficult: data.whatFoundDifficult || '',
                    whatToImprove: data.whatToImprove || '',
                    goalsForNextTerm: data.goalsForNextTerm || '',
                });
            }
        },
    });

    // Submit reflection mutation
    const submitMutation = useMutation({
        mutationFn: async (data) => {
            return api.post(`/schools/${schoolId}/hpc/reflections`, {
                studentId,
                academicYearId: academicYear?.id,
                termNumber,
                ...data,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['student-reflection'] });
            queryClient.invalidateQueries({ queryKey: ['hpc-report'] });
            Alert.alert('Success!', 'Your reflection has been saved.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        },
        onError: (error) => {
            Alert.alert('Error', error.message || 'Failed to save reflection');
        },
    });

    const handleSubmit = () => {
        if (!formData.whatLearned.trim()) {
            Alert.alert('Required', 'Please share what you learned this term');
            return;
        }
        submitMutation.mutate(formData);
    };

    const isFormDirty = formData.whatLearned || formData.whatFoundDifficult || formData.whatToImprove || formData.goalsForNextTerm;

    if (isLoading || isUserLoading || !schoolId) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.loadingText}>Loading your reflection...</Text>
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
                {/* Background Pattern */}
                <Text style={{ position: 'absolute', top: 20, right: 60, fontSize: 28, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>✦</Text>
                <Text style={{ position: 'absolute', top: 70, right: 25, fontSize: 18, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>◆</Text>
                <Text style={{ position: 'absolute', bottom: 40, right: 100, fontSize: 22, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>●</Text>
                <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.04)' }} />
                <View style={{ position: 'absolute', bottom: -50, left: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.04)' }} />

                <View style={styles.headerRow}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>My Reflection</Text>
                        <Text style={styles.headerSubtitle}>Term {termNumber} • {academicYear?.name || 'Current Year'}</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>

                <View style={styles.infoCard}>
                    <Sparkles size={20} color="#FFD93D" />
                    <Text style={styles.infoText}>
                        Reflect on your learning journey this term. Your thoughts help teachers understand your progress better!
                    </Text>
                </View>
            </LinearGradient>

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* What I Learned */}
                    <Animated.View entering={FadeInDown.delay(100)} style={styles.inputCard}>
                        <View style={styles.inputHeader}>
                            <View style={[styles.inputIcon, { backgroundColor: '#D1FAE5' }]}>
                                <Lightbulb size={18} color="#10B981" />
                            </View>
                            <Text style={styles.inputLabel}>What I Learned This Term *</Text>
                        </View>
                        <TextInput
                            style={styles.textArea}
                            placeholder="Share the most important things you learned..."
                            placeholderTextColor="#999"
                            multiline
                            numberOfLines={4}
                            value={formData.whatLearned}
                            onChangeText={(text) => setFormData({ ...formData, whatLearned: text })}
                            textAlignVertical="top"
                        />
                    </Animated.View>

                    {/* What I Found Difficult */}
                    <Animated.View entering={FadeInDown.delay(200)} style={styles.inputCard}>
                        <View style={styles.inputHeader}>
                            <View style={[styles.inputIcon, { backgroundColor: '#FEF3C7' }]}>
                                <AlertTriangle size={18} color="#F59E0B" />
                            </View>
                            <Text style={styles.inputLabel}>What I Found Challenging</Text>
                        </View>
                        <TextInput
                            style={styles.textArea}
                            placeholder="What topics or skills were difficult for you?"
                            placeholderTextColor="#999"
                            multiline
                            numberOfLines={4}
                            value={formData.whatFoundDifficult}
                            onChangeText={(text) => setFormData({ ...formData, whatFoundDifficult: text })}
                            textAlignVertical="top"
                        />
                    </Animated.View>

                    {/* What to Improve */}
                    <Animated.View entering={FadeInDown.delay(300)} style={styles.inputCard}>
                        <View style={styles.inputHeader}>
                            <View style={[styles.inputIcon, { backgroundColor: '#DBEAFE' }]}>
                                <Target size={18} color="#3B82F6" />
                            </View>
                            <Text style={styles.inputLabel}>What I Want to Improve</Text>
                        </View>
                        <TextInput
                            style={styles.textArea}
                            placeholder="What would you like to get better at?"
                            placeholderTextColor="#999"
                            multiline
                            numberOfLines={4}
                            value={formData.whatToImprove}
                            onChangeText={(text) => setFormData({ ...formData, whatToImprove: text })}
                            textAlignVertical="top"
                        />
                    </Animated.View>

                    {/* Goals for Next Term */}
                    <Animated.View entering={FadeInDown.delay(400)} style={styles.inputCard}>
                        <View style={styles.inputHeader}>
                            <View style={[styles.inputIcon, { backgroundColor: '#F3E8FF' }]}>
                                <Sparkles size={18} color="#8B5CF6" />
                            </View>
                            <Text style={styles.inputLabel}>My Goals for Next Term</Text>
                        </View>
                        <TextInput
                            style={styles.textArea}
                            placeholder="What do you want to achieve next term?"
                            placeholderTextColor="#999"
                            multiline
                            numberOfLines={4}
                            value={formData.goalsForNextTerm}
                            onChangeText={(text) => setFormData({ ...formData, goalsForNextTerm: text })}
                            textAlignVertical="top"
                        />
                    </Animated.View>

                    {/* Submit Button */}
                    <Animated.View entering={FadeInDown.delay(500)} style={styles.submitContainer}>
                        <HapticTouchable
                            onPress={handleSubmit}
                            disabled={submitMutation.isPending || !formData.whatLearned.trim()}
                        >
                            <LinearGradient
                                colors={formData.whatLearned.trim() ? ['#8B5CF6', '#7C3AED'] : ['#D1D5DB', '#9CA3AF']}
                                style={styles.submitButton}
                            >
                                {submitMutation.isPending ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : existingReflection ? (
                                    <>
                                        <CheckCircle size={20} color="#fff" />
                                        <Text style={styles.submitText}>Update Reflection</Text>
                                    </>
                                ) : (
                                    <>
                                        <Send size={20} color="#fff" />
                                        <Text style={styles.submitText}>Submit Reflection</Text>
                                    </>
                                )}
                            </LinearGradient>
                        </HapticTouchable>
                    </Animated.View>

                    <View style={{ height: 40 }} />
                </ScrollView>
            </KeyboardAvoidingView>
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
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        padding: 12,
        gap: 10,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        lineHeight: 18,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    inputCard: {
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
    inputHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    inputIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inputLabel: {
        flex: 1,
        fontSize: 14,
        fontWeight: '700',
        color: '#333',
        marginLeft: 10,
    },
    textArea: {
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 14,
        fontSize: 14,
        color: '#333',
        minHeight: 100,
        lineHeight: 20,
    },
    submitContainer: {
        marginTop: 8,
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
