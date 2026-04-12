import { useCallback, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useFocusEffect } from 'expo-router';

export function useHomeProfile() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const hasInitiallyLoadedRef = useRef(false);

    const loadUser = useCallback(async (forceRefresh = false) => {
        if (hasInitiallyLoadedRef.current && user && !forceRefresh) {
            setLoading(false);
            return;
        }

        try {
            const stored = await SecureStore.getItemAsync('user');
            if (stored) {
                const parsed = JSON.parse(stored);
                setUser(parsed);
                hasInitiallyLoadedRef.current = true;
            }
        } catch (error) {
            console.error('Failed to load user:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const syncStoredUser = useCallback(async () => {
        try {
            const stored = await SecureStore.getItemAsync('user');
            const parsed = stored ? JSON.parse(stored) : null;

            setUser((prev) => {
                if (
                    prev?.id === parsed?.id &&
                    (prev?.schoolId || prev?.school?.id) === (parsed?.schoolId || parsed?.school?.id) &&
                    prev?.role?.name === parsed?.role?.name
                ) {
                    return prev;
                }
                return parsed;
            });

            hasInitiallyLoadedRef.current = true;
            setLoading(false);
        } catch (error) {
            console.error('Failed to sync user:', error);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (!hasInitiallyLoadedRef.current) {
                loadUser();
            } else {
                syncStoredUser();
            }
        }, [loadUser, syncStoredUser])
    );

    return {
        user,
        setUser,
        loading,
        setLoading,
        loadUser,
        syncStoredUser,
        hasInitiallyLoadedRef,
    };
}
