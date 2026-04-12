import { useCallback, useState } from 'react';
import { getHomeRefreshKeys } from './refreshPolicy';

export function useHomeRefresh({
    queryClient,
    loadUser,
    role,
    schoolId,
    userId,
    parentId,
    transportStaffId,
}) {
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(async (options = {}) => {
        setRefreshing(true);
        try {
            const refreshKeys = getHomeRefreshKeys({
                role,
                schoolId,
                userId,
                parentId,
                selectedChildId: options.selectedChildId,
                transportStaffId,
            });

            await Promise.all(
                refreshKeys.map((queryKey) =>
                    queryClient.invalidateQueries({ queryKey, refetchType: 'active' })
                )
            );

            await loadUser(true);
        } catch (error) {
            console.error('Refresh failed:', error);
        } finally {
            setRefreshing(false);
        }
    }, [loadUser, parentId, queryClient, role, schoolId, transportStaffId, userId]);

    return {
        refreshing,
        onRefresh,
    };
}
