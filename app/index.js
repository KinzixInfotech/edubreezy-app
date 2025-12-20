import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import * as SecureStore from 'expo-secure-store';

export default function Index() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    console.log('Index screen mounted');

    const checkAuth = async () => {
      try {
        // Check SecureStore FIRST (much faster than Supabase call)
        const userData = await SecureStore.getItemAsync('user');
        if (userData) {
          console.log('✅ User found in SecureStore - fast path');
          setIsAuthenticated(true);
          setIsLoading(false);
          return; // Skip Supabase check - we have local data
        }

        // Only check Supabase if no local data exists
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          console.log('✅ Supabase session found');
          setIsAuthenticated(true);
        } else {
          console.log('❌ No session or user data found');
          setIsAuthenticated(false);
        }
      } catch (error) {
        console.error('Error checking auth:', error);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen for session changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsAuthenticated(true);
      }
      // Don't set to false on session loss - we might still have SecureStore data
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

  if (isAuthenticated) {
    return <Redirect href="/(screens)/greeting" />;
  }

  return <Redirect href="/(auth)/schoolcode" />;
}