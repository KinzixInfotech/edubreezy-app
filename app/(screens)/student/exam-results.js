// app/(screens)/student/exam-results.js
// Student Exam Results Screen - Shows exam scores with details
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    Award,
    TrendingUp,
    TrendingDown,
    ChevronDown,
    AlertCircle,
    Calendar,
    Clock,
    CheckCircle,
    XCircle,
    BookOpen,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

export default function StudentExamResultsScreen() {
    const [refreshing, setRefreshing] = useState(false);
    const [selectedExam, setSelectedExam] = useState(null);
    const [showExamPicker, setShowExamPicker] = useState(false);

    // Load user data
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    // Use userId for exam API - this is the same pattern that works in home.js StudentView
    const userId = userData?.id;

    // Fetch exam results for student using same API as parent module
    const { data: examData, isLoading: resultsLoading, refetch } = useQuery({
        queryKey: ['student-exam-results', schoolId, userId],
        queryFn: async () => {
            console.log('📊 Fetching student results for ID:', userId);
            const res = await api.get(`/schools/${schoolId}/examination/student-results?studentId=${userId}`);
            console.log('📊 Got exam data:', res.data);
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 1000 * 60 * 5,
    });

    const exams = examData?.results || [];  // Array of exam results with subjects
    const stats = examData?.stats || {};

    // For this screen, we show all exams in a list instead of selector
    const results = exams;

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    React.useEffect(() => {
        if (exams.length > 0 && !selectedExam) {
            setSelectedExam(exams[0]);
        }
    }, [exams]);

    const getGradeColor = (percent) => {
        if (percent >= 80) return '#10B981';
        if (percent >= 60) return '#0469ff';
        if (percent >= 40) return '#F59E0B';
        return '#EF4444';
    };

    const getGradeLabel = (percent) => {
        if (percent >= 90) return 'Excellent';
        if (percent >= 75) return 'Very Good';
        if (percent >= 60) return 'Good';
        if (percent >= 40) return 'Average';
        return 'Needs Improvement';
    };

    const formatDate = (exam) => {
        const dateStr = exam?.startDate || exam?.date || exam?.createdAt || exam?.subjects?.[0]?.date;
        if (!dateStr) return '--';
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    };

    // Calculate summary from results
    const totalObtained = results.reduce((sum, r) => sum + (r.marksObtained || r.obtainedMarks || r.score || 0), 0);
    const totalMax = results.reduce((sum, r) => sum + (r.examSubject?.maxMarks || r.maxMarks || 0), 0);
    const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
    const totalPassing = results.reduce((sum, r) => sum + (r.examSubject?.passingMarks || r.passingMarks || 0), 0);
    const passed = totalObtained >= totalPassing;

    return (
        <View style={styles.container}>
            <StatusBar style='dark' />
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Exam Results</Text>
                    <Text style={styles.headerSubtitle}>Your Performance</Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {/* Exam Selector */}
            {exams.length > 0 && (
                <View style={styles.examSelector}>
                    <HapticTouchable onPress={() => setShowExamPicker(!showExamPicker)}>
                        <View style={styles.examSelectorButton}>
                            <Text style={styles.examSelectorText}>
                                {selectedExam?.title || selectedExam?.name || 'Select Exam'}
                            </Text>
                            <ChevronDown size={20} color="#0469ff" />
                        </View>
                    </HapticTouchable>
                    {showExamPicker && (
                        <View style={styles.examDropdown}>
                            {exams.map((exam) => (
                                <HapticTouchable
                                    key={exam.id}
                                    onPress={() => {
                                        setSelectedExam(exam);
                                        setShowExamPicker(false);
                                    }}
                                >
                                    <View style={[
                                        styles.examOption,
                                        selectedExam?.id === exam.id && styles.examOptionActive
                                    ]}>
                                        <Text style={[
                                            styles.examOptionText,
                                            selectedExam?.id === exam.id && styles.examOptionTextActive
                                        ]}>
                                            {exam.title || exam.name}
                                        </Text>
                                        <Text style={styles.examOptionDate}>
                                            {formatDate(exam)}
                                        </Text>
                                    </View>
                                </HapticTouchable>
                            ))}
                        </View>
                    )}
                </View>
            )}

            {resultsLoading ? (
                <View style={styles.loaderContainer}>
                    <ActivityIndicator size="large" color="#0469ff" />
                </View>
            ) : (
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
                >
                    {/* Exam Info Card */}
                    {selectedExam && (
                        <Animated.View entering={FadeInDown.delay(50).duration(400)}>
                            <View style={styles.examInfoCard}>
                                <View style={styles.examInfoHeader}>
                                    <BookOpen size={20} color="#0469ff" />
                                    <Text style={styles.examInfoTitle}>{selectedExam.title || selectedExam.name}</Text>
                                </View>
                                <View style={styles.examInfoRow}>
                                    <View style={styles.examInfoItem}>
                                        <Calendar size={14} color="#666" />
                                        <Text style={styles.examInfoLabel}>Date</Text>
                                        <Text style={styles.examInfoValue}>{formatDate(selectedExam)}</Text>
                                    </View>
                                    <View style={styles.examInfoItem}>
                                        <Clock size={14} color="#666" />
                                        <Text style={styles.examInfoLabel}>Type</Text>
                                        <Text style={styles.examInfoValue}>{selectedExam.type || 'Exam'}</Text>
                                    </View>
                                    <View style={styles.examInfoItem}>
                                        <BookOpen size={14} color="#666" />
                                        <Text style={styles.examInfoLabel}>Subjects</Text>
                                        <Text style={styles.examInfoValue}>{selectedExam.subjects?.length || results.length || 0}</Text>
                                    </View>
                                </View>
                            </View>
                        </Animated.View>
                    )}

                    {/* Summary Card */}
                    {results.length > 0 && (
                        <Animated.View entering={FadeInDown.delay(100).duration(400)}>
                            <View style={styles.summaryCard}>
                                <View style={styles.summaryMain}>
                                    <View style={[styles.percentCircle, { borderColor: getGradeColor(percentage) }]}>
                                        <Text style={[styles.percentText, { color: getGradeColor(percentage) }]}>
                                            {Math.round(percentage)}%
                                        </Text>
                                    </View>
                                    <View style={styles.summaryDetails}>
                                        <Text style={styles.summaryLabel}>Total Score</Text>
                                        <Text style={styles.summaryValue}>{totalObtained}/{totalMax}</Text>
                                        <View style={[styles.statusBadge, { backgroundColor: passed ? '#D1FAE5' : '#FEE2E2' }]}>
                                            {passed ? <CheckCircle size={14} color="#10B981" /> : <XCircle size={14} color="#EF4444" />}
                                            <Text style={[styles.statusText, { color: passed ? '#10B981' : '#EF4444' }]}>
                                                {passed ? 'PASSED' : 'FAILED'}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                                <View style={styles.performanceRow}>
                                    <View style={[styles.performanceBadge, { backgroundColor: getGradeColor(percentage) + '20' }]}>
                                        <Award size={16} color={getGradeColor(percentage)} />
                                        <Text style={[styles.performanceText, { color: getGradeColor(percentage) }]}>
                                            {getGradeLabel(percentage)}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </Animated.View>
                    )}

                    {/* Subject Results */}
                    <Text style={styles.sectionTitle}>Subject-wise Results</Text>

                    {results.length > 0 ? (
                        results.map((result, index) => {
                            const obtainedMarks = result.marksObtained || result.obtainedMarks || result.score || 0;
                            const maxMarks = result.examSubject?.maxMarks || result.maxMarks || result.totalMarks || 100;
                            const passingMarks = result.examSubject?.passingMarks || result.passingMarks || Math.round(maxMarks * 0.33);
                            const percent = maxMarks ? (obtainedMarks / maxMarks) * 100 : 0;
                            const subjectPassed = obtainedMarks >= passingMarks;

                            return (
                                <Animated.View
                                    key={result.id || index}
                                    entering={FadeInRight.delay(index * 80).duration(400)}
                                >
                                    <View style={styles.resultCard}>
                                        <View style={styles.resultHeader}>
                                            <Text style={styles.subjectName}>
                                                {result.subject?.subjectName || result.subjectName || 'Overall Score'}
                                            </Text>
                                            <View style={[
                                                styles.passBadge,
                                                { backgroundColor: subjectPassed ? '#D1FAE5' : '#FEE2E2' }
                                            ]}>
                                                {subjectPassed ? (
                                                    <TrendingUp size={14} color="#10B981" />
                                                ) : (
                                                    <TrendingDown size={14} color="#EF4444" />
                                                )}
                                                <Text style={[styles.passText, { color: subjectPassed ? '#10B981' : '#EF4444' }]}>
                                                    {subjectPassed ? 'Pass' : 'Fail'}
                                                </Text>
                                            </View>
                                        </View>
                                        <View style={styles.resultBody}>
                                            <View style={styles.marksContainer}>
                                                <Text style={styles.marksObtained}>{obtainedMarks}</Text>
                                                <Text style={styles.marksMax}>/{maxMarks}</Text>
                                                <Text style={styles.marksPercent}>({Math.round(percent)}%)</Text>
                                            </View>
                                            <View style={styles.progressBar}>
                                                <View style={[
                                                    styles.progressFill,
                                                    { width: `${Math.min(percent, 100)}%`, backgroundColor: getGradeColor(percent) }
                                                ]} />
                                            </View>
                                            {result.remarks && (
                                                <Text style={styles.remarks}>Remarks: {result.remarks}</Text>
                                            )}
                                        </View>
                                    </View>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <View style={styles.emptyState}>
                            <AlertCircle size={48} color="#ccc" />
                            <Text style={styles.emptyTitle}>No Results</Text>
                            <Text style={styles.emptySubtitle}>
                                {selectedExam ? 'Results not published yet' : 'Select an exam to view results'}
                            </Text>
                        </View>
                    )}

                    <View style={{ height: 40 }} />
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },

    examSelector: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0', zIndex: 10 },
    examSelectorButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#E3F2FD', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
    examSelectorText: { fontSize: 15, fontWeight: '600', color: '#0469ff' },
    examDropdown: { position: 'absolute', top: 60, left: 16, right: 16, backgroundColor: '#fff', borderRadius: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, zIndex: 20 },
    examOption: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    examOptionActive: { backgroundColor: '#E3F2FD' },
    examOptionText: { fontSize: 14, color: '#666' },
    examOptionTextActive: { color: '#0469ff', fontWeight: '600' },
    examOptionDate: { fontSize: 12, color: '#999' },

    content: { flex: 1, padding: 16 },

    // Exam Info Card
    examInfoCard: { backgroundColor: '#f8f9fa', borderRadius: 16, padding: 16, marginBottom: 16 },
    examInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    examInfoTitle: { fontSize: 16, fontWeight: '700', color: '#111', flex: 1 },
    examInfoRow: { flexDirection: 'row', gap: 12 },
    examInfoItem: { flex: 1, alignItems: 'center', gap: 4 },
    examInfoLabel: { fontSize: 11, color: '#666' },
    examInfoValue: { fontSize: 13, fontWeight: '600', color: '#111' },

    // Summary Card
    summaryCard: { backgroundColor: '#f8f9fa', borderRadius: 16, padding: 20, marginBottom: 20 },
    summaryMain: { flexDirection: 'row', alignItems: 'center', gap: 20 },
    percentCircle: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
    percentText: { fontSize: 24, fontWeight: '700' },
    summaryDetails: { flex: 1 },
    summaryLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
    summaryValue: { fontSize: 28, fontWeight: '700', color: '#111' },
    statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginTop: 8 },
    statusText: { fontSize: 12, fontWeight: '700' },
    performanceRow: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb' },
    performanceBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: 'flex-start' },
    performanceText: { fontSize: 14, fontWeight: '600' },

    sectionTitle: { fontSize: 17, fontWeight: '700', color: '#111', marginBottom: 12 },

    resultCard: { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 16, marginBottom: 10 },
    resultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    subjectName: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
    passBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    passText: { fontSize: 12, fontWeight: '600' },
    resultBody: { gap: 8 },
    marksContainer: { flexDirection: 'row', alignItems: 'baseline' },
    marksObtained: { fontSize: 24, fontWeight: '700', color: '#111' },
    marksMax: { fontSize: 14, color: '#666' },
    marksPercent: { fontSize: 14, color: '#666', marginLeft: 8 },
    progressBar: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 4 },
    remarks: { fontSize: 12, color: '#666', fontStyle: 'italic', marginTop: 4 },

    emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#666', textAlign: 'center' },
});
