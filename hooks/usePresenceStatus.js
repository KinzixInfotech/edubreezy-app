// ============================================
// PRESENCE STATUS - Online/Offline tracking
// Supabase Presence + Heartbeat API
// ============================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { sendHeartbeat } from '../services/chatService';

const HEARTBEAT_INTERVAL_MS = 60 * 1000; // 1 minute

/**
 * Global presence hook to track who is online.
 * 
 * @param {string} schoolId - The school to track presence for
 * @param {object} currentUser - { id, name } of current user
 * @returns {{ onlineUsers: Set<string>, isUserOnline: (userId: string) => boolean }}
 */
export function usePresenceStatus(schoolId, currentUser) {
    const [onlineUsers, setOnlineUsers] = useState(new Set());
    const channelRef = useRef(null);

    // ── Heartbeat ──
    useEffect(() => {
        if (!currentUser?.id) return;

        // Immediate heartbeat on mount
        sendHeartbeat().catch(e => console.error('Initial heartbeat failed:', e));

        const interval = setInterval(() => {
            sendHeartbeat().catch(e => console.error('Heartbeat failed:', e));
        }, HEARTBEAT_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [currentUser?.id]);

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

    return { onlineUsers, isUserOnline };
}
