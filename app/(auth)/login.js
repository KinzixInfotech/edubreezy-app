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
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import fetchUser from '../../lib/queries/user';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
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
import { saveProfile, saveCurrentSchool, clearCurrentSchool } from '../../lib/profileManager';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
export const PRIMARY_COLOR = '#0b5cde';

// Responsive scaling utilities
const guidelineBaseWidth = 375; // iPhone 11 width
const guidelineBaseHeight = 812; // iPhone 11 height

// Scale based on screen width
const scale = (size) => (SCREEN_WIDTH / guidelineBaseWidth) * size;
// Scale based on screen height
const verticalScale = (size) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;
// Moderate scale - for fonts and elements that shouldn't scale too much
const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

// Check if device is a tablet
const isTablet = SCREEN_WIDTH >= 768;
// Check if device is a small phone
const isSmallPhone = SCREEN_WIDTH < 375;

// Get responsive value based on device type
const responsive = (small, normal, tablet) => {
    if (isTablet) return tablet;
    if (isSmallPhone) return small;
    return normal;
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

// School info card component - Professional Design with Switch option
const SchoolInfoCard = ({ schoolData, onSwitchSchool }) => {
    if (!schoolData) return null;

    return (
        <Animated.View
            entering={FadeInDown.delay(200).duration(600).springify()}
            style={styles.schoolCard}
        >
            {/* Gradient accent strip */}
            <View style={styles.schoolCardAccent} />

            <TouchableOpacity
                style={styles.schoolCardContent}
                onPress={onSwitchSchool}
                activeOpacity={0.7}
            >
                <View style={styles.schoolLogoWrapper}>
                    <View style={styles.schoolLogoContainer}>
                        <Image
                            source={{ uri: schoolData.profilePicture }}
                            style={styles.schoolLogo}
                            resizeMode="cover"
                        />
                    </View>
                    {/* Verified badge */}
                    <View style={styles.verifiedBadge}>
                        <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                    </View>
                </View>

                <View style={styles.schoolInfo}>
                    <Text style={styles.schoolName} numberOfLines={2}>
                        {schoolData.name}
                    </Text>
                    <View style={styles.schoolMeta}>
                        <View style={styles.schoolCodeBadge}>
                            <Ionicons name="school-outline" size={12} color={PRIMARY_COLOR} />
                            <Text style={styles.schoolCode}>{schoolData.schoolCode}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.switchSchoolButton}>
                    <Ionicons name="swap-horizontal" size={16} color={PRIMARY_COLOR} />
                    <Text style={styles.switchSchoolText}>Switch</Text>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};


// Grid Pattern Background Component
const GridPattern = () => {
    const gridLines = [];
    const gridSize = responsive(25, 30, 40);
    const verticalLines = Math.ceil(SCREEN_WIDTH / gridSize);
    const horizontalLines = responsive(6, 8, 10);

    // Vertical lines
    for (let i = 0; i <= verticalLines; i++) {
        gridLines.push(
            <View
                key={`v-${i}`}
                style={{
                    position: 'absolute',
                    left: i * gridSize,
                    top: 0,
                    bottom: 0,
                    width: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                }}
            />
        );
    }

    // Horizontal lines
    for (let i = 0; i <= horizontalLines; i++) {
        gridLines.push(
            <View
                key={`h-${i}`}
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: i * gridSize,
                    height: 1,
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                }}
            />
        );
    }

    return (
        <View style={styles.gridPattern}>
            {gridLines}
            {/* Gradient overlay for depth */}
            <View style={styles.gridGradientTop} />
            <View style={styles.gridGradientBottom} />
        </View>
    );
};

// Feature item component
const FeatureItem = ({ icon, text, delay }) => (
    <Animated.View
        entering={FadeInUp.delay(delay).duration(400)}
        style={styles.featureItem}
    >
        <View style={styles.featureIconContainer}>
            <Ionicons name={icon} size={16} color={PRIMARY_COLOR} />
        </View>
        <Text style={styles.featureText}>{text}</Text>
    </Animated.View>
);

export default function LoginScreen() {
    const insets = useSafeAreaInsets();
    const passwordRef = useRef(null);
    const { schoolConfig: schoolConfigParam, prefillEmail } = useLocalSearchParams();
    const [schoolConfig, setSchoolConfig] = useState(null);
    const [credential, setCredential] = useState(prefillEmail || '');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const buttonScale = useSharedValue(1);

    useEffect(() => {
        if (schoolConfigParam) {
            try {
                const config = JSON.parse(schoolConfigParam || '{}');
                setSchoolConfig(config.school);
            } catch (error) {
                console.error('Error parsing school config:', error);
            }
        }
    }, [schoolConfigParam]);

    const handleForgotPassword = async () => {
        // Open forgot password in web browser with app redirect
        const forgotPasswordUrl = `https://www.edubreezy.com/forgot-password?redirectTo=edubreezy`;
        await WebBrowser.openBrowserAsync(forgotPasswordUrl);
    };

    const handleSwitchSchool = async () => {
        try {
            // Clear all auth and profile data when switching schools
            console.log('🔄 Switching schools - clearing all data...');

            // Sign out from Supabase
            await supabase.auth.signOut();

            // Clear all SecureStore data
            await SecureStore.deleteItemAsync('user');
            await SecureStore.deleteItemAsync('userRole');
            await SecureStore.deleteItemAsync('token');
            await SecureStore.deleteItemAsync('lastSchoolCode');

            // Clear current school data
            await clearCurrentSchool();

            console.log('✅ All data cleared - navigating to school code');

            // Navigate to school code page - use replace to not keep login in stack
            router.replace('/(auth)/schoolcode');
        } catch (error) {
            console.error('Error switching schools:', error);
            // Still navigate even if clearing fails
            router.replace('/(auth)/schoolcode');
        }
    };

    const validateEmail = (emailValue) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(emailValue);
    };

    const validatePhone = (phoneValue) => {
        const phoneRegex = /^[6-9]\d{9}$/; // Basic India mobile validation
        return phoneRegex.test(phoneValue);
    };

    const handleLogin = async () => {
        setErrors({});

        // Custom validation for better UX
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

            // Clear any old tokens to prevent mismatch
            await SecureStore.deleteItemAsync('token');

            // Button press animation
            buttonScale.value = withSequence(
                withTiming(0.95, { duration: 100 }),
                withTiming(1, { duration: 100 })
            );

            let loginEmail = credential.trim();

            // If phone number, lookup email first
            if (isPhone) {
                console.log('📱 Phone number detected, looking up email for:', loginEmail);

                // Lookup in profiles table
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('email')
                    .eq('phone_number', loginEmail)
                    .maybeSingle();

                if (profileError) {
                    console.error('Error looking up phone:', profileError);
                    // Fallback to error
                    setErrors({ general: 'Error verifying phone number. Please try email.' });
                    setLoading(false);
                    return;
                }

                if (!profileData || !profileData.email) {
                    console.log('❌ Phone number not found in profiles');
                    setErrors({ general: 'Phone number not registered with the school.' });
                    setLoading(false);
                    return;
                }

                console.log('✅ Email found for phone:', profileData.email);
                loginEmail = profileData.email;
            }

            const { data, error } = await supabase.auth.signInWithPassword({
                email: loginEmail,
                password,
            });

            if (error || !data.user) {
                if (error?.message?.includes('Invalid login credentials')) {
                    setErrors({ general: 'Invalid credentials. Please checking your password.' });
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

            await SecureStore.setItemAsync('user', JSON.stringify(user));
            await SecureStore.setItemAsync('userRole', JSON.stringify(user?.role?.name));
            await SecureStore.setItemAsync('token', data.session.access_token);

            // Save profile for this school code WITH session tokens
            const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
            console.log('Saving profile for school code:', schoolCode);

            if (schoolCode) {
                try {
                    await saveProfile(schoolCode, user, data.session);
                    console.log('✅ Profile saved successfully with session for', schoolCode);
                    await saveCurrentSchool(schoolCode, { school: schoolConfig });
                } catch (saveError) {
                    console.error('❌ Failed to save profile:', saveError);
                }
            } else {
                console.warn('⚠️ No school code found, profile not saved');
            }

            router.replace('/(screens)/greeting');
        } catch (err) {
            console.error('Login error:', err);
            setErrors({ general: 'An unexpected error occurred. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const buttonScaleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: buttonScale.value }],
    }));

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            {/* Blue Header Background - Extends to safe area */}
            <View style={[styles.headerBackground, { paddingTop: insets.top + 24 }]}>
                {/* Grid Pattern */}
                <GridPattern />

                {/* Shield Icon */}
                <Animated.View
                    entering={FadeIn.delay(100).duration(500)}
                    style={styles.shieldContainer}
                >
                    <View style={styles.shieldIcon}>
                        <Ionicons name="shield-checkmark" size={36} color={PRIMARY_COLOR} />
                    </View>
                </Animated.View>

                {/* Title */}
                <Animated.View
                    entering={FadeInDown.delay(200).duration(600)}
                    style={styles.headerTextContainer}
                >
                    <Text style={styles.headerTitle}>Sign in to your</Text>
                    <Text style={styles.headerTitle}>Account</Text>
                    <Text style={styles.headerSubtitle}>
                        Enter your email/phone and password to log in
                    </Text>
                </Animated.View>
            </View>

            {/* White Card Content */}
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollContent,
                        { paddingBottom: Math.max(insets.bottom, 24) }
                    ]}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    bounces={false}
                >
                    <View style={styles.formCard}>
                        {/* School Info Card */}
                        {schoolConfig && (
                            <SchoolInfoCard
                                schoolData={schoolConfig}
                                onSwitchSchool={handleSwitchSchool}
                            />
                        )}

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

                        {/* Credential (Email/Phone) Input */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Email or Phone Number</Text>
                            <View
                                style={[
                                    styles.inputWrapper,
                                    (errors.credential || errors.email) && styles.inputWrapperError,
                                ]}
                            >
                                <Ionicons
                                    name="person-outline"
                                    size={20}
                                    color={(errors.credential || errors.email) ? '#DC2626' : '#9CA3AF'}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter email or 10-digit mobile number"
                                    placeholderTextColor="#9CA3AF"
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
                                <Animated.Text
                                    entering={FadeIn.duration(200)}
                                    style={styles.errorText}
                                >
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
                                    color={errors.password ? '#DC2626' : '#9CA3AF'}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    ref={passwordRef}
                                    style={styles.input}
                                    placeholder="Enter your password"
                                    placeholderTextColor="#9CA3AF"
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
                                        color="#9CA3AF"
                                    />
                                </TouchableOpacity>
                            </View>
                            {errors.password && (
                                <Animated.Text
                                    entering={FadeIn.duration(200)}
                                    style={styles.errorText}
                                >
                                    {errors.password}
                                </Animated.Text>
                            )}
                        </View>

                        {/* Forgot Password Row */}
                        <View style={styles.optionsRow}>
                            <TouchableOpacity
                                onPress={handleForgotPassword}
                                style={styles.forgotPassword}
                                activeOpacity={0.7}
                            >
                                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Login Button */}
                        <Animated.View style={buttonScaleStyle}>
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
                                    <Text style={styles.loginButtonText}>Log In</Text>
                                )}
                            </TouchableOpacity>
                        </Animated.View>

                        {/* Footer - Contact Admin */}
                        <View style={styles.footer}>
                            <Text style={styles.footerText}>
                                Don't have an account?{' '}
                            </Text>
                            <TouchableOpacity activeOpacity={0.7}>
                                <Text style={styles.footerLink}>Contact Admin</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Feature Highlights */}
                        <Animated.View
                            entering={FadeInUp.delay(500).duration(500)}
                            style={styles.featuresContainer}
                        >
                            <View style={styles.divider}>
                                <View style={styles.dividerLine} />
                                <Text style={styles.dividerText}>Why EduBreezy?</Text>
                                <View style={styles.dividerLine} />
                            </View>

                            <View style={styles.featuresGrid}>
                                <FeatureItem icon="shield-checkmark" text="Secure & Private" delay={600} />
                                <FeatureItem icon="notifications" text="Real-time Updates" delay={700} />
                                <FeatureItem icon="analytics" text="Track Progress" delay={800} />
                                <FeatureItem icon="people" text="Stay Connected" delay={900} />
                            </View>
                        </Animated.View>

                        {/* Bottom Branding */}
                        <Animated.View
                            entering={FadeIn.delay(1000).duration(500)}
                            style={styles.branding}
                        >
                            <View style={styles.brandingContent}>
                                <Ionicons name="school" size={18} color="#9CA3AF" />
                                <Text style={styles.brandingText}>EduBreezy</Text>
                            </View>
                            <Text style={styles.brandingSubtext}>
                                Modern School Management
                            </Text>
                        </Animated.View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: PRIMARY_COLOR,
    },
    headerBackground: {
        backgroundColor: PRIMARY_COLOR,
        paddingBottom: verticalScale(40),
        paddingHorizontal: moderateScale(24),
        alignItems: 'center',
        overflow: 'hidden',
    },
    gridPattern: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 0,
    },
    gridGradientTop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: verticalScale(60),
        backgroundColor: 'transparent',
    },
    gridGradientBottom: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: verticalScale(80),
        backgroundColor: PRIMARY_COLOR,
        opacity: 0.5,
    },
    shieldContainer: {
        marginBottom: verticalScale(16),
        zIndex: 1,
    },
    shieldIcon: {
        width: responsive(56, 64, 80),
        height: responsive(56, 64, 80),
        borderRadius: responsive(28, 32, 40),
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
        elevation: 8,
    },
    headerTextContainer: {
        alignItems: 'center',
        zIndex: 1,
        maxWidth: isTablet ? 500 : '100%',
    },
    headerTitle: {
        fontSize: moderateScale(26, 0.4),
        fontWeight: '800',
        color: '#FFFFFF',
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: moderateScale(14, 0.3),
        color: 'rgba(255, 255, 255, 0.85)',
        marginTop: verticalScale(10),
        textAlign: 'center',
        fontWeight: '500',
    },
    keyboardView: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: responsive(24, 32, 40),
        borderTopRightRadius: responsive(24, 32, 40),
        marginTop: -verticalScale(20),
    },
    scrollContent: {
        flexGrow: 1,
    },
    formCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: responsive(24, 32, 40),
        borderTopRightRadius: responsive(24, 32, 40),
        paddingHorizontal: moderateScale(isTablet ? 48 : 24),
        paddingTop: verticalScale(24),
        maxWidth: isTablet ? 600 : '100%',
        alignSelf: 'center',
        width: '100%',
    },
    schoolCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: moderateScale(18),
        marginBottom: verticalScale(20),
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    schoolCardAccent: {
        height: 4,
        backgroundColor: PRIMARY_COLOR,
    },
    schoolCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: moderateScale(14),
    },
    schoolLogoWrapper: {
        position: 'relative',
    },
    schoolLogoContainer: {
        width: responsive(50, 60, 70),
        height: responsive(50, 60, 70),
        borderRadius: moderateScale(12),
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#E2E8F0',
    },
    schoolLogo: {
        width: '100%',
        height: '100%',
    },
    verifiedBadge: {
        position: 'absolute',
        bottom: -4,
        right: -4,
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        padding: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    schoolInfo: {
        flex: 1,
        marginLeft: moderateScale(12),
    },
    schoolName: {
        fontSize: moderateScale(15, 0.3),
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: verticalScale(4),
        lineHeight: moderateScale(20, 0.3),
    },
    schoolMeta: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    schoolCodeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: moderateScale(8),
        paddingVertical: moderateScale(4),
        borderRadius: 8,
        gap: 4,
    },
    schoolCode: {
        fontSize: moderateScale(11, 0.3),
        fontWeight: '700',
        color: PRIMARY_COLOR,
        letterSpacing: 0.3,
    },
    switchSchoolButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
        paddingHorizontal: moderateScale(10),
        paddingVertical: moderateScale(6),
        borderRadius: moderateScale(8),
        gap: 4,
        borderWidth: 1,
        borderColor: '#DBEAFE',
    },
    switchSchoolText: {
        fontSize: moderateScale(11, 0.3),
        fontWeight: '700',
        color: PRIMARY_COLOR,
    },
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
    optionsRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: verticalScale(16),
        marginTop: verticalScale(2),
    },
    forgotPassword: {
        paddingVertical: 4,
        paddingHorizontal: 4,
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
        shadowOpacity: 0.15,
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    loginButtonText: {
        fontSize: moderateScale(16, 0.3),
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.3,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: verticalScale(20),
    },
    footerText: {
        fontSize: moderateScale(13, 0.3),
        color: '#6B7280',
        fontWeight: '500',
    },
    footerLink: {
        fontSize: moderateScale(13, 0.3),
        color: PRIMARY_COLOR,
        fontWeight: '700',
    },
    featuresContainer: {
        marginTop: verticalScale(24),
        paddingTop: verticalScale(8),
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: verticalScale(16),
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: '#E5E7EB',
    },
    dividerText: {
        marginHorizontal: moderateScale(12),
        fontSize: moderateScale(11, 0.3),
        fontWeight: '600',
        color: '#9CA3AF',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    featuresGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    featureItem: {
        width: isTablet ? '23%' : '48%',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: moderateScale(10),
        paddingHorizontal: moderateScale(10),
        backgroundColor: '#F8FAFC',
        borderRadius: moderateScale(10),
        marginBottom: verticalScale(8),
        borderWidth: 1,
        borderColor: '#EFF6FF',
    },
    featureIconContainer: {
        width: responsive(26, 32, 36),
        height: responsive(26, 32, 36),
        borderRadius: responsive(13, 16, 18),
        backgroundColor: '#EFF6FF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: moderateScale(8),
    },
    featureText: {
        flex: 1,
        fontSize: moderateScale(11, 0.3),
        fontWeight: '600',
        color: '#475569',
    },
    branding: {
        alignItems: 'center',
        marginTop: verticalScale(24),
        paddingTop: verticalScale(16),
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
    },
    brandingContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    brandingText: {
        fontSize: moderateScale(14, 0.3),
        fontWeight: '800',
        color: '#9CA3AF',
    },
    brandingSubtext: {
        fontSize: moderateScale(11, 0.3),
        color: '#D1D5DB',
        marginTop: 4,
        fontWeight: '500',
    },
});