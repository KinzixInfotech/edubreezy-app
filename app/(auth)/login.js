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
} from 'react-native';
import fetchUser from '../../lib/queries/user';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    withSequence,
    interpolate,
    Extrapolate,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store'
import { useLocalSearchParams } from 'expo-router';;
import { z } from 'zod';
import { BlurView } from 'expo-blur';
import { supabase } from '../../lib/supabase'
const { width, height } = Dimensions.get('window');

// Zod validation schemas
const LoginSchema = z.object({
    email: z.string()
        .min(1, 'Email is required')
        .email('Please enter a valid email address'),
    password: z.string()
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
        circle1.value = withRepeat(
            withTiming(1, { duration: 4000 }),
            -1,
            true
        );
        circle2.value = withRepeat(
            withTiming(1, { duration: 5000 }),
            -1,
            true
        );
        circle3.value = withRepeat(
            withTiming(1, { duration: 6000 }),
            -1,
            true
        );
        circle4.value = withRepeat(
            withTiming(1, { duration: 7000 }),
            -1,
            true
        );
    }, []);

    const circle1Style = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: interpolate(
                    circle1.value,
                    [0, 1],
                    [0, 100],
                    Extrapolate.CLAMP
                ),
            },
            {
                translateY: interpolate(
                    circle1.value,
                    [0, 1],
                    [0, -80],
                    Extrapolate.CLAMP
                ),
            },
        ],
    }));

    const circle2Style = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: interpolate(
                    circle2.value,
                    [0, 1],
                    [0, -120],
                    Extrapolate.CLAMP
                ),
            },
            {
                translateY: interpolate(
                    circle2.value,
                    [0, 1],
                    [0, 100],
                    Extrapolate.CLAMP
                ),
            },
        ],
    }));

    const circle3Style = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: interpolate(
                    circle3.value,
                    [0, 1],
                    [0, 80],
                    Extrapolate.CLAMP
                ),
            },
            {
                translateY: interpolate(
                    circle3.value,
                    [0, 1],
                    [0, 120],
                    Extrapolate.CLAMP
                ),
            },
        ],
    }));
    const circle4Style = useAnimatedStyle(() => ({
        transform: [
            {
                translateX: interpolate(
                    circle4.value,
                    [0, 1],
                    [0, -60],
                    Extrapolate.CLAMP
                ),
            },
            {
                translateY: interpolate(
                    circle4.value,
                    [0, 1],
                    [0, -100],
                    Extrapolate.CLAMP
                ),
            },
        ],
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
    const slideIn = useSharedValue(-50);

    useEffect(() => {
        fadeIn.value = withTiming(1, { duration: 800 });
        slideIn.value = withTiming(0, { duration: 800 });
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: fadeIn.value,
        transform: [{ translateY: slideIn.value }],
    }));

    if (!schoolData) return null;

    return (
        <Animated.View style={[styles.schoolCard, animatedStyle]}>
            <View style={styles.schoolLogoContainer}>
                <Image
                    source={{ uri: schoolData.profilePicture }}
                    style={styles.schoolLogo}
                    resizeMode="cover"
                />
            </View>
            <Text style={styles.schoolName}>{schoolData.name}</Text>
            <Text style={styles.schoolCode}>{schoolData.schoolCode}</Text>
        </Animated.View>
    );
};

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    // const [schoolConfig, setSchoolConfig] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const { schoolConfig: schoolConfigParam } = useLocalSearchParams();
    const [schoolConfig, setSchoolConfig] = useState(null);

    const fadeIn = useSharedValue(0);
    const buttonScale = useSharedValue(1);
    useEffect(() => {
        // setLoading(false)
        fadeIn.value = withTiming(1, { duration: 1000 });
        if (schoolConfigParam) {
            try {
                const config = JSON.parse(schoolConfigParam || '{}');
                setSchoolConfig(config.school);
                // console.log(config);
            } catch (error) {
                console.error('Error parsing school config:', error);
            }
        }
    }, [schoolConfigParam]);
    // useEffect(() => {
    // fadeIn.value = withTiming(1, { duration: 1000 });
    //     fetchSchoolConfig();
    // }, []);

    // const fetchSchoolConfig = () => {
    //     try {
    //         const { schoolConfig } = useLocalSearchParams();

    //         if (schoolConfig) {
    //             const config = JSON.parse(schoolConfig || '{}');
    //             setSchoolConfig(config);
    //             console.log(config);

    //         }
    //     } catch (error) {
    //         console.error('Error fetching school config:', error);
    //     }
    // };

    // const handleLogin = async () => {
    //     // Clear previous errors
    //     setErrors({});

    //     try {
    //         // Validate form data
    //         const validated = LoginSchema.parse({
    //             email: email.trim(),
    //             password,
    //         });

    //         setLoading(true);

    //         // 1. Authenticate with Supabase
    //         const { data, error } = await supabase.auth.signInWithPassword({
    //             email,
    //             password,
    //         });

    //         if (error || !data.user) {
    //             // setErrorMsg(error?.message || "Login failed");
    //             setErrors('Authorization Failed');

    //             console.error("Authorization Failed", { description: error?.message });
    //             return;
    //         }
    //         console.log(data);

    //         // 2. Fetch user data securely from your API (by userId)
    //         const { data: user, isLoading, error: err } = useUser(data.user.id, data.session.access_token);

    //         if (!isLoading && !user) {
    //             await supabase.auth.signOut();
    //             setErrors('User not found');
    //             return;
    //         }

    //         // 3. Success → store user in local state/cache
    //         // toast.success(`Welcome back, ${result.name || result.email}`);
    //         await SecureStore.setItemAsync("user", JSON.stringify(user));
    //         router.replace('/(tabs)/home');

    //         // Simulate API call
    //         // setTimeout(() => {
    //         //     setLoading(false);
    //         // }, 1500);
    //         setLoading(false);

    //     } catch (err) {
    //         if (err instanceof z.ZodError) {
    //             const fieldErrors = {};
    //             err.errors.forEach((error) => {
    //                 fieldErrors[error.path[0]] = error.message;
    //             });
    //             setErrors(fieldErrors);

    //             // Shake animation
    //             buttonScale.value = withSequence(
    //                 withTiming(1.05, { duration: 100 }),
    //                 withTiming(0.95, { duration: 100 }),
    //                 withTiming(1.05, { duration: 100 }),
    //                 withTiming(1, { duration: 100 })
    //             );
    //         }
    //     }
    // };
    const handleLogin = async () => {
        setErrors({});

        try {
            const validated = LoginSchema.parse({ email: email.trim(), password });
            setLoading(true);

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error || !data.user) {
                setErrors('Authorization Failed');
                console.error("Authorization Failed", error?.message);
                return;
            }

            // ✅ Call API directly here (not hook)
            const user = await fetchUser(data.user.id, data.session.access_token);

            if (!user) {
                await supabase.auth.signOut();
                setErrors('User not found');
                return;
            }

            await SecureStore.setItemAsync("user", JSON.stringify(user));
            await SecureStore.setItemAsync("userRole", JSON.stringify(user?.role?.name));
            
            router.replace('/(tabs)/home');
        } catch (err) {
            // error handling same as before
        } finally {
            setLoading(false);
        }
    };

    const containerStyle = useAnimatedStyle(() => ({
        opacity: fadeIn.value,
    }));

    const buttonScaleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: buttonScale.value }],
    }));

    return (
        <View style={styles.container}>
            <MeshGradientBackground />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Animated.View style={[styles.content, containerStyle]}>
                        {/* School Info Card */}
                        {schoolConfig && <SchoolInfoCard schoolData={schoolConfig} />}

                        {/* Welcome Text */}
                        <View style={styles.welcomeSection}>
                            <Text style={styles.welcomeTitle}>Welcome Back!</Text>
                            <Text style={styles.welcomeSubtitle}>
                                Sign in to continue to Edubreezy
                            </Text>
                        </View>

                        {/* Login Form */}
                        <View style={styles.formContainer}>
                            {/* Email Input */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Email Address</Text>
                                <View style={[
                                    styles.inputWrapper,
                                    errors.email && styles.inputWrapperError
                                ]}>
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
                                <View style={[
                                    styles.inputWrapper,
                                    errors.password && styles.inputWrapperError
                                ]}>
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
                                <Text style={styles.forgotPasswordText}>
                                    Forgot Password?
                                </Text>
                            </TouchableOpacity>

                            {/* Login Button */}
                            <Animated.View style={buttonScaleStyle}>
                                <TouchableOpacity
                                    style={[
                                        styles.loginButton,
                                        loading && styles.loginButtonDisabled
                                    ]}
                                    onPress={handleLogin}
                                    disabled={loading}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.loginButtonText}>
                                        {loading ? '⏳ Signing in...' : 'Sign In'}
                                    </Text>
                                </TouchableOpacity>
                            </Animated.View>
                        </View>

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
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    meshContainer: {
        position: 'absolute',
        width: width,
        height: height,
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
    },
    meshCircle: {
        position: 'absolute',
        borderRadius: 9999,
    },
    circle1: {
        width: 350,
        height: 350,
        backgroundColor: '#0b5cde',
        opacity: 0.15,
        top: -150,
        left: -100,
        shadowColor: '#0b5cde',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 150,
        elevation: 20,
    },
    circle2: {
        width: 280,
        height: 280,
        backgroundColor: '#3b82f6',
        opacity: 0.12,
        top: 150,
        right: -120,
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 120,
        elevation: 18,
    },
    circle3: {
        width: 400,
        height: 400,
        backgroundColor: '#0b5cde',
        opacity: 0.1,
        bottom: -180,
        left: -150,
        shadowColor: '#0b5cde',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 180,
        elevation: 22,
    },
    circle4: {
        width: 250,
        height: 250,
        backgroundColor: '#60a5fa',
        opacity: 0.13,
        bottom: 150,
        right: -80,
        shadowColor: '#60a5fa',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 130,
        elevation: 19,
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
        paddingTop: 60,
        paddingBottom: 40,
    },
    schoolCard: {
        alignItems: 'center',
        marginBottom: 40,
        backgroundColor: '#FFFFFF',
        paddingVertical: 24,
        paddingHorizontal: 20,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#E0E7FF',
    },
    schoolLogoContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        overflow: 'hidden',
        marginBottom: 12,
        borderWidth: 3,
        borderColor: '#0b5cde',
    },
    schoolLogo: {
        width: '100%',
        height: '100%',
    },
    schoolName: {
        fontSize: 20,
        fontWeight: '800',
        color: '#0F172A',
        textAlign: 'center',
        marginBottom: 4,
    },
    schoolCode: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0b5cde',
    },
    welcomeSection: {

        marginBottom: 32,
    },
    welcomeTitle: {
        fontSize: 32,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
    },
    welcomeSubtitle: {
        fontSize: 16,
        color: '#64748B',
        fontWeight: '500',
    },
    formContainer: {
        backgroundColor: '#FFFFFF',
        borderRadius: 24,
        padding: 24,
        borderWidth: 2,
        borderColor: '#E0E7FF',
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 8,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#E2E8F0',
        paddingHorizontal: 14,
    },
    inputWrapperError: {
        borderColor: '#EF4444',
    },
    inputIcon: {
        fontSize: 20,
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
        fontSize: 20,
    },
    errorText: {
        fontSize: 13,
        color: '#EF4444',
        marginTop: 6,
        fontWeight: '600',
    },
    forgotPassword: {
        alignSelf: 'flex-end',
        marginBottom: 24,
    },
    forgotPasswordText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#0b5cde',
    },
    loginButton: {
        backgroundColor: '#0b5cde',
        paddingVertical: 18,
        borderRadius: 12,
        alignItems: 'center',
    },
    loginButtonDisabled: {
        opacity: 0.6,
    },
    loginButtonText: {
        fontSize: 18,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    footer: {
        marginTop: 32,
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