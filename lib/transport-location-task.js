// Background Location Task for Transport Trips
// This runs even when the app is minimized or killed
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { API_BASE_URL } from './api';

export const LOCATION_TASK_NAME = 'background-location-task';
export const TRIP_NOTIFICATION_ID = 'active-trip-notification';

// Define the background task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) {
        console.error('Background location task error:', error);
        return;
    }

    if (data) {
        const { locations } = data;
        const location = locations?.[0];

        if (location) {
            try {
                // Get stored trip info
                const tripInfo = await SecureStore.getItemAsync('activeTrip');
                if (!tripInfo) {
                    console.log('No active trip found, stopping background task');
                    await stopBackgroundLocationTask();
                    return;
                }

                const { tripId, vehicleId } = JSON.parse(tripInfo);

                // Use live API_BASE_URL (not stored one) to handle IP changes during development
                const response = await fetch(`${API_BASE_URL}/schools/transport/location/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vehicleId,
                        tripId,
                        latitude: location.coords.latitude,
                        longitude: location.coords.longitude,
                        speed: location.coords.speed,
                        heading: location.coords.heading,
                        accuracy: location.coords.accuracy,
                    }),
                });

                if (response.ok) {
                    console.log('Background location update sent successfully');
                    // Update notification with latest info
                    await updateTripNotification(location);
                } else {
                    console.error('Background location update failed:', await response.text());
                }
            } catch (err) {
                console.error('Error in background location task:', err);
                // Queue for retry later if network fails
                await queueLocationUpdate(location);
            }
        }
    }
});

// Start background location tracking
export async function startBackgroundLocationTask(tripId, vehicleId, routeName, apiBaseUrl) {
    try {
        // Request background permissions
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
            throw new Error('Foreground location permission not granted');
        }

        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
            console.warn('Background location permission not granted - will only track in foreground');
        }

        // Store trip info for background task access
        await SecureStore.setItemAsync('activeTrip', JSON.stringify({
            tripId,
            vehicleId,
            routeName,
            apiBaseUrl,
            startedAt: new Date().toISOString(),
        }));

        // Show persistent notification
        await showTripNotification(routeName);

        // Store trip info for background task access (even if task already running, update the data)
        await SecureStore.setItemAsync('activeTrip', JSON.stringify({
            tripId,
            vehicleId,
            routeName,
            apiBaseUrl,
            startedAt: new Date().toISOString(),
        }));
        console.log('✅ Updated active trip data for background task:', { tripId, vehicleId, apiBaseUrl });

        // Check if task is already running
        const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (isTaskRunning) {
            console.log('Background location task already running - updated with fresh trip data');
            return { success: true, alreadyRunning: true };
        }

        // Start background location updates
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000, // Update every 10 seconds
            distanceInterval: 20, // or every 20 meters
            foregroundService: {
                notificationTitle: 'Trip in Progress',
                notificationBody: `Tracking ${routeName}`,
                notificationColor: '#10B981',
            },
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
        });

        console.log('Background location task started successfully');
        return { success: true };
    } catch (err) {
        console.error('Error starting background location task:', err);
        throw err;
    }
}

// Stop background location tracking
export async function stopBackgroundLocationTask() {
    try {
        const isTaskRunning = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);

        // Only proceed if task is running or there's stored trip info
        const tripInfo = await SecureStore.getItemAsync('activeTrip');

        if (!isTaskRunning && !tripInfo) {
            // Nothing to stop - avoid spam logging
            return { success: true, nothingToStop: true };
        }

        // CRITICAL: Stop location updates FIRST - this kills the Android foreground service
        // which automatically removes its persistent notification
        if (isTaskRunning) {
            try {
                await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
                console.log('✅ Background location task stopped');
            } catch (error) {
                // Ignore "Task not found" error as we verified it was running or it might have just stopped
                console.log('⚠️ Could not stop location task (might be already stopped):', error.message);
            }
        }

        // Clear stored trip info
        if (tripInfo) {
            await SecureStore.deleteItemAsync('activeTrip');
        }

        // Give Android time to process the foreground service shutdown
        await new Promise(resolve => setTimeout(resolve, 500));

        // Cancel ALL notifications - including any that might be stuck
        try {
            // Dismiss specific trip notification by ID
            await Notifications.dismissNotificationAsync(TRIP_NOTIFICATION_ID).catch(() => { });
            await Notifications.cancelScheduledNotificationAsync(TRIP_NOTIFICATION_ID).catch(() => { });

            // Get all displayed notifications and dismiss them
            const presentedNotifications = await Notifications.getPresentedNotificationsAsync();
            for (const notif of presentedNotifications) {
                // Dismiss any transport/trip related notifications
                if (notif.request?.content?.title?.includes('Trip') ||
                    notif.request?.content?.title?.includes('Tracking') ||
                    notif.request?.identifier === TRIP_NOTIFICATION_ID) {
                    await Notifications.dismissNotificationAsync(notif.request.identifier).catch(() => { });
                }
            }

            // Final fallback - dismiss all
            await Notifications.dismissAllNotificationsAsync();
            console.log('✅ All trip notifications cleared');
        } catch (notifError) {
            console.log('⚠️ Error clearing notifications:', notifError.message);
        }

        return { success: true };
    } catch (err) {
        console.error('Error stopping background location task:', err);
        throw err;
    }
}

// Check if there's an active trip (for app restart)
export async function getActiveTrip() {
    try {
        const tripInfo = await SecureStore.getItemAsync('activeTrip');
        if (tripInfo) {
            return JSON.parse(tripInfo);
        }
        return null;
    } catch (err) {
        console.error('Error getting active trip:', err);
        return null;
    }
}

// Check if background task is running
export async function isBackgroundTaskRunning() {
    try {
        return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch (err) {
        return false;
    }
}

// Show persistent notification for active trip
async function showTripNotification(routeName) {
    await Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: false,
            shouldSetBadge: false,
        }),
    });

    await Notifications.scheduleNotificationAsync({
        identifier: TRIP_NOTIFICATION_ID,
        content: {
            title: '🚌 Trip in Progress',
            body: `Route: ${routeName}\nTap to return to trip`,
            sticky: true,
            priority: 'high',
            data: { type: 'active-trip' },
        },
        trigger: null, // Show immediately
    });
}

// Update notification with live stats
async function updateTripNotification(location) {
    try {
        const tripInfo = await SecureStore.getItemAsync('activeTrip');
        if (tripInfo) {
            const { routeName, startedAt } = JSON.parse(tripInfo);
            const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 60000);
            const elapsedStr = elapsed < 60 ? `${elapsed}m` : `${Math.floor(elapsed / 60)}h ${elapsed % 60}m`;

            await Notifications.scheduleNotificationAsync({
                identifier: TRIP_NOTIFICATION_ID,
                content: {
                    title: '🚌 Trip Active',
                    body: `${routeName} • ${elapsedStr}\nSpeed: ${location.coords.speed ? Math.round(location.coords.speed * 3.6) : 0} km/h`,
                    sticky: true,
                    priority: 'high',
                    data: { type: 'active-trip' },
                },
                trigger: null,
            });
        }
    } catch (err) {
        console.error('Error updating trip notification:', err);
    }
}

// Queue location updates for later (when offline)
async function queueLocationUpdate(location) {
    try {
        const existingQueue = await SecureStore.getItemAsync('locationQueue');
        const queue = existingQueue ? JSON.parse(existingQueue) : [];

        // Keep max 100 queued updates
        if (queue.length >= 100) {
            queue.shift(); // Remove oldest
        }

        queue.push({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            speed: location.coords.speed,
            heading: location.coords.heading,
            timestamp: new Date().toISOString(),
        });

        await SecureStore.setItemAsync('locationQueue', JSON.stringify(queue));
    } catch (err) {
        console.error('Error queuing location update:', err);
    }
}

// Flush queued location updates (call when network is restored)
export async function flushLocationQueue() {
    try {
        const tripInfo = await SecureStore.getItemAsync('activeTrip');
        const queueStr = await SecureStore.getItemAsync('locationQueue');

        if (!tripInfo || !queueStr) return;

        const { tripId, vehicleId, apiBaseUrl } = JSON.parse(tripInfo);
        const queue = JSON.parse(queueStr);

        for (const loc of queue) {
            try {
                await fetch(`${apiBaseUrl}/schools/transport/location/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        vehicleId,
                        tripId,
                        ...loc,
                    }),
                });
            } catch (err) {
                console.error('Error flushing queued location:', err);
                break; // Stop if network still failing
            }
        }

        // Clear queue after successful flush
        await SecureStore.deleteItemAsync('locationQueue');
    } catch (err) {
        console.error('Error flushing location queue:', err);
    }
}
