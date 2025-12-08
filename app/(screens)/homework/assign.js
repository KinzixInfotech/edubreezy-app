// app/(screens)/homework/assign.js
// Teacher Homework Screen with Tabs: Assign | My Homework
import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    TextInput,
    Alert,
    ActivityIndicator,
    Platform,
    Modal,
    FlatList,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    BookOpen,
    Calendar,
    ArrowLeft,
    Send,
    AlertCircle,
    CheckCircle2,
    FileText,
    Upload,
    X,
    Clock,
    Users,
    Eye,
    ChevronRight,
    Check,
    AlertTriangle,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { Image } from 'expo-image';


const TABS = ['Assign', 'My Homework'];

export default function AssignHomeworkScreen() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState(0);

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [selectedSubject, setSelectedSubject] = useState(null);

    // Submission marking modal state
    const [markingModal, setMarkingModal] = useState(false);
    const [selectedHomework, setSelectedHomework] = useState(null);
    const [submissionChanges, setSubmissionChanges] = useState({});

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
    const userId = userData?.id;

    // Fetch teacher data
    const { data: teacherData, isLoading: teacherLoading } = useQuery({
        queryKey: ['teacher-data', schoolId, userId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/teachers/${userId}`);
            const teachers = res.data?.teacher || res.data;
            return Array.isArray(teachers) ? teachers[0] : teachers;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 1000 * 60 * 5,
    });

    const classId = teacherData?.classId;
    const sectionId = teacherData?.sectionId;

    // Fetch subjects
    const { data: subjects = [] } = useQuery({
        queryKey: ['subjects', classId],
        queryFn: async () => {
            if (!classId) return [];
            const res = await api.get(`/schools/subjects?classId=${classId}`);
            return res.data || [];
        },
        enabled: !!classId,
    });

    // Fetch students count
    const { data: studentsData } = useQuery({
        queryKey: ['students-count', schoolId, classId, sectionId],
        queryFn: async () => {
            if (!classId) return { count: 0 };
            const params = new URLSearchParams({
                classId: classId.toString(),
                ...(sectionId && { sectionId: sectionId.toString() })
            });
            const res = await api.get(`/schools/${schoolId}/students?${params}`);
            return { count: res.data?.total || 0 };
        },
        enabled: !!schoolId && !!classId,
    });

    const studentsCount = studentsData?.count || 0;

    // Fetch teacher's assigned homework
    const { data: myHomework, isLoading: homeworkLoading, refetch: refetchHomework } = useQuery({
        queryKey: ['teacher-homework', schoolId, userId],
        queryFn: async () => {
            if (!schoolId || !userId) return { homework: [] };
            const res = await api.get(`/schools/homework?schoolId=${schoolId}&teacherId=${userId}`);
            return res.data;
        },
        enabled: !!schoolId && !!userId && activeTab === 1,
        staleTime: 1000 * 60 * 2,
    });

    // Fetch submissions for selected homework
    const { data: submissionsData, isLoading: submissionsLoading, refetch: refetchSubmissions } = useQuery({
        queryKey: ['homework-submissions', selectedHomework?.id],
        queryFn: async () => {
            if (!selectedHomework?.id) return null;
            const res = await api.get(`/schools/homework/${selectedHomework.id}/submissions`);
            return res.data;
        },
        enabled: !!selectedHomework?.id && markingModal,
        staleTime: 0,
    });

    // Assign homework mutation
    const assignMutation = useMutation({
        mutationFn: async (data) => {
            const res = await api.post(`/schools/homework`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['homework']);
            queryClient.invalidateQueries(['teacher-homework']);
            Alert.alert(
                'Success! 🎉',
                `Homework assigned to ${studentsCount} student(s)`,
                [
                    { text: 'View Homework', onPress: () => setActiveTab(1) },
                    { text: 'Assign Another', onPress: resetForm }
                ]
            );
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.message || 'Failed to assign homework');
        }
    });

    // Update submissions mutation
    const updateSubmissionsMutation = useMutation({
        mutationFn: async (data) => {
            const res = await api.patch(`/schools/homework/${selectedHomework.id}/submissions`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['homework-submissions']);
            queryClient.invalidateQueries(['teacher-homework']);
            Alert.alert('Success', 'Submissions updated');
            setMarkingModal(false);
            setSubmissionChanges({});
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.message || 'Failed to update submissions');
        }
    });

    const pickDocument = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/pdf',
                copyToCacheDirectory: true
            });
            if (result.canceled === false && result.assets?.[0]) {
                setSelectedFile(result.assets[0]);
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to pick document');
        }
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        setSelectedSubject(null);
        setSelectedFile(null);
    };

    const handleSubmit = () => {
        if (!title.trim()) {
            Alert.alert('Required', 'Please enter homework title');
            return;
        }
        if (!description.trim()) {
            Alert.alert('Required', 'Please enter homework description');
            return;
        }
        if (dueDate <= new Date()) {
            Alert.alert('Invalid Date', 'Due date must be in the future');
            return;
        }

        Alert.alert(
            'Confirm Assignment',
            `Assign homework to ${studentsCount} student(s)?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Assign',
                    onPress: async () => {
                        setUploading(true);
                        assignMutation.mutate({
                            schoolId,
                            classId,
                            sectionId: sectionId || null,
                            subjectId: selectedSubject || null,
                            teacherId: userId,
                            title: title.trim(),
                            description: description.trim(),
                            dueDate: dueDate.toISOString(),
                            fileUrl: null,
                            fileName: selectedFile?.name || null,
                            senderId: userId
                        });
                        setUploading(false);
                    }
                }
            ]
        );
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['teacher-data']);
        if (activeTab === 1) await refetchHomework();
        setRefreshing(false);
    }, [queryClient, activeTab]);

    const openMarkingModal = (hw) => {
        setSelectedHomework(hw);
        setSubmissionChanges({});
        setMarkingModal(true);
    };

    const toggleSubmissionStatus = (submissionId, currentStatus) => {
        const newStatus = currentStatus === 'SUBMITTED' ? 'PENDING' : 'SUBMITTED';
        setSubmissionChanges(prev => ({ ...prev, [submissionId]: newStatus }));
    };

    const handleSaveSubmissions = () => {
        if (Object.keys(submissionChanges).length === 0) {
            Alert.alert('No Changes', 'No submissions were modified');
            return;
        }

        const updates = Object.entries(submissionChanges).map(([submissionId, status]) => ({
            submissionId,
            status
        }));

        updateSubmissionsMutation.mutate({ submissions: updates });
    };

    const getDaysLeft = (dueDate) => {
        const days = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
        if (days < 0) return { text: `${Math.abs(days)}d overdue`, color: '#EF4444' };
        if (days === 0) return { text: 'Due today', color: '#F59E0B' };
        if (days === 1) return { text: 'Due tomorrow', color: '#F59E0B' };
        return { text: `${days}d left`, color: '#10B981' };
    };

    // Get current submission status considering changes
    const getSubmissionStatus = (submission) => {
        if (submissionChanges[submission.id] !== undefined) {
            return submissionChanges[submission.id];
        }
        return submission.status;
    };

    if (teacherLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={styles.loadingText}>Loading...</Text>
            </View>
        );
    }

    if (!teacherData || !classId) {
        return (
            <View style={styles.loaderContainer}>
                <AlertCircle size={64} color="#EF4444" />
                <Text style={styles.errorText}>No class assigned</Text>
                <Text style={styles.errorSubtext}>Please contact admin to assign you a class</Text>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButtonCenter}>
                        <Text style={styles.backButtonText}>Go Back</Text>
                    </View>
                </HapticTouchable>
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
                    <Text style={styles.headerTitle}>Homework</Text>
                    <Text style={styles.headerSubtitle}>
                        {teacherData.class?.className} {teacherData.section && `- ${teacherData.section.name}`}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            {/* Tabs */}
            <View style={styles.tabContainer}>
                {TABS.map((tab, index) => (
                    <HapticTouchable key={tab} onPress={() => setActiveTab(index)} style={{ flex: 1 }}>
                        <View style={[styles.tab, activeTab === index && styles.tabActive]}>
                            <Text style={[styles.tabText, activeTab === index && styles.tabTextActive]}>
                                {tab}
                            </Text>
                        </View>
                    </HapticTouchable>
                ))}
            </View>

            {activeTab === 0 ? (
                // ASSIGN TAB
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
                >
                    {/* Class Info */}
                    <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.classInfoCard}>
                        <View style={styles.infoRow}>
                            <Users size={20} color="#0469ff" />
                            <Text style={styles.infoText}>
                                {studentsCount} student{studentsCount !== 1 ? 's' : ''} will receive this
                            </Text>
                        </View>
                    </Animated.View>

                    {/* Form */}
                    <View style={styles.form}>
                        <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.formGroup}>
                            <Text style={styles.label}>Title *</Text>
                            <TextInput
                                value={title}
                                onChangeText={setTitle}
                                placeholder="e.g., Chapter 5 Exercises"
                                placeholderTextColor="#999"
                                style={styles.input}
                            />
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(350).duration(400)} style={styles.formGroup}>
                            <Text style={styles.label}>Description *</Text>
                            <TextInput
                                value={description}
                                onChangeText={setDescription}
                                placeholder="Provide detailed instructions..."
                                placeholderTextColor="#999"
                                style={[styles.input, styles.textArea]}
                                multiline
                                numberOfLines={4}
                                textAlignVertical="top"
                            />
                        </Animated.View>

                        {subjects.length > 0 && (
                            <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.formGroup}>
                                <Text style={styles.label}>Subject (Optional)</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    <View style={styles.subjectChips}>
                                        {subjects.map((subject) => (
                                            <HapticTouchable
                                                key={subject.id}
                                                onPress={() => setSelectedSubject(
                                                    selectedSubject === subject.id ? null : subject.id
                                                )}
                                            >
                                                <View style={[
                                                    styles.subjectChip,
                                                    selectedSubject === subject.id && styles.subjectChipActive
                                                ]}>
                                                    <Text style={[
                                                        styles.subjectChipText,
                                                        selectedSubject === subject.id && styles.subjectChipTextActive
                                                    ]}>
                                                        {subject.subjectName}
                                                    </Text>
                                                </View>
                                            </HapticTouchable>
                                        ))}
                                    </View>
                                </ScrollView>
                            </Animated.View>
                        )}

                        <Animated.View entering={FadeInDown.delay(450).duration(400)} style={styles.formGroup}>
                            <Text style={styles.label}>Due Date *</Text>
                            <HapticTouchable onPress={() => setShowDatePicker(true)}>
                                <View style={styles.dateButton}>
                                    <Calendar size={20} color="#0469ff" />
                                    <Text style={styles.dateButtonText}>
                                        {dueDate.toLocaleDateString('en-US', {
                                            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                                        })}
                                    </Text>
                                    <Clock size={16} color="#666" />
                                </View>
                            </HapticTouchable>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.formGroup}>
                            <Text style={styles.label}>Attachment (Optional)</Text>
                            {selectedFile ? (
                                <View style={styles.filePreview}>
                                    <View style={styles.filePreviewLeft}>
                                        <FileText size={24} color="#0469ff" />
                                        <View style={styles.fileInfo}>
                                            <Text style={styles.fileName} numberOfLines={1}>{selectedFile.name}</Text>
                                            <Text style={styles.fileSize}>{(selectedFile.size / 1024).toFixed(1)} KB</Text>
                                        </View>
                                    </View>
                                    <HapticTouchable onPress={() => setSelectedFile(null)}>
                                        <View style={styles.removeButton}>
                                            <X size={20} color="#EF4444" />
                                        </View>
                                    </HapticTouchable>
                                </View>
                            ) : (
                                <HapticTouchable onPress={pickDocument}>
                                    <View style={styles.uploadButton}>
                                        <Upload size={24} color="#0469ff" />
                                        <Text style={styles.uploadButtonText}>Upload PDF</Text>
                                    </View>
                                </HapticTouchable>
                            )}
                        </Animated.View>
                    </View>

                    <View style={{ height: 120 }} />
                </ScrollView>
            ) : (
                // MY HOMEWORK TAB
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
                >
                    {homeworkLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : myHomework?.homework?.length > 0 ? (
                        myHomework.homework.map((hw, index) => {
                            const dueInfo = getDaysLeft(hw.dueDate);
                            return (
                                <Animated.View key={hw.id} entering={FadeInRight.delay(index * 80).duration(400)}>
                                    <HapticTouchable onPress={() => openMarkingModal(hw)}>
                                        <View style={styles.homeworkCard}>
                                            <View style={styles.hwHeader}>
                                                <View style={styles.hwIconContainer}>
                                                    <BookOpen size={20} color="#0469ff" />
                                                </View>
                                                <View style={[styles.dueBadge, { backgroundColor: dueInfo.color + '20' }]}>
                                                    <Clock size={12} color={dueInfo.color} />
                                                    <Text style={[styles.dueText, { color: dueInfo.color }]}>{dueInfo.text}</Text>
                                                </View>
                                            </View>
                                            <Text style={styles.hwTitle}>{hw.title}</Text>
                                            {hw.subject && (
                                                <View style={styles.subjectBadge}>
                                                    <Text style={styles.subjectBadgeText}>{hw.subject.subjectName}</Text>
                                                </View>
                                            )}
                                            <Text style={styles.hwDescription} numberOfLines={2}>{hw.description}</Text>
                                            <View style={styles.hwFooter}>
                                                <View style={styles.statsBadge}>
                                                    <Users size={14} color="#666" />
                                                    <Text style={styles.statsText}>
                                                        {hw.stats?.submitted || 0}/{hw.stats?.total || 0} submitted
                                                    </Text>
                                                </View>
                                                <View style={styles.viewButton}>
                                                    <Text style={styles.viewButtonText}>Mark Submissions</Text>
                                                    <ChevronRight size={16} color="#0469ff" />
                                                </View>
                                            </View>
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <View style={styles.emptyState}>
                            <BookOpen size={64} color="#ccc" />
                            <Text style={styles.emptyTitle}>No Homework Assigned</Text>
                            <Text style={styles.emptySubtitle}>Tap "Assign" tab to create homework</Text>
                        </View>
                    )}
                    <View style={{ height: 40 }} />
                </ScrollView>
            )}

            {/* Date Picker */}
            {showDatePicker && (
                <DateTimePicker
                    value={dueDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                        setShowDatePicker(Platform.OS === 'ios');
                        if (selectedDate) setDueDate(selectedDate);
                    }}
                    minimumDate={new Date()}
                />
            )}

            {/* Submit Button (Assign Tab Only) */}
            {activeTab === 0 && (
                <Animated.View entering={FadeInDown.delay(600).duration(400)} style={styles.floatingButton}>
                    <HapticTouchable onPress={handleSubmit} disabled={uploading || assignMutation.isPending}>
                        <View style={[styles.submitButton, (uploading || assignMutation.isPending) && styles.submitButtonDisabled]}>
                            {uploading || assignMutation.isPending ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <>
                                    <Send size={24} color="#fff" />
                                    <Text style={styles.submitButtonText}>Assign Homework</Text>
                                </>
                            )}
                        </View>
                    </HapticTouchable>
                </Animated.View>
            )}

            {/* Submission Marking Modal */}
            <Modal
                visible={markingModal}
                animationType="slide"
                onRequestClose={() => setMarkingModal(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <HapticTouchable onPress={() => setMarkingModal(false)}>
                            <View style={styles.modalCloseButton}>
                                <X size={24} color="#111" />
                            </View>
                        </HapticTouchable>
                        <View style={styles.modalHeaderCenter}>
                            <Text style={styles.modalTitle}>Mark Submissions</Text>
                            <Text style={styles.modalSubtitle}>{selectedHomework?.title}</Text>
                        </View>
                        <HapticTouchable onPress={handleSaveSubmissions} disabled={updateSubmissionsMutation.isPending}>
                            <View style={styles.saveButton}>
                                {updateSubmissionsMutation.isPending ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.saveButtonText}>Save</Text>
                                )}
                            </View>
                        </HapticTouchable>
                    </View>

                    {/* Stats Bar */}
                    {submissionsData?.stats && (
                        <View style={styles.statsBar}>
                            <View style={[styles.statItem, { backgroundColor: '#D1FAE5' }]}>
                                <Text style={[styles.statNumber, { color: '#10B981' }]}>{submissionsData.stats.submitted}</Text>
                                <Text style={styles.statLabel}>Submitted</Text>
                            </View>
                            <View style={[styles.statItem, { backgroundColor: '#FEF3C7' }]}>
                                <Text style={[styles.statNumber, { color: '#F59E0B' }]}>{submissionsData.stats.pending}</Text>
                                <Text style={styles.statLabel}>Pending</Text>
                            </View>
                            <View style={[styles.statItem, { backgroundColor: '#E3F2FD' }]}>
                                <Text style={[styles.statNumber, { color: '#0469ff' }]}>{submissionsData.stats.total}</Text>
                                <Text style={styles.statLabel}>Total</Text>
                            </View>
                        </View>
                    )}

                    {submissionsLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    ) : (
                        <FlatList
                            data={submissionsData?.submissions || []}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ padding: 16 }}
                            renderItem={({ item, index }) => {
                                const status = getSubmissionStatus(item);
                                const isSubmitted = status === 'SUBMITTED' || status === 'EVALUATED';
                                const hasChanged = submissionChanges[item.id] !== undefined;

                                return (
                                    <Animated.View entering={FadeInRight.delay(index * 30).duration(300)}>
                                        <HapticTouchable onPress={() => toggleSubmissionStatus(item.id, status)}>
                                            <View style={[
                                                styles.studentRow,
                                                isSubmitted && styles.studentRowSubmitted,
                                                hasChanged && styles.studentRowChanged
                                            ]}>
                                                <View style={styles.studentInfo}>
                                                    <View style={styles.rollBadge}>
                                                        <Text style={styles.rollNumber}>{item.rollNumber || '-'}</Text>
                                                    </View>
                                                    {item.profilePicture ? (
                                                        <Image source={{ uri: item.profilePicture }} style={styles.avatar} />
                                                    ) : (
                                                        <View style={[styles.avatar, styles.avatarPlaceholder]}>
                                                            <Text style={styles.avatarText}>
                                                                {item.studentName?.charAt(0) || '?'}
                                                            </Text>
                                                        </View>
                                                    )}
                                                    <Text style={styles.studentName} numberOfLines={1}>{item.studentName}</Text>
                                                </View>
                                                <View style={[
                                                    styles.statusToggle,
                                                    isSubmitted ? styles.statusSubmitted : styles.statusPending
                                                ]}>
                                                    {isSubmitted ? (
                                                        <Check size={18} color="#fff" />
                                                    ) : (
                                                        <X size={18} color="#EF4444" />
                                                    )}
                                                </View>
                                            </View>
                                        </HapticTouchable>
                                    </Animated.View>
                                );
                            }}
                            ListEmptyComponent={
                                <View style={styles.emptyState}>
                                    <Users size={48} color="#ccc" />
                                    <Text style={styles.emptyTitle}>No Students</Text>
                                </View>
                            }
                        />
                    )}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 32 },
    loadingText: { fontSize: 16, fontWeight: '600', color: '#666', marginTop: 8 },
    loadingContainer: { padding: 60, alignItems: 'center' },
    errorText: { fontSize: 20, fontWeight: '700', color: '#EF4444', marginTop: 16, textAlign: 'center' },
    errorSubtext: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8 },
    backButtonCenter: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#f5f5f5', borderRadius: 12 },
    backButtonText: { color: '#111', fontSize: 16, fontWeight: '600' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },

    // Tabs
    tabContainer: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10, backgroundColor: '#f5f5f5' },
    tabActive: { backgroundColor: '#0469ff' },
    tabText: { fontSize: 15, fontWeight: '600', color: '#666' },
    tabTextActive: { color: '#fff' },

    content: { flex: 1 },
    classInfoCard: { margin: 16, padding: 16, backgroundColor: '#E3F2FD', borderRadius: 12 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    infoText: { fontSize: 14, color: '#0469ff', fontWeight: '600', flex: 1 },
    form: { paddingHorizontal: 16, gap: 20 },
    formGroup: { gap: 8 },
    label: { fontSize: 15, fontWeight: '600', color: '#111' },
    input: { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 16, fontSize: 15, color: '#111', borderWidth: 1, borderColor: '#e5e7eb' },
    textArea: { height: 120, textAlignVertical: 'top' },
    subjectChips: { flexDirection: 'row', gap: 8, marginTop: 8 },
    subjectChip: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#f8f9fa', borderRadius: 20, borderWidth: 1, borderColor: '#e5e7eb' },
    subjectChipActive: { backgroundColor: '#E3F2FD', borderColor: '#0469ff' },
    subjectChipText: { fontSize: 14, fontWeight: '600', color: '#666' },
    subjectChipTextActive: { color: '#0469ff' },
    dateButton: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
    dateButtonText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111' },
    uploadButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, backgroundColor: '#E3F2FD', borderRadius: 12, borderWidth: 2, borderColor: '#0469ff', borderStyle: 'dashed' },
    uploadButtonText: { fontSize: 15, fontWeight: '600', color: '#0469ff' },
    filePreview: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' },
    filePreviewLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    fileInfo: { flex: 1 },
    fileName: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 2 },
    fileSize: { fontSize: 13, color: '#666' },
    removeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' },
    floatingButton: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },
    submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 18, backgroundColor: '#0469ff', borderRadius: 16, marginBottom: 20 },
    submitButtonDisabled: { opacity: 0.6 },
    submitButtonText: { fontSize: 18, fontWeight: '700', color: '#fff' },

    // Homework Card
    homeworkCard: { padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, marginHorizontal: 16, marginBottom: 12 },
    hwHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    hwIconContainer: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },
    dueBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
    dueText: { fontSize: 12, fontWeight: '600' },
    hwTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 8 },
    subjectBadge: { alignSelf: 'flex-start', backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
    subjectBadgeText: { fontSize: 12, color: '#0469ff', fontWeight: '600' },
    hwDescription: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 12 },
    hwFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    statsBadge: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statsText: { fontSize: 13, color: '#666', fontWeight: '500' },
    viewButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    viewButtonText: { fontSize: 14, color: '#0469ff', fontWeight: '600' },

    // Empty State
    emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12 },
    emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111' },
    emptySubtitle: { fontSize: 14, color: '#666' },

    // Modal
    modalContainer: { flex: 1, backgroundColor: '#fff', paddingTop: 50 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    modalCloseButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    modalHeaderCenter: { flex: 1, alignItems: 'center' },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    modalSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
    saveButton: { backgroundColor: '#0469ff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
    saveButtonText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    // Stats Bar
    statsBar: { flexDirection: 'row', padding: 16, gap: 12 },
    statItem: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 12 },
    statNumber: { fontSize: 24, fontWeight: '700' },
    statLabel: { fontSize: 12, color: '#666', marginTop: 2 },

    // Student Row
    studentRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: '#f8f9fa', borderRadius: 12, marginBottom: 8 },
    studentRowSubmitted: { backgroundColor: '#D1FAE5' },
    studentRowChanged: { borderWidth: 2, borderColor: '#0469ff' },
    studentInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    rollBadge: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' },
    rollNumber: { fontSize: 12, fontWeight: '700', color: '#0469ff' },
    avatar: { width: 36, height: 36, borderRadius: 18 },
    avatarPlaceholder: { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 14, fontWeight: '600', color: '#666' },
    studentName: { fontSize: 15, fontWeight: '600', color: '#111', flex: 1 },
    statusToggle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    statusSubmitted: { backgroundColor: '#10B981' },
    statusPending: { backgroundColor: '#FEE2E2' },
});