// ============================================
// PRESENCE STATUS - Online/Offline tracking via Supabase Presence
// Heartbeat is handled globally in ChatContext — NOT here
// ============================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Presence hook to track who is online via Supabase Presence channels.
 * 
 * NOTE: Heartbeat API is managed in ChatContext (single global interval).
 * This hook only manages Supabase Presence for real-time online status.
 * 
 * @param {string} schoolId - The school to track presence for
 * @param {object} currentUser - { id, name } of current user
 * @returns {{ onlineUsers: Set<string>, isUserOnline: (userId: string) => boolean, getLastSeen: (userId: string) => string|null }}
 */
export function usePresenceStatus(schoolId, currentUser) {
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const channelRef = useRef(null);
    // Track when users were last seen (leave timestamp)
    const lastSeenMapRef = useRef({});
    const [lastSeenVersion, setLastSeenVersion] = useState(0);

    // ── Supabase Presence ──
    useEffect(() => {
        if (!schoolId || !currentUser?.id) return;

        const channel = supabase.channel(`school_presence:${schoolId}`, {
            config: { presence: { key: currentUser.id } },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const onlineIds = new Set(Object.keys(state));
                setOnlineUsers(onlineIds);
            })
            .on('presence', { event: 'join' }, ({ key }) => {
                setOnlineUsers(prev => new Set([...prev, key]));
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
                // Record the leave time so "last seen" can be shown in real-time
                lastSeenMapRef.current[key] = new Date().toISOString();
                setLastSeenVersion(v => v + 1);
                setOnlineUsers(prev => {
                    const next = new Set(prev);
                    next.delete(key);
                    return next;
                });
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        id: currentUser.id,
                        online_at: new Date().toISOString(),
                    });
                }
            });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [schoolId, currentUser?.id]);

    const isUserOnline = useCallback((userId) => {
        return onlineUsers.has(userId);
    }, [onlineUsers]);

    const getLastSeen = useCallback((userId) => {
        return lastSeenMapRef.current[userId] || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lastSeenVersion]);

    return { onlineUsers, isUserOnline, getLastSeen };
}
