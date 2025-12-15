// Driver/Conductor Login Screen for Transport Staff
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE_URL } from '../../../lib/api';

const { width } = Dimensions.get('window');

export default function TransportLoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const fadeIn = useSharedValue(0);
    const formSlide = useSharedValue(40);
    const buttonScale = useSharedValue(1);

    useEffect(() => {
        fadeIn.value = withTiming(1, { duration: 800 });
        formSlide.value = withTiming(0, { duration: 800 });
    }, []);

    const handleLogin = async () => {
        setErrors({});

        if (!email.trim()) {
            setErrors({ email: 'Email is required' });
            return;
        }
        if (!password || password.length < 6) {
            setErrors({ password: 'Password must be at least 6 characters' });
            return;
        }

        setLoading(true);
        buttonScale.value = withSequence(
            withTiming(0.95, { duration: 100 }),
            withTiming(1, { duration: 100 })
        );

        try {
            const response = await fetch(`${API_BASE_URL}/api/mobile/transport/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password }),
            });

            const data = await response.json();

            if (!response.ok) {
                setErrors({ general: data.error || 'Login failed' });
                return;
            }

            // Store auth data
            await SecureStore.setItemAsync('transportUser', JSON.stringify(data.user));
            await SecureStore.setItemAsync('transportStaff', JSON.stringify(data.transportStaff));
            await SecureStore.setItemAsync('transportToken', data.accessToken);
            await SecureStore.setItemAsync('transportRefreshToken', data.refreshToken);
            await SecureStore.setItemAsync('todayTrips', JSON.stringify(data.todayTrips));

            // Route based on role
            if (data.transportStaff.role === 'DRIVER') {
                router.replace('/(screens)/transport/driver-dashboard');
            } else if (data.transportStaff.role === 'CONDUCTOR') {
                router.replace('/(screens)/transport/conductor-dashboard');
            }
        } catch (err) {
            setErrors({ general: 'Network error. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const containerStyle = useAnimatedStyle(() => ({
        opacity: fadeIn.value,
    }));

    const formAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: formSlide.value }],
        opacity: fadeIn.value,
    }));

    const buttonScaleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: buttonScale.value }],
    }));

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="light" />
            <LinearGradient colors={['#1e3a5f', '#0f172a']} style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                >
                    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                        <Animated.View style={[styles.content, containerStyle]}>
                            {/* Header */}
                            <View style={styles.headerSection}>
                                <View style={styles.iconContainer}>
                                    <Ionicons name="bus" size={48} color="#fff" />
                                </View>
                                <Text style={styles.headerTitle}>Transport Staff</Text>
                                <Text style={styles.headerSubtitle}>Driver & Conductor Login</Text>
                            </View>

                            {/* Form */}
                            <Animated.View style={[styles.formContainer, formAnimatedStyle]}>
                                {errors.general && (
                                    <View style={styles.generalError}>
                                        <Ionicons name="warning" size={18} color="#DC2626" />
                                        <Text style={styles.generalErrorText}>{errors.general}</Text>
                                    </View>
                                )}

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Email Address</Text>
                                    <View style={[styles.inputWrapper, errors.email && styles.inputWrapperError]}>
                                        <Ionicons name="mail-outline" size={20} color="#64748B" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Enter your email"
                                            placeholderTextColor="#94A3B8"
                                            value={email}
                                            onChangeText={(text) => {
                                                setEmail(text);
                                                if (errors.email) setErrors({ ...errors, email: null });
                                            }}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                        />
                                    </View>
                                    {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Password</Text>
                                    <View style={[styles.inputWrapper, errors.password && styles.inputWrapperError]}>
                                        <Ionicons name="lock-closed-outline" size={20} color="#64748B" style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Enter your password"
                                            placeholderTextColor="#94A3B8"
                                            value={password}
                                            onChangeText={(text) => {
                                                setPassword(text);
                                                if (errors.password) setErrors({ ...errors, password: null });
                                            }}
                                            secureTextEntry={!showPassword}
                                            autoCapitalize="none"
                                        />
                                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                                            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#64748B" />
                                        </TouchableOpacity>
                                    </View>
                                    {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
                                </View>

                                <Animated.View style={buttonScaleStyle}>
                                    <TouchableOpacity
                                        style={styles.loginButtonWrapper}
                                        onPress={handleLogin}
                                        disabled={loading}
                                        activeOpacity={0.85}
                                    >
                                        <LinearGradient
                                            colors={loading ? ['#94a3b8', '#94a3b8'] : ['#10b981', '#059669']}
                                            start={{ x: 0, y: 0 }}
                                            end={{ x: 1, y: 1 }}
                                            style={styles.loginButton}
                                        >
                                            {loading ? (
                                                <View style={styles.loadingContainer}>
                                                    <ActivityIndicator size="small" color="#fff" />
                                                    <Text style={styles.loginButtonText}>Signing in...</Text>
                                                </View>
                                            ) : (
                                                <Text style={styles.loginButtonText}>Sign In</Text>
                                            )}
                                        </LinearGradient>
                                    </TouchableOpacity>
                                </Animated.View>
                            </Animated.View>

                            <Text style={styles.footerText}>
                                Contact admin if you don't have login credentials
                            </Text>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    container: { flex: 1 },
    keyboardView: { flex: 1 },
    scrollContent: { flexGrow: 1, justifyContent: 'center' },
    content: { flex: 1, paddingHorizontal: 24, paddingVertical: 40 },
    headerSection: { alignItems: 'center', marginBottom: 40 },
    iconContainer: {
        width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center', alignItems: 'center', marginBottom: 20,
    },
    headerTitle: { fontSize: 28, fontWeight: '800', color: '#fff', marginBottom: 8 },
    headerSubtitle: { fontSize: 16, color: '#94A3B8', fontWeight: '500' },
    formContainer: {
        backgroundColor: '#fff', borderRadius: 24, padding: 24,
        shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10,
    },
    generalError: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#FEE2E2', padding: 12, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA',
    },
    generalErrorText: { color: '#DC2626', fontSize: 14, fontWeight: '600', flex: 1 },
    inputGroup: { marginBottom: 18 },
    inputLabel: { fontSize: 15, fontWeight: '700', color: '#1E293B', marginBottom: 10 },
    inputWrapper: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC',
        borderRadius: 12, borderWidth: 2, borderColor: '#E2E8F0', paddingHorizontal: 14,
    },
    inputWrapperError: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#1E293B', fontWeight: '500' },
    errorText: { fontSize: 13, color: '#DC2626', marginTop: 6, fontWeight: '500' },
    loginButtonWrapper: { borderRadius: 14, overflow: 'hidden', marginTop: 8 },
    loginButton: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
    loadingContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    loginButtonText: { fontSize: 17, fontWeight: '700', color: '#fff' },
    footerText: { textAlign: 'center', color: '#94A3B8', marginTop: 24, fontSize: 14 },
});
