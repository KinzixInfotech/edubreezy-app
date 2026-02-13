import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useNotification } from '../../contexts/NotificationContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as NavigationBar from 'expo-navigation-bar';
import { onProfilePictureChange } from '../../lib/profileEvents';

function TabsLayout() {
  const [role, setRole] = useState(null);
  const [user, setUser] = useState(null);
  const { noticeBadgeCount } = useNotification();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const loadData = async () => {
      let savedRole = await SecureStore.getItemAsync('userRole');
      savedRole = savedRole?.replace(/^"|"$/g, '');
      setRole(savedRole || 'STUDENT');

      try {
        const userStr = await SecureStore.getItemAsync('user');
        if (userStr) {
          setUser(JSON.parse(userStr));
        }
      } catch (e) {
        console.log("Error loading user in tabs", e);
      }
    };
    loadData();

    if (Platform.OS === 'android') {
      NavigationBar.setPositionAsync('absolute');
      NavigationBar.setBackgroundColorAsync('transparent');
      NavigationBar.setButtonStyleAsync('light');
    }
  }, []);

  // Subscribe to profile picture changes - ONLY updates when profile.js emits event
  useEffect(() => {
    const unsubscribe = onProfilePictureChange((newUrl) => {
      console.log('📸 Tab bar received profile picture update:', newUrl);
      setUser(prev => prev ? { ...prev, profilePicture: newUrl } : prev);
    });

    return unsubscribe;
  }, []);

  if (!role) return null;

  const getTabConfig = () => {
    switch (role) {
      case 'STUDENT':
        return { showHome: true, showProfile: true, showNoticeBoard: true, showMarkAttendance: false };
      case 'TEACHING_STAFF':
        return { showHome: true, showProfile: true, markSelf: false, showNoticeBoard: true, showMarkAttendance: false };
      case 'ADMIN':
        return { showHome: true, showProfile: true, showNoticeBoard: true, showMarkAttendance: false };
      case 'PARENT':
        return { showHome: true, showProfile: true, markSelf: false, showNoticeBoard: true, showMarkAttendance: false };
      case 'DIRECTOR':
        return { showHome: true, showProfile: true, markSelf: false, showNoticeBoard: true, showMarkAttendance: false };
      case 'PRINCIPAL':
        return { showHome: true, showProfile: true, markSelf: false, showNoticeBoard: true, showMarkAttendance: false };
      case 'ACCOUNTANT':
        return { showHome: true, showProfile: true, markSelf: false, showNoticeBoard: true, showMarkAttendance: false };
      default:
        return { showHome: true, showProfile: true, showNoticeBoard: false, markSelf: false, showMarkAttendance: false };
    }
  };

  const tabConfig = getTabConfig();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.7)',
        lazy: false,
        freezeOnBlur: true,
        tabBarStyle: {
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          position: 'absolute',
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          overflow: 'hidden',
          height: Platform.OS === 'ios' ? 90 : 70 + insets.bottom,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 25 : Math.max(insets.bottom, 8) + 5,
          bottom: 0,
        },
        tabBarBackground: () => (
          <LinearGradient
            colors={['#0469ff', '#0256d0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}
          >
            <Text style={{ position: 'absolute', top: 8, left: 20, fontSize: 18, color: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}>+</Text>
            <Text style={{ position: 'absolute', top: 15, left: 80, fontSize: 10, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>×</Text>
            <Text style={{ position: 'absolute', top: 5, left: '25%', fontSize: 12, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>÷</Text>
            <Text style={{ position: 'absolute', top: 12, left: '45%', fontSize: 14, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>○</Text>
            <Text style={{ position: 'absolute', top: 6, left: '55%', fontSize: 10, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>△</Text>
            <Text style={{ position: 'absolute', top: 10, right: 120, fontSize: 16, color: 'rgba(255,255,255,0.07)', fontWeight: 'bold' }}>+</Text>
            <Text style={{ position: 'absolute', top: 8, right: 60, fontSize: 12, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>×</Text>
            <Text style={{ position: 'absolute', top: 15, right: 20, fontSize: 14, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>○</Text>
            <Text style={{ position: 'absolute', bottom: 30, left: 50, fontSize: 8, color: 'rgba(255,255,255,0.05)', fontWeight: 'bold' }}>△</Text>
            <Text style={{ position: 'absolute', bottom: 28, left: '30%', fontSize: 10, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>+</Text>
            <Text style={{ position: 'absolute', bottom: 25, left: '50%', fontSize: 12, color: 'rgba(255,255,255,0.05)', fontWeight: 'bold' }}>÷</Text>
            <Text style={{ position: 'absolute', bottom: 30, right: 80, fontSize: 10, color: 'rgba(255,255,255,0.06)', fontWeight: 'bold' }}>×</Text>
            <Text style={{ position: 'absolute', bottom: 28, right: 30, fontSize: 8, color: 'rgba(255,255,255,0.05)', fontWeight: 'bold' }}>△</Text>
            <View style={{ position: 'absolute', top: -40, right: -40, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.04)' }} />
            <View style={{ position: 'absolute', top: -20, left: '40%', width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.03)' }} />
            <View style={{ position: 'absolute', bottom: -30, left: -30, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.04)' }} />
            <View style={{ position: 'absolute', bottom: -25, right: '30%', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.03)' }} />
          </LinearGradient>
        ),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          href: tabConfig.showHome ? undefined : null,
          tabBarItemStyle: tabConfig.showHome ? undefined : { display: 'none' },
          unmountOnBlur: false,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href: tabConfig.showProfile ? undefined : null,
          tabBarItemStyle: tabConfig.showProfile ? undefined : { display: 'none' },
          unmountOnBlur: false,
          tabBarLabel: user?.profilePicture && user.profilePicture !== 'default.png' && user.profilePicture !== 'N/A' ? '' : 'Profile',
          tabBarIcon: ({ focused, color, size }) => {
            if (user?.profilePicture && user.profilePicture !== 'default.png' && user.profilePicture !== 'N/A') {
              const sizecs = size + 20;
              return (
                <View style={{
                  width: sizecs,
                  marginTop: 15,
                  height: sizecs,
                  borderRadius: 50,
                  borderWidth: focused ? 2 : 1.5,
                  borderColor: focused ? color : 'rgba(255,255,255,0.6)',
                  overflow: 'hidden',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#e1e1e1',
                }}>
                  <Image
                    source={{ uri: user.profilePicture }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                </View>
              );
            }
            return (
              <Ionicons name={focused ? 'person' : 'person-outline'} size={size} color={color} />
            );
          },
        }}
      />

      <Tabs.Screen
        name="noticeboard"
        options={{
          title: 'Notice Board',
          href: tabConfig.showNoticeBoard ? undefined : null,
          tabBarItemStyle: tabConfig.showNoticeBoard ? undefined : { display: 'none' },
          unmountOnBlur: false,
          tabBarBadge: noticeBadgeCount > 0 ? noticeBadgeCount : undefined,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons name={focused ? 'megaphone' : 'megaphone-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

export default function TabsLayoutWrapper() {
  return (
    <SafeAreaProvider>
      <TabsLayout />
    </SafeAreaProvider>
  );
}