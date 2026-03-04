import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    RefreshControl,
    Platform,
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
} from 'lucide-react-native';


import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';

const { width } = require('react-native').Dimensions.get('window');

export default function SessionsScreen() {
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [userId, setUserId] = useState(null);

    // Load user info
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


    // Fetch sessions
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
                headers: { 'x-user-id': userId },
            });
            return res.data.sessions || [];
        },
        enabled: !!userId,
        staleTime: 30 * 1000,
    });

    // Revoke single session


    const revokeMutation = useMutation({
        mutationFn: async (sessionId) => {
            await api.delete(`/auth/sessions/${sessionId}`, {
                headers: { 'x-user-id': userId },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
        },
        onError: (err) => {
            Alert.alert('Error', 'Failed to revoke session. Please try again.');
        },
    });

    // Revoke all sessions
    const revokeAllMutation = useMutation({
        mutationFn: async () => {
            await api.post(
                '/auth/sessions/revoke-all',
                { currentSessionId },
                { headers: { 'x-user-id': userId } }
            );
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['sessions'] });
            Alert.alert('Done', 'All other sessions have been signed out.');
        },
        onError: (err) => {
            Alert.alert('Error', 'Failed to sign out other sessions.');
        },
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
        const otherCount = sessions.filter(
            (s) => s.id !== currentSessionId
        ).length;
        if (otherCount === 0) {
            Alert.alert('No other sessions', 'You only have this session active.');
            return;
        }
        Alert.alert(
            'Sign out everywhere?',
            `This will sign out ${otherCount} other device${otherCount > 1 ? 's' : ''}. You will stay logged in on this device.`,
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
            case 'mobile':
                return Smartphone;
            case 'tablet':
                return Tablet;
            case 'desktop':
                return Monitor;
            default:
                return Globe;
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
            day: 'numeric',
            month: 'short',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        });
    };

    const renderSession = ({ item: session }) => {
        const isCurrent = session.id === currentSessionId || session.isCurrent;
        const DeviceIcon = getDeviceIcon(session.deviceType);

        return (
            <View style={[styles.sessionCard, isCurrent && styles.currentSessionCard]}>
                <View style={styles.sessionHeader}>
                    <View
                        style={[
                            styles.iconContainer,
                            isCurrent && styles.currentIconContainer,
                        ]}
                    >
                        <DeviceIcon
                            size={22}
                            color={isCurrent ? '#0469ff' : '#64748b'}
                        />
                    </View>
                    <View style={styles.sessionInfo}>
                        <View style={styles.nameRow}>
                            <Text style={styles.deviceName} numberOfLines={1}>
                                {session.deviceName || session.os || 'Unknown Device'}
                            </Text>
                            {isCurrent && (
                                <View style={styles.currentBadge}>
                                    <ShieldCheck size={12} color="#fff" />
                                    <Text style={styles.currentBadgeText}>This device</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.browserInfo}>
                            {[session.browser, session.os].filter(Boolean).join(' · ') ||
                                'Unknown browser'}
                        </Text>
                    </View>
                </View>

                <View style={styles.sessionDetails}>
                    {session.location && (
                        <View style={styles.detailRow}>
                            <MapPin size={14} color="#94a3b8" />
                            <Text style={styles.detailText}>{session.location}</Text>
                        </View>
                    )}
                    <View style={styles.detailRow}>
                        <Clock size={14} color="#94a3b8" />
                        <Text style={styles.detailText}>
                            Last active {formatDate(session.lastActiveAt)}
                        </Text>
                    </View>
                </View>

                {!isCurrent && (
                    <HapticTouchable
                        style={styles.revokeButton}
                        onPress={() => handleRevoke(session)}
                        disabled={revokeMutation.isPending}
                    >
                        {revokeMutation.isPending &&
                            revokeMutation.variables === session.id ? (
                            <ActivityIndicator size="small" color="#ef4444" />
                        ) : (
                            <>
                                <LogOut size={16} color="#ef4444" />
                                <Text style={styles.revokeText}>Sign out</Text>
                            </>
                        )}
                    </HapticTouchable>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <StatusBar style="light" />
            {/* Header */}
            <LinearGradient
                colors={['#0469ff', '#0356d4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 8 }]}
            >
                <HapticTouchable
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <ArrowLeft size={22} color="#fff" />
                </HapticTouchable>
                <Text style={styles.headerTitle}>Active Sessions</Text>
                <View style={{ width: 40 }} />
            </LinearGradient>

            {/* Info banner */}
            <View style={styles.infoBanner}>
                <ShieldCheck size={18} color="#0469ff" />
                <Text style={styles.infoText}>
                    These are the devices currently logged into your account. If you see
                    an unfamiliar device, sign it out.
                </Text>
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#0469ff" />
                </View>
            ) : (
                <FlatList
                    data={sessions}
                    renderItem={renderSession}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={isFetching && !isLoading}
                            onRefresh={refetch}
                            tintColor="#0469ff"
                        />
                    }
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <ShieldCheck size={48} color="#cbd5e1" />
                            <Text style={styles.emptyTitle}>No active sessions</Text>
                            <Text style={styles.emptySubtitle}>
                                Your session information will appear here
                            </Text>
                        </View>
                    }
                    ListFooterComponent={
                        sessions.length > 1 ? (
                            <HapticTouchable
                                style={styles.revokeAllButton}
                                onPress={handleRevokeAll}
                                disabled={revokeAllMutation.isPending}
                            >
                                {revokeAllMutation.isPending ? (
                                    <ActivityIndicator size="small" color="#ef4444" />
                                ) : (
                                    <>
                                        <Trash2 size={18} color="#ef4444" />
                                        <Text style={styles.revokeAllText}>
                                            Sign out all other devices
                                        </Text>
                                    </>
                                )}
                            </HapticTouchable>
                        ) : null
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingBottom: 14,
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.3,
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#eff6ff',
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 8,
        padding: 14,
        borderRadius: 12,
        gap: 10,
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#475569',
        lineHeight: 18,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        padding: 16,
        paddingTop: 8,
        gap: 12,
        paddingBottom: 40,
    },
    sessionCard: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 16,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOpacity: 0.05,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 2 },
            },
            android: { elevation: 2 },
        }),
    },
    currentSessionCard: {
        borderWidth: 1.5,
        borderColor: '#bfdbfe',
        backgroundColor: '#f0f7ff',
    },
    sessionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    iconContainer: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    currentIconContainer: {
        backgroundColor: '#dbeafe',
    },
    sessionInfo: {
        flex: 1,
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    deviceName: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1e293b',
        flexShrink: 1,
    },
    currentBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#22c55e',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
    },
    currentBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#fff',
    },
    browserInfo: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 2,
    },
    sessionDetails: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        gap: 6,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    detailText: {
        fontSize: 13,
        color: '#64748b',
    },
    revokeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 14,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#fef2f2',
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    revokeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#ef4444',
    },
    revokeAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1.5,
        borderColor: '#fecaca',
    },
    revokeAllText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#ef4444',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        gap: 8,
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#94a3b8',
        marginTop: 8,
    },
    emptySubtitle: {
        fontSize: 13,
        color: '#cbd5e1',
    },
});
