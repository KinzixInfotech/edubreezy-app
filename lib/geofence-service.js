// Geofencing Service for Transport
// Detects when driver is near stops and handles auto-completion

import * as SecureStore from 'expo-secure-store';

// Haversine formula to calculate distance in meters
export function getDistanceMeters(lat1, lon1, lat2, lon2) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;

    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Check if driver is near a stop (default 100m radius)
export function isNearStop(currentLat, currentLon, stopLat, stopLon, radiusMeters = 100) {
    const distance = getDistanceMeters(currentLat, currentLon, stopLat, stopLon);
    return {
        isNear: distance <= radiusMeters,
        distance: Math.round(distance),
    };
}

// Find nearest stop from a list
export function findNearestStop(currentLat, currentLon, stops) {
    if (!stops || stops.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    for (const stop of stops) {
        if (!stop.latitude || !stop.longitude) continue;

        const distance = getDistanceMeters(currentLat, currentLon, stop.latitude, stop.longitude);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { ...stop, distance: Math.round(distance) };
        }
    }

    return nearest;
}

// Check if approaching any stop (within threshold)
export function checkStopProximity(currentLat, currentLon, stops, completedStopIds = [], thresholdMeters = 100) {
    const results = [];

    for (const stop of stops) {
        if (!stop.latitude || !stop.longitude) continue;
        if (completedStopIds.includes(stop.id)) continue; // Skip completed stops

        const distance = getDistanceMeters(currentLat, currentLon, stop.latitude, stop.longitude);
        if (distance <= thresholdMeters) {
            results.push({
                stop,
                distance: Math.round(distance),
                isWithinRange: true,
            });
        }
    }

    return results;
}

// School location detection (for auto-completing PICKUP trips)
// Fetches from school settings API with local caching

const SCHOOL_LOCATION_CACHE_KEY = 'school_location_cache';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache

export async function getSchoolLocation(schoolId, apiBaseUrl = null) {
    if (!schoolId) {
        console.log('No schoolId provided to getSchoolLocation');
        return { latitude: null, longitude: null, radiusMeters: 200 };
    }

    // Check cache first
    try {
        const cachedData = await SecureStore.getItemAsync(`${SCHOOL_LOCATION_CACHE_KEY}_${schoolId}`);
        if (cachedData) {
            const parsed = JSON.parse(cachedData);
            if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_DURATION_MS) {
                console.log('Using cached school location');
                return parsed.location;
            }
        }
    } catch (e) {
        console.log('Cache read error:', e);
    }

    // Fetch from API - try attendance settings first (has geofencing config), then general settings
    try {
        // Get base URL from api.js or use provided one
        const baseUrl = apiBaseUrl;
        const token = await SecureStore.getItemAsync('token');

        // First try attendance admin settings (has geofencing config used by mark API)
        const attendanceResponse = await fetch(`${baseUrl}/schools/${schoolId}/attendance/admin/settings`, {
            headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                'Content-Type': 'application/json',
            },
        });

        if (attendanceResponse.ok) {
            const data = await attendanceResponse.json();
            const config = data.config;

            if (config && config.enableGeoFencing && config.schoolLatitude && config.schoolLongitude) {
                const location = {
                    latitude: config.schoolLatitude,
                    longitude: config.schoolLongitude,
                    radiusMeters: config.allowedRadiusMeters || 500,
                    attendanceRadius: config.allowedRadiusMeters || 500,
                    enableGeoFencing: config.enableGeoFencing,
                };

                // Cache the result
                await SecureStore.setItemAsync(
                    `${SCHOOL_LOCATION_CACHE_KEY}_${schoolId}`,
                    JSON.stringify({ location, timestamp: Date.now() })
                );

                console.log('Fetched school location from attendance settings API:', location);
                return location;
            }
        }

        // Fallback to general settings API
        const response = await fetch(`${baseUrl}/schools/${schoolId}/settings`, {
            headers: {
                'Authorization': token ? `Bearer ${token}` : '',
                'Content-Type': 'application/json',
            },
        });

        if (response.ok) {
            const settings = await response.json();
            const location = {
                latitude: settings.schoolLatitude || null,
                longitude: settings.schoolLongitude || null,
                radiusMeters: settings.geofenceRadius || 200, // Use configured geofence radius
                attendanceRadius: settings.attendanceRadius || 500,
                enableGeoFencing: false, // General settings doesn't have this flag
            };

            // Cache the result
            await SecureStore.setItemAsync(
                `${SCHOOL_LOCATION_CACHE_KEY}_${schoolId}`,
                JSON.stringify({ location, timestamp: Date.now() })
            );

            console.log('Fetched school location from general settings API:', location);
            return location;
        }
    } catch (e) {
        console.error('Error fetching school location from API:', e);
    }

    // Fallback to stored value or defaults
    try {
        const stored = await SecureStore.getItemAsync(`school_location_${schoolId}`);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.error('Error getting stored school location:', e);
    }

    return { latitude: null, longitude: null, radiusMeters: 200 };
}

// Clear school location cache (call when settings are updated)
export async function clearSchoolLocationCache(schoolId) {
    try {
        if (schoolId) {
            await SecureStore.deleteItemAsync(`${SCHOOL_LOCATION_CACHE_KEY}_${schoolId}`);
        }
        console.log('Cleared school location cache');
    } catch (e) {
        console.error('Error clearing school location cache:', e);
    }
}

// Check if driver is near school using configured radius
export function isNearSchool(currentLat, currentLon, schoolLat, schoolLon, radiusMeters = 200) {
    if (!schoolLat || !schoolLon) return false;
    const distance = getDistanceMeters(currentLat, currentLon, schoolLat, schoolLon);
    return distance <= radiusMeters;
}

// Calculate ETA based on distance and speed
export function calculateETA(distanceMeters, speedMps) {
    if (!distanceMeters || !speedMps || speedMps <= 0) return null;

    // Minimum speed to avoid unrealistic ETAs (walking speed ~1.4 m/s)
    const effectiveSpeed = Math.max(speedMps, 5); // At least ~18 km/h
    const seconds = distanceMeters / effectiveSpeed;
    const minutes = Math.ceil(seconds / 60);

    return {
        minutes,
        arrivalTime: new Date(Date.now() + minutes * 60 * 1000).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
        }),
    };
}

// Store completed stops in SecureStore
export async function markStopCompleted(tripId, stopId) {
    try {
        const key = `trip_${tripId}_completed_stops`;
        const stored = await SecureStore.getItemAsync(key);
        const completedStops = stored ? JSON.parse(stored) : [];

        if (!completedStops.includes(stopId)) {
            completedStops.push(stopId);
            await SecureStore.setItemAsync(key, JSON.stringify(completedStops));
        }

        return completedStops;
    } catch (e) {
        console.error('Error marking stop completed:', e);
        return [];
    }
}

export async function getCompletedStops(tripId) {
    try {
        const key = `trip_${tripId}_completed_stops`;
        const stored = await SecureStore.getItemAsync(key);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        return [];
    }
}

export async function clearCompletedStops(tripId) {
    try {
        const key = `trip_${tripId}_completed_stops`;
        await SecureStore.deleteItemAsync(key);
    } catch (e) {
        console.error('Error clearing completed stops:', e);
    }
}

// Check if all stops are completed
export function areAllStopsCompleted(stops, completedStopIds) {
    if (!stops || stops.length === 0) return false;
    return stops.every(stop => completedStopIds.includes(stop.id));
}

// Get next uncompleted stop
export function getNextStop(stops, completedStopIds) {
    if (!stops || stops.length === 0) return null;
    return stops.find(stop => !completedStopIds.includes(stop.id)) || null;
}

// Format distance for display
export function formatDistance(meters) {
    if (meters < 1000) {
        return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
}
