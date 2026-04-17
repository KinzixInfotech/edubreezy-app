import React, { useState, useEffect, useRef } from 'react';
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
    Alert,
    useWindowDimensions,
    Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import fetchUser from '../../lib/queries/user';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    withRepeat,
    withDelay,
    Easing,
    interpolate,
    FadeIn,
    FadeInDown,
    FadeInUp,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useLocalSearchParams } from 'expo-router';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { StatusBar } from 'expo-status-bar';
import { saveProfile, saveCurrentSchool, clearCurrentSchool, getCurrentSchool } from '../../lib/profileManager';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import api from '../../lib/api';
import { LinearGradient } from 'expo-linear-gradient';
import { getDeviceInfo } from '../../lib/deviceInfo';
import { queueReviewPromptAfterLogin } from '../../lib/reviewPrompt';
import * as AppleAuthentication from 'expo-apple-authentication';
import YoutubePlayer from 'react-native-youtube-iframe';
import { clearTransientAuthState } from '../../lib/authRedirect';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');
export const PRIMARY_COLOR = '#0b5cde';

// Responsive scaling utilities
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

const scale = (size) => (SCREEN_WIDTH / guidelineBaseWidth) * size;
const verticalScale = (size) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;
const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

const isTablet = SCREEN_WIDTH >= 768;
const isSmallPhone = SCREEN_WIDTH < 375;

const responsive = (small, normal, tablet) => {
    if (isTablet) return tablet;
    if (isSmallPhone) return small;
    return normal;
};

// Animated Background Component
const AnimatedBackground = () => {
    const progress1 = useSharedValue(0);
    const progress2 = useSharedValue(0);
    const progress3 = useSharedValue(0);
    const progress4 = useSharedValue(0);

    useEffect(() => {
        const easing = Easing.inOut(Easing.sin);
        progress1.value = withRepeat(withTiming(1, { duration: 8000, easing }), -1, true);
        progress2.value = withDelay(1000, withRepeat(withTiming(1, { duration: 10000, easing }), -1, true));
        progress3.value = withDelay(2000, withRepeat(withTiming(1, { duration: 12000, easing }), -1, true));
        progress4.value = withDelay(500, withRepeat(withTiming(1, { duration: 9000, easing }), -1, true));
    }, []);

    const orb1Style = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress1.value, [0, 1], [-30, 40]) },
            { translateY: interpolate(progress1.value, [0, 1], [0, 50]) },
            { scale: interpolate(progress1.value, [0, 0.5, 1], [1, 1.15, 1]) },
        ],
        opacity: interpolate(progress1.value, [0, 0.5, 1], [0.4, 0.6, 0.4]),
    }));

    const orb2Style = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress2.value, [0, 1], [30, -50]) },
            { translateY: interpolate(progress2.value, [0, 1], [-20, 40]) },
            { scale: interpolate(progress2.value, [0, 0.5, 1], [1, 1.2, 1]) },
        ],
        opacity: interpolate(progress2.value, [0, 0.5, 1], [0.3, 0.5, 0.3]),
    }));

    const orb3Style = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress3.value, [0, 1], [20, -30]) },
            { translateY: interpolate(progress3.value, [0, 1], [30, -20]) },
            { scale: interpolate(progress3.value, [0, 0.5, 1], [1, 1.1, 1]) },
        ],
        opacity: interpolate(progress3.value, [0, 0.5, 1], [0.25, 0.45, 0.25]),
    }));

    const orb4Style = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress4.value, [0, 1], [-20, 35]) },
            { translateY: interpolate(progress4.value, [0, 1], [10, -40]) },
            { scale: interpolate(progress4.value, [0, 0.5, 1], [1, 1.18, 1]) },
        ],
        opacity: interpolate(progress4.value, [0, 0.5, 1], [0.3, 0.55, 0.3]),
    }));

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Animated.View style={[styles.bgOrb, styles.bgOrb1, orb1Style]} />
            <Animated.View style={[styles.bgOrb, styles.bgOrb2, orb2Style]} />
            <Animated.View style={[styles.bgOrb, styles.bgOrb3, orb3Style]} />
            <Animated.View style={[styles.bgOrb, styles.bgOrb4, orb4Style]} />
        </View>
    );
};

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

// --- SCHOOL HERO CARD ---
// Shows: cover image (if any) + YouTube embed (if any), then school identity below.
// If neither cover nor video → no media block shown.
const SchoolHeroCard = ({ schoolData, onSwitchSchool }) => {
    if (!schoolData) return null;

    const {
        name,
        profilePicture,
        schoolCode,
        city,
        state,
        publicProfile,
    } = schoolData;

    const tagline = publicProfile?.tagline || null;
    // Location string
    const locationParts = [city, state].filter(Boolean);
    const locationStr = locationParts.length > 0 ? locationParts.join(', ') : null;

    return (
        <Animated.View
            entering={FadeInDown.delay(150).duration(600).springify()}
            style={styles.heroCard}
        >
            {/* Media Section: cover image backdrop + optional YouTube embed */}


            {/* Identity Row */}
            <View style={styles.heroIdentityRow}>
                {/* Logo */}
                <View style={styles.heroLogoWrapper}>
                    {profilePicture ? (
                        <Image
                            source={{ uri: profilePicture }}
                            style={styles.heroLogo}
                            resizeMode="cover"
                        />
                    ) : (
                        <View style={styles.heroLogoFallback}>
                            <Text style={styles.heroLogoFallbackText}>
                                {name?.charAt(0)?.toUpperCase() || 'S'}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Name + tagline + meta */}
                <View style={styles.heroTextBlock}>
                    <Text style={styles.heroSchoolName} numberOfLines={2}>
                        {name || 'School'}
                    </Text>

                    {tagline && (
                        <Text style={styles.heroTagline} numberOfLines={2}>
                            {tagline}
                        </Text>
                    )}

                    <View style={styles.heroMetaRow}>
                        {locationStr && (
                            <View style={styles.heroMetaChip}>
                                <Ionicons name="location-outline" size={11} color="#64748B" />
                                <Text style={styles.heroMetaChipText}>{locationStr}</Text>
                            </View>
                        )}
                        {/* Show code chip only if no media (already shown as badge) */}
                        {/* {schoolCode && !hasMedia && (
                            <View style={[styles.heroMetaChip, styles.heroCodeChip]}>
                                <Ionicons name="school-outline" size={11} color={PRIMARY_COLOR} />
                                <Text style={[styles.heroMetaChipText, { color: PRIMARY_COLOR }]}>{schoolCode}</Text>
                            </View>
                        )} */}
                    </View>
                </View>

                {/* Switch button */}
                <TouchableOpacity
                    onPress={onSwitchSchool}
                    style={styles.heroSwitchBtn}
                    activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Ionicons name="swap-horizontal-outline" size={16} color={PRIMARY_COLOR} />
                    <Text style={styles.heroSwitchText}>Switch</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

// Roles that are blocked from the mobile app
const BLOCKED_MOBILE_ROLES = ['ADMIN', 'LIBRARIAN', 'SUPER_ADMIN'];

export default function LoginScreen() {
    const insets = useSafeAreaInsets();
    const passwordRef = useRef(null);
    const scrollViewRef = useRef(null);
    const { schoolConfig: schoolConfigParam, prefillEmail } = useLocalSearchParams();
    const [schoolConfig, setSchoolConfig] = useState(null);
    const [resolvedSchoolConfigParam, setResolvedSchoolConfigParam] = useState(
        typeof schoolConfigParam === 'string' ? schoolConfigParam : null
    );
    const [credential, setCredential] = useState(prefillEmail || '');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [keyboardVisible, setKeyboardVisible] = useState(false);
    const [keyboardHeight, setKeyboardHeight] = useState(0);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [appleLoading, setAppleLoading] = useState(false);

    const buttonScale = useSharedValue(1);

    useEffect(() => {
        const showSub = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
            (e) => {
                setKeyboardVisible(true);
                setKeyboardHeight(e.endCoordinates.height);
                if (Platform.OS === 'android') {
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
                }
            }
        );
        const hideSub = Keyboard.addListener(
            Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
            () => {
                setKeyboardVisible(false);
                setKeyboardHeight(0);
            }
        );
        return () => {
            showSub.remove();
            hideSub.remove();
        };
    }, []);

    useEffect(() => {
        const resolveSchoolContext = async () => {
            try {
                if (typeof schoolConfigParam === 'string' && schoolConfigParam) {
                    const config = JSON.parse(schoolConfigParam);
                    setResolvedSchoolConfigParam(schoolConfigParam);
                    setSchoolConfig(config.school || config);
                    return;
                }

                const savedSchool = await getCurrentSchool();
                if (savedSchool?.schoolData) {
                    setResolvedSchoolConfigParam(JSON.stringify(savedSchool.schoolData));
                    setSchoolConfig(savedSchool.schoolData.school || savedSchool.schoolData);
                    return;
                }

                setResolvedSchoolConfigParam(null);
                setSchoolConfig(null);
            } catch (error) {
                console.error('Error resolving school config:', error);
                setResolvedSchoolConfigParam(null);
                setSchoolConfig(null);
            }
        };

        resolveSchoolContext();
    }, [schoolConfigParam]);

    const handleForgotPassword = async () => {
        router.push({
            pathname: '/(auth)/forgot-password',
            params: {
                prefillCredential: credential.trim(),
                ...(resolvedSchoolConfigParam ? { schoolConfig: resolvedSchoolConfigParam } : {}),
            },
        });
    };

    const handleSwitchSchool = async () => {
        try {
            console.log('🔄 Switching schools - clearing all data...');
            await supabase.auth.signOut();
            await clearTransientAuthState();
            await SecureStore.deleteItemAsync('lastSchoolCode');
            await clearCurrentSchool();
            console.log('✅ All data cleared - navigating to school code');
            router.replace('/(auth)/schoolcode');
        } catch (error) {
            console.error('Error switching schools:', error);
            router.replace('/(auth)/schoolcode');
        }
    };

    const validateEmail = (emailValue) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(emailValue);
    };

    const validatePhone = (phoneValue) => {
        const phoneRegex = /^[6-9]\d{9}$/;
        return phoneRegex.test(phoneValue);
    };


    const handleLogin = async () => {
        setErrors({});

        const newErrors = {};
        const isEmail = validateEmail(credential.trim());
        const isPhone = /^\d+$/.test(credential.trim());

        if (!credential.trim()) {
            newErrors.credential = 'Email or Phone Number is required';
        } else if (!isEmail && !isPhone) {
            newErrors.credential = 'Please enter a valid email or phone number';
        } else if (isPhone && !validatePhone(credential.trim())) {
            newErrors.credential = 'Please enter a valid 10-digit mobile number';
        }

        if (!password) {
            newErrors.password = 'Password is required';
        } else if (password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        } else if (password.length > 50) {
            newErrors.password = 'Password is too long';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            buttonScale.value = withSequence(
                withTiming(1.03, { duration: 80 }),
                withTiming(0.97, { duration: 80 }),
                withTiming(1.03, { duration: 80 }),
                withTiming(1, { duration: 80 })
            );
            return;
        }

        try {
            setLoading(true);
            await SecureStore.deleteItemAsync('token');

            buttonScale.value = withSequence(
                withTiming(0.95, { duration: 100 }),
                withTiming(1, { duration: 100 })
            );

            let loginEmail = credential.trim();

            if (isPhone) {
                console.log('📱 Phone number detected, looking up email for:', loginEmail);
                try {
                    const schoolId = schoolConfig?.id;
                    if (!schoolId) {
                        setErrors({ general: 'School not configured. Please try email login.' });
                        setLoading(false);
                        return;
                    }
                    const response = await api.post(`/schools/${schoolId}/lookup-phone`, {
                        phoneNumber: loginEmail,
                    });
                    if (!response.data?.email) {
                        setErrors({ general: 'Phone number not registered with this school.' });
                        setLoading(false);
                        return;
                    }
                    loginEmail = response.data.email;
                } catch (lookupError) {
                    const errorMsg = lookupError?.response?.data?.error || 'Phone number not found. Please try email.';
                    setErrors({ general: errorMsg });
                    setLoading(false);
                    return;
                }
            }

            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password,
            });

            if (error || !data.user) {
                if (error?.message?.includes('Invalid login credentials')) {
                    setErrors({ general: 'Invalid credentials. Please check your password.' });
                } else {
                    setErrors({ general: error?.message || 'Authorization Failed' });
                }
                return;
            }

            const user = await fetchUser(data.user.id, data.session.access_token);

            if (!user) {
                await supabase.auth.signOut();
                setErrors({ general: 'User not found in system' });
                return;
            }

            if (BLOCKED_MOBILE_ROLES.includes(user.role?.name)) {
                await supabase.auth.signOut();
                Alert.alert(
                    'Web Only',
                    `${user.role?.name === 'ADMIN' ? 'Admin' : user.role?.name === 'LIBRARIAN' ? 'Librarian' : 'Super Admin'} accounts can only access the web dashboard at atlas.edubreezy.com.`,
                    [{ text: 'OK' }]
                );
                setLoading(false);
                return;
            }

            const minimalUser = {
                id: user.id,
                email: user.email,
                name: user.name,
                profilePicture: user.profilePicture,
                role: user.role,
                schoolId: user.schoolId,
                ...(user.studentData && {
                    studentData: {
                        name: user.studentData.name,
                        email: user.studentData.email,
                        admissionNo: user.studentData.admissionNo,
                        class: user.studentData.class || null,
                        section: user.studentData.section || null,
                    },
                }),
                ...(user.parentData && {
                    parentData: {
                        id: user.parentData.id,
                        name: user.parentData.name,
                        email: user.parentData.email,
                    },
                }),
                ...(user.teacherData && {
                    teacherData: {
                        name: user.teacherData.name,
                        email: user.teacherData.email,
                    },
                }),
                ...(user.school && {
                    school: {
                        id: user.school.id,
                        name: user.school.name,
                        schoolCode: user.school.schoolCode,
                    },
                }),
            };
            await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
            await SecureStore.setItemAsync('userRole', user?.role?.name || '');
            await SecureStore.setItemAsync('token', data.session.access_token);

            const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
            if (schoolCode) {
                try {
                    await saveProfile(schoolCode, user, data.session);
                    await saveCurrentSchool(schoolCode, { school: schoolConfig });
                } catch (saveError) {
                    console.error('❌ Failed to save profile:', saveError);
                }
            }

            try {
                const deviceInfo = await getDeviceInfo();
                const sessionRes = await api.post('/auth/sessions', {
                    userId: user.id,
                    supabaseSessionToken: data.session.access_token,
                    ...deviceInfo,
                });
                if (sessionRes.data?.session?.id) {
                    await SecureStore.setItemAsync('currentSessionId', sessionRes.data.session.id);
                }
            } catch (sessionErr) {
                console.warn('Could not create session:', sessionErr.message);
            }

            await queueReviewPromptAfterLogin();

            router.replace('/(screens)/greeting');

        } catch (err) {
            console.error(err);
            let message = 'Something went wrong. Please try again.';
            if (err.response?.status === 404) {
                message = 'This account is not linked to any school account.';
            } else if (err.response?.status === 401) {
                message = 'Session expired. Please login again.';
            } else if (!err.response) {
                message = 'Network error. Please check your connection.';
            }
            setErrors({ general: message });
        } finally {
            setLoading(false);
        }
    };

    const buttonScaleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: buttonScale.value }],
    }));

    const handleGoogleLogin = async () => {
        try {
            setGoogleLoading(true);
            setErrors({});
            await SecureStore.deleteItemAsync('token');

            const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: 'edubreezy://(auth)/login',
                    skipBrowserRedirect: true,
                },
            });

            if (oauthError) throw oauthError;
            if (!oauthData?.url) {
                setErrors({ general: 'Failed to initiate Google sign-in.' });
                return;
            }

            const result = await WebBrowser.openAuthSessionAsync(oauthData.url, 'edubreezy://(auth)/login');
            if (result.type !== 'success' || !result.url) {
                setGoogleLoading(false);
                return;
            }

            const urlFragment = result.url.split('#')[1];
            if (!urlFragment) {
                setErrors({ general: 'Authentication failed. Please try again.' });
                return;
            }

            const params = new URLSearchParams(urlFragment);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');

            if (!access_token || !refresh_token) {
                setErrors({ general: 'Authentication failed. Missing tokens.' });
                return;
            }

            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                access_token,
                refresh_token,
            });

            if (sessionError || !sessionData?.user) {
                setErrors({ general: sessionError?.message || 'Failed to establish session.' });
                return;
            }

            const verifyRes = await api.post('/auth/verify-oauth', {
                accessToken: access_token,
                provider: 'google',
            });
            const user = verifyRes.data;

            if (!user || user.linked === false) {
                await supabase.auth.signOut();
                setErrors({
                    general: user?.message ||
                        'No account found for this Google email. Please contact your school admin.',
                });
                return;
            }

            if (BLOCKED_MOBILE_ROLES.includes(user.role?.name)) {
                await supabase.auth.signOut();
                Alert.alert('Web Only', `This account can only access the web dashboard.`, [{ text: 'OK' }]);
                setGoogleLoading(false);
                return;
            }

            const minimalUser = {
                id: user.id,
                email: user.email,
                name: user.name,
                profilePicture: user.profilePicture,
                role: user.role,
                schoolId: user.schoolId,
                ...(user.studentData && {
                    studentData: {
                        name: user.studentData.name,
                        email: user.studentData.email,
                        admissionNo: user.studentData.admissionNo,
                        class: user.studentData.class || null,
                        section: user.studentData.section || null,
                    },
                }),
                ...(user.parentData && {
                    parentData: { id: user.parentData.id, name: user.parentData.name, email: user.parentData.email },
                }),
                ...(user.teacherData && {
                    teacherData: { name: user.teacherData.name, email: user.teacherData.email },
                }),
                ...(user.school && {
                    school: { id: user.school.id, name: user.school.name, schoolCode: user.school.schoolCode },
                }),
            };
            await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
            await SecureStore.setItemAsync('userRole', user?.role?.name || '');
            await SecureStore.setItemAsync('token', access_token);

            const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
            if (schoolCode) {
                try {
                    await saveProfile(schoolCode, user, sessionData.session);
                    await saveCurrentSchool(schoolCode, { school: schoolConfig });
                } catch (saveError) {
                    console.error('❌ Failed to save profile:', saveError);
                }
            }

            try {
                const deviceInfo = await getDeviceInfo();
                const sessionRes = await api.post('/auth/sessions', {
                    userId: user.id,
                    supabaseSessionToken: access_token,
                    ...deviceInfo,
                });
                if (sessionRes.data?.session?.id) {
                    await SecureStore.setItemAsync('currentSessionId', sessionRes.data.session.id);
                }
            } catch (sessionErr) {
                console.warn('Could not create session:', sessionErr.message);
            }

            await queueReviewPromptAfterLogin();

            router.replace('/(screens)/greeting');
        } catch (err) {
            console.error(err);
            let message = 'Something went wrong. Please try again.';
            if (err.response?.status === 404) message = 'This account is not linked to any school account.';
            else if (err.response?.status === 401) message = 'Session expired. Please login again.';
            else if (!err.response) message = 'Network error. Please check your connection.';
            setErrors({ general: message });
        } finally {
            setGoogleLoading(false);
        }
    };

    const handleAppleLogin = async () => {
        const cleanupAppleIdentity = async () => {
            try {
                const { data, error } = await supabase.auth.getUserIdentities();
                if (error) throw error;
                const appleIdentity = data?.identities?.find((identity) => identity.provider === 'apple');
                if (appleIdentity) {
                    const { error: unlinkError } = await supabase.auth.unlinkIdentity(appleIdentity);
                    if (unlinkError) throw unlinkError;
                }
            } catch (cleanupError) {
                console.warn('Failed to unlink Apple identity:', cleanupError?.message || cleanupError);
            } finally {
                await supabase.auth.signOut();
            }
        };

        try {
            setAppleLoading(true);
            setErrors({});
            await SecureStore.deleteItemAsync('token');

            const appleAvailable = await AppleAuthentication.isAvailableAsync();
            if (!appleAvailable) {
                setErrors({ general: 'Apple sign-in is not available on this device.' });
                return;
            }

            const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
                    AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
            });

            const identityToken = credential?.identityToken;
            if (!identityToken) {
                setErrors({ general: 'Authentication failed. Apple did not return an identity token.' });
                return;
            }

            const { data: sessionData, error: sessionError } = await supabase.auth.signInWithIdToken({
                provider: 'apple',
                token: identityToken,
            });

            if (sessionError || !sessionData?.user) {
                setErrors({ general: sessionError?.message || 'Failed to establish session.' });
                return;
            }

            const access_token = sessionData.session?.access_token;
            if (!access_token) {
                setErrors({ general: 'Failed to establish session.' });
                return;
            }

            const verifyRes = await api.post('/auth/verify-oauth', {
                accessToken: access_token,
                provider: 'apple',
            });
            const user = verifyRes.data;

            if (!user || user.linked === false) {
                await cleanupAppleIdentity();
                setErrors({
                    general: user?.message ||
                        'No account found for this Apple ID. Please contact your school admin.',
                });
                return;
            }

            if (BLOCKED_MOBILE_ROLES.includes(user.role?.name)) {
                await cleanupAppleIdentity();
                Alert.alert('Web Only', `This account can only access the web dashboard.`, [{ text: 'OK' }]);
                setAppleLoading(false);
                return;
            }

            const minimalUser = {
                id: user.id,
                email: user.email,
                name: user.name,
                profilePicture: user.profilePicture,
                role: user.role,
                schoolId: user.schoolId,
                ...(user.studentData && {
                    studentData: {
                        name: user.studentData.name,
                        email: user.studentData.email,
                        admissionNo: user.studentData.admissionNo,
                        class: user.studentData.class || null,
                        section: user.studentData.section || null,
                    },
                }),
                ...(user.parentData && {
                    parentData: { id: user.parentData.id, name: user.parentData.name, email: user.parentData.email },
                }),
                ...(user.teacherData && {
                    teacherData: { name: user.teacherData.name, email: user.teacherData.email },
                }),
                ...(user.school && {
                    school: { id: user.school.id, name: user.school.name, schoolCode: user.school.schoolCode },
                }),
            };
            await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
            await SecureStore.setItemAsync('userRole', user?.role?.name || '');
            await SecureStore.setItemAsync('token', access_token);

            const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
            if (schoolCode) {
                try {
                    await saveProfile(schoolCode, user, sessionData.session);
                    await saveCurrentSchool(schoolCode, { school: schoolConfig });
                } catch (saveError) {
                    console.error('❌ Failed to save profile:', saveError);
                }
            }

            try {
                const deviceInfo = await getDeviceInfo();
                const sessionRes = await api.post('/auth/sessions', {
                    userId: user.id,
                    supabaseSessionToken: access_token,
                    ...deviceInfo,
                });
                if (sessionRes.data?.session?.id) {
                    await SecureStore.setItemAsync('currentSessionId', sessionRes.data.session.id);
                }
            } catch (sessionErr) {
                console.warn('Could not create session:', sessionErr.message);
            }

            await queueReviewPromptAfterLogin();

            router.replace('/(screens)/greeting');
        } catch (err) {
            console.error(err);
            let message = 'Something went wrong. Please try again.';
            if (err.response?.status === 404) message = 'This account is not linked to any school account.';
            else if (err.response?.status === 401) message = 'Session expired. Please login again.';
            else if (!err.response) message = 'Network error. Please check your connection.';
            setErrors({ general: message || 'Apple Sign In Failed' });
        } finally {
            setAppleLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <StatusBar style="dark" />
            <AnimatedBackground />

            <ScrollView
                ref={scrollViewRef}
                contentContainerStyle={{ flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="interactive"
                bounces={false}
                style={{ flex: 1 }}
                automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
            >
                <View style={[styles.loginScreenWrapper, { paddingTop: insets.top + verticalScale(20), paddingBottom: Math.max(insets.bottom, 20) }]}>


                    {/* Form Section */}
                    <Animated.View
                        entering={FadeInDown.delay(200).duration(500)}
                        style={styles.loginFormSection}
                    >
                        {/* School Hero Card — replaces old compact card */}
                        {schoolConfig && (
                            <SchoolHeroCard
                                schoolData={schoolConfig}
                                onSwitchSchool={handleSwitchSchool}
                            />
                        )}
                        {/* Header */}
                        <Animated.View
                            entering={FadeInDown.delay(100).duration(500)}
                            style={styles.loginHeader}
                        >
                            <Text style={styles.signInTitle}>Login to Continue</Text>
                            {/* <Text style={styles.signInSubtitle}>Enter your credentials to continue</Text> */}
                        </Animated.View>

                        {/* General Error */}
                        {errors.general && (
                            <Animated.View
                                entering={FadeIn.duration(300)}
                                style={styles.generalError}
                            >
                                <Ionicons name="alert-circle" size={20} color="#DC2626" />
                                <Text style={styles.generalErrorText}>{errors.general}</Text>
                            </Animated.View>
                        )}

                        {/* Credential Input */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Email or Phone Number</Text>
                            <View
                                style={[
                                    styles.inputWrapper,
                                    (errors.credential || errors.email) && styles.inputWrapperError,
                                ]}
                            >
                                <Ionicons
                                    name="mail-outline"
                                    size={20}
                                    color={(errors.credential || errors.email) ? '#DC2626' : '#94A3B8'}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter email or 10-digit mobile number"
                                    placeholderTextColor="#94A3B8"
                                    value={credential}
                                    onChangeText={(text) => {
                                        setCredential(text);
                                        if (errors.credential || errors.email) {
                                            setErrors({ ...errors, credential: null, email: null, general: null });
                                        }
                                    }}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    returnKeyType="next"
                                    onSubmitEditing={() => passwordRef.current?.focus()}
                                    blurOnSubmit={false}
                                />
                                {credential.length > 0 && (validateEmail(credential) || validatePhone(credential)) && (
                                    <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
                                )}
                            </View>
                            {(errors.credential || errors.email) && (
                                <Animated.Text entering={FadeIn.duration(200)} style={styles.errorText}>
                                    {errors.credential || errors.email}
                                </Animated.Text>
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
                                <Ionicons
                                    name="lock-closed-outline"
                                    size={20}
                                    color={errors.password ? '#DC2626' : '#94A3B8'}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    ref={passwordRef}
                                    style={styles.input}
                                    placeholder="Enter your password"
                                    placeholderTextColor="#94A3B8"
                                    value={password}
                                    onChangeText={(text) => {
                                        setPassword(text);
                                        if (errors.password) {
                                            setErrors({ ...errors, password: null, general: null });
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
                                    <Ionicons
                                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                        size={22}
                                        color="#94A3B8"
                                    />
                                </TouchableOpacity>
                            </View>
                            {errors.password && (
                                <Animated.Text entering={FadeIn.duration(200)} style={styles.errorText}>
                                    {errors.password}
                                </Animated.Text>
                            )}
                        </View>

                        {/* Forgot Password */}
                        <TouchableOpacity
                            onPress={handleForgotPassword}
                            style={styles.forgotPassword}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                        </TouchableOpacity>

                        {/* Login Button */}
                        <Animated.View style={[buttonScaleStyle, { marginTop: verticalScale(8) }]}>
                            <TouchableOpacity
                                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                                onPress={handleLogin}
                                disabled={loading}
                                activeOpacity={0.85}
                            >
                                {loading ? (
                                    <View style={styles.loadingContainer}>
                                        <ActivityIndicator size="small" color="#FFFFFF" />
                                        <Text style={styles.loginButtonText}>Signing in...</Text>
                                    </View>
                                ) : (
                                    <View style={styles.loginButtonContent}>
                                        <Text style={styles.loginButtonText}>Log In</Text>
                                        <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                                    </View>
                                )}
                            </TouchableOpacity>
                        </Animated.View>

                        {/* OR Divider */}
                        <Animated.View
                            entering={FadeInDown.delay(350).duration(500)}
                            style={styles.orDivider}
                        >
                            <View style={styles.orDividerLine} />
                            <Text style={styles.orDividerText}>OR</Text>
                            <View style={styles.orDividerLine} />
                        </Animated.View>

                        {/* Google Sign-In */}
                        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                            <TouchableOpacity
                                style={[styles.googleButton, googleLoading && styles.googleButtonDisabled]}
                                onPress={handleGoogleLogin}
                                disabled={googleLoading || loading}
                                activeOpacity={0.85}
                            >
                                {googleLoading ? (
                                    <View style={styles.loadingContainer}>
                                        <ActivityIndicator size="small" color="#374151" />
                                        <Text style={styles.googleButtonText}>Signing in...</Text>
                                    </View>
                                ) : (
                                    <View style={styles.googleButtonContent}>
                                        <Image
                                            source={require('../../assets/google.png')}
                                            style={{ width: 20, height: 20 }}
                                        />
                                        <Text style={styles.googleButtonText}>Continue with Google</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Apple Sign-In — iOS only */}
                        {Platform.OS === 'ios' && (
                            <Animated.View entering={FadeInDown.delay(450).duration(500)} style={{ marginTop: verticalScale(10) }}>
                                <TouchableOpacity
                                    style={[styles.appleButton, appleLoading && styles.appleButtonDisabled]}
                                    onPress={handleAppleLogin}
                                    disabled={appleLoading || loading}
                                    activeOpacity={0.85}
                                >
                                    {appleLoading ? (
                                        <View style={styles.loadingContainer}>
                                            <ActivityIndicator size="small" color="#FFFFFF" />
                                            <Text style={styles.appleButtonText}>Signing in...</Text>
                                        </View>
                                    ) : (
                                        <View style={styles.googleButtonContent}>
                                            <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                                            <Text style={styles.appleButtonText}>Continue with Apple</Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </Animated.View>
                        )}
                    </Animated.View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },

    // --- Animated background orbs (unchanged) ---
    bgOrb: {
        position: 'absolute',
        borderRadius: 999,
    },
    bgOrb1: {
        width: SCREEN_WIDTH * 0.65,
        height: SCREEN_WIDTH * 0.65,
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        top: SCREEN_HEIGHT * 0.05,
        left: -SCREEN_WIDTH * 0.15,
    },
    bgOrb2: {
        width: SCREEN_WIDTH * 0.55,
        height: SCREEN_WIDTH * 0.55,
        backgroundColor: 'rgba(99, 102, 241, 0.10)',
        top: SCREEN_HEIGHT * 0.12,
        right: -SCREEN_WIDTH * 0.1,
    },
    bgOrb3: {
        width: SCREEN_WIDTH * 0.5,
        height: SCREEN_WIDTH * 0.5,
        backgroundColor: 'rgba(139, 92, 246, 0.08)',
        bottom: SCREEN_HEIGHT * 0.15,
        left: -SCREEN_WIDTH * 0.05,
    },
    bgOrb4: {
        width: SCREEN_WIDTH * 0.45,
        height: SCREEN_WIDTH * 0.45,
        backgroundColor: 'rgba(14, 165, 233, 0.09)',
        bottom: SCREEN_HEIGHT * 0.3,
        right: SCREEN_WIDTH * 0.05,
    },

    // --- Layout ---
    loginScreenWrapper: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: moderateScale(24),
    },
    loginHeader: {
        // alignItems: 'center',
        marginBottom: verticalScale(20),
    },
    signInTitle: {
        fontSize: moderateScale(32, 0.4),
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.8,
        marginBottom: verticalScale(6),
    },
    signInSubtitle: {
        fontSize: moderateScale(14, 0.3),
        fontWeight: '400',
        color: '#64748B',
        letterSpacing: 0.1,
    },
    loginFormSection: {
        width: '100%',
        maxWidth: isTablet ? 460 : '100%',
        alignSelf: 'center',
    },

    // --- School Hero Card ---
    heroCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: moderateScale(16),
        marginBottom: verticalScale(18),
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        // subtle shadow
        shadowColor: '#0b5cde',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
    },

    // Media block (cover image + optional YouTube)
    heroMediaContainer: {
        width: '100%',
        height: verticalScale(120),
        backgroundColor: '#EFF6FF',
        overflow: 'hidden',
        position: 'relative',
    },
    heroCoverImage: {
        width: '100%',
        height: '100%',
        position: 'absolute',
    },
    youtubeThumbnailContainer: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    mediaCodeBadge: {
        position: 'absolute',
        top: 10,
        right: 10,
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(11,92,222,0.15)',
    },
    mediaCodeBadgeText: {
        fontSize: moderateScale(11, 0.3),
        fontWeight: '700',
        color: PRIMARY_COLOR,
        letterSpacing: 0.3,
    },

    // Identity row (logo + text + switch)
    heroIdentityRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: moderateScale(14),
        paddingVertical: moderateScale(12),
        gap: moderateScale(10),
    },
    heroLogoWrapper: {
        width: responsive(46, 52, 60),
        height: responsive(46, 52, 60),
        borderRadius: moderateScale(12),
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        backgroundColor: '#F1F5F9',
        flexShrink: 0,
    },
    heroLogo: {
        width: '100%',
        height: '100%',
    },
    heroLogoFallback: {
        width: '100%',
        height: '100%',
        backgroundColor: PRIMARY_COLOR,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroLogoFallbackText: {
        fontSize: moderateScale(20, 0.3),
        fontWeight: '800',
        color: '#FFFFFF',
    },
    heroTextBlock: {
        flex: 1,
        gap: 2,
    },
    heroSchoolName: {
        fontSize: moderateScale(14, 0.3),
        fontWeight: '800',
        color: '#1E293B',
        letterSpacing: -0.2,
        lineHeight: moderateScale(18, 0.3),
    },
    heroTagline: {
        fontSize: moderateScale(11, 0.3),
        fontWeight: '500',
        color: '#64748B',
        lineHeight: moderateScale(15, 0.3),
        marginTop: 1,
    },
    heroMetaRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 5,
    },
    heroMetaChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        backgroundColor: '#F8FAFC',
        borderRadius: 20,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    heroCodeChip: {
        backgroundColor: '#EFF6FF',
        borderColor: 'rgba(11,92,222,0.15)',
    },
    heroMetaChipText: {
        fontSize: moderateScale(10, 0.3),
        fontWeight: '600',
        color: '#64748B',
    },
    heroSwitchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#EFF6FF',
        borderRadius: 20,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: 'rgba(11,92,222,0.15)',
        flexShrink: 0,
    },
    heroSwitchText: {
        fontSize: moderateScale(11, 0.3),
        fontWeight: '700',
        color: PRIMARY_COLOR,
    },

    // --- Form elements (unchanged from original) ---
    generalError: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FEE2E2',
        paddingHorizontal: moderateScale(14),
        paddingVertical: moderateScale(12),
        borderRadius: moderateScale(12),
        marginBottom: verticalScale(16),
        gap: 10,
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    generalErrorText: {
        flex: 1,
        color: '#DC2626',
        fontSize: moderateScale(13, 0.3),
        fontWeight: '600',
    },
    inputGroup: {
        marginBottom: verticalScale(14),
    },
    inputLabel: {
        fontSize: moderateScale(13, 0.3),
        fontWeight: '700',
        color: '#374151',
        marginBottom: verticalScale(6),
        marginLeft: 2,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
        borderRadius: moderateScale(12),
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        paddingHorizontal: moderateScale(14),
    },
    inputWrapperError: {
        borderColor: '#F87171',
        backgroundColor: '#FEF2F2',
    },
    inputIcon: {
        marginRight: moderateScale(10),
    },
    input: {
        flex: 1,
        paddingVertical: moderateScale(14),
        fontSize: moderateScale(15, 0.3),
        color: '#1F2937',
        fontWeight: '500',
    },
    eyeButton: {
        padding: 8,
        marginRight: -8,
    },
    errorText: {
        fontSize: moderateScale(12, 0.3),
        color: '#DC2626',
        marginTop: verticalScale(6),
        marginLeft: 4,
        fontWeight: '600',
    },
    forgotPassword: {
        alignSelf: 'flex-end',
        paddingVertical: 6,
        marginBottom: verticalScale(4),
    },
    forgotPasswordText: {
        fontSize: moderateScale(13, 0.3),
        fontWeight: '700',
        color: PRIMARY_COLOR,
    },
    loginButton: {
        backgroundColor: PRIMARY_COLOR,
        borderRadius: moderateScale(12),
        paddingVertical: moderateScale(16),
        alignItems: 'center',
        justifyContent: 'center',
    },
    loginButtonDisabled: {
        backgroundColor: '#93c5fd',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    loginButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    loginButtonText: {
        fontSize: moderateScale(16, 0.3),
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.3,
    },
    orDivider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: verticalScale(16),
    },
    orDividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#E5E7EB',
    },
    orDividerText: {
        marginHorizontal: moderateScale(14),
        fontSize: moderateScale(12, 0.3),
        fontWeight: '700',
        color: '#9CA3AF',
        letterSpacing: 0.5,
    },
    googleButton: {
        backgroundColor: '#FFFFFF',
        borderRadius: moderateScale(12),
        paddingVertical: moderateScale(14),
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
    },
    googleButtonDisabled: {
        backgroundColor: '#F9FAFB',
        borderColor: '#E5E7EB',
    },
    googleButtonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    googleButtonText: {
        fontSize: moderateScale(15, 0.3),
        fontWeight: '700',
        color: '#374151',
        letterSpacing: 0.2,
    },
    appleButton: {
        backgroundColor: '#000000',
        borderRadius: moderateScale(12),
        paddingVertical: moderateScale(14),
        alignItems: 'center',
        justifyContent: 'center',
    },
    appleButtonDisabled: {
        backgroundColor: '#4A4A4A',
    },
    appleButtonText: {
        fontSize: moderateScale(15, 0.3),
        fontWeight: '700',
        color: '#FFFFFF',
        letterSpacing: 0.2,
    },
});
