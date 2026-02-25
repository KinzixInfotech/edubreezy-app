/**
 * useRealtimeLocation — Subscribe to live vehicle location via Supabase Realtime.
 *
 * Replaces HTTP polling (refetchInterval: 10000) with Postgres Changes subscription.
 * The driver's location update API writes to VehicleLocation; Supabase Realtime
 * broadcasts each UPDATE to all subscribers instantly.
 *
 * Falls back to initial HTTP fetch for the first load, then streams updates.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';
import api from '../lib/api';

export function useRealtimeLocation(vehicleId, { enabled = true } = {}) {
    const [location, setLocation] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [error, setError] = useState(null);
    const channelRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);

    // Calculate how stale the data is
    const secondsAgo = lastUpdate
        ? Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
        : null;

    // Initial fetch — get latest location from API (fast, cached in Redis)
    const fetchInitialLocation = useCallback(async () => {
        if (!vehicleId || !enabled) return;
        try {
            const res = await api.get(`/schools/transport/location/${vehicleId}`);
            if (res.data?.location) {
                const loc = res.data.location;
                setLocation({
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    speed: loc.speed,
                    heading: loc.heading,
                    accuracy: loc.accuracy,
                    timestamp: loc.timestamp,
                    vehicleId: loc.vehicleId,
                    tripId: loc.tripId,
                });
                setLastUpdate(new Date(loc.timestamp));
            }
        } catch (err) {
            console.warn('[RealtimeLocation] Initial fetch failed:', err.message);
            setError(err);
        }
    }, [vehicleId, enabled]);

    // Subscribe to Supabase Realtime Postgres Changes on VehicleLocation
    useEffect(() => {
        if (!vehicleId || !enabled) return;

        // Fetch initial data
        fetchInitialLocation();

        // Setup Realtime subscription
        const channelName = `vehicle-location-${vehicleId}`;
        const channel = supabase.channel(channelName);

        channel
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'VehicleLocation',
                    filter: `vehicleId=eq.${vehicleId}`,
                },
                (payload) => {
                    const row = payload.new;
                    if (row) {
                        setLocation({
                            latitude: row.latitude,
                            longitude: row.longitude,
                            speed: row.speed,
                            heading: row.heading,
                            accuracy: row.accuracy,
                            timestamp: row.timestamp,
                            vehicleId: row.vehicleId,
                            tripId: row.tripId,
                        });
                        setLastUpdate(new Date(row.timestamp));
                        setError(null);
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'VehicleLocation',
                    filter: `vehicleId=eq.${vehicleId}`,
                },
                (payload) => {
                    const row = payload.new;
                    if (row) {
                        setLocation({
                            latitude: row.latitude,
                            longitude: row.longitude,
                            speed: row.speed,
                            heading: row.heading,
                            accuracy: row.accuracy,
                            timestamp: row.timestamp,
                            vehicleId: row.vehicleId,
                            tripId: row.tripId,
                        });
                        setLastUpdate(new Date(row.timestamp));
                        setError(null);
                    }
                }
            )
            .subscribe((status) => {
                console.log(`[RealtimeLocation] ${channelName} status:`, status);
                setIsConnected(status === 'SUBSCRIBED');
                if (status === 'CHANNEL_ERROR') {
                    setError(new Error('Realtime channel error'));
                }
            });

        channelRef.current = channel;

        return () => {
            console.log(`[RealtimeLocation] Unsubscribing from ${channelName}`);
            supabase.removeChannel(channel);
            channelRef.current = null;
            setIsConnected(false);
        };
    }, [vehicleId, enabled]);

    // Re-subscribe when app comes back to foreground
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (
                appStateRef.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                // App came to foreground — refetch latest + reconnect
                console.log('[RealtimeLocation] App foregrounded — refetching');
                fetchInitialLocation();
            }
            appStateRef.current = nextAppState;
        });

        return () => subscription?.remove();
    }, [fetchInitialLocation]);

    // Manual refetch
    const refetch = useCallback(() => {
        fetchInitialLocation();
    }, [fetchInitialLocation]);

    return {
        location,
        isConnected,
        lastUpdate,
        secondsAgo,
        error,
        refetch,
    };
}
