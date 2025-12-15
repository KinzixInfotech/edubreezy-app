// app/_layout.jsx
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { queryClient } from '../lib/queryClient';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyGlobalFont } from '../app/styles/global';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { AppState, View, Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import fcmService from '../services/fcmService';
import { NotificationProvider, useNotification } from '../contexts/NotificationContext';
import messaging from '@react-native-firebase/messaging';

const BADGE_KEY = 'noticeBadgeCount';

// Keep splash visible while fonts load
SplashScreen.preventAutoHideAsync();

// Register Background Handler EARLY - SIMPLIFIED for diagnosis
messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('🔴 FCM BACKGROUND message received:', JSON.stringify(remoteMessage));
    // Just log - no SecureStore or Notifications at top level to avoid potential issues
});

// ========================================================================
// CRITICAL: Background message handler MUST be at top level (outside components)
// This handles FCM notifications when app is in background or quit state
// ========================================================================


function RootLayoutContent() {
    const appState = useRef(AppState.currentState);
    const [isAppActive, setIsAppActive] = useState(true);
    const isAppActiveRef = useRef(isAppActive);

    const [fontsLoaded] = useFonts({
        Roboto_400Regular,
        Roboto_500Medium,
        Roboto_700Bold,
    });

    const initRef = useRef(false);
    const fcmUnsubscribeRef = useRef(null);

    const { incrementNoticeBadge, setBadgeCount, isLoaded } = useNotification();

    // Keep ref in sync with state
    useEffect(() => {
        isAppActiveRef.current = isAppActive;
    }, [isAppActive]);

    // ========================================================================
    // SYNC BADGE COUNT FROM STORAGE WHEN APP BECOMES ACTIVE
    // ========================================================================
    useEffect(() => {
        const syncBadgeFromStorage = async () => {
            try {
                const saved = await SecureStore.getItemAsync(BADGE_KEY);
                if (saved) {
                    const count = parseInt(saved, 10);
                    if (!isNaN(count)) {
                        await setBadgeCount(count);
                        console.log('🔄 Synced badge count from storage:', count);
                    }
                }
            } catch (error) {
                console.error('Error syncing badge from storage:', error);
            }
        };

        if (isLoaded && isAppActive) {
            syncBadgeFromStorage();
        }
    }, [isAppActive, isLoaded, setBadgeCount]);

    // ========================================================================
    // 1. FCM FOREGROUND LISTENER – REGISTERED EARLY (BEFORE USER INIT)
    // ========================================================================
    useEffect(() => {
        // Create Android Notification Channel
        if (Platform.OS === 'android') {
            Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            });

            // Debug: Check channels
            Notifications.getNotificationChannelsAsync().then(channels => {
                console.log('📢 Active Notification Channels:', channels);
            });
        }

        const unsubscribe = fcmService.setupNotificationListeners((remoteMessage) => {
            console.log('FCM FOREGROUND message received:', remoteMessage);

            // Increment badge on every new notice (foreground)
            incrementNoticeBadge();

            // Show global alert for foreground notifications
            if (remoteMessage.notification) {
                Alert.alert(
                    remoteMessage.notification.title || 'New Notification',
                    remoteMessage.notification.body
                );
            }

            if (isAppActiveRef.current) {
                console.log('New notice from FCM:', remoteMessage.notification?.title);
            }
        });

        fcmUnsubscribeRef.current = unsubscribe;

        return () => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
                console.log('FCM foreground listener unsubscribed');
            }
        };
    }, [incrementNoticeBadge]);

    // -------------------------------
    // App initialization - ONLY ONCE (FCM token only)
    // -------------------------------
    useEffect(() => {
        if (initRef.current) {
            console.log('Init already called, skipping...');
            return;
        }

        async function init() {
            try {
                console.log('Starting initialization...');

                const configString = await SecureStore.getItemAsync('user');
                if (!configString) {
                    console.log('No user config found in SecureStore.');
                    return;
                }

                const config = JSON.parse(configString);
                console.log('Loaded user config:', config.email);

                // FCM: Request permission + register token (listener already set above)
                const hasPermission = await fcmService.requestPermission();
                if (hasPermission) {
                    await fcmService.registerToken(config?.id);
                    console.log('FCM token registered for user:', config?.id);
                } else {
                    console.warn('FCM permission denied');
                }

                initRef.current = true;
                console.log('Initialization complete');
            } catch (e) {
                console.error('Error during init:', e);
            }
        }

        init();

        // Cleanup only on unmount
        return () => {
            console.log('Cleanup triggered');
        };
    }, []);

    // -------------------------------
    // Monitor app state
    // -------------------------------
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            console.log('App state changed:', nextAppState);
            if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
                setIsAppActive(true);
                console.log('App became active');
            } else {
                setIsAppActive(false);
                console.log('App went to background');
            }
            appState.current = nextAppState;
        });

        return () => subscription.remove();
    }, []);

    // -------------------------------
    // Splash + fonts
    // -------------------------------
    const onLayoutRootView = useCallback(async () => {
        if (fontsLoaded) {
            await SplashScreen.hideAsync();
            applyGlobalFont('Roboto_400Regular');
            console.log('Fonts loaded and applied');
        }
    }, [fontsLoaded]);

    if (!fontsLoaded) return null;

    return (
        <>
            <StatusBar style="dark" />
            <View onLayout={onLayoutRootView} style={{ flex: 1 }}>
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                    <Stack.Screen name="(screens)" options={{ headerShown: false }} />
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                </Stack>
            </View>
        </>
    );
}

export default function RootLayout() {
    return (
        <QueryClientProvider client={queryClient}>
            <NotificationProvider>
                <RootLayoutContent />
            </NotificationProvider>
        </QueryClientProvider>
    );
}