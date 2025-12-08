import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal, Dimensions, TouchableWithoutFeedback, Animated as RNAnimated, RefreshControl, Linking, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Settings, Edit, LogOut, Mail, Phone, Calendar, MapPin, Award, BookOpen, School, X, Users, ClipboardList, FileText, Bell, Shield } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../components/HapticTouch';
import { useCallback, useEffect, useState } from 'react';
import fetchUser from '../../lib/queries/user';
import { supabase } from '../../lib/supabase';
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

  TEACHING_STAFF: {
    fieldMappings: {
      name: 'teacherData.name',
      email: 'teacherData.email',
      phone: 'teacherData.contactNumber',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
      // Teacher-specific fields from TeachingStaff schema
      employeeId: 'teacherData.employeeId',
      designation: 'teacherData.designation',
      gender: 'teacherData.gender',
      age: 'teacherData.age',
      bloodGroup: 'teacherData.bloodGroup',
      dob: 'teacherData.dob',
      address: 'teacherData.address',
      city: 'teacherData.City',
      district: 'teacherData.district',
      state: 'teacherData.state',
      country: 'teacherData.country',
      postalCode: 'teacherData.PostalCode',
      department: 'teacherData.department.name',
    },
    stats: [], // Will be fetched dynamically - remove static stats
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'teacherData.email' },
      { key: 'phone', label: 'Phone', icon: Phone, color: '#10b981', dataPath: 'teacherData.contactNumber' },
      { key: 'address', label: 'Address', icon: MapPin, color: '#8b5cf6', dataPath: 'teacherData.address' },
      { key: 'city', label: 'City', icon: MapPin, color: '#f59e0b', dataPath: 'teacherData.City' },
    ],
    additionalInfo: [
      { key: 'employeeId', label: 'Employee ID', dataPath: 'teacherData.employeeId' },
      { key: 'designation', label: 'Designation', dataPath: 'teacherData.designation' },
      { key: 'department', label: 'Department', dataPath: 'teacherData.department.name' },
      { key: 'gender', label: 'Gender', dataPath: 'teacherData.gender' },
      { key: 'dob', label: 'Date of Birth', dataPath: 'teacherData.dob' },
      { key: 'age', label: 'Age', dataPath: 'teacherData.age' },
      { key: 'bloodGroup', label: 'Blood Group', dataPath: 'teacherData.bloodGroup' },
      { key: 'district', label: 'District', dataPath: 'teacherData.district' },
      { key: 'state', label: 'State', dataPath: 'teacherData.state' },
      { key: 'country', label: 'Country', dataPath: 'teacherData.country' },
      { key: 'postalCode', label: 'Postal Code', dataPath: 'teacherData.PostalCode' },
    ],
    menuItems: [
      { id: 1, label: 'My Classes', icon: Users, route: '/my-classes', color: '#0469ff' },
      { id: 2, label: 'Mark Attendance', icon: Calendar, route: '/teacher/mark-attendance', color: '#10b981' },
      { id: 8, label: 'Class Attendance', icon: ClipboardList, route: '/teachers/class-attendance', color: '#3B82F6' },
      { id: 3, label: 'Assign Homework', icon: BookOpen, route: '/homework/assign', color: '#f59e0b' },
      { id: 4, label: 'My Timetable', icon: Calendar, route: '/teachers/timetable', color: '#8b5cf6' },
      { id: 5, label: 'Announcements', icon: Bell, route: '/announcements', color: '#ec4899' },
      { id: 6, label: 'Settings', icon: Settings, route: '/(tabs)/settings', color: '#06b6d4' },
    ],
  },

  PARENT: {
    fieldMappings: {
      name: 'parentData.name',
      email: 'parentData.email',
      phone: 'parentData.contactNumber',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
      // Parent-specific fields from schema
      parentId: 'parentData.id',
      occupation: 'parentData.occupation',
      qualification: 'parentData.qualification',
      address: 'parentData.address',
      city: 'parentData.city',
      state: 'parentData.state',
      bloodGroup: 'parentData.bloodGroup',
      alternateNumber: 'parentData.alternateNumber',
      emergencyContactName: 'parentData.emergencyContactName',
      emergencyContactNumber: 'parentData.emergencyContactNumber',
    },
    childrenSection: true, // Show linked children section
    stats: [], // Stats will be fetched dynamically if needed
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'parentData.email' },
      { key: 'phone', label: 'Phone', icon: Phone, color: '#10b981', dataPath: 'parentData.contactNumber' },
      { key: 'address', label: 'Address', icon: MapPin, color: '#8b5cf6', dataPath: 'parentData.address' },
      { key: 'city', label: 'City', icon: MapPin, color: '#f59e0b', dataPath: 'parentData.city' },
    ],
    additionalInfo: [
      { key: 'occupation', label: 'Occupation', dataPath: 'parentData.occupation' },
      { key: 'qualification', label: 'Qualification', dataPath: 'parentData.qualification' },
      { key: 'bloodGroup', label: 'Blood Group', dataPath: 'parentData.bloodGroup' },
      { key: 'alternateNumber', label: 'Alternate Phone', dataPath: 'parentData.alternateNumber' },
      { key: 'emergencyContact', label: 'Emergency Contact', dataPath: 'parentData.emergencyContactName' },
      { key: 'emergencyPhone', label: 'Emergency Phone', dataPath: 'parentData.emergencyContactNumber' },
    ],
    menuItems: [
      { id: 1, label: 'View Children', icon: Users, route: '/(tabs)/home', color: '#ec4899' },
      { id: 2, label: 'School Profile', icon: School, action: 'viewSchoolProfile', color: '#8b5cf6' },
      { id: 3, label: 'Notifications', icon: Bell, route: '/(tabs)/notifications', color: '#f59e0b' },
      { id: 4, label: 'Settings', icon: Settings, route: '/(tabs)/settings', color: '#06b6d4' },
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
  const [refreshing, setRefreshing] = useState(false);
  const { schoolConfig: schoolConfigParam } = useLocalSearchParams();
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [fadeAnim] = useState(new RNAnimated.Value(0));
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
        } else {
          // Initial fetch if no stored data
          handleRefresh();
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const userData = await fetchUser(session.user.id, session.access_token);
        if (userData) {
          setUser(userData);
          await SecureStore.setItemAsync('user', JSON.stringify(userData));
          // Role might also change/update
          if (userData.role?.name) {
            setRole(userData.role.name);
            await SecureStore.setItemAsync('userRole', userData.role.name);
          }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (error) {
      console.error("Refresh failed:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleMenuPress = async (item) => {
    if (item.action === 'viewSchoolProfile') {
      if (user?.schoolId) {
        // Construct URL - update base URL as per your environment
        const url = `https://school.edubreezy.com/explore/schools/${user.schoolId}?ref=com.kinzix.edubreezy`;
        try {
          const supported = await Linking.canOpenURL(url);
          if (supported) {
            await Linking.openURL(url);
          } else {
            Alert.alert("Error", "Cannot open school profile URL.");
          }
        } catch (err) {
          console.error("Link error:", err);
          Alert.alert("Error", "Failed to open link.");
        }
      } else {
        Alert.alert("Info", "School information is missing.");
      }
    } else if (item.route) {
      router.push(item.route);
    }
  };

  const handleLogout = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setIsLoggingOut(true);

    // Simulate logging out process
    setTimeout(async () => {
      await SecureStore.deleteItemAsync('user');
      await SecureStore.deleteItemAsync('userRole');
      router.replace('/(auth)/login');
    }, 2000);
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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#0469ff" />
        }
      >
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

        {/* Stats Cards - only show if stats exist */}
        {config.stats && config.stats.length > 0 && (
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
        )}

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
        {config.additionalInfo && config.additionalInfo.length > 0 && (() => {
          // Filter to only show items with actual values
          const validItems = config.additionalInfo.filter((info) => {
            const value = getNestedValue(user, info.dataPath, null);
            return value !== null && value !== 'N/A' && value !== '';
          });

          if (validItems.length === 0) return null;

          return (
            <Animated.View entering={FadeInDown.delay(450).duration(600)} style={styles.section}>
              <Text style={styles.sectionTitle}>Additional Information</Text>
              <View style={styles.infoCard}>
                {validItems.map((info, index) => {
                  let value = getNestedValue(user, info.dataPath);

                  // Handle array values
                  if (info.isArray && Array.isArray(value)) {
                    if (info.displayKey) {
                      value = value.map(item => item[info.displayKey]).join(', ');
                    } else {
                      value = value.join(', ');
                    }
                  }

                  // Format date fields
                  if (info.key === 'dob' && value && value !== 'N/A') {
                    try {
                      const date = new Date(value);
                      value = date.toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      });
                    } catch (e) {
                      // Keep original value if parsing fails
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
          );
        })()}

        {/* Linked Children Section */}
        {config.childrenSection && user?.parentData?.studentLinks?.length > 0 && (
          <Animated.View entering={FadeInDown.delay(480).duration(600)} style={styles.section}>
            <Text style={styles.sectionTitle}>My Children</Text>
            <View style={styles.menuContainer}>
              {user.parentData.studentLinks.map((link, index) => (
                <View
                  key={link.id}
                  style={[
                    styles.menuItem,
                    index === user.parentData.studentLinks.length - 1 && styles.lastMenuItem
                  ]}
                >
                  <View style={styles.avatarContainer}>
                    <Image
                      source={{ uri: link.student?.user?.profilePicture || 'https://via.placeholder.com/100' }}
                      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee' }}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#111' }}>
                      {link.student?.name || 'Loading...'}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#666' }}>
                      {link.student?.class ? `Class ${link.student.class.className} - ${link.student.section?.name} • ` : ''}{link.relation}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#0284C7' }}>
                      {link.student?.admissionNo || 'ID'}
                    </Text>
                  </View>
                </View>
              ))}
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
                <HapticTouchable onPress={() => handleMenuPress(item)}>
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

      {/* Logout Modal */}
      <Modal
        visible={isLoggingOut}
        transparent={true}
        animationType="fade"
      >
        <View style={styles.logoutModalOverlay}>
          <View style={styles.logoutContent}>
            <ActivityIndicator size="large" color="#ffffff" />
            <Text style={styles.logoutText}>Logging Out...</Text>
          </View>
        </View>
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
    padding: 16,
    paddingBottom: 100,
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
    color: '#fff',
    opacity: 0.9,
  },

  // Logout Modal Styles
  logoutModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoutContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  logoutText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
});