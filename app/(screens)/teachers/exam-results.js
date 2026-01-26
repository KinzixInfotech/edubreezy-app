// app/(screens)/teachers/exam-results.js
// Teacher view for student examination results
import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    ActivityIndicator,
    TextInput,
    TouchableOpacity,
    Modal,
    FlatList,
    SafeAreaView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    Search,
    ChevronDown,
    Award,
    CheckCircle,
    XCircle,
    AlertCircle,
    ArrowLeft,
    Copy,
    TrendingUp,
    X as CloseIcon,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';

export default function TeacherExamResults() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedExam, setSelectedExam] = useState(null);
    const [showExamPicker, setShowExamPicker] = useState(false);

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const teacherId = userData?.id;

    // Fetch exams for teacher's classes
    const { data: examsData, isLoading: examsLoading } = useQuery({
        queryKey: ['teacher-exams', schoolId, teacherId],
        queryFn: async () => {
            if (!schoolId || !teacherId) return null;
            const res = await api.get(`/schools/${schoolId}/teachers/${teacherId}/exams`);
            return res.data;
        },
        enabled: !!schoolId && !!teacherId,
        staleTime: 1000 * 60 * 5,
    });

    // Fetch results for selected exam
    const { data: resultsData, isLoading: resultsLoading } = useQuery({
        queryKey: ['exam-results', selectedExam?.id, teacherId],
        queryFn: async () => {
            if (!selectedExam?.id) return null;
            const res = await api.get(
                `/schools/${schoolId}/examination/exams/${selectedExam.id}/results?teacherId=${teacherId}`
            );
            return res.data;
        },
        enabled: !!selectedExam?.id && !!schoolId && !!teacherId,
        staleTime: 1000 * 60 * 2,
    });

    const exams = Array.isArray(examsData) ? examsData : [];
    const results = resultsData?.results || [];

    // Automatically select first exam if available
    React.useEffect(() => {
        if (exams.length > 0 && !selectedExam) {
            setSelectedExam(exams[0]);
        }
    }, [exams, selectedExam]);

    // Group results by student
    const studentResults = useMemo(() => {
        if (!results.length) return [];

        const grouped = {};
        results.forEach(result => {
            const studentId = result.student?.userId || result.studentId;
            if (!grouped[studentId]) {
                grouped[studentId] = {
                    id: studentId,
                    name: result.student?.user?.name || result.student?.name || 'Unknown',
                    rollNumber: result.student?.rollNumber,
                    subjects: [],
                    totalMarks: 0,
                    totalMaxMarks: 0,
                    totalObtained: 0,
                    absent: false,
                };
            }

            grouped[studentId].subjects.push({
                name: result.subject?.subjectName || 'Unknown Subject',
                marksObtained: result.marksObtained || 0,
                maxMarks: result.examSubject?.maxMarks || 100,
                passingMarks: result.examSubject?.passingMarks || 33,
                grade: result.grade,
                isAbsent: result.isAbsent,
            });

            if (!result.isAbsent) {
                grouped[studentId].totalObtained += result.marksObtained || 0;
            }
            grouped[studentId].totalMaxMarks += result.examSubject?.maxMarks || 100;
            if (result.isAbsent) {
                grouped[studentId].absent = true;
            }
        });

        // Calculate percentage and pass/fail for each student
        return Object.values(grouped).map(student => {
            const percentage = student.totalMaxMarks > 0
                ? (student.totalObtained / student.totalMaxMarks) * 100
                : 0;

            const passed = !student.absent && student.subjects.every(subject =>
                !subject.isAbsent && subject.marksObtained >= subject.passingMarks
            );

            return {
                ...student,
                percentage: Math.round(percentage * 100) / 100,
                passed,
            };
        }).sort((a, b) => (a.rollNumber || 0) - (b.rollNumber || 0));
    }, [results]);

    // Filter students by search
    const filteredStudents = useMemo(() => {
        if (!searchQuery.trim()) return studentResults;
        const query = searchQuery.toLowerCase();
        return studentResults.filter(student =>
            student.name.toLowerCase().includes(query) ||
            student.rollNumber?.toString().includes(query)
        );
    }, [studentResults, searchQuery]);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await Promise.all([
            queryClient.invalidateQueries(['teacher-exams']),
            queryClient.invalidateQueries(['exam-results']),
        ]);
        setRefreshing(false);
    }, [queryClient]);

    // Calculate class stats
    const classStats = useMemo(() => {
        if (!studentResults.length) return null;
        const totalStudents = studentResults.length;
        const passedStudents = studentResults.filter(s => s.passed).length;
        const avgPercentage = studentResults.reduce((sum, s) => sum + s.percentage, 0) / totalStudents;

        return {
            totalStudents,
            passed: passedStudents,
            failed: totalStudents - passedStudents,
            avgPercentage: Math.round(avgPercentage * 100) / 100,
        };
    }, [studentResults]);

    if (examsLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loaderText}>Loading exams...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Examination Results</Text>
                    <Text style={styles.headerSubtitle}>
                        {exams.length} Exam{exams.length !== 1 ? 's' : ''}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
            >
                {/* Exam Selector */}
                {exams.length === 0 ? (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                        <View style={styles.emptyState}>
                            <AlertCircle size={48} color="#ccc" />
                            <Text style={styles.emptyText}>
                                No exams available for your classes
                            </Text>
                            <Text style={styles.emptySubtext}>
                                Exams will appear here once they are published
                            </Text>
                        </View>
                    </Animated.View>
                ) : (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)} style={{ zIndex: 10 }}>
                        <View style={styles.pickerContainer}>
                            <Text style={styles.pickerLabel}>Select Exam</Text>
                            <HapticTouchable onPress={() => setShowExamPicker(true)}>
                                <View style={styles.customPicker}>
                                    <Text style={[styles.customPickerText, !selectedExam && { color: '#999' }]}>
                                        {selectedExam ? selectedExam.title : '-- Select an Exam --'}
                                    </Text>
                                    <ChevronDown size={20} color="#666" />
                                </View>
                            </HapticTouchable>
                        </View>
                    </Animated.View>
                )}

                {/* Exam Picker Modal */}
                <Modal
                    visible={showExamPicker}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowExamPicker(false)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setShowExamPicker(false)}
                    >
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Select Exam</Text>
                                <TouchableOpacity onPress={() => setShowExamPicker(false)}>
                                    <CloseIcon size={24} color="#666" />
                                </TouchableOpacity>
                            </View>
                            <FlatList
                                data={exams}
                                keyExtractor={item => item.id}
                                renderItem={({ item }) => (
                                    <TouchableOpacity
                                        style={[
                                            styles.modalItem,
                                            selectedExam?.id === item.id && styles.modalItemActive
                                        ]}
                                        onPress={() => {
                                            setSelectedExam(item);
                                            setShowExamPicker(false);
                                        }}
                                    >
                                        <Text style={[
                                            styles.modalItemText,
                                            selectedExam?.id === item.id && styles.modalItemTextActive
                                        ]}>
                                            {item.title}
                                        </Text>
                                        {selectedExam?.id === item.id && (
                                            <CheckCircle size={20} color="#0469ff" />
                                        )}
                                    </TouchableOpacity>
                                )}
                            />
                        </View>
                    </TouchableOpacity>
                </Modal>

                {selectedExam && (
                    <>
                        {/* Class Stats */}
                        {classStats && (
                            <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                                <View style={styles.summaryGrid}>
                                    <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
                                        <TrendingUp size={24} color="#fff" />
                                        <Text style={styles.summaryValue}>{classStats.avgPercentage}%</Text>
                                        <Text style={styles.summaryLabel}>Class Avg</Text>
                                    </LinearGradient>

                                    <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
                                        <CheckCircle size={24} color="#fff" />
                                        <Text style={styles.summaryValue}>{classStats.passed}</Text>
                                        <Text style={styles.summaryLabel}>Passed</Text>
                                    </LinearGradient>

                                    <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
                                        <XCircle size={24} color="#fff" />
                                        <Text style={styles.summaryValue}>{classStats.failed}</Text>
                                        <Text style={styles.summaryLabel}>Failed</Text>
                                    </LinearGradient>
                                </View>
                            </Animated.View>
                        )}

                        {/* Search Bar */}
                        <Animated.View entering={FadeInDown.delay(400).duration(400)}>
                            <View style={styles.searchContainer}>
                                <Search size={18} color="#9CA3AF" />
                                <TextInput
                                    style={styles.searchInput}
                                    placeholder="Search by name or roll number..."
                                    placeholderTextColor="#9CA3AF"
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                {searchQuery.length > 0 && (
                                    <HapticTouchable onPress={() => setSearchQuery('')}>
                                        <CloseIcon size={18} color="#9CA3AF" />
                                    </HapticTouchable>
                                )}
                            </View>
                        </Animated.View>

                        {/* Results List */}
                        {resultsLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#0469ff" />
                            </View>
                        ) : filteredStudents.length === 0 ? (
                            <View style={styles.emptyState}>
                                <AlertCircle size={48} color="#ccc" />
                                <Text style={styles.emptyText}>
                                    {searchQuery ? 'No results found' : 'No results available'}
                                </Text>
                            </View>
                        ) : (
                            filteredStudents.map((student, idx) => (
                                <Animated.View key={student.id} entering={FadeInRight.delay(500 + idx * 50)}>
                                    <View style={styles.studentCard}>
                                        <View style={styles.studentHeader}>
                                            <View style={styles.studentInfo}>
                                                <Text style={styles.studentName}>{student.name}</Text>
                                                <Text style={styles.studentMeta}>
                                                    Roll No: {student.rollNumber || 'N/A'}
                                                </Text>
                                            </View>
                                            <View style={[
                                                styles.statusBadge,
                                                { backgroundColor: student.passed ? '#D1FAE5' : '#FEE2E2' }
                                            ]}>
                                                <Text style={[
                                                    styles.statusText,
                                                    { color: student.passed ? '#059669' : '#DC26 26' }
                                                ]}>
                                                    {student.absent ? 'Absent' : student.passed ? 'Pass' : 'Fail'}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.scoreRow}>
                                            <Text style={styles.scoreLabel}>Total Score:</Text>
                                            <Text style={styles.scoreValue}>
                                                {student.totalObtained} / {student.totalMaxMarks}
                                            </Text>
                                            <Text style={[
                                                styles.percentage,
                                                { color: student.percentage >= 75 ? '#51CF66' : student.percentage >= 50 ? '#FFB020' : '#FF6B6B' }
                                            ]}>
                                                ({student.percentage}%)
                                            </Text>
                                        </View>

                                        {/* Subject-wise marks */}
                                        <View style={styles.subjectsContainer}>
                                            {student.subjects.map((subject, subIdx) => (
                                                <View key={subIdx} style={styles.subjectRow}>
                                                    <Text style={styles.subjectName}>{subject.name}</Text>
                                                    <Text style={[
                                                        styles.subjectMarks,
                                                        {
                                                            color: subject.isAbsent ? '#999' :
                                                                subject.marksObtained >= subject.passingMarks ? '#51CF66' : '#FF6B6B'
                                                        }
                                                    ]}>
                                                        {subject.isAbsent ? 'Absent' : `${subject.marksObtained}/${subject.maxMarks}`}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    </View>
                                </Animated.View>
                            ))
                        )}
                    </>
                )}

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
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loaderText: {
        fontSize: 16,
        color: '#666',
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
    pickerContainer: {
        marginBottom: 24,
        paddingHorizontal: 4,
    },
    pickerLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
        marginBottom: 8,
        marginLeft: 4,
    },
    customPicker: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 12,
    },
    customPickerText: {
        fontSize: 16,
        color: '#111',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '70%',
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    modalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    modalItemActive: {
        backgroundColor: '#F0F9FF',
    },
    modalItemText: {
        fontSize: 16,
        color: '#333',
    },
    modalItemTextActive: {
        color: '#0469ff',
        fontWeight: '600',
    },
    summaryGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    summaryCard: {
        flex: 1,
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
        gap: 8,
    },
    summaryValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    summaryLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '600',
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        gap: 12,
        marginBottom: 16,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#111',
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    emptyState: {
        paddingVertical: 60,
        alignItems: 'center',
        gap: 12,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
    emptySubtext: {
        fontSize: 14,
        color: '#bbb',
        textAlign: 'center',
        marginTop: 8,
    },
    studentCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    studentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    studentInfo: {
        flex: 1,
    },
    studentName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
        marginBottom: 4,
    },
    studentMeta: {
        fontSize: 13,
        color: '#666',
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
    },
    scoreRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    scoreLabel: {
        fontSize: 14,
        color: '#666',
    },
    scoreValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    percentage: {
        fontSize: 14,
        fontWeight: '600',
    },
    subjectsContainer: {
        gap: 8,
    },
    subjectRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    subjectName: {
        fontSize: 14,
        color: '#666',
    },
    subjectMarks: {
        fontSize: 14,
        fontWeight: '600',
    },
});
