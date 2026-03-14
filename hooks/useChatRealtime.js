// ============================================
// CHAT REALTIME - Supabase Realtime subscription for live messages
// ============================================

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { chatKeys } from './useChat';

/**
 * Subscribe to real-time message changes for a specific conversation.
 * Automatically updates the React Query cache when new messages arrive
 * or existing messages are updated (e.g. soft-deleted).
 *
 * @param {string} schoolId - Current school ID
 * @param {string} conversationId - ID of the conversation to watch
 * @param {object} options
 * @param {boolean} options.enabled - Whether the subscription should be active
 */
export function useChatRealtime(schoolId, conversationId, { enabled = true } = {}) {
    const qc = useQueryClient();
    const channelRef = useRef(null);

    useEffect(() => {
        if (!enabled || !conversationId || !schoolId) return;

        const channel = supabase
            .channel(`chat:${conversationId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'Message',
                    filter: `conversationId=eq.${conversationId}`,
                },
                (payload) => {
                    const newMessage = payload.new;
                    const queryKey = chatKeys.messages(schoolId, conversationId);

                    // Prepend new message to the first page of the infinite query
                    qc.setQueryData(queryKey, (old) => {
                        if (!old?.pages?.length) return old;

                        // Check if message already exists (e.g. from optimistic update)
                        const exists = old.pages.some((page) =>
                            page.messages.some((msg) => msg.id === newMessage.id)
                        );
                        if (exists) return old;

                        const formatted = {
                            id: newMessage.id,
                            conversationId: newMessage.conversationId,
                            senderId: newMessage.senderId,
                            sender: null, // Will be populated on next refetch
                            content: newMessage.deletedAt ? null : newMessage.content,
                            attachments: newMessage.deletedAt ? null : newMessage.attachments,
                            isDeleted: !!newMessage.deletedAt,
                            status: newMessage.status || 'SENT',
                            replyTo: null,
                            createdAt: newMessage.createdAt,
                            updatedAt: newMessage.updatedAt,
                            _isRealtime: true, // Flag for sender lookup
                        };

                        const newPages = [...old.pages];
                        newPages[0] = {
                            ...newPages[0],
                            messages: [formatted, ...newPages[0].messages],
                        };
                        return { ...old, pages: newPages };
                    });

                    // Also invalidate conversations list to update last message preview
                    qc.invalidateQueries({ queryKey: chatKeys.conversations(schoolId) });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'Message',
                    filter: `conversationId=eq.${conversationId}`,
                },
                (payload) => {
                    const updated = payload.new;
                    const queryKey = chatKeys.messages(schoolId, conversationId);

                    qc.setQueryData(queryKey, (old) => {
                        if (!old?.pages) return old;
                        return {
                            ...old,
                            pages: old.pages.map((page) => ({
                                ...page,
                                messages: page.messages.map((msg) => {
                                    if (msg.id !== updated.id) return msg;
                                    return {
                                        ...msg,
                                        content: updated.deletedAt ? null : (updated.content ?? msg.content),
                                        isDeleted: !!updated.deletedAt,
                                        deletedAt: updated.deletedAt,
                                        status: updated.status || msg.status,
                                    };
                                }),
                            })),
                        };
                    });
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'Message',
                    filter: `conversationId=eq.${conversationId}`,
                },
                (payload) => {
                    const deletedId = payload.old.id;
                    const queryKey = chatKeys.messages(schoolId, conversationId);

                    qc.setQueryData(queryKey, (old) => {
                        if (!old?.pages) return old;
                        return {
                            ...old,
                            pages: old.pages.map((page) => ({
                                ...page,
                                messages: page.messages.filter((msg) => msg.id !== deletedId),
                            })),
                        };
                    });
                }
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [conversationId, schoolId, enabled, qc]);
}
