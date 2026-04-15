// ============================================
// CHAT REALTIME - Supabase Realtime subscription for live messages
// Room-based channels: room created when user subscribes
// ============================================

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { chatKeys, updateConversationPreviewCaches } from './useChat';
import { getCachedUser } from '../services/chatService';

const normalizeAttachments = (attachments) => {
    if (!attachments) return [];
    if (Array.isArray(attachments)) return attachments;
    if (typeof attachments === 'string') {
        try {
            return JSON.parse(attachments);
        } catch {
            return [];
        }
    }
    return [];
};

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
export function useChatRealtime(schoolId, conversationId, { enabled = true, currentUserId } = {}) {
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

                    // Populate replyTo if available
                    let replyTo = null;
                    if (newMessage.replyToId) {
                        try {
                            const pages = qc.getQueryData(queryKey)?.pages;
                            let cachedReplyMsg = null;
                            if (pages) {
                                for (const page of pages) {
                                    cachedReplyMsg = page.messages?.find(m => m.id === newMessage.replyToId);
                                    if (cachedReplyMsg) break;
                                }
                            }
                            if (cachedReplyMsg) {
                                replyTo = {
                                    id: cachedReplyMsg.id,
                                    content: cachedReplyMsg.content,
                                    senderName: typeof cachedReplyMsg.sender?.name === 'string'
                                        ? cachedReplyMsg.sender.name
                                        : cachedReplyMsg.sender?.name?.name || 'Unknown',
                                };
                            } else {
                                const { data: repliedMsg } = await supabase
                                    .from('Message')
                                    .select('id, content, senderId')
                                    .eq('id', newMessage.replyToId)
                                    .single();
                                if (repliedMsg) {
                                    const repliedSender = await getCachedUser(repliedMsg.senderId);
                                    replyTo = {
                                        id: repliedMsg.id,
                                        content: repliedMsg.content,
                                        senderName: typeof repliedSender?.name === 'string'
                                            ? repliedSender.name
                                            : repliedSender?.name?.name || 'Unknown',
                                    };
                                }
                            }
                        } catch (e) {
                            console.warn('Failed to fetch replyTo for realtime message', e);
                        }
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
                        replyTo,
                        createdAt: newMessage.createdAt,
                        updatedAt: newMessage.updatedAt,
                        _isRealtime: true,
                    };

                    // Prepend new message to the first page of the infinite query
                    qc.setQueryData(queryKey, (old) => {

                        if (!old?.pages?.length) {
                            return {
                                pages: [{
                                    messages: [formatted],
                                    nextCursor: null,
                                }],
                                pageParams: [undefined],
                            };
                        }

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

                        // Production can briefly return a cache/refetch state before the
                        // actual inserted row is visible. Replace a matching optimistic
                        // temp message instead of appending a second copy or letting a
                        // later refetch wipe the local one.
                        const createdAtMs = new Date(newMessage.createdAt).getTime();
                        const optimisticMatch = old.pages
                            .flatMap((page) => page.messages || [])
                            .find((msg) => {
                                if (typeof msg.id !== 'string' || !msg.id.startsWith('temp-')) return false;
                                if (msg.senderId !== newMessage.senderId) return false;
                                if ((msg.content || '') !== (newMessage.content || '')) return false;

                                const msgTime = msg.createdAt ? new Date(msg.createdAt).getTime() : 0;
                                return Math.abs(createdAtMs - msgTime) < 30 * 1000;
                            });

                        if (optimisticMatch) {
                            return {
                                ...old,
                                pages: old.pages.map((page) => ({
                                    ...page,
                                    messages: page.messages.map((msg) =>
                                        msg.id === optimisticMatch.id
                                            ? {
                                                ...msg,
                                                ...formatted,
                                                attachments: formatted.attachments ?? msg.attachments,
                                                replyTo: formatted.replyTo ?? msg.replyTo,
                                                isUploading: false,
                                            }
                                            : msg
                                    ),
                                })),
                            };
                        }

                        const newPages = [...old.pages];
                        newPages[0] = {
                            ...newPages[0],
                            messages: [formatted, ...newPages[0].messages],
                        };
                        return { ...old, pages: newPages };
                    });

                    updateConversationPreviewCaches(qc, schoolId, conversationId, {
                        ...formatted,
                        attachments: normalizeAttachments(formatted.attachments),
                    }, {
                        currentUserId,
                    });
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
    }, [conversationId, schoolId, enabled, qc, currentUserId]);
}

/**
 * Subscribe to real-time message changes across ALL active conversations.
 * Uses a single channel and multiplexes Postgres filters.
 *
 * @param {string} schoolId - Current school ID
 * @param {string} userId - Current user ID
 * @param {Array} conversations - Array of conversation objects the user belongs to
 */
export function useChatFeedRealtime(schoolId, userId, conversations) {
    const qc = useQueryClient();

    useEffect(() => {
        if (!schoolId || !userId || !conversations?.length) return;

        const channelName = `chat-feed:${userId}`;
        const channel = supabase.channel(channelName);

        // Add a listener for each conversation's new messages
        conversations.forEach((c) => {
            channel.on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'Message',
                    filter: `conversationId=eq.${c.id}`,
                },
                async (payload) => {
                    const newMessage = payload.new;

                    const queryKey = chatKeys.messages(schoolId, c.id);

                    // Try to populate sender
                    let sender = null;
                    try {
                        sender = await getCachedUser(newMessage.senderId);
                    } catch (e) {}

                    const formatted = {
                        id: newMessage.id,
                        conversationId: newMessage.conversationId,
                        senderId: newMessage.senderId,
                        sender: sender || { id: newMessage.senderId, name: 'Unknown' },
                        content: newMessage.deletedAt ? null : newMessage.content,
                        attachments: newMessage.deletedAt ? null : newMessage.attachments,
                        isDeleted: !!newMessage.deletedAt,
                        status: newMessage.status || 'SENT',
                        replyTo: null, // Basic feed injection doesn't need deep replyTo logic as it will bg-refetch anyway
                        createdAt: newMessage.createdAt,
                        updatedAt: newMessage.updatedAt,
                        _isRealtime: true,
                    };

                    // Optimistically inject into the messages cache so it's there before we even open the screen!
                    qc.setQueryData(queryKey, (old) => {
                        if (!old?.pages?.length) return old;

                        // Check if already in cache
                        const exists = old.pages.some(p => p.messages?.some(m => m.id === newMessage.id));
                        if (exists) return old;

                        const newPages = [...old.pages];
                        newPages[0] = {
                            ...newPages[0],
                            messages: [formatted, ...(newPages[0].messages || [])],
                        };
                        return { ...old, pages: newPages };
                    });

                    updateConversationPreviewCaches(qc, schoolId, c.id, {
                        ...formatted,
                        attachments: normalizeAttachments(formatted.attachments),
                    }, {
                        currentUserId: userId,
                    });
                }
            );
        });

        channel.subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [schoolId, userId, conversations, qc]);
}
