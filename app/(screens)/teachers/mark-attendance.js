// Fixed Teacher Bulk Attendance Marking
import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Image,
  TextInput
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
  Users,
  CheckCircle,
  XCircle,
  Clock,
  Save,
  Search,
  AlertCircle,
  Calendar,
  ArrowLeft
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

const getISTDateString = (dateInput = new Date()) => {
  const date = new Date(dateInput);
  const offset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
  const istDate = new Date(date.getTime() + offset);
  return istDate.toISOString().split('T')[0]; // "2025-11-12"
};

export default function BulkAttendanceMarking() {
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(getISTDateString());
  const [search, setSearch] = useState('');
  const [attendance, setAttendance] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Load user data with TanStack Query
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

  // Fetch teacher data with proper caching
  const {
    data: teacherData,
    isLoading: teacherLoading,
    refetch: refetchTeacher,
    error: teacherError,
    isError: isTeacherError,
    isFetching: isTeacherFetching
  } = useQuery({
    queryKey: ['teacher-profile', schoolId, userId],
    queryFn: async () => {
      // ✅ FIXED: Use actual userId
      const res = await api.get(`/schools/${schoolId}/teachers/${userId}`);

      // API returns array of sections assigned to this teacher
      // Structure: { teacher: [{ class: {...}, teachingStaff: {...} }, ...] }
      const sections = res.data?.teacher;

      if (!sections || !Array.isArray(sections) || sections.length === 0) {
        // No sections assigned
        return { hasSection: false };
      }

      // Get first assigned section for attendance marking
      const firstSection = sections[0];

      return {
        hasSection: true,
        // Extract IDs from the section data
        classId: firstSection.classId,
        sectionId: firstSection.id, // section's own ID
        // Include full data for display
        class: firstSection.class,
        section: { id: firstSection.id, name: firstSection.name },
        teachingStaff: firstSection.teachingStaff,
        // Keep all sections if needed
        allSections: sections
      };
    },
    enabled: !!schoolId && !!userId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // Extract classId and sectionId from teacher data
  const classId = teacherData?.classId;
  const sectionId = teacherData?.sectionId;

  // Fetch students for bulk marking
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['bulk-attendance-students', schoolId, classId, sectionId, selectedDate],
    queryFn: async () => {
      if (!classId) return { students: [], existingBulk: null };

      try {
        const params = new URLSearchParams({
          classId: classId.toString(),
          date: selectedDate,
          ...(sectionId && { sectionId: sectionId.toString() })
        });
        const res = await api.get(`/schools/${schoolId}/attendance/bulk?${params}`);
        return res.data || { students: [], existingBulk: null };
      } catch (error) {
        console.error('Students fetch error:', error);
        return { students: [], existingBulk: null };
      }
    },
    enabled: !!schoolId && !!classId,
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 2,
  });

  const students = studentsData?.students || [];
  const existingBulk = studentsData?.existingBulk;

  // Initialize attendance from existing data
  useEffect(() => {
    if (students.length > 0) {
      const initialAttendance = {};
      students.forEach(student => {
        if (student.attendance) {
          initialAttendance[student.userId] = student.attendance.status;
        }
      });
      setAttendance(initialAttendance);
      setHasChanges(false);
    }
  }, [students]);

  // Submit bulk attendance - UPDATED WITH ERROR HANDLING
  const submitMutation = useMutation({
    mutationFn: async (data) => {
      const res = await api.post(`/schools/${schoolId}/attendance/bulk`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['bulk-attendance-students']);
      setHasChanges(false);
      Alert.alert('Success! 🎉', 'Attendance marked successfully!');
    },
    onError: (error) => {
      // ✅ ENHANCED ERROR HANDLING
      const errorData = error.response?.data;

      if (errorData) {
        const title = errorData.error || 'Cannot Mark Attendance';
        const message = errorData.message || errorData.alert || 'Failed to mark attendance';

        Alert.alert(
          title,
          message,
          [
            {
              text: 'OK',
              style: 'default'
            }
          ],
          { cancelable: true }
        );
      } else {
        Alert.alert(
          'Error',
          'Failed to mark attendance. Please try again.',
          [{ text: 'OK' }]
        );
      }
    }
  });

  const handleMarkAttendance = (studentUserId, status) => {
    setAttendance(prev => ({
      ...prev,
      [studentUserId]: status
    }));
    setHasChanges(true);
  };

  const handleSelectAll = (status) => {
    Alert.alert(
      'Mark All Students',
      `Mark all ${filteredStudents.length} students as ${status}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            const newAttendance = {};
            filteredStudents.forEach(student => {
              newAttendance[student.userId] = status;
            });
            setAttendance(newAttendance);
            setHasChanges(true);
          }
        }
      ]
    );
  };

  const handleSubmit = () => {
    const attendanceData = Object.entries(attendance).map(([studentUserId, status]) => ({
      userId: studentUserId,
      status,
      checkInTime: status !== 'ABSENT' ? new Date().toISOString() : null
    }));

    if (attendanceData.length === 0) {
      Alert.alert('Error', 'Please mark attendance for at least one student');
      return;
    }

    const unmarkedCount = filteredStudents.length - attendanceData.length;
    const message = unmarkedCount > 0
      ? `${unmarkedCount} student(s) not marked. Submit anyway?`
      : `Submit attendance for ${attendanceData.length} student(s)?`;

    Alert.alert('Confirm Submission', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Submit',
        onPress: () => {
          submitMutation.mutate({
            classId: classId,
            sectionId: sectionId || null,
            date: selectedDate,
            attendance: attendanceData,
            markedBy: userId,
          });
        }
      }
    ]);
  };

  const filteredStudents = students.filter(student =>
    student.name.toLowerCase().includes(search.toLowerCase()) ||
    student.admissionNo.toLowerCase().includes(search.toLowerCase()) ||
    student.rollNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: filteredStudents.length,
    marked: Object.keys(attendance).length,
    present: Object.values(attendance).filter(s => s === 'PRESENT').length,
    absent: Object.values(attendance).filter(s => s === 'ABSENT').length,
    late: Object.values(attendance).filter(s => s === 'LATE').length,
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['teacher-profile'] }),
      queryClient.invalidateQueries({ queryKey: ['bulk-attendance-students'] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  if (!schoolId || !userId) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#0469ff" />
      </View>
    );
  }

  if (teacherLoading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#0469ff" />
        <Text style={styles.loadingText}>Loading teacher data...</Text>
      </View>
    );
  }

  if (isTeacherError || (!teacherData && !teacherLoading) || (!classId && teacherData)) {
    const isNetworkError = teacherError?.message?.includes('Network') || teacherError?.code === 'NETWORK_ERROR';
    const isNotFound = teacherError?.response?.status === 404;

    return (
      <View style={styles.errorContainer}>
        {/* Illustration */}
        <View style={styles.errorIllustration}>
          <View style={styles.errorIconBg}>
            <AlertCircle size={48} color="#EF4444" />
          </View>
        </View>

        {/* Error Message */}
        <Text style={styles.errorTitle}>
          {isNetworkError ? 'Connection Error' : isNotFound ? 'Profile Not Found' : !classId ? 'No Class Assigned' : 'Something Went Wrong'}
        </Text>
        <Text style={styles.errorDescription}>
          {isNetworkError
            ? 'Please check your internet connection and try again'
            : isNotFound
              ? 'Your teacher profile was not found. Please contact your administrator.'
              : !classId && teacherData
                ? 'You have not been assigned a class yet. Please contact your school administrator to assign you a class for attendance marking.'
                : teacherError?.message || 'An unexpected error occurred. Please try again.'}
        </Text>

        {/* Debug Info (only in dev) */}
        {__DEV__ && teacherError && (
          <View style={styles.debugInfo}>
            <Text style={styles.debugText}>Debug: {teacherError.message}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.errorActions}>
          <HapticTouchable onPress={() => refetchTeacher()} disabled={isTeacherFetching}>
            <View style={[styles.primaryButton, isTeacherFetching && styles.buttonDisabled]}>
              {isTeacherFetching ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Try Again</Text>
              )}
            </View>
          </HapticTouchable>

          <HapticTouchable onPress={() => router.back()}>
            <View style={styles.secondaryButton}>
              <ArrowLeft size={18} color="#666" />
              <Text style={styles.secondaryButtonText}>Go Back</Text>
            </View>
          </HapticTouchable>
        </View>

        {/* Help Text */}
        <Text style={styles.helpText}>
          Need help? Contact your school administrator
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style='dark' />
      {/* Header */}
      <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
        <HapticTouchable onPress={() => {
          if (hasChanges && stats.marked > 0) {
            Alert.alert(
              'Unsaved Changes',
              `You have marked ${stats.marked} student(s). Exit without saving?`,
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Exit', style: 'destructive', onPress: () => router.back() }
              ]
            );
          } else {
            router.back();
          }
        }}>
          <View style={styles.backButton}>
            <ArrowLeft size={24} color="#111" />
          </View>
        </HapticTouchable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Mark Attendance</Text>
          <Text style={styles.headerSubtitle}>
            {teacherData.class?.className} {teacherData.section ? `- Section ${teacherData.section.name}` : ''}
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
        {/* Date & Info Card */}
        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.classInfoCard}>
          <View style={styles.dateContainer}>
            <Calendar size={20} color="#0469ff" />
            <Text style={styles.dateText}>
              {new Date(selectedDate + 'T00:00:00+05:30').toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                year: 'numeric'
              })}
            </Text>
          </View>

          {existingBulk && (
            <View style={styles.existingBulkAlert}>
              <AlertCircle size={20} color="#0469ff" />
              <View style={styles.existingBulkContent}>
                <Text style={styles.existingBulkTitle}>Already marked</Text>
                <Text style={styles.existingBulkText}>
                  By {existingBulk.marker.name} on {new Date(existingBulk.markedAt).toLocaleString()}
                </Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* Stats */}
        {students.length > 0 && (
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{stats.total}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#0469ff' }]}>{stats.marked}</Text>
              <Text style={styles.statLabel}>Marked</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.present}</Text>
              <Text style={styles.statLabel}>Present</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#EF4444' }]}>{stats.absent}</Text>
              <Text style={styles.statLabel}>Absent</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statValue, { color: '#F59E0B' }]}>{stats.late}</Text>
              <Text style={styles.statLabel}>Late</Text>
            </View>
          </Animated.View>
        )}

        {/* Students List */}
        {students.length > 0 && (
          <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.studentsCard}>
            <View style={styles.studentsHeader}>
              <Text style={styles.studentsTitle}>Students ({filteredStudents.length})</Text>
              <View style={styles.bulkActions}>
                <HapticTouchable onPress={() => handleSelectAll('PRESENT')}>
                  <View style={styles.bulkButton}>
                    <CheckCircle size={16} color="#10B981" />
                    <Text style={[styles.bulkButtonText, { color: '#10B981' }]}>All P</Text>
                  </View>
                </HapticTouchable>
                <HapticTouchable onPress={() => handleSelectAll('ABSENT')}>
                  <View style={styles.bulkButton}>
                    <XCircle size={16} color="#EF4444" />
                    <Text style={[styles.bulkButtonText, { color: '#EF4444' }]}>All A</Text>
                  </View>
                </HapticTouchable>
              </View>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <Search size={20} color="#666" />
              <TextInput
                placeholder="Search by name, admission no..."
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
                placeholderTextColor="#999"
              />
            </View>

            {/* Student List */}
            <View style={styles.studentsList}>
              {filteredStudents.map((student, index) => (
                <Animated.View
                  key={student.userId}
                  entering={FadeInRight.delay(500 + index * 30).duration(400)}
                  style={styles.studentItem}
                >
                  <View style={styles.studentInfo}>
                    <View style={styles.studentAvatar}>
                      {student.profilePicture ? (
                        <Image source={{ uri: student.profilePicture }} style={styles.avatarImage} />
                      ) : (
                        <Text style={styles.avatarText}>
                          {student.name.charAt(0).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.studentDetails}>
                      <Text style={styles.studentName}>{student.name}</Text>
                      <View style={styles.studentMeta}>
                        <Text style={styles.studentRoll}>#{student.rollNumber || index + 1}</Text>
                        <Text style={styles.studentAdmission}>{student.admissionNo}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionButtons}>
                    <HapticTouchable onPress={() => handleMarkAttendance(student.userId, 'PRESENT')}>
                      <View style={[
                        styles.actionButton,
                        attendance[student.userId] === 'PRESENT' && styles.actionButtonPresent
                      ]}>
                        <CheckCircle
                          size={20}
                          color={attendance[student.userId] === 'PRESENT' ? '#fff' : '#10B981'}
                        />
                      </View>
                    </HapticTouchable>

                    <HapticTouchable onPress={() => handleMarkAttendance(student.userId, 'ABSENT')}>
                      <View style={[
                        styles.actionButton,
                        attendance[student.userId] === 'ABSENT' && styles.actionButtonAbsent
                      ]}>
                        <XCircle
                          size={20}
                          color={attendance[student.userId] === 'ABSENT' ? '#fff' : '#EF4444'}
                        />
                      </View>
                    </HapticTouchable>

                    <HapticTouchable onPress={() => handleMarkAttendance(student.userId, 'LATE')}>
                      <View style={[
                        styles.actionButton,
                        attendance[student.userId] === 'LATE' && styles.actionButtonLate
                      ]}>
                        <Clock
                          size={20}
                          color={attendance[student.userId] === 'LATE' ? '#fff' : '#F59E0B'}
                        />
                      </View>
                    </HapticTouchable>
                  </View>
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        )}

        {students.length === 0 && !studentsLoading && (
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.emptyState}>
            <Users size={64} color="#ccc" />
            <Text style={styles.emptyTitle}>No Students Found</Text>
            <Text style={styles.emptyText}>There are no students in your assigned class</Text>
          </Animated.View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Floating Submit Button */}
      {stats.marked > 0 && (
        <Animated.View entering={FadeInDown.delay(600).duration(400)} style={[styles.floatingButton, { paddingBottom: insets.bottom + 5 }]}>
          <HapticTouchable onPress={handleSubmit} disabled={submitMutation.isPending}>
            <View style={[styles.submitButton, submitMutation.isPending && styles.submitButtonDisabled]}>
              {submitMutation.isPending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <View style={styles.submitButtonLeft}>
                    <Save size={24} color="#fff" />
                    <View>
                      <Text style={styles.submitButtonLabel}>
                        {stats.marked} of {stats.total} marked
                      </Text>
                      <Text style={styles.submitButtonText}>Report Attendance</Text>
                    </View>
                  </View>
                  {hasChanges && <View style={styles.unsavedDot} />}
                </>
              )}
            </View>
          </HapticTouchable>
        </Animated.View>
      )}

      {studentsLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0469ff" />
          <Text style={styles.loadingText}>Loading students...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16, paddingHorizontal: 32 },
  loadingText: { fontSize: 16, fontWeight: '600', color: '#666', marginTop: 8 },

  // Enhanced Error Screen Styles
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    backgroundColor: '#fff'
  },
  errorIllustration: { marginBottom: 24 },
  errorIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FECACA'
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    marginBottom: 12
  },
  errorDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
    paddingHorizontal: 16
  },
  debugInfo: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A'
  },
  debugText: { fontSize: 11, color: '#92400E', fontFamily: 'monospace' },
  errorActions: {
    marginTop: 24,
    gap: 12,
    width: '100%',
    maxWidth: 280
  },
  primaryButton: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    backgroundColor: '#0469ff',
    borderRadius: 14,
    alignItems: 'center'
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  buttonDisabled: { opacity: 0.6 },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#f5f5f5',
    borderRadius: 14
  },
  secondaryButtonText: { color: '#666', fontSize: 15, fontWeight: '600' },
  helpText: {
    marginTop: 32,
    fontSize: 13,
    color: '#999',
    textAlign: 'center'
  },

  // Legacy styles (keep for compatibility)
  errorText: { fontSize: 20, fontWeight: '700', color: '#EF4444', marginTop: 16, textAlign: 'center' },
  errorSubtext: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8 },
  retryButton: { marginTop: 20, paddingHorizontal: 32, paddingVertical: 14, backgroundColor: '#0469ff', borderRadius: 12 },
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  backButtonCenter: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: '#f5f5f5', borderRadius: 12 },
  backButtonText: { color: '#111', fontSize: 16, fontWeight: '600' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', backgroundColor: '#fff' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f5f5f5', alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111' },
  headerSubtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  content: { flex: 1 },
  classInfoCard: { margin: 16, padding: 16, backgroundColor: '#f8f9fa', borderRadius: 16, gap: 12 },
  dateContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateText: { fontSize: 15, fontWeight: '600', color: '#111', flex: 1 },
  existingBulkAlert: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 12, backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#BFDBFE' },
  existingBulkContent: { flex: 1 },
  existingBulkTitle: { fontSize: 14, fontWeight: '600', color: '#1E40AF', marginBottom: 2 },
  existingBulkText: { fontSize: 12, color: '#1E40AF' },
  statsGrid: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  statCard: { flex: 1, padding: 14, backgroundColor: '#f8f9fa', borderRadius: 12, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 4 },
  statLabel: { fontSize: 11, color: '#666', fontWeight: '500' },
  studentsCard: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f0f0f0', overflow: 'hidden' },
  studentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  studentsTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  bulkActions: { flexDirection: 'row', gap: 8 },
  bulkButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f8f9fa', borderRadius: 8 },
  bulkButtonText: { fontSize: 12, fontWeight: '600' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  searchInput: { flex: 1, fontSize: 15, color: '#111' },
  studentsList: { paddingVertical: 8 },
  studentItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  studentInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  studentAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#E0E7FF', justifyContent: 'center', alignItems: 'center' },
  avatarImage: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#4F46E5' },
  studentDetails: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: '600', color: '#111', marginBottom: 4 },
  studentMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  studentRoll: { fontSize: 11, fontWeight: '700', color: '#666', backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  studentAdmission: { fontSize: 12, color: '#666' },
  actionButtons: { flexDirection: 'row', gap: 8 },
  actionButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f8f9fa', justifyContent: 'center', alignItems: 'center' },
  actionButtonPresent: { backgroundColor: '#10B981' },
  actionButtonAbsent: { backgroundColor: '#EF4444' },
  actionButtonLate: { backgroundColor: '#F59E0B' },
  emptyState: { padding: 48, alignItems: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center' },
  floatingButton: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0' },  // Note: paddingBottom will be applied dynamically
  submitButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 18, backgroundColor: '#0469ff', borderRadius: 16 },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  submitButtonLabel: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  submitButtonText: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 2 },
  unsavedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#F59E0B' },
  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', gap: 12 },
});