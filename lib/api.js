// lib/api.js
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const api = axios.create({ baseURL: 'https://www.edubreezy.com/api/' });
// const api = axios.create({ baseURL: 'http://192.0.0.2:3000/api/' });


api.interceptors.request.use(async (config) => {
    const token = await SecureStore.getItemAsync('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

export default api;