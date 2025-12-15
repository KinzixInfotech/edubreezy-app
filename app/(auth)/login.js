import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import fetchUser from '../../lib/queries/user';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    interpolate,
    Extrapolate,
    withSpring,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../../lib/supabase';
import { StatusBar } from 'expo-status-bar';

const { width, height } = Dimensions.get('window');

// Zod validation schemas
const LoginSchema = z.object({
    email: z
        .string()
        .min(1, 'Email is required')
        .email('Please enter a valid email address'),
    password: z
        .string()
        .min(6, 'Password must be at least 6 characters')
        .max(50, 'Password is too long'),
});

// Animated mesh gradient background with glow
const MeshGradientBackground = () => {
    const circle1 = useSharedValue(0);
    const circle2 = useSharedValue(0);
    const circle3 = useSharedValue(0);
    const circle4 = useSharedValue(0);

    useEffect(() => {
        circle1.value = withRepeat(withTiming(1, { duration: 6000 }), -1, true);
        circle2.value = withRepeat(withTiming(1, { duration: 8000 }), -1, true);
        circle3.value = withRepeat(withTiming(1, { duration: 10000 }), -1, true);
        circle4.value = withRepeat(withTiming(1, { duration: 7000 }), -1, true);
    }, []);

    const circle1Style = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(circle1.value, [0, 1], [-20, 60], Extrapolate.CLAMP) },
            { translateY: interpolate(circle1.value, [0, 1], [0, -50], Extrapolate.CLAMP) },
            { scale: interpolate(circle1.value, [0, 0.5, 1], [1, 1.15, 1], Extrapolate.CLAMP) },
        ],
        opacity: interpolate(circle1.value, [0, 0.5, 1], [0.3, 0.5, 0.3], Extrapolate.CLAMP),
    }));

    const circle2Style = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(circle2.value, [0, 1], [30, -80], Extrapolate.CLAMP) },
            { translateY: interpolate(circle2.value, [0, 1], [0, 70], Extrapolate.CLAMP) },
            { scale: interpolate(circle2.value, [0, 0.5, 1], [1, 1.2, 1], Extrapolate.CLAMP) },
        ],
        opacity: interpolate(circle2.value, [0, 0.5, 1], [0.25, 0.45, 0.25], Extrapolate.CLAMP),
    }));

    const circle3Style = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(circle3.value, [0, 1], [-40, 50], Extrapolate.CLAMP) },
            { translateY: interpolate(circle3.value, [0, 1], [30, -30], Extrapolate.CLAMP) },
            { scale: interpolate(circle3.value, [0, 0.5, 1], [1, 1.1, 1], Extrapolate.CLAMP) },
        ],
        opacity: interpolate(circle3.value, [0, 0.5, 1], [0.2, 0.4, 0.2], Extrapolate.CLAMP),
    }));

    const circle4Style = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(circle4.value, [0, 1], [20, -40], Extrapolate.CLAMP) },
            { translateY: interpolate(circle4.value, [0, 1], [-20, 60], Extrapolate.CLAMP) },
            { scale: interpolate(circle4.value, [0, 0.5, 1], [1, 1.25, 1], Extrapolate.CLAMP) },
        ],
        opacity: interpolate(circle4.value, [0, 0.5, 1], [0.28, 0.5, 0.28], Extrapolate.CLAMP),
    }));

    return (
        <View style={styles.meshContainer}>
            <Animated.View style={[styles.meshCircle, styles.circle1, circle1Style]} />
            <Animated.View style={[styles.meshCircle, styles.circle2, circle2Style]} />
            <Animated.View style={[styles.meshCircle, styles.circle3, circle3Style]} />
            <Animated.View style={[styles.meshCircle, styles.circle4, circle4Style]} />
        </View>
    );
};

// School info card component
const SchoolInfoCard = ({ schoolData }) => {
    const fadeIn = useSharedValue(0);
    const slideIn = useSharedValue(-30);
    const scale = useSharedValue(0.95);

    useEffect(() => {
        fadeIn.value = withTiming(1, { duration: 600 });
        slideIn.value = withTiming(0, { duration: 600 });
        scale.value = withSpring(1, { damping: 15, stiffness: 100 });
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: fadeIn.value,
        transform: [{ translateY: slideIn.value }, { scale: scale.value }],
    }));

    if (!schoolData) return null;

    return (
        <Animated.View style={[styles.schoolCardWrapper, animatedStyle]}>
            <BlurView intensity={50} tint="light" style={styles.schoolBlurCard}>
                <View style={styles.schoolCard}>
                    <View style={styles.schoolLogoContainer}>
                        <Image
                            source={{ uri: schoolData.profilePicture }}
                            style={styles.schoolLogo}
                            resizeMode="cover"
                        />
                    </View>
                    <Text style={styles.schoolName}>{schoolData.name}</Text>
                    <View style={styles.schoolCodeBadge}>
                        <Text style={styles.schoolCode}>{schoolData.schoolCode}</Text>
                    </View>
                </View>
            </BlurView>
        </Animated.View>
    );
};

export default function LoginScreen() {
    const insets = useSafeAreaInsets();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const { schoolConfig: schoolConfigParam } = useLocalSearchParams();
    const [schoolConfig, setSchoolConfig] = useState(null);

    const fadeIn = useSharedValue(0);
    const formSlide = useSharedValue(40);
    const buttonScale = useSharedValue(1);

    useEffect(() => {
        fadeIn.value = withTiming(1, { duration: 800 });
        formSlide.value = withTiming(0, { duration: 800 });

        if (schoolConfigParam) {
            try {
                const config = JSON.parse(schoolConfigParam || '{}');
                setSchoolConfig(config.school);
            } catch (error) {
                console.error('Error parsing school config:', error);
            }
        }
    }, [schoolConfigParam]);

    const handleLogin = async () => {
        setErrors({});

        try {
            const validated = LoginSchema.parse({ email: email.trim(), password });
            setLoading(true);

            // Button press animation
            buttonScale.value = withSequence(
                withTiming(0.95, { duration: 100 }),
                withTiming(1, { duration: 100 })
            );

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error || !data.user) {
                setErrors({ general: error?.message || 'Authorization Failed' });
                return;
            }

            const user = await fetchUser(data.user.id, data.session.access_token);

            if (!user) {
                await supabase.auth.signOut();
                setErrors({ general: 'User not found' });
                return;
            }

            await SecureStore.setItemAsync('user', JSON.stringify(user));
            await SecureStore.setItemAsync('userRole', JSON.stringify(user?.role?.name));

            router.replace('/(screens)/greeting');
        } catch (err) {
            if (err instanceof z.ZodError) {
                const fieldErrors = {};
                err.errors.forEach((error) => {
                    fieldErrors[error.path[0]] = error.message;
                });
                setErrors(fieldErrors);

                // Shake animation
                buttonScale.value = withSequence(
                    withTiming(1.03, { duration: 80 }),
                    withTiming(0.97, { duration: 80 }),
                    withTiming(1.03, { duration: 80 }),
                    withTiming(1, { duration: 80 })
                );
            }
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
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
            <StatusBar style="dark" />
            <View style={styles.container}>
                <MeshGradientBackground />

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.keyboardView}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        bounces={false}
                    >
                        <Animated.View style={[styles.content, containerStyle]}>
                            {/* School Info Card */}
                            {schoolConfig && <SchoolInfoCard schoolData={schoolConfig} />}

                            {/* Welcome Text */}
                            <View style={styles.welcomeSection}>
                                <Text style={styles.welcomeTitle}>Welcome!</Text>
                                <Text style={styles.welcomeSubtitle}>
                                    Sign in to EduBreezy
                                </Text>
                            </View>

                            {/* Login Form */}
                            <Animated.View style={[styles.formWrapper, formAnimatedStyle]}>
                                <BlurView intensity={60} tint="light" style={styles.formBlurCard}>
                                    <View style={styles.formContainer}>
                                        {/* General Error */}
                                        {errors.general && (
                                            <View style={styles.generalError}>
                                                <Text style={styles.generalErrorText}>⚠️ {errors.general}</Text>
                                            </View>
                                        )}

                                        {/* Email Input */}
                                        <View style={styles.inputGroup}>
                                            <Text style={styles.inputLabel}>Email Address</Text>
                                            <View
                                                style={[
                                                    styles.inputWrapper,
                                                    errors.email && styles.inputWrapperError,
                                                ]}
                                            >
                                                <Text style={styles.inputIcon}>✉️</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="Enter your email"
                                                    placeholderTextColor="#94A3B8"
                                                    value={email}
                                                    onChangeText={(text) => {
                                                        setEmail(text);
                                                        if (errors.email) {
                                                            setErrors({ ...errors, email: null });
                                                        }
                                                    }}
                                                    keyboardType="email-address"
                                                    autoCapitalize="none"
                                                    autoCorrect={false}
                                                    returnKeyType="next"
                                                />
                                            </View>
                                            {errors.email && (
                                                <Text style={styles.errorText}>⚠️ {errors.email}</Text>
                                            )}
                                        </View>

                                        {/* Password Input */}
                                        <View style={styles.inputGroup}>
                                            <Text style={styles.inputLabel}>Password</Text>
                                            <View
                                                style={[
                                                    styles.inputWrapper,
                                                    errors.password && styles.inputWrapperError,
                                                ]}
                                            >
                                                <Text style={styles.inputIcon}>🔒</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    placeholder="Enter your password"
                                                    placeholderTextColor="#94A3B8"
                                                    value={password}
                                                    onChangeText={(text) => {
                                                        setPassword(text);
                                                        if (errors.password) {
                                                            setErrors({ ...errors, password: null });
                                                        }
                                                    }}
                                                    secureTextEntry={!showPassword}
                                                    autoCapitalize="none"
                                                    autoCorrect={false}
                                                    returnKeyType="done"
                                                    onSubmitEditing={handleLogin}
                                                />
                                                <TouchableOpacity
                                                    onPress={() => setShowPassword(!showPassword)}
                                                    style={styles.eyeButton}
                                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                >
                                                    <Text style={styles.eyeIcon}>
                                                        {showPassword ? '👁️' : '👁️‍🗨️'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                            {errors.password && (
                                                <Text style={styles.errorText}>⚠️ {errors.password}</Text>
                                            )}
                                        </View>

                                        {/* Forgot Password */}
                                        <TouchableOpacity style={styles.forgotPassword}>
                                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                                        </TouchableOpacity>

                                        {/* Login Button */}
                                        <Animated.View style={buttonScaleStyle}>
                                            <TouchableOpacity
                                                style={styles.loginButtonWrapper}
                                                onPress={handleLogin}
                                                disabled={loading}
                                                activeOpacity={0.85}
                                            >
                                                <LinearGradient
                                                    colors={loading ? ['#94a3b8', '#94a3b8'] : ['#0a57d2', '#1d4ed8']}
                                                    start={{ x: 0, y: 0 }}
                                                    end={{ x: 1, y: 1 }}
                                                    style={styles.loginButton}
                                                >
                                                    {loading ? (
                                                        <View style={styles.loadingContainer}>
                                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                                            <Text style={styles.loginButtonText}>Signing in...</Text>
                                                        </View>
                                                    ) : (
                                                        <Text style={styles.loginButtonText}>Sign In</Text>
                                                    )}
                                                </LinearGradient>
                                            </TouchableOpacity>
                                        </Animated.View>
                                    </View>
                                </BlurView>
                            </Animated.View>

                            {/* Footer */}
                            <View style={styles.footer}>
                                <Text style={styles.footerText}>
                                    Don't have an account?{' '}
                                    <Text style={styles.footerLink}>Contact Admin</Text>
                                </Text>
                            </View>
                        </Animated.View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    meshContainer: {
        ...StyleSheet.absoluteFillObject,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
    },
    meshCircle: {
        position: 'absolute',
        borderRadius: 9999,
    },
    circle1: {
        width: width * 0.85,
        height: width * 0.85,
        backgroundColor: '#0b5cde',
        top: -width * 0.35,
        left: -width * 0.25,
    },
    circle2: {
        width: width * 0.7,
        height: width * 0.7,
        backgroundColor: '#3b82f6',
        top: height * 0.2,
        right: -width * 0.35,
    },
    circle3: {
        width: width * 0.95,
        height: width * 0.95,
        backgroundColor: '#0b5cde',
        bottom: -width * 0.45,
        left: -width * 0.35,
    },
    circle4: {
        width: width * 0.55,
        height: width * 0.55,
        backgroundColor: '#60a5fa',
        bottom: height * 0.2,
        right: -width * 0.2,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingTop: 30,
        justifyContent: 'center',
    },
    schoolCardWrapper: {
        marginBottom: 24,
        borderRadius: 20,
        overflow: 'hidden',
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 8,
    },
    schoolBlurCard: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    schoolCard: {
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        paddingVertical: 20,
        paddingHorizontal: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    schoolLogoContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        overflow: 'hidden',
        marginBottom: 12,
        borderWidth: 3,
        borderColor: '#0b5cde',
        shadowColor: '#0b5cde',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    schoolLogo: {
        width: '100%',
        height: '100%',
    },
    schoolName: {
        fontSize: Math.min(width * 0.048, 19),
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 6,
        letterSpacing: -0.3,
    },
    schoolCodeBadge: {
        backgroundColor: '#EFF6FF',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    schoolCode: {
        fontSize: 13,
        fontWeight: '700',
        color: '#0b5cde',
        letterSpacing: 0.5,
    },
    welcomeSection: {
        marginBottom: 24,
    },
    welcomeTitle: {
        fontSize: Math.min(width * 0.08, 32),
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    welcomeSubtitle: {
        fontSize: Math.min(width * 0.04, 16),
        color: '#64748B',
        fontWeight: '500',
    },
    formWrapper: {
        borderRadius: 24,
        overflow: 'hidden',
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 12,
    },
    formBlurCard: {
        borderRadius: 24,
        overflow: 'hidden',
    },
    formContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.88)',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.5)',
    },
    generalError: {
        backgroundColor: '#FEE2E2',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    generalErrorText: {
        color: '#DC2626',
        fontSize: 14,
        fontWeight: '600',
    },
    inputGroup: {
        marginBottom: 18,
    },
    inputLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 10,
        letterSpacing: -0.2,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 14,
        borderWidth: 2,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
    },
    inputWrapperError: {
        borderColor: '#FCA5A5',
        backgroundColor: '#FEF2F2',
    },
    inputIcon: {
        fontSize: 18,
        marginRight: 10,
    },
    input: {
        flex: 1,
        paddingVertical: 16,
        fontSize: 16,
        color: '#1E293B',
        fontWeight: '600',
    },
    eyeButton: {
        padding: 8,
    },
    eyeIcon: {
        fontSize: 18,
    },
    errorText: {
        fontSize: 13,
        color: '#DC2626',
        marginTop: 8,
        fontWeight: '600',
    },
    forgotPassword: {
        alignSelf: 'flex-end',
        marginBottom: 20,
    },
    forgotPasswordText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0b5cde',
    },
    loginButtonWrapper: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    loginButton: {
        paddingVertical: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    loginButtonText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.3,
    },
    footer: {
        marginTop: 28,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 14,
        color: '#64748B',
        fontWeight: '500',
    },
    footerLink: {
        color: '#0b5cde',
        fontWeight: '700',
    },
});