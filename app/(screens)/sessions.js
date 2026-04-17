import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    Alert,
    ActivityIndicator,
    RefreshControl,
    Platform,
    Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import {
    ArrowLeft,
    Smartphone,
    Monitor,
    Tablet,
    Globe,
    MapPin,
    Clock,
    ShieldCheck,
    LogOut,
    Trash2,
    AlertTriangle,
} from 'lucide-react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SessionsScreen() {
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        (async () => {
            const sessionId = await SecureStore.getItemAsync('currentSessionId');
            const userStr = await SecureStore.getItemAsync('user');
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    setUserId(user.id);
                } catch (e) { }
            }
            setCurrentSessionId(sessionId);
        })();
    }, []);

    const {
        data: sessions = [],
        isLoading,
        isFetching,
        refetch,
    } = useQuery({
        queryKey: ['sessions', userId],
        queryFn: async () => {
            if (!userId) return [];
            const res = await api.get('/auth/sessions', {
                headers: {
                    'x-user-id': userId,
                    ...(currentSessionId ? { 'x-session-id': currentSessionId } : {}),
                },
            });
            return res.data.sessions || [];
        },
        enabled: !!userId,
        staleTime: 30 * 1000,
    });

    const revokeMutation = useMutation({
        mutationFn: async (sessionId) => {
            await api.delete(`/auth/sessions/${sessionId}`, {
                headers: { 'x-user-id': userId },
            });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
        onError: () => Alert.alert('Error', 'Failed to revoke session. Please try again.'),
    });

    const revokeAllMutation = useMutation({
        mutationFn: async () => {
            await api.post(
                '/auth/sessions/revoke-all',
                { currentSessionId },
                { headers: { 'x-user-id': userId } }
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            Alert.alert('Done', 'All other sessions have been signed out.');
        },
        onError: () => Alert.alert('Error', 'Failed to sign out other sessions.'),
    });

    const handleRevoke = useCallback(
        (session) => {
            Alert.alert(
                'Sign out device?',
                `This will sign out "${session.deviceName || session.os || 'Unknown device'}"`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    {
                        text: 'Sign Out',
                        style: 'destructive',
                        onPress: () => revokeMutation.mutate(session.id),
                    },
                ]
            );
        },
        [revokeMutation]
    );

    const handleRevokeAll = useCallback(() => {
        const otherCount = sessions.filter((s) => s.id !== currentSessionId).length;
        if (otherCount === 0) {
            Alert.alert('No other sessions', 'You only have this session active.');
            return;
        }
        Alert.alert(
            'Sign out everywhere?',
            `This will sign out ${otherCount} other device${otherCount > 1 ? 's' : ''}. You'll stay logged in here.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Sign Out All',
                    style: 'destructive',
                    onPress: () => revokeAllMutation.mutate(),
                },
            ]
        );
    }, [sessions, currentSessionId, revokeAllMutation]);

    const getDeviceIcon = (deviceType) => {
        switch (deviceType?.toLowerCase()) {
            case 'mobile': return Smartphone;
            case 'tablet': return Tablet;
            case 'desktop': return Monitor;
            default: return Globe;
        }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return 'Unknown';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return date.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });
    };

    const renderSession = ({ item: session, index }) => {
        const isCurrent = session.id === currentSessionId;
        const DeviceIcon = getDeviceIcon(session.deviceType);
        const isRevoking = revokeMutation.isPending && revokeMutation.variables === session.id;

        return (
            <Animated.View entering={FadeInDown.delay(index * 60).duration(380)}>
                <View style={[styles.card, isCurrent && styles.cardCurrent]}>
                    {/* Card header row */}
                    <View style={styles.cardHeader}>
                        {/* Device icon */}
                        <View style={[
                            styles.deviceIconBox,
                            isCurrent
                                ? { backgroundColor: '#DBEAFE' }
                                : { backgroundColor: '#F3F4F6' },
                        ]}>
                            <DeviceIcon
                                size={20}
                                color={isCurrent ? '#0469ff' : '#6B7280'}
                                strokeWidth={2}
                            />
                        </View>

                        {/* Device name + browser */}
                        <View style={styles.cardInfo}>
                            <View style={styles.nameRow}>
                                <Text style={styles.deviceName} numberOfLines={1}>
                                    {session.deviceName || session.os || 'Unknown Device'}
                                </Text>
                                {isCurrent && (
                                    <View style={styles.currentBadge}>
                                        <ShieldCheck size={10} color="#fff" strokeWidth={2.5} />
                                        <Text style={styles.currentBadgeText}>This device</Text>
                                    </View>
                                )}
                            </View>
                            <Text style={styles.browserText} numberOfLines={1}>
                                {[session.browser, session.os].filter(Boolean).join(' · ') || 'Unknown browser'}
                            </Text>
                        </View>
                    </View>

                    {/* Divider + details */}
                    <View style={styles.detailsBlock}>
                        {session.location && (
                            <View style={styles.detailRow}>
                                <View style={styles.detailIconBox}>
                                    <MapPin size={12} color="#9CA3AF" strokeWidth={2} />
                                </View>
                                <Text style={styles.detailText} numberOfLines={1}>
                                    {session.location}
                                </Text>
                            </View>
                        )}
                        <View style={styles.detailRow}>
                            <View style={styles.detailIconBox}>
                                <Clock size={12} color="#9CA3AF" strokeWidth={2} />
                            </View>
                            <Text style={styles.detailText}>
                                Last active {formatDate(session.lastActiveAt)}
                            </Text>
                        </View>
                    </View>

                    {/* Revoke button — only on non-current */}
                    {!isCurrent && (
                        <HapticTouchable
                            onPress={() => handleRevoke(session)}
                            disabled={isRevoking}
                            style={styles.revokeBtn}
                        >
                            {isRevoking ? (
                                <ActivityIndicator size="small" color="#EF4444" />
                            ) : (
                                <>
                                    <LogOut size={14} color="#EF4444" strokeWidth={2} />
                                    <Text style={styles.revokeBtnText}>Sign out</Text>
                                </>
                            )}
                        </HapticTouchable>
                    )}
                </View>
            </Animated.View>
        );
    };

    const otherSessionCount = sessions.filter((s) => s.id !== currentSessionId).length;

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <StatusBar style="dark" />

            {/* ── Header — same white pattern as PayFees/StatusUpload ── */}
            <Animated.View entering={FadeInDown.duration(350)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={20} color="#111" />
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Active Sessions</Text>
                    {sessions.length > 0 && (
                        <Text style={styles.headerSubtitle}>
                            {sessions.length} device{sessions.length !== 1 ? 's' : ''} signed in
                        </Text>
                    )}
                </View>
                {/* Invisible spacer to keep title centered */}
                <View style={{ width: 36 }} />
            </Animated.View>
            <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
                {isLoading ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator size="large" color="#0469ff" />
                        <Text style={styles.loadingText}>Loading sessions…</Text>
                    </View>
                ) : (
                    <FlatList
                        data={sessions}
                        renderItem={renderSession}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={[
                            styles.listContent,
                            { paddingBottom: insets.bottom + 32 },
                        ]}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={isFetching && !isLoading}
                                onRefresh={refetch}
                                tintColor="#0469ff"
                            />
                        }
                        ListHeaderComponent={
                            <Animated.View entering={FadeInDown.delay(40).duration(380)}>
                                {/* Info card — same style as PayFees infoCard */}
                                <View style={styles.infoCard}>
                                    <View style={styles.infoIconBox}>
                                        <ShieldCheck size={16} color="#0469ff" strokeWidth={2} />
                                    </View>
                                    <View style={styles.infoTextWrap}>
                                        <Text style={styles.infoTitle}>Security Overview</Text>
                                        <Text style={styles.infoBody}>
                                            Devices currently logged into your account. Sign out any unfamiliar one immediately.
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.sectionLabel}>Devices</Text>
                            </Animated.View>
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyWrap}>
                                <View style={styles.emptyIconBox}>
                                    <ShieldCheck size={32} color="#D1D5DB" strokeWidth={1.5} />
                                </View>
                                <Text style={styles.emptyTitle}>No active sessions</Text>
                                <Text style={styles.emptyBody}>Session information will appear here</Text>
                            </View>
                        }
                        ListFooterComponent={
                            otherSessionCount > 0 ? (
                                <Animated.View entering={FadeInDown.delay(sessions.length * 60 + 80).duration(380)}>
                                    <View style={styles.footerCard}>
                                        <View style={styles.footerIconBox}>
                                            <AlertTriangle size={16} color="#EF4444" strokeWidth={2} />
                                        </View>
                                        <View style={styles.footerTextWrap}>
                                            <Text style={styles.footerTitle}>
                                                {otherSessionCount} other device{otherSessionCount !== 1 ? 's' : ''} active
                                            </Text>
                                            <Text style={styles.footerBody}>
                                                Sign out all other devices at once if you don't recognize them.
                                            </Text>
                                        </View>
                                    </View>
                                    <HapticTouchable
                                        onPress={handleRevokeAll}
                                        disabled={revokeAllMutation.isPending}
                                        style={styles.revokeAllBtn}
                                    >
                                        {revokeAllMutation.isPending ? (
                                            <ActivityIndicator size="small" color="#EF4444" />
                                        ) : (
                                            <>
                                                <Trash2 size={16} color="#EF4444" strokeWidth={2} />
                                                <Text style={styles.revokeAllText}>
                                                    Sign out all other devices
                                                </Text>
                                            </>
                                        )}
                                    </HapticTouchable>
                                </Animated.View>
                            ) : null
                        }
                    />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },

    // ── Header — white, same as PayFees & StatusUpload ────────────────────
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 12,
        backgroundColor: '#fff',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E5E7EB',
    },
    backBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#F3F4F6',
        alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: {
        flex: 1, alignItems: 'center',
    },
    headerTitle: {
        fontSize: 16, fontWeight: '700', color: '#111',
    },
    headerSubtitle: {
        fontSize: 11, color: '#6B7280', marginTop: 1,
    },

    // ── Loading ───────────────────────────────────────────────────────────
    loadingWrap: {
        flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12,
    },
    loadingText: {
        fontSize: 14, color: '#9CA3AF',
    },

    // ── List ──────────────────────────────────────────────────────────────
    listContent: {
        paddingHorizontal: 16,
        paddingTop: 16,
        gap: 10,
    },

    // ── Info card — PayFees infoCard pattern ──────────────────────────────
    infoCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: '#EFF6FF',
        borderWidth: 1,
        borderColor: '#DBEAFE',
        borderRadius: 16,
        padding: 14,
        marginBottom: 18,
    },
    infoIconBox: {
        width: 32, height: 32, borderRadius: 9,
        backgroundColor: '#DBEAFE',
        alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
    },
    infoTextWrap: { flex: 1 },
    infoTitle: {
        fontSize: 13, fontWeight: '700', color: '#1E3A8A',
    },
    infoBody: {
        fontSize: 12, color: '#1E40AF', lineHeight: 17, marginTop: 3,
    },

    // ── Section label ─────────────────────────────────────────────────────
    sectionLabel: {
        fontSize: 10, fontWeight: '700', color: '#9CA3AF',
        textTransform: 'uppercase', letterSpacing: 1,
        marginBottom: 10,
    },

    // ── Session card ──────────────────────────────────────────────────────
    card: {
        backgroundColor: '#fff',
        borderRadius: 20,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#E5E7EB',
        padding: 16,
        ...Platform.select({
            ios: {
                shadowColor: '#000', shadowOpacity: 0.04,
                shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
            },
            android: { elevation: 1 },
        }),
    },
    cardCurrent: {
        borderWidth: 1.5,
        borderColor: '#BFDBFE',
        backgroundColor: '#F0F7FF',
        ...Platform.select({
            ios: {
                shadowColor: '#0469ff', shadowOpacity: 0.08,
                shadowRadius: 10, shadowOffset: { width: 0, height: 3 },
            },
            android: { elevation: 3 },
        }),
    },

    // Card header
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    deviceIconBox: {
        width: 44, height: 44, borderRadius: 13,
        alignItems: 'center', justifyContent: 'center',
    },
    cardInfo: { flex: 1 },
    nameRow: {
        flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap',
    },
    deviceName: {
        fontSize: 15, fontWeight: '700', color: '#111', flexShrink: 1,
    },
    currentBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#22C55E',
        paddingHorizontal: 7, paddingVertical: 3,
        borderRadius: 8,
    },
    currentBadgeText: {
        fontSize: 10, fontWeight: '700', color: '#fff',
    },
    browserText: {
        fontSize: 12, color: '#6B7280', marginTop: 2,
    },

    // Details block
    detailsBlock: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#F3F4F6',
        gap: 7,
    },
    detailRow: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    detailIconBox: {
        width: 20, height: 20, borderRadius: 6,
        backgroundColor: '#F3F4F6',
        alignItems: 'center', justifyContent: 'center',
    },
    detailText: {
        fontSize: 12, color: '#6B7280', flex: 1,
    },

    // Revoke button
    revokeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 12,
        paddingVertical: 9,
        borderRadius: 12,
        backgroundColor: '#FEF2F2',
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    revokeBtnText: {
        fontSize: 13, fontWeight: '700', color: '#EF4444',
    },

    // ── Footer ────────────────────────────────────────────────────────────
    footerCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        backgroundColor: '#FFF7F7',
        borderWidth: 1,
        borderColor: '#FEE2E2',
        borderRadius: 16,
        padding: 14,
        marginTop: 8,
        marginBottom: 12,
    },
    footerIconBox: {
        width: 32, height: 32, borderRadius: 9,
        backgroundColor: '#FEE2E2',
        alignItems: 'center', justifyContent: 'center',
        marginTop: 1,
    },
    footerTextWrap: { flex: 1 },
    footerTitle: {
        fontSize: 13, fontWeight: '700', color: '#991B1B',
    },
    footerBody: {
        fontSize: 12, color: '#B91C1C', lineHeight: 17, marginTop: 3,
    },
    revokeAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 1.5,
        borderColor: '#FECACA',
        ...Platform.select({
            ios: {
                shadowColor: '#EF4444', shadowOpacity: 0.08,
                shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
            },
            android: { elevation: 1 },
        }),
    },
    revokeAllText: {
        fontSize: 14, fontWeight: '700', color: '#EF4444',
    },

    // ── Empty state ───────────────────────────────────────────────────────
    emptyWrap: {
        alignItems: 'center',
        paddingVertical: 60,
        gap: 10,
    },
    emptyIconBox: {
        width: 72, height: 72, borderRadius: 22,
        backgroundColor: '#F3F4F6',
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 4,
    },
    emptyTitle: {
        fontSize: 16, fontWeight: '700', color: '#9CA3AF',
    },
    emptyBody: {
        fontSize: 13, color: '#D1D5DB',
    },
});
