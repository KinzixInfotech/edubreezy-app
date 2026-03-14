// ============================================
// CHAT ROOM - Message thread screen
// ============================================

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
    View,
    Text,
    FlatList,
    TextInput,
    StyleSheet,
    Image,
    KeyboardAvoidingView,
    Platform,
    ActionSheetIOS,
    Alert,
    ActivityIndicator,
    Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft, Send, Paperclip, MoreVertical,
    X, Clock, Check, CheckCheck,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import HapticTouchable from '../../components/HapticTouch';
import {
    useMessages, useSendMessage, useDeleteMessage,
    useMuteConversation, useMarkAsRead, useLeaveConversation,
    useConversation, useMarkAsDelivered,
} from '../../../hooks/useChat';
import { useChatRealtime } from '../../../hooks/useChatRealtime';
import { useTypingIndicator } from '../../../hooks/useTypingIndicator';
import { usePresenceStatus } from '../../../hooks/usePresenceStatus';
import { useShimmer, Bone } from '../../components/ScreenSkeleton';
import { StatusBar } from 'expo-status-bar';

// ── Helpers ──
function getDateLabel(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today - msgDate) / (1000 * 60 * 60 * 24);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const diffMins = Math.floor((Date.now() - d) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── Skeleton ──
function ChatRoomSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ flex: 1, padding: 16, gap: 16 }}>
            {Array.from({ length: 6 }).map((_, i) => {
                const isRight = i % 3 === 0;
                return (
                    <View key={i} style={{ alignItems: isRight ? 'flex-end' : 'flex-start' }}>
                        <Bone animValue={anim} width={isRight ? '60%' : '70%'} height={isRight ? 44 : 56} borderRadius={16} />
                    </View>
                );
            })}
        </View>
    );
}

// ── Typing Indicator ──
function TypingIndicator({ users }) {
    const fadeAnim = useRef(new Animated.Value(0.3)).current;
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                Animated.timing(fadeAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
            ])
        ).start();
    }, []);
    if (!users?.length) return null;
    const label = users.length === 1
        ? `${users[0].name} is typing`
        : users.length === 2
            ? `${users[0].name} and ${users[1].name} are typing`
            : 'Multiple people are typing';
    return (
        <View style={styles.typingContainer}>
            <Text style={styles.typingText}>{label}</Text>
            <View style={styles.dotContainer}>
                {[0, 1, 2].map(i => (
                    <Animated.View key={i} style={[styles.typingDot, { opacity: fadeAnim }]} />
                ))}
            </View>
        </View>
    );
}

// ── Message Status ──
const MessageStatusTicks = ({ status, isMine }) => {
    if (!isMine) return null;
    if (status === 'SENDING') return <Clock size={10} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />;
    if (status === 'READ') return <View style={{ marginLeft: 4 }}><CheckCheck size={12} color="#4ade80" /></View>;
    if (status === 'DELIVERED') return <CheckCheck size={12} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />;
    return <Check size={12} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />;
};

// ── Message Bubble ──
const MessageBubble = React.memo(function MessageBubble({ message, isMine, showSender, onLongPress }) {
    if (message.isDeleted) {
        return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther, styles.bubbleDeleted]}>
                <Text style={styles.deletedText}>🚫 This message was deleted</Text>
            </View>
        );
    }
    return (
        <HapticTouchable
            style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}
            onPress={() => { }}
            onLongPress={() => onLongPress(message)}
            delayLongPress={400}
            activeOpacity={0.85}
            haptic="light"
        >
            {showSender && !isMine && message.sender?.name && (
                <Text style={styles.senderName}>
                    {typeof message.sender.name === 'string' ? message.sender.name : message.sender.name?.name || ''}
                </Text>
            )}
            {message.replyTo && (
                <View style={styles.replyPreview}>
                    <View style={styles.replyBar} />
                    <View>
                        <Text style={styles.replySenderName}>{message.replyTo.senderName || 'Unknown'}</Text>
                        <Text style={styles.replyContent} numberOfLines={1}>{message.replyTo.content || 'Message'}</Text>
                    </View>
                </View>
            )}
            {message.attachments?.length > 0 && (
                <View style={styles.attachmentContainer}>
                    {message.attachments.map((att, idx) =>
                        att.mimeType?.startsWith('image/') ? (
                            <Image key={idx} source={{ uri: att.url }} style={styles.attachmentImage} resizeMode="cover" />
                        ) : (
                            <View key={idx} style={styles.fileAttachment}>
                                <Paperclip size={14} color="#6b7280" />
                                <Text style={styles.fileName} numberOfLines={1}>{att.fileName || 'File'}</Text>
                            </View>
                        )
                    )}
                </View>
            )}
            {message.content ? (
                <Text style={[styles.messageText, isMine && styles.messageTextMine]}>{message.content}</Text>
            ) : null}
            <View style={styles.metaRow}>
                <Text style={[styles.timeText, isMine && styles.timeTextMine]}>{formatTime(message.createdAt)}</Text>
                <MessageStatusTicks status={message.status} isMine={isMine} />
            </View>
        </HapticTouchable>
    );
});

// ── Header Avatar ──
function HeaderAvatar({ profilePicture, title, isGroup }) {
    if (isGroup) return null; // groups use title only
    if (profilePicture) {
        return <Image source={{ uri: profilePicture }} style={styles.headerAvatar} />;
    }
    return (
        <View style={[styles.headerAvatar, styles.headerAvatarFallback]}>
            <Text style={styles.headerAvatarInitial}>
                {(title || '?').charAt(0).toUpperCase()}
            </Text>
        </View>
    );
}

// ── Main Screen ──
export default function ChatRoomScreen() {
    const insets = useSafeAreaInsets();
    const {
        conversationId,
        title: paramTitle,
        schoolId: paramSchoolId,
        profilePicture: paramProfilePicture,
    } = useLocalSearchParams();
    const flatListRef = useRef(null);

    const [currentUser, setCurrentUser] = useState(null);
    const [schoolId, setSchoolId] = useState(paramSchoolId || null);
    const [inputText, setInputText] = useState('');
    const [replyTo, setReplyTo] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        SecureStore.getItemAsync('user').then((raw) => {
            if (raw) {
                const u = JSON.parse(raw);
                setCurrentUser({
                    id: u.id,
                    name: typeof u.name === 'string' ? u.name : u.name?.name || '',
                    profilePicture: u.profilePicture,
                    role: typeof u.role === 'string' ? u.role : u.role?.name || '',
                });
                if (!schoolId) setSchoolId(u.schoolId);
            }
        }).catch(console.error);
    }, []);

    const { data: convData } = useConversation(schoolId, conversationId);
    const conversation = convData?.conversation;

    const { data: messagesData, isLoading: messagesLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(schoolId, conversationId);
    const sendMessageMutation = useSendMessage();
    const deleteMessageMutation = useDeleteMessage();
    const muteMutation = useMuteConversation();
    const markReadMutation = useMarkAsRead();
    const markAsDeliveredMutation = useMarkAsDelivered();
    const leaveMutation = useLeaveConversation();

    useChatRealtime(schoolId, conversationId, { enabled: !!schoolId && !!conversationId });
    const { sendTyping, stopTyping, typingUsers } = useTypingIndicator(conversationId, currentUser, { enabled: !!conversationId && !!currentUser });
    const { isUserOnline } = usePresenceStatus(schoolId, currentUser);

    useEffect(() => {
        if (!schoolId || !conversationId) return;
        markAsDeliveredMutation.mutate({ schoolId, conversationId });
        markReadMutation.mutate({ schoolId, conversationId });
    }, [schoolId, conversationId]);

    const messages = useMemo(() => {
        if (!messagesData?.pages) return [];
        return messagesData.pages.flatMap((page) => page.messages || []);
    }, [messagesData]);

    const listData = useMemo(() => {
        const items = [];
        let lastDate = null;
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i];
            const dateLabel = getDateLabel(msg.createdAt);
            if (dateLabel !== lastDate) {
                items.push({ type: 'date', label: dateLabel, id: `date-${dateLabel}-${i}` });
                lastDate = dateLabel;
            }
            items.push({ type: 'message', ...msg });
        }
        return items.reverse();
    }, [messages]);

    // Re-mark as read when new messages arrive
    useEffect(() => {
        if (!schoolId || !conversationId || !listData?.length) return;
        const lastMsg = listData[0];
        if (lastMsg?.type === 'message' && lastMsg.senderId !== currentUser?.id) {
            markAsDeliveredMutation.mutate({ schoolId, conversationId });
            markReadMutation.mutate({ schoolId, conversationId });
        }
    }, [listData?.[0]?.id]);

    // ── Header computed values ──
    // Use params immediately (no flicker), upgrade to live data once loaded
    const isGroup = conversation
        ? conversation.type === 'COMMUNITY' || conversation.type === 'TEACHER_CLASS'
        : false;

    const displayTitle = conversation?.title || paramTitle || 'Chat';

    // profilePicture: use param until conversation loads, then use participant's pic
    const resolvedProfilePicture = useMemo(() => {
        if (isGroup) return null;
        // Live conversation data takes priority
        if (conversation?.participants?.length > 0) {
            const other = conversation.participants.find(p => p.id !== currentUser?.id || p.userId !== currentUser?.id);
            if (other?.profilePicture) return other.profilePicture;
        }
        // Fall back to what was passed as param
        return paramProfilePicture || null;
    }, [conversation, currentUser?.id, paramProfilePicture, isGroup]);

    // Subtitle: only show member count / online status once conversation is actually loaded
    const headerSubtitle = useMemo(() => {
        if (!conversation) return null; // loading — show nothing, avoids "2 members" flash

        if (isGroup) {
            const count = (conversation.participants?.length || 0) + 1;
            return `${count} ${count === 1 ? 'member' : 'members'}`;
        }

        // 1-to-1: show online / last seen
        const other = conversation.participants?.find(
            p => p.userId !== currentUser?.id
        );
        if (!other) return null;
        const online = isUserOnline(other.userId);
        if (online) return 'online';
        if (other.user?.lastSeenAt) return `last seen ${formatLastSeen(other.user.lastSeenAt)}`;
        return null;
    }, [conversation, isGroup, currentUser?.id, isUserOnline]);

    const isOtherOnline = useMemo(() => {
        if (!conversation || isGroup) return false;
        const other = conversation.participants?.find(p => p.userId !== currentUser?.id);
        return other ? isUserOnline(other.userId) : false;
    }, [conversation, isGroup, currentUser?.id, isUserOnline]);

    // ── Actions ──
    const handleSend = useCallback(async () => {
        const text = inputText.trim();
        if (!text || isSending) return;
        const tempId = `temp-${Date.now()}`;
        setIsSending(true);
        setInputText('');
        stopTyping();
        const currentReplyTo = replyTo;
        setReplyTo(null);
        try {
            await sendMessageMutation.mutateAsync({
                schoolId, conversationId,
                body: { content: text, ...(currentReplyTo && { replyToId: currentReplyTo.id }) },
                tempId, currentUser,
            });
        } catch (err) {
            setInputText(text);
            Alert.alert('Error', 'Failed to send message. Please try again.');
        } finally {
            setIsSending(false);
        }
    }, [inputText, isSending, schoolId, conversationId, replyTo, currentUser, sendMessageMutation]);

    const handleLongPress = useCallback((message) => {
        const isMine = message.senderId === currentUser?.id;
        const options = ['Copy', 'Reply'];
        const actions = [
            () => Clipboard.setStringAsync(message.content || ''),
            () => { setReplyTo(message); inputRef.current?.focus(); },
        ];
        if (isMine) {
            options.push('Delete');
            actions.push(() => {
                Alert.alert('Delete Message', 'This message will be deleted for everyone.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Delete', style: 'destructive',
                        onPress: () => deleteMessageMutation.mutate({ schoolId, conversationId, messageId: message.id }),
                    },
                ]);
            });
        }
        options.push('Cancel');
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions(
                { options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: isMine ? options.indexOf('Delete') : undefined },
                (idx) => { if (idx < actions.length) actions[idx](); }
            );
        } else {
            Alert.alert('Message Options', null, [
                ...options.slice(0, -1).map((opt, i) => ({ text: opt, onPress: actions[i], style: opt === 'Delete' ? 'destructive' : 'default' })),
                { text: 'Cancel', style: 'cancel' },
            ]);
        }
    }, [currentUser, schoolId, conversationId, deleteMessageMutation]);

    const handleMoreOptions = useCallback(() => {
        const isMuted = conversation?.isMuted;
        const isGroupConv = isGroup;
        const options = [
            isMuted ? 'Unmute Notifications' : 'Mute Notifications',
            isGroupConv ? 'Leave Group' : 'Leave Conversation',
            'Cancel',
        ];
        const handler = (idx) => {
            if (idx === 0) {
                if (isMuted) {
                    muteMutation.mutate({ schoolId, conversationId, duration: 'unmute' });
                } else {
                    const muteOptions = ['1 Hour', '8 Hours', '1 Day', 'Forever', 'Cancel'];
                    const durMap = ['1h', '8h', '1d', 'forever'];
                    if (Platform.OS === 'ios') {
                        ActionSheetIOS.showActionSheetWithOptions(
                            { options: muteOptions, cancelButtonIndex: 4 },
                            (i) => { if (i < 4) muteMutation.mutate({ schoolId, conversationId, duration: durMap[i] }); }
                        );
                    } else {
                        Alert.alert('Mute for', null, [
                            ...muteOptions.slice(0, -1).map((opt, i) => ({ text: opt, onPress: () => muteMutation.mutate({ schoolId, conversationId, duration: durMap[i] }) })),
                            { text: 'Cancel', style: 'cancel' },
                        ]);
                    }
                }
            } else if (idx === 1) {
                Alert.alert(isGroupConv ? 'Leave Group' : 'Leave Conversation', 'You will no longer receive messages from this conversation.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Leave', style: 'destructive', onPress: () => { leaveMutation.mutate({ schoolId, conversationId }); router.back(); } },
                ]);
            }
        };
        if (Platform.OS === 'ios') {
            ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2, destructiveButtonIndex: 1 }, handler);
        } else {
            Alert.alert('Options', null, [
                { text: options[0], onPress: () => handler(0) },
                { text: options[1], onPress: () => handler(1), style: 'destructive' },
                { text: 'Cancel', style: 'cancel' },
            ]);
        }
    }, [conversation, isGroup, schoolId, conversationId, muteMutation, leaveMutation]);

    const renderItem = useCallback(({ item, index }) => {
        if (item.type === 'date') {
            return (
                <View style={styles.dateSeparator}>
                    <View style={styles.dateLine} />
                    <Text style={styles.dateLabel}>{item.label}</Text>
                    <View style={styles.dateLine} />
                </View>
            );
        }
        const isMine = item.senderId === currentUser?.id;
        const prevItem = listData[index + 1];
        const showSender = !isMine && (prevItem?.type === 'message' ? prevItem.senderId !== item.senderId : true);

        return (
            <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
                {!isMine && showSender && (
                    <View style={styles.messageAvatar}>
                        {item.sender?.profilePicture ? (
                            <Image source={{ uri: item.sender.profilePicture }} style={styles.smallAvatar} />
                        ) : (
                            <View style={[styles.smallAvatar, styles.smallAvatarPlaceholder]}>
                                <Text style={styles.smallAvatarInitial}>
                                    {(typeof item.sender?.name === 'string' ? item.sender.name : item.sender?.name?.name || '?').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                    </View>
                )}
                {!isMine && !showSender && <View style={{ width: 32, marginRight: 8 }} />}
                <MessageBubble message={item} isMine={isMine} showSender={showSender} onLongPress={handleLongPress} />
            </View>
        );
    }, [currentUser, listData, handleLongPress]);

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar style="dark" backgroundColor="#fff" />

            {/* ── Header ── */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={22} color="#111" strokeWidth={2} />
                </HapticTouchable>

                {/* Avatar (1-to-1 only) */}
                <HeaderAvatar
                    profilePicture={resolvedProfilePicture}
                    title={displayTitle}
                    isGroup={isGroup}
                />

                <View style={styles.headerInfo}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{displayTitle}</Text>
                    {headerSubtitle && (
                        <View style={styles.statusRow}>
                            {isOtherOnline && !isGroup && <View style={styles.onlineDot} />}
                            <Text style={styles.headerSubtitle} numberOfLines={1}>{headerSubtitle}</Text>
                        </View>
                    )}
                </View>

                <HapticTouchable onPress={handleMoreOptions} style={styles.moreBtn}>
                    <MoreVertical size={22} color="#111" strokeWidth={2} />
                </HapticTouchable>
            </View>

            {/* ── Messages ── */}
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                keyboardVerticalOffset={0}
            >
                {messagesLoading ? (
                    <ChatRoomSkeleton />
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={listData}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.id}
                        inverted
                        contentContainerStyle={styles.messagesContent}
                        showsVerticalScrollIndicator={false}
                        onEndReached={() => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); }}
                        onEndReachedThreshold={0.3}
                        ListFooterComponent={
                            isFetchingNextPage
                                ? <ActivityIndicator size="small" color="#0469ff" style={{ padding: 16 }} />
                                : null
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyMessages}>
                                <Text style={styles.emptyMessagesText}>No messages yet. Say hello! 👋</Text>
                            </View>
                        }
                        keyboardDismissMode="interactive"
                        keyboardShouldPersistTaps="handled"
                    />
                )}

                {/* Reply preview */}
                {replyTo && (
                    <View style={styles.replyBar2}>
                        <View style={styles.replyAccent} />
                        <View style={{ flex: 1 }}>
                            <Text style={styles.replyBar2Sender}>
                                Replying to {replyTo.sender?.name || 'message'}
                            </Text>
                            <Text style={styles.replyBar2Text} numberOfLines={1}>
                                {replyTo.content || '📎 Attachment'}
                            </Text>
                        </View>
                        <HapticTouchable onPress={() => setReplyTo(null)}>
                            <X size={18} color="#9ca3af" />
                        </HapticTouchable>
                    </View>
                )}

                <TypingIndicator users={typingUsers} />

                {/* Input */}
                <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
                    <View style={styles.inputRow}>
                        <TextInput
                            ref={inputRef}
                            style={styles.textInput}
                            placeholder="Type a message..."
                            placeholderTextColor="#9ca3af"
                            value={inputText}
                            onChangeText={(text) => { setInputText(text); sendTyping(); }}
                            multiline
                            maxLength={5000}
                        />
                        <HapticTouchable
                            style={[styles.sendBtn, (!inputText.trim() || isSending) && styles.sendBtnDisabled]}
                            onPress={handleSend}
                            disabled={!inputText.trim() || isSending}
                            haptic="medium"
                        >
                            {isSending
                                ? <ActivityIndicator size={16} color="#fff" />
                                : <Send size={18} color="#fff" strokeWidth={2.5} />
                            }
                        </HapticTouchable>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },

    // Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: '#fff',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#e5e7eb',
        gap: 10,
    },
    backBtn: { padding: 4 },
    // Small avatar in header
    headerAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    headerAvatarFallback: {
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerAvatarInitial: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0469ff',
    },
    headerInfo: { flex: 1 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 4 },
    onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
    headerSubtitle: { fontSize: 12, color: '#6b7280' },
    moreBtn: { padding: 4 },

    // Messages
    messagesContent: { padding: 12, paddingBottom: 8 },
    messageRow: { flexDirection: 'row', marginBottom: 4 },
    messageRowMine: { justifyContent: 'flex-end' },
    messageRowOther: { justifyContent: 'flex-start' },
    messageAvatar: { marginRight: 8, alignSelf: 'flex-end' },
    smallAvatar: { width: 32, height: 32, borderRadius: 16 },
    smallAvatarPlaceholder: { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
    smallAvatarInitial: { fontSize: 13, fontWeight: '700', color: '#6b7280' },

    // Bubble
    bubble: { maxWidth: '78%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
    bubbleMine: { backgroundColor: '#0469ff', borderBottomRightRadius: 6 },
    bubbleOther: {
        backgroundColor: '#fff',
        borderBottomLeftRadius: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
        elevation: 1,
    },
    bubbleDeleted: { backgroundColor: '#f3f4f6', borderBottomRightRadius: 18, borderBottomLeftRadius: 18 },
    deletedText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
    senderName: { fontSize: 12, fontWeight: '700', color: '#0469ff', marginBottom: 3 },
    messageText: { fontSize: 15, color: '#1a1a2e', lineHeight: 21 },
    messageTextMine: { color: '#fff' },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 3 },
    timeText: { fontSize: 10, color: '#9ca3af' },
    timeTextMine: { color: 'rgba(255,255,255,0.65)' },

    // Reply in bubble
    replyPreview: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8,
        padding: 8, marginBottom: 6,
    },
    replyBar: { width: 3, height: '100%', borderRadius: 2, backgroundColor: '#0469ff', marginRight: 8 },
    replySenderName: { fontSize: 11, fontWeight: '700', color: '#0469ff' },
    replyContent: { fontSize: 12, color: '#6b7280', marginTop: 1 },

    // Reply bar above input
    replyBar2: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 16, paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb',
    },
    replyAccent: { width: 3, height: 36, borderRadius: 2, backgroundColor: '#0469ff', marginRight: 10 },
    replyBar2Sender: { fontSize: 12, fontWeight: '600', color: '#0469ff' },
    replyBar2Text: { fontSize: 13, color: '#6b7280', marginTop: 1 },

    // Attachments
    attachmentContainer: { marginBottom: 6 },
    attachmentImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
    fileAttachment: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.06)',
        borderRadius: 8, padding: 8, marginBottom: 4, gap: 6,
    },
    fileName: { fontSize: 12, color: '#374151', flex: 1 },

    // Date separator
    dateSeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 4 },
    dateLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#d1d5db' },
    dateLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '600', paddingHorizontal: 12 },

    // Input
    inputBar: {
        backgroundColor: '#fff',
        paddingHorizontal: 12, paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb',
    },
    inputRow: {
        flexDirection: 'row', alignItems: 'flex-end',
        backgroundColor: '#f3f4f6', borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: Platform.OS === 'ios' ? 10 : 4,
        gap: 8,
    },
    textInput: {
        flex: 1, fontSize: 15, color: '#111', maxHeight: 100,
        paddingTop: Platform.OS === 'ios' ? 0 : 8,

        paddingBottom: Platform.OS === 'ios' ? 0 : 8,
    },
    sendBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0469ff', alignItems: 'center', justifyContent: 'center' },
    sendBtnDisabled: { opacity: 0.4 },

    // Empty
    emptyMessages: { alignItems: 'center', paddingVertical: 60 },
    emptyMessagesText: { fontSize: 15, color: '#9ca3af' },

    // Typing
    typingContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, gap: 6 },
    typingText: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },
    dotContainer: { flexDirection: 'row', gap: 2, alignItems: 'center', height: 12 },
    typingDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#9ca3af' },
});