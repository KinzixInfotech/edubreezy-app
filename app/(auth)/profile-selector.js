import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Dimensions,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { Plus, LogOut, ChevronRight } from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import { getProfilesForSchool, removeProfile, updateLastUsed, clearSchoolProfiles } from '../../lib/profileManager';
import HapticTouchable from '../components/HapticTouch';

const { width } = Dimensions.get('window');
const PROFILE_SIZE = 100;

// Role badge colors
const ROLE_COLORS = {
    STUDENT: '#10B981',
    PARENT: '#0469ff',
    TEACHING_STAFF: '#8B5CF6',
    ADMIN: '#EF4444',
    DRIVER: '#F59E0B',
    CONDUCTOR: '#06B6D4',
};

export default function ProfileSelectorScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const schoolCode = params.schoolCode;
    const schoolData = params.schoolData ? JSON.parse(params.schoolData) : null;

    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadProfiles();
    }, []);

    const loadProfiles = async () => {
        try {
            const savedProfiles = await getProfilesForSchool(schoolCode);
            // Sort by last used (most recent first)
            savedProfiles.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));
            setProfiles(savedProfiles);
        } catch (error) {
            console.error('Error loading profiles:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleProfileSelect = async (profile) => {
        try {
            // Update last used timestamp
            await updateLastUsed(schoolCode, profile.id);

            // Save minimized user data as current user
            await SecureStore.setItemAsync('user', JSON.stringify(profile.userData));
            await SecureStore.setItemAsync('userRole', JSON.stringify(profile.role));

            // Navigate to home instantly
            router.replace('/(tabs)/home');
        } catch (error) {
            console.error('Error selecting profile:', error);
            Alert.alert('Error', 'Failed to load profile. Please try again.');
        }
    };

    const handleAddAccount = () => {
        router.push({
            pathname: '/(auth)/login',
            params: {
                schoolConfig: params.schoolData,
                isAddingAccount: 'true',
            },
        });
    };

    const handleLogoutAll = () => {
        Alert.alert(
            'Logout All Accounts',
            'Are you sure you want to remove all saved profiles for this school?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout All',
                    style: 'destructive',
                    onPress: async () => {
                        await clearSchoolProfiles(schoolCode);
                        router.replace({
                            pathname: '/(auth)/login',
                            params: { schoolConfig: params.schoolData },
                        });
                    },
                },
            ]
        );
    };

    const handleDeleteProfile = (profile) => {
        Alert.alert(
            'Remove Profile',
            `Remove ${profile.name} from saved profiles?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        await removeProfile(schoolCode, profile.id);
                        loadProfiles();
                    },
                },
            ]
        );
    };

    const getInitials = (name) => {
        if (!name) return '?';
        const parts = name.trim().split(' ');
        if (parts.length === 1) return parts[0][0].toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const getTimeAgo = (timestamp) => {
        const now = new Date();
        const then = new Date(timestamp);
        const diff = Math.floor((now - then) / 1000); // seconds

        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };

    if (loading) {
        return (
            <View style={styles.loaderContainer}>
                <Text style={styles.loadingText}>Loading profiles...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            <LinearGradient
                colors={['#EFF6FF', '#FFFFFF']}
                style={StyleSheet.absoluteFill}
            />

            {/* Header */}
            <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
                <Text style={styles.title}>Welcome Back!</Text>
                <Text style={styles.subtitle}>Select your profile to continue</Text>
                {schoolData?.school && (
                    <Text style={styles.schoolName}>{schoolData.school.name}</Text>
                )}
            </Animated.View>

            {/* Horizontal Profile Scroll (Snapchat Style) */}
            <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.scrollSection}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    snapToInterval={width * 0.28 + 20}
                    decelerationRate="fast"
                >
                    {profiles.map((profile, index) => (
                        <HapticTouchable
                            key={profile.id}
                            onPress={() => handleProfileSelect(profile)}
                            onLongPress={() => handleDeleteProfile(profile)}
                        >
                            <Animated.View
                                entering={FadeIn.delay(300 + index * 100).duration(400)}
                            >
                                <View style={styles.profileCard}>
                                    {/* Avatar */}
                                    <View style={[
                                        styles.avatarContainer,
                                        { borderColor: ROLE_COLORS[profile.role] || '#94A3B8' }
                                    ]}>
                                        {profile.profilePicture && profile.profilePicture !== 'default.png' ? (
                                            <Image
                                                source={{ uri: profile.profilePicture }}
                                                style={styles.avatar}
                                            />
                                        ) : (
                                            <View style={[styles.avatarPlaceholder, { backgroundColor: ROLE_COLORS[profile.role] || '#94A3B8' }]}>
                                                <Text style={styles.avatarText}>{getInitials(profile.name)}</Text>
                                            </View>
                                        )}
                                        {/* Role Badge */}
                                        <View style={[styles.roleBadge, { backgroundColor: ROLE_COLORS[profile.role] || '#94A3B8' }]}>
                                            <Text style={styles.roleBadgeText}>
                                                {profile.role === 'TEACHING_STAFF' ? 'TEACHER' : profile.role}
                                            </Text>
                                        </View>
                                    </View>

                                    {/* Profile Info */}
                                    <Text style={styles.profileName} numberOfLines={1}>{profile.name}</Text>
                                    {profile.class && (
                                        <Text style={styles.profileClass} numberOfLines={1}>
                                            {typeof profile.class === 'string' ? profile.class : profile.class.className || ''}
                                        </Text>
                                    )}
                                    {profile.email && (
                                        <Text style={styles.profileEmail} numberOfLines={1}>{profile.email}</Text>
                                    )}
                                    <Text style={styles.lastActive}>{getTimeAgo(profile.lastUsed)}</Text>
                                </View>
                            </Animated.View>
                        </HapticTouchable>
                    ))}

                    {/* Add Account Button */}
                    <Animated.View entering={FadeIn.delay(300 + profiles.length * 100).duration(400)}>
                        <HapticTouchable onPress={handleAddAccount}>
                            <View style={styles.addAccountCard}>
                                <View style={styles.addAccountCircle}>
                                    <Plus size={32} color="#0469ff" strokeWidth={3} />
                                </View>
                                <Text style={styles.addAccountText}>Add Account</Text>
                            </View>
                        </HapticTouchable>
                    </Animated.View>
                </ScrollView>
            </Animated.View>

            {/* Logout All Button */}
            {profiles.length > 0 && (
                <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.footer}>
                    <HapticTouchable onPress={handleLogoutAll}>
                        <View style={styles.logoutButton}>
                            <LogOut size={20} color="#EF4444" />
                            <Text style={styles.logoutText}>Logout All Accounts</Text>
                        </View>
                    </HapticTouchable>
                </Animated.View>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#EFF6FF',
    },
    loadingText: {
        fontSize: 16,
        color: '#64748B',
        fontWeight: '500',
    },
    header: {
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 30,
        alignItems: 'center',
    },
    title: {
        fontSize: 32,
        fontWeight: '800',
        color: '#0F172A',
        marginBottom: 8,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 16,
        color: '#64748B',
        fontWeight: '500',
    },
    schoolName: {
        fontSize: 14,
        color: '#0469ff',
        fontWeight: '600',
        marginTop: 8,
    },
    scrollSection: {
        flex: 1,
        paddingTop: 20,
    },
    scrollContent: {
        paddingHorizontal: (width - width * 0.28) / 2,
        gap: 20,
        alignItems: 'center',
    },
    profileCard: {
        width: width * 0.28,
        alignItems: 'center',
    },
    avatarContainer: {
        width: PROFILE_SIZE,
        height: PROFILE_SIZE,
        borderRadius: PROFILE_SIZE / 2,
        borderWidth: 4,
        padding: 4,
        marginBottom: 12,
        position: 'relative',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: (PROFILE_SIZE - 8) / 2,
    },
    avatarPlaceholder: {
        width: '100%',
        height: '100%',
        borderRadius: (PROFILE_SIZE - 8) / 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 32,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    roleBadge: {
        position: 'absolute',
        bottom: -6,
        right: -6,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: '#FFFFFF',
    },
    roleBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.5,
    },
    profileName: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0F172A',
        marginBottom: 4,
        textAlign: 'center',
    },
    profileClass: {
        fontSize: 12,
        fontWeight: '500',
        color: '#64748B',
        marginBottom: 2,
        textAlign: 'center',
    },
    profileEmail: {
        fontSize: 11,
        color: '#94A3B8',
        marginBottom: 6,
        textAlign: 'center',
    },
    lastActive: {
        fontSize: 10,
        color: '#CBD5E1',
        fontWeight: '500',
        textAlign: 'center',
    },
    addAccountCard: {
        width: width * 0.28,
        alignItems: 'center',
    },
    addAccountCircle: {
        width: PROFILE_SIZE,
        height: PROFILE_SIZE,
        borderRadius: PROFILE_SIZE / 2,
        backgroundColor: '#FFFFFF',
        borderWidth: 3,
        borderStyle: 'dashed',
        borderColor: '#0469ff',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    addAccountText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#0469ff',
        textAlign: 'center',
    },
    footer: {
        paddingHorizontal: 24,
        paddingBottom: 20,
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 16,
        paddingHorizontal: 20,
        backgroundColor: '#FEE2E2',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FECACA',
    },
    logoutText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#EF4444',
    },
});
