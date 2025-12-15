// hooks/useUser.js
import { useQuery } from '@tanstack/react-query';
import fetchUser from '../../lib/queries/user'
export const useUser = (userId, token) => {
    // console.log(userId,token,'from hook');

    return useQuery({
        queryKey: ['user', userId],
        queryFn: () => fetchUser({ userId, token }),
        enabled: !!userId && !!token, // only runs when both exist
    });
};



