// ============================================
// CHAT ROOM - Message thread screen
// ============================================

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, FlatList, TextInput, StyleSheet, Image,
    KeyboardAvoidingView, Platform, ActionSheetIOS, Alert,
    ActivityIndicator, Animated, Modal, TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft, Send, Paperclip, MoreVertical,
    X, Clock, Check, CheckCheck, BellOff, Bell, LogOut,
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
import { BlurView } from 'expo-blur';
import Animated2, {
    useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Skeleton ──────────────────────────────────────────────────────────────────

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

// ── Typing Indicator ──────────────────────────────────────────────────────────

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

// ── Message Status ────────────────────────────────────────────────────────────

const MessageStatusTicks = ({ status, isMine }) => {
    if (!isMine) return null;
    if (status === 'SENDING') return <Clock size={10} color="rgba(255,255,255,0.5)" style={{ marginLeft: 4 }} />;
    if (status === 'READ') return <View style={{ marginLeft: 4 }}><CheckCheck size={12} color="#4ade80" /></View>;
    if (status === 'DELIVERED') return <CheckCheck size={12} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />;
    return <Check size={12} color="rgba(255,255,255,0.7)" style={{ marginLeft: 4 }} />;
};

// ── Message Bubble ────────────────────────────────────────────────────────────

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

// ── Header Avatar ─────────────────────────────────────────────────────────────

function HeaderAvatar({ profilePicture, title, isGroup }) {
    if (isGroup) return null;
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

// ── Bottom Sheet Modal ────────────────────────────────────────────────────────

const BottomSheetModal = React.memo(function BottomSheetModal({ visible, title, options, onClose }) {
    const insets = useSafeAreaInsets();
    const translateY = useSharedValue(400);
    const backdropOpacity = useSharedValue(0);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        if (visible) {
            setMounted(true);
            // slight delay so the modal is mounted before animating
            setTimeout(() => {
                backdropOpacity.value = withTiming(1, { duration: 240 });
                translateY.value = withTiming(0, { duration: 320 });
            }, 10);
        } else {
            backdropOpacity.value = withTiming(0, { duration: 200 });
            translateY.value = withTiming(400, { duration: 260 });
            setTimeout(() => setMounted(false), 270);
        }
    }, [visible]);

    const backdropStyle = useAnimatedStyle(() => ({
        opacity: backdropOpacity.value,
    }));

    const sheetStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    if (!mounted) return null;

    return (
        <Modal
            visible={mounted}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={onClose}
        >
            {/* Dimmed backdrop */}
            <Animated2.View style={[StyleSheet.absoluteFill, bsStyles.backdrop, backdropStyle]}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
            </Animated2.View>

            {/* Sheet */}
            <Animated2.View style={[bsStyles.sheet, { paddingBottom: insets.bottom + 8 }, sheetStyle]}>
                {/* Handle bar */}
                <View style={bsStyles.handleWrapper}>
                    <View style={bsStyles.handle} />
                </View>

                {/* Optional title */}
                {title ? (
                    <Text style={bsStyles.sheetTitle}>{title}</Text>
                ) : null}

                {/* Options */}
                <View style={bsStyles.optionsList}>
                    {options.map((opt, i) => (
                        <React.Fragment key={opt.label}>
                            <TouchableOpacity
                                style={bsStyles.optionRow}
                                activeOpacity={0.65}
                                onPress={() => {
                                    onClose();
                                    setTimeout(() => opt.onPress(), 280);
                                }}
                            >
                                {opt.icon && (
                                    <View style={[
                                        bsStyles.iconBox,
                                        opt.destructive ? bsStyles.iconBoxDestructive : bsStyles.iconBoxDefault,
                                    ]}>
                                        {opt.icon}
                                    </View>
                                )}
                                <Text style={[
                                    bsStyles.optionLabel,
                                    opt.destructive && bsStyles.optionLabelDestructive,
                                ]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                            {i < options.length - 1 && <View style={bsStyles.divider} />}
                        </React.Fragment>
                    ))}
                </View>

                {/* Cancel pill */}
                <TouchableOpacity style={bsStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
                    <Text style={bsStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
            </Animated2.View>
        </Modal>
    );
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ChatRoomScreen() {
    const insets = useSafeAreaInsets();
    const {
        conversationId, title: paramTitle,
        schoolId: paramSchoolId, profilePicture: paramProfilePicture,
    } = useLocalSearchParams();
    const flatListRef = useRef(null);

    const [currentUser, setCurrentUser] = useState(null);
    const [schoolId, setSchoolId] = useState(paramSchoolId || null);
    const [inputText, setInputText] = useState('');
    const [replyTo, setReplyTo] = useState(null);
    const [isSending, setIsSending] = useState(false);
    const inputRef = useRef(null);

    // Bottom sheet state
    const [sheetVisible, setSheetVisible] = useState(false);
    const [sheetTitle, setSheetTitle] = useState(null);
    const [sheetOptions, setSheetOptions] = useState([]);

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

    useEffect(() => {
        if (!schoolId || !conversationId || !listData?.length) return;
        const lastMsg = listData[0];
        if (lastMsg?.type === 'message' && lastMsg.senderId !== currentUser?.id) {
            markAsDeliveredMutation.mutate({ schoolId, conversationId });
            markReadMutation.mutate({ schoolId, conversationId });
        }
    }, [listData?.[0]?.id]);

    const isGroup = conversation
        ? conversation.type === 'COMMUNITY' || conversation.type === 'TEACHER_CLASS'
        : false;

    const displayTitle = conversation?.title || paramTitle || 'Chat';

    const resolvedProfilePicture = useMemo(() => {
        if (isGroup) return null;
        if (conversation?.participants?.length > 0) {
            const other = conversation.participants.find(p => p.id !== currentUser?.id || p.userId !== currentUser?.id);
            if (other?.profilePicture) return other.profilePicture;
        }
        return paramProfilePicture || null;
    }, [conversation, currentUser?.id, paramProfilePicture, isGroup]);

    const headerSubtitle = useMemo(() => {
        if (!conversation) return null;
        if (isGroup) {
            const count = (conversation.participants?.length || 0) + 1;
            return `${count} ${count === 1 ? 'member' : 'members'}`;
        }
        const other = conversation.participants?.find(p => p.userId !== currentUser?.id);
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

    // ── Actions ───────────────────────────────────────────────────────────────

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
        } catch {
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

    // Opens mute duration sheet
    const openMuteDurationSheet = useCallback(() => {
        setSheetTitle('Mute notifications for...');
        setSheetOptions([
            {
                label: '1 Hour',
                icon: <Clock size={17} color="#374151" />,
                onPress: () => muteMutation.mutate({ schoolId, conversationId, duration: '1h' }),
            },
            {
                label: '8 Hours',
                icon: <Clock size={17} color="#374151" />,
                onPress: () => muteMutation.mutate({ schoolId, conversationId, duration: '8h' }),
            },
            {
                label: '1 Day',
                icon: <Clock size={17} color="#374151" />,
                onPress: () => muteMutation.mutate({ schoolId, conversationId, duration: '1d' }),
            },
            {
                label: 'Forever',
                icon: <BellOff size={17} color="#374151" />,
                onPress: () => muteMutation.mutate({ schoolId, conversationId, duration: 'forever' }),
            },
        ]);
        setSheetVisible(true);
    }, [schoolId, conversationId, muteMutation]);

    const handleMoreOptions = useCallback(() => {
        const isMuted = conversation?.isMuted;
        const isGroupConv = isGroup;

        setSheetTitle(null);
        setSheetOptions([
            {
                label: isMuted ? 'Unmute Notifications' : 'Mute Notifications',
                icon: isMuted
                    ? <Bell size={17} color="#374151" />
                    : <BellOff size={17} color="#374151" />,
                onPress: () => {
                    if (isMuted) {
                        muteMutation.mutate({ schoolId, conversationId, duration: 'unmute' });
                    } else {
                        // open second sheet for duration
                        openMuteDurationSheet();
                    }
                },
            },
            {
                label: isGroupConv ? 'Leave Group' : 'Leave Conversation',
                icon: <LogOut size={17} color="#ef4444" />,
                destructive: true,
                onPress: () => {
                    Alert.alert(
                        isGroupConv ? 'Leave Group' : 'Leave Conversation',
                        'You will no longer receive messages from this conversation.',
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Leave', style: 'destructive',
                                onPress: () => { leaveMutation.mutate({ schoolId, conversationId }); router.back(); },
                            },
                        ]
                    );
                },
            },
        ]);
        setSheetVisible(true);
    }, [conversation, isGroup, schoolId, conversationId, muteMutation, leaveMutation, openMuteDurationSheet]);

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

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            <StatusBar style="dark" backgroundColor="transparent" translucent />

            {/* Header */}
            <View style={styles.header}>
                <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
                <HapticTouchable onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={22} color="#111" strokeWidth={2} />
                </HapticTouchable>
                <HeaderAvatar profilePicture={resolvedProfilePicture} title={displayTitle} isGroup={isGroup} />
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

            {/* Messages */}
            <KeyboardAvoidingView
                style={{ flex: 1, backgroundColor: '#f8f9fa' }}
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

                {/* Input bar */}
                <View style={styles.inputBar}>
                    <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
                    <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                        <View style={styles.inputPill}>
                            <TextInput
                                ref={inputRef}
                                style={styles.textInput}
                                placeholder="Type a message..."
                                placeholderTextColor="#9ca3af"
                                value={inputText}
                                onChangeText={(text) => { setInputText(text); sendTyping(); }}
                                multiline
                                maxLength={5000}
                                textAlignVertical="center"
                            />
                        </View>
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

            {/* Bottom Sheet */}
            <BottomSheetModal
                visible={sheetVisible}
                title={sheetTitle}
                options={sheetOptions}
                onClose={() => setSheetVisible(false)}
            />
        </View>
    );
}

// ── Main Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0,0,0,0.08)',
        gap: 10,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    backBtn: { padding: 4 },
    headerAvatar: { width: 36, height: 36, borderRadius: 18 },
    headerAvatarFallback: {
        backgroundColor: '#eff6ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerAvatarInitial: { fontSize: 15, fontWeight: '700', color: '#0469ff' },
    headerInfo: { flex: 1 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1, gap: 4 },
    onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22c55e' },
    headerSubtitle: { fontSize: 12, color: '#6b7280' },
    moreBtn: { padding: 4 },

    messagesContent: { padding: 12, paddingBottom: 8 },
    messageRow: { flexDirection: 'row', marginBottom: 4 },
    messageRowMine: { justifyContent: 'flex-end' },
    messageRowOther: { justifyContent: 'flex-start' },
    messageAvatar: { marginRight: 8, alignSelf: 'flex-end' },
    smallAvatar: { width: 32, height: 32, borderRadius: 16 },
    smallAvatarPlaceholder: { backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
    smallAvatarInitial: { fontSize: 13, fontWeight: '700', color: '#6b7280' },

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

    replyPreview: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 8,
        padding: 8, marginBottom: 6,
    },
    replyBar: { width: 3, height: '100%', borderRadius: 2, backgroundColor: '#0469ff', marginRight: 8 },
    replySenderName: { fontSize: 11, fontWeight: '700', color: '#0469ff' },
    replyContent: { fontSize: 12, color: '#6b7280', marginTop: 1 },

    replyBar2: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingHorizontal: 16, paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb',
    },
    replyAccent: { width: 3, height: 36, borderRadius: 2, backgroundColor: '#0469ff', marginRight: 10 },
    replyBar2Sender: { fontSize: 12, fontWeight: '600', color: '#0469ff' },
    replyBar2Text: { fontSize: 13, color: '#6b7280', marginTop: 1 },

    attachmentContainer: { marginBottom: 6 },
    attachmentImage: { width: 200, height: 150, borderRadius: 12, marginBottom: 4 },
    fileAttachment: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.06)',
        borderRadius: 8, padding: 8, marginBottom: 4, gap: 6,
    },
    fileName: { fontSize: 12, color: '#374151', flex: 1 },

    dateSeparator: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, paddingHorizontal: 4 },
    dateLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: '#d1d5db' },
    dateLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '600', paddingHorizontal: 12 },

    inputBar: {
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(0,0,0,0.08)',
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.7)',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingTop: 10,
        gap: 8,
    },
    inputPill: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.06)',
        borderRadius: 24,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(0,0,0,0.09)',
        paddingHorizontal: 16,
        paddingVertical: Platform.OS === 'ios' ? 10 : 4,
        justifyContent: 'center',
        minHeight: 44,
    },
    textInput: {
        fontSize: 15,
        color: '#111',
        maxHeight: 100,
        padding: 0,
        margin: 0,
        includeFontPadding: false,
        textAlignVertical: 'center',
    },
    sendBtn: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#0469ff',
        alignItems: 'center', justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.35 },

    emptyMessages: { alignItems: 'center', paddingVertical: 60 },
    emptyMessagesText: { fontSize: 15, color: '#9ca3af' },

    typingContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, gap: 6 },
    typingText: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },
    dotContainer: { flexDirection: 'row', gap: 2, alignItems: 'center', height: 12 },
    typingDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#9ca3af' },
});

// ── Bottom Sheet Styles ───────────────────────────────────────────────────────

const bsStyles = StyleSheet.create({
    backdrop: {
        backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    handleWrapper: {
        alignItems: 'center',
        paddingVertical: 10,
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#d1d5db',
    },
    sheetTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#9ca3af',
        textAlign: 'center',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    optionsList: {
        backgroundColor: '#f9fafb',
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 10,
    },
    optionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 16,
        gap: 14,
    },
    divider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: '#e5e7eb',
        marginLeft: 56,   // indent past icon
    },
    iconBox: {
        width: 34,
        height: 34,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconBoxDefault: {
        backgroundColor: '#f3f4f6',
    },
    iconBoxDestructive: {
        backgroundColor: '#fef2f2',
    },
    optionLabel: {
        fontSize: 15,
        color: '#111',
        fontWeight: '500',
    },
    optionLabelDestructive: {
        color: '#ef4444',
    },
    cancelBtn: {
        backgroundColor: '#f3f4f6',
        borderRadius: 14,
        paddingVertical: 15,
        alignItems: 'center',
        marginBottom: 4,
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#374151',
    },
});