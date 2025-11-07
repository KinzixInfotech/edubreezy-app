import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useNotification } from '../../contexts/NotificationContext'; // Import

export default function TabsLayout() {
  const [role, setRole] = useState(null);
  const { noticeBadgeCount } = useNotification(); // Use context

  useEffect(() => {
    const loadRole = async () => {
      let savedRole = await SecureStore.getItemAsync('userRole');
      savedRole = savedRole.replace(/^"|"$/g, '');
      setRole(savedRole || 'admin');
    };
    loadRole();
  }, []);

  if (!role) return null;

  const isStudent = role === "STUDENT";
  
  return (
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
        name="noticeboard"
        options={{
          title: 'Notice Board',
          href: isStudent ? '/noticeboard' : null,
          tabBarBadge: noticeBadgeCount > 0 ? noticeBadgeCount : undefined, // Show badge
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
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused, color, size }) => (
            <Ionicons
              name={focused ? 'settings' : 'settings-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}