// Smart ETA service with aggressive cost optimization:
// - Distance-based throttling: only call API when bus moved 100m+
// - Near/far threshold: only use Google API within 3km of target
// - 30s debounce per target stop for API calls
// - 15s cache TTL for all ETA results
// - Multi-tier fallback: Google Distance Matrix → GPS speed → Haversine

import { fetchDistanceMatrix, isGoogleMapsAvailable } from './google-maps-service';
import { getDistanceMeters } from './geofence-service';

// ---- Cost control constants ----
const API_CALL_DEBOUNCE_MS = 30000;       // Min 30s between API calls per stop
const ETA_CACHE_TTL_MS = 15000;           // Cache ETA results for 15s
const NEAR_STOP_THRESHOLD_M = 3000;       // Only use Google API within 3km
const MIN_MOVEMENT_FOR_RECALC_M = 100;    // Only recalculate if bus moved 100m+

// ---- Internal state ----
const lastApiCallMap = new Map();          // stopId → timestamp of last API call
const etaCache = new Map();               // stopId → { result, timestamp }
const lastBusPositionMap = new Map();      // stopId → { latitude, longitude }

/**
 * Calculate ETA from bus location to a target stop
 * Uses aggressive cost optimisation:
 * - Returns cached result if bus hasn't moved 100m+
 * - Only calls Google API when bus is within 3km of target
 * - Falls back to speed-based / haversine estimation otherwise
 * 
 * @param {{latitude, longitude, speed?: number}} busLocation - Current bus position (speed in m/s)
 * @param {{latitude, longitude, id: string}} targetStop - Target stop
 * @param {boolean} forceRefresh - Bypass cache/throttle (use sparingly)
 * @returns {Promise<{etaMinutes: number, distance: number, source: string}>}
 */
export async function calculateETA(busLocation, targetStop, forceRefresh = false) {
    if (!busLocation?.latitude || !targetStop?.latitude) {
        return { etaMinutes: -1, distance: 0, source: 'unknown' };
    }

    const cacheKey = targetStop.id;

    // --- Gate 1: Cache check ---
    if (!forceRefresh) {
        const cached = etaCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < ETA_CACHE_TTL_MS) {
            return cached.result;
        }
    }

    // --- Gate 2: Movement check (skip recalc if bus barely moved) ---
    if (!forceRefresh) {
        const lastPos = lastBusPositionMap.get(cacheKey);
        if (lastPos) {
            const moved = getDistanceMeters(
                lastPos.latitude, lastPos.longitude,
                busLocation.latitude, busLocation.longitude
            );
            if (moved < MIN_MOVEMENT_FOR_RECALC_M) {
                const cached = etaCache.get(cacheKey);
                if (cached) return cached.result;
            }
        }
    }

    // Track bus position for movement gating
    lastBusPositionMap.set(cacheKey, {
        latitude: busLocation.latitude,
        longitude: busLocation.longitude,
    });

    // Calculate straight-line distance to target (needed for all tiers)
    const straightLineDistance = getDistanceMeters(
        busLocation.latitude, busLocation.longitude,
        targetStop.latitude, targetStop.longitude
    );

    let result;

    // --- Tier 1: Google Distance Matrix (ONLY if near + debounce passed) ---
    const isNearStop = straightLineDistance <= NEAR_STOP_THRESHOLD_M;
    const canCallApi = isNearStop
        && isGoogleMapsAvailable()
        && _canCallApi(cacheKey);

    if (canCallApi) {
        try {
            const dmResult = await fetchDistanceMatrix(
                { latitude: busLocation.latitude, longitude: busLocation.longitude },
                { latitude: targetStop.latitude, longitude: targetStop.longitude }
            );

            if (dmResult) {
                _markApiCalled(cacheKey);
                result = {
                    etaMinutes: Math.round((dmResult.durationInTraffic || dmResult.duration) / 60),
                    distance: dmResult.distance,
                    source: 'google',
                };
            }
        } catch (err) {
            console.warn('[ETA] Google API failed, falling back:', err.message);
        }
    }

    // --- Tier 2: Speed-based estimation (GPS speed available) ---
    if (!result && busLocation.speed && busLocation.speed > 0.5) {
        const roadDistance = straightLineDistance * 1.3; // Road factor
        const etaSeconds = roadDistance / busLocation.speed;

        result = {
            etaMinutes: Math.round(etaSeconds / 60),
            distance: Math.round(roadDistance),
            source: 'speed',
        };
    }

    // --- Tier 3: Haversine with average school-bus speed (25 km/h) ---
    if (!result) {
        const roadDistance = straightLineDistance * 1.3;
        const AVG_SPEED_MPS = 25 * 1000 / 3600; // ~6.94 m/s
        const etaSeconds = roadDistance / AVG_SPEED_MPS;

        result = {
            etaMinutes: Math.round(etaSeconds / 60),
            distance: Math.round(roadDistance),
            source: 'haversine',
        };
    }

    // Clamp to reasonable range
    result.etaMinutes = Math.max(0, Math.min(result.etaMinutes, 180));

    // Cache result
    etaCache.set(cacheKey, { result, timestamp: Date.now() });

    return result;
}

/**
 * Calculate ETA using Directions API leg data (no extra API call needed)
 * Uses the pre-fetched leg durations from the trip-start Directions call
 * 
 * @param {{latitude, longitude, speed?: number}} busLocation 
 * @param {Array} legs - Legs from Directions API (already cached)
 * @param {number} currentLegIndex - Index of the current leg
 * @param {{latitude, longitude, id: string}} nextStop
 * @returns {Promise<{etaMinutes: number, distance: number, source: string}>}
 */
export async function calculateLegETA(busLocation, legs, currentLegIndex, nextStop) {
    // Use pre-fetched leg data → NO additional API call
    if (legs?.length > currentLegIndex) {
        const leg = legs[currentLegIndex];
        const legDuration = leg.durationInTraffic || leg.duration; // seconds

        const distToEnd = getDistanceMeters(
            busLocation.latitude, busLocation.longitude,
            leg.endLocation.latitude, leg.endLocation.longitude
        );
        const legDistance = leg.distance;

        // Fraction of leg remaining
        const fractionRemaining = Math.min(1, distToEnd / Math.max(legDistance, 1));
        const etaSeconds = legDuration * fractionRemaining;

        return {
            etaMinutes: Math.max(1, Math.round(etaSeconds / 60)),
            distance: Math.round(distToEnd),
            source: 'route-leg', // Free: uses cached Directions data
        };
    }

    return calculateETA(busLocation, nextStop);
}

/**
 * Format ETA minutes into human-readable string
 * @param {number} minutes
 * @returns {string}
 */
export function formatETA(minutes) {
    if (minutes < 0) return '--';
    if (minutes === 0) return 'Arriving';
    if (minutes <= 1) return '1 min';
    if (minutes < 60) return `${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
}

/**
 * Get ETA status category for UI styling
 * @param {number} minutes
 * @returns {'arriving' | 'soon' | 'normal' | 'far' | 'unknown'}
 */
export function getETAStatus(minutes) {
    if (minutes < 0) return 'unknown';
    if (minutes <= 2) return 'arriving';
    if (minutes <= 10) return 'soon';
    if (minutes <= 30) return 'normal';
    return 'far';
}

/**
 * Detect if the bus is significantly delayed
 * @param {Date|string} scheduledTime
 * @param {number} etaMinutes
 * @param {number} thresholdMinutes
 * @returns {{isDelayed: boolean, delayMinutes: number}}
 */
export function detectDelay(scheduledTime, etaMinutes, thresholdMinutes = 10) {
    if (!scheduledTime || etaMinutes < 0) {
        return { isDelayed: false, delayMinutes: 0 };
    }

    const scheduled = new Date(scheduledTime);
    const now = new Date();
    const minutesPastSchedule = (now.getTime() - scheduled.getTime()) / 60000;

    if (minutesPastSchedule < 0) {
        return { isDelayed: false, delayMinutes: 0 };
    }

    const totalDelay = minutesPastSchedule + etaMinutes;
    const isDelayed = totalDelay > thresholdMinutes;

    return {
        isDelayed,
        delayMinutes: isDelayed ? Math.round(totalDelay) : 0,
    };
}

/**
 * Clear all ETA caches (call when trip ends)
 */
export function clearETACache() {
    etaCache.clear();
    lastApiCallMap.clear();
    lastBusPositionMap.clear();
}

// Alias for component cleanup (used by active-trip.js and bus-tracking.js)
export const resetETAState = clearETACache;

// --- Private helpers ---

function _canCallApi(stopId) {
    const lastCall = lastApiCallMap.get(stopId);
    if (!lastCall) return true;
    return Date.now() - lastCall > API_CALL_DEBOUNCE_MS;
}

function _markApiCalled(stopId) {
    lastApiCallMap.set(stopId, Date.now());
}
