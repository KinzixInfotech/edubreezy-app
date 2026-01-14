import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useNotification } from '../../contexts/NotificationContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as NavigationBar from 'expo-navigation-bar';

function TabsLayout() {
  const [role, setRole] = useState(null);
  const { noticeBadgeCount } = useNotification();

  // Get safe area insets for bottom navigation - must be called before any early returns
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const loadRole = async () => {
      let savedRole = await SecureStore.getItemAsync('userRole');
      savedRole = savedRole?.replace(/^"|"$/g, '');
      setRole(savedRole || 'STUDENT');
    };
    loadRole();

    // Set Android navigation bar color to match tabs
    if (Platform.OS === 'android') {
      NavigationBar.setBackgroundColorAsync('#0256d0');
      NavigationBar.setButtonStyleAsync('light');
    }
  }, []);

  if (!role) return null;

  // Define tab configurations based on role
  const getTabConfig = () => {
    switch (role) {
      case 'STUDENT':
        return {
          showHome: true,
          showProfile: true,
          showNoticeBoard: true,
          showMarkAttendance: false,

        };
      case 'TEACHING_STAFF':
        return {
          showHome: true,
          showProfile: true,
          markSelf: false,
          showNoticeBoard: true,
          showMarkAttendance: true,

        };
      case 'ADMIN':
        return {
          showHome: true,
          showProfile: true,
          showNoticeBoard: true,
          showMarkAttendance: false,

        };
      case 'PARENT':
        return {
          showHome: true,
          showProfile: true,
          markSelf: false,
          showNoticeBoard: true,
          showMarkAttendance: false,

        };
      case 'DIRECTOR':
        return {
          showHome: true,
          showProfile: true,
          markSelf: false,
          showNoticeBoard: true,
          showMarkAttendance: false,
        };
      case 'PRINCIPAL':
        return {
          showHome: true,
          showProfile: true,
          markSelf: false,
          showNoticeBoard: true,
          showMarkAttendance: false,
        };
      default:
        return {
          showHome: true,
          showProfile: true,
          showNoticeBoard: false,
          markSelf: false,
          showMarkAttendance: false,

        };
    }
  };

  const tabConfig = getTabConfig();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.7)',
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
          height: 70,
          paddingTop: 8,
          paddingBottom: 8,
          bottom: Platform.OS === 'android' ? insets.bottom : 0,
        },
        tabBarBackground: () => (
          <LinearGradient
            colors={['#0469ff', '#0256d0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 32, borderTopRightRadius: 32, overflow: 'hidden' }]}
          >
            {/* Decorative patterns - more filled */}
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
            {/* Circular background shapes */}
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
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'home' : 'home-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href: tabConfig.showProfile ? undefined : null,
          tabBarItemStyle: tabConfig.showProfile ? undefined : { display: 'none' },
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'person' : 'person-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="teacher/mark-attendance"
        options={{
          title: 'Mark Attendance',
          href: tabConfig.showMarkAttendance ? undefined : null,
          tabBarItemStyle: tabConfig.showMarkAttendance ? undefined : { display: 'none' },
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'calendar' : 'calendar-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="noticeboard"
        options={{
          title: 'Notice Board',
          href: tabConfig.showNoticeBoard ? undefined : null,
          tabBarItemStyle: tabConfig.showNoticeBoard ? undefined : { display: 'none' },
          tabBarBadge: noticeBadgeCount > 0 ? noticeBadgeCount : undefined,
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'megaphone' : 'megaphone-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Mark Self',
          href: tabConfig.markSelf ? undefined : null,
          tabBarItemStyle: tabConfig.markSelf ? undefined : { display: 'none' },
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'book' : 'book-outline'}
              size={size}
              color={color}
            />
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