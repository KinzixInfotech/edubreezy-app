// // services/fcmService.js
// import messaging from '@react-native-firebase/messaging';
// import { Platform } from 'react-native';
// import api from '../lib/api';
// import * as SecureStore from 'expo-secure-store';
// import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';

// const BADGE_KEY = 'noticeBadgeCount';

// class FCMService {
//     async requestPermission() {
//         const authStatus = await messaging().requestPermission();
//         const enabled =
//             authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
//             authStatus === messaging.AuthorizationStatus.PROVISIONAL;

//         if (enabled) {
//             console.log('Authorization status:', authStatus);
//             return true;
//         }
//         return false;
//     }

//     async getToken() {
//         try {
//             const token = await messaging().getToken();
//             console.log('📱 FCM Token:', token);
//             return token;
//         } catch (error) {
//             console.error('Error getting FCM token:', error);
//             return null;
//         }
//     }

//     async registerToken(userId) {
//         try {
//             const token = await this.getToken();
//             if (token) {
//                 await api.post(`/users/${userId}/fcm-token`, { fcmToken: token });
//                 await SecureStore.setItemAsync('fcmToken', token);
//                 console.log('✅ FCM token registered successfully');
//             }
//         } catch (error) {
//             console.error('Error registering FCM token:', error);
//         }
//     }

//     async unregisterToken(userId) {
//         try {
//             await api.delete(`/users/${userId}/fcm-token`);
//             await SecureStore.deleteItemAsync('fcmToken');
//         } catch (error) {
//             console.error('Error unregistering FCM token:', error);
//         }
//     }

//     // Helper to increment badge in storage (used in background/quit handlers)
//     async incrementBadgeInStorage() {
//         try {
//             const saved = await SecureStore.getItemAsync(BADGE_KEY);
//             const current = saved ? parseInt(saved, 10) : 0;
//             const newCount = isNaN(current) ? 1 : current + 1;
//             await SecureStore.setItemAsync(BADGE_KEY, newCount.toString());
//             console.log('🔔 Badge incremented in storage to:', newCount);
//             return newCount;
//         } catch (error) {
//             console.error('Error incrementing badge in storage:', error);
//             return 0;
//         }
//     }

//     setupNotificationListeners(onNotificationReceived) {
//         console.log('🔔 Setting up FCM notification listeners...');

//         // Foreground notification handler (app is open)
//         const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
//             console.log('📲 FCM foreground message received:', remoteMessage);

//             if (onNotificationReceived) {
//                 onNotificationReceived(remoteMessage);
//             }
//         });

//         // Notification opened when app was in background
//         const unsubscribeBackground = messaging().onNotificationOpenedApp(async remoteMessage => {
//             console.log('📬 Notification opened from background:', remoteMessage);

//             // Increment badge when notification arrives in background
//             await this.incrementBadgeInStorage();

//             const noticeId = remoteMessage?.data?.noticeId;
//             if (noticeId) {
//                 router.push(`/(tabs)/noticeboard?noticeId=${noticeId}`);
//             } else {
//                 router.push(`/(tabs)/noticeboard`);
//             }
//         });

//         // Check if app was opened from a notification (quit state)
//         messaging()
//             .getInitialNotification()
//             .then(async remoteMessage => {
//                 if (remoteMessage) {
//                     console.log('📭 Notification opened from quit state:', remoteMessage);

//                     // Increment badge when notification arrives in quit state
//                     await this.incrementBadgeInStorage();

//                     const noticeId = remoteMessage?.data?.noticeId;
//                     if (noticeId) {
//                         router.push(`/(tabs)/noticeboard?noticeId=${noticeId}`);
//                     } else {
//                         router.push(`/(tabs)/noticeboard`);
//                     }
//                 }
//             });

//         messaging().onMessage(async remoteMessage => {
//             if (remoteMessage.data.type === 'EVENT_REMINDER') {
//                 const eventId = remoteMessage.data.eventId;
//                 router.push(`/(tabs)/home?eventid=${eventId}`);
//             }
//         }); 

//         // Return cleanup function
//         return () => {
//             console.log('🧹 Cleaning up FCM listeners');
//             unsubscribeForeground();
//             unsubscribeBackground();
//         };
//     }

//     // This must be called at the TOP LEVEL of your index.js (not inside a component)
//     static async setupBackgroundHandler() {
//         messaging().setBackgroundMessageHandler(async remoteMessage => {
//             console.log('📨 FCM Background Message:', remoteMessage);

//             // Increment badge directly in storage (no context available here)
//             try {
//                 const saved = await SecureStore.getItemAsync(BADGE_KEY);
//                 const current = saved ? parseInt(saved, 10) : 0;
//                 const newCount = isNaN(current) ? 1 : current + 1;
//                 await SecureStore.setItemAsync(BADGE_KEY, newCount.toString());
//                 console.log('🔔 Background handler: Badge incremented to:', newCount);
//             } catch (error) {
//                 console.error('Error incrementing badge in background:', error);
//             }
//         });
//     }
// }

// export default new FCMService();
// services/fcmService.js
import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import api from '../lib/api';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';

const BADGE_KEY = 'noticeBadgeCount';

const getNotificationImageUrl = (data = {}) => {
    return (
        data.imageUrl ||
        data.image ||
        data.fileUrl ||
        data.file_url ||
        data.mediaUrl ||
        data.media_url ||
        null
    );
};

class FCMService {
    async requestPermission() {
        const authStatus = await messaging().requestPermission();
        const enabled =
            authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
            authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
            // console.log('Authorization status:', authStatus);
            if (Platform.OS === 'ios' && !messaging().isDeviceRegisteredForRemoteMessages) {
                try {
                    await messaging().registerDeviceForRemoteMessages();
                } catch (e) {
                    console.warn('Failed to register device for remote messages on iOS:', e);
                }
            }
            return true;
        }
        return false;
    }

    async getToken() {
        try {
            if (Platform.OS === 'ios') {
                const apnsToken = await messaging().getAPNSToken();
                if (!apnsToken) {
                    console.warn('⚠️ No APNs token! FCM push will not work on this iOS device. Ensure "Push Notifications" capability is enabled in Apple Dev portal.');
                } else {
                    console.log('✅ APNs Token received successfully');
                }
            }
            const token = await messaging().getToken();
            // console.log('📱 FCM Token:', token);
            return token;
        } catch (error) {
            console.error('Error getting FCM token:', error);
            return null;
        }
    }

    async registerToken(userId) {
        if (!userId) {
            console.warn('[FCM] registerToken called without a userId. Skipping registration.');
            return;
        }
        try {
            const token = await this.getToken();
            if (token) {
                await api.post(`/users/${userId}/fcm-token`, { fcmToken: token, platform: Platform.OS });
                await SecureStore.setItemAsync('fcmToken', token);
                console.log('✅ FCM token registered successfully');
            }
        } catch (error) {
            console.error('Error registering FCM token:', error);
        }
    }

    async unregisterToken(userId) {
        try {
            if (userId) {
                await api.delete(`/users/${userId}/fcm-token`);
            }
            await SecureStore.deleteItemAsync('fcmToken');
            await SecureStore.deleteItemAsync('pendingFcmToken');
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
            // console.log('🔔 Badge incremented in storage to:', newCount);
            return newCount;
        } catch (error) {
            console.error('Error incrementing badge in storage:', error);
            return 0;
        }
    }

    // Check if notification is a notice type (for badge increment)
    isNoticeType(remoteMessage) {
        const type = remoteMessage?.data?.type || remoteMessage?.data?.notificationType;
        return type === 'notice' || type === 'NOTICE' || type === 'broadcast' || type === 'BROADCAST';
    }

    // Check if notification is a chat message type
    isChatType(remoteMessage) {
        const type = remoteMessage?.data?.type || remoteMessage?.data?.notificationType;
        return type === 'CHAT_MESSAGE' || type === 'chat_message';
    }

    // Navigate to a chat conversation from notification data
    navigateToChat(remoteMessage) {
        const conversationId = remoteMessage?.data?.conversationId;
        const schoolId = remoteMessage?.data?.schoolId;
        const title = remoteMessage?.data?.conversationTitle || remoteMessage?.notification?.title || 'Chat';
        if (conversationId) {
            router.push({
                pathname: '/(screens)/chat/[conversationId]',
                params: { conversationId, schoolId, title },
            });
        } else {
            router.push('/(tabs)/chat');
        }
    }

    setupNotificationListeners(onNotificationReceived) {
        // console.log('🔔 Setting up FCM notification listeners...');

        const handleEventReminder = (remoteMessage) => {
            if (remoteMessage?.data?.type === 'EVENT_REMINDER') {
                const eventId = remoteMessage.data.eventId;
                router.push(`/(tabs)/home?eventid=${eventId}`);
            }
        };

        // Foreground notification handler
        const unsubscribeForeground = messaging().onMessage(async remoteMessage => {
            // console.log('📲 FCM foreground message received:', remoteMessage);

            // DON'T increment badge here - let _layout.js handle it with user context
            // This prevents double counting and allows self-broadcast detection

            if (onNotificationReceived) onNotificationReceived(remoteMessage);

            handleEventReminder(remoteMessage);
        });

        // Notification opened from background
        const unsubscribeBackground = messaging().onNotificationOpenedApp(async remoteMessage => {
            // console.log('📬 Notification opened from background:', remoteMessage);

            // Handle chat notifications
            if (this.isChatType(remoteMessage)) {
                this.navigateToChat(remoteMessage);
                return;
            }

            // Don't increment here - background handler already did if it was a notice
            const noticeId = remoteMessage?.data?.noticeId;
            if (noticeId) {
                router.push(`/(tabs)/noticeboard?noticeId=${noticeId}`);
            } else if (this.isNoticeType(remoteMessage)) {
                router.push(`/(tabs)/noticeboard`);
            }

            handleEventReminder(remoteMessage);
        });

        // App opened from quit state
        messaging().getInitialNotification().then(async remoteMessage => {
            if (remoteMessage) {
                // console.log('📭 Notification opened from quit state:', remoteMessage);

                // Handle chat notifications
                if (this.isChatType(remoteMessage)) {
                    this.navigateToChat(remoteMessage);
                    return;
                }

                // Only increment for notice types
                if (this.isNoticeType(remoteMessage)) {
                    await this.incrementBadgeInStorage();
                }

                const noticeId = remoteMessage?.data?.noticeId;
                if (noticeId) {
                    router.push(`/(tabs)/noticeboard?noticeId=${noticeId}`);
                } else if (this.isNoticeType(remoteMessage)) {
                    router.push(`/(tabs)/noticeboard`);
                }

                handleEventReminder(remoteMessage);
            }
        });

        // Return cleanup function
        return () => {
            // console.log('🧹 Cleaning up FCM listeners');
            unsubscribeForeground();
            unsubscribeBackground();
        };
    }

    /**
     * Setup token refresh listener
     * Firebase can refresh tokens at any time - we need to catch this and update backend
     * @param {string} userId - Current user ID to update token for
     * @returns {function} Cleanup function to unsubscribe
     */
    setupTokenRefreshListener(userId) {
        if (!userId) {
            console.warn('[FCM Token Refresh] No userId provided, skipping setup');
            return () => { };
        }

        console.log('[FCM Token Refresh] Setting up listener for user:', userId);

        const unsubscribe = messaging().onTokenRefresh(async newToken => {
            console.log('[FCM Token Refresh] 🔄 Token refreshed, updating backend...');

            try {
                // Get previously stored token
                const oldToken = await SecureStore.getItemAsync('fcmToken');

                // Only update if token actually changed
                if (oldToken !== newToken) {
                    await api.post(`/users/${userId}/fcm-token`, { fcmToken: newToken, platform: Platform.OS });
                    await SecureStore.setItemAsync('fcmToken', newToken);
                    console.log('[FCM Token Refresh] ✅ New token registered successfully');
                } else {
                    console.log('[FCM Token Refresh] Token unchanged, skipping update');
                }
            } catch (error) {
                console.error('[FCM Token Refresh] ❌ Failed to update token:', error);

                // Store failed token for retry on next app launch
                try {
                    await SecureStore.setItemAsync('pendingFcmToken', newToken);
                    console.log('[FCM Token Refresh] Stored pending token for retry');
                } catch (storeError) {
                    console.error('[FCM Token Refresh] Failed to store pending token:', storeError);
                }
            }
        });

        return unsubscribe;
    }

    /**
     * Check and sync any pending token refresh that failed earlier
     * Call this on app startup after user is authenticated
     * @param {string} userId - Current user ID
     */
    async syncPendingToken(userId) {
        if (!userId) return;

        try {
            const pendingToken = await SecureStore.getItemAsync('pendingFcmToken');

            if (pendingToken) {
                console.log('[FCM Token Sync] Found pending token, syncing to backend...');

                await api.post(`/users/${userId}/fcm-token`, { fcmToken: pendingToken, platform: Platform.OS });
                await SecureStore.setItemAsync('fcmToken', pendingToken);
                await SecureStore.deleteItemAsync('pendingFcmToken');

                console.log('[FCM Token Sync] ✅ Pending token synced successfully');
            }
        } catch (error) {
            console.error('[FCM Token Sync] Failed to sync pending token:', error);
            // Keep the pending token for next retry
        }
    }

    /**
     * Verify current token is still valid and matches backend
     * Call periodically or on app foreground
     * @param {string} userId - Current user ID
     */
    async verifyToken(userId) {
        if (!userId) return;

        try {
            const currentToken = await this.getToken();
            const storedToken = await SecureStore.getItemAsync('fcmToken');

            if (currentToken && currentToken !== storedToken) {
                console.log('[FCM Token Verify] Token mismatch detected, updating...');
                await api.post(`/users/${userId}/fcm-token`, { fcmToken: currentToken, platform: Platform.OS });
                await SecureStore.setItemAsync('fcmToken', currentToken);
                console.log('[FCM Token Verify] ✅ Token updated');
            }
        } catch (error) {
            console.error('[FCM Token Verify] Error:', error);
        }
    }

    // Helper to reset badge count
    async resetBadgeCount() {
        try {
            await SecureStore.setItemAsync(BADGE_KEY, '0');
            // console.log('🔔 Badge count reset to 0');
        } catch (error) {
            console.error('Error resetting badge count:', error);
        }
    }

    // Helper to decrement badge count
    async decrementBadgeCount() {
        try {
            const saved = await SecureStore.getItemAsync(BADGE_KEY);
            const current = saved ? parseInt(saved, 10) : 0;
            const newCount = Math.max(0, current - 1);
            await SecureStore.setItemAsync(BADGE_KEY, newCount.toString());
            // console.log('🔔 Badge decremented to:', newCount);
            return newCount;
        } catch (error) {
            console.error('Error decrementing badge count:', error);
            return 0;
        }
    }

    // This must be called at the TOP LEVEL of your index.js (not inside a component)
    async setupBackgroundHandler() {
        messaging().setBackgroundMessageHandler(async remoteMessage => {
            // console.log('📨 FCM Background Message:', remoteMessage);

            // Check if it's a notice type notification
            const type = remoteMessage?.data?.type || remoteMessage?.data?.notificationType;
            const isNotice = type === 'notice' || type === 'NOTICE' || type === 'broadcast' || type === 'BROADCAST';

            // Only increment badge for notice-type notifications
            if (isNotice) {
                try {
                    const saved = await SecureStore.getItemAsync(BADGE_KEY);
                    const current = saved ? parseInt(saved, 10) : 0;
                    const newCount = isNaN(current) ? 1 : current + 1;
                    await SecureStore.setItemAsync(BADGE_KEY, newCount.toString());
                    // console.log('🔔 Background handler: Badge incremented to:', newCount);
                } catch (error) {
                    console.error('Error incrementing badge in background:', error);
                }
            }

            // FALLBACK: If "notification" payload is missing (Data-only), show Local Notification
            if (!remoteMessage.notification && remoteMessage.data?.title) {
                // console.log('⚠️ Showing Local Notification for Data-Only Message (Service)');

                // Build notification content with optional image
                const notificationContent = {
                    title: remoteMessage.data.title,
                    body: remoteMessage.data.body || remoteMessage.data.message,
                    data: remoteMessage.data,
                    sound: true,
                    vibrate: [0, 250, 250, 250],
                };

                // Add image attachment if imageUrl is provided (works on iOS)
                const imageUrl = getNotificationImageUrl(remoteMessage.data);
                if (imageUrl) {
                    console.log('[FCM] Notification image found:', imageUrl);

                    notificationContent.attachments = [
                        { url: imageUrl, identifier: 'image' }
                    ];
                }

                await Notifications.scheduleNotificationAsync({
                    content: notificationContent,
                    trigger: null, // Show immediately
                });
            }

            // Handle EVENT_REMINDER in background
            if (remoteMessage?.data?.type === 'EVENT_REMINDER') {
                const eventId = remoteMessage.data.eventId;
                router.push(`/(tabs)/home?eventid=${eventId}`);
            }
        });
    }
}

export default new FCMService();
