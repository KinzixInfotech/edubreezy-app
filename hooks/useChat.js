// ============================================
// CHAT HOOKS - React Query hooks for chat data
// ============================================

import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import * as chatService from '../services/chatService';

// ── Query Keys ──
export const chatKeys = {
    all: ['chat'],
    conversations: (schoolId) => ['chat', 'conversations', schoolId],
    conversation: (schoolId, id) => ['chat', 'conversation', schoolId, id],
    messages: (schoolId, conversationId) => ['chat', 'messages', schoolId, conversationId],
    eligibleUsers: (schoolId) => ['chat', 'eligible-users', schoolId],
};

// ── Conversations ──

export const useConversations = (schoolId, params = {}) => {
    const { userId, ...restParams } = params;
    return useQuery({
        queryKey: [...chatKeys.conversations(schoolId), restParams],
        queryFn: () => chatService.getConversations(schoolId, { ...restParams, userId }),
        enabled: !!schoolId && !!userId,
        staleTime: 0, // Always fetch latest when returning to chat list
    });
};

export const useConversation = (schoolId, conversationId) => {
    return useQuery({
        queryKey: chatKeys.conversation(schoolId, conversationId),
        queryFn: () => chatService.getConversation(schoolId, conversationId),
        enabled: !!schoolId && !!conversationId,
    });
};

// ── Messages (cursor-based infinite query — direct Supabase) ──

export const useMessages = (schoolId, conversationId) => {
    return useInfiniteQuery({
        queryKey: chatKeys.messages(schoolId, conversationId),
        queryFn: ({ pageParam }) =>
            chatService.getMessages(schoolId, conversationId, {
                cursor: pageParam,  // createdAt-based cursor from Supabase
                limit: 30,
            }),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        enabled: !!schoolId && !!conversationId,
        staleTime: 0, // Force background refetch when reopening a chat
    });
};

// ── Eligible Users ──

export const useEligibleUsers = (schoolId) => {
    return useQuery({
        queryKey: chatKeys.eligibleUsers(schoolId),
        queryFn: () => chatService.getEligibleUsers(schoolId),
        enabled: !!schoolId,
        staleTime: 1000 * 120, // 2 minutes
    });
};

// ── Mutations ──

export const useSendMessage = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ schoolId, conversationId, body, tempId, currentUser }) => {
            // Phase 1: Direct Supabase insert → triggers realtime instantly
            try {
                const directMsg = await chatService.sendMessageDirect({
                    conversationId,
                    senderId: currentUser?.id,
                    content: body.content,
                    attachments: body.attachments,
                    replyToId: body.replyToId,
                });

                // Phase 2: Fire-and-forget API call for notifications, cache, metadata
                chatService.sendMessagePersist(schoolId, conversationId, {
                    ...body,
                    _directMessageId: directMsg.id, // Tell API this message already exists
                }).catch((err) => {
                    console.warn('Background message persist failed (non-critical):', err.message);
                });

                return { success: true, message: directMsg };
            } catch (supabaseErr) {
                // Fallback: If direct insert fails, use API-only path
                console.warn('Direct Supabase insert failed, falling back to API:', supabaseErr.message);
                return chatService.sendMessage(schoolId, conversationId, body);
            }
        },

        // Optimistic update — add message to cache immediately
        onMutate: async ({ schoolId, conversationId, body, tempId, currentUser, replyToMessage }) => {
            const queryKey = chatKeys.messages(schoolId, conversationId);
            await qc.cancelQueries({ queryKey });

            const previous = qc.getQueryData(queryKey);

            const optimisticMessage = {
                id: tempId,
                conversationId,
                senderId: currentUser?.id,
                sender: currentUser,
                content: body.content,
                attachments: body.attachments || null,
                isDeleted: false,
                status: 'SENDING',
                replyTo: replyToMessage ? {
                    id: replyToMessage.id,
                    content: replyToMessage.content,
                    senderName: replyToMessage.sender?.name || replyToMessage.senderName || 'Unknown',
                } : null,
                createdAt: new Date().toISOString(),
            };

            qc.setQueryData(queryKey, (old) => {
                if (!old?.pages?.length) return old;
                const newPages = [...old.pages];
                const existingIndex = newPages[0].messages.findIndex(m => m.id === tempId);

                if (existingIndex !== -1) {
                    const newMessages = [...newPages[0].messages];
                    newMessages[existingIndex] = { ...newMessages[existingIndex], ...optimisticMessage };
                    newPages[0] = { ...newPages[0], messages: newMessages };
                } else {
                    newPages[0] = {
                        ...newPages[0],
                        messages: [optimisticMessage, ...newPages[0].messages],
                    };
                }
                return { ...old, pages: newPages };
            });

            return { previous, queryKey };
        },

        // Replace optimistic message with real message from Supabase
        onSuccess: (result, { schoolId, conversationId, tempId, currentUser }) => {
            const realMsg = result?.message;
            if (!realMsg || !tempId) return;

            const queryKey = chatKeys.messages(schoolId, conversationId);
            qc.setQueryData(queryKey, (old) => {
                if (!old?.pages) return old;
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        messages: page.messages.map((msg) =>
                            msg.id === tempId
                                ? {
                                    ...msg,
                                    id: realMsg.id,
                                    status: realMsg.status || 'SENT',
                                    createdAt: realMsg.createdAt,
                                    updatedAt: realMsg.updatedAt,
                                    sender: currentUser || msg.sender,
                                    isUploading: false,
                                    // Preserve replyTo from optimistic message
                                }
                                : msg
                        ),
                    })),
                };
            });
        },

        onError: (_err, _vars, context) => {
            if (context?.previous) {
                qc.setQueryData(context.queryKey, context.previous);
            }
        },

        onSettled: (_data, _error, { schoolId, conversationId }) => {
            // Only invalidate conversations list (for last message preview update)
            // Do NOT invalidate messages — realtime handles live updates
            // Invalidating messages causes a full refetch which flashes the skeleton
            setTimeout(() => {
                qc.invalidateQueries({ queryKey: chatKeys.conversations(schoolId) });
            }, 1500);
        },
    });
};

export const useDeleteMessage = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: ({ schoolId, messageId }) =>
            chatService.deleteMessage(schoolId, messageId),

        onMutate: async ({ schoolId, conversationId, messageId }) => {
            const queryKey = chatKeys.messages(schoolId, conversationId);
            await qc.cancelQueries({ queryKey });

            const previous = qc.getQueryData(queryKey);

            qc.setQueryData(queryKey, (old) => {
                if (!old?.pages) return old;
                return {
                    ...old,
                    pages: old.pages.map((page) => ({
                        ...page,
                        messages: page.messages.map((msg) =>
                            msg.id === messageId
                                ? { ...msg, isDeleted: true, content: null, attachments: null }
                                : msg
                        ),
                    })),
                };
            });

            return { previous, queryKey };
        },

        onError: (_err, _vars, context) => {
            if (context?.previous) {
                qc.setQueryData(context.queryKey, context.previous);
            }
        },

        onSettled: (_data, _error, { schoolId, conversationId }) => {
            qc.invalidateQueries({ queryKey: chatKeys.messages(schoolId, conversationId) });
            qc.invalidateQueries({ queryKey: chatKeys.conversations(schoolId) });
        },
    });
};

export const useMuteConversation = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: ({ schoolId, conversationId, duration }) =>
            chatService.muteConversation(schoolId, conversationId, { duration }),

        onSettled: (_data, _error, { schoolId }) => {
            qc.invalidateQueries({ queryKey: chatKeys.conversations(schoolId) });
        },
    });
};

export const useMarkAsRead = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: ({ schoolId, conversationId, messageId }) =>
            chatService.markAsRead(schoolId, conversationId, messageId ? { messageId } : {}),

        // ── Optimistic UI: instantly clear the unread badge ──
        onMutate: async ({ schoolId, conversationId }) => {
            // Cancel any outgoing refetches so they don't overwrite our optimistic update
            await qc.cancelQueries({ queryKey: chatKeys.conversations(schoolId) });

            // Snapshot previous value for rollback
            const previous = qc.getQueryData(chatKeys.conversations(schoolId));

            // Optimistically set unreadCount to 0 for this conversation
            qc.setQueryData(chatKeys.conversations(schoolId), (old) => {
                if (!old?.conversations) return old;
                return {
                    ...old,
                    conversations: old.conversations.map((c) =>
                        c.id === conversationId ? { ...c, unreadCount: 0 } : c
                    ),
                };
            });

            return { previous, schoolId };
        },

        // Rollback on error
        onError: (_err, _vars, context) => {
            if (context?.previous) {
                qc.setQueryData(chatKeys.conversations(context.schoolId), context.previous);
            }
        },

        onSettled: (_data, _error, { schoolId }) => {
            qc.invalidateQueries({ queryKey: chatKeys.conversations(schoolId) });
        },
    });
};

export const useCreateConversation = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: ({ schoolId, body }) =>
            chatService.createConversation(schoolId, body),

        onSettled: (_data, _error, { schoolId }) => {
            qc.invalidateQueries({ queryKey: chatKeys.conversations(schoolId) });
        },
    });
};

export const useLeaveConversation = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: ({ schoolId, conversationId }) =>
            chatService.leaveConversation(schoolId, conversationId),

        onSettled: (_data, _error, { schoolId }) => {
            qc.invalidateQueries({ queryKey: chatKeys.conversations(schoolId) });
        },
    });
};

export const useMarkAsDelivered = () => {
    return useMutation({
        mutationFn: ({ schoolId, conversationId }) =>
            chatService.markAsDelivered(schoolId, conversationId),
    });
};
