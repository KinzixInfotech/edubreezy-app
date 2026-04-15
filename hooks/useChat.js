// ============================================
// CHAT HOOKS - React Query hooks for chat data
// ============================================

import { Alert } from 'react-native';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import * as chatService from '../services/chatService';

// ── Query Keys ──
export const chatKeys = {
    all: ['chat'],
    conversations: (schoolId) => ['chat', 'conversations', schoolId],
    conversationsFeed: (schoolId, params = {}) => ['chat', 'conversations', schoolId, 'feed', params],
    conversation: (schoolId, id) => ['chat', 'conversation', schoolId, id],
    messages: (schoolId, conversationId) => ['chat', 'messages', schoolId, conversationId],
    eligibleUsers: (schoolId) => ['chat', 'eligible-users', schoolId],
};

// ── Conversations ──

export const useConversations = (schoolId, params = {}) => {
    const { userId, limit = 20, ...restParams } = params;
    return useInfiniteQuery({
        queryKey: chatKeys.conversationsFeed(schoolId, { userId, limit, ...restParams }),
        queryFn: ({ pageParam = 1 }) => chatService.getConversations(schoolId, { ...restParams, userId, limit, page: pageParam }),
        initialPageParam: 1,
        getNextPageParam: (lastPage) => {
            const page = lastPage?.pagination?.page ?? 1;
            const totalPages = lastPage?.pagination?.totalPages ?? 0;
            return page < totalPages ? page + 1 : undefined;
        },
        enabled: !!schoolId && !!userId,
        staleTime: 0, // Always fetch latest when returning to chat list
    });
};

export const useConversation = (schoolId, conversationId, userId) => {
    return useQuery({
        queryKey: chatKeys.conversation(schoolId, conversationId),
        queryFn: () => chatService.getConversation(schoolId, conversationId, { userId }),
        enabled: !!schoolId && !!conversationId && !!userId,
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

const mapConversationCache = (old, updater) => {
    if (!old) return old;

    if (Array.isArray(old?.pages)) {
        return {
            ...old,
            pages: old.pages.map((page) => ({
                ...page,
                conversations: updater(page.conversations || []),
            })),
        };
    }

    if (Array.isArray(old?.conversations)) {
        return {
            ...old,
            conversations: updater(old.conversations),
        };
    }

    return old;
};

const getConversationPreviewText = (message) => {
    if (message?.content?.trim()) return message.content.trim();
    if (message?.attachments?.length) {
        return message.attachments.length === 1 ? 'Attachment' : `${message.attachments.length} attachments`;
    }
    return 'New message';
};

const normalizeSentMessage = (result) => {
    if (!result) return null;
    if (result.message) return result.message;
    if (result.data?.message) return result.data.message;
    if (result.data && result.data.id) return result.data;
    if (result.id) return result;
    return null;
};

export const updateConversationPreviewCaches = (qc, schoolId, conversationId, message, options = {}) => {
    const lastMessageAt = message?.createdAt || new Date().toISOString();
    const lastMessageText = getConversationPreviewText(message);
    const currentUserId = options.currentUserId || null;
    const senderId = message?.senderId || null;
    const unreadIncrement = senderId && currentUserId && senderId !== currentUserId ? 1 : 0;

    qc.setQueriesData({ queryKey: chatKeys.conversations(schoolId) }, (old) => {
        return mapConversationCache(old, (conversations) =>
            sortConversationsByLastMessage(
                conversations.map((conversation) =>
                    conversation.id === conversationId
                        ? {
                            ...conversation,
                            lastMessageAt,
                            lastMessageText,
                            unreadCount: unreadIncrement
                                ? (conversation.unreadCount || 0) + unreadIncrement
                                : conversation.unreadCount,
                        }
                        : conversation
                )
            )
        );
    });

    qc.setQueryData(chatKeys.conversation(schoolId, conversationId), (old) => {
        if (!old?.conversation) return old;
        return {
            ...old,
            conversation: {
                ...old.conversation,
                lastMessageAt,
                lastMessageText,
            },
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

                chatService.sendMessagePersist(schoolId, conversationId, {
                    _directMessageId: message.id,
                    content: body.content || '',
                    attachments: body.attachments,
                    replyToId: body.replyToId,
                }).catch((persistError) => {
                    console.error('[chat] direct send persisted side-effects failed:', persistError);
                });

                return { success: true, message };
            } catch (supabaseError) {
                console.warn('[chat] direct Supabase send failed, falling back to API send:', supabaseError);
                if (__DEV__) {
                    Alert.alert(
                        'Direct Supabase Send Failed',
                        supabaseError?.message || 'Unknown error'
                    );
                }
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

            updateConversationPreviewCaches(qc, schoolId, conversationId, optimisticMessage, {
                currentUserId: currentUser?.id,
            });

            return { previous, previousConversationQueries, queryKey };
        },

        // Replace optimistic message with real message from Supabase
        onSuccess: (result, { schoolId, conversationId, tempId, currentUser }) => {
            const realMsg = normalizeSentMessage(result);
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

            updateConversationPreviewCaches(qc, schoolId, conversationId, realMsg, {
                currentUserId: currentUser?.id,
            });
        },

        onError: (error, _vars, context) => {
            console.error('[chat] send message failed:', error);
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
            const previousQueries = qc.getQueriesData({ queryKey: chatKeys.conversations(schoolId) });

            // Optimistically set unreadCount to 0 for this conversation
            qc.setQueriesData({ queryKey: chatKeys.conversations(schoolId) }, (old) => {
                return mapConversationCache(old, (conversations) =>
                    conversations.map((c) =>
                        c.id === conversationId ? { ...c, unreadCount: 0 } : c
                    )
                );
            });

            return { previousQueries, schoolId };
        },

        // Rollback on error
        onError: (_err, _vars, context) => {
            if (context?.previousQueries?.length) {
                context.previousQueries.forEach(([key, data]) => {
                    qc.setQueryData(key, data);
                });
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
