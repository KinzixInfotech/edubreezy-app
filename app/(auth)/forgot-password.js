import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { getCurrentSchool } from '../../lib/profileManager';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');
const PRIMARY_COLOR = '#0b5cde';

const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

const scale = (size) => (SCREEN_WIDTH / guidelineBaseWidth) * size;
const verticalScale = (size) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;
const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

const FloatingBackground = () => (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <View style={[styles.orb, styles.orbOne]} />
        <View style={[styles.orb, styles.orbTwo]} />
        <View style={[styles.orb, styles.orbThree]} />
    </View>
);

const validateEmail = (emailValue) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
const validatePhone = (phoneValue) => /^[6-9]\d{9}$/.test(phoneValue);

export default function ForgotPasswordScreen() {
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const [credential, setCredential] = useState(
        typeof params.prefillCredential === 'string' ? params.prefillCredential : ''
    );
    const [schoolConfig, setSchoolConfig] = useState(null);
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);

    const hasSchool = useMemo(() => Boolean(schoolConfig?.id), [schoolConfig]);

    useEffect(() => {
        let isMounted = true;

        const loadSchool = async () => {
            try {
                if (typeof params.schoolConfig === 'string') {
                    const parsed = JSON.parse(params.schoolConfig);
                    if (isMounted) {
                        setSchoolConfig(parsed?.school || parsed || null);
                    }
                    return;
                }

                const currentSchool = await getCurrentSchool();
                if (isMounted) {
                    setSchoolConfig(currentSchool?.schoolData?.school || currentSchool?.schoolData || null);
                }
            } catch (error) {
                console.warn('Error loading school config for forgot password:', error);
            }
        };

        loadSchool();

        return () => {
            isMounted = false;
        };
    }, [params.schoolConfig]);

    const goBackToLogin = () => {
        router.replace({
            pathname: '/(auth)/login',
            params: {
                prefillEmail: credential.trim(),
                ...(typeof params.schoolConfig === 'string' ? { schoolConfig: params.schoolConfig } : {}),
            },
        });
    };

    const handleSendReset = async () => {
        const normalizedCredential = credential.trim();
        const nextErrors = {};
        const isPhone = /^\d+$/.test(normalizedCredential);
        const isEmail = validateEmail(normalizedCredential);

        if (!normalizedCredential) {
            nextErrors.credential = 'Enter your email or phone number';
        } else if (!isPhone && !isEmail) {
            nextErrors.credential = 'Enter a valid email or 10-digit mobile number';
        } else if (isPhone && !validatePhone(normalizedCredential)) {
            nextErrors.credential = 'Enter a valid 10-digit mobile number';
        } else if (isPhone && !hasSchool) {
            nextErrors.credential = 'Select your school first, then reset using your phone number';
        }

        if (Object.keys(nextErrors).length > 0) {
            setErrors(nextErrors);
            return;
        }

        try {
            setLoading(true);
            setErrors({});

            let emailToUse = normalizedCredential;

            if (isPhone) {
                const response = await api.post(`/schools/${schoolConfig.id}/lookup-phone`, {
                    phoneNumber: normalizedCredential,
                });

                if (!response.data?.email) {
                    throw new Error('No account was found for this phone number.');
                }

                emailToUse = response.data.email;
            }

            const { error } = await supabase.auth.resetPasswordForEmail(emailToUse, {
                redirectTo: 'edubreezy://reset-password',
            });

            if (error) {
                throw error;
            }

            router.replace({
                pathname: '/(auth)/forgot-password-sent',
                params: {
                    credential: normalizedCredential,
                    email: emailToUse,
                    ...(typeof params.schoolConfig === 'string' ? { schoolConfig: params.schoolConfig } : {}),
                },
            });
        } catch (error) {
            const message =
                error?.response?.data?.error ||
                error?.message ||
                'Unable to send reset link right now. Please try again.';

            setErrors({ general: message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="dark" />
            <FloatingBackground />

            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollContent,
                        {
                            paddingTop: insets.top + verticalScale(12),
                            paddingBottom: Math.max(insets.bottom, 24),
                        },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <LinearGradient
                        colors={['rgba(255,255,255,0.98)', 'rgba(248,250,252,0.96)']}
                        style={styles.card}
                    >
                        <View style={styles.badge}>
                            <Ionicons name="mail-open-outline" size={18} color={PRIMARY_COLOR} />
                            <Text style={styles.badgeText}>Password recovery</Text>
                        </View>

                        <Text style={styles.title}>Forgot your password?</Text>
                        <Text style={styles.subtitle}>
                            Enter the email address or mobile number linked to your account. We&apos;ll
                            send you a secure reset link.
                        </Text>

                        {schoolConfig?.name ? (
                            <View style={styles.schoolChip}>
                                <Ionicons name="school-outline" size={16} color={PRIMARY_COLOR} />
                                <Text style={styles.schoolChipText}>{schoolConfig.name}</Text>
                            </View>
                        ) : null}

                        {errors.general ? (
                            <View style={styles.generalError}>
                                <Ionicons name="alert-circle" size={18} color="#DC2626" />
                                <Text style={styles.generalErrorText}>{errors.general}</Text>
                            </View>
                        ) : null}

                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Email or Phone Number</Text>
                            <View
                                style={[
                                    styles.inputWrapper,
                                    errors.credential && styles.inputWrapperError,
                                ]}
                            >
                                <Ionicons
                                    name="mail-outline"
                                    size={20}
                                    color={errors.credential ? '#DC2626' : '#94A3B8'}
                                    style={styles.inputIcon}
                                />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter email or 10-digit mobile number"
                                    placeholderTextColor="#94A3B8"
                                    value={credential}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                    keyboardType="email-address"
                                    onChangeText={(value) => {
                                        setCredential(value);
                                        if (errors.credential || errors.general) {
                                            setErrors((current) => ({
                                                ...current,
                                                credential: null,
                                                general: null,
                                            }));
                                        }
                                    }}
                                    returnKeyType="done"
                                    onSubmitEditing={handleSendReset}
                                />
                            </View>
                            {errors.credential ? (
                                <Text style={styles.errorText}>{errors.credential}</Text>
                            ) : null}
                        </View>

                        <View style={styles.tipRow}>
                            <Ionicons name="information-circle-outline" size={16} color="#64748B" />
                            <Text style={styles.tipText}>
                                If you enter a phone number, we&apos;ll find the email linked to that number
                                before sending the reset link.
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                            onPress={handleSendReset}
                            disabled={loading}
                            activeOpacity={0.85}
                        >
                            {loading ? (
                                <View style={styles.buttonContent}>
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                    <Text style={styles.primaryButtonText}>Sending...</Text>
                                </View>
                            ) : (
                                <View style={styles.buttonContent}>
                                    <Text style={styles.primaryButtonText}>Send reset link</Text>
                                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                                </View>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={goBackToLogin}
                            activeOpacity={0.75}
                        >
                            <Text style={styles.secondaryButtonText}>Back to login</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    flex: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: moderateScale(20),
    },
    card: {
        borderRadius: moderateScale(28),
        paddingHorizontal: moderateScale(22),
        paddingVertical: moderateScale(24),
        borderWidth: 1,
        borderColor: 'rgba(226, 232, 240, 0.9)',
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 8,
    },
    badge: {
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#EFF6FF',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: verticalScale(18),
    },
    badgeText: {
        color: PRIMARY_COLOR,
        fontSize: moderateScale(12, 0.3),
        fontWeight: '700',
    },
    title: {
        fontSize: moderateScale(27, 0.3),
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: verticalScale(8),
    },
    subtitle: {
        fontSize: moderateScale(14, 0.3),
        lineHeight: moderateScale(21, 0.3),
        color: '#475569',
        marginBottom: verticalScale(18),
    },
    schoolChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'flex-start',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#DBEAFE',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: verticalScale(18),
    },
    schoolChipText: {
        color: '#1E3A8A',
        fontWeight: '600',
        fontSize: moderateScale(13, 0.3),
    },
    generalError: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: '#FEF2F2',
        borderRadius: moderateScale(14),
        borderWidth: 1,
        borderColor: '#FECACA',
        padding: moderateScale(14),
        marginBottom: verticalScale(16),
    },
    generalErrorText: {
        flex: 1,
        color: '#B91C1C',
        fontSize: moderateScale(13, 0.3),
        lineHeight: moderateScale(19, 0.3),
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
        backgroundColor: '#F8FAFC',
        borderRadius: moderateScale(14),
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        paddingHorizontal: moderateScale(14),
    },
    inputWrapperError: {
        borderColor: '#F87171',
        backgroundColor: '#FEF2F2',
    },
    inputIcon: {
        marginRight: 10,
    },
    input: {
        flex: 1,
        paddingVertical: moderateScale(15),
        color: '#0F172A',
        fontSize: moderateScale(15, 0.3),
        fontWeight: '500',
    },
    errorText: {
        marginTop: 6,
        marginLeft: 4,
        color: '#DC2626',
        fontSize: moderateScale(12, 0.3),
        fontWeight: '600',
    },
    tipRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
        backgroundColor: '#F8FAFC',
        borderRadius: moderateScale(14),
        padding: moderateScale(12),
        marginTop: verticalScale(4),
        marginBottom: verticalScale(18),
    },
    tipText: {
        flex: 1,
        color: '#475569',
        fontSize: moderateScale(12, 0.3),
        lineHeight: moderateScale(18, 0.3),
        fontWeight: '500',
    },
    primaryButton: {
        backgroundColor: PRIMARY_COLOR,
        borderRadius: moderateScale(14),
        paddingVertical: moderateScale(16),
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButtonDisabled: {
        backgroundColor: '#93C5FD',
    },
    primaryButtonText: {
        color: '#FFFFFF',
        fontSize: moderateScale(15, 0.3),
        fontWeight: '800',
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    secondaryButton: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: moderateScale(14),
        marginTop: verticalScale(10),
    },
    secondaryButtonText: {
        color: PRIMARY_COLOR,
        fontSize: moderateScale(14, 0.3),
        fontWeight: '700',
    },
    orb: {
        position: 'absolute',
        borderRadius: 999,
    },
    orbOne: {
        width: SCREEN_WIDTH * 0.65,
        height: SCREEN_WIDTH * 0.65,
        top: SCREEN_HEIGHT * 0.06,
        left: -SCREEN_WIDTH * 0.18,
        backgroundColor: 'rgba(59, 130, 246, 0.14)',
    },
    orbTwo: {
        width: SCREEN_WIDTH * 0.56,
        height: SCREEN_WIDTH * 0.56,
        top: SCREEN_HEIGHT * 0.14,
        right: -SCREEN_WIDTH * 0.14,
        backgroundColor: 'rgba(99, 102, 241, 0.1)',
    },
    orbThree: {
        width: SCREEN_WIDTH * 0.52,
        height: SCREEN_WIDTH * 0.52,
        bottom: SCREEN_HEIGHT * 0.08,
        alignSelf: 'center',
        backgroundColor: 'rgba(14, 165, 233, 0.08)',
    },
});
