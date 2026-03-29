// ============================================
// CHAT REALTIME - Supabase Realtime subscription for live messages
// Room-based channels: room created when user subscribes
// ============================================

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { chatKeys } from './useChat';
import { getCachedUser } from '../services/chatService';

/**
 * Subscribe to real-time message changes for a specific conversation.
 * Creates a room channel per conversation — the room is created when
 * the user subscribes and destroyed on cleanup.
 *
 * Automatically updates the React Query cache when new messages arrive
 * or existing messages are updated/deleted.
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

        // Create a room channel for this conversation
        // Room is auto-created on subscribe, auto-destroyed on removeChannel
        const channel = supabase
            .channel(`chat-room:${conversationId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'Message',
                    filter: `conversationId=eq.${conversationId}`,
                },
                async (payload) => {
                    const newMessage = payload.new;
                    const queryKey = chatKeys.messages(schoolId, conversationId);

                    // Fetch sender info from cache or Supabase
                    let sender = null;
                    try {
                        sender = await getCachedUser(newMessage.senderId);
                    } catch (e) {
                        console.warn('Failed to fetch sender for realtime message:', e);
                    }

                    // Prepend new message to the first page of the infinite query
                    qc.setQueryData(queryKey, (old) => {
                        if (!old?.pages?.length) return old;

                        // Check if message already exists (e.g. from optimistic update)
                        const exists = old.pages.some((page) =>
                            page.messages.some((msg) => msg.id === newMessage.id)
                        );

                        if (exists) {
                            // Replace optimistic message with real one (adds sender info)
                            return {
                                ...old,
                                pages: old.pages.map((page) => ({
                                    ...page,
                                    messages: page.messages.map((msg) =>
                                        msg.id === newMessage.id
                                            ? {
                                                ...msg,
                                                sender: sender || msg.sender,
                                                status: newMessage.status || 'SENT',
                                                _isRealtime: true,
                                                isUploading: false,
                                            }
                                            : msg
                                    ),
                                })),
                            };
                        }

                        const formatted = {
                            id: newMessage.id,
                            conversationId: newMessage.conversationId,
                            senderId: newMessage.senderId,
                            sender,
                            content: newMessage.deletedAt ? null : newMessage.content,
                            attachments: newMessage.deletedAt ? null : newMessage.attachments,
                            isDeleted: !!newMessage.deletedAt,
                            status: newMessage.status || 'SENT',
                            replyTo: null,
                            createdAt: newMessage.createdAt,
                            updatedAt: newMessage.updatedAt,
                            _isRealtime: true,
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
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Chat Realtime] Room subscribed: chat-room:${conversationId}`);
                }
            });

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [conversationId, schoolId, enabled, qc]);
}
