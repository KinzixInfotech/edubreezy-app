// app/components/AttendanceReminderModal.js
// Reusable modal for attendance reminders with quick actions

import React, { useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, Modal, Pressable, Dimensions,
    Animated, TouchableWithoutFeedback
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAttendanceReminder, REMINDER_TYPES } from '../../contexts/AttendanceReminderContext';
import {
    Clock, AlertTriangle, LogIn, LogOut, X, ChevronRight, Bell
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';

const { width, height } = Dimensions.get('window');

const REMINDER_CONFIGS = {
    [REMINDER_TYPES.CHECK_IN_OPEN]: {
        icon: LogIn,
        iconColor: '#10B981',
        bgColor: '#D1FAE5',
        borderColor: '#10B981',
        actionText: 'Mark Attendance',
        actionRoute: '/(screens)/teachers/attendance',
    },
    [REMINDER_TYPES.LATE_WARNING]: {
        icon: AlertTriangle,
        iconColor: '#F59E0B',
        bgColor: '#FEF3C7',
        borderColor: '#F59E0B',
        actionText: 'Check In Now',
        actionRoute: '/(screens)/teachers/attendance',
    },
    [REMINDER_TYPES.CHECK_IN_CLOSED]: {
        icon: Clock,
        iconColor: '#EF4444',
        bgColor: '#FEE2E2',
        borderColor: '#EF4444',
        actionText: 'Request Regularization',
        actionRoute: '/(screens)/teachers/attendance',
    },
    [REMINDER_TYPES.CHECK_OUT_OPEN]: {
        icon: LogOut,
        iconColor: '#3B82F6',
        bgColor: '#DBEAFE',
        borderColor: '#3B82F6',
        actionText: 'Check Out',
        actionRoute: '/(screens)/teachers/attendance',
    },
    [REMINDER_TYPES.CHECK_OUT_WARNING]: {
        icon: Bell,
        iconColor: '#EF4444',
        bgColor: '#FEE2E2',
        borderColor: '#EF4444',
        actionText: 'Check Out Now',
        actionRoute: '/(screens)/teachers/attendance',
    },
};

export default function AttendanceReminderModal() {
    const router = useRouter();
    const { activeReminder, isReminderVisible, dismissReminder } = useAttendanceReminder();
    const slideAnim = useRef(new Animated.Value(height)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (isReminderVisible) {
            // Animate in
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.spring(slideAnim, {
                    toValue: 0,
                    tension: 65,
                    friction: 11,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            // Animate out
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: height,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [isReminderVisible]);

    if (!activeReminder) return null;

    const config = REMINDER_CONFIGS[activeReminder.type] || REMINDER_CONFIGS[REMINDER_TYPES.CHECK_IN_OPEN];
    const IconComponent = config.icon;

    const handleAction = () => {
        dismissReminder(false);
        router.push(config.actionRoute);
    };

    const handleDismiss = () => {
        dismissReminder(false);
    };

    const handleDontShowAgain = () => {
        dismissReminder(true);
    };

    const formatWindowEnd = (windowEnd) => {
        if (!windowEnd) return '';
        const date = new Date(windowEnd);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    return (
        <Modal
            visible={isReminderVisible}
            transparent
            animationType="none"
            statusBarTranslucent
            onRequestClose={handleDismiss}
        >
            <TouchableWithoutFeedback onPress={handleDismiss}>
                <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
                    <BlurView intensity={20} style={StyleSheet.absoluteFill} tint="dark" />
                </Animated.View>
            </TouchableWithoutFeedback>

            <Animated.View
                style={[
                    styles.container,
                    { transform: [{ translateY: slideAnim }] },
                ]}
            >
                <View style={styles.handle} />

                {/* Close button */}
                <Pressable style={styles.closeButton} onPress={handleDismiss}>
                    <X size={20} color="#6B7280" />
                </Pressable>

                {/* Icon */}
                <View style={[styles.iconContainer, { backgroundColor: config.bgColor }]}>
                    <IconComponent size={32} color={config.iconColor} />
                </View>

                {/* Content */}
                <Text style={styles.title}>{activeReminder.title}</Text>
                <Text style={styles.message}>{activeReminder.message}</Text>

                {activeReminder.windowEnd && (
                    <View style={styles.infoRow}>
                        <Clock size={14} color="#6B7280" />
                        <Text style={styles.infoText}>
                            Window closes at {formatWindowEnd(activeReminder.windowEnd)}
                        </Text>
                    </View>
                )}

                {activeReminder.isUrgent && (
                    <View style={[styles.urgentBadge]}>
                        <AlertTriangle size={14} color="#DC2626" />
                        <Text style={styles.urgentText}>Urgent</Text>
                    </View>
                )}

                {/* Action Button */}
                <Pressable
                    style={[styles.actionButton, { backgroundColor: config.iconColor }]}
                    onPress={handleAction}
                >
                    <Text style={styles.actionButtonText}>{config.actionText}</Text>
                    <ChevronRight size={18} color="#FFFFFF" />
                </Pressable>

                {/* Don't show again */}
                <Pressable style={styles.dontShowButton} onPress={handleDontShowAgain}>
                    <Text style={styles.dontShowText}>Don't remind me again today</Text>
                </Pressable>
            </Animated.View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 24,
        paddingTop: 12,
        paddingBottom: 40,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 20,
    },
    handle: {
        width: 40,
        height: 4,
        backgroundColor: '#D1D5DB',
        borderRadius: 2,
        marginBottom: 20,
    },
    closeButton: {
        position: 'absolute',
        top: 16,
        right: 16,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        fontSize: 15,
        color: '#6B7280',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 16,
        paddingHorizontal: 16,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#F9FAFB',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        marginBottom: 16,
    },
    infoText: {
        fontSize: 13,
        color: '#6B7280',
    },
    urgentBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginBottom: 16,
    },
    urgentText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#DC2626',
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        paddingVertical: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    actionButtonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    dontShowButton: {
        paddingVertical: 8,
    },
    dontShowText: {
        fontSize: 13,
        color: '#9CA3AF',
    },
});
