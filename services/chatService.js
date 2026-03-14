// ============================================
// CHAT SERVICE - API wrapper for all chat endpoints
// ============================================

import api from '../lib/api';

/**
 * Get paginated conversation list for the current user.
 * @param {string} schoolId
 * @param {{ page?: number, limit?: number, type?: string }} params
 */
export const getConversations = async (schoolId, params = {}) => {
    const { data } = await api.get(`/schools/${schoolId}/chat/conversations`, { params });
    return data;
};

/**
 * Get a single conversation detail (with participants).
 */
export const getConversation = async (schoolId, conversationId) => {
    const { data } = await api.get(`/schools/${schoolId}/chat/conversations/${conversationId}`);
    return data;
};

/**
 * Create a new conversation.
 * @param {string} schoolId
 * @param {{ type: string, participantUserIds: string[], classId?: number, sectionId?: number, title?: string }} body
 */
export const createConversation = async (schoolId, body) => {
    const { data } = await api.post(`/schools/${schoolId}/chat/conversations`, body);
    return data;
};

/**
 * Get messages for a conversation (cursor-based pagination).
 * @param {string} schoolId
 * @param {string} conversationId
 * @param {{ cursor?: string, limit?: number }} params
 */
export const getMessages = async (schoolId, conversationId, params = {}) => {
    const { data } = await api.get(
        `/schools/${schoolId}/chat/conversations/${conversationId}/messages`,
        { params }
    );
    return data;
};

/**
 * Send a message to a conversation.
 * @param {string} schoolId
 * @param {string} conversationId
 * @param {{ content: string, attachments?: Array, replyToId?: string }} body
 */
export const sendMessage = async (schoolId, conversationId, body) => {
    const { data } = await api.post(
        `/schools/${schoolId}/chat/conversations/${conversationId}/messages`,
        body
    );
    return data;
};

/**
 * Soft-delete a message.
 */
export const deleteMessage = async (schoolId, messageId) => {
    const { data } = await api.delete(`/schools/${schoolId}/chat/messages/${messageId}`);
    return data;
};

/**
 * Mark messages as read in a conversation.
 * @param {string} schoolId
 * @param {string} conversationId
 * @param {{ messageId?: string }} body
 */
export const markAsRead = async (schoolId, conversationId, body = {}) => {
    const { data } = await api.put(
        `/schools/${schoolId}/chat/conversations/${conversationId}/read`,
        body
    );
    return data;
};

/**
 * Mute or unmute a conversation.
 * @param {string} schoolId
 * @param {string} conversationId
 * @param {{ duration: '1h' | '8h' | '1d' | 'forever' | 'unmute' }} body
 */
export const muteConversation = async (schoolId, conversationId, body) => {
    const { data } = await api.put(
        `/schools/${schoolId}/chat/conversations/${conversationId}/mute`,
        body
    );
    return data;
};

/**
 * Leave a conversation (marks participant as inactive).
 */
export const leaveConversation = async (schoolId, conversationId) => {
    const { data } = await api.delete(`/schools/${schoolId}/chat/conversations/${conversationId}`);
    return data;
};

/**
 * Get users the current user is allowed to message.
 */
export const getEligibleUsers = async (schoolId) => {
    const { data } = await api.get(`/schools/${schoolId}/chat/eligible-users`);
    return data;
};
/**
 * Send a heartbeat to update the user's last seen timestamp.
 */
export const sendHeartbeat = async () => {
    const { data } = await api.post('/users/heartbeat');
    return data;
};

/**
 * Mark messages in a conversation as delivered.
 */
export const markAsDelivered = async (schoolId, conversationId) => {
    const { data } = await api.put(`/schools/${schoolId}/chat/conversations/${conversationId}/deliver`);
    return data;
};
