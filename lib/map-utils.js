// Map animation utilities for smooth bus marker movement, heading calculation,
// and region fitting

import { Platform } from 'react-native';

/**
 * Linear interpolation between two coordinates
 * @param {{latitude, longitude}} from - Start position
 * @param {{latitude, longitude}} to - End position
 * @param {number} fraction - 0 to 1 progress
 * @returns {{latitude, longitude}}
 */
export function interpolatePosition(from, to, fraction) {
    if (!from || !to) return to || from || { latitude: 0, longitude: 0 };

    const clampedFraction = Math.max(0, Math.min(1, fraction));

    return {
        latitude: from.latitude + (to.latitude - from.latitude) * clampedFraction,
        longitude: from.longitude + (to.longitude - from.longitude) * clampedFraction,
    };
}

/**
 * Animate a MapView marker smoothly from one position to another
 * Works with both the native Marker.animateMarkerToCoordinate (Android)
 * and manual frame-based animation (iOS)
 * 
 * @param {React.RefObject} markerRef - Ref to MapView.Marker
 * @param {{latitude, longitude}} from - Start position
 * @param {{latitude, longitude}} to - End position  
 * @param {number} duration - Animation duration in ms (default 1000)
 * @param {function} onUpdate - Callback with interpolated position on each frame
 * @returns {function} cancel - Call to cancel the animation
 */
export function animateMarkerMovement(markerRef, from, to, duration = 1000, onUpdate = null) {
    if (!from || !to) return () => { };

    // On Android, use native animation if available
    if (Platform.OS === 'android' && markerRef?.current?.animateMarkerToCoordinate) {
        markerRef.current.animateMarkerToCoordinate(to, duration);
        return () => { };
    }

    // Frame-based animation for iOS and fallback
    const startTime = Date.now();
    let animationFrame;
    let cancelled = false;

    const animate = () => {
        if (cancelled) return;

        const elapsed = Date.now() - startTime;
        const fraction = Math.min(elapsed / duration, 1);

        // Ease-out cubic for smooth deceleration
        const eased = 1 - Math.pow(1 - fraction, 3);
        const position = interpolatePosition(from, to, eased);

        if (onUpdate) {
            onUpdate(position);
        }

        if (fraction < 1) {
            animationFrame = requestAnimationFrame(animate);
        }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => {
        cancelled = true;
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }
    };
}

/**
 * Calculate compass bearing (heading) between two coordinates
 * Used to rotate the bus icon in the direction of travel
 * 
 * @param {{latitude, longitude}} from
 * @param {{latitude, longitude}} to
 * @returns {number} Bearing in degrees (0 = North, 90 = East)
 */
export function calculateBearing(from, to) {
    if (!from || !to) return 0;

    const lat1 = (from.latitude * Math.PI) / 180;
    const lat2 = (to.latitude * Math.PI) / 180;
    const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    const bearing = (Math.atan2(y, x) * 180) / Math.PI;

    // Normalize to 0-360
    return (bearing + 360) % 360;
}

/**
 * Calculate a map region that fits all given coordinates with padding
 * 
 * @param {Array<{latitude, longitude}>} coordinates
 * @param {number} paddingFactor - How much extra space around the edges (default 1.5)
 * @returns {{latitude, longitude, latitudeDelta, longitudeDelta}}
 */
export function getMapRegionForCoordinates(coordinates, paddingFactor = 1.5) {
    if (!coordinates?.length) {
        return {
            latitude: 20.5937,  // Default: India center
            longitude: 78.9629,
            latitudeDelta: 5,
            longitudeDelta: 5,
        };
    }

    if (coordinates.length === 1) {
        return {
            latitude: coordinates[0].latitude,
            longitude: coordinates[0].longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
        };
    }

    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    coordinates.forEach(coord => {
        if (coord.latitude < minLat) minLat = coord.latitude;
        if (coord.latitude > maxLat) maxLat = coord.latitude;
        if (coord.longitude < minLon) minLon = coord.longitude;
        if (coord.longitude > maxLon) maxLon = coord.longitude;
    });

    const latDelta = (maxLat - minLat) * paddingFactor || 0.01;
    const lonDelta = (maxLon - minLon) * paddingFactor || 0.01;

    return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLon + maxLon) / 2,
        latitudeDelta: Math.max(latDelta, 0.005),
        longitudeDelta: Math.max(lonDelta, 0.005),
    };
}

/**
 * Smoothly interpolate bearing (heading) with wrap-around handling
 * Prevents the bus icon from spinning the wrong way when crossing 0/360
 * 
 * @param {number} from - Current bearing in degrees
 * @param {number} to - Target bearing in degrees  
 * @param {number} fraction - 0 to 1
 * @returns {number} Interpolated bearing
 */
export function interpolateBearing(from, to, fraction) {
    let diff = to - from;

    // Take the shortest path around the circle
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    return ((from + diff * fraction) + 360) % 360;
}

/**
 * Generate stop marker style based on stop state
 * 
 * @param {'completed' | 'current' | 'upcoming'} state
 * @returns {{color: string, borderColor: string, icon: string, size: number}}
 */
export function getStopMarkerStyle(state) {
    switch (state) {
        case 'completed':
            return {
                color: '#10B981',       // Green
                borderColor: '#059669',
                icon: '✓',
                size: 28,
                opacity: 0.7,
            };
        case 'current':
            return {
                color: '#F59E0B',       // Amber
                borderColor: '#D97706',
                icon: '●',
                size: 34,
                opacity: 1,
            };
        case 'upcoming':
        default:
            return {
                color: '#6366F1',       // Indigo
                borderColor: '#4F46E5',
                icon: '○',
                size: 26,
                opacity: 0.85,
            };
    }
}

/**
 * Determine stop state based on completion status and next stop index
 * 
 * @param {string} stopId
 * @param {Set|Array} completedStopIds
 * @param {string|null} nextStopId
 */
export function getStopState(stopId, completedStopIds, nextStopId) {
    const completedSet = completedStopIds instanceof Set
        ? completedStopIds
        : new Set(completedStopIds || []);

    if (completedSet.has(stopId)) return 'completed';
    if (stopId === nextStopId) return 'current';
    return 'upcoming';
}
