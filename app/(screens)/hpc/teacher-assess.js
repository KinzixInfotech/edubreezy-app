// Teacher SEL Assessment Screen - HPC
// Teachers can assess students on Social-Emotional Learning parameters
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    Alert,
    Dimensions,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    Save,
    Heart,
    Users,
    CheckCircle,
    ChevronDown,
    MessageSquare,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// SEL Grade options
const GRADE_OPTIONS = [
    { value: 'EXCELLENT', label: 'Excellent', color: '#10B981' },
    { value: 'PROFICIENT', label: 'Proficient', color: '#22C55E' },
    { value: 'DEVELOPING', label: 'Developing', color: '#F59E0B' },
    { value: 'NEEDS_IMPROVEMENT', label: 'Needs Improvement', color: '#EF4444' },
];

// Grade Selector Component
const GradeSelector = ({ value, onChange, paramName }) => {
    const [isOpen, setIsOpen] = useState(false);
    const selectedOption = GRADE_OPTIONS.find((o) => o.value === value);

    return (
        <View style={styles.gradeSelector}>
            <Text style={styles.paramName} numberOfLines={1}>{paramName}</Text>
            <HapticTouchable onPress={() => setIsOpen(!isOpen)}>
                <View style={[
                    styles.gradeButton,
                    { backgroundColor: selectedOption?.color ? selectedOption.color + '20' : '#f5f5f5' }
                ]}>
                    <Text style={[
                        styles.gradeButtonText,
                        { color: selectedOption?.color || '#666' }
                    ]}>
                        {selectedOption?.label || 'Select Grade'}
                    </Text>
                    <ChevronDown size={16} color={selectedOption?.color || '#666'} />
                </View>
            </HapticTouchable>

            {isOpen && (
                <Animated.View entering={FadeInDown.duration(200)} style={styles.gradeDropdown}>
                    {GRADE_OPTIONS.map((option) => (
                        <HapticTouchable
                            key={option.value}
                            onPress={() => {
                                onChange(option.value);
                                setIsOpen(false);
                            }}
                        >
                            <View style={[
                                styles.gradeOption,
                                value === option.value && { backgroundColor: option.color + '20' }
                            ]}>
                                <View style={[styles.gradeDot, { backgroundColor: option.color }]} />
                                <Text style={[styles.gradeOptionText, { color: option.color }]}>
                                    {option.label}
                                </Text>
                                {value === option.value && (
                                    <CheckCircle size={16} color={option.color} />
                                )}
                            </View>
                        </HapticTouchable>
                    ))}
                </Animated.View>
            )}
        </View>
    );
};

export default function TeacherSELAssessScreen() {
    const params = useLocalSearchParams();
    const childData = params.childData ? JSON.parse(params.childData) : null;
    console.log(childData);

    // const termNumber = params.termNumber ? Number(params.termNumber) : 1;
    const [termNumber, setTermNumber] = useState(params.termNumber ? Number(params.termNumber) : 1);

    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [assessments, setAssessments] = useState({});

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
    // Try multiple fields for studentId (handles different data structures)
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

    // Fetch SEL parameters for school
    const { data: selParams, isLoading: paramsLoading } = useQuery({
        queryKey: ['sel-parameters', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/hpc/sel`);
            return res.data?.parameters || [];
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 10,
    });

    // Fetch existing assessments
    const { data: existingAssessments, isLoading: assessmentsLoading } = useQuery({
        queryKey: ['sel-assessments', schoolId, studentId, academicYear?.id, termNumber],
        queryFn: async () => {
            const params = new URLSearchParams({
                studentId,
                ...(academicYear?.id && { academicYearId: academicYear.id }),
                termNumber: termNumber.toString(),
            });
            const res = await api.get(`/schools/${schoolId}/hpc/sel/assess?${params}`);
            return res.data?.assessments || [];
        },
        enabled: !!schoolId && !!studentId && !!academicYear?.id,
        staleTime: 1000 * 60 * 5,
    });

    // Populate assessments from existing data (React Query v5 compatible)
    useEffect(() => {
        if (existingAssessments && existingAssessments.length > 0) {
            const initial = {};
            existingAssessments.forEach((a) => {
                initial[a.parameterId] = a.grade;
            });
            setAssessments(initial);
        }
    }, [existingAssessments]);

    // Group parameters by category
    const groupedParams = useMemo(() => {
        if (!selParams) return {};
        return selParams.reduce((acc, param) => {
            const cat = param.category || 'General';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(param);
            return acc;
        }, {});
    }, [selParams]);

    // Submit assessments mutation
    const submitMutation = useMutation({
        mutationFn: async (data) => {
            const assessmentArray = Object.entries(data).map(([parameterId, grade]) => ({
                studentId,
                parameterId,
                academicYearId: academicYear?.id,
                termNumber,
                grade,
            }));
            return api.post(`/schools/${schoolId}/hpc/sel/assess`, {
                assessedById: teacherId,
                assessments: assessmentArray,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sel-assessments'] });
            queryClient.invalidateQueries({ queryKey: ['hpc-report'] });
            Alert.alert('Saved!', 'SEL assessments have been saved.', [
                { text: 'OK', onPress: () => router.back() },
            ]);
        },
        onError: (error) => {
            Alert.alert('Error', error.message || 'Failed to save assessments');
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries({ queryKey: ['sel-parameters'] });
        await queryClient.invalidateQueries({ queryKey: ['sel-assessments'] });
        setRefreshing(false);
    }, [queryClient]);

    const handleGradeChange = (parameterId, grade) => {
        setAssessments((prev) => ({
            ...prev,
            [parameterId]: grade,
        }));
    };

    const handleSubmit = () => {
        // Validate studentId exists
        if (!studentId) {
            Alert.alert(
                'Error',
                'Student ID is missing. Please go back and select the student again.',
                [{ text: 'OK', onPress: () => router.back() }]
            );
            return;
        }

        const filledCount = Object.keys(assessments).length;
        const totalParams = selParams?.length || 0;

        if (filledCount < totalParams) {
            Alert.alert(
                'Incomplete',
                `You've assessed ${filledCount} of ${totalParams} parameters. Save anyway?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Save', onPress: () => submitMutation.mutate(assessments) },
                ]
            );
        } else {
            submitMutation.mutate(assessments);
        }
    };

    const isLoading = paramsLoading || assessmentsLoading || isUserLoading || !schoolId;
    const assessedCount = Object.keys(assessments).length;
    const totalParams = selParams?.length || 0;

    if (isLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#EC4899" />
                <Text style={styles.loadingText}>Loading SEL parameters...</Text>
            </View>
        );
    }

    if (!childData) {
        return (
            <View style={styles.loaderContainer}>
                <Users size={48} color="#999" />
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
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Header */}
            <LinearGradient
                colors={['#EC4899', '#DB2777']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.header}
            >
                {/* Background Pattern */}
                <Text style={{ position: 'absolute', top: 20, right: 60, fontSize: 28, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>♡</Text>
                <Text style={{ position: 'absolute', top: 70, right: 25, fontSize: 18, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>✧</Text>
                <Text style={{ position: 'absolute', bottom: 40, right: 100, fontSize: 22, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>★</Text>
                <View style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.04)' }} />
                <View style={{ position: 'absolute', bottom: -50, left: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.04)' }} />

                <View style={styles.headerRow}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}>
                            <ArrowLeft size={24} color="#fff" />
                        </View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>SEL Assessment</Text>
                        <Text style={styles.headerSubtitle}>{childData.name} • Term {termNumber}</Text>

                        {/* Term Switcher - Small */}
                        <View style={styles.termSwitcherMini}>
                            <HapticTouchable onPress={() => setTermNumber(1)}>
                                <View style={[styles.termPill, termNumber === 1 && styles.termPillActive]}>
                                    <Text style={[styles.termPillText, termNumber === 1 && styles.termPillTextActive]}>T1</Text>
                                </View>
                            </HapticTouchable>
                            <HapticTouchable onPress={() => setTermNumber(2)}>
                                <View style={[styles.termPill, termNumber === 2 && styles.termPillActive]}>
                                    <Text style={[styles.termPillText, termNumber === 2 && styles.termPillTextActive]}>T2</Text>
                                </View>
                            </HapticTouchable>
                        </View>
                    </View>
                    <HapticTouchable
                        onPress={handleSubmit}
                        disabled={submitMutation.isPending || assessedCount === 0}
                    >
                        <View style={[styles.saveButton, (submitMutation.isPending || assessedCount === 0) && { opacity: 0.5 }]}>
                            {submitMutation.isPending ? (
                                <ActivityIndicator size="small" color="#EC4899" />
                            ) : (
                                <Save size={20} color="#EC4899" />
                            )}
                        </View>
                    </HapticTouchable>
                </View>

                {/* Progress */}
                <View style={styles.progressCard}>
                    <View style={styles.progressInfo}>
                        <Heart size={20} color="#fff" />
                        <Text style={styles.progressText}>
                            {assessedCount} of {totalParams} assessed
                        </Text>
                    </View>
                    <View style={styles.progressBar}>
                        <View style={[
                            styles.progressFill,
                            { width: `${totalParams > 0 ? (assessedCount / totalParams) * 100 : 0}%` }
                        ]} />
                    </View>
                </View>
            </LinearGradient>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#EC4899" />
                }
            >
                {Object.entries(groupedParams).map(([category, params], catIdx) => (
                    <Animated.View
                        key={category || `cat-${catIdx}`}
                        entering={FadeInDown.delay(catIdx * 100)}
                        style={styles.categoryCard}
                    >
                        <View style={styles.categoryHeader}>
                            <Text style={styles.categoryTitle}>{category}</Text>
                            <Text style={styles.categoryCount}>{params.length} parameters</Text>
                        </View>

                        {params.map((param, idx) => (
                            <Animated.View
                                key={param?.id || `param-${catIdx}-${idx}`}
                                entering={FadeInRight.delay(catIdx * 100 + idx * 50)}
                            >
                                <GradeSelector
                                    value={assessments[param.id]}
                                    onChange={(grade) => handleGradeChange(param.id, grade)}
                                    paramName={param.name}
                                />
                            </Animated.View>
                        ))}
                    </Animated.View>
                ))}

                {/* Submit Button */}
                <HapticTouchable
                    onPress={handleSubmit}
                    disabled={submitMutation.isPending || assessedCount === 0}
                    style={{ marginTop: 16 }}
                >
                    <LinearGradient
                        colors={assessedCount > 0 ? ['#EC4899', '#DB2777'] : ['#D1D5DB', '#9CA3AF']}
                        style={styles.submitButton}
                    >
                        {submitMutation.isPending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <CheckCircle size={20} color="#fff" />
                                <Text style={styles.submitText}>Save Assessments</Text>
                            </>
                        )}
                    </LinearGradient>
                </HapticTouchable>

                <View style={{ height: 120 }} />
            </ScrollView>

            {/* Sticky Bottom: Give Narrative Feedback */}
            <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.stickyBottom}>
                <HapticTouchable
                    onPress={() => router.push({
                        pathname: '/hpc/teacher-narrative',
                        params: {
                            childData: JSON.stringify(childData),
                            termNumber: termNumber
                        }
                    })}
                >
                    <LinearGradient
                        colors={['#8B5CF6', '#7C3AED']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.narrativeButton}
                    >
                        <View style={styles.narrativeIconBox}>
                            <MessageSquare size={24} color="#fff" />
                        </View>
                        <View style={styles.narrativeTextBox}>
                            <Text style={styles.narrativeTitle}>Give Narrative Feedback</Text>
                            <Text style={styles.narrativeSubtitle}>Write detailed feedback for this student</Text>
                        </View>
                    </LinearGradient>
                </HapticTouchable>
            </Animated.View>
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
    noDataText: {
        fontSize: 16,
        color: '#666',
        marginTop: 8,
    },
    backButtonCenter: {
        marginTop: 20,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#EC4899',
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
    progressCard: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 12,
        padding: 14,
    },
    progressInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    progressText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#fff',
    },
    progressBar: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.3)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#fff',
        borderRadius: 3,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    categoryCard: {
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
    categoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    categoryTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#EC4899',
    },
    categoryCount: {
        fontSize: 12,
        color: '#999',
    },
    gradeSelector: {
        marginBottom: 14,
    },
    paramName: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    gradeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 10,
    },
    gradeButtonText: {
        fontSize: 13,
        fontWeight: '600',
    },
    gradeDropdown: {
        marginTop: 8,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#f0f0f0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 4,
        overflow: 'hidden',
    },
    gradeOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    gradeDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 10,
    },
    gradeOptionText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
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
    termSwitcherMini: {
        flexDirection: 'row',
        marginTop: 6,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 20,
        padding: 2,
        gap: 2,
    },
    termPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 16,
    },
    termPillActive: {
        backgroundColor: '#fff',
    },
    termPillText: {
        fontSize: 10,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.8)',
    },
    termPillTextActive: {
        color: '#EC4899',
    },
    stickyBottom: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: 24,
        backgroundColor: '#f8f9fa',
    },
    narrativeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
    },
    narrativeIconBox: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    narrativeTextBox: {
        flex: 1,
        marginLeft: 14,
    },
    narrativeTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
    },
    narrativeSubtitle: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        marginTop: 2,
    },
});
