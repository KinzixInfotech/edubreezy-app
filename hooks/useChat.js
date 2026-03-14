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
    return useQuery({
        queryKey: [...chatKeys.conversations(schoolId), params],
        queryFn: () => chatService.getConversations(schoolId, params),
        enabled: !!schoolId,
        staleTime: 1000 * 30, // 30 seconds — chats change frequently
    });
};

export const useConversation = (schoolId, conversationId) => {
    return useQuery({
        queryKey: chatKeys.conversation(schoolId, conversationId),
        queryFn: () => chatService.getConversation(schoolId, conversationId),
        enabled: !!schoolId && !!conversationId,
    });
};

// ── Messages (cursor-based infinite query) ──

export const useMessages = (schoolId, conversationId) => {
    return useInfiniteQuery({
        queryKey: chatKeys.messages(schoolId, conversationId),
        queryFn: ({ pageParam }) =>
            chatService.getMessages(schoolId, conversationId, {
                cursor: pageParam,
                limit: 30,
            }),
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
        enabled: !!schoolId && !!conversationId,
        staleTime: 0, // Messages always fresh — realtime handles updates
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
        mutationFn: ({ schoolId, conversationId, body }) =>
            chatService.sendMessage(schoolId, conversationId, body),

        // Optimistic update — add message to cache immediately
        onMutate: async ({ schoolId, conversationId, body, tempId, currentUser }) => {
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
                replyTo: null,
                createdAt: new Date().toISOString(),
            };

            qc.setQueryData(queryKey, (old) => {
                if (!old?.pages?.length) return old;
                const newPages = [...old.pages];
                newPages[0] = {
                    ...newPages[0],
                    messages: [optimisticMessage, ...newPages[0].messages],
                };
                return { ...old, pages: newPages };
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
