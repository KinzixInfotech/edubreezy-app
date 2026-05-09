import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Image,
    ScrollView,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    withDelay,
    Easing,
    interpolate,
    FadeInDown,
    FadeInUp,
    FadeIn,
} from 'react-native-reanimated';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');

const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;
const scale = (size) => (SCREEN_WIDTH / guidelineBaseWidth) * size;
const verticalScale = (size) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;
const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

// ─── Role Configuration ───
const ROLE_OPTIONS = [
    {
        key: 'parent',
        label: 'Parent',
        description: 'Track your child\'s progress',
        icon: 'people-outline',
        color: '#0469ff',
        gradient: ['#0469ff', '#0256d0'],
    },
    {
        key: 'student',
        label: 'Student',
        description: 'Access grades & homework',
        icon: 'school-outline',
        color: '#10B981',
        gradient: ['#10B981', '#059669'],
    },
    {
        key: 'teacher',
        label: 'Teacher',
        description: 'Manage classes & students',
        icon: 'book-outline',
        color: '#8B5CF6',
        gradient: ['#8B5CF6', '#7C3AED'],
    },
    {
        key: 'driver',
        label: 'Driver',
        description: 'Manage routes & trips',
        icon: 'bus-outline',
        color: '#F59E0B',
        gradient: ['#F59E0B', '#D97706'],
    },
    {
        key: 'conductor',
        label: 'Conductor',
        description: 'Manage bus attendance',
        icon: 'ticket-outline',
        color: '#06B6D4',
        gradient: ['#06B6D4', '#0891B2'],
    },
    {
        key: 'accountant',
        label: 'Accountant',
        description: 'Handle finances & fees',
        icon: 'calculator-outline',
        color: '#84CC16',
        gradient: ['#84CC16', '#65A30D'],
    },
    {
        key: 'director',
        label: 'Director',
        description: 'Oversee school operations',
        icon: 'briefcase-outline',
        color: '#7C3AED',
        gradient: ['#7C3AED', '#6D28D9'],
    },
    {
        key: 'principal',
        label: 'Principal',
        description: 'Lead & manage institution',
        icon: 'ribbon-outline',
        color: '#DC2626',
        gradient: ['#DC2626', '#B91C1C'],
    },
];

// ─── Animated Background ───
const AnimatedBackground = () => {
    const progress1 = useSharedValue(0);
    const progress2 = useSharedValue(0);
    const progress3 = useSharedValue(0);

    useEffect(() => {
        const easing = Easing.inOut(Easing.sin);
        progress1.value = withRepeat(withTiming(1, { duration: 10000, easing }), -1, true);
        progress2.value = withDelay(1500, withRepeat(withTiming(1, { duration: 12000, easing }), -1, true));
        progress3.value = withDelay(3000, withRepeat(withTiming(1, { duration: 8000, easing }), -1, true));
    }, []);

    const orb1 = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress1.value, [0, 1], [-40, 50]) },
            { translateY: interpolate(progress1.value, [0, 1], [0, 60]) },
            { scale: interpolate(progress1.value, [0, 0.5, 1], [1, 1.2, 1]) },
        ],
        opacity: interpolate(progress1.value, [0, 0.5, 1], [0.3, 0.5, 0.3]),
    }));

    const orb2 = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress2.value, [0, 1], [30, -40]) },
            { translateY: interpolate(progress2.value, [0, 1], [-20, 50]) },
            { scale: interpolate(progress2.value, [0, 0.5, 1], [1, 1.15, 1]) },
        ],
        opacity: interpolate(progress2.value, [0, 0.5, 1], [0.25, 0.45, 0.25]),
    }));

    const orb3 = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(progress3.value, [0, 1], [20, -30]) },
            { translateY: interpolate(progress3.value, [0, 1], [30, -40]) },
            { scale: interpolate(progress3.value, [0, 0.5, 1], [1, 1.1, 1]) },
        ],
        opacity: interpolate(progress3.value, [0, 0.5, 1], [0.2, 0.4, 0.2]),
    }));

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Animated.View style={[s.bgOrb, s.bgOrb1, orb1]} />
            <Animated.View style={[s.bgOrb, s.bgOrb2, orb2]} />
            <Animated.View style={[s.bgOrb, s.bgOrb3, orb3]} />
        </View>
    );
};

// ─── Role Card Component ───
const RoleCard = ({ role, index, selected, onPress }) => {
    const scaleVal = useSharedValue(1);

    const cardAnimStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scaleVal.value }],
    }));

    const handlePress = () => {
        scaleVal.value = withTiming(0.95, { duration: 80 }, () => {
            scaleVal.value = withTiming(1, { duration: 120 });
        });
        onPress(role.key);
    };

    return (
        <Animated.View
            entering={FadeInDown.delay(100 + index * 60).duration(500).springify()}
            style={cardAnimStyle}
        >
            <TouchableOpacity
                style={[
                    s.roleCard,
                    selected && { borderColor: role.color, borderWidth: 2.5 },
                ]}
                activeOpacity={0.85}
                onPress={handlePress}
            >
                {/* Colored accent bar */}
                <LinearGradient
                    colors={role.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.roleCardAccent}
                />

                <View style={s.roleCardBody}>
                    {/* Icon circle */}
                    <View style={[s.roleIconCircle, { backgroundColor: role.color + '15' }]}>
                        <Ionicons name={role.icon} size={24} color={role.color} />
                    </View>

                    {/* Text */}
                    <View style={s.roleCardTextWrap}>
                        <Text style={s.roleCardLabel}>{role.label}</Text>
                        <Text style={s.roleCardDesc} numberOfLines={1}>{role.description}</Text>
                    </View>

                    {/* Selection indicator */}
                    <View style={[
                        s.roleCheckCircle,
                        selected && { backgroundColor: role.color, borderColor: role.color },
                    ]}>
                        {selected && (
                            <Ionicons name="checkmark" size={14} color="#FFF" />
                        )}
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    );
};

// ─── School Mini Card ───
const SchoolMiniCard = ({ schoolData }) => {
    if (!schoolData) return null;
    const { name, profilePicture, city, state } = schoolData;
    const locationParts = [city, state].filter(Boolean);
    const locationStr = locationParts.length > 0 ? locationParts.join(', ') : null;

    return (
        <Animated.View entering={FadeInDown.delay(50).duration(500)} style={s.schoolMini}>
            <View style={s.schoolMiniLogoWrap}>
                {profilePicture ? (
                    <Image source={{ uri: profilePicture }} style={s.schoolMiniLogo} resizeMode="cover" />
                ) : (
                    <View style={s.schoolMiniLogoFallback}>
                        <Text style={s.schoolMiniLogoText}>{name?.charAt(0)?.toUpperCase() || 'S'}</Text>
                    </View>
                )}
            </View>
            <View style={s.schoolMiniTextBlock}>
                <Text style={s.schoolMiniName} numberOfLines={1}>{name || 'School'}</Text>
                {locationStr && (
                    <View style={s.schoolMiniLocRow}>
                        <Ionicons name="location-outline" size={11} color="#94A3B8" />
                        <Text style={s.schoolMiniLocText}>{locationStr}</Text>
                    </View>
                )}
            </View>
        </Animated.View>
    );
};

// ═══════════════════════════════════════════════════════
// ─── MAIN SCREEN ───
// ═══════════════════════════════════════════════════════
export default function RoleSelectorScreen() {
    const insets = useSafeAreaInsets();
    const { schoolConfig: schoolConfigParam, isAddingAccount } = useLocalSearchParams();
    const [schoolConfig, setSchoolConfig] = useState(null);
    const [selectedRole, setSelectedRole] = useState(null);
    // Measured height of the bottom CTA — drives ScrollView paddingBottom dynamically
    const [ctaHeight, setCtaHeight] = useState(0);

    useEffect(() => {
        if (typeof schoolConfigParam === 'string' && schoolConfigParam) {
            try {
                const config = JSON.parse(schoolConfigParam);
                setSchoolConfig(config.school || config);
            } catch (e) {
                console.error('Error parsing school config:', e);
            }
        }
    }, [schoolConfigParam]);

    const handleContinue = () => {
        if (!selectedRole) return;
        router.push({
            pathname: '/(auth)/login',
            params: {
                schoolConfig: schoolConfigParam,
                selectedRole,
                ...(isAddingAccount === 'true' ? { isAddingAccount: 'true' } : {}),
            },
        });
    };

    const handleBack = () => {
        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/(auth)/schoolcode');
        }
    };

    const selectedRoleData = ROLE_OPTIONS.find(r => r.key === selectedRole);

    return (
        <View style={s.container}>
            <StatusBar style="dark" />
            <AnimatedBackground />

            <ScrollView
                contentContainerStyle={[
                    s.scrollContent,
                    {
                        paddingTop: insets.top + verticalScale(12),
                        // Always clear the CTA by its real measured height + a little breathing room
                        paddingBottom: ctaHeight + 16,
                    },
                ]}
                showsVerticalScrollIndicator={false}
                bounces={false}
            >
                {/* Back button */}
                <Animated.View entering={FadeIn.delay(50).duration(400)}>
                    <TouchableOpacity
                        style={s.backButton}
                        onPress={handleBack}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="arrow-back" size={22} color="#1E293B" />
                    </TouchableOpacity>
                </Animated.View>

                {/* School info */}
                <SchoolMiniCard schoolData={schoolConfig} />

                {/* Header */}
                <Animated.View
                    entering={FadeInDown.delay(100).duration(500)}
                    style={s.headerSection}
                >
                    <Text style={s.title}>Who are you?</Text>
                    <Text style={s.subtitle}>
                        Select your role to continue to login
                    </Text>
                </Animated.View>

                {/* Role Cards Grid */}
                <View style={s.rolesGrid}>
                    {ROLE_OPTIONS.map((role, index) => (
                        <RoleCard
                            key={role.key}
                            role={role}
                            index={index}
                            selected={selectedRole === role.key}
                            onPress={setSelectedRole}
                        />
                    ))}
                </View>
            </ScrollView>

            {/* Fixed bottom CTA — onLayout measures real height (incl. safe area + hint row) */}
            <Animated.View
                entering={FadeInUp.delay(600).duration(500)}
                onLayout={(e) => setCtaHeight(e.nativeEvent.layout.height)}
                style={[
                    s.bottomCTA,
                    // Safe area padding applied here so it's included in the measured height
                    { paddingBottom: Math.max(insets.bottom, 16) + 8 },
                ]}
            >
                {selectedRole && selectedRoleData && (
                    <Animated.View entering={FadeIn.duration(250)} style={s.selectedHint}>
                        <View style={[s.selectedHintIcon, { backgroundColor: selectedRoleData.color + '15' }]}>
                            <Ionicons name={selectedRoleData.icon} size={16} color={selectedRoleData.color} />
                        </View>
                        <Text style={s.selectedHintText}>
                            Logging in as <Text style={{ fontWeight: '800', color: selectedRoleData.color }}>{selectedRoleData.label}</Text>
                        </Text>
                    </Animated.View>
                )}
                <TouchableOpacity
                    style={[
                        s.continueButton,
                        !selectedRole && s.continueButtonDisabled,
                        selectedRole && selectedRoleData && { backgroundColor: selectedRoleData.color },
                    ]}
                    onPress={handleContinue}
                    disabled={!selectedRole}
                    activeOpacity={0.85}
                >
                    <Text style={s.continueButtonText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFF" />
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
}

// ═══════════════════════════════════════════════════════
// ─── STYLES ───
// ═══════════════════════════════════════════════════════
const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    scrollContent: {
        paddingHorizontal: moderateScale(20),
    },

    // Background orbs
    bgOrb: { position: 'absolute', borderRadius: 999 },
    bgOrb1: {
        width: SCREEN_WIDTH * 0.6,
        height: SCREEN_WIDTH * 0.6,
        backgroundColor: 'rgba(59, 130, 246, 0.10)',
        top: SCREEN_HEIGHT * 0.06,
        left: -SCREEN_WIDTH * 0.15,
    },
    bgOrb2: {
        width: SCREEN_WIDTH * 0.5,
        height: SCREEN_WIDTH * 0.5,
        backgroundColor: 'rgba(99, 102, 241, 0.08)',
        top: SCREEN_HEIGHT * 0.35,
        right: -SCREEN_WIDTH * 0.1,
    },
    bgOrb3: {
        width: SCREEN_WIDTH * 0.45,
        height: SCREEN_WIDTH * 0.45,
        backgroundColor: 'rgba(139, 92, 246, 0.07)',
        bottom: SCREEN_HEIGHT * 0.15,
        left: SCREEN_WIDTH * 0.1,
    },

    // Back button
    backButton: {
        width: 42,
        height: 42,
        borderRadius: 14,
        backgroundColor: 'rgba(241, 245, 249, 0.9)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: verticalScale(12),
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },

    // School mini card
    schoolMini: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: verticalScale(16),
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    schoolMiniLogoWrap: {
        width: 38,
        height: 38,
        borderRadius: 10,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        backgroundColor: '#F1F5F9',
    },
    schoolMiniLogo: {
        width: '100%',
        height: '100%',
    },
    schoolMiniLogoFallback: {
        width: '100%',
        height: '100%',
        backgroundColor: '#0469ff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    schoolMiniLogoText: {
        fontSize: 16,
        fontWeight: '800',
        color: '#FFF',
    },
    schoolMiniTextBlock: {
        flex: 1,
    },
    schoolMiniName: {
        fontSize: moderateScale(13, 0.3),
        fontWeight: '700',
        color: '#1E293B',
    },
    schoolMiniLocRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        marginTop: 2,
    },
    schoolMiniLocText: {
        fontSize: moderateScale(11, 0.3),
        color: '#94A3B8',
        fontWeight: '500',
    },

    // Header
    headerSection: {
        marginBottom: verticalScale(20),
    },
    title: {
        fontSize: moderateScale(30, 0.4),
        fontWeight: '800',
        color: '#0F172A',
        letterSpacing: -0.8,
        marginBottom: verticalScale(6),
    },
    subtitle: {
        fontSize: moderateScale(14, 0.3),
        fontWeight: '400',
        color: '#64748B',
        lineHeight: moderateScale(20, 0.3),
    },

    // Roles grid
    rolesGrid: {
        gap: 10,
    },

    // Role card
    roleCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
    },
    roleCardAccent: {
        height: 3,
        width: '100%',
    },
    roleCardBody: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
    },
    roleIconCircle: {
        width: 46,
        height: 46,
        borderRadius: 23,
        alignItems: 'center',
        justifyContent: 'center',
    },
    roleCardTextWrap: {
        flex: 1,
        gap: 2,
    },
    roleCardLabel: {
        fontSize: moderateScale(15, 0.3),
        fontWeight: '700',
        color: '#1E293B',
    },
    roleCardDesc: {
        fontSize: moderateScale(12, 0.3),
        fontWeight: '500',
        color: '#94A3B8',
    },
    roleCheckCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        backgroundColor: '#F9FAFB',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Bottom CTA
    bottomCTA: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(255,255,255,0.96)',
        paddingHorizontal: moderateScale(20),
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#F1F5F9',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
            },
            android: {
                elevation: 8,
            },
        }),
    },
    selectedHint: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    selectedHintIcon: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    selectedHintText: {
        fontSize: moderateScale(13, 0.3),
        color: '#475569',
        fontWeight: '500',
    },
    continueButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#0469ff',
        borderRadius: 14,
        paddingVertical: 16,
    },
    continueButtonDisabled: {
        backgroundColor: '#CBD5E1',
    },
    continueButtonText: {
        fontSize: moderateScale(16, 0.3),
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.3,
    },
});