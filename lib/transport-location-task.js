// Foreground-Only Location Tracking for Transport Trips
// This runs only while the app is in the foreground
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import { API_BASE_URL } from './api';
import {
    checkApproachingStops,
    shouldTriggerNotification,
    getNotifiedStopsForTrip,
    markStopNotified,
} from './geofence-service';

export const TRIP_NOTIFICATION_ID = 'active-trip-notification';

// Module-level state for the foreground watcher
let _locationWatcher = null;
let _isTracking = false;

/**
 * Check if bus is approaching any stops and trigger parent notifications.
 * Uses deduplication to avoid spamming (one notification per stop per zone per trip).
 */
async function _checkAndNotifyApproachingStops(lat, lon, tripId, schoolId, licensePlate, tripType) {
    try {
        const stopsData = await SecureStore.getItemAsync(`trip_${tripId}_stops`);
        if (!stopsData) return;

        const { stops, completedStopIds } = JSON.parse(stopsData);
        if (!stops?.length) return;

        const approaching = checkApproachingStops(lat, lon, stops, completedStopIds);
        if (approaching.length === 0) return;

        const notifiedStops = await getNotifiedStopsForTrip(tripId);

        for (const { stop, distance, zone } of approaching) {
            if (!shouldTriggerNotification(stop.id, zone, notifiedStops)) continue;

            const etaMinutes = zone === 'imminent' ? 1 : Math.max(2, Math.round(distance / 250));

            try {
                await fetch(`${API_BASE_URL}/schools/transport/notify-approaching`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        schoolId,
                        tripId,
                        stopId: stop.id,
                        stopName: stop.name,
                        etaMinutes,
                        tripType: tripType || 'PICKUP',
                        licensePlate: licensePlate || '',
                    }),
                });

                await markStopNotified(tripId, stop.id, zone);
            } catch (notifyErr) {
                // Notification failure shouldn't break location tracking
            }
        }
    } catch (err) {
        console.error('Error checking approaching stops:', err.message);
    }
}

/**
 * Start foreground-only location tracking.
 * Uses Location.watchPositionAsync — tracking stops when the app is backgrounded/killed.
 */
export async function startForegroundLocationTracking(
    tripId, vehicleId, routeName, apiBaseUrl,
    { schoolId, licensePlate, tripType, stops } = {}
) {
    try {
        // Request foreground permissions only
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
            throw new Error('Foreground location permission not granted');
        }

        // Show persistent notification so user knows tracking is active
        await showTripNotification(routeName);

        // Store trip info for notification updates and geofence logic
        await SecureStore.setItemAsync('activeTrip', JSON.stringify({
            tripId,
            vehicleId,
            routeName,
            apiBaseUrl,
            schoolId: schoolId || null,
            licensePlate: licensePlate || null,
            tripType: tripType || 'PICKUP',
            startedAt: new Date().toISOString(),
        }));

        // Store route stops for approaching-stop detection
        if (stops?.length) {
            await SecureStore.setItemAsync(`trip_${tripId}_stops`, JSON.stringify({
                stops: stops.map(s => ({ id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude })),
                completedStopIds: [],
            }));
        }

        // Stop any existing watcher before starting a new one
        if (_locationWatcher) {
            _locationWatcher.remove();
            _locationWatcher = null;
        }

        // Start foreground location watcher
        _locationWatcher = await Location.watchPositionAsync(
            {
                accuracy: Location.Accuracy.High,
                timeInterval: 10000, // Update every 10 seconds
                distanceInterval: 20, // or every 20 meters
            },
            async (location) => {
                try {
                    const tripInfo = await SecureStore.getItemAsync('activeTrip');
                    if (!tripInfo) {
                        await stopForegroundLocationTracking();
                        return;
                    }

                    const { tripId: storedTripId, vehicleId: storedVehicleId, schoolId: storedSchoolId, licensePlate: storedPlate, tripType: storedType } = JSON.parse(tripInfo);

                    const response = await fetch(`${API_BASE_URL}/schools/transport/location/update`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            vehicleId: storedVehicleId,
                            tripId: storedTripId,
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            speed: location.coords.speed,
                            heading: location.coords.heading,
                            accuracy: location.coords.accuracy,
                        }),
                    });

                    if (response.ok) {
                        const result = await response.json();

                        // Server says trip already ended — stop sending
                        if (result.shouldStop) {
                            await stopForegroundLocationTracking();
                            return;
                        }

                        // Update notification with latest info
                        await updateTripNotification(location);

                        // Check approaching stops for parent notifications
                        await _checkAndNotifyApproachingStops(
                            location.coords.latitude,
                            location.coords.longitude,
                            storedTripId, storedSchoolId, storedPlate, storedType
                        );
                    }
                } catch (err) {
                    // Queue for retry later if network fails
                    await queueLocationUpdate(location);
                }
            }
        );

        _isTracking = true;
        return { success: true };
    } catch (err) {
        console.error('Error starting foreground location tracking:', err);
        throw err;
    }
}

/**
 * Stop foreground location tracking and clean up.
 */
export async function stopForegroundLocationTracking() {
    try {
        // Stop the foreground watcher
        if (_locationWatcher) {
            _locationWatcher.remove();
            _locationWatcher = null;
        }
        _isTracking = false;

        // Clear stored trip info and stops data
        const tripInfo = await SecureStore.getItemAsync('activeTrip');
        if (tripInfo) {
            const parsed = JSON.parse(tripInfo);
            await SecureStore.deleteItemAsync('activeTrip');
            if (parsed?.tripId) {
                await SecureStore.deleteItemAsync(`trip_${parsed.tripId}_stops`).catch(() => { });
                await SecureStore.deleteItemAsync(`trip_${parsed.tripId}_notified_stops`).catch(() => { });
            }
        }

        // Cancel ALL notifications
        try {
            await Notifications.dismissNotificationAsync(TRIP_NOTIFICATION_ID).catch(() => { });
            await Notifications.cancelScheduledNotificationAsync(TRIP_NOTIFICATION_ID).catch(() => { });

            const presentedNotifications = await Notifications.getPresentedNotificationsAsync();
            for (const notif of presentedNotifications) {
                if (notif.request?.content?.title?.includes('Trip') ||
                    notif.request?.content?.title?.includes('Tracking') ||
                    notif.request?.identifier === TRIP_NOTIFICATION_ID) {
                    await Notifications.dismissNotificationAsync(notif.request.identifier).catch(() => { });
                }
            }

            await Notifications.dismissAllNotificationsAsync();
        } catch (notifError) {
            console.log('⚠️ Error clearing notifications:', notifError.message);
        }

        return { success: true };
    } catch (err) {
        console.error('Error stopping foreground location tracking:', err);
        throw err;
    }
}

/**
 * Update the completed stops list for notification logic.
 * Call this from the foreground when a stop is completed.
 */
export async function updateTripStops(tripId, completedStopIds) {
    try {
        const key = `trip_${tripId}_stops`;
        const data = await SecureStore.getItemAsync(key);
        if (!data) return;

        const parsed = JSON.parse(data);
        parsed.completedStopIds = completedStopIds;
        await SecureStore.setItemAsync(key, JSON.stringify(parsed));
    } catch (e) {
        console.error('Error updating trip stops:', e);
    }
}

/**
 * Check if there's an active trip (for app restart).
 */
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

/**
 * Check if foreground tracking is currently active.
 */
export function isForegroundTrackingActive() {
    return _isTracking && _locationWatcher !== null;
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
        trigger: null,
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

        if (queue.length >= 100) {
            queue.shift();
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

        const { tripId, vehicleId } = JSON.parse(tripInfo);
        const queue = JSON.parse(queueStr);

        for (const loc of queue) {
            try {
                await fetch(`${API_BASE_URL}/schools/transport/location/update`, {
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
                break;
            }
        }

        await SecureStore.deleteItemAsync('locationQueue');
    } catch (err) {
        console.error('Error flushing location queue:', err);
    }
}
