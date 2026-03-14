// ============================================
// TYPING INDICATOR - Supabase Realtime Presence
// Throttled start (2s) + Debounced stop (3s)
// ============================================

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const THROTTLE_MS = 2000;   // Max 1 typing broadcast per 2 seconds
const DEBOUNCE_MS = 3000;   // Auto-stop typing after 3 seconds of inactivity

/**
 * Hook for typing indicator using Supabase Realtime Presence.
 *
 * @param {string} conversationId - The conversation to track typing in
 * @param {object} currentUser - { id, name } of the current user
 * @param {object} options
 * @param {boolean} options.enabled - Whether the hook is active
 * @returns {{ sendTyping: () => void, stopTyping: () => void, typingUsers: Array<{userId: string, name: string}> }}
 */
export function useTypingIndicator(conversationId, currentUser, { enabled = true } = {}) {
    const [typingUsers, setTypingUsers] = useState([]);
    const channelRef = useRef(null);
    const lastBroadcastRef = useRef(0);       // Throttle tracker
    const debounceTimerRef = useRef(null);     // Debounce timer for auto-stop
    const isTrackingRef = useRef(false);       // Whether we're currently tracking as typing

    // ── Join Presence channel ──
    useEffect(() => {
        if (!enabled || !conversationId || !currentUser?.id) return;

        const channel = supabase.channel(`typing:${conversationId}`, {
            config: { presence: { key: currentUser.id } },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const users = [];
                for (const [key, presences] of Object.entries(state)) {
                    if (key !== currentUser.id && presences.length > 0) {
                        const p = presences[0];
                        if (p.isTyping) {
                            users.push({ userId: key, name: p.name || 'Someone' });
                        }
                    }
                }
                setTypingUsers(users);
            })
            .on('presence', { event: 'leave' }, ({ key }) => {
                setTypingUsers(prev => prev.filter(u => u.userId !== key));
            })
            .subscribe();

        channelRef.current = channel;

        return () => {
            // Cleanup
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
            if (channelRef.current) {
                channelRef.current.untrack();
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
            isTrackingRef.current = false;
            setTypingUsers([]);
        };
    }, [conversationId, currentUser?.id, enabled]);

    // ── Send typing (throttled) ──
    const sendTyping = useCallback(() => {
        if (!channelRef.current || !currentUser?.id) return;

        const now = Date.now();

        // Throttle: only broadcast if enough time has passed
        if (now - lastBroadcastRef.current >= THROTTLE_MS) {
            lastBroadcastRef.current = now;

            channelRef.current.track({
                isTyping: true,
                name: typeof currentUser.name === 'string'
                    ? currentUser.name
                    : currentUser.name?.name || '',
                timestamp: now,
            });
            isTrackingRef.current = true;
        }

        // Debounce: reset the auto-stop timer on every keystroke
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(() => {
            if (channelRef.current && isTrackingRef.current) {
                channelRef.current.track({ isTyping: false });
                isTrackingRef.current = false;
            }
        }, DEBOUNCE_MS);
    }, [currentUser?.id, currentUser?.name]);

    // ── Stop typing (immediate) ──
    const stopTyping = useCallback(() => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        if (channelRef.current && isTrackingRef.current) {
            channelRef.current.track({ isTyping: false });
            isTrackingRef.current = false;
        }
    }, []);

    return { sendTyping, stopTyping, typingUsers };
}
