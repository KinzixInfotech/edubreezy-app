import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { supabase } from './supabase';

// const api = axios.create({ baseURL: 'https://www.edubreezy.com/api' });
const api = axios.create({ baseURL: 'http://192.168.31.232:3000/api' });
api.interceptors.request.use(async (config) => {
    console.log('📡 API Request:', config.method?.toUpperCase(), config.baseURL + config.url);

    // Try to get token from SecureStore first
    let token = await SecureStore.getItemAsync('token');

    // If no token in SecureStore, try supabase session
    if (!token) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            token = session?.access_token;
        } catch (e) {
            // Ignore supabase errors
        }
    }

    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error.response ? error.response.status : null;
        const errorMsg = error.response?.data?.error;
        const url = error.config?.url;

        // Auto-logout if token expired (401) or User deleted from DB (404 User not found)
        // EXCEPTION: Don't auto-logout for /auth/user check - let the caller handle it (e.g. login screen)
        if ((status === 401 || (status === 404 && errorMsg === 'User not found')) && !url?.includes('/auth/user')) {
            console.log('⚠️ Session invalid/expired or User missing. Logging out...');
            try {
                await SecureStore.deleteItemAsync('token');
                await SecureStore.deleteItemAsync('user');
                await supabase.auth.signOut();
                // Navigate to login
                router.replace('/(auth)/login');
            } catch (authErr) {
                console.error('Error during auto-logout:', authErr);
            }
        }
        return Promise.reject(error);
    }
);

export default api;