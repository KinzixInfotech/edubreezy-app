import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal, Dimensions, TouchableWithoutFeedback, Animated as RNAnimated, RefreshControl, Linking, Alert, TextInput, Platform, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Settings, Edit, LogOut, Mail, Phone, Calendar, MapPin, Award, BookOpen, School, X, Users, ClipboardList, FileText, Bell, Shield, Clock, Bus, Fuel, Gauge, UserCheck, ClipboardCheck, Megaphone, Camera, Link2 } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../components/HapticTouch';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { supabase } from '../../lib/supabase';
import Animated2, { FadeInDown, FadeInUp, FadeInRight } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { getCurrentSchool, updateProfilePicture } from '../../lib/profileManager';
import { pickAndUploadImage } from '../../lib/uploadthing';
import Constants from 'expo-constants';
import { emitProfilePictureChange } from '../../lib/profileEvents';
import { stopForegroundLocationTracking } from '../../lib/transport-location-task';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallDevice = SCREEN_WIDTH < 375;
const isTablet = SCREEN_WIDTH >= 768;

// ==================== SKELETON COMPONENTS ====================

function useShimmer() {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(anim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return anim;
}

function Bone({ width, height, borderRadius = 8, style, animValue }) {
  const translateX = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
  });
  return (
    <View style={[{ width, height, borderRadius, backgroundColor: '#E8EDF5', overflow: 'hidden' }, style]}>
      <Animated.View style={{ ...StyleSheet.absoluteFillObject, transform: [{ translateX }] }}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFillObject}
        />
      </Animated.View>
    </View>
  );
}

function SkeletonSection({ anim, rows = 3, title = true }) {
  return (
    <View style={styles.section}>
      {title && <Bone animValue={anim} width={140} height={18} borderRadius={6} style={{ marginBottom: 14 }} />}
      <View style={styles.infoCard}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i}>
            {i > 0 && <View style={styles.divider} />}
            <View style={skStyles.row}>
              <Bone animValue={anim} width={40} height={40} borderRadius={20} />
              <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Bone animValue={anim} width={80} height={11} borderRadius={5} />
                <Bone animValue={anim} width={160} height={14} borderRadius={5} />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function SkeletonAdditional({ anim, rows = 6 }) {
  return (
    <View style={styles.section}>
      <Bone animValue={anim} width={180} height={18} borderRadius={6} style={{ marginBottom: 14 }} />
      <View style={styles.infoCard}>
        {Array.from({ length: rows }).map((_, i) => (
          <View key={i}>
            {i > 0 && <View style={styles.divider} />}
            <View style={[skStyles.row, { justifyContent: 'space-between' }]}>
              <Bone animValue={anim} width={100} height={13} borderRadius={5} />
              <Bone animValue={anim} width={120} height={13} borderRadius={5} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function SkeletonMenu({ anim, items = 4 }) {
  return (
    <View style={styles.section}>
      <Bone animValue={anim} width={130} height={18} borderRadius={6} style={{ marginBottom: 14 }} />
      <View style={styles.menuContainer}>
        {Array.from({ length: items }).map((_, i) => (
          <View key={i}>
            {i > 0 && <View style={styles.divider} />}
            <View style={skStyles.row}>
              <Bone animValue={anim} width={40} height={40} borderRadius={20} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Bone animValue={anim} width={130} height={14} borderRadius={5} />
              </View>
              <Bone animValue={anim} width={20} height={20} borderRadius={5} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function SkeletonVehicleCard({ anim }) {
  return (
    <View style={styles.section}>
      <Bone animValue={anim} width={150} height={18} borderRadius={6} style={{ marginBottom: 14 }} />
      <View style={[styles.vehicleCard, { gap: 16 }]}>
        <View style={skStyles.row}>
          <Bone animValue={anim} width={56} height={56} borderRadius={28} />
          <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
            <Bone animValue={anim} width={120} height={18} borderRadius={5} />
            <Bone animValue={anim} width={90} height={13} borderRadius={5} />
          </View>
          <Bone animValue={anim} width={56} height={24} borderRadius={8} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ alignItems: 'center', gap: 6 }}>
              <Bone animValue={anim} width={24} height={24} borderRadius={12} />
              <Bone animValue={anim} width={50} height={11} borderRadius={4} />
              <Bone animValue={anim} width={40} height={14} borderRadius={4} />
            </View>
          ))}
        </View>
        <Bone animValue={anim} width={180} height={13} borderRadius={5} />
      </View>
    </View>
  );
}

function SkeletonHeader({ anim }) {
  const avatarSize = isTablet ? 140 : isSmallDevice ? 80 : 100;
  const avatarRadius = avatarSize / 2;
  const shimmerTranslate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
  });
  return (
    <LinearGradient
      colors={['#0469ff', '#0256d0']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.profileHeader,
        isTablet && styles.profileHeaderTablet,
        {
          borderBottomLeftRadius: 32,
          borderBottomRightRadius: 32,
          marginHorizontal: isTablet ? -32 : -16,
          paddingHorizontal: isTablet ? 32 : 16,
          marginTop: -16,
          overflow: 'hidden',
          alignItems: 'center',
        },
      ]}
    >
      {/* same background pattern as real header */}
      <Text style={{ position: 'absolute', top: 10, right: 80, fontSize: 40, color: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}>+</Text>
      <Text style={{ position: 'absolute', top: 60, right: 30, fontSize: 24, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>×</Text>
      <Text style={{ position: 'absolute', bottom: 40, right: 100, fontSize: 32, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>÷</Text>
      <Text style={{ position: 'absolute', top: 30, left: '25%', fontSize: 22, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>△</Text>
      <Text style={{ position: 'absolute', bottom: 30, left: '60%', fontSize: 28, color: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}>○</Text>
      <View style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)' }} />
      <View style={{ position: 'absolute', bottom: -60, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.05)' }} />

      {/* Avatar skeleton */}
      <View style={{ position: 'relative', marginBottom: 16 }}>
        <View style={{
          width: avatarSize, height: avatarSize, borderRadius: avatarRadius,
          backgroundColor: 'rgba(255,255,255,0.25)',
          borderWidth: isTablet ? 5 : isSmallDevice ? 3 : 4,
          borderColor: 'rgba(255,255,255,0.5)',
          overflow: 'hidden',
        }}>
          <Animated.View style={{ ...StyleSheet.absoluteFillObject, transform: [{ translateX: shimmerTranslate }] }}>
            <LinearGradient
              colors={['transparent', 'rgba(255,255,255,0.2)', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
        </View>
        {/* status dot */}
        <View style={{
          position: 'absolute',
          bottom: isSmallDevice ? 2 : 4, right: isSmallDevice ? 2 : 4,
          width: isSmallDevice ? 16 : 20, height: isSmallDevice ? 16 : 20,
          borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.3)',
        }} />
      </View>

      {/* Name */}
      <View style={{ height: isTablet ? 32 : isSmallDevice ? 20 : 24, width: 180, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.25)', marginBottom: 10, overflow: 'hidden' }}>
        <Animated.View style={{ ...StyleSheet.absoluteFillObject, transform: [{ translateX: shimmerTranslate }] }}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.2)', 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
        </Animated.View>
      </View>

      {/* Role badge */}
      <View style={{ height: 32, width: 100, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', marginBottom: 12 }} />

      {/* School badge */}
      <View style={{ height: 34, width: 220, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: 8 }} />
    </LinearGradient>
  );
}

function ProfileSkeleton({ role = 'STUDENT' }) {
  const anim = useShimmer();

  const cfg = {
    STUDENT: { contact: 4, additional: 8, showVehicle: false, showChildren: false, showActions: false },
    TEACHING_STAFF: { contact: 4, additional: 8, showVehicle: false, showChildren: false, showActions: false },
    PARENT: { contact: 4, additional: 5, showVehicle: false, showChildren: true, showActions: false },
    ADMIN: { contact: 3, additional: 2, showVehicle: false, showChildren: false, showActions: false },
    DRIVER: { contact: 4, additional: 6, showVehicle: true, showChildren: false, showActions: false },
    CONDUCTOR: { contact: 4, additional: 5, showVehicle: true, showChildren: false, showActions: false },
    DIRECTOR: { contact: 1, additional: 2, showVehicle: false, showChildren: false, showActions: true, menuItems: 6 },
    PRINCIPAL: { contact: 1, additional: 2, showVehicle: false, showChildren: false, showActions: true, menuItems: 4 },
    ACCOUNTANT: { contact: 1, additional: 3, showVehicle: false, showChildren: false, showActions: true, menuItems: 2 },
  }[role] ?? { contact: 3, additional: 4, showVehicle: false, showChildren: false, showActions: false };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0469ff' }} edges={['top']}>
      <View style={[styles.safeArea, { paddingBottom: 90 }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0469ff" translucent={false} />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
        >
          <SkeletonHeader anim={anim} />

          {cfg.showVehicle && <SkeletonVehicleCard anim={anim} />}

          <SkeletonSection anim={anim} rows={cfg.contact} />

          <SkeletonAdditional anim={anim} rows={cfg.additional} />

          {cfg.showChildren && (
            <View style={styles.section}>
              <Bone animValue={anim} width={120} height={18} borderRadius={6} style={{ marginBottom: 14 }} />
              <View style={styles.menuContainer}>
                {[0, 1].map((i) => (
                  <View key={i}>
                    {i > 0 && <View style={styles.divider} />}
                    <View style={skStyles.menuRow}>
                      <Bone animValue={anim} width={40} height={40} borderRadius={20} />
                      <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                        <Bone animValue={anim} width={130} height={15} borderRadius={5} />
                        <Bone animValue={anim} width={180} height={12} borderRadius={5} />
                      </View>
                      <Bone animValue={anim} width={48} height={24} borderRadius={12} />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}

          {cfg.showActions && <SkeletonMenu anim={anim} items={cfg.menuItems ?? 4} />}

          {/* Logout row */}
          <View style={styles.section}>
            <View style={styles.menuContainer}>
              <View style={skStyles.menuRow}>
                <Bone animValue={anim} width={40} height={40} borderRadius={20} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Bone animValue={anim} width={80} height={14} borderRadius={5} />
                </View>
                <Bone animValue={anim} width={20} height={20} borderRadius={5} />
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Bone animValue={anim} width={200} height={52} borderRadius={8} style={{ marginBottom: 20 }} />
            <View style={styles.footerDivider} />
            <Bone animValue={anim} width={100} height={28} borderRadius={6} style={{ marginBottom: 10 }} />
            <Bone animValue={anim} width={60} height={16} borderRadius={5} />
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// ==================== ROLE CONFIG ====================

const ROLE_COLORS = {
  STUDENT: '#10B981',
  PARENT: '#0469ff',
  TEACHING_STAFF: '#0469ff',
  ADMIN: '#EF4444',
  DRIVER: '#F59E0B',
  CONDUCTOR: '#06B6D4',
  NON_TEACHING_STAFF: '#64748B',
  LIBRARIAN: '#14B8A6',
  ACCOUNTANT: '#84CC16',
  DIRECTOR: '#7C3AED',
  PRINCIPAL: '#DC2626',
};

const ROLE_DISPLAY_NAMES = {
  STUDENT: 'Student',
  PARENT: 'Parent',
  TEACHING_STAFF: 'Teacher',
  ADMIN: 'Admin',
  DRIVER: 'Driver',
  CONDUCTOR: 'Conductor',
  NON_TEACHING_STAFF: 'Staff',
  LIBRARIAN: 'Librarian',
  ACCOUNTANT: 'Accountant',
  DIRECTOR: 'Director',
  PRINCIPAL: 'Principal',
};

const PROFILE_CONFIG = {
  STUDENT: {
    fieldMappings: {
      name: 'studentData.name',
      email: 'studentData.email',
      phone: 'studentData.contactNumber',
      role: 'role.name',
      school: 'studentData.school.name',
      profilePicture: 'profilePicture',
    },
    stats: [],
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'studentData.email' },
      { key: 'phone', label: 'Phone', icon: Phone, color: '#10b981', dataPath: 'studentData.contactNumber' },
      { key: 'address', label: 'Address', icon: MapPin, color: '#8b5cf6', dataPath: 'studentData.Address' },
      { key: 'city', label: 'City', icon: MapPin, color: '#f59e0b', dataPath: 'studentData.city' },
    ],
    additionalInfo: [
      { key: 'admissionNo', label: 'Admission No', dataPath: 'studentData.admissionNo' },
      { key: 'rollNumber', label: 'Roll Number', dataPath: 'studentData.rollNumber' },
      { key: 'class', label: 'Class', dataPath: 'studentData.class.className' },
      { key: 'section', label: 'Section', dataPath: 'studentData.section.name' },
      { key: 'gender', label: 'Gender', dataPath: 'studentData.gender' },
      { key: 'dob', label: 'Date of Birth', dataPath: 'studentData.dob' },
      { key: 'bloodGroup', label: 'Blood Group', dataPath: 'studentData.bloodGroup' },
      { key: 'admissionDate', label: 'Admission Date', dataPath: 'studentData.admissionDate' },
      { key: 'fatherName', label: "Father's Name", dataPath: 'studentData.FatherName' },
      { key: 'motherName', label: "Mother's Name", dataPath: 'studentData.MotherName' },
      { key: 'state', label: 'State', dataPath: 'studentData.state' },
    ],
    menuItems: [
      { id: 1, label: 'My Performance', icon: Award, route: '/student/performance', color: '#10b981' },
      { id: 2, label: 'Attendance Record', icon: Calendar, route: '/student/attendance', color: '#0469ff' },
      { id: 3, label: 'Exam Results', icon: BookOpen, route: '/student/exam-results', color: '#f59e0b' },
      { id: 4, label: 'Homework', icon: ClipboardList, route: '/homework/view', color: '#8b5cf6' },
      { id: 5, label: 'My Timetable', icon: Calendar, route: '/student/timetable', color: '#06b6d4' },
      { id: 6, label: 'Certificates', icon: FileText, route: '/student/certificates', color: '#ec4899' },
      { id: 7, label: 'Active Sessions', icon: Shield, route: '/(screens)/sessions', color: '#64748b' },
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
    stats: [],
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
      { id: 9, label: 'Active Sessions', icon: Shield, route: '/(screens)/sessions', color: '#64748b' },
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
    childrenSection: true,
    stats: [],
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
      { id: 3, label: 'Active Sessions', icon: Shield, route: '/(screens)/sessions', color: '#64748b' },
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
      adminId: 'adminId',
      department: 'department',
      permissions: 'permissions',
    },
    stats: [
      { key: 'totalUsers', label: 'Total Users', value: '1250', color: '#0469ff', icon: '👥', dataPath: 'stats.totalUsers' },
      { key: 'activeClasses', label: 'Active Classes', value: '45', color: '#10b981', icon: '🏫', dataPath: 'stats.activeClasses' },
      { key: 'pendingTasks', label: 'Pending Tasks', value: '12', color: '#f59e0b', icon: '📋', dataPath: 'stats.pendingTasks' },
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
      { id: 4, label: 'Announcements', icon: Bell, route: '/admin-announcements', color: '#8b5cf6' },
      { id: 5, label: 'Reports', icon: FileText, route: '/reports', color: '#ec4899' },
      { id: 7, label: 'Edit Profile', icon: Edit, route: '/edit-profile', color: '#ef4444' },
      { id: 8, label: 'Active Sessions', icon: Shield, route: '/(screens)/sessions', color: '#64748b' },
    ],
  },

  DRIVER: {
    fieldMappings: {
      name: 'transportStaffData.name',
      email: 'transportStaffData.email',
      phone: 'transportStaffData.contactNumber',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
      employeeId: 'transportStaffData.employeeId',
      licenseNumber: 'transportStaffData.licenseNumber',
      licenseExpiry: 'transportStaffData.licenseExpiry',
    },
    showVehicleCard: true,
    stats: [],
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'transportStaffData.email' },
      { key: 'phone', label: 'Phone', icon: Phone, color: '#10b981', dataPath: 'transportStaffData.contactNumber' },
      { key: 'emergencyContact', label: 'Emergency Contact', icon: Phone, color: '#ef4444', dataPath: 'transportStaffData.emergencyContact' },
      { key: 'address', label: 'Address', icon: MapPin, color: '#8b5cf6', dataPath: 'transportStaffData.address' },
    ],
    additionalInfo: [
      { key: 'employeeId', label: 'Employee ID', dataPath: 'transportStaffData.employeeId' },
      { key: 'licenseNumber', label: 'License Number', dataPath: 'transportStaffData.licenseNumber' },
      { key: 'licenseExpiry', label: 'License Expiry', dataPath: 'transportStaffData.licenseExpiry' },
      { key: 'gender', label: 'Gender', dataPath: 'transportStaffData.gender' },
      { key: 'dob', label: 'Date of Birth', dataPath: 'transportStaffData.dob' },
      { key: 'bloodGroup', label: 'Blood Group', dataPath: 'transportStaffData.bloodGroup' },
      { key: 'experience', label: 'Experience', dataPath: 'transportStaffData.experience' },
      { key: 'joiningDate', label: 'Joining Date', dataPath: 'transportStaffData.joiningDate' },
    ],
    menuItems: [
      { id: 1, label: 'Trip History', icon: Clock, route: '/(screens)/transport/driver-attendance-history', color: '#0469ff' },
      { id: 2, label: 'My Vehicle', icon: Bus, route: '/(screens)/transport/my-vehicle', color: '#10b981' },
      { id: 3, label: 'My Route', icon: MapPin, route: '/(screens)/transport/my-route', color: '#f59e0b' },
      { id: 4, label: 'Active Sessions', icon: Shield, route: '/(screens)/sessions', color: '#64748b' },
    ],
  },

  CONDUCTOR: {
    fieldMappings: {
      name: 'transportStaffData.name',
      email: 'transportStaffData.email',
      phone: 'transportStaffData.contactNumber',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
      employeeId: 'transportStaffData.employeeId',
    },
    showVehicleCard: true,
    stats: [],
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'transportStaffData.email' },
      { key: 'phone', label: 'Phone', icon: Phone, color: '#10b981', dataPath: 'transportStaffData.contactNumber' },
      { key: 'emergencyContact', label: 'Emergency Contact', icon: Phone, color: '#ef4444', dataPath: 'transportStaffData.emergencyContact' },
      { key: 'address', label: 'Address', icon: MapPin, color: '#8b5cf6', dataPath: 'transportStaffData.address' },
    ],
    additionalInfo: [
      { key: 'employeeId', label: 'Employee ID', dataPath: 'transportStaffData.employeeId' },
      { key: 'gender', label: 'Gender', dataPath: 'transportStaffData.gender' },
      { key: 'dob', label: 'Date of Birth', dataPath: 'transportStaffData.dob' },
      { key: 'bloodGroup', label: 'Blood Group', dataPath: 'transportStaffData.bloodGroup' },
      { key: 'experience', label: 'Experience', dataPath: 'transportStaffData.experience' },
      { key: 'joiningDate', label: 'Joining Date', dataPath: 'transportStaffData.joiningDate' },
    ],
    menuItems: [
      { id: 1, label: 'Trip History', icon: Clock, route: '/(screens)/transport/driver-attendance-history', color: '#0469ff' },
      { id: 2, label: 'My Vehicle', icon: Bus, route: '/(screens)/transport/my-vehicle', color: '#10b981' },
      { id: 3, label: 'My Route', icon: MapPin, route: '/(screens)/transport/my-route', color: '#f59e0b' },
      { id: 4, label: 'Active Sessions', icon: Shield, route: '/(screens)/sessions', color: '#64748b' },
    ],
  },

  DIRECTOR: {
    fieldMappings: {
      name: 'name',
      email: 'email',
      phone: 'directorData.department',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
    },
    allowNameEdit: true,
    stats: [],
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'email' },
    ],
    additionalInfo: [
      { key: 'department', label: 'Department', dataPath: 'directorData.department' },
      { key: 'joinDate', label: 'Join Date', dataPath: 'directorData.joinDate' },
    ],
    menuItems: [
      { id: 1, label: 'Edit Name', icon: Edit, action: 'editName', color: '#7C3AED' },
      { id: 2, label: 'Manage Principal', icon: UserCheck, route: '/(screens)/director/manage-principal', color: '#DC2626' },
      { id: 3, label: 'Broadcast', icon: Megaphone, route: '/(screens)/director/broadcast', color: '#0469ff' },
      { id: 4, label: 'Approvals', icon: ClipboardCheck, route: '/(screens)/principal/approvals', color: '#8B5CF6' },
      { id: 5, label: 'School Profile', icon: School, action: 'viewSchoolProfile', color: '#10B981' },
      { id: 6, label: 'Payroll', icon: FileText, route: '/(screens)/director/payroll', color: '#F59E0B' },
      { id: 7, label: 'Active Sessions', icon: Shield, route: '/(screens)/sessions', color: '#64748b' },
    ],
  },

  PRINCIPAL: {
    fieldMappings: {
      name: 'name',
      email: 'email',
      phone: 'principalData.department',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
    },
    allowNameEdit: true,
    stats: [],
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'email' },
    ],
    additionalInfo: [
      { key: 'department', label: 'Department', dataPath: 'principalData.department' },
      { key: 'joinDate', label: 'Join Date', dataPath: 'principalData.joinDate' },
    ],
    menuItems: [
      { id: 1, label: 'Edit Name', icon: Edit, action: 'editName', color: '#DC2626' },
      { id: 2, label: 'Approvals', icon: ClipboardCheck, route: '/(screens)/principal/approvals', color: '#8B5CF6' },
      { id: 3, label: 'Broadcast', icon: Megaphone, route: '/(screens)/director/broadcast', color: '#0469ff' },
      { id: 4, label: 'School Profile', icon: School, action: 'viewSchoolProfile', color: '#10B981' },
      { id: 5, label: 'Active Sessions', icon: Shield, route: '/(screens)/sessions', color: '#64748b' },
    ],
  },

  ACCOUNTANT: {
    fieldMappings: {
      name: 'name',
      email: 'email',
      phone: 'phone',
      role: 'role.name',
      school: 'school.name',
      profilePicture: 'profilePicture',
      gender: 'gender',
      createdAt: 'createdAt',
      status: 'status',
    },
    allowNameEdit: true,
    stats: [],
    contactInfo: [
      { key: 'email', label: 'Email', icon: Mail, color: '#0469ff', dataPath: 'email' },
    ],
    additionalInfo: [
      { key: 'gender', label: 'Gender', dataPath: 'gender' },
      { key: 'status', label: 'Account Status', dataPath: 'status' },
      { key: 'memberSince', label: 'Member Since', dataPath: 'createdAt', isDate: true },
    ],
    menuItems: [
      { id: 1, label: 'Edit Name', icon: Edit, action: 'editName', color: '#84CC16' },
      { id: 2, label: 'School Profile', icon: School, action: 'viewSchoolProfile', color: '#10B981' },
      { id: 3, label: 'Active Sessions', icon: Shield, route: '/(screens)/sessions', color: '#64748b' },
    ],
  },
};

// ==================== HELPER FUNCTIONS ====================
const getNestedValue = (obj, path, defaultValue = 'N/A') => {
  if (!path) return defaultValue;
  const value = path.split('.').reduce((acc, part) => acc?.[part], obj);
  return value !== undefined && value !== null ? value : defaultValue;
};

// ==================== MAIN SCREEN ====================
export default function ProfileScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { schoolConfig: schoolConfigParam } = useLocalSearchParams();
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [fadeAnim] = useState(new RNAnimated.Value(0));
  const [storedUserId, setStoredUserId] = useState(null);
  const [cachedRole, setCachedRole] = useState(null);
  const [editNameModalVisible, setEditNameModalVisible] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isScrolledPastHeader, setIsScrolledPastHeader] = useState(false);
  const [googleLinked, setGoogleLinked] = useState(false);
  const [googleIdentity, setGoogleIdentity] = useState(null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [identityCount, setIdentityCount] = useState(0);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  // Imperatively update StatusBar — declarative <StatusBar> is unreliable on Android during scroll
  useEffect(() => {
    StatusBar.setBarStyle(isScrolledPastHeader ? 'dark-content' : 'light-content', true);
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor(isScrolledPastHeader ? '#fff' : '#0469ff', true);
    }
  }, [isScrolledPastHeader]);

  const handleScroll = (event) => {
    const scrollY = event.nativeEvent.contentOffset.y;
    const shouldBeDark = scrollY > 250;
    if (shouldBeDark !== isScrolledPastHeader) {
      setIsScrolledPastHeader(shouldBeDark);
    }
  };

  const getInitials = useCallback((name) => {
    if (!name) return '';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0];
    if (parts.length === 2) return parts[0][0] + parts[1][0];
    return parts[0][0] + parts[parts.length - 1][0];
  }, []);

  // Get stored userId on mount — also grab cached role for skeleton
  useEffect(() => {
    (async () => {
      let stored = await SecureStore.getItemAsync('user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setStoredUserId(parsed.id);
        if (parsed.role?.name) setCachedRole(parsed.role.name);
        return;
      }
      stored = await SecureStore.getItemAsync('transportUser');
      if (stored) {
        const parsed = JSON.parse(stored);
        setStoredUserId(parsed.id);
        if (parsed.role?.name) setCachedRole(parsed.role.name);
      }
      // Also try cached userRole key
      const cachedRoleStr = await SecureStore.getItemAsync('userRole');
      if (cachedRoleStr) setCachedRole(cachedRoleStr);
    })();
  }, []);

  // Check Google identity linking status
  const checkGoogleIdentity = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (error) {
        console.log('Error fetching identities:', error.message);
        return;
      }
      const identities = data?.identities || [];
      setIdentityCount(identities.length);
      const googleId = identities.find(i => i.provider === 'google');
      setGoogleLinked(!!googleId);
      setGoogleIdentity(googleId || null);
    } catch (e) {
      console.log('Error checking identities:', e);
    }
  }, []);

  useEffect(() => {
    checkGoogleIdentity();
  }, [checkGoogleIdentity]);

  const { data: userData, isLoading: loading, refetch } = useQuery({
    queryKey: ['user-profile', storedUserId],
    queryFn: async () => {
      console.log('🔄 Profile - Fetching user data via Mobile API...');
      const res = await api.get(`/mobile/user/${storedUserId}`);
      console.log('🔄 Profile - User data received:', res.data ? 'YES' : 'NO');

      if (res.data) {
        const minimalUser = {
          id: res.data.id,
          email: res.data.email,
          name: res.data.name,
          profilePicture: res.data.profilePicture,
          role: res.data.role,
          schoolId: res.data.schoolId,
          ...(res.data.studentData && {
            studentData: {
              name: res.data.studentData.name,
              email: res.data.studentData.email,
              admissionNo: res.data.studentData.admissionNo,
              classId: res.data.studentData.classId,
              sectionId: res.data.studentData.sectionId,
            },
          }),
          ...(res.data.parentData && {
            parentData: {
              id: res.data.parentData.id,
              name: res.data.parentData.name,
              email: res.data.parentData.email,
              contactNumber: res.data.parentData.contactNumber,
            },
          }),
          ...(res.data.teacherData && {
            teacherData: {
              name: res.data.teacherData.name,
              email: res.data.teacherData.email,
              employeeId: res.data.teacherData.employeeId,
            },
          }),
          ...(res.data.school && {
            school: {
              id: res.data.school.id,
              name: res.data.school.name,
              schoolCode: res.data.school.schoolCode,
            },
          }),
        };
        await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
        if (res.data.role?.name) {
          await SecureStore.setItemAsync('userRole', res.data.role.name);
        }
      }
      return res.data;
    },
    enabled: !!storedUserId,
    staleTime: 1000 * 60 * 2,
    refetchOnMount: true,
    initialData: async () => {
      const stored = await SecureStore.getItemAsync('user');
      if (stored) return JSON.parse(stored);
      return undefined;
    },
    initialDataUpdatedAt: 0,
  });

  const user = userData;
  console.warn(user, 'user here');
  const role = user?.role?.name;

  const handleRefresh = async () => {
    console.log('🔄 Profile handleRefresh triggered');
    setRefreshing(true);
    try {
      await refetch();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Show skeleton during manual refresh as well
  if (refreshing) {
    return <ProfileSkeleton role={role || cachedRole} />;
  }

  const handleMenuPress = async (item) => {
    if (item.action === 'editName') {
      const currentName = getNestedValue(user, config.fieldMappings.name, '');
      setEditNameValue(currentName);
      setEditNameModalVisible(true);
    } else if (item.action === 'viewSchoolProfile') {
      if (user?.schoolId) {
        const url = `https://atlas.edubreezy.com/explore/schools/${user.schoolId}?ref=com.kinzix.edubreezy`;
        try {
          const supported = await Linking.canOpenURL(url);
          if (supported) {
            await Linking.openURL(url);
          } else {
            Alert.alert('Error', 'Cannot open school profile URL.');
          }
        } catch (err) {
          console.error('Link error:', err);
          Alert.alert('Error', 'Failed to open link.');
        }
      } else {
        Alert.alert('Info', 'School information is missing.');
      }
    } else if (item.route) {
      router.push(item.route);
    }
  };

  const handleLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          setIsLoggingOut(true);
          setTimeout(async () => {
            try {
              // Revoke current session before logout
              const storedSessionId = await SecureStore.getItemAsync('currentSessionId');
              const userStr = await SecureStore.getItemAsync('user');
              if (storedSessionId && userStr) {
                try {
                  const parsed = JSON.parse(userStr);
                  await api.delete(`/auth/sessions/${storedSessionId}`, {
                    headers: { 'x-user-id': parsed.id },
                  });
                  console.log('✅ Session revoked on logout');
                } catch (e) {
                  console.warn('Could not revoke session:', e.message);
                }
              }
              await SecureStore.deleteItemAsync('currentSessionId');

              const { data: { session } } = await supabase.auth.getSession();
              const currentSchool = await getCurrentSchool();

              if (session?.refresh_token && currentSchool?.schoolCode && user?.id) {
                console.log('💾 Saving latest refresh token before logout...');
                const { updateProfileSession } = await import('../../lib/profileManager');
                await updateProfileSession(currentSchool.schoolCode, user.id, {
                  access_token: session.access_token,
                  refresh_token: session.refresh_token,
                });
                console.log('✅ Latest refresh token saved to profile');
              }

              if (role === 'DRIVER' || role === 'CONDUCTOR') {
                try {
                  await stopForegroundLocationTracking();
                } catch (e) {
                  console.warn('Could not stop location task:', e.message);
                }
              }
              await SecureStore.deleteItemAsync('user');
              await SecureStore.deleteItemAsync('userRole');
              await SecureStore.deleteItemAsync('token');

              if (currentSchool?.schoolCode) {
                const { getProfilesForSchool } = await import('../../lib/profileManager');
                const savedProfiles = await getProfilesForSchool(currentSchool.schoolCode);

                if (savedProfiles && savedProfiles.length > 0) {
                  router.replace({
                    pathname: '/(auth)/profile-selector',
                    params: {
                      schoolCode: currentSchool.schoolCode,
                      ...(currentSchool.schoolData && {
                        schoolData: JSON.stringify(currentSchool.schoolData),
                      }),
                    },
                  });
                } else {
                  router.replace('/(auth)/schoolcode');
                }
              } else {
                router.replace('/(auth)/schoolcode');
              }
            } catch (error) {
              console.log('Logout error:', error);
              setIsLoggingOut(false);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          }, 1500);
        },
      },
    ]);
  };

  const handleLinkGoogle = async () => {
    try {
      setLinkingGoogle(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: 'edubreezy://',
        },
      });
      if (error) throw error;
      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, 'edubreezy://');
        console.log('WebBrowser result:', result.type);
        // Re-check identities after browser flow completes
        await checkGoogleIdentity();
        if (result.type === 'success') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (e) {
      console.error('Error linking Google:', e);
      Alert.alert('Link Failed', e.message || 'Failed to link Google account. Make sure manual linking is enabled in Supabase settings.');
    } finally {
      setLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogle = () => {
    if (identityCount < 2) {
      Alert.alert(
        'Cannot Unlink',
        'You need at least one other login method (email/password) to unlink Google. This is to prevent you from being locked out of your account.',
      );
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Unlink Google Account',
      'Are you sure? You won\'t be able to sign in with Google anymore, but your email/password login will still work.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlink',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!googleIdentity) return;
              const { error } = await supabase.auth.unlinkIdentity(googleIdentity);
              if (error) throw error;
              setGoogleLinked(false);
              setGoogleIdentity(null);
              setIdentityCount(prev => prev - 1);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Success', 'Google account unlinked successfully.');
            } catch (e) {
              console.error('Error unlinking Google:', e);
              Alert.alert('Error', e.message || 'Failed to unlink Google account.');
            }
          },
        },
      ],
    );
  };

  const openImageViewer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageViewerVisible(true);
  };

  const closeImageViewer = () => {
    setImageViewerVisible(false);
  };

  const handleProfilePhotoUpload = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const result = await pickAndUploadImage(
        'profilePhoto',
        {
          userId: user?.id,
          schoolId: user?.schoolId,
          type: 'profile',
        },
        {
          onStart: () => setIsUploadingPhoto(true),
          onProgress: (progress) => console.log('Upload progress:', progress),
          onComplete: async (uploadedFiles) => {
            console.log('✅ Profile photo uploaded:', uploadedFiles);
            if (uploadedFiles?.[0]?.url || uploadedFiles?.url) {
              const photoUrl = uploadedFiles?.[0]?.url || uploadedFiles?.url;
              try {
                await api.put(`/mobile/user/${user.id}`, {
                  profilePicture: photoUrl,
                });
                await refetch();
                await updateProfilePicture(user.id, photoUrl);
                emitProfilePictureChange(photoUrl);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Success', 'Profile photo updated successfully!');
              } catch (updateError) {
                console.error('Error updating profile picture:', updateError);
                Alert.alert('Error', 'Photo uploaded but failed to update profile. Please try again.');
              }
            }
            setIsUploadingPhoto(false);
          },
          onError: (error) => {
            console.error('Profile photo upload error:', error);
            setIsUploadingPhoto(false);
            Alert.alert('Upload Failed', 'Failed to upload photo. Please try again.');
          },
        }
      );

      if (result === null) {
        setIsUploadingPhoto(false);
      }
    } catch (error) {
      console.error('Profile photo upload error:', error);
      setIsUploadingPhoto(false);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    }
  };

  // ── Show skeleton instead of spinner ──
  if (loading || !storedUserId || !user || !role) {
    return <ProfileSkeleton role={cachedRole} />;
  }

  // Get configuration for current role
  const config = PROFILE_CONFIG[role] || PROFILE_CONFIG.STUDENT;

  const userName = getNestedValue(user, config.fieldMappings.name);
  const userRole = ROLE_DISPLAY_NAMES[role] || getNestedValue(user, config.fieldMappings.role);
  const schoolName =
    getNestedValue(user, config.fieldMappings.school) !== 'N/A'
      ? getNestedValue(user, config.fieldMappings.school)
      : getNestedValue(user, 'school.name');
  const profilePicture = getNestedValue(user, config.fieldMappings.profilePicture, 'https://via.placeholder.com/150');
  const roleColor = ROLE_COLORS[role] || '#0469ff';

  return (
    <View style={styles.safeArea}>
      <StatusBar
        translucent={false}
      />

      <View style={styles.container}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.content, isTablet && styles.contentTablet]}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={handleRefresh}
              tintColor="#0469ff"
              colors={['#0469ff']}
              title="Refreshing..."
            />
          }
        >
          {/* Profile Header */}
          <Animated2.View entering={FadeInUp.duration(600)}>
            <LinearGradient
              colors={['#0469ff', '#0256d0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.profileHeader,
                isTablet && styles.profileHeaderTablet,
                {
                  borderBottomLeftRadius: 32,
                  borderBottomRightRadius: 32,
                  marginHorizontal: isTablet ? -32 : -16,
                  paddingHorizontal: isTablet ? 32 : 16,
                  marginTop: -16,
                  paddingTop: insets.top + 16,
                  overflow: 'hidden',
                },
              ]}
            >
              <Text style={{ position: 'absolute', top: 10, right: 80, fontSize: 40, color: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}>+</Text>
              <Text style={{ position: 'absolute', top: 60, right: 30, fontSize: 24, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>×</Text>
              <Text style={{ position: 'absolute', bottom: 40, right: 100, fontSize: 32, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>÷</Text>
              <Text style={{ position: 'absolute', top: 30, left: '25%', fontSize: 22, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>△</Text>
              <Text style={{ position: 'absolute', bottom: 30, left: '60%', fontSize: 28, color: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}>○</Text>
              <View style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)' }} />
              <View style={{ position: 'absolute', bottom: -60, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.05)' }} />

              <HapticTouchable
                onPress={role === 'STUDENT' ? openImageViewer : handleProfilePhotoUpload}
                onLongPress={openImageViewer}
                disabled={isUploadingPhoto}
              >
                {profilePicture && profilePicture !== 'default.png' && profilePicture !== 'N/A' ? (
                  <View style={[styles.avatarContainer, { marginBottom: 16 }, isTablet && styles.avatarContainerTablet]}>
                    {isUploadingPhoto ? (
                      <View style={[styles.avatar, isTablet && styles.avatarTablet, { borderColor: '#fff', backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }]}>
                        <ActivityIndicator size="large" color="#fff" />
                      </View>
                    ) : (
                      <Image source={{ uri: profilePicture }} style={[styles.avatar, isTablet && styles.avatarTablet, { borderColor: '#fff' }]} />
                    )}
                    {role !== 'STUDENT' && !isUploadingPhoto && (
                      <View style={styles.cameraBadge}>
                        <Camera size={14} color="#0469ff" />
                      </View>
                    )}
                    {!isUploadingPhoto && <View style={[styles.statusDot, isTablet && styles.statusDotTablet]} />}
                  </View>
                ) : (
                  <View style={[styles.avatarContainer, { marginBottom: 16 }, isTablet && styles.avatarContainerTablet]}>
                    {isUploadingPhoto ? (
                      <View style={[styles.avatar, styles.avatarFallback, isTablet && styles.avatarTablet, { backgroundColor: 'rgba(255,255,255,0.8)', justifyContent: 'center', alignItems: 'center' }]}>
                        <ActivityIndicator size="large" color="#0469ff" />
                      </View>
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback, isTablet && styles.avatarTablet, { backgroundColor: '#fff' }]}>
                        <Text style={[styles.fallbackText, isTablet && styles.fallbackTextTablet, { color: roleColor }]}>
                          {userName ? getInitials(userName) : 'U'}
                        </Text>
                      </View>
                    )}
                    {role !== 'STUDENT' && !isUploadingPhoto && (
                      <View style={styles.cameraBadge}>
                        <Camera size={14} color="#0469ff" />
                      </View>
                    )}
                    {!isUploadingPhoto && <View style={[styles.statusDot, isTablet && styles.statusDotTablet]} />}
                  </View>
                )}
              </HapticTouchable>

              <Text style={[styles.userName, isSmallDevice && styles.userNameSmall, isTablet && styles.userNameTablet, { color: '#fff' }]}>{userName}</Text>
              <View style={[styles.roleBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                <Text style={[styles.userRole, { color: '#fff' }]}>{userRole}</Text>
              </View>
              <View style={[styles.schoolBadge, isTablet && styles.schoolBadgeTablet, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <School size={isTablet ? 18 : 14} color="rgba(255,255,255,0.9)" />
                <Text style={[styles.schoolText, isTablet && styles.schoolTextTablet, { color: 'rgba(255,255,255,0.9)' }]}>
                  {schoolName.length > (isTablet ? 50 : 30) ? schoolName.slice(0, isTablet ? 50 : 30) + '...' : schoolName}
                </Text>
              </View>
            </LinearGradient>
          </Animated2.View>

          {/* Stats Cards */}
          {config.stats && config.stats.length > 0 && (
            <View style={styles.statsContainer}>
              {config.stats.map((stat, index) => {
                const value = stat.dataPath ? getNestedValue(user, stat.dataPath, stat.value) : stat.value;
                return (
                  <Animated2.View
                    key={stat.key}
                    entering={FadeInDown.delay(100 + index * 100).duration(600)}
                    style={[styles.statCard, { backgroundColor: stat.color + '15' }]}
                  >
                    <Text style={styles.statEmoji}>{stat.icon}</Text>
                    <Text style={[styles.statValue, { color: stat.color }]}>{value}</Text>
                    <Text style={styles.statLabel}>{stat.label}</Text>
                  </Animated2.View>
                );
              })}
            </View>
          )}

          {/* Assigned Vehicle Card */}
          {config.showVehicleCard && user?.transportStaffData && (() => {
            const routeAssignment =
              user.transportStaffData.driverRouteAssignments?.[0] ||
              user.transportStaffData.conductorRouteAssignments?.[0];
            const vehicle = routeAssignment?.vehicle || user.transportStaffData.vehicleAssignments?.[0]?.vehicle;
            const route = routeAssignment?.route;

            if (!vehicle) return null;

            return (
              <Animated2.View entering={FadeInDown.delay(350).duration(600)} style={styles.section}>
                <Text style={styles.sectionTitle}>Assigned Vehicle</Text>
                <HapticTouchable onPress={() => router.push('/(screens)/transport/my-vehicle')}>
                  <View style={styles.vehicleCard}>
                    <View style={styles.vehicleHeader}>
                      <View style={styles.vehicleIconContainer}>
                        <Bus size={28} color="#0469ff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.vehiclePlate}>{vehicle.licensePlate}</Text>
                        <Text style={styles.vehicleModel}>{vehicle.model || 'Unknown Model'}</Text>
                      </View>
                      <View style={styles.vehicleStatusBadge}>
                        <Text style={styles.vehicleStatusText}>Active</Text>
                      </View>
                    </View>

                    <View style={styles.vehicleStats}>
                      <View style={styles.vehicleStatItem}>
                        <Users size={16} color="#64748b" />
                        <Text style={styles.vehicleStatLabel}>Capacity</Text>
                        <Text style={styles.vehicleStatValue}>{vehicle.capacity || '-'}</Text>
                      </View>
                      <View style={styles.vehicleStatDivider} />
                      <View style={styles.vehicleStatItem}>
                        <Fuel size={16} color="#64748b" />
                        <Text style={styles.vehicleStatLabel}>Fuel</Text>
                        <Text style={styles.vehicleStatValue}>{vehicle.fuelType || 'N/A'}</Text>
                      </View>
                      <View style={styles.vehicleStatDivider} />
                      <View style={styles.vehicleStatItem}>
                        <Gauge size={16} color="#64748b" />
                        <Text style={styles.vehicleStatLabel}>Mileage</Text>
                        <Text style={styles.vehicleStatValue}>{vehicle.mileage ? `${vehicle.mileage} km` : 'N/A'}</Text>
                      </View>
                    </View>

                    {route && (
                      <View style={styles.vehicleRoute}>
                        <MapPin size={14} color="#10b981" />
                        <Text style={styles.vehicleRouteText}>Route: {route.name}</Text>
                      </View>
                    )}
                  </View>
                </HapticTouchable>
              </Animated2.View>
            );
          })()}

          {/* Contact Info */}
          <Animated2.View entering={FadeInDown.delay(400).duration(600)} style={styles.section}>
            <Text style={styles.sectionTitle}>Contact Information</Text>
            <View style={styles.infoCard}>
              {config.contactInfo.map((info, index) => {
                const rawValue = getNestedValue(user, info.dataPath, null);
                const isEmpty = !rawValue || rawValue === 'N/A' || rawValue === '';
                const displayValue = isEmpty ? 'Not Added' : rawValue;
                return (
                  <View key={info.key}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.infoRow}>
                      <View style={[styles.infoIconContainer, { backgroundColor: info.color + '15' }]}>
                        <info.icon size={18} color={info.color} />
                      </View>
                      <View style={styles.infoTextContainer}>
                        <Text style={styles.infoLabel}>{info.label}</Text>
                        <Text style={[styles.infoValue, isEmpty && { color: '#9CA3AF', fontStyle: 'italic' }]}>{displayValue}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated2.View>

          {/* Additional Info */}
          {config.additionalInfo && config.additionalInfo.length > 0 && (() => {
            const validItems = config.additionalInfo.filter((info) => {
              const value = getNestedValue(user, info.dataPath, null);
              return value !== null && value !== 'N/A' && value !== '' && value !== 0;
            });

            if (validItems.length === 0) return null;

            return (
              <Animated2.View entering={FadeInDown.delay(450).duration(600)} style={styles.section}>
                <Text style={styles.sectionTitle}>Additional Information</Text>
                <View style={styles.infoCard}>
                  {validItems.map((info, index) => {
                    let value = getNestedValue(user, info.dataPath);

                    if (info.isArray && Array.isArray(value)) {
                      value = info.displayKey ? value.map((item) => item[info.displayKey]).join(', ') : value.join(', ');
                    }

                    if (
                      (info.isDate || info.key === 'dob' || info.key === 'licenseExpiry' || info.key === 'joiningDate' || info.key === 'admissionDate') &&
                      value &&
                      value !== 'N/A'
                    ) {
                      try {
                        const date = new Date(value);
                        value = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
                      } catch (e) { }
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
              </Animated2.View>
            );
          })()}

          {/* Linked Children */}
          {config.childrenSection && user?.parentData?.studentLinks?.length > 0 && (
            <Animated2.View entering={FadeInDown.delay(480).duration(600)} style={styles.section}>
              <Text style={styles.sectionTitle}>My Children</Text>
              <View style={styles.menuContainer}>
                {user.parentData.studentLinks.map((link, index) => (
                  <View
                    key={link.id}
                    style={[styles.menuItem, index === user.parentData.studentLinks.length - 1 && styles.lastMenuItem]}
                  >
                    <View style={styles.avatarContainer}>
                      {link.student?.user?.profilePicture &&
                        link.student.user.profilePicture !== 'default.png' &&
                        link.student.user.profilePicture !== '' ? (
                        <Image
                          source={{ uri: link.student.user.profilePicture }}
                          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#eee' }}
                        />
                      ) : (
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E3F2FD', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 16, fontWeight: '600', color: '#0469ff' }}>
                            {link.student?.name ? getInitials(link.student.name) : 'S'}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', color: '#111' }}>{link.student?.name || 'Loading...'}</Text>
                      <Text style={{ fontSize: 13, color: '#666' }}>
                        {link.student?.class ? `Class ${link.student.class.className} - ${link.student.section?.name} • ` : ''}
                        {link.relation}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#0284C7' }}>{link.student?.admissionNo || 'ID'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </Animated2.View>
          )}

          {/* Quick Actions - Director / Principal / Accountant */}
          {(role === 'DIRECTOR' || role === 'PRINCIPAL' || role === 'ACCOUNTANT') && (
            <Animated2.View entering={FadeInDown.delay(500).duration(600)} style={styles.section}>
              <Text style={styles.sectionTitle}>Quick Actions</Text>
              <View style={styles.menuContainer}>
                {config.menuItems.map((item, index) => (
                  <Animated2.View key={item.id} entering={FadeInRight.delay(600 + index * 80).duration(500)}>
                    <HapticTouchable onPress={() => handleMenuPress(item)}>
                      <View style={[styles.menuItem, index === config.menuItems.length - 1 && styles.lastMenuItem]}>
                        <View style={[styles.menuIconContainer, { backgroundColor: item.color + '15' }]}>
                          <item.icon size={20} color={item.color} />
                        </View>
                        <Text style={styles.menuText}>{item.label}</Text>
                        <View style={styles.menuArrow}>
                          <Text style={styles.arrowText}>›</Text>
                        </View>
                      </View>
                    </HapticTouchable>
                  </Animated2.View>
                ))}
              </View>
            </Animated2.View>
          )}

          {/* Active Sessions */}
          <Animated2.View entering={FadeInDown.delay(550).duration(600)} style={styles.section}>
            <View style={styles.menuContainer}>
              <HapticTouchable onPress={() => router.push('/(screens)/sessions')}>
                <View style={[styles.menuItem, styles.lastMenuItem]}>
                  <View style={[styles.menuIconContainer, { backgroundColor: '#64748b15' }]}>
                    <Shield size={20} color="#64748b" />
                  </View>
                  <Text style={styles.menuText}>Active Sessions</Text>
                  <View style={styles.menuArrow}>
                    <Text style={styles.arrowText}>›</Text>
                  </View>
                </View>
              </HapticTouchable>
            </View>
          </Animated2.View>

          {/* Linked Accounts */}
          <Animated2.View entering={FadeInDown.delay(575).duration(600)} style={styles.section}>
            <Text style={styles.sectionTitle}>Linked Accounts</Text>
            <View style={styles.menuContainer}>
              <View style={[styles.menuItem, styles.lastMenuItem, { paddingVertical: 16 }]}>

                {/* Icon */}
                <View
                  style={[
                    styles.menuIconContainer,
                    { backgroundColor: googleLinked ? '#10b98115' : '#EA433515' },
                  ]}
                >
                  <Image
                    source={require('../../assets/google.png')}
                    style={{ width: 30, height: 30 }}
                  />
                </View>

                {/* Text block */}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={styles.menuText}>Google Account</Text>

                  {googleLinked && googleIdentity?.identity_data?.email && (
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>
                      {googleIdentity.identity_data.email}
                    </Text>
                  )}

                  {!googleLinked && (
                    <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                      Link your Google account for easy sign-in
                    </Text>
                  )}

                  {googleLinked && (
                    <View
                      style={{
                        alignSelf: 'flex-start',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        backgroundColor: '#DCFCE7',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 10,
                        marginTop: 2,
                      }}
                    >
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' }} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#16A34A' }}>Connected</Text>
                    </View>
                  )}
                </View>

                {/* Action button */}
                {googleLinked ? (
                  <HapticTouchable onPress={handleUnlinkGoogle}>
                    <View
                      style={{
                        backgroundColor: '#FEE2E2',
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderRadius: 12,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#EF4444' }}>Unlink</Text>
                    </View>
                  </HapticTouchable>
                ) : (
                  <HapticTouchable onPress={handleLinkGoogle} disabled={linkingGoogle}>
                    {linkingGoogle ? (
                      <ActivityIndicator size="small" color="#0469ff" />
                    ) : (
                      <View
                        style={{
                          backgroundColor: '#DBEAFE',
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 12,
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>Link</Text>
                      </View>
                    )}
                  </HapticTouchable>
                )}

              </View>
            </View>
          </Animated2.View>
          {/* Logout */}
          <Animated2.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
            <View style={styles.menuContainer}>
              <HapticTouchable onPress={handleLogout}>
                <View style={[styles.menuItem, styles.lastMenuItem]}>
                  <View style={[styles.menuIconContainer, { backgroundColor: '#ff444415' }]}>
                    <LogOut size={20} color="#ff4444" />
                  </View>
                  <Text style={[styles.menuText, { color: '#ff4444' }]}>Logout</Text>
                  <View style={styles.menuArrow}>
                    <Text style={[styles.arrowText, { color: '#ff4444' }]}>›</Text>
                  </View>
                </View>
              </HapticTouchable>
            </View>
          </Animated2.View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerTagline}>
              India's smartest{'\n'}school ERP <Text style={{ color: '#EF4444' }}>❤️</Text>
            </Text>
            <View style={styles.footerDivider} />
            <Image source={require('../../assets/kinzix.png')} style={styles.kinzixLogo} />
            <Text style={styles.footerVersion}>
              v{Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0'}
            </Text>
          </View>
        </ScrollView>

        {/* Image Viewer Modal */}
        <Modal visible={imageViewerVisible} transparent={true} animationType="fade" onRequestClose={closeImageViewer} statusBarTranslucent>
          <TouchableWithoutFeedback onPress={closeImageViewer}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.modalContent}>
                  <View style={styles.closeButton}>
                    <HapticTouchable onPress={closeImageViewer}>
                      <View style={styles.closeButtonInner}>
                        <X size={24} color="#fff" />
                      </View>
                    </HapticTouchable>
                  </View>
                  <View style={styles.imageContainer}>
                    <Image source={{ uri: profilePicture }} style={styles.fullImage} contentFit="cover" />
                  </View>
                  <View style={styles.userInfoOverlay}>
                    <Text style={styles.overlayName}>{userName}</Text>
                    <Text style={styles.overlayRole}>{userRole}</Text>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Edit Name Modal */}
        <Modal visible={editNameModalVisible} transparent={true} animationType="fade" onRequestClose={() => setEditNameModalVisible(false)}>
          <TouchableWithoutFeedback onPress={() => setEditNameModalVisible(false)}>
            <View style={styles.editNameModalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.editNameModalContent}>
                  <Text style={styles.editNameModalTitle}>Edit Name</Text>
                  <Text style={styles.editNameModalSubtitle}>Enter your full name</Text>
                  <TextInput
                    style={styles.editNameInput}
                    value={editNameValue}
                    onChangeText={setEditNameValue}
                    placeholder="Enter your name"
                    placeholderTextColor="#9CA3AF"
                    autoFocus={true}
                  />
                  <View style={styles.editNameModalButtons}>
                    <HapticTouchable onPress={() => setEditNameModalVisible(false)} style={styles.editNameCancelButton}>
                      <Text style={styles.editNameCancelText}>Cancel</Text>
                    </HapticTouchable>
                    <HapticTouchable
                      onPress={async () => {
                        if (!editNameValue || editNameValue.trim().length < 2) {
                          Alert.alert('Error', 'Please enter a valid name');
                          return;
                        }
                        setSavingName(true);
                        try {
                          const updateData = { id: user.id, role: role, updates: { name: editNameValue.trim() } };
                          await api.put('/auth/user', updateData);
                          setEditNameModalVisible(false);
                          Alert.alert('Success', 'Name updated successfully!');
                          await refetch();
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } catch (error) {
                          console.error('Error updating name:', error);
                          Alert.alert('Error', 'Failed to update name. Please try again.');
                        } finally {
                          setSavingName(false);
                        }
                      }}
                      style={styles.editNameSaveButton}
                      disabled={savingName}
                    >
                      {savingName ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.editNameSaveText}>Save</Text>}
                    </HapticTouchable>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Logout Modal */}
        <Modal visible={isLoggingOut} transparent={true} animationType="fade">
          <View style={styles.logoutModalOverlay}>
            <View style={styles.logoutContent}>
              <ActivityIndicator size="large" color="#ffffff" />
              <Text style={styles.logoutText}>Logging Out...</Text>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

// ==================== STYLES ====================
const skStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingBottom: 90,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loaderContainer: {
    flex: 1,
    height: '100%',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 16,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: isSmallDevice ? 16 : 24,
    marginBottom: isSmallDevice ? 12 : 20,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: isSmallDevice ? 80 : 100,
    height: isSmallDevice ? 80 : 100,
    borderRadius: isSmallDevice ? 40 : 50,
    backgroundColor: '#eee',
    borderWidth: isSmallDevice ? 3 : 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  statusDot: {
    position: 'absolute',
    bottom: isSmallDevice ? 2 : 4,
    right: isSmallDevice ? 2 : 4,
    width: isSmallDevice ? 16 : 20,
    height: isSmallDevice ? 16 : 20,
    borderRadius: isSmallDevice ? 8 : 10,
    backgroundColor: '#10b981',
    borderWidth: isSmallDevice ? 2 : 3,
    borderColor: '#fff',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: isSmallDevice ? 0 : 2,
    left: isSmallDevice ? 0 : 2,
    width: isSmallDevice ? 26 : 30,
    height: isSmallDevice ? 26 : 30,
    borderRadius: isSmallDevice ? 13 : 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0469ff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  userName: {
    fontSize: isSmallDevice ? 20 : 24,
    fontWeight: '700',
    color: '#111',
    marginBottom: 4,
  },
  userRole: {
    fontSize: 15,
    color: '#666',
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
  fallbackText: { color: '#fff', fontSize: 50, fontWeight: 'bold' },
  imageContainer: {
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_WIDTH * 0.85,
    borderRadius: (SCREEN_WIDTH * 0.85) / 2,
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
  vehicleCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  vehicleIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  vehiclePlate: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1e293b',
  },
  vehicleModel: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  vehicleStatusBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vehicleStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
  vehicleStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    flexWrap: 'wrap',
  },
  vehicleStatItem: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    minWidth: isSmallDevice ? 70 : 80,
  },
  vehicleStatDivider: {
    width: 1,
    height: isSmallDevice ? 28 : 36,
    backgroundColor: '#f1f5f9',
  },
  vehicleStatLabel: {
    fontSize: isSmallDevice ? 10 : 11,
    color: '#94a3b8',
    textAlign: 'center',
  },
  vehicleStatValue: {
    fontSize: isSmallDevice ? 12 : 14,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
  },
  vehicleRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  vehicleRouteText: {
    fontSize: isSmallDevice ? 12 : 13,
    color: '#10b981',
    fontWeight: '600',
  },
  contentTablet: {
    paddingHorizontal: 32,
    width: '100%',
  },
  profileHeaderTablet: {
    paddingVertical: 40,
    marginBottom: 32,
  },
  avatarContainerTablet: {
    marginBottom: 24,
  },
  avatarTablet: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 5,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDotTablet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    bottom: 6,
    right: 6,
    borderWidth: 4,
  },
  userNameSmall: {
    fontSize: 20,
  },
  userNameTablet: {
    fontSize: 32,
    marginBottom: 8,
  },
  roleBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  schoolBadgeTablet: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  schoolTextTablet: {
    fontSize: 15,
  },
  fallbackTextTablet: {
    fontSize: 36,
  },
  editNameModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  editNameModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  editNameModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  editNameModalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  editNameInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1F2937',
    marginBottom: 20,
  },
  editNameModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  editNameCancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  editNameCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  editNameSaveButton: {
    flex: 1,
    backgroundColor: '#007bffff',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  editNameSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  footer: {
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'flex-start',
  },
  footerTagline: {
    fontSize: 44,
    fontWeight: '900',
    color: '#CBD5E1',
    textAlign: 'left',
    lineHeight: 52,
    marginBottom: 20,
  },
  footerDivider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E2E8F0',
    marginBottom: 20,
  },
  kinzixLogo: {
    width: 100,
    height: 30,
    resizeMode: 'contain',
    marginBottom: 10,
    opacity: 0.45,
  },
  footerVersion: {
    fontSize: 16,
    color: '#CBD5E1',
    marginTop: 4,
  },
});