// ============================================
// CHAT ROOM - Message thread screen
// ============================================

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, FlatList, TextInput, StyleSheet, Image,
    KeyboardAvoidingView, Platform, Alert, Vibration,
    ActivityIndicator, Animated, Modal, TouchableOpacity,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ArrowLeft, Send, Paperclip, MoreVertical,
    X, Clock, Check, CheckCheck, BellOff, Bell, LogOut,
    Copy, Reply, Trash2, ImagePlus,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Audio, Video, ResizeMode } from 'expo-av';
import HapticTouchable from '../../components/HapticTouch';
import { pickMedia, getPresignedUrls, uploadToR2, detectMediaType } from '../../../lib/r2Upload';
import { useQueryClient } from '@tanstack/react-query';
import {
    useMessages, useSendMessage, useDeleteMessage,
    useMuteConversation, useMarkAsRead, useLeaveConversation,
    useConversation, useMarkAsDelivered, chatKeys
} from '../../../hooks/useChat';
import { useChatRealtime } from '../../../hooks/useChatRealtime';
import { useTypingIndicator } from '../../../hooks/useTypingIndicator';
import { usePresenceStatus } from '../../../hooks/usePresenceStatus';
import { useShimmer, Bone } from '../../components/ScreenSkeleton';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated2, {
    useSharedValue, useAnimatedStyle, withTiming,
} from 'react-native-reanimated';

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseChatDate(dateStr) {
    if (!dateStr) return null;
    if (typeof dateStr !== 'string') return new Date(dateStr);
    return new Date(dateStr.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateStr) ? dateStr : `${dateStr}Z`);
}

function getDateLabel(dateStr) {
    const d = parseChatDate(dateStr);
    if (!d || Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today - msgDate) / (1000 * 60 * 60 * 24);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = parseChatDate(dateStr);
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatLastSeen(dateStr) {
    if (!dateStr) return '';
    const d = parseChatDate(dateStr);
    if (!d || Number.isNaN(d.getTime())) return '';
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

const HEADER_BAR_HEIGHT = 62;

// ── Message Bubble ────────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({ message, isMine, showSender, onLongPress, isSelected, onMediaPress }) {
    if (message.isDeleted) {
        return (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther, styles.bubbleDeleted]}>
                <Text style={styles.deletedText}>🚫 This message was deleted</Text>
            </View>
        );
    }
    return (
        <HapticTouchable
            style={[
                styles.bubble,
                isMine ? styles.bubbleMine : styles.bubbleOther,
                isSelected && { opacity: 0.7, borderWidth: 2, borderColor: '#0469ff' },
            ]}
            onPress={() => {
                const atts = Array.isArray(message.attachments) ? message.attachments : (() => { try { return JSON.parse(message.attachments); } catch { return null; } })();
                if (atts && atts.length > 0 && onMediaPress) {
                    onMediaPress(atts[0]);
                }
            }}
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
                <View style={[styles.replyPreview, isMine && styles.replyPreviewMine]}>
                    <View style={[styles.replyBar, isMine && { backgroundColor: 'rgba(255,255,255,0.7)' }]} />
                    <View>
                        <Text style={[styles.replySenderName, isMine && { color: 'rgba(255,255,255,0.85)' }]}>
                            {(() => {
                                const replyName = message.replyTo.senderName || 'Unknown';
                                const myName = typeof message.sender?.name === 'string'
                                    ? message.sender.name
                                    : message.sender?.name?.name || '';
                                const isSelf = replyName === myName;
                                return isSelf ? `${replyName} (You)` : replyName;
                            })()}
                        </Text>
                        <Text style={[styles.replyContent, isMine && { color: 'rgba(255,255,255,0.7)' }]} numberOfLines={1}>{message.replyTo.content || 'Message'}</Text>
                    </View>
                </View>
            )}
            {message.attachments && (typeof message.attachments === 'string' ? message.attachments.length > 2 : message.attachments?.length > 0) && (
                <View style={styles.attachmentContainer}>
                    {(Array.isArray(message.attachments) ? message.attachments : (() => { try { return JSON.parse(message.attachments); } catch { return []; } })()).map((att, idx) => {
                        const mediaType = detectMediaType(att.url || att.mimeType || '');
                        let mediaComponent = null;

                        if (mediaType === 'image' || mediaType === 'gif') {
                            mediaComponent = <Image source={{ uri: att.url }} style={styles.attachmentImage} resizeMode="cover" />;
                        } else if (mediaType === 'video') {
                            mediaComponent = (
                                <Video
                                    source={{ uri: att.url }}
                                    style={styles.attachmentVideo}
                                    useNativeControls
                                    resizeMode={ResizeMode.CONTAIN}
                                    isLooping={false}
                                />
                            );
                        } else {
                            mediaComponent = (
                                <View style={styles.fileAttachment}>
                                    <Paperclip size={14} color="#6b7280" />
                                    <Text style={styles.fileName} numberOfLines={1}>{att.fileName || 'File'}</Text>
                                </View>
                            );
                        }

                        return (
                            <TouchableOpacity key={idx} style={{ position: 'relative' }} activeOpacity={0.9} onPress={() => onMediaPress && onMediaPress(att)}>
                                {mediaComponent}
                                {message.isUploading && (
                                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', borderRadius: 12, marginBottom: 4 }]}>
                                        <ActivityIndicator size="large" color="#fff" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
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
            <Animated2.View style={[StyleSheet.absoluteFill, bsStyles.backdrop, backdropStyle]}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
            </Animated2.View>

            <Animated2.View style={[bsStyles.sheet, { paddingBottom: insets.bottom + 8 }, sheetStyle]}>
                <View style={bsStyles.handleWrapper}>
                    <View style={bsStyles.handle} />
                </View>
                {title ? (
                    <Text style={bsStyles.sheetTitle}>{title}</Text>
                ) : null}
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
        otherRole: paramRole, classSection: paramClassSection,
        lastSeenAt: paramLastSeenAt,
    } = useLocalSearchParams();
    const flatListRef = useRef(null);
    const sendBubbleSoundRef = useRef(null);
    const headerHeight = insets.top + HEADER_BAR_HEIGHT;

    const [currentUser, setCurrentUser] = useState(null);
    const [schoolId, setSchoolId] = useState(paramSchoolId || null);
    const [inputText, setInputText] = useState('');
    const [replyTo, setReplyTo] = useState(null);
    const [isUploading, setIsUploading] = useState(false);

    const inputRef = useRef(null);

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

    useEffect(() => {
        let mounted = true;

        const loadSendBubbleSound = async () => {
            try {
                const { sound } = await Audio.Sound.createAsync(
                    require('../../../assets/chat/chat_append_bubble.mp3'),
                    { shouldPlay: false }
                );

                if (!mounted) {
                    await sound.unloadAsync();
                    return;
                }

                sendBubbleSoundRef.current = sound;
            } catch (error) {
                console.warn('[chat] failed to load send bubble sound:', error);
            }
        };

        loadSendBubbleSound();

        return () => {
            mounted = false;
            const sound = sendBubbleSoundRef.current;
            sendBubbleSoundRef.current = null;
            if (sound) {
                sound.unloadAsync().catch(() => null);
            }
        };
    }, []);

    const playSendBubbleSound = useCallback(async () => {
        try {
            const sound = sendBubbleSoundRef.current;
            if (!sound) return;
            await sound.replayAsync();
        } catch (error) {
            console.warn('[chat] failed to play send bubble sound:', error);
        }
    }, []);

    const { data: convData } = useConversation(schoolId, conversationId, currentUser?.id);
    const conversation = convData?.conversation;

    const { data: messagesPages, isLoading: messagesLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(schoolId, conversationId);
    const sendMessageMutation = useSendMessage();
    const deleteMessageMutation = useDeleteMessage();
    const muteMutation = useMuteConversation();
    const queryClient = useQueryClient();

    const markReadMutation = useMarkAsRead();
    const markAsDeliveredMutation = useMarkAsDelivered();
    const leaveMutation = useLeaveConversation();

    useChatRealtime(schoolId, conversationId, {
        enabled: !!schoolId && !!conversationId,
        currentUserId: currentUser?.id,
    });
    const { sendTyping, stopTyping, typingUsers } = useTypingIndicator(conversationId, currentUser, { enabled: !!conversationId && !!currentUser });
    const { isUserOnline, getLastSeen } = usePresenceStatus(schoolId, currentUser);

    const lastSeenMsgId = useRef(null);
    useEffect(() => {
        if (!schoolId || !conversationId) return;
        markAsDeliveredMutation.mutate({ schoolId, conversationId });
        markReadMutation.mutate({ schoolId, conversationId });
    }, [schoolId, conversationId]);

    const messages = useMemo(() => {
        if (!messagesPages?.pages) return [];
        return messagesPages.pages.flatMap((page) => page.messages || []);
    }, [messagesPages]);

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
        const newestMsg = listData[0];
        if (newestMsg?.type !== 'message') return;
        if (newestMsg.senderId === currentUser?.id) return;
        if (newestMsg.id === lastSeenMsgId.current) return;
        lastSeenMsgId.current = newestMsg.id;
        markReadMutation.mutate({ schoolId, conversationId });
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

    // Find the latest incoming message timestamp from the other user
    const latestIncomingTimestamp = useMemo(() => {
        if (!messages?.length || !currentUser?.id) return null;
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.senderId && msg.senderId !== currentUser.id && msg.createdAt) {
                return msg.createdAt;
            }
        }
        return null;
    }, [messages, currentUser?.id]);

    const headerSubtitle = useMemo(() => {
        if (!conversation && !paramRole) return null;
        if (isGroup) {
            const count = (conversation?.participants?.length || 0) + 1;
            return `${count} ${count === 1 ? 'member' : 'members'}`;
        }
        const other = conversation?.participants?.find(p => p.userId !== currentUser?.id);
        const online = other ? isUserOnline(other.userId) : false;
        if (online) return 'online';
        const role = paramRole || '';
        const cs = other?.classSection || paramClassSection || '';
        const roleInfo = role && cs ? `${role} · ${cs}` : role || cs || '';
        // Pick the most recent "last seen" from: latest message, presence leave, API, or params
        const realtimeLastSeen = other ? getLastSeen(other.userId) : null;
        const candidates = [latestIncomingTimestamp, realtimeLastSeen, paramLastSeenAt, other?.lastSeenAt].filter(Boolean);
        const lastSeen = candidates.length > 0
            ? candidates.reduce((a, b) => new Date(a) > new Date(b) ? a : b)
            : null;
        if (lastSeen) {
            const label = formatLastSeen(lastSeen);
            return roleInfo ? `${roleInfo} · ${label}` : `last seen ${label}`;
        }
        return roleInfo || null;
    }, [conversation, isGroup, currentUser?.id, isUserOnline, getLastSeen, paramRole, paramClassSection, paramLastSeenAt, latestIncomingTimestamp]);

    const isOtherOnline = useMemo(() => {
        if (!conversation || isGroup) return false;
        const other = conversation.participants?.find(p => p.userId !== currentUser?.id);
        return other ? isUserOnline(other.userId) : false;
    }, [conversation, isGroup, currentUser?.id, isUserOnline]);

    // ── Actions ───────────────────────────────────────────────────────────────

    const handleSend = useCallback(() => {
        const text = inputText.trim();
        if (!text || !schoolId || !conversationId || !currentUser?.id) return;
        const tempId = `temp-${Date.now()}`;
        setInputText('');
        stopTyping();
        const currentReplyTo = replyTo;
        setReplyTo(null);
        sendMessageMutation.mutate({
            schoolId, conversationId,
            body: { content: text, ...(currentReplyTo && { replyToId: currentReplyTo.id }) },
            tempId, currentUser,
            replyToMessage: currentReplyTo || null,
        });
        playSendBubbleSound();
    }, [inputText, schoolId, conversationId, replyTo, currentUser, sendMessageMutation, stopTyping, playSendBubbleSound]);

    const [mediaPreview, setMediaPreview] = useState(null);
    const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);

    const handlePickMedia = useCallback(async () => {
        if (isUploading || !schoolId) return;
        try {
            const result = await pickMedia({ quality: 0.8 });
            if (!result) return;
            setMediaPreview({
                localUri: result.uri,
                mimeType: result.mimeType,
                fileName: result.fileName,
                width: result.width,
                height: result.height,
            });
            setIsPreviewExpanded(true);
        } catch (e) {
            Alert.alert('Selection Failed', e.message || 'Could not pick media');
        }
    }, [isUploading, schoolId]);

    const handleSendMedia = useCallback(async () => {
        if (!mediaPreview || !schoolId || !conversationId || !currentUser?.id) return;
        const tempId = `temp-${Date.now()}`;
        const caption = inputText.trim();
        const preview = mediaPreview;
        const currentReplyTo = replyTo;

        setInputText('');
        setMediaPreview(null);
        setIsPreviewExpanded(false);
        setReplyTo(null);

        const optimisticMsg = {
            id: tempId,
            content: caption,
            senderId: currentUser.id,
            sender: currentUser,
            attachments: [{
                url: preview.localUri,
                mimeType: preview.mimeType,
                fileName: preview.fileName,
                width: preview.width,
                height: preview.height,
            }],
            replyTo: currentReplyTo || null,
            createdAt: new Date().toISOString(),
            status: 'SENDING',
            isUploading: true,
        };

        queryClient.setQueryData(chatKeys.messages(schoolId, conversationId), (old) => {
            if (!old?.pages?.length) return old;
            const newPages = [...old.pages];
            newPages[0] = { ...newPages[0], messages: [optimisticMsg, ...newPages[0].messages] };
            return { ...old, pages: newPages };
        });
        playSendBubbleSound();

        try {
            const [presigned] = await getPresignedUrls(
                [{ name: preview.fileName, type: preview.mimeType }],
                schoolId,
                'chat'
            );
            await uploadToR2(preview.localUri, presigned.url, preview.mimeType);

            sendMessageMutation.mutate({
                schoolId, conversationId,
                body: {
                    content: caption,
                    attachments: [{
                        url: presigned.publicUrl,
                        mimeType: preview.mimeType,
                        fileName: preview.fileName,
                        width: preview.width,
                        height: preview.height,
                    }],
                    ...(currentReplyTo && { replyToId: currentReplyTo.id })
                },
                tempId, currentUser,
                replyToMessage: currentReplyTo || null,
            });
        } catch (error) {
            console.error('Upload failed:', error);
            Alert.alert('Upload Failed', 'Message could not be sent.');
            queryClient.setQueryData(chatKeys.messages(schoolId, conversationId), (old) => {
                if (!old?.pages?.length) return old;
                const newPages = [...old.pages];
                newPages[0] = { ...newPages[0], messages: newPages[0].messages.filter(m => m.id !== tempId) };
                return { ...old, pages: newPages };
            });
        }
    }, [mediaPreview, inputText, schoolId, conversationId, currentUser, sendMessageMutation, replyTo, queryClient, playSendBubbleSound]);

    const [selectedMessage, setSelectedMessage] = useState(null);
    const [viewingMedia, setViewingMedia] = useState(null);

    const handleLongPress = useCallback((message) => {
        setSelectedMessage(prev => prev?.id === message.id ? null : message);
        if (Platform.OS === 'ios') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
            Vibration.vibrate(50);
        }
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedMessage(null);
    }, []);

    const handleCopySelected = useCallback(() => {
        if (selectedMessage?.content) {
            Clipboard.setStringAsync(selectedMessage.content);
        }
        setSelectedMessage(null);
    }, [selectedMessage]);

    const handleReplySelected = useCallback(() => {
        if (selectedMessage) {
            setReplyTo(selectedMessage);
            inputRef.current?.focus();
        }
        setSelectedMessage(null);
    }, [selectedMessage]);

    const handleDeleteSelected = useCallback(() => {
        if (!selectedMessage) return;
        Alert.alert('Delete Message', 'This message will be deleted for everyone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive',
                onPress: () => deleteMessageMutation.mutate({ schoolId, conversationId, messageId: selectedMessage.id }),
            },
        ]);
        setSelectedMessage(null);
    }, [selectedMessage, schoolId, conversationId, deleteMessageMutation]);

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

    // ── THE FIX: single renderItem that passes onMediaPress ──────────────────
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
        const isSelected = selectedMessage?.id === item.id;

        return (
            <TouchableOpacity
                activeOpacity={1}
                onPress={() => selectedMessage ? clearSelection() : null}
                style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}
            >
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
                <MessageBubble
                    message={item}
                    isMine={isMine}
                    showSender={showSender}
                    onLongPress={handleLongPress}
                    isSelected={isSelected}
                    onMediaPress={(att) => setViewingMedia(att)}
                />
            </TouchableOpacity>
        );
    }, [currentUser, listData, handleLongPress, selectedMessage, clearSelection]);

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <View style={styles.container}>
            <StatusBar style="dark" backgroundColor="transparent" translucent />
            <View pointerEvents="none" style={styles.headerBackdrop}>
                <LinearGradient
                    colors={['rgba(4,105,255,0.16)', 'rgba(4,105,255,0.06)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.headerBackdropBlobPrimary} />
                <View style={styles.headerBackdropBlobSecondary} />
            </View>

            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8, minHeight: headerHeight }]}>
                <BlurView
                    intensity={85}
                    tint="light"
                    experimentalBlurMethod="dimezisBlurView"
                    style={StyleSheet.absoluteFill}
                />
                <View style={styles.headerGlassOverlay} />
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
                {conversation?.isMuted && (
                    <BellOff size={16} color="#9ca3af" strokeWidth={2} style={{ marginRight: 4 }} />
                )}
                <HapticTouchable onPress={handleMoreOptions} style={styles.moreBtn}>
                    <MoreVertical size={22} color="#111" strokeWidth={2} />
                </HapticTouchable>
            </View>

            {/* Messages */}
            <KeyboardAvoidingView
                style={{ flex: 1, backgroundColor: '#f8f9fa', paddingTop: headerHeight }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
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
                        onScrollBeginDrag={clearSelection}
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

                {/* Selection Action Bar */}
                {selectedMessage && (
                    <View style={{
                        flexDirection: 'row',
                        justifyContent: 'space-evenly',
                        alignItems: 'center',
                        backgroundColor: '#fff',
                        height: 56,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: '#e5e7eb',
                    }}>
                        <TouchableOpacity
                            onPress={handleCopySelected}
                            style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' }}
                        >
                            <Copy size={18} color="#374151" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151', marginTop: 4 }}>Copy</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleReplySelected}
                            style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' }}
                        >
                            <Reply size={18} color="#374151" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151', marginTop: 4 }}>Reply</Text>
                        </TouchableOpacity>
                        {selectedMessage.senderId === currentUser?.id && (
                            <TouchableOpacity
                                onPress={handleDeleteSelected}
                                style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' }}
                            >
                                <Trash2 size={18} color="#ef4444" />
                                <Text style={{ fontSize: 11, fontWeight: '600', color: '#ef4444', marginTop: 4 }}>Delete</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            onPress={clearSelection}
                            style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, height: '100%' }}
                        >
                            <X size={18} color="#9ca3af" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af', marginTop: 4 }}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
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

                {/* Media Preview (WhatsApp-style) */}
                {mediaPreview && (
                    <View style={styles.mediaPreviewContainer}>
                        <TouchableOpacity
                            style={styles.mediaPreviewCard}
                            activeOpacity={0.8}
                            onPress={() => setIsPreviewExpanded(true)}
                        >
                            {mediaPreview.mimeType?.startsWith('video/') ? (
                                <View style={styles.mediaPreviewVideoPlaceholder}>
                                    <Text style={{ color: '#fff', fontSize: 12, marginTop: 4, fontWeight: 'bold' }}>Video Attached</Text>
                                </View>
                            ) : (
                                <Image
                                    source={{ uri: mediaPreview.localUri || mediaPreview.url }}
                                    style={styles.mediaPreviewImage}
                                    resizeMode="cover"
                                />
                            )}
                            <TouchableOpacity
                                style={styles.mediaPreviewCloseBtn}
                                onPress={() => setMediaPreview(null)}
                            >
                                <X size={16} color="#fff" />
                            </TouchableOpacity>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Input bar */}
                <View style={styles.inputBar}>
                    <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
                    <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                        <HapticTouchable
                            style={styles.mediaBtn}
                            onPress={handlePickMedia}
                            haptic="light"
                            disabled={isUploading}
                        >
                            {isUploading ? <ActivityIndicator size="small" color="#0469ff" /> : <ImagePlus size={22} color="#0469ff" />}
                        </HapticTouchable>
                        <View style={[styles.inputPill, { flex: 1 }]}>
                            <TextInput
                                ref={inputRef}
                                style={styles.textInput}
                                placeholder={mediaPreview ? "Add a caption..." : "Type a message..."}
                                placeholderTextColor="#9ca3af"
                                value={inputText}
                                onChangeText={(text) => { setInputText(text); sendTyping(); }}
                                multiline
                                maxLength={5000}
                                textAlignVertical="center"
                            />
                        </View>
                        <HapticTouchable
                            style={[
                                styles.sendBtn,
                                (!inputText.trim() && !isUploading && !mediaPreview) && styles.sendBtnDisabled
                            ]}
                            onPress={mediaPreview ? handleSendMedia : handleSend}
                            disabled={(!inputText.trim() && !mediaPreview) || isUploading}
                            haptic="medium"
                        >
                            <Send size={18} color="#fff" strokeWidth={2.5} />
                        </HapticTouchable>
                    </View>
                </View>
            </KeyboardAvoidingView>

            {/* Full-Screen Media Preview Modal (before sending) */}
            <Modal
                visible={isPreviewExpanded}
                animationType="slide"
                transparent={false}
                onRequestClose={() => setIsPreviewExpanded(false)}
            >
                <KeyboardAvoidingView
                    style={{ flex: 1, backgroundColor: '#000' }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={{ paddingTop: Math.max(insets.top, 20), paddingHorizontal: 16, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.4)', position: 'absolute', top: 0, width: '100%', zIndex: 10, flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => setIsPreviewExpanded(false)} style={{ padding: 4 }}>
                            <X size={28} color="#fff" />
                        </TouchableOpacity>
                    </View>

                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        {mediaPreview?.mimeType?.startsWith('video/') ? (
                            <Video
                                source={{ uri: mediaPreview.localUri || mediaPreview.url }}
                                style={{ width: '100%', height: '100%' }}
                                useNativeControls
                                resizeMode={ResizeMode.CONTAIN}
                            />
                        ) : (
                            <Image
                                source={{ uri: mediaPreview?.localUri || mediaPreview?.url }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="contain"
                            />
                        )}
                    </View>

                    <View style={{ backgroundColor: '#111', paddingHorizontal: 16, paddingVertical: 12, paddingBottom: Math.max(insets.bottom, 12), flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <View style={[styles.inputPill, { flex: 1, backgroundColor: '#222' }]}>
                            <TextInput
                                style={[styles.textInput, { color: '#fff' }]}
                                placeholder="Add a caption..."
                                placeholderTextColor="#9ca3af"
                                value={inputText}
                                onChangeText={setInputText}
                                multiline
                                maxLength={5000}
                            />
                        </View>
                        <TouchableOpacity
                            style={[styles.sendBtn, isUploading && styles.sendBtnDisabled]}
                            onPress={handleSendMedia}
                            disabled={isUploading}
                        >
                            <Send size={18} color="#fff" strokeWidth={2.5} />
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Bottom Sheet */}
            <BottomSheetModal
                visible={sheetVisible}
                title={sheetTitle}
                options={sheetOptions}
                onClose={() => setSheetVisible(false)}
            />

            {/* Full-Screen Media Viewer Modal (viewing received/sent media) */}
            <Modal
                visible={!!viewingMedia}
                animationType="fade"
                transparent={false}
                onRequestClose={() => setViewingMedia(null)}
            >
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <View style={{ paddingTop: Math.max(insets.top, 20), paddingHorizontal: 16, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.5)', position: 'absolute', top: 0, width: '100%', zIndex: 10, flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => setViewingMedia(null)} style={{ padding: 4 }}>
                            <X size={28} color="#fff" />
                        </TouchableOpacity>
                    </View>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        {detectMediaType(viewingMedia?.url || viewingMedia?.mimeType || '') === 'video' ? (
                            <Video
                                source={{ uri: viewingMedia?.url }}
                                style={{ width: '100%', height: '100%' }}
                                useNativeControls
                                resizeMode={ResizeMode.CONTAIN}
                            />
                        ) : (
                            <Image
                                source={{ uri: viewingMedia?.url }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode="contain"
                            />
                        )}
                    </View>
                </View>
            </Modal>

        </View>
    );
}

// ── Main Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    headerBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 220,
        overflow: 'hidden',
    },
    headerBackdropBlobPrimary: {
        position: 'absolute',
        top: -30,
        right: -10,
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: 'rgba(4,105,255,0.10)',
    },
    headerBackdropBlobSecondary: {
        position: 'absolute',
        top: 30,
        left: -40,
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(59,130,246,0.08)',
    },

    header: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingBottom: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(0,0,0,0.05)',
        gap: 10,
        overflow: 'hidden',
        backgroundColor: 'transparent',
    },
    headerGlassOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(255,255,255,0.06)',
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
    replyPreviewMine: {
        backgroundColor: 'rgba(255,255,255,0.15)',
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
    attachmentVideo: { width: 240, height: 180, borderRadius: 12, marginBottom: 4, backgroundColor: '#000' },
    fileAttachment: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.06)',
        borderRadius: 8, padding: 8, marginBottom: 4, gap: 6,
    },
    fileName: { fontSize: 12, color: '#374151', flex: 1 },

    mediaBtn: {
        width: 38, height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(4,105,255,0.08)',
        alignItems: 'center', justifyContent: 'center',
    },

    mediaPreviewContainer: {
        paddingHorizontal: 12,
        paddingBottom: 8,
        backgroundColor: 'transparent',
    },
    mediaPreviewCard: {
        width: 120, height: 160,
        borderRadius: 12, overflow: 'hidden',
        backgroundColor: '#e5e7eb',
        position: 'relative',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
    },
    mediaPreviewImage: { width: '100%', height: '100%' },
    mediaPreviewVideoPlaceholder: {
        width: '100%', height: '100%',
        backgroundColor: '#1f2937',
        alignItems: 'center', justifyContent: 'center',
    },
    mediaPreviewCloseBtn: {
        position: 'absolute', top: 6, right: 6,
        width: 24, height: 24, borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
    },

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
        marginLeft: 56,
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
    selectionBar: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 4,
    },
    selectionAction: {
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
        paddingVertical: 8,
        gap: 4,
    },
    selectionActionText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#374151',
        marginTop: 2,
    },
});
