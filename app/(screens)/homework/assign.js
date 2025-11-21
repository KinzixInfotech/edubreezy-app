// app/(screens)/homework/assign.js
import React, { useState, useCallback } from 'react';
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
    TouchableOpacity,
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
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';



export default function AssignHomeworkScreen() {
    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dueDate, setDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [uploading, setUploading] = useState(false);

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

    // Fetch subjects for class
    const { data: subjects = [] } = useQuery({
        queryKey: ['subjects', classId],
        queryFn: async () => {
            if (!classId) return [];
            const res = await api.get(`/schools/subjects?classId=${classId}`);
            return res.data || [];
        },
        enabled: !!classId,
    });

    const [selectedSubject, setSelectedSubject] = useState(null);

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

    console.log(studentsData);


    const studentsCount = studentsData?.count || 0;

    // Assign homework mutation
    const assignMutation = useMutation({
        mutationFn: async (data) => {
            const res = await api.post(`/schools/homework`, data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['homework']);
            Alert.alert(
                'Success! 🎉',
                `Homework assigned to ${studentsCount} student(s)`,
                [
                    {
                        text: 'View Homework',
                        onPress: () => router.replace('/homework')
                    },
                    {
                        text: 'Assign Another',
                        onPress: resetForm
                    }
                ]
            );
        },
        onError: (error) => {
            const errorMsg = error.response?.data?.message || 'Failed to assign homework';
            Alert.alert('Error', errorMsg);
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

    const removeFile = () => {
        setSelectedFile(null);
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        setSelectedSubject(null);
        setSelectedFile(null);
    };

    const handleSubmit = () => {
        // Validation
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
            `Assign homework to ${studentsCount} student(s) in ${teacherData?.class?.className}${teacherData?.section ? ` - ${teacherData.section.name}` : ''
            }?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Assign',
                    onPress: async () => {
                        setUploading(true);

                        let fileUrl = null;
                        let fileName = null;

                        // TODO: Upload file if selected
                        if (selectedFile) {
                            // Implement file upload here
                            fileName = selectedFile.name;
                        }

                        assignMutation.mutate({
                            schoolId,
                            classId,
                            sectionId: sectionId || null,
                            subjectId: selectedSubject || null,
                            teacherId: userId,
                            title: title.trim(),
                            description: description.trim(),
                            dueDate: dueDate.toISOString(),
                            fileUrl,
                            fileName,
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
        setRefreshing(false);
    }, [queryClient]);

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
                <Text style={styles.errorSubtext}>
                    Please contact admin to assign you a class
                </Text>
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
                    <Text style={styles.headerTitle}>Assign Homework</Text>
                    <Text style={styles.headerSubtitle}>
                        {teacherData.class?.className} {teacherData.section && `- ${teacherData.section.name}`}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                    />
                }
            >
                {/* Class Info Card */}
                <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.classInfoCard}>
                    <View style={styles.infoRow}>
                        <Users size={20} color="#0469ff" />
                        <Text style={styles.infoText}>
                            {studentsCount} student{studentsCount !== 1 ? 's' : ''} will receive this homework
                        </Text>
                    </View>
                </Animated.View>

                {/* Form */}
                <View style={styles.form}>
                    {/* Title */}
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

                    {/* Description */}
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

                    {/* Subject Selection */}
                    {subjects.length > 0 && (
                        <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.formGroup}>
                            <Text style={styles.label}>Subject (Optional)</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectScroll}>
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

                    {/* Due Date */}
                    <Animated.View entering={FadeInDown.delay(450).duration(400)} style={styles.formGroup}>
                        <Text style={styles.label}>Due Date *</Text>
                        <HapticTouchable onPress={() => setShowDatePicker(true)}>
                            <View style={styles.dateButton}>
                                <Calendar size={20} color="#0469ff" />
                                <Text style={styles.dateButtonText}>
                                    {dueDate.toLocaleDateString('en-US', {
                                        weekday: 'short',
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric'
                                    })}
                                </Text>
                                <Clock size={16} color="#666" />
                            </View>
                        </HapticTouchable>
                    </Animated.View>

                    {/* File Attachment */}
                    <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.formGroup}>
                        <Text style={styles.label}>Attachment (Optional)</Text>
                        {selectedFile ? (
                            <View style={styles.filePreview}>
                                <View style={styles.filePreviewLeft}>
                                    <FileText size={24} color="#0469ff" />
                                    <View style={styles.fileInfo}>
                                        <Text style={styles.fileName} numberOfLines={1}>
                                            {selectedFile.name}
                                        </Text>
                                        <Text style={styles.fileSize}>
                                            {(selectedFile.size / 1024).toFixed(1)} KB
                                        </Text>
                                    </View>
                                </View>
                                <HapticTouchable onPress={removeFile}>
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

            {/* Date Picker */}
            {showDatePicker && (
                <DateTimePicker
                    value={dueDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selectedDate) => {
                        setShowDatePicker(Platform.OS === 'ios');
                        if (selectedDate) {
                            setDueDate(selectedDate);
                        }
                    }}
                    minimumDate={new Date()}
                />
            )}

            {/* Submit Button */}
            <Animated.View entering={FadeInDown.delay(600).duration(400)} style={styles.floatingButton}>
                <HapticTouchable
                    onPress={handleSubmit}
                    disabled={uploading || assignMutation.isPending}
                >
                    <View style={[
                        styles.submitButton,
                        (uploading || assignMutation.isPending) && styles.submitButtonDisabled
                    ]}>
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 32 },
    loadingText: { fontSize: 16, fontWeight: '600', color: '#666', marginTop: 8 },
    errorText: { fontSize: 20, fontWeight: '700', color: '#EF4444', marginTop: 16, textAlign: 'center' },
    errorSubtext: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8 },
    backButtonCenter: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#f5f5f5', borderRadius: 12 },
    backButtonText: { color: '#111', fontSize: 16, fontWeight: '600' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
    backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
    headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
    content: { flex: 1 },
    classInfoCard: { margin: 16, padding: 16, backgroundColor: '#E3F2FD', borderRadius: 12 },
    infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    infoText: { fontSize: 14, color: '#0469ff', fontWeight: '600', flex: 1 },
    form: { paddingHorizontal: 16, gap: 20 },
    formGroup: { gap: 8 },
    label: { fontSize: 15, fontWeight: '600', color: '#111' },
    input: { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 16, fontSize: 15, color: '#111', borderWidth: 1, borderColor: '#e5e7eb' },
    textArea: { height: 120, textAlignVertical: 'top' },
    subjectScroll: { marginTop: 8 },
    subjectChips: { flexDirection: 'row', gap: 8 },
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
    submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 18, backgroundColor: '#0469ff', borderRadius: 16, marginBottom: 20, },
    submitButtonDisabled: { opacity: 0.6 },
    submitButtonText: { fontSize: 18, fontWeight: '700', color: '#fff' },
});