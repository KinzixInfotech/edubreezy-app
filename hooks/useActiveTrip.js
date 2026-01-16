
import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import * as Notifications from 'expo-notifications';
import { isBackgroundTaskRunning, getActiveTrip } from '../lib/transport-location-task';

export function useActiveTrip() {
    const router = useRouter();
    const [localActiveTrip, setLocalActiveTrip] = useState(null);
    const [isChecking, setIsChecking] = useState(true);

    // Check for stored active trip on mount
    useEffect(() => {
        checkStoredTrip();
    }, []);

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

    // Verify trip status with API
    const { data: verifiedTrip, refetch: verifyTrip } = useQuery({
        queryKey: ['verify-active-trip', localActiveTrip?.tripId],
        queryFn: async () => {
            if (!localActiveTrip?.tripId) return null;
            try {
                const res = await api.get(`/schools/transport/trips/${localActiveTrip.tripId}`);
                const trip = res.data.trip;

                // If trip is no longer in progress, clean up
                if (trip.status !== 'IN_PROGRESS') {
                    await SecureStore.deleteItemAsync('activeTrip');
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
        refetchInterval: 30000, // Check every 30s
    });

    const resumeTrip = useCallback(() => {
        if (localActiveTrip?.tripId) {
            router.push({
                pathname: '/(screens)/transport/active-trip',
                params: { tripId: localActiveTrip.tripId }
            });
        }
    }, [localActiveTrip, router]);

    return {
        activeTrip: localActiveTrip,
        verifiedTrip,
        isChecking,
        resumeTrip,
        refreshTrip: checkStoredTrip
    };
}
