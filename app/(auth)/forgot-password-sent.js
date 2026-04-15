import React, { useEffect, useState } from 'react';
import {
    Dimensions,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LottieView from 'lottie-react-native';
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

export default function ForgotPasswordSentScreen() {
    const insets = useSafeAreaInsets();
    const params = useLocalSearchParams();
    const [schoolConfigParam, setSchoolConfigParam] = useState(
        typeof params.schoolConfig === 'string' ? params.schoolConfig : null
    );

    const email = typeof params.email === 'string' ? params.email : '';
    const credential = typeof params.credential === 'string' ? params.credential : '';

    useEffect(() => {
        let isMounted = true;

        const loadSchoolParam = async () => {
            if (schoolConfigParam) {
                return;
            }

            const currentSchool = await getCurrentSchool();
            const serialized = currentSchool?.schoolData ? JSON.stringify(currentSchool.schoolData) : null;

            if (isMounted && serialized) {
                setSchoolConfigParam(serialized);
            }
        };

        loadSchoolParam();

        return () => {
            isMounted = false;
        };
    }, [schoolConfigParam]);

    const goToLogin = () => {
        router.replace({
            pathname: '/(auth)/login',
            params: {
                prefillEmail: email || credential,
                ...(schoolConfigParam ? { schoolConfig: schoolConfigParam } : {}),
            },
        });
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <StatusBar style="dark" />
            {/* <FloatingBackground /> */}
            <View
                style={styles.flex}
            >
                <View
                    style={[
                        styles.scrollContent,
                        {
                            paddingTop: insets.top + verticalScale(12),
                            paddingBottom: Math.max(insets.bottom, 24),
                        },
                    ]}
                >
                    <LinearGradient
                        colors={['rgba(255,255,255,0.98)', 'rgba(248,250,252,0.96)']}
                        style={styles.card}
                    >
                        <View style={styles.animationWrap}>
                            <LottieView
                                autoPlay
                                loop
                                source={require('../../assets/email_successfull.json')}
                                style={styles.animation}
                            />
                        </View>

                        <View style={styles.badge}>
                            <Ionicons name="checkmark-circle" size={18} color="#15803D" />
                            <Text style={styles.badgeText}>We’ve sent a link to your email</Text>
                        </View>


                        {email ? (
                            <View style={styles.emailChip}>
                                <Ionicons name="mail-outline" size={16} color={PRIMARY_COLOR} />
                                <Text style={styles.emailChipText}>{email}</Text>
                            </View>
                        ) : null}

                        <View style={styles.infoCard}>
                            <Ionicons name="time-outline" size={18} color="#475569" />
                            <Text style={styles.infoCardText}>
                                It can take a little while to arrive. If you don&apos;t see it soon, check
                                your spam or promotions folder.
                            </Text>
                        </View>


                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={goToLogin}
                            activeOpacity={0.85}
                        >
                            <View style={styles.buttonContent}>
                                <Text style={styles.primaryButtonText}>Go to login</Text>
                                <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.secondaryButton}
                            onPress={() => router.replace({
                                pathname: '/(auth)/forgot-password',
                                params: {
                                    prefillCredential: credential,
                                    ...(schoolConfigParam ? { schoolConfig: schoolConfigParam } : {}),
                                },
                            })}
                            activeOpacity={0.75}
                        >
                            <Text style={styles.secondaryButtonText}>Use a different email or phone</Text>
                        </TouchableOpacity>
                    </LinearGradient>
                </View>
            </View>
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
        // borderColor: 'rgba(226, 232, 240, 0.9)',
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 14 },
        elevation: 8,
    },
    animationWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: verticalScale(12),
    },
    animation: {
        width: moderateScale(180),
        height: moderateScale(180),
    },
    badge: {
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#F0FDF4',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: verticalScale(18),
    },
    badgeText: {
        color: '#15803D',
        fontSize: moderateScale(12, 0.3),
        fontWeight: '700',
    },
    title: {
        fontSize: moderateScale(27, 0.3),
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: verticalScale(8),
        textAlign: 'center',
    },
    subtitle: {
        fontSize: moderateScale(14, 0.3),
        lineHeight: moderateScale(21, 0.3),
        color: '#475569',
        marginBottom: verticalScale(18),
        textAlign: 'center',
    },
    emailChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        alignSelf: 'center',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#DBEAFE',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: verticalScale(18),
    },
    emailChipText: {
        color: '#1E3A8A',
        fontWeight: '600',
        fontSize: moderateScale(13, 0.3),
    },
    infoCard: {
        flexDirection: 'row',
        gap: 10,
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: moderateScale(16),
        padding: moderateScale(14),
        marginBottom: verticalScale(16),
    },
    infoCardText: {
        flex: 1,
        color: '#475569',
        fontSize: moderateScale(13, 0.3),
        lineHeight: moderateScale(19, 0.3),
        fontWeight: '600',
    },
    stepsCard: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        borderRadius: moderateScale(16),
        padding: moderateScale(14),
        marginBottom: verticalScale(18),
        gap: 12,
    },
    stepRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    stepDot: {
        width: 24,
        height: 24,
        borderRadius: 999,
        backgroundColor: '#DBEAFE',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 1,
    },
    stepDotText: {
        color: PRIMARY_COLOR,
        fontSize: moderateScale(11, 0.3),
        fontWeight: '800',
    },
    stepText: {
        flex: 1,
        color: '#334155',
        fontSize: moderateScale(13, 0.3),
        lineHeight: moderateScale(19, 0.3),
        fontWeight: '600',
    },
    primaryButton: {
        backgroundColor: PRIMARY_COLOR,
        borderRadius: moderateScale(14),
        paddingVertical: moderateScale(16),
        alignItems: 'center',
        justifyContent: 'center',
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
