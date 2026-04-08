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
        // Realtime is the source of truth while a room is open. Background
        // refetches can overwrite optimistic messages before the inserted row
        // becomes visible on production infrastructure.
        staleTime: 30 * 1000,
        refetchOnMount: false,
        refetchOnReconnect: false,
        refetchOnWindowFocus: false,
    });
};

// ── Eligible Users ──

export const useEligibleUsers = (schoolId) => {
    return useQuery({
        queryKey: chatKeys.eligibleUsers(schoolId),
        queryFn: () => chatService.getEligibleUsers(schoolId),
        enabled: !!schoolId,
        staleTime: Infinity, // never auto-refresh from cache mount, manual refresh only
    });
};

export const useRefreshEligibleUsers = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: (schoolId) => chatService.getEligibleUsers(schoolId, true),
        onSuccess: (data, schoolId) => {
            qc.setQueryData(chatKeys.eligibleUsers(schoolId), data);
        },
    });
};

const sortConversationsByLastMessage = (conversations = []) => {
    return [...conversations].sort((a, b) => {
        if (!a.lastMessageAt && !b.lastMessageAt) return 0;
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });
};

const getConversationPreviewText = (message) => {
    if (message?.content?.trim()) return message.content.trim();
    if (message?.attachments?.length) {
        return message.attachments.length === 1 ? 'Attachment' : `${message.attachments.length} attachments`;
    }
    return 'New message';
};

const updateConversationPreviewCaches = (qc, schoolId, conversationId, message) => {
    const lastMessageAt = message?.createdAt || new Date().toISOString();
    const lastMessageText = getConversationPreviewText(message);

    qc.setQueriesData({ queryKey: chatKeys.conversations(schoolId) }, (old) => {
        if (!old?.conversations) return old;

        return {
            ...old,
            conversations: sortConversationsByLastMessage(
                old.conversations.map((conversation) =>
                    conversation.id === conversationId
                        ? {
                            ...conversation,
                            lastMessageAt,
                            lastMessageText,
                        }
                        : conversation
                )
            ),
        };
    });
};

// ── Mutations ──

export const useSendMessage = () => {
    const qc = useQueryClient();

    return useMutation({
        mutationFn: async ({ schoolId, conversationId, body, currentUser }) => {
            try {
                const message = await chatService.sendMessageDirect({
                    conversationId,
                    senderId: currentUser?.id,
                    content: body.content,
                    attachments: body.attachments,
                    replyToId: body.replyToId,
                });

                return { success: true, message };
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
            const previousConversationQueries = qc.getQueriesData({ queryKey: chatKeys.conversations(schoolId) });

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
                if (!old?.pages?.length) {
                    return {
                        pages: [{
                            messages: [optimisticMessage],
                            nextCursor: null,
                        }],
                        pageParams: [undefined],
                    };
                }
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

            updateConversationPreviewCaches(qc, schoolId, conversationId, optimisticMessage);

            return { previous, previousConversationQueries, queryKey };
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
                                    content: realMsg.content ?? msg.content,
                                    attachments: realMsg.attachments ?? msg.attachments,
                                    createdAt: realMsg.createdAt || msg.createdAt,
                                    updatedAt: realMsg.updatedAt || msg.updatedAt,
                                    senderId: realMsg.senderId || msg.senderId,
                                    sender: realMsg.sender || currentUser || msg.sender,
                                    _isRealtime: true,
                                    isUploading: false,
                                    // Preserve replyTo from optimistic message
                                }
                            : msg
                        ),
                    })),
                };
            });

            updateConversationPreviewCaches(qc, schoolId, conversationId, realMsg);
        },

        onError: (_err, _vars, context) => {
            if (context?.previous) {
                qc.setQueryData(context.queryKey, context.previous);
            }
            if (context?.previousConversationQueries?.length) {
                context.previousConversationQueries.forEach(([key, data]) => {
                    qc.setQueryData(key, data);
                });
            }
        },

        onSettled: () => {
            // Realtime is the source of truth while the thread is open. Avoid
            // forced refetches here because they reintroduce the production
            // race that can remove an optimistic bubble before insert visibility
            // catches up across infrastructure.
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
            qc.invalidateQueries({ queryKey: chatKeys.eligibleUsers(schoolId) });
        },
    });
};

export const useMarkAsDelivered = () => {
    return useMutation({
        mutationFn: ({ schoolId, conversationId }) =>
            chatService.markAsDelivered(schoolId, conversationId),
    });
};
