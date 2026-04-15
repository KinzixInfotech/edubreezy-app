import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Linking,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as StoreReview from 'expo-store-review';
import {
    markReviewPromptCompleted,
    markReviewPromptDismissed,
    markReviewPromptSeen,
    shouldShowReviewPrompt,
} from '../../lib/reviewPrompt';

const BLOCKED_ROUTE_PARTS = ['(auth)', 'greeting'];

export default function AppReviewPrompt({
    loggedInUserId,
    blocked = false,
}) {
    const pathname = usePathname();
    const [visible, setVisible] = useState(false);
    const [rating, setRating] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    const canRenderOnRoute = useMemo(() => {
        if (!pathname) return false;
        return !BLOCKED_ROUTE_PARTS.some((part) => pathname.includes(part));
    }, [pathname]);

    useEffect(() => {
        if (!loggedInUserId || blocked || !canRenderOnRoute || visible) return;

        let cancelled = false;
        const timer = setTimeout(async () => {
            const shouldShow = await shouldShowReviewPrompt();
            if (!cancelled && shouldShow) {
                await markReviewPromptSeen();
                setRating(0);
                setVisible(true);
            }
        }, 1200);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [loggedInUserId, blocked, canRenderOnRoute, visible]);

    const closePrompt = useCallback(async (reason = 'cancel') => {
        setVisible(false);
        setRating(0);
        await markReviewPromptDismissed(reason);
    }, []);

    const handleSubmit = useCallback(async () => {
        if (!rating || submitting) return;
        setSubmitting(true);

        try {
            if (rating >= 5) {
                await markReviewPromptCompleted();
                setVisible(false);
                setRating(0);

                if (await StoreReview.hasAction()) {
                    await StoreReview.requestReview();
                } else {
                    const url = StoreReview.storeUrl();

                    if (url) {
                        Linking.openURL(url);
                    }
                }
                return;
            }

            await closePrompt('low_rating');
        } finally {
            setSubmitting(false);
        }
    }, [rating, submitting, closePrompt]);

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="fade"
            transparent
            onRequestClose={() => closePrompt('cancel')}
        >
            <Pressable style={styles.backdrop} onPress={() => closePrompt('cancel')}>
                <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
                    <Text style={styles.title}>Enjoying EduBreezy?</Text>
                    <Text style={styles.body}>
                        If you like the app, give us 5 stars. Your support really helps.
                    </Text>

                    <View style={styles.starsRow}>
                        {[1, 2, 3, 4, 5].map((value) => (
                            <Pressable
                                key={value}
                                onPress={() => setRating(value)}
                                hitSlop={10}
                                style={styles.starButton}
                            >
                                <Ionicons
                                    name={value <= rating ? 'star' : 'star-outline'}
                                    size={34}
                                    color={value <= rating ? '#f59e0b' : '#cbd5e1'}
                                />
                            </Pressable>
                        ))}
                    </View>

                    <View style={styles.actionsRow}>
                        <Pressable
                            onPress={() => closePrompt('cancel')}
                            style={[styles.actionButton, styles.secondaryButton]}
                        >
                            <Text style={styles.secondaryText}>Not now</Text>
                        </Pressable>
                        <Pressable
                            onPress={handleSubmit}
                            disabled={!rating || submitting}
                            style={[
                                styles.actionButton,
                                styles.primaryButton,
                                (!rating || submitting) && styles.primaryButtonDisabled,
                            ]}
                        >
                            <Text style={styles.primaryText}>
                                {rating >= 5 ? 'Rate now' : 'Submit'}
                            </Text>
                        </Pressable>
                    </View>

                    <Text style={styles.helperText}>
                        {rating >= 5
                            ? `You'll see the ${Platform.OS === 'ios' ? 'App Store' : 'Play Store'} review sheet next.`
                            : 'Choose 5 stars to open the store review sheet.'}
                    </Text>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(15,23,42,0.35)',
        justifyContent: 'center',
        paddingHorizontal: 22,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 24,
        paddingHorizontal: 22,
        paddingVertical: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.16,
        shadowRadius: 24,
        elevation: 12,
    },
    title: {
        fontSize: 24,
        fontWeight: '800',
        color: '#0f172a',
        textAlign: 'center',
    },
    body: {
        marginTop: 10,
        fontSize: 15,
        lineHeight: 22,
        color: '#64748b',
        textAlign: 'center',
    },
    starsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginTop: 22,
        marginBottom: 20,
    },
    starButton: {
        padding: 2,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    actionButton: {
        flex: 1,
        minHeight: 48,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButton: {
        backgroundColor: '#f1f5f9',
    },
    primaryButton: {
        backgroundColor: '#0469ff',
    },
    primaryButtonDisabled: {
        opacity: 0.45,
    },
    secondaryText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#334155',
    },
    primaryText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    helperText: {
        marginTop: 12,
        fontSize: 12,
        color: '#94a3b8',
        textAlign: 'center',
    },
});
