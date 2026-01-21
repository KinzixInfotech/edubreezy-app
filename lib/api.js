import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { supabase } from './supabase';

// const api = axios.create({ baseURL: 'https://www.edubreezy.com/api' });
// const API_BASE_URL = 'https://www.edubreezy.com/api';
export const API_BASE_URL = __DEV__ ? 'http://172.20.10.13:3000/api' : 'https://www.edubreezy.com/api';
console.log(API_BASE_URL);
const api = axios.create({ baseURL: API_BASE_URL });
api.interceptors.request.use(async (config) => {
    let token = null;

    // ALWAYS try to get a fresh token from Supabase first (it auto-refreshes)
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            token = session.access_token;
            // Update SecureStore with fresh token for offline/background use
            await SecureStore.setItemAsync('token', token);
        }
    } catch (e) {
        console.log('Supabase getSession failed, falling back to stored token');
    }

    // Fallback to SecureStore - check both regular and transport tokens
    if (!token) {
        token = await SecureStore.getItemAsync('token');
    }

    // Also check transport staff token (for Driver/Conductor who use custom login)
    if (!token) {
        token = await SecureStore.getItemAsync('transportToken');
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