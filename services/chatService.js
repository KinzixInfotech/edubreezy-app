// ============================================
// CHAT SERVICE - Direct Supabase for reads + writes
// Realtime features powered by Supabase postgres_changes
// ============================================

import api from '../lib/api';
import { supabase } from '../lib/supabase';

// ── In-memory user cache ──
const userCache = new Map();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getCachedUser(userId) {
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.ts < USER_CACHE_TTL) return cached.data;

    const { data, error } = await supabase
        .from('User')
        .select('id, name, profilePicture')
        .eq('id', userId)
        .single();

    if (!error && data) {
        userCache.set(userId, { data, ts: Date.now() });
    }
    return data || null;
}

export function primeUserCache(users) {
    for (const u of users) {
        if (u?.id) userCache.set(u.id, { data: u, ts: Date.now() });
    }
}

// ── Conversations (Direct Supabase) ──

export const getConversations = async (schoolId, params = {}) => {
    const userId = params.userId;
    if (!userId) throw new Error('userId is required for getConversations');

    // Step 1: Get my active participant records
    const { data: participantRows, error: pError } = await supabase
        .from('ConversationParticipant')
        .select('id, conversationId, role, mutedUntil, lastReadAt, lastReadMsgId, isActive')
        .eq('userId', userId)
        .eq('isActive', true);

    if (pError) {
        console.error('[chatService] getConversations participants error:', pError);
        throw pError;
    }

    if (!participantRows?.length) {
        return { success: true, conversations: [], pagination: { page: 1, limit: 50, total: 0 } };
    }

    const conversationIds = participantRows.map(r => r.conversationId);

    // Step 2: Fetch the conversations themselves
    const { data: conversations, error: cError } = await supabase
        .from('Conversation')
        .select('id, schoolId, type, title, classId, sectionId, lastMessageAt, lastMessageText, createdAt')
        .in('id', conversationIds);

    if (cError) {
        console.error('[chatService] getConversations conversations error:', cError);
        throw cError;
    }

    // Filter by schoolId
    const schoolConversations = (conversations || []).filter(c => c.schoolId === schoolId);
    if (!schoolConversations.length) {
        return { success: true, conversations: [], pagination: { page: 1, limit: 50, total: 0 } };
    }

    const schoolConvIds = schoolConversations.map(c => c.id);
    const convMap = Object.fromEntries(schoolConversations.map(c => [c.id, c]));

    // Step 3: Get all participants for display names & avatars
    const { data: allParticipants } = await supabase
        .from('ConversationParticipant')
        .select('conversationId, userId, isActive')
        .in('conversationId', schoolConvIds)
        .eq('isActive', true);

    // Fetch user details for all participant userIds
    const allUserIds = [...new Set((allParticipants || []).map(p => p.userId))];
    const { data: users } = await supabase
        .from('User')
        .select('id, name, profilePicture, roleId, lastSeenAt')
        .in('id', allUserIds);

    // Fetch roles
    const roleIds = [...new Set((users || []).filter(u => u.roleId).map(u => u.roleId))];
    let roleMap = {};
    if (roleIds.length) {
        const { data: roles } = await supabase.from('Role').select('id, name').in('id', roleIds);
        roleMap = Object.fromEntries((roles || []).map(r => [r.id, r.name]));
    }

    // Build user map & prime cache
    const userMap = {};
    for (const u of (users || [])) {
        userMap[u.id] = { ...u, roleName: roleMap[u.roleId] || null };
        userCache.set(u.id, { data: { id: u.id, name: u.name, profilePicture: u.profilePicture }, ts: Date.now() });
    }

    // Fetch class/section info for teaching staff
    const teachingStaffIds = Object.values(userMap)
        .filter(u => u.roleName === 'TEACHING_STAFF')
        .map(u => u.id);

    let teacherClassMap = {};
    if (teachingStaffIds.length) {
        const { data: sections } = await supabase
            .from('Section')
            .select('teachingStaffUserId, name, classId')
            .in('teachingStaffUserId', teachingStaffIds);

        if (sections?.length) {
            const classIds = [...new Set(sections.map(s => s.classId).filter(Boolean))];
            let classMap = {};
            if (classIds.length) {
                const { data: classes } = await supabase
                    .from('Class')
                    .select('id, className')
                    .in('id', classIds);
                classMap = Object.fromEntries((classes || []).map(c => [c.id, c.className]));
            }
            for (const s of sections) {
                const className = classMap[s.classId] || '';
                const label = className && s.name ? `Class ${className} - ${s.name}` : className ? `Class ${className}` : '';
                if (label && s.teachingStaffUserId) {
                    // If teacher has multiple sections, concatenate
                    if (teacherClassMap[s.teachingStaffUserId]) {
                        if (!teacherClassMap[s.teachingStaffUserId].includes(label)) {
                            teacherClassMap[s.teachingStaffUserId] += `, ${label}`;
                        }
                    } else {
                        teacherClassMap[s.teachingStaffUserId] = label;
                    }
                }
            }
        }
    }

    // Build participant lookup by conversation
    const participantsByConv = {};
    for (const p of (allParticipants || [])) {
        if (!participantsByConv[p.conversationId]) participantsByConv[p.conversationId] = [];
        participantsByConv[p.conversationId].push(p);
    }

    // Step 4: Get unread counts in parallel
    const myParticipantMap = Object.fromEntries(participantRows.map(p => [p.conversationId, p]));

    const unreadPromises = schoolConvIds.map(async (convId) => {
        const myP = myParticipantMap[convId];
        if (!myP) return { convId, count: 0 };

        let query = supabase
            .from('Message')
            .select('id', { count: 'exact', head: true })
            .eq('conversationId', convId)
            .neq('senderId', userId)
            .is('deletedAt', null);

        if (myP.lastReadAt) {
            query = query.gt('createdAt', myP.lastReadAt);
        }

        const { count } = await query;
        return { convId, count: count || 0 };
    });

    const unreadResults = await Promise.all(unreadPromises);
    const unreadMap = Object.fromEntries(unreadResults.map(r => [r.convId, r.count]));

    // Step 5: Format conversations
    const formatted = schoolConvIds.map(convId => {
        const conv = convMap[convId];
        const myP = myParticipantMap[convId];
        const convParticipants = participantsByConv[convId] || [];
        const otherParticipants = convParticipants.filter(cp => cp.userId !== userId && cp.isActive);

        // Display name
        let displayName = conv.title;
        if (!displayName) {
            if (conv.type === 'TEACHER_CLASS') {
                displayName = 'Class Chat';
            } else {
                displayName = otherParticipants
                    .map(cp => userMap[cp.userId]?.name || 'Unknown')
                    .join(', ') || 'Chat';
            }
        }

        const isMuted = myP?.mutedUntil ? new Date(myP.mutedUntil) > new Date() : false;

        return {
            id: conv.id,
            type: conv.type,
            title: displayName,
            classId: conv.classId,
            sectionId: conv.sectionId,
            lastMessageAt: conv.lastMessageAt,
            lastMessageText: conv.lastMessageText,
            createdAt: conv.createdAt,
            isMuted,
            mutedUntil: myP?.mutedUntil,
            unreadCount: unreadMap[convId] || 0,
            participants: otherParticipants.map(cp => ({
                id: cp.userId,
                name: userMap[cp.userId]?.name,
                profilePicture: userMap[cp.userId]?.profilePicture,
                role: userMap[cp.userId]?.roleName,
                classSection: teacherClassMap[cp.userId] || null,
                lastSeenAt: userMap[cp.userId]?.lastSeenAt || null,
            })),
        };
    });

    // Sort by lastMessageAt descending
    formatted.sort((a, b) => {
        if (!a.lastMessageAt && !b.lastMessageAt) return 0;
        if (!a.lastMessageAt) return 1;
        if (!b.lastMessageAt) return -1;
        return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
    });

    return {
        success: true,
        conversations: formatted,
        pagination: { page: 1, limit: params.limit || 50, total: formatted.length },
    };
};

/**
 * Get a single conversation detail.
 */
export const getConversation = async (schoolId, conversationId) => {
    const { data } = await api.get(`/schools/${schoolId}/chat/conversations/${conversationId}`);
    return data;
};

/**
 * Delete (hide) a conversation for the current user.
 * Uses the API route which has proper DB write permissions.
 */
export const deleteConversation = async (schoolId, conversationId) => {
    const { data } = await api.delete(`/schools/${schoolId}/chat/conversations/${conversationId}`);
    return data;
};

/**
 * Create a new conversation.
 */
export const createConversation = async (schoolId, body) => {
    const { data } = await api.post(`/schools/${schoolId}/chat/conversations`, body);
    return data;
};

// ── Messages (Direct Supabase — no FK joins, separate user lookups) ──

export const getMessages = async (schoolId, conversationId, params = {}) => {
    const { cursor, limit = 30 } = params;

    let query = supabase
        .from('Message')
        .select('id, conversationId, senderId, content, attachments, replyToId, status, deletedAt, createdAt, updatedAt')
        .eq('conversationId', conversationId)
        .is('deletedAt', null)
        .order('createdAt', { ascending: false })
        .limit(limit + 1); // +1 to check if there are more

    if (cursor) {
        query = query.lt('createdAt', cursor);
    }

    const { data: rawMessages, error } = await query;

    if (error) {
        console.error('[chatService] getMessages error:', error);
        throw error;
    }

    if (!rawMessages?.length) {
        return { messages: [], nextCursor: null };
    }

    // Check if there are more pages
    const hasMore = rawMessages.length > limit;
    const messagesToReturn = hasMore ? rawMessages.slice(0, limit) : rawMessages;

    // Collect unique sender IDs and replyTo IDs
    const senderIds = [...new Set(messagesToReturn.map(m => m.senderId).filter(Boolean))];
    const replyToIds = [...new Set(messagesToReturn.map(m => m.replyToId).filter(Boolean))];

    // Fetch senders (check cache first, then batch-fetch the rest)
    const uncachedSenderIds = senderIds.filter(id => {
        const cached = userCache.get(id);
        return !cached || Date.now() - cached.ts >= USER_CACHE_TTL;
    });

    if (uncachedSenderIds.length) {
        const { data: senders } = await supabase
            .from('User')
            .select('id, name, profilePicture')
            .in('id', uncachedSenderIds);

        for (const s of (senders || [])) {
            userCache.set(s.id, { data: s, ts: Date.now() });
        }
    }

    // Fetch reply-to messages
    let replyMap = {};
    if (replyToIds.length) {
        const { data: replyMsgs } = await supabase
            .from('Message')
            .select('id, content, senderId')
            .in('id', replyToIds);

        for (const r of (replyMsgs || [])) {
            const replySender = userCache.get(r.senderId);
            replyMap[r.id] = {
                id: r.id,
                content: r.content,
                senderName: replySender?.data?.name || 'Unknown',
            };
        }
    }

    // Format messages
    const messages = messagesToReturn.map(msg => {
        const sender = userCache.get(msg.senderId);
        return {
            id: msg.id,
            conversationId: msg.conversationId,
            senderId: msg.senderId,
            content: msg.content,
            attachments: msg.attachments ? (typeof msg.attachments === 'string' ? JSON.parse(msg.attachments) : msg.attachments) : [],
            status: msg.status,
            isDeleted: !!msg.deletedAt,
            createdAt: msg.createdAt,
            updatedAt: msg.updatedAt,
            sender: sender?.data ? {
                id: sender.data.id,
                name: sender.data.name,
                profilePicture: sender.data.profilePicture,
            } : null,
            replyTo: msg.replyToId ? (replyMap[msg.replyToId] || null) : null,
        };
    });

    // Keep DESC order (newest first) — the inverted FlatList expects this
    const nextCursor = hasMore ? messagesToReturn[messagesToReturn.length - 1].createdAt : null;

    return { messages, nextCursor };
};

// ── Send Message (Direct Supabase + Fire-and-forget API) ──

export const sendMessageDirect = async ({ conversationId, senderId, content, attachments, replyToId }) => {
    const row = {
        conversationId,
        senderId,
        content: content || null,
        attachments: attachments?.length ? JSON.stringify(attachments) : null,
        replyToId: replyToId || null,
        status: 'SENT',
    };

    const { data, error } = await supabase
        .from('Message')
        .insert(row)
        .select('id, conversationId, senderId, content, attachments, replyToId, status, createdAt, updatedAt')
        .single();

    if (error) throw error;
    return data;
};

export const sendMessagePersist = async (schoolId, conversationId, body) => {
    const { data } = await api.post(
        `/schools/${schoolId}/chat/conversations/${conversationId}/messages`,
        body
    );
    return data;
};

export const sendMessage = async (schoolId, conversationId, body) => {
    const { data } = await api.post(
        `/schools/${schoolId}/chat/conversations/${conversationId}/messages`,
        body
    );
    return data;
};

// ── Other Operations (API-based for auth/notifications) ──

export const deleteMessage = async (schoolId, messageId) => {
    const { data } = await api.delete(`/schools/${schoolId}/chat/messages/${messageId}`);
    return data;
};

export const markAsRead = async (schoolId, conversationId, body = {}) => {
    const { data } = await api.put(
        `/schools/${schoolId}/chat/conversations/${conversationId}/read`,
        body
    );
    return data;
};

export const muteConversation = async (schoolId, conversationId, body) => {
    const { data } = await api.put(
        `/schools/${schoolId}/chat/conversations/${conversationId}/mute`,
        body
    );
    return data;
};

export const leaveConversation = async (schoolId, conversationId) => {
    const { data } = await api.delete(`/schools/${schoolId}/chat/conversations/${conversationId}`);
    return data;
};

export const getEligibleUsers = async (schoolId, refresh = false) => {
    const url = refresh ? `/schools/${schoolId}/chat/eligible-users?refresh=true` : `/schools/${schoolId}/chat/eligible-users`;
    const { data } = await api.get(url);
    return data;
};

export const sendHeartbeat = async () => {
    const { data } = await api.post('/users/heartbeat');
    return data;
};

export const markAsDelivered = async (schoolId, conversationId) => {
    const { data } = await api.put(`/schools/${schoolId}/chat/conversations/${conversationId}/deliver`);
    return data;
};
