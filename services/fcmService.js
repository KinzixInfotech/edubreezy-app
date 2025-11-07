// services/fcmService.js
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import api from '../lib/api';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

const BADGE_KEY = 'noticeBadgeCount';

class FCMService {
    async requestPermission() {
        const authStatus = await messaging().requestPermission();
        const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
            console.log('Authorization status:', authStatus);
            return true;
        }
        return false;
    }

    async getToken() {
        try {
            const token = await messaging().getToken();
            console.log('📱 FCM Token:', token);
            return token;
        } catch (error) {
            console.error('Error getting FCM token:', error);
            return null;
        }
    }

    async registerToken(userId) {
        try {
            const token = await this.getToken();
            if (token) {
                await api.post(`/users/${userId}/fcm-token`, { fcmToken: token });
                await SecureStore.setItemAsync('fcmToken', token);
                console.log('✅ FCM token registered successfully');
            }
        } catch (error) {
            console.error('Error registering FCM token:', error);
        }
    }

    async unregisterToken(userId) {
        try {
            await api.delete(`/users/${userId}/fcm-token`);
            await SecureStore.deleteItemAsync('fcmToken');
        } catch (error) {
            console.error('Error unregistering FCM token:', error);
        }
    }

    // Helper to increment badge in storage (used in background/quit handlers)
    async incrementBadgeInStorage() {
        try {
            const saved = await SecureStore.getItemAsync(BADGE_KEY);
            const current = saved ? parseInt(saved, 10) : 0;
            const newCount = isNaN(current) ? 1 : current + 1;
            await SecureStore.setItemAsync(BADGE_KEY, newCount.toString());
            console.log('🔔 Badge incremented in storage to:', newCount);
            return newCount;
        } catch (error) {
            console.error('Error incrementing badge in storage:', error);
            return 0;
        }
    }

    setupNotificationListeners(onNotificationReceived) {
        console.log('🔔 Setting up FCM notification listeners...');

        // Foreground notification handler (app is open)
        const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
            console.log('📲 FCM foreground message received:', remoteMessage);
        
            if (onNotificationReceived) {
                onNotificationReceived(remoteMessage);
            }
        });

        // Notification opened when app was in background
        const unsubscribeBackground = messaging().onNotificationOpenedApp(async remoteMessage => {
            console.log('📬 Notification opened from background:', remoteMessage);

            // Increment badge when notification arrives in background
            await this.incrementBadgeInStorage();

            const noticeId = remoteMessage?.data?.noticeId;
            if (noticeId) {
                router.push(`/(tabs)/noticeboard?noticeId=${noticeId}`);
            } else {
                router.push(`/(tabs)/noticeboard`);
            }
        });

        // Check if app was opened from a notification (quit state)
        messaging()
            .getInitialNotification()
            .then(async remoteMessage => {
                if (remoteMessage) {
                    console.log('📭 Notification opened from quit state:', remoteMessage);

                    // Increment badge when notification arrives in quit state
                    await this.incrementBadgeInStorage();

                    const noticeId = remoteMessage?.data?.noticeId;
                    if (noticeId) {
                        router.push(`/(tabs)/noticeboard?noticeId=${noticeId}`);
                    } else {
                        router.push(`/(tabs)/noticeboard`);
                    }
                }
            });

        // Return cleanup function
        return () => {
            console.log('🧹 Cleaning up FCM listeners');
            unsubscribeForeground();
            unsubscribeBackground();
        };
    }

    // This must be called at the TOP LEVEL of your index.js (not inside a component)
    static async setupBackgroundHandler() {
        messaging().setBackgroundMessageHandler(async remoteMessage => {
            console.log('📨 FCM Background Message:', remoteMessage);
            
            // Increment badge directly in storage (no context available here)
            try {
                const saved = await SecureStore.getItemAsync(BADGE_KEY);
                const current = saved ? parseInt(saved, 10) : 0;
                const newCount = isNaN(current) ? 1 : current + 1;
                await SecureStore.setItemAsync(BADGE_KEY, newCount.toString());
                console.log('🔔 Background handler: Badge incremented to:', newCount);
            } catch (error) {
                console.error('Error incrementing badge in background:', error);
            }
        });
    }
}

export default new FCMService();