import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import { getCurrentSchool } from '../lib/profileManager';

export default function Index() {
  const [isLoading, setIsLoading] = useState(true);
  const [redirectTo, setRedirectTo] = useState(null);

  useEffect(() => {
    console.log('Index screen mounted');

    const checkAuth = async () => {
      try {
        // Check SecureStore - this is the source of truth for authentication
        // We need user data to be present to consider user authenticated
        const userData = await SecureStore.getItemAsync('user');

        if (userData) {
          // Verify the user data is valid JSON and has required fields
          try {
            const parsedUser = JSON.parse(userData);
            if (parsedUser && (parsedUser.id || parsedUser.email)) {
              console.log('✅ Valid user found in SecureStore - going to greeting');
              setRedirectTo('greeting');
              setIsLoading(false);
              return;
            }
          } catch (parseError) {
            console.warn('⚠️ Invalid user data in SecureStore, clearing...');
            await SecureStore.deleteItemAsync('user');
          }
        }

        // No valid user data - check for saved school data
        console.log('❌ No valid user data in SecureStore');

        const currentSchool = await getCurrentSchool();
        if (currentSchool?.schoolCode && currentSchool?.schoolData) {
          // We have saved school data - go to profile selector
          console.log('📚 Found saved school data, going to profile-selector');
          setRedirectTo('profile-selector');
          setIsLoading(false);
          return;
        }

        // No school data either - go to school code screen
        console.log('🏫 No saved school data, going to schoolcode');
        setRedirectTo('schoolcode');
      } catch (error) {
        console.error('Error checking auth:', error);
        setRedirectTo('schoolcode');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen for session changes - but only set authenticated if we would have user data
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        // Check if user data exists before setting authenticated
        const userData = await SecureStore.getItemAsync('user');
        if (userData) {
          setRedirectTo('greeting');
        }
        // If no user data, don't change redirect even if session exists
      }
      // Don't change on session loss - handled elsewhere
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (redirectTo === 'greeting') {
    return <Redirect href="/(screens)/greeting" />;
  }

  if (redirectTo === 'profile-selector') {
    return <Redirect href="/(auth)/profile-selector" />;
  }

  return <Redirect href="/(auth)/schoolcode" />;
}