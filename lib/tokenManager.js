// lib/tokenManager.js
// Handles automatic token refresh and keeps stored tokens synced

import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';
import { updateProfileSession, clearProfileSession, getCurrentSchool, getProfilesForSchool } from './profileManager';

let isRefreshing = false;
let authListener = null;

/**
 * Initialize token sync - call this once when app starts
 * Sets up listener to keep stored tokens in sync with Supabase session
 */
export function initTokenSync() {
    if (authListener) {
        console.log('ℹ️ Token sync already initialized');
        return;
    }

    console.log('🔄 Initializing token sync...');

    authListener = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('🔑 Auth event:', event);

        if (event === 'TOKEN_REFRESHED' && session) {
            console.log('✅ Token auto-refreshed, syncing to storage...');
            await syncSessionToStorage(session);
        } else if (event === 'SIGNED_IN' && session) {
            console.log('✅ Signed in, syncing tokens...');
            await syncSessionToStorage(session);
        } else if (event === 'SIGNED_OUT') {
            console.log('🚪 Signed out, clearing token from SecureStore');
            await SecureStore.deleteItemAsync('token');
        }
    });

    return authListener;
}

/**
 * Sync current session tokens to SecureStore and profile storage
 */
async function syncSessionToStorage(session) {
    try {
        if (!session?.access_token) return;

        // Store in SecureStore for API calls
        await SecureStore.setItemAsync('token', session.access_token);
        console.log('✅ Token synced to SecureStore');

        // Also update the profile's stored tokens
        const currentSchool = await getCurrentSchool();
        if (currentSchool?.schoolCode) {
            const userStr = await SecureStore.getItemAsync('user');
            if (userStr) {
                const user = JSON.parse(userStr);
                const userId = user.id || user.userId;
                if (userId) {
                    await updateProfileSession(currentSchool.schoolCode, userId, {
                        access_token: session.access_token,
                        refresh_token: session.refresh_token,
                    });
                    console.log('✅ Profile tokens synced');
                }
            }
        }
    } catch (error) {
        console.error('Error syncing session to storage:', error);
    }
}

/**
 * Proactively refresh the current session if needed
 * Call this when app comes to foreground or on app start
 */
export async function refreshSessionIfNeeded() {
    if (isRefreshing) {
        console.log('⏳ Already refreshing, skipping...');
        return;
    }

    try {
        isRefreshing = true;
        console.log('🔄 Checking if session needs refresh...');

        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
            console.error('Error getting session:', error);
            return null;
        }

        if (!session) {
            console.log('ℹ️ No active session');
            return null;
        }

        // Check if token expires within next 5 minutes
        const expiresAt = session.expires_at * 1000; // Convert to ms
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (expiresAt - now < fiveMinutes) {
            console.log('⚠️ Token expiring soon, refreshing proactively...');

            const { data, error: refreshError } = await supabase.auth.refreshSession();

            if (refreshError) {
                console.error('❌ Proactive refresh failed:', refreshError.message);
                return null;
            }

            console.log('✅ Session refreshed proactively');
            if (data?.session) {
                await syncSessionToStorage(data.session);
            }
            return data?.session;
        } else {
            console.log('✅ Session still valid, no refresh needed');
            // Still sync the current token
            await SecureStore.setItemAsync('token', session.access_token);
            return session;
        }
    } catch (error) {
        console.error('Error in refreshSessionIfNeeded:', error);
        return null;
    } finally {
        isRefreshing = false;
    }
}

/**
 * Try to restore a session from stored profile tokens
 * Uses the stored refresh token to get a fresh access token
 * Returns true if successful, false if login needed
 */
export async function tryRestoreSession(schoolCode, profile) {
    if (!profile?.sessionTokens?.refresh_token) {
        console.log('ℹ️ No stored refresh token to restore');
        return { success: false, needsLogin: true };
    }

    try {
        console.log('🔄 Attempting to restore session for:', profile.email);
        console.log('🔑 Using stored refresh token to get new access token...');

        // Try to refresh with the stored token
        // refreshSession can work with just a refresh token parameter
        const { data, error } = await supabase.auth.refreshSession({
            refresh_token: profile.sessionTokens.refresh_token,
        });

        if (error) {
            console.error('❌ Session restore failed:', error.message);

            // Check if token is permanently invalid
            const isTokenInvalid =
                error.message?.includes('Already Used') ||
                error.message?.includes('Invalid Refresh Token') ||
                error.message?.includes('expired') ||
                error.message?.includes('invalid_grant') ||
                error.message?.includes('Refresh Token Not Found') ||
                error.message?.includes('Token has been revoked');

            if (isTokenInvalid) {
                // Clear the bad tokens from the profile
                await clearProfileSession(schoolCode, profile.userId);
                console.log('🗑️ Cleared invalid refresh token from profile');
            }

            return { success: false, needsLogin: true, email: profile.email };
        }

        // Success! We now have a fresh session with new access token
        if (data?.session) {
            console.log('✅ New access token obtained successfully');

            // Sync the new tokens to SecureStore and profile storage
            await syncSessionToStorage(data.session);

            // Update the profile's stored tokens with the new refresh token
            // (Supabase rotates refresh tokens on each use for security)
            await updateProfileSession(schoolCode, profile.userId, {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
            });

            console.log('✅ Session restored and tokens synced');
        }

        return { success: true, session: data.session };
    } catch (error) {
        console.error('❌ Error restoring session:', error);
        return { success: false, needsLogin: true, email: profile.email };
    }
}

/**
 * Cleanup - call when app is closing
 */
export function cleanupTokenSync() {
    if (authListener) {
        authListener.data?.subscription?.unsubscribe();
        authListener = null;
        console.log('🧹 Token sync cleaned up');
    }
}
