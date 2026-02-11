// app/_layout.jsx
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname, useSegments } from 'expo-router';
import { queryClient } from '../lib/queryClient';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Roboto_400Regular, Roboto_500Medium, Roboto_700Bold } from '@expo-google-fonts/roboto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { applyGlobalFont } from '../app/styles/_global';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { AppState, View, Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import fcmService from '../services/fcmService';
import { NotificationProvider, useNotification } from '../contexts/NotificationContext';
import { AttendanceReminderProvider } from '../contexts/AttendanceReminderContext';
import AttendanceReminderModal from './components/AttendanceReminderModal';
import messaging from '@react-native-firebase/messaging';
import { supabase } from '../lib/supabase';
import NetInfo from '@react-native-community/netinfo';
import NoInternetScreen from './components/NoInternetScreen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import VideoSplash from './components/VideoSplash';
import MaintenanceScreen from './components/MaintenanceScreen';
import ChangelogModal from './components/ChangelogModal';
import { checkForUpdates, setupUpdateListener } from '../services/updateChecker';

const BADGE_KEY = 'noticeBadgeCount';

// Keep splash visible while fonts load
SplashScreen.preventAutoHideAsync();

// SAFETY TIMEOUT: Forcibly hide splash after 5 seconds to prevent deadlock
// This is a fallback in case fonts or initialization hangs on some devices
const SPLASH_TIMEOUT_MS = 5000;
let splashHidden = false;

const forceHideSplash = async () => {
    if (splashHidden) return;
    splashHidden = true;
    try {
        console.log('⚠️ Force hiding splash screen (timeout triggered)');
        await SplashScreen.hideAsync();
    } catch (error) {
        console.warn('Force hide splash error (non-critical):', error);
    }
};

// Set up timeout that will trigger if splash doesn't hide naturally
const splashTimeoutId = setTimeout(forceHideSplash, SPLASH_TIMEOUT_MS);

// ========================================================================
// FIREBASE BACKGROUND HANDLER - COMMENTED OUT
// Firebase needs to be initialized before using messaging()
// Uncomment and fix after Firebase is properly configured
// ========================================================================
messaging().setBackgroundMessageHandler(async remoteMessage => {
    console.log('🔴 FCM BACKGROUND message received:', JSON.stringify(remoteMessage));
});

// ========================================================================
// CRITICAL: Background message handler MUST be at top level (outside components)
// This handles FCM notifications when app is in background or quit state
// ========================================================================


function RootLayoutContent() {
    const appState = useRef(AppState.currentState);
    const [isAppActive, setIsAppActive] = useState(true);
    const isAppActiveRef = useRef(isAppActive);

    // Video splash state
    const [showVideoSplash, setShowVideoSplash] = useState(true);

    // Network connectivity state
    const [isConnected, setIsConnected] = useState(true);
    const [isUserLoggedIn, setIsUserLoggedIn] = useState(false);

    // Update & maintenance state
    const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState('');
    const [showChangelog, setShowChangelog] = useState(false);
    const [changelogData, setChangelogData] = useState({ changelog: [], latestVersion: '' });
    const wasOfflineRef = useRef(false);

    // Get current route info
    const pathname = usePathname();
    const segments = useSegments();

    // Excluded routes where we don't show NoInternet screen
    const excludedRoutes = ['(auth)', 'login', 'profile', 'index'];
    const isExcludedRoute = excludedRoutes.some(route =>
        pathname?.includes(route) || segments?.includes(route)
    );

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
    // KEEP AUTH TOKEN SYNCED WITH SUPABASE SESSION
    // Uses centralized token manager for automatic refresh and sync
    // ========================================================================
    useEffect(() => {
        // Import dynamically to avoid circular dependency
        const { initTokenSync, refreshSessionIfNeeded, cleanupTokenSync } = require('../lib/tokenManager');

        // Initialize token sync listener
        initTokenSync();

        // Proactively refresh session if needed on app start
        refreshSessionIfNeeded();

        return () => {
            cleanupTokenSync();
        };
    }, []);

    // ========================================================================
    // 1. FCM FOREGROUND LISTENER – REGISTERED EARLY (BEFORE USER INIT)
    // ========================================================================
    useEffect(() => {
        // Get current user ID for self-broadcast detection
        const getCurrentUserId = async () => {
            try {
                const userStr = await SecureStore.getItemAsync('user');
                if (userStr) {
                    const user = JSON.parse(userStr);
                    return user?.id;
                }
            } catch (e) {
                console.error('Error getting current user:', e);
            }
            return null;
        };

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

        const unsubscribe = fcmService.setupNotificationListeners(async (remoteMessage) => {
            console.log('FCM FOREGROUND message received:', remoteMessage);

            // Extract notification type and sender from data
            const notificationType = remoteMessage.data?.type || remoteMessage.data?.notificationType;
            const senderId = remoteMessage.data?.senderId || remoteMessage.data?.broadcasterUserId;

            // Only increment badge for NOTICE type notifications
            // Also exclude if the sender is the current user (self-broadcast)
            if (notificationType === 'notice' || notificationType === 'NOTICE' || notificationType === 'broadcast') {
                const currentUserId = await getCurrentUserId();

                // Don't increment if this is a self-broadcast
                if (senderId && currentUserId && senderId === currentUserId) {
                    console.log('📌 Skipping badge increment for self-broadcast');
                } else {
                    incrementNoticeBadge();
                    console.log('📌 Badge incremented for notice notification');
                }
            } else {
                console.log('📌 Skipping badge increment - not a notice type:', notificationType);
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
            // console.log('App state changed:', nextAppState);
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

    // ========================================================================
    // APP UPDATE & MAINTENANCE CHECK
    // Checks on mount and when app returns to foreground (5min cooldown)
    // ========================================================================
    useEffect(() => {
        const runUpdateCheck = async () => {
            try {
                const result = await checkForUpdates();
                if (result.maintenanceMode) {
                    setIsMaintenanceMode(true);
                    setMaintenanceMessage(result.maintenanceMessage || '');
                } else {
                    setIsMaintenanceMode(false);
                    // Show changelog modal for non-force updates
                    if (result.updateData?.changelog?.length > 0 && result.updateData?.canSkip) {
                        setChangelogData({
                            changelog: result.updateData.changelog,
                            latestVersion: result.updateData.latestVersion,
                        });
                        setShowChangelog(true);
                    }
                }
            } catch (e) {
                console.log('[Layout] Update check error:', e.message);
            }
        };

        // Check on mount
        runUpdateCheck();

        // Listen for foreground returns
        const cleanup = setupUpdateListener((msg) => {
            setIsMaintenanceMode(true);
            setMaintenanceMessage(msg || '');
        });

        return cleanup;
    }, []);

    // Handle maintenance retry
    const handleMaintenanceRetry = async () => {
        try {
            const result = await checkForUpdates();
            if (!result.maintenanceMode) {
                setIsMaintenanceMode(false);
            }
        } catch (e) {
            console.log('[Layout] Maintenance retry error:', e.message);
        }
    };

    // -------------------------------
    // Splash + fonts
    // -------------------------------
    const onLayoutRootView = useCallback(async () => {
        if (fontsLoaded && !splashHidden) {
            splashHidden = true;
            clearTimeout(splashTimeoutId); // Cancel the force-hide timeout
            try {
                await SplashScreen.hideAsync();
                applyGlobalFont('Roboto_400Regular');
                console.log('✅ Fonts loaded and splash hidden normally');
            } catch (error) {
                console.warn('Splash hide error (non-critical):', error);
            }
        }
    }, [fontsLoaded]);

    // Handle video splash completion
    const handleVideoSplashComplete = useCallback(() => {
        console.log('🎬 Video splash completed');
        setShowVideoSplash(false);
    }, []);

    // ========================================================================
    // NETWORK CONNECTIVITY MONITORING
    // Shows NoInternet screen when offline (only if logged in & not on excluded routes)
    // ========================================================================
    useEffect(() => {
        // Check if user is logged in
        const checkUserLogin = async () => {
            try {
                const userStr = await SecureStore.getItemAsync('user');
                setIsUserLoggedIn(!!userStr);
            } catch (e) {
                console.error('Error checking user login:', e);
            }
        };

        checkUserLogin();

        // Subscribe to network state changes
        const unsubscribe = NetInfo.addEventListener(state => {
            const connected = state.isConnected && state.isInternetReachable !== false;
            console.log('🌐 Network state changed:', connected ? 'Online' : 'Offline');

            if (!connected) {
                wasOfflineRef.current = true;
            }

            setIsConnected(connected);
        });

        // Also check user login when app becomes active
        const appStateSubscription = AppState.addEventListener('change', async (nextState) => {
            if (nextState === 'active') {
                await checkUserLogin();
            }
        });

        return () => {
            unsubscribe();
            appStateSubscription.remove();
        };
    }, []);

    // Handle retry button press
    const handleRetry = useCallback(async () => {
        const state = await NetInfo.fetch();
        const connected = state.isConnected && state.isInternetReachable !== false;
        setIsConnected(connected);
    }, []);

    if (!fontsLoaded) return null;

    // Determine if we should show NoInternet screen
    // Conditions: User logged in + Offline + Not on excluded routes
    const shouldShowNoInternet = !isConnected && isUserLoggedIn && !isExcludedRoute;

    if (shouldShowNoInternet) {
        return (
            <View style={{ flex: 1 }}>
                <StatusBar style='light' />
                <NoInternetScreen onRetry={handleRetry} />
            </View>
        );
    }

    return (
        <>
            <View onLayout={onLayoutRootView} style={{ flex: 1 }}>
                <StatusBar style='dark' />
                <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                    <Stack.Screen name="(screens)" options={{ headerShown: false }} />
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                </Stack>
                {/* Video Splash Overlay */}
                {showVideoSplash && (
                    <VideoSplash onComplete={handleVideoSplashComplete} />
                )}
                {/* Maintenance Mode Overlay */}
                {isMaintenanceMode && (
                    <MaintenanceScreen
                        message={maintenanceMessage}
                        onRetry={handleMaintenanceRetry}
                    />
                )}
                {/* Changelog Modal */}
                <ChangelogModal
                    visible={showChangelog}
                    onClose={() => setShowChangelog(false)}
                    changelog={changelogData.changelog}
                    latestVersion={changelogData.latestVersion}
                />
            </View>
        </>
    );
}

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <QueryClientProvider client={queryClient}>
                <NotificationProvider>
                    <AttendanceReminderProvider>
                        <RootLayoutContent />
                        <AttendanceReminderModal />
                    </AttendanceReminderProvider>
                </NotificationProvider>
            </QueryClientProvider>
        </GestureHandlerRootView>
    );
}