import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentSchool, getProfilesForSchool } from '../lib/profileManager';
import { tryRestoreSession } from '../lib/tokenManager';

const ONBOARDING_STORAGE_KEY = 'hasSeenOnboarding';

export default function Index() {
  const [isLoading, setIsLoading] = useState(true);
  const [redirectTo, setRedirectTo] = useState(null);

    useEffect(() => {
        console.log('Index screen mounted');

        const checkAuth = async () => {
            try {
                const userData = await SecureStore.getItemAsync('user');
                const currentSchool = await getCurrentSchool();

                if (userData) {
                    try {
                        const parsedUser = JSON.parse(userData);
                        if (parsedUser && (parsedUser.id || parsedUser.email)) {
                            const { data: { session } } = await supabase.auth.getSession();

                            if (session?.access_token) {
                                console.log('✅ Valid user + active session found - going to greeting');
                                setRedirectTo('greeting');
                                setIsLoading(false);
                                return;
                            }

                            // App updates can leave user data behind while Supabase session is gone.
                            // Try to restore from the stored profile refresh token before routing into the app.
                            if (currentSchool?.schoolCode && parsedUser?.id) {
                                const profiles = await getProfilesForSchool(currentSchool.schoolCode);
                                const matchingProfile = (profiles || []).find(
                                    (profile) => profile?.userId === parsedUser.id || profile?.email === parsedUser.email
                                );

                                if (matchingProfile) {
                                    const restored = await tryRestoreSession(currentSchool.schoolCode, matchingProfile);
                                    if (restored?.success) {
                                        console.log('✅ Session restored on startup - going to greeting');
                                        setRedirectTo('greeting');
                                        setIsLoading(false);
                                        return;
                                    }
                                }
                            }

                            console.warn('⚠️ Stored user exists but no valid session. Clearing stale user state.');
                            await SecureStore.deleteItemAsync('user');
                            await SecureStore.deleteItemAsync('userRole');
                            await SecureStore.deleteItemAsync('token');
                        }
                    } catch (parseError) {
                        console.warn('⚠️ Invalid user data in SecureStore, clearing...');
                        await SecureStore.deleteItemAsync('user');
                        await SecureStore.deleteItemAsync('userRole');
                        await SecureStore.deleteItemAsync('token');
                    }
                }

                // No valid user data - check for saved school data
                console.log('❌ No valid user data/session in SecureStore');
                const hasSeenOnboarding = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);

                if (currentSchool?.schoolCode && currentSchool?.schoolData) {
                    console.log('📚 Found saved school data, going to profile-selector');
                    setRedirectTo('profile-selector');
                    setIsLoading(false);
                    return;
                }

                if (!hasSeenOnboarding) {
                    console.log('👋 First launch detected, going to onboarding');
                    setRedirectTo('onboarding');
                    setIsLoading(false);
                    return;
                }

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

        // Listen for session changes - but only route into app when both session and user exist
        const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (session) {
                const userData = await SecureStore.getItemAsync('user');
                if (userData) {
                    setRedirectTo('greeting');
                }
            } else {
                const userData = await SecureStore.getItemAsync('user');
                if (userData) {
                    const currentSchool = await getCurrentSchool();
                    setRedirectTo(currentSchool?.schoolCode ? 'profile-selector' : 'schoolcode');
                }
            }
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

    if (redirectTo === 'onboarding') {
        return <Redirect href="/(screens)/onboarding" />;
    }

    return <Redirect href="/(auth)/schoolcode" />;
}
