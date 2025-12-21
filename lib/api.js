// lib/api.js
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

// const api = axios.create({ baseURL: 'https://www.edubreezy.com/api' });
const api = axios.create({ baseURL: 'http://10.115.223.78:3000/api' });

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

export default api;
