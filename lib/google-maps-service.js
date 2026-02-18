// Google Maps Directions & Distance Matrix API wrapper
// Used for route polyline fetching, ETA calculation, and polyline splitting
//
// COST OPTIMIZATION STRATEGY:
// - Directions API: Called ONCE per trip (on trip start), cached for entire trip
//   Refetch ONLY on significant route deviation (>200m off polyline)
// - Distance Matrix API: Called by eta-service.js with 30s debounce, only within 3km
// - Polyline splitting: Pure math, no API cost
// - Deviation detection: Pure math, no API cost

import Constants from 'expo-constants';

// API key — try multiple sources (native config, extra, process.env)
const GOOGLE_MAPS_API_KEY =
    Constants.expoConfig?.ios?.config?.googleMapsApiKey ||
    Constants.expoConfig?.android?.config?.googleMaps?.apiKey ||
    Constants.expoConfig?.extra?.googleMapsApiKey ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    '';

// Cost control constants
const DEVIATION_THRESHOLD_M = 200; // Refetch route only if bus is >200m off polyline
const MAX_DISTANCE_MATRIX_PER_TRIP = 100; // Hard cap on Distance Matrix calls per trip

// In-memory cache for directions responses per trip
const directionsCache = new Map();
let distanceMatrixCallCount = 0;

/**
 * Decode Google's encoded polyline string to array of {latitude, longitude}
 * @see https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */
export function decodePolyline(encoded) {
    if (!encoded) return [];

    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;

    while (index < encoded.length) {
        let b;
        let shift = 0;
        let result = 0;

        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);

        const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
        lat += dlat;

        shift = 0;
        result = 0;

        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);

        const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
        lng += dlng;

        points.push({
            latitude: lat / 1e5,
            longitude: lng / 1e5,
        });
    }

    return points;
}

/**
 * Fetch route directions from Google Directions API
 * Returns decoded polyline coordinates and leg info (durations/distances)
 * 
 * @param {Array<{latitude, longitude}>} stops - Ordered array of stop coordinates
 * @param {string} [cacheKey] - Optional cache key (e.g., tripId) to avoid re-fetching
 * @returns {Promise<{polyline: Array, legs: Array, totalDuration: number, totalDistance: number} | null>}
 */
export async function fetchRouteDirections(stops, cacheKey = null) {
    if (!GOOGLE_MAPS_API_KEY) {
        console.warn('[GoogleMaps] No API key configured, falling back to straight lines');
        return null;
    }

    if (!stops || stops.length < 2) return null;

    // Check cache
    if (cacheKey && directionsCache.has(cacheKey)) {
        return directionsCache.get(cacheKey);
    }

    try {
        const origin = `${stops[0].latitude},${stops[0].longitude}`;
        const destination = `${stops[stops.length - 1].latitude},${stops[stops.length - 1].longitude}`;

        // Intermediate stops as waypoints
        let waypointsParam = '';
        if (stops.length > 2) {
            const waypoints = stops.slice(1, -1).map(s => `${s.latitude},${s.longitude}`);
            waypointsParam = `&waypoints=${waypoints.join('|')}`;
        }

        const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${destination}${waypointsParam}&mode=driving&departure_time=now&key=${GOOGLE_MAPS_API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK' || !data.routes?.length) {
            console.warn('[GoogleMaps] Directions API error:', data.status, data.error_message);
            return null;
        }

        const route = data.routes[0];
        const polyline = decodePolyline(route.overview_polyline?.points);

        const legs = route.legs.map(leg => ({
            distance: leg.distance?.value || 0, // meters
            duration: leg.duration?.value || 0, // seconds
            durationInTraffic: leg.duration_in_traffic?.value || leg.duration?.value || 0,
            startAddress: leg.start_address,
            endAddress: leg.end_address,
            startLocation: {
                latitude: leg.start_location?.lat,
                longitude: leg.start_location?.lng,
            },
            endLocation: {
                latitude: leg.end_location?.lat,
                longitude: leg.end_location?.lng,
            },
            // Decode each leg's polyline for precise splitting
            polyline: leg.steps?.reduce((acc, step) => {
                return acc.concat(decodePolyline(step.polyline?.points));
            }, []) || [],
        }));

        const totalDuration = legs.reduce((sum, leg) => sum + leg.duration, 0);
        const totalDistance = legs.reduce((sum, leg) => sum + leg.distance, 0);

        const result = { polyline, legs, totalDuration, totalDistance };

        // Cache result
        if (cacheKey) {
            directionsCache.set(cacheKey, result);
        }

        return result;
    } catch (error) {
        console.error('[GoogleMaps] Directions API fetch error:', error);
        return null;
    }
}

/**
 * Fetch distance/duration between two points using Distance Matrix API
 * Includes traffic-aware duration when available
 * 
 * COST GUARD: Hard-capped at MAX_DISTANCE_MATRIX_PER_TRIP calls per trip.
 * Caller (eta-service) also enforces 30s debounce + 3km proximity check.
 * 
 * @param {{latitude, longitude}} origin
 * @param {{latitude, longitude}} destination
 * @returns {Promise<{distance: number, duration: number, durationInTraffic: number} | null>}
 */
export async function fetchDistanceMatrix(origin, destination) {
    if (!GOOGLE_MAPS_API_KEY) return null;
    if (!origin?.latitude || !destination?.latitude) return null;

    // Hard cap to prevent runaway costs
    if (distanceMatrixCallCount >= MAX_DISTANCE_MATRIX_PER_TRIP) {
        console.warn('[GoogleMaps] Distance Matrix call limit reached for this trip');
        return null;
    }

    try {
        distanceMatrixCallCount++;

        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.latitude},${origin.longitude}&destinations=${destination.latitude},${destination.longitude}&mode=driving&departure_time=now&key=${GOOGLE_MAPS_API_KEY}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.status !== 'OK') {
            console.warn('[GoogleMaps] Distance Matrix error:', data.status);
            return null;
        }

        const element = data.rows?.[0]?.elements?.[0];
        if (!element || element.status !== 'OK') return null;

        return {
            distance: element.distance?.value || 0, // meters
            duration: element.duration?.value || 0, // seconds
            durationInTraffic: element.duration_in_traffic?.value || element.duration?.value || 0,
        };
    } catch (error) {
        console.error('[GoogleMaps] Distance Matrix fetch error:', error);
        return null;
    }
}

/**
 * Find the closest point on the polyline to a given coordinate
 * Returns the index of the closest point
 */
function findClosestPointIndex(polyline, coord) {
    let minDist = Infinity;
    let closestIdx = 0;

    for (let i = 0; i < polyline.length; i++) {
        const dx = polyline[i].latitude - coord.latitude;
        const dy = polyline[i].longitude - coord.longitude;
        const dist = dx * dx + dy * dy; // Squared distance (no need for sqrt for comparison)
        if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
        }
    }

    return closestIdx;
}

/**
 * Split a polyline into completed and remaining segments based on bus position
 * 
 * @param {Array<{latitude, longitude}>} polyline - Full route polyline
 * @param {{latitude, longitude}} busPosition - Current bus location
 * @returns {{completed: Array, remaining: Array}}
 */
export function splitPolylineAtBusPosition(polyline, busPosition) {
    if (!polyline?.length || !busPosition) {
        return { completed: [], remaining: polyline || [] };
    }

    const closestIdx = findClosestPointIndex(polyline, busPosition);

    // Include bus position as the junction point
    const completed = [
        ...polyline.slice(0, closestIdx + 1),
        { latitude: busPosition.latitude, longitude: busPosition.longitude },
    ];

    const remaining = [
        { latitude: busPosition.latitude, longitude: busPosition.longitude },
        ...polyline.slice(closestIdx + 1),
    ];

    return { completed, remaining };
}

/**
 * Check if the bus has deviated significantly from the cached route
 * If deviation > DEVIATION_THRESHOLD_M, returns true → caller should refetch
 * This is pure math — NO API call.
 * 
 * @param {{latitude, longitude}} busPosition
 * @param {string} cacheKey - Trip cache key
 * @returns {boolean}
 */
export function checkRouteDeviation(busPosition, cacheKey) {
    if (!busPosition || !cacheKey) return false;

    const cached = directionsCache.get(cacheKey);
    if (!cached?.polyline?.length) return false;

    // Find minimum distance from bus to any point on the polyline
    let minDist = Infinity;
    for (let i = 0; i < cached.polyline.length; i++) {
        const dx = cached.polyline[i].latitude - busPosition.latitude;
        const dy = cached.polyline[i].longitude - busPosition.longitude;
        // Approximate meters (1 degree ≈ 111km at equator, good enough for comparison)
        const distApprox = Math.sqrt(dx * dx + dy * dy) * 111000;
        if (distApprox < minDist) minDist = distApprox;
        if (minDist < DEVIATION_THRESHOLD_M) return false; // Early exit: on route
    }

    console.log(`[GoogleMaps] Route deviation detected: ${Math.round(minDist)}m off polyline`);
    return minDist > DEVIATION_THRESHOLD_M;
}

/**
 * Clear the directions cache (call when trip ends)
 * @param {string} [cacheKey] - Specific key to clear, or all if omitted
 */
export function clearDirectionsCache(cacheKey = null) {
    if (cacheKey) {
        directionsCache.delete(cacheKey);
    } else {
        directionsCache.clear();
    }
    // Reset Distance Matrix counter on trip end
    distanceMatrixCallCount = 0;
}

/**
 * Check if the Google Maps API key is available
 */
export function isGoogleMapsAvailable() {
    return !!GOOGLE_MAPS_API_KEY;
}

/**
 * Get current API usage stats (for debugging/monitoring)
 */
export function getApiUsageStats() {
    return {
        distanceMatrixCalls: distanceMatrixCallCount,
        cachedRoutes: directionsCache.size,
        maxDistanceMatrixCalls: MAX_DISTANCE_MATRIX_PER_TRIP,
    };
}
