import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Modal, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { router } from 'expo-router';
import { Settings, Edit, LogOut, Mail, Phone, Calendar, MapPin, Award, BookOpen, School, X } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../components/HapticTouch';
import { useEffect, useState } from 'react';
import Animated, { FadeInDown, FadeInUp, FadeInRight, FadeIn, FadeOut } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ProfileScreen() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync('user');
        if (stored) {
          setUser(JSON.parse(stored));
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

  if (!user) {
    return (
      <View style={styles.loaderContainer}>
        <Text style={{ fontSize: 16, color: '#666' }}>No user found</Text>
      </View>
    );
  }

  // Mock data - replace with actual user data
  const stats = [
    { label: 'Attendance', value: '95%', color: '#10b981', icon: '📊' },
    { label: 'Grade', value: 'A+', color: '#f59e0b', icon: '🎯' },
    { label: 'Assignments', value: '24/26', color: '#8b5cf6', icon: '📝' },
  ];

  const menuItems = [
    { id: 1, label: 'Academic Performance', icon: Award, route: '/performance', color: '#10b981' },
    { id: 2, label: 'Attendance Record', icon: Calendar, route: '/attendance', color: '#0469ff' },
    { id: 3, label: 'My Courses', icon: BookOpen, route: '/courses', color: '#f59e0b' },
    { id: 4, label: 'Settings', icon: Settings, route: '/(tabs)/settings', color: '#8b5cf6' },
    { id: 5, label: 'Edit Profile', icon: Edit, route: '/edit-profile', color: '#06b6d4' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <Animated.View entering={FadeInUp.duration(600)} style={styles.profileHeader}>
          <HapticTouchable onPress={openImageViewer}>
            <View style={styles.avatarContainer}>
              <Image
                source={{ uri: user.profilePicture }}
                style={styles.avatar}
                contentFit="cover"
              />
              <View style={styles.statusDot} />
            </View>
          </HapticTouchable>
          <Text style={styles.userName}>{user.name}</Text>
          <Text style={styles.userRole}>{user.role?.name}</Text>
          <View style={styles.schoolBadge}>
            <School size={14} color="#666" />
            <Text style={styles.schoolText}>
              {user.school?.name?.length > 30
                ? user.school.name.slice(0, 30) + '...'
                : user.school?.name}
            </Text>
          </View>
        </Animated.View>

        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          {stats.map((stat, index) => (
            <Animated.View
              key={index}
              entering={FadeInDown.delay(100 + index * 100).duration(600)}
              style={[styles.statCard, { backgroundColor: stat.color + '15' }]}
            >
              <Text style={styles.statEmoji}>{stat.icon}</Text>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Contact Info */}
        <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Mail size={18} color="#0469ff" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{user.email || 'student@school.com'}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Phone size={18} color="#0469ff" />
              </View>
              <View style={styles.infoTextContainer}>
                <Text style={styles.infoLabel}>Phone</Text>
                <Text style={styles.infoValue}>{user.phone || '+91 98765 43210'}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Menu Items */}
        <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.menuContainer}>
            {menuItems.map((item, index) => (
              <Animated.View
                key={item.id}
                entering={FadeInRight.delay(600 + index * 80).duration(500)}
              >
                <HapticTouchable onPress={()=>router.push(item.route)}>
                  <View style={styles.menuItem}>
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
                    source={{ uri: user.profilePicture }}
                    style={styles.fullImage}
                    contentFit="cover"
                  />
                </View>

                {/* User Info Overlay */}
                <View style={styles.userInfoOverlay}>
                  <Text style={styles.overlayName}>{user.name}</Text>
                  <Text style={styles.overlayRole}>{user.role?.name}</Text>
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
    backgroundColor: '#0469ff15',
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