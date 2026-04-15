import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';
import { getCurrentSchool } from '../../lib/profileManager';
import {
    hydrateRecoverySessionFromUrl,
    getRecoveryErrorMessage,
    recoveryErrorMessages,
} from '../../lib/passwordRecovery';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');
const PRIMARY = '#0b5cde';
const PRIMARY_LIGHT = '#EEF4FF';
const BASE_W = 375;
const BASE_H = 812;

const scale = (s) => (SCREEN_WIDTH / BASE_W) * s;
const vs = (s) => (SCREEN_HEIGHT / BASE_H) * s;
const ms = (s, f = 0.45) => s + (scale(s) - s) * f;

// ─── Password strength engine ─────────────────────────────────────────────────
const getPasswordStrength = (value) => {
    if (!value) return null;
    const len = value.length;
    const hasUpper = /[A-Z]/.test(value);
    const hasLower = /[a-z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);
    const variety = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

    if (len < 4) return { level: 0, label: 'Too short', color: '#EF4444', bars: 1 };
    if (len < 6) return { level: 1, label: 'Weak', color: '#F97316', bars: 2 };
    if (len >= 6 && variety <= 1) return { level: 1, label: 'Weak', color: '#F97316', bars: 2 };
    if (len >= 8 && variety >= 3) return { level: 3, label: 'Unbreakable', color: PRIMARY, bars: 4 };
    if (len >= 6 && variety >= 2) return { level: 2, label: 'Strong', color: '#10B981', bars: 3 };
    return { level: 1, label: 'Weak', color: '#F97316', bars: 2 };
};

const getMatchStatus = (password, confirm) => {
    if (!confirm) return null;
    if (password === confirm) return { ok: true, label: 'Passwords match', color: '#10B981' };
    return { ok: false, label: 'Does not match', color: '#EF4444' };
};

// ─── Strength bar ─────────────────────────────────────────────────────────────
const StrengthBar = ({ strength }) => {
    const anim = useRef([
        new Animated.Value(0),
        new Animated.Value(0),
        new Animated.Value(0),
        new Animated.Value(0),
    ]).current;

    useEffect(() => {
        anim.forEach((a, i) => {
            Animated.timing(a, {
                toValue: strength && i < strength.bars ? 1 : 0,
                duration: 260,
                delay: i * 55,
                useNativeDriver: false,
            }).start();
        });
    }, [strength?.bars]);

    if (!strength) return null;
    return (
        <View style={sb.row}>
            <View style={sb.bars}>
                {anim.map((a, i) => (
                    <Animated.View
                        key={i}
                        style={[sb.bar, {
                            backgroundColor: a.interpolate({
                                inputRange: [0, 1],
                                outputRange: ['#E2E8F0', strength.color],
                            }),
                        }]}
                    />
                ))}
            </View>
            <Text style={[sb.label, { color: strength.color }]}>{strength.label}</Text>
        </View>
    );
};

const sb = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: vs(7) },
    bars: { flexDirection: 'row', gap: 5, flex: 1 },
    bar: { flex: 1, height: 4, borderRadius: 4 },
    label: { fontSize: ms(12, 0.3), fontWeight: '700', minWidth: 90, textAlign: 'right' },
});

// ─── Match indicator ──────────────────────────────────────────────────────────
const MatchRow = ({ match }) => {
    if (!match) return null;
    return (
        <View style={[mr.row]}>
            <Ionicons
                name={match.ok ? 'checkmark-circle' : 'close-circle'}
                size={13}
                color={match.color}
            />
            <Text style={[mr.text, { color: match.color }]}>{match.label}</Text>
        </View>
    );
};

const mr = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: vs(6) },
    text: { fontSize: ms(12, 0.3), fontWeight: '700' },
});

// ─── Password requirements checklist ─────────────────────────────────────────
const REQUIREMENTS = [
    { id: 'len', label: 'At least 6 characters', test: (v) => v.length >= 6 },
    { id: 'upper', label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
    { id: 'number', label: 'One number', test: (v) => /\d/.test(v) },
];

const Requirements = ({ password, visible }) => {
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fadeAnim, {
            toValue: visible ? 1 : 0,
            duration: 200,
            useNativeDriver: true,
        }).start();
    }, [visible]);

    return (
        <Animated.View style={[req.wrap, { opacity: fadeAnim }]}>
            {REQUIREMENTS.map((r) => {
                const met = password ? r.test(password) : false;
                return (
                    <View key={r.id} style={req.row}>
                        <Ionicons
                            name={met ? 'checkmark-circle' : 'ellipse-outline'}
                            size={13}
                            color={met ? '#10B981' : '#CBD5E1'}
                        />
                        <Text style={[req.label, met && req.labelMet]}>{r.label}</Text>
                    </View>
                );
            })}
        </Animated.View>
    );
};

const req = StyleSheet.create({
    wrap: {
        backgroundColor: '#F8FAFC',
        borderRadius: ms(12),
        padding: ms(12),
        gap: 6,
        marginTop: vs(8),
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    label: { fontSize: ms(12, 0.3), color: '#94A3B8', fontWeight: '500' },
    labelMet: { color: '#10B981', fontWeight: '600' },
});

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function ResetPasswordScreen() {
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCheckingLink, setIsCheckingLink] = useState(true);
    const [linkStatus, setLinkStatus] = useState('checking');
    const [infoMessage, setInfoMessage] = useState('');
    const [pwFocused, setPwFocused] = useState(false);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(28)).current;

    const prefilledEmail = useMemo(
        () => (typeof params.email === 'string' ? params.email : ''),
        [params.email]
    );

    const strength = useMemo(() => getPasswordStrength(password), [password]);
    const match = useMemo(() => getMatchStatus(password, confirmPassword), [password, confirmPassword]);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 480, useNativeDriver: true }),
            Animated.timing(slideAnim, { toValue: 0, duration: 420, useNativeDriver: true }),
        ]).start();
    }, []);

    useEffect(() => {
        let mounted = true;
        const syncRecoverySession = async () => {
            try {
                if (params.status === 'error') {
                    if (!mounted) return;
                    setLinkStatus('invalid');
                    setInfoMessage(typeof params.message === 'string' ? params.message : recoveryErrorMessages.invalid);
                    return;
                }
                if (params.status === 'ready') {
                    if (!mounted) return;
                    setLinkStatus('ready');
                    setInfoMessage('Choose a strong new password for your account.');
                    return;
                }
                const initialUrl = await Linking.getInitialURL();
                if (initialUrl) {
                    const result = await hydrateRecoverySessionFromUrl(initialUrl);
                    if (result?.matched) {
                        if (!mounted) return;
                        if (result.status === 'error') {
                            setLinkStatus('invalid');
                            setInfoMessage(result.message || recoveryErrorMessages.invalid);
                        } else {
                            setLinkStatus('ready');
                            setInfoMessage('Choose a strong new password for your account.');
                        }
                        return;
                    }
                }
                const { data: { session } } = await supabase.auth.getSession();
                if (!mounted) return;
                if (session?.access_token) {
                    setLinkStatus('ready');
                    setInfoMessage('Choose a strong new password for your account.');
                } else {
                    setLinkStatus('invalid');
                    setInfoMessage(recoveryErrorMessages.invalid);
                }
            } catch (e) {
                if (!mounted) return;
                setLinkStatus('invalid');
                setInfoMessage(getRecoveryErrorMessage(e));
            } finally {
                if (mounted) setIsCheckingLink(false);
            }
        };
        syncRecoverySession();
        return () => { mounted = false; };
    }, [params.message, params.status]);

    const goBackToLogin = useCallback(async () => {
        const currentSchool = await getCurrentSchool();
        const schoolConfig = currentSchool?.schoolData ? JSON.stringify(currentSchool.schoolData) : undefined;
        if (schoolConfig) {
            router.replace({ pathname: '/(auth)/login', params: { prefillEmail: prefilledEmail, schoolConfig } });
        } else {
            router.replace('/(auth)/schoolcode');
        }
    }, [prefilledEmail]);

    const validateForm = useCallback(() => {
        const errs = {};
        if (!password) errs.password = 'New password is required';
        else if (password.length < 6) errs.password = 'Must be at least 6 characters';
        else if (password.length > 50) errs.password = 'Password is too long';
        if (!confirmPassword) errs.confirmPassword = 'Please confirm your new password';
        else if (password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
        setErrors(errs);
        return Object.keys(errs).length === 0;
    }, [password, confirmPassword]);

    const handleResetPassword = useCallback(async () => {
        if (!validateForm()) return;
        try {
            setIsSubmitting(true);
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                setLinkStatus('invalid');
                setInfoMessage(recoveryErrorMessages.invalid);
                return;
            }
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            await supabase.auth.signOut().catch(() => null);
            await SecureStore.deleteItemAsync('token');
            await SecureStore.deleteItemAsync('user');
            await SecureStore.deleteItemAsync('userRole');
            Alert.alert('Password updated', 'Sign in with your new password.', [
                { text: 'OK', onPress: () => goBackToLogin() },
            ]);
        } catch (e) {
            Alert.alert('Reset failed', getRecoveryErrorMessage(e, e?.message));
        } finally {
            setIsSubmitting(false);
        }
    }, [password, validateForm, goBackToLogin]);

    return (
        <SafeAreaView style={s.root}>
            <StatusBar style="dark" />

            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View style={s.blob1} />
                <View style={s.blob2} />
            </View>

            <KeyboardAvoidingView
                style={s.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                <ScrollView
                    contentContainerStyle={[
                        s.scroll,
                        {
                            paddingTop: insets.top + vs(16),
                            paddingBottom: Math.max(insets.bottom + vs(24), 40),
                        },
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                >
                    <Animated.View style={[s.inner, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

                        {/* Icon lockup */}
                        <View style={s.iconWrap}>
                            <View style={[
                                s.iconOuter,
                                linkStatus === 'invalid' && s.iconOuterDanger,
                            ]}>
                                <View style={[
                                    s.iconInner,
                                    linkStatus === 'invalid' && s.iconInnerDanger,
                                ]}>
                                    <Ionicons
                                        name={linkStatus === 'invalid' ? 'warning' : 'lock-closed'}
                                        size={ms(26)}
                                        color={linkStatus === 'invalid' ? '#DC2626' : PRIMARY}
                                    />
                                </View>
                            </View>
                        </View>

                        <Text style={s.title}>
                            {linkStatus === 'invalid' ? 'Link Expired' : 'Reset Password'}
                        </Text>
                        <Text style={s.subtitle}>
                            {isCheckingLink
                                ? 'Verifying your reset link…'
                                : infoMessage || 'Choose a strong new password for your account.'}
                        </Text>

                        {prefilledEmail ? (
                            <View style={s.emailChip}>
                                <Ionicons name="mail-outline" size={14} color={PRIMARY} />
                                <Text style={s.emailChipText}>{prefilledEmail}</Text>
                            </View>
                        ) : null}

                        {/* Checking state */}
                        {isCheckingLink ? (
                            <View style={s.centerState}>
                                <ActivityIndicator size="small" color={PRIMARY} />
                                <Text style={s.centerStateText}>Checking link…</Text>
                            </View>

                        ) : linkStatus === 'invalid' ? (
                            <>
                                <View style={s.errorBanner}>
                                    <Ionicons name="warning-outline" size={16} color="#DC2626" />
                                    <Text style={s.errorBannerText}>{infoMessage}</Text>
                                </View>
                                <TouchableOpacity style={s.btn} onPress={goBackToLogin} activeOpacity={0.85}>
                                    <Text style={s.btnText}>Back to Login</Text>
                                </TouchableOpacity>
                            </>

                        ) : (
                            <>
                                {/* New password */}
                                <View style={s.group}>
                                    <Text style={s.label}>New Password</Text>
                                    <View style={[
                                        s.inputWrap,
                                        pwFocused && s.inputWrapFocused,
                                        errors.password && s.inputWrapError,
                                    ]}>
                                        <Ionicons
                                            name="lock-closed-outline"
                                            size={18}
                                            color={errors.password ? '#DC2626' : pwFocused ? PRIMARY : '#94A3B8'}
                                            style={s.inputIcon}
                                        />
                                        <TextInput
                                            style={s.input}
                                            placeholder="Enter new password"
                                            placeholderTextColor="#CBD5E1"
                                            secureTextEntry={!showPassword}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            value={password}
                                            onChangeText={(v) => {
                                                setPassword(v);
                                                if (errors.password) setErrors((c) => ({ ...c, password: null }));
                                            }}
                                            onFocus={() => setPwFocused(true)}
                                            onBlur={() => setPwFocused(false)}
                                        />
                                        <TouchableOpacity
                                            onPress={() => setShowPassword((v) => !v)}
                                            hitSlop={10}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                                size={18}
                                                color="#94A3B8"
                                            />
                                        </TouchableOpacity>
                                    </View>

                                    {(pwFocused || password.length > 0) && (
                                        <>
                                            <StrengthBar strength={strength} />
                                            <Requirements password={password} visible />
                                        </>
                                    )}
                                    {errors.password ? (
                                        <View style={s.fieldErrRow}>
                                            <Ionicons name="alert-circle" size={13} color="#DC2626" />
                                            <Text style={s.fieldErrText}>{errors.password}</Text>
                                        </View>
                                    ) : null}
                                </View>

                                {/* Confirm password */}
                                <View style={s.group}>
                                    <Text style={s.label}>Confirm Password</Text>
                                    <View style={[
                                        s.inputWrap,
                                        errors.confirmPassword && s.inputWrapError,
                                        !errors.confirmPassword && match?.ok && s.inputWrapSuccess,
                                    ]}>
                                        <Ionicons
                                            name="shield-checkmark-outline"
                                            size={18}
                                            color={
                                                errors.confirmPassword ? '#DC2626'
                                                    : match?.ok ? '#10B981'
                                                        : '#94A3B8'
                                            }
                                            style={s.inputIcon}
                                        />
                                        <TextInput
                                            style={s.input}
                                            placeholder="Re-enter your password"
                                            placeholderTextColor="#CBD5E1"
                                            secureTextEntry={!showConfirmPassword}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                            value={confirmPassword}
                                            onChangeText={(v) => {
                                                setConfirmPassword(v);
                                                if (errors.confirmPassword) setErrors((c) => ({ ...c, confirmPassword: null }));
                                            }}
                                        />
                                        <TouchableOpacity
                                            onPress={() => setShowConfirmPassword((v) => !v)}
                                            hitSlop={10}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons
                                                name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                                                size={18}
                                                color="#94A3B8"
                                            />
                                        </TouchableOpacity>
                                    </View>

                                    <MatchRow match={match} />

                                    {errors.confirmPassword ? (
                                        <View style={s.fieldErrRow}>
                                            <Ionicons name="alert-circle" size={13} color="#DC2626" />
                                            <Text style={s.fieldErrText}>{errors.confirmPassword}</Text>
                                        </View>
                                    ) : null}
                                </View>

                                {/* CTA */}
                                <TouchableOpacity
                                    style={[s.btn, isSubmitting && s.btnDisabled]}
                                    onPress={handleResetPassword}
                                    disabled={isSubmitting}
                                    activeOpacity={0.82}
                                >
                                    {isSubmitting ? (
                                        <View style={s.btnRow}>
                                            <ActivityIndicator size="small" color="#fff" />
                                            <Text style={s.btnText}>Updating…</Text>
                                        </View>
                                    ) : (
                                        <View style={s.btnRow}>
                                            <Text style={s.btnText}>Update Password</Text>
                                            <Ionicons name="arrow-forward" size={17} color="#fff" />
                                        </View>
                                    )}
                                </TouchableOpacity>

                                <TouchableOpacity style={s.back} onPress={goBackToLogin} activeOpacity={0.7}>
                                    <Text style={s.backText}>Cancel</Text>
                                </TouchableOpacity>
                            </>
                        )}

                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    flex: { flex: 1 },

    blob1: {
        position: 'absolute',
        width: SCREEN_WIDTH * 0.85,
        height: SCREEN_WIDTH * 0.85,
        borderRadius: SCREEN_WIDTH,
        backgroundColor: 'rgba(11, 92, 222, 0.06)',
        top: -SCREEN_WIDTH * 0.25,
        left: -SCREEN_WIDTH * 0.2,
    },
    blob2: {
        position: 'absolute',
        width: SCREEN_WIDTH * 0.7,
        height: SCREEN_WIDTH * 0.7,
        borderRadius: SCREEN_WIDTH,
        backgroundColor: 'rgba(59, 130, 246, 0.05)',
        bottom: SCREEN_HEIGHT * 0.04,
        right: -SCREEN_WIDTH * 0.18,
    },

    scroll: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: ms(20),
    },

    inner: {
        backgroundColor: '#FFFFFF',
        borderRadius: ms(22),
        paddingHorizontal: ms(22),
        paddingTop: ms(30),
        paddingBottom: ms(26),
        borderWidth: 1,
        borderColor: 'rgba(226,232,240,0.8)',
        shadowColor: '#0F172A',
        shadowOpacity: 0.07,
        shadowRadius: 28,
        shadowOffset: { width: 0, height: 10 },
        elevation: 6,
    },

    iconWrap: { alignItems: 'center', marginBottom: vs(20) },
    iconOuter: {
        width: ms(72),
        height: ms(72),
        borderRadius: ms(22),
        backgroundColor: PRIMARY_LIGHT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconOuterDanger: { backgroundColor: '#FEF2F2' },
    iconInner: {
        width: ms(52),
        height: ms(52),
        borderRadius: ms(16),
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconInnerDanger: { backgroundColor: '#FECACA' },

    title: {
        fontSize: ms(24, 0.3),
        fontWeight: '700',
        color: '#0F172A',
        textAlign: 'center',
        letterSpacing: -0.5,
        marginBottom: vs(8),
    },
    subtitle: {
        fontSize: ms(14, 0.3),
        lineHeight: ms(21, 0.3),
        color: '#64748B',
        textAlign: 'center',
        marginBottom: vs(20),
        paddingHorizontal: ms(4),
    },

    emailChip: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        gap: 6,
        backgroundColor: PRIMARY_LIGHT,
        borderWidth: 1,
        borderColor: '#BFDBFE',
        borderRadius: 999,
        paddingHorizontal: ms(12),
        paddingVertical: vs(6),
        marginBottom: vs(18),
    },
    emailChipText: {
        color: '#1E40AF',
        fontWeight: '600',
        fontSize: ms(12, 0.3),
    },

    centerState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: vs(24),
        gap: 10,
    },
    centerStateText: {
        color: '#64748B',
        fontSize: ms(14, 0.3),
        fontWeight: '600',
    },

    errorBanner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        backgroundColor: '#FEF2F2',
        borderRadius: ms(12),
        borderWidth: 1,
        borderColor: '#FECACA',
        padding: ms(13),
        marginBottom: vs(18),
    },
    errorBannerText: {
        flex: 1,
        color: '#B91C1C',
        fontSize: ms(13, 0.3),
        lineHeight: ms(19, 0.3),
        fontWeight: '600',
    },

    group: { marginBottom: vs(14) },
    label: {
        fontSize: ms(12, 0.3),
        fontWeight: '600',
        color: '#374151',
        marginBottom: vs(7),
        letterSpacing: 0.1,
    },

    inputWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F8FAFC',
        borderRadius: ms(13),
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        paddingHorizontal: ms(14),
        paddingVertical: Platform.OS === 'ios' ? vs(2) : 0,
    },
    inputWrapFocused: { borderColor: PRIMARY, backgroundColor: '#F0F6FF' },
    inputWrapError: { borderColor: '#F87171', backgroundColor: '#FEF2F2' },
    inputWrapSuccess: { borderColor: '#10B981', backgroundColor: '#F0FDF4' },
    inputIcon: { marginRight: 10 },
    input: {
        flex: 1,
        paddingVertical: ms(14),
        color: '#0F172A',
        fontSize: ms(15, 0.3),
        fontWeight: '500',
    },

    fieldErrRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        marginTop: vs(6),
    },
    fieldErrText: {
        color: '#DC2626',
        fontSize: ms(12, 0.3),
        fontWeight: '600',
    },

    btn: {
        backgroundColor: PRIMARY,
        borderRadius: ms(13),
        paddingVertical: ms(15),
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: vs(4),
    },
    btnDisabled: { backgroundColor: '#93C5FD' },
    btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    btnText: {
        color: '#FFFFFF',
        fontSize: ms(15, 0.3),
        fontWeight: '700',
        letterSpacing: 0.1,
    },

    back: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: ms(13),
        marginTop: vs(6),
    },
    backText: {
        color: PRIMARY,
        fontSize: ms(14, 0.3),
        fontWeight: '600',
    },
});