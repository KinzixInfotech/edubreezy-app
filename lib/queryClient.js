// lib/queryClient.js
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnMount: false, // Prevent re-fetch on back navigation
            staleTime: 1000 * 60 * 5, // 5 minutes - data is fresh
            gcTime: 1000 * 60 * 30, // 30 minutes - keep data in cache during navigation
        },
    },
});
