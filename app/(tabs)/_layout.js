import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useNotification } from '../../contexts/NotificationContext';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const [role, setRole] = useState(null);
  const { noticeBadgeCount } = useNotification();

  useEffect(() => {
    const loadRole = async () => {
      let savedRole = await SecureStore.getItemAsync('userRole');
      savedRole = savedRole?.replace(/^"|"$/g, '');
      setRole(savedRole || 'STUDENT');
    };
    loadRole();
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
    <SafeAreaProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#8e8e93',
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
    </SafeAreaProvider>
  );
}