// ============================================
// CHAT CONTEXT - Global Realtime Listener
// Powers: tab badge count, in-app toast notifications,
// conversation list refresh
// ============================================
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, Image, Vibration, Platform, AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { chatKeys } from '../hooks/useChat';
import { getCachedUser, sendHeartbeat } from '../services/chatService';
import { useRouter, usePathname } from 'expo-router';

const ChatContext = createContext();

const BADGE_KEY = 'chatBadgeCount';

// ── In-App Toast Component ──
function InAppToast({ visible, senderName, senderAvatar, message, onPress, onHide }) {
    const translateY = useRef(new Animated.Value(-120)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.parallel([
                Animated.spring(translateY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
            ]).start();

            // Auto-hide after 3.5 seconds
            const timer = setTimeout(() => {
                Animated.parallel([
                    Animated.timing(translateY, { toValue: -120, duration: 300, useNativeDriver: true }),
                    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
                ]).start(() => onHide?.());
            }, 3500);

            return () => clearTimeout(timer);
        }
    }, [visible]);

    if (!visible) return null;

    const initial = (senderName || '?').charAt(0).toUpperCase();

    return (
        <Animated.View style={[styles.toastContainer, { transform: [{ translateY }], opacity }]}>
            <View style={styles.toast}>
                {senderAvatar ? (
                    <Image source={{ uri: senderAvatar }} style={styles.toastAvatar} />
                ) : (
                    <View style={[styles.toastAvatar, styles.toastAvatarFallback]}>
                        <Text style={styles.toastAvatarInitial}>{initial}</Text>
                    </View>
                )}
                <View style={styles.toastContent}>
                    <Text style={styles.toastSender} numberOfLines={1}>{senderName || 'New Message'}</Text>
                    <Text style={styles.toastMessage} numberOfLines={1}>{message || '📎 Sent an attachment'}</Text>
                </View>
            </View>
        </Animated.View>
    );
}

// ── Provider ──
export function ChatProvider({ children }) {
    const [chatBadgeCount, setChatBadgeCount] = useState(0);
    const [toast, setToast] = useState({ visible: false, senderName: '', senderAvatar: '', message: '' });
    const [userId, setUserId] = useState(null);
    const [schoolId, setSchoolId] = useState(null);
    const channelRef = useRef(null);
    const heartbeatRef = useRef(null);
    const qc = useQueryClient();
    const pathname = usePathname();
    const pathnameRef = useRef(pathname);

    // Keep pathname ref in sync
    useEffect(() => {
        pathnameRef.current = pathname;
    }, [pathname]);

    // ── Global Heartbeat (single interval for entire app) ──
    useEffect(() => {
        if (!userId) return;

        const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

        // Initial heartbeat
        sendHeartbeat().catch(() => {});

        // Set interval
        heartbeatRef.current = setInterval(() => {
            // Only send heartbeat when app is in foreground
            if (AppState.currentState === 'active') {
                sendHeartbeat().catch(() => {});
            }
        }, HEARTBEAT_INTERVAL);

        return () => {
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
            }
        };
    }, [userId]);

    // Load user info
    useEffect(() => {
        const loadUser = async () => {
            try {
                const raw = await SecureStore.getItemAsync('user');
                if (raw) {
                    const cfg = JSON.parse(raw);
                    setUserId(cfg?.id ?? null);
                    setSchoolId(cfg?.schoolId ?? null);
                }
                const savedBadge = await SecureStore.getItemAsync(BADGE_KEY);
                if (savedBadge) {
                    const count = parseInt(savedBadge, 10);
                    setChatBadgeCount(isNaN(count) ? 0 : count);
                }
            } catch (e) {
                console.error('ChatContext: Error loading user', e);
            }
        };
        loadUser();
    }, []);

    // ── Global Realtime Listener ──
    // Listens to ALL messages in conversations the user participates in
    useEffect(() => {
        if (!userId || !schoolId) return;

        // Subscribe to Message inserts — filter will be done client-side
        // since we need to check if the user is a participant
        const channel = supabase
            .channel(`global-chat:${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'Message',
                },
                async (payload) => {
                    const newMsg = payload.new;

                    // Ignore own messages
                    if (newMsg.senderId === userId) return;

                    // Check if user is part of this conversation
                    const { data: participant } = await supabase
                        .from('ConversationParticipant')
                        .select('id, isActive')
                        .eq('conversationId', newMsg.conversationId)
                        .eq('userId', userId)
                        .eq('isActive', true)
                        .single();

                    if (!participant) return;

                    // Get sender info for toast
                    let sender = null;
                    try {
                        sender = await getCachedUser(newMsg.senderId);
                    } catch (e) { /* ignore */ }

                    // Check if user is currently in this specific conversation
                    // Use ref to get latest pathname without re-subscribing channel
                    const currentPath = pathnameRef.current;
                    const isInThisConversation = currentPath?.includes(newMsg.conversationId);

                    // ── Update badge count ──
                    if (!isInThisConversation) {
                        setChatBadgeCount(prev => {
                            const newCount = prev + 1;
                            SecureStore.setItemAsync(BADGE_KEY, newCount.toString()).catch(() => { });
                            return newCount;
                        });
                    }
                    // ── Show in-app toast (only when NOT in this conversation) ──
                    if (!isInThisConversation) {
                        // Vibrate / Haptic feedback
                        if (Platform.OS === 'ios') {
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } else {
                            Vibration.vibrate([0, 200, 100, 200]);
                        }
                        setToast({
                            visible: true,
                            senderName: sender?.name || 'New Message',
                            senderAvatar: sender?.profilePicture || null,
                            message: newMsg.content?.slice(0, 80) || '📎 Sent an attachment',
                            conversationId: newMsg.conversationId,
                        });
                    }

                    // ── Optimistic update conversation list (no API call) ──
                    qc.setQueriesData({ queryKey: chatKeys.conversations(schoolId) }, (old) => {
                        if (!old?.conversations) return old;
                        return {
                            ...old,
                            conversations: old.conversations.map(conv => {
                                if (conv.id === newMsg.conversationId) {
                                    return {
                                        ...conv,
                                        lastMessageText: newMsg.content || '📎 Attachment',
                                        lastMessageAt: newMsg.createdAt,
                                        unreadCount: isInThisConversation ? conv.unreadCount : (conv.unreadCount || 0) + 1,
                                    };
                                }
                                return conv;
                            }).sort((a, b) => {
                                if (!a.lastMessageAt && !b.lastMessageAt) return 0;
                                if (!a.lastMessageAt) return 1;
                                if (!b.lastMessageAt) return -1;
                                return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
                            }),
                        };
                    });
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[ChatContext] Global realtime channel subscribed');
                }
            });

        channelRef.current = channel;
        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [userId, schoolId, qc]);

    // ── Clear badge when entering chat tab ──
    useEffect(() => {
        if (pathname?.includes('/chat') || pathname?.includes('/(tabs)/chat')) {
            setChatBadgeCount(0);
            SecureStore.setItemAsync(BADGE_KEY, '0').catch(() => { });
        }
    }, [pathname]);

    const clearChatBadge = useCallback(async () => {
        setChatBadgeCount(0);
        await SecureStore.setItemAsync(BADGE_KEY, '0').catch(() => { });
    }, []);

    const hideToast = useCallback(() => {
        setToast(prev => ({ ...prev, visible: false }));
    }, []);

    return (
        <ChatContext.Provider value={{ chatBadgeCount, clearChatBadge }}>
            {children}
            <InAppToast
                visible={toast.visible}
                senderName={toast.senderName}
                senderAvatar={toast.senderAvatar}
                message={toast.message}
                onHide={hideToast}
            />
        </ChatContext.Provider>
    );
}

export function useChat() {
    const context = useContext(ChatContext);
    if (!context) throw new Error('useChat must be used within ChatProvider');
    return context;
}

// ── Styles ──
const styles = StyleSheet.create({
    toastContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 50 : 30,
        left: 16,
        right: 16,
        zIndex: 9999,
        elevation: 9999,
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a2e',
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 10,
    },
    toastAvatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
    },
    toastAvatarFallback: {
        backgroundColor: '#0469ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    toastAvatarInitial: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    toastContent: {
        flex: 1,
        marginLeft: 12,
    },
    toastSender: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2,
    },
    toastMessage: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
    },
});
