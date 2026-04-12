export const HOME_CACHE_CONFIG = {
    STATIC: {
        staleTime: 1000 * 60 * 10,
        gcTime: 1000 * 60 * 60,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    },
    MODERATE: {
        staleTime: 1000 * 60 * 15,
        gcTime: 1000 * 60 * 60,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    },
    REALTIME: {
        staleTime: 1000 * 60 * 2,
        gcTime: 1000 * 60 * 30,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
    },
};
