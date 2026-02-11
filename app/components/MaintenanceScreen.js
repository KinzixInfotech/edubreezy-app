import React, { useState, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Animated,
    Easing,
    TouchableOpacity,
    Dimensions,
    StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

export default function MaintenanceScreen({ message, onRetry }) {
    const [refreshing, setRefreshing] = useState(false);
    const spinAnim = useRef(new Animated.Value(0)).current;

    const spin = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    const handleRetry = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);

        // Start continuous spin
        const loop = Animated.loop(
            Animated.timing(spinAnim, {
                toValue: 1,
                duration: 600,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        );
        loop.start();

        try {
            await onRetry?.();
        } finally {
            // Let it spin for at least 1.5s so it feels like it's checking
            setTimeout(() => {
                loop.stop();
                spinAnim.setValue(0);
                setRefreshing(false);
            }, 1500);
        }
    }, [refreshing, onRetry, spinAnim]);

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

            <View style={styles.content}>
                {/* Icon */}
                <View style={styles.iconContainer}>
                    <Ionicons name="construct" size={80} color="#e94560" />
                </View>

                {/* Title */}
                <Text style={styles.title}>Under Maintenance</Text>

                {/* Message */}
                <Text style={styles.message}>
                    {message || "We're performing scheduled maintenance to improve your experience. Please check back shortly."}
                </Text>

                {/* Retry button */}
                <TouchableOpacity
                    style={[styles.retryButton, refreshing && styles.retryButtonDisabled]}
                    onPress={handleRetry}
                    activeOpacity={0.8}
                    disabled={refreshing}
                >
                    <Animated.View style={{ transform: [{ rotate: spin }], marginRight: 8 }}>
                        <Ionicons name="refresh" size={20} color="#fff" />
                    </Animated.View>
                    <Text style={styles.retryText}>{refreshing ? 'Checking...' : 'Try Again'}</Text>
                </TouchableOpacity>

                {/* Status hint */}
                <Text style={styles.hint}>
                    This usually takes a few minutes
                </Text>
            </View>

            {/* Bottom branding */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>EduBreezy</Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#1a1a2e',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999,
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    iconContainer: {
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(233, 69, 96, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 30,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 16,
        textAlign: 'center',
    },
    message: {
        fontSize: 16,
        color: '#a0a0b0',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 32,
    },
    retryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e94560',
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 12,
        marginBottom: 16,
    },
    retryButtonDisabled: {
        opacity: 0.7,
    },
    retryText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    hint: {
        fontSize: 13,
        color: '#666680',
        marginTop: 8,
    },
    footer: {
        position: 'absolute',
        bottom: 40,
    },
    footerText: {
        color: '#444460',
        fontSize: 14,
        fontWeight: '600',
    },
});
