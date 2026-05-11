/**
 * useRealtimeLocation — Subscribe to live vehicle location via Supabase Realtime.
 *
 * Replaces HTTP polling (refetchInterval: 10000) with Postgres Changes subscription.
 * The driver's location update API writes to VehicleLocation; Supabase Realtime
 * broadcasts each UPDATE to all subscribers instantly.
 *
 * Reads the latest row once from Supabase for first paint, then streams updates.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabase';

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

    const normalizeLocation = useCallback((row) => {
        if (!row) return null;
        return {
            latitude: row.latitude,
            longitude: row.longitude,
            speed: row.speed,
            heading: row.heading,
            accuracy: row.accuracy,
            status: row.status,
            timestamp: row.timestamp || row.updatedAt || row.createdAt,
            vehicleId: row.vehicleId,
            tripId: row.tripId,
        };
    }, []);

    // Initial fetch reads Supabase directly; live updates are still Realtime-only.
    const fetchInitialLocation = useCallback(async () => {
        if (!vehicleId || !enabled) return;
        try {
            const { data, error: queryError } = await supabase
                .from('VehicleLocation')
                .select('*')
                .eq('vehicleId', vehicleId)
                .order('timestamp', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (queryError) throw queryError;

            const loc = normalizeLocation(data);
            if (loc) {
                setLocation(loc);
                setLastUpdate(loc.timestamp ? new Date(loc.timestamp) : new Date());
            }
        } catch (err) {
            console.warn('[RealtimeLocation] Initial Supabase fetch failed:', err.message);
            setError(err);
        }
    }, [vehicleId, enabled, normalizeLocation]);

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
                    const loc = normalizeLocation(payload.new);
                    if (loc) {
                        setLocation(loc);
                        setLastUpdate(loc.timestamp ? new Date(loc.timestamp) : new Date());
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
                    const loc = normalizeLocation(payload.new);
                    if (loc) {
                        setLocation(loc);
                        setLastUpdate(loc.timestamp ? new Date(loc.timestamp) : new Date());
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
    }, [vehicleId, enabled, fetchInitialLocation, normalizeLocation]);

    // Re-subscribe when app comes back to foreground
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (
                appStateRef.current.match(/inactive|background/) &&
                nextAppState === 'active'
            ) {
                console.log('[RealtimeLocation] App foregrounded — Supabase Realtime remains the source of truth');
            }
            appStateRef.current = nextAppState;
        });

        return () => subscription?.remove();
    }, [fetchInitialLocation]);

    // Manual refetch
    const refetch = useCallback(() => {
        return fetchInitialLocation();
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
