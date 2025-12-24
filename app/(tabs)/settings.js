import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Alert, Modal, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import {
    User, Lock, LogOut, Bell, Clock, FileText, DollarSign,
    Calendar, Bus, BookOpen, Users, Palette, Globe, Info, Smartphone
} from 'lucide-react-native';
import { Image } from 'expo-image';
import * as Application from 'expo-application';
import HapticTouchable from '../components/HapticTouch';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '../../lib/supabase';
import { getCurrentSchool } from '../../lib/profileManager';

export default function SettingsScreen() {
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [darkMode, setDarkMode] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handlePress = (item) => {
        if (item.action === 'logout') {
            Alert.alert('Logout', 'Are you sure you want to logout?', [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        setIsLoggingOut(true);
                        // Simulate delay for better UX
                        setTimeout(async () => {
                            try {
                                // Clear user data
                                await SecureStore.deleteItemAsync('user');
                                await SecureStore.deleteItemAsync('userRole');
                                await SecureStore.deleteItemAsync('token');

                                // Get saved school data to redirect to profile-selector
                                const currentSchool = await getCurrentSchool();

                                if (currentSchool?.schoolCode && currentSchool?.schoolData) {
                                    // Redirect to profile-selector with school data
                                    router.replace({
                                        pathname: '/(auth)/profile-selector',
                                        params: {
                                            schoolCode: currentSchool.schoolCode,
                                            schoolData: JSON.stringify(currentSchool.schoolData),
                                        },
                                    });
                                } else {
                                    // Fallback to schoolcode if no saved school data
                                    router.replace('/(auth)/schoolcode');
                                }
                            } catch (error) {
                                console.log('Logout error:', error);
                                setIsLoggingOut(false);
                                Alert.alert('Error', 'Failed to logout. Please try again.');
                            }
                        }, 1500);
                    },
                },
            ]);
        } else if (item.route) {
            router.push(item.route);
        } else {
            Alert.alert(item.title, 'Feature coming soon!');
        }
    };

    const accountSettings = [
        { id: '1', title: 'Profile', icon: User, color: '#0469ff', route: '/(tabs)/profile' },
        { id: '2', title: 'Change Password', icon: Lock, color: '#8b5cf6' },
        { id: '3', title: 'Logout', icon: LogOut, color: '#ff4444', action: 'logout' },
    ];

    const schoolSettings = [
        { id: '4', title: 'Attendance Settings', icon: Clock, color: '#10b981' },
        { id: '5', title: 'Exam & Grading', icon: FileText, color: '#f59e0b' },
        { id: '6', title: 'Fee Management', icon: DollarSign, color: '#06b6d4' },
        { id: '7', title: 'Timetable', icon: Calendar, color: '#ec4899' },
        { id: '8', title: 'Transport & GPS', icon: Bus, color: '#8b5cf6' },
        { id: '9', title: 'Library Access', icon: BookOpen, color: '#10b981' },
        { id: '10', title: 'Parent Portal', icon: Users, color: '#f59e0b' },
    ];

    return (
        <View style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInUp.duration(600)} style={styles.header}>
                <Text style={styles.headerTitle}>Settings</Text>
                <Text style={styles.headerSubtitle}>Manage your preferences</Text>
            </Animated.View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Account Section */}
                <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
                    <Text style={styles.sectionTitle}>Account</Text>
                    <View style={styles.card}>
                        {accountSettings.map((item, index) => (
                            <View key={item.id}>
                                <HapticTouchable onPress={() => handlePress(item)}>
                                    <View style={styles.settingItem}>
                                        <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
                                            <item.icon size={20} color={item.color} />
                                        </View>
                                        <Text style={[
                                            styles.settingText,
                                            item.action === 'logout' && { color: '#ff4444' }
                                        ]}>
                                            {item.title}
                                        </Text>
                                        <View style={styles.arrow}>
                                            <Text style={styles.arrowText}>›</Text>
                                        </View>
                                    </View>
                                </HapticTouchable>
                                {index < accountSettings.length - 1 && <View style={styles.divider} />}
                            </View>
                        ))}
                    </View>
                </Animated.View>

                {/* School Section */}
                <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.section}>
                    <Text style={styles.sectionTitle}>School Management</Text>
                    <View style={styles.card}>
                        {schoolSettings.map((item, index) => (
                            <View key={item.id}>
                                <HapticTouchable onPress={() => handlePress(item)}>
                                    <View style={styles.settingItem}>
                                        <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
                                            <item.icon size={20} color={item.color} />
                                        </View>
                                        <Text style={styles.settingText}>{item.title}</Text>
                                        <View style={styles.arrow}>
                                            <Text style={styles.arrowText}>›</Text>
                                        </View>
                                    </View>
                                </HapticTouchable>
                                {index < schoolSettings.length - 1 && <View style={styles.divider} />}
                            </View>
                        ))}
                    </View>
                </Animated.View>

                {/* App Preferences */}
                <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.section}>
                    <Text style={styles.sectionTitle}>App Preferences</Text>
                    <View style={styles.card}>
                        <View style={styles.settingItem}>
                            <View style={[styles.iconContainer, { backgroundColor: '#0469ff15' }]}>
                                <Bell size={20} color="#0469ff" />
                            </View>
                            <Text style={styles.settingText}>Notifications</Text>
                            <Switch
                                value={notificationsEnabled}
                                onValueChange={setNotificationsEnabled}
                                trackColor={{ false: '#e5e7eb', true: '#0469ff' }}
                                thumbColor="#fff"
                            />
                        </View>
                        <View style={styles.divider} />

                        {/* <View style={styles.settingItem}>
                            <View style={[styles.iconContainer, { backgroundColor: '#8b5cf615' }]}>
                                <Palette size={20} color="#8b5cf6" />
                            </View>
                            <Text style={styles.settingText}>Dark Mode</Text>
                            <Switch
                                value={darkMode}
                                onValueChange={setDarkMode}
                                trackColor={{ false: '#e5e7eb', true: '#8b5cf6' }}
                                thumbColor="#fff"
                            />
                        </View> */}
                        <View style={styles.divider} />

                        <HapticTouchable onPress={() => Alert.alert('Language', 'Feature coming soon!')}>
                            <View style={styles.settingItem}>
                                <View style={[styles.iconContainer, { backgroundColor: '#10b98115' }]}>
                                    <Globe size={20} color="#10b981" />
                                </View>
                                <Text style={styles.settingText}>Language</Text>
                                <View style={styles.valueContainer}>
                                    <Text style={styles.valueText}>English</Text>
                                    <View style={styles.arrow}>
                                        <Text style={styles.arrowText}>›</Text>
                                    </View>
                                </View>
                            </View>
                        </HapticTouchable>
                    </View>
                </Animated.View>

                {/* About Section */}
                <Animated.View entering={FadeInDown.delay(400).duration(600)} style={styles.section}>
                    <Text style={styles.sectionTitle}>About</Text>
                    <View style={styles.card}>
                        <View style={styles.settingItem}>
                            <View style={[styles.iconContainer, { backgroundColor: '#06b6d415' }]}>
                                <Smartphone size={20} color="#06b6d4" />
                            </View>
                            <Text style={styles.settingText}>App Version</Text>
                            <Text style={styles.valueText}>
                                {Application.nativeApplicationVersion || '1.0.0'}
                            </Text>
                        </View>
                        <View style={styles.divider} />

                        <View style={styles.settingItem}>
                            <View style={[styles.iconContainer, { backgroundColor: '#f59e0b15' }]}>
                                <Info size={20} color="#f59e0b" />
                            </View>
                            <Text style={styles.settingText}>Powered By</Text>
                            <View style={styles.poweredContainer}>
                                <Image
                                    source={require('../../assets/kinzix.png')}
                                    style={styles.logo}
                                    contentFit="contain"
                                />
                            </View>
                        </View>
                    </View>
                </Animated.View>

                {/* Footer Space */}
                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Logout Modal */}
            <Modal
                visible={isLoggingOut}
                transparent={true}
                animationType="fade"
            >
                <View style={styles.logoutModalOverlay}>
                    <View style={styles.logoutContent}>
                        <ActivityIndicator size="large" color="#ffffff" />
                        <Text style={styles.logoutText}>Logging Out...</Text>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,

        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '700',
        color: '#111',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 15,
        color: '#666',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#999',
        marginBottom: 12,
        marginLeft: 4,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    card: {
        backgroundColor: '#f9fafb',
        borderRadius: 16,
        overflow: 'hidden',
    },
    settingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    settingText: {
        flex: 1,
        fontSize: 16,
        fontWeight: '500',
        color: '#111',
    },
    arrow: {
        width: 24,
        height: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowText: {
        fontSize: 24,
        color: '#999',
        fontWeight: '300',
    },
    valueContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    valueText: {
        fontSize: 15,
        color: '#666',
        fontWeight: '500',
    },
    divider: {
        height: 1,
        backgroundColor: '#e5e7eb',
        marginLeft: 68,
    },
    poweredContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    logo: {
        width: 60,
        height: 60,
    },
    // Logout Modal Styles
    logoutModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    logoutContent: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
    },
    logoutText: {
        color: '#ffffff',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 12,
    },
});