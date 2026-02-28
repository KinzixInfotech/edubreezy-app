
import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import * as Notifications from 'expo-notifications';
import { isForegroundTrackingActive, getActiveTrip } from '../lib/transport-location-task';

export function useActiveTrip() {
    const router = useRouter();
    const [localActiveTrip, setLocalActiveTrip] = useState(null);
    const [isChecking, setIsChecking] = useState(true);

    // Check for stored active trip on mount AND validate it's still active
    useEffect(() => {
        validateAndCleanupStaleTrip();
    }, []);

    // Validate stored trip with API - if ended, cleanup foreground tracking
    const validateAndCleanupStaleTrip = async () => {
        try {
            const trip = await getActiveTrip();
            const isTaskRunning = isForegroundTrackingActive();

            console.log('🔍 Checking active trip on startup:', { trip: trip?.tripId, isTaskRunning });

            if (!trip && isTaskRunning) {
                // Foreground tracking running but no stored trip - force stop
                console.log('⚠️ Foreground tracking running without trip data - stopping');
                const { stopForegroundLocationTracking } = require('../lib/transport-location-task');
                await stopForegroundLocationTracking();
                return;
            }

            if (trip) {
                // Validate trip is still IN_PROGRESS via API
                try {
                    const res = await api.get(`/schools/transport/trips/${trip.tripId}`);
                    const apiTrip = res.data.trip;

                    if (apiTrip?.status !== 'IN_PROGRESS') {
                        // Trip has ended - cleanup everything
                        console.log('⚠️ Stored trip is no longer active (status:', apiTrip?.status, ') - cleaning up');
                        const { stopForegroundLocationTracking } = require('../lib/transport-location-task');
                        await stopForegroundLocationTracking();
                        setLocalActiveTrip(null);
                        return;
                    }

                    // Trip is valid and in progress
                    console.log('✅ Active trip validated:', trip.tripId);
                    setLocalActiveTrip(trip);
                } catch (apiError) {
                    // API error (404, network, etc) - trip might not exist
                    console.log('⚠️ Could not validate trip - cleaning up:', apiError.message);
                    const { stopForegroundLocationTracking } = require('../lib/transport-location-task');
                    await stopForegroundLocationTracking();
                    setLocalActiveTrip(null);
                }
            }
        } catch (error) {
            console.error('Error validating stored trip:', error);
        } finally {
            setIsChecking(false);
        }
    };

    const checkStoredTrip = async () => {
        try {
            const trip = await getActiveTrip();
            if (trip) {
                setLocalActiveTrip(trip);
            }
        } catch (error) {
            console.error('Error checking stored trip:', error);
        } finally {
            setIsChecking(false);
        }
    };

    // Listen for notification taps
    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;
            if (data?.type === 'active-trip' && localActiveTrip?.tripId) {
                resumeTrip();
            }
        });
        return () => subscription.remove();
    }, [localActiveTrip, resumeTrip]);

    // Verify trip status with API (only on-demand, no polling)
    const { data: verifiedTrip, refetch: verifyTrip } = useQuery({
        queryKey: ['verify-active-trip', localActiveTrip?.tripId],
        queryFn: async () => {
            if (!localActiveTrip?.tripId) return null;
            try {
                const res = await api.get(`/schools/transport/trips/${localActiveTrip.tripId}`);
                const trip = res.data.trip;

                // If trip is no longer in progress, clean up foreground tracking
                if (trip.status !== 'IN_PROGRESS') {
                    console.log('⚠️ Trip status changed to', trip.status, '- stopping foreground tracking');
                    const { stopForegroundLocationTracking } = require('../lib/transport-location-task');
                    await stopForegroundLocationTracking();
                    setLocalActiveTrip(null);
                    return null;
                }
                return trip;
            } catch (error) {
                console.error('Error verifying trip:', error);
                return null;
            }
        },
        enabled: !!localActiveTrip?.tripId,
        staleTime: Infinity, // Don't auto-refetch
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    });

    const resumeTrip = useCallback(() => {
        if (localActiveTrip?.tripId) {
            router.push({
                pathname: '/(screens)/transport/active-trip',
                params: { tripId: localActiveTrip.tripId }
            });
        }
    }, [localActiveTrip, router]);

    // Force cleanup - can be called to stop any stale foreground tracking
    const forceCleanup = useCallback(async () => {
        try {
            console.log('🧹 Force cleanup triggered');
            const { stopForegroundLocationTracking } = require('../lib/transport-location-task');
            await stopForegroundLocationTracking();
            setLocalActiveTrip(null);
            console.log('✅ Force cleanup completed');
        } catch (error) {
            console.error('Error during force cleanup:', error);
        }
    }, []);

    return {
        activeTrip: localActiveTrip,
        verifiedTrip,
        isChecking,
        resumeTrip,
        refreshTrip: checkStoredTrip,
        forceCleanup
    };
}
