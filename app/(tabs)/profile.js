import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { router } from 'expo-router';
import { Settings, Edit, LogOut, Mail, Phone, Calendar, MapPin, Award, BookOpen, School, X, Users, ClipboardList, FileText, Bell, Shield } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../components/HapticTouch';
import { useCallback, useEffect, useState } from 'react';
import Animated, { FadeInDown, FadeInUp, FadeInRight } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ==================== ROLE-BASED CONFIGURATION ====================
const PROFILE_CONFIG = {
  STUDENT: {
    // Field mappings - customize these paths based on your API response structure
    fieldMappings: {
      name: 'name',
      email: 'email',
      phone: 'phone',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
      // Student-specific fields
      studentId: 'studentId',
      class: 'class.name',
      section: 'section',
      rollNumber: 'rollNumber',
      admissionDate: 'admissionDate',
    },
    // Stats to show
    stats: [
      {
        key: 'attendance',
        label: 'Attendance',
        value: '95%',
        color: '#10b981',
        icon: '📊',
        dataPath: 'stats.attendance' // Path in user object
      },
      {
        key: 'grade',
        label: 'Grade',
        value: 'A+',
        color: '#f59e0b',
        icon: '🎯',
        dataPath: 'stats.grade'
      },
      {
        key: 'assignments',
        label: 'Assignments',
        value: '24/26',
        color: '#8b5cf6',
        icon: '📝',
        dataPath: 'stats.assignments'
      },
    ],
    // Contact info fields
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'email' },
      { key: 'phone', label: 'Phone', icon: Phone, color: '#10b981', dataPath: 'phone' },
      { key: 'admissionDate', label: 'Admission Date', icon: Calendar, color: '#8b5cf6', dataPath: 'admissionDate' },
    ],
    // Additional info sections
    additionalInfo: [
      { key: 'studentId', label: 'Student ID', dataPath: 'studentId' },
      { key: 'class', label: 'Class', dataPath: 'class.name' },
      { key: 'section', label: 'Section', dataPath: 'section' },
      { key: 'rollNumber', label: 'Roll Number', dataPath: 'rollNumber' },
    ],
    // Menu items
    menuItems: [
      { id: 1, label: 'Academic Performance', icon: Award, route: '/performance', color: '#10b981' },
      { id: 2, label: 'Attendance Record', icon: Calendar, route: '/attendance', color: '#0469ff' },
      { id: 3, label: 'My Courses', icon: BookOpen, route: '/courses', color: '#f59e0b' },
      { id: 4, label: 'Assignments', icon: ClipboardList, route: '/assignments', color: '#8b5cf6' },
      { id: 5, label: 'Settings', icon: Settings, route: '/(tabs)/settings', color: '#06b6d4' },
      { id: 6, label: 'Edit Profile', icon: Edit, route: '/edit-profile', color: '#ec4899' },
    ],
  },

  TEACHER: {
    fieldMappings: {
      name: 'name',
      email: 'email',
      phone: 'phone',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
      // Teacher-specific fields
      teacherId: 'teacherId',
      department: 'department.name',
      subjects: 'subjects',
      joiningDate: 'joiningDate',
      qualification: 'qualification',
    },
    stats: [
      {
        key: 'classes',
        label: 'Classes',
        value: '6',
        color: '#0469ff',
        icon: '👥',
        dataPath: 'stats.totalClasses'
      },
      {
        key: 'students',
        label: 'Students',
        value: '180',
        color: '#10b981',
        icon: '🎓',
        dataPath: 'stats.totalStudents'
      },
      {
        key: 'attendance',
        label: 'Avg. Attendance',
        value: '92%',
        color: '#f59e0b',
        icon: '📊',
        dataPath: 'stats.avgAttendance'
      },
    ],
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'email' },
      { key: 'phone', label: 'Phone', icon: Phone, color: '#10b981', dataPath: 'phone' },
      { key: 'department', label: 'Department', icon: BookOpen, color: '#8b5cf6', dataPath: 'department.name' },
      { key: 'joiningDate', label: 'Joining Date', icon: Calendar, color: '#f59e0b', dataPath: 'joiningDate' },
    ],
    additionalInfo: [
      { key: 'teacherId', label: 'Teacher ID', dataPath: 'teacherId' },
      { key: 'qualification', label: 'Qualification', dataPath: 'qualification' },
      { key: 'subjects', label: 'Subjects', dataPath: 'subjects', isArray: true },
    ],
    menuItems: [
      { id: 1, label: 'My Classes', icon: Users, route: '/my-classes', color: '#0469ff' },
      { id: 2, label: 'Mark Attendance', icon: Calendar, route: '/teacher/mark-attendance', color: '#10b981' },
      { id: 3, label: 'Grade Submissions', icon: ClipboardList, route: '/grade-submissions', color: '#f59e0b' },
      { id: 4, label: 'My Schedule', icon: Calendar, route: '/schedule', color: '#8b5cf6' },
      { id: 5, label: 'Announcements', icon: Bell, route: '/announcements', color: '#ec4899' },
      { id: 6, label: 'Settings', icon: Settings, route: '/(tabs)/settings', color: '#06b6d4' },
      { id: 7, label: 'Edit Profile', icon: Edit, route: '/edit-profile', color: '#ef4444' },
    ],
  },

  PARENT: {
    fieldMappings: {
      name: 'name',
      email: 'email',
      phone: 'phone',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
      // Parent-specific fields
      parentId: 'parentId',
      children: 'children',
      occupation: 'occupation',
      address: 'address',
    },
    stats: [
      {
        key: 'children',
        label: 'Children',
        value: '2',
        color: '#ec4899',
        icon: '👶',
        dataPath: 'children.length'
      },
      {
        key: 'avgAttendance',
        label: 'Avg. Attendance',
        value: '94%',
        color: '#10b981',
        icon: '📊',
        dataPath: 'stats.avgAttendance'
      },
      {
        key: 'notifications',
        label: 'Notifications',
        value: '5',
        color: '#f59e0b',
        icon: '🔔',
        dataPath: 'stats.unreadNotifications'
      },
    ],
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'email' },
      { key: 'phone', label: 'Phone', icon: Phone, color: '#10b981', dataPath: 'phone' },
      { key: 'address', label: 'Address', icon: MapPin, color: '#8b5cf6', dataPath: 'address' },
    ],
    additionalInfo: [
      { key: 'parentId', label: 'Parent ID', dataPath: 'parentId' },
      { key: 'occupation', label: 'Occupation', dataPath: 'occupation' },
      { key: 'children', label: 'Children', dataPath: 'children', isArray: true, displayKey: 'name' },
    ],
    menuItems: [
      { id: 1, label: "Children's Performance", icon: Award, route: '/children-performance', color: '#10b981' },
      { id: 2, label: 'Attendance Records', icon: Calendar, route: '/attendance-records', color: '#0469ff' },
      { id: 3, label: 'Fee Management', icon: FileText, route: '/fee-management', color: '#f59e0b' },
      { id: 4, label: 'Teacher Communication', icon: Mail, route: '/teacher-communication', color: '#8b5cf6' },
      { id: 5, label: 'Notifications', icon: Bell, route: '/notifications', color: '#ec4899' },
      { id: 6, label: 'Settings', icon: Settings, route: '/(tabs)/settings', color: '#06b6d4' },
      { id: 7, label: 'Edit Profile', icon: Edit, route: '/edit-profile', color: '#ef4444' },
    ],
  },

  ADMIN: {
    fieldMappings: {
      name: 'name',
      email: 'email',
      phone: 'phone',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
      // Admin-specific fields
      adminId: 'adminId',
      department: 'department',
      permissions: 'permissions',
    },
    stats: [
      {
        key: 'totalUsers',
        label: 'Total Users',
        value: '1250',
        color: '#0469ff',
        icon: '👥',
        dataPath: 'stats.totalUsers'
      },
      {
        key: 'activeClasses',
        label: 'Active Classes',
        value: '45',
        color: '#10b981',
        icon: '🏫',
        dataPath: 'stats.activeClasses'
      },
      {
        key: 'pendingTasks',
        label: 'Pending Tasks',
        value: '12',
        color: '#f59e0b',
        icon: '📋',
        dataPath: 'stats.pendingTasks'
      },
    ],
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'email' },
      { key: 'phone', label: 'Phone', icon: Phone, color: '#10b981', dataPath: 'phone' },
      { key: 'department', label: 'Department', icon: Shield, color: '#8b5cf6', dataPath: 'department' },
    ],
    additionalInfo: [
      { key: 'adminId', label: 'Admin ID', dataPath: 'adminId' },
      { key: 'permissions', label: 'Permissions', dataPath: 'permissions', isArray: true },
    ],
    menuItems: [
      { id: 1, label: 'User Management', icon: Users, route: '/user-management', color: '#0469ff' },
      { id: 2, label: 'School Analytics', icon: Award, route: '/analytics', color: '#10b981' },
      { id: 3, label: 'System Settings', icon: Settings, route: '/system-settings', color: '#f59e0b' },
      { id: 4, label: 'Announcements', icon: Bell, route: '/admin-announcements', color: '#8b5cf6' },
      { id: 5, label: 'Reports', icon: FileText, route: '/reports', color: '#ec4899' },
      { id: 6, label: 'Settings', icon: Settings, route: '/(tabs)/settings', color: '#06b6d4' },
      { id: 7, label: 'Edit Profile', icon: Edit, route: '/edit-profile', color: '#ef4444' },
    ],
  },
};

// ==================== HELPER FUNCTIONS ====================
// Get nested value from object using path (e.g., 'user.name' or 'school.name')
const getNestedValue = (obj, path, defaultValue = 'N/A') => {
  if (!path) return defaultValue;
  const value = path.split('.').reduce((acc, part) => acc?.[part], obj);
  return value !== undefined && value !== null ? value : defaultValue;
};

export default function ProfileScreen() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
 const getInitials = useCallback((name) => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0];
    if (parts.length === 2) return parts[0][0] + parts[1][0];
    return parts[0][0] + parts[parts.length - 1][0];
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync('user');
        let savedRole = await SecureStore.getItemAsync('userRole');
        savedRole = savedRole?.replace(/^"|"$/g, '');

        if (stored) {
          setUser(JSON.parse(stored));
          setRole(savedRole || 'STUDENT');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('user');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    router.replace('/(auth)/login');
  };

  const openImageViewer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageViewerVisible(true);
  };

  const closeImageViewer = () => {
    setImageViewerVisible(false);
  };

  if (loading) {
    return (
      <View style={styles.loaderContainer}>
        <ActivityIndicator size="large" color="#0469ff" />
      </View>
    );
  }

  if (!user || !role) {
    return (
      <View style={styles.loaderContainer}>
        <Text style={{ fontSize: 16, color: '#666' }}>No user found</Text>
      </View>
    );
  }
 
  // Get configuration for current role
  const config = PROFILE_CONFIG[role] || PROFILE_CONFIG.STUDENT;

  // Get mapped values
  const userName = getNestedValue(user, config.fieldMappings.name);
  const userRole = getNestedValue(user, config.fieldMappings.role);
  const schoolName = getNestedValue(user, config.fieldMappings.school);
  const profilePicture = getNestedValue(user, config.fieldMappings.profilePicture, 'https://via.placeholder.com/150');


  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <Animated.View entering={FadeInUp.duration(600)} style={styles.profileHeader}>
          <HapticTouchable onPress={openImageViewer}>
            {profilePicture && profilePicture !== 'default.png' ? (
              <View style={styles.avatarContainer}>
                <Image source={{ uri: profilePicture }} style={styles.avatar} />
                <View style={styles.statusDot} />
              </View>
            ) : (
              <View style={[styles.avatar, styles.parentAvatar]}>
                <Text style={styles.fallbackText}>
                  {userName ? getInitials(userName) : 'U'}
                </Text>
              </View>
            )}
          </HapticTouchable>
          <Text style={styles.userName}>{userName}</Text>
          <Text style={styles.userRole}>{userRole}</Text>
          <View style={styles.schoolBadge}>
            <School size={14} color="#666" />
            <Text style={styles.schoolText}>
              {schoolName.length > 30 ? schoolName.slice(0, 30) + '...' : schoolName}
            </Text>
          </View>
        </Animated.View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          {config.stats.map((stat, index) => {
            const value = stat.dataPath ? getNestedValue(user, stat.dataPath, stat.value) : stat.value;
            return (
              <Animated.View
                key={stat.key}
                entering={FadeInDown.delay(100 + index * 100).duration(600)}
                style={[styles.statCard, { backgroundColor: stat.color + '15' }]}
              >
                <Text style={styles.statEmoji}>{stat.icon}</Text>
                <Text style={[styles.statValue, { color: stat.color }]}>{value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </Animated.View>
            );
          })}
        </View>

        {/* Contact Info */}
        <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.infoCard}>
            {config.contactInfo.map((info, index) => {
              const value = getNestedValue(user, info.dataPath);
              return (
                <View key={info.key}>
                  {index > 0 && <View style={styles.divider} />}
                  <View style={styles.infoRow}>
                    <View style={[styles.infoIconContainer, { backgroundColor: info.color + '15' }]}>
                      <info.icon size={18} color={info.color} />
                    </View>
                    <View style={styles.infoTextContainer}>
                      <Text style={styles.infoLabel}>{info.label}</Text>
                      <Text style={styles.infoValue}>{value}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </Animated.View>

        {/* Additional Info Section */}
        {config.additionalInfo && config.additionalInfo.length > 0 && (
          <Animated.View entering={FadeInDown.delay(450).duration(600)} style={styles.section}>
            <Text style={styles.sectionTitle}>Additional Information</Text>
            <View style={styles.infoCard}>
              {config.additionalInfo.map((info, index) => {
                let value = getNestedValue(user, info.dataPath);

                // Handle array values
                if (info.isArray && Array.isArray(value)) {
                  if (info.displayKey) {
                    value = value.map(item => item[info.displayKey]).join(', ');
                  } else {
                    value = value.join(', ');
                  }
                }

                return (
                  <View key={info.key}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.additionalInfoRow}>
                      <Text style={styles.additionalInfoLabel}>{info.label}</Text>
                      <Text style={styles.additionalInfoValue}>{value}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* Menu Items */}
        <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.menuContainer}>
            {config.menuItems.map((item, index) => (
              <Animated.View
                key={item.id}
                entering={FadeInRight.delay(600 + index * 80).duration(500)}
              >
                <HapticTouchable onPress={() => router.push(item.route)}>
                  <View style={[
                    styles.menuItem,
                    index === config.menuItems.length - 1 && styles.lastMenuItem
                  ]}>
                    <View style={[styles.menuIconContainer, { backgroundColor: item.color + '15' }]}>
                      <item.icon size={20} color={item.color} />
                    </View>
                    <Text style={styles.menuText}>{item.label}</Text>
                    <View style={styles.menuArrow}>
                      <Text style={styles.arrowText}>›</Text>
                    </View>
                  </View>
                </HapticTouchable>
              </Animated.View>
            ))}
          </View>
        </Animated.View>

        {/* Bottom Spacing */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Image Viewer Modal */}
      <Modal
        visible={imageViewerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageViewer}
        statusBarTranslucent
      >
        <TouchableWithoutFeedback onPress={closeImageViewer}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                {/* Close Button */}
                <View style={styles.closeButton}>
                  <HapticTouchable onPress={closeImageViewer}>
                    <View style={styles.closeButtonInner}>
                      <X size={24} color="#fff" />
                    </View>
                  </HapticTouchable>
                </View>

                {/* Profile Image - Circular */}
                <View style={styles.imageContainer}>
                  <Image
                    source={{ uri: profilePicture }}
                    style={styles.fullImage}
                    contentFit="cover"
                  />
                </View>

                {/* User Info Overlay */}
                <View style={styles.userInfoOverlay}>
                  <Text style={styles.overlayName}>{userName}</Text>
                  <Text style={styles.overlayRole}>{userRole}</Text>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 20,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#eee',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  statusDot: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: '#fff',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  userRole: {
    fontSize: 15,
    color: '#666',
    marginBottom: 8,
  },
  schoolBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  schoolText: {
    fontSize: 13,
    color: '#666',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  statEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTextContainer: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: '#111',
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
  },
  additionalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  additionalInfoLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  additionalInfoValue: {
    fontSize: 14,
    color: '#111',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  menuContainer: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#111',
  },
  menuArrow: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 24,
    color: '#999',
    fontWeight: '300',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: -180,
    right: -SCREEN_WIDTH / 2 + 50,
    zIndex: 10,
  },
  closeButtonInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parentAvatar: {
    backgroundColor: '#0469ff',
  },
  fallbackText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },

  imageContainer: {
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_WIDTH * 0.85,
    borderRadius: SCREEN_WIDTH * 0.85 / 2,
    overflow: 'hidden',
    backgroundColor: '#222',
    borderWidth: 5,
    borderColor: '#fff',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  userInfoOverlay: {
    marginTop: 30,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  overlayName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  overlayRole: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
});