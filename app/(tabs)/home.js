import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Dimensions, RefreshControl, Alert, AppState, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link, router, useFocusEffect } from 'expo-router';
import {
    Users, User, UserCheck, DollarSign, Wallet, BookOpen, ClipboardList, Bus,
    ChevronLeft, ChevronRight, GraduationCap, BookMarked, ClipboardCheck,
    Calendar, Bell, X, CheckCircle, AlertCircle, Building, MapPin,
    RefreshCcw,
    Settings,
    CheckCircle2,
    TrendingUp,
    ScrollText,
    Book,
    FileText,
    Award,
    TimerIcon,
    Plus,
    ArrowRight,
    PartyPopperIcon,
    ChartPie,
    Clock,
    CalendarDays,
    Umbrella,
    BellOff,
    Play,
    AlertTriangle
} from 'lucide-react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import HapticTouchable from '../components/HapticTouch';
import { useEffect, useMemo, useState, useCallback, useRef, memo } from 'react';
import Animated, { FadeInDown, FadeInRight, FadeInUp, useSharedValue, useAnimatedScrollHandler, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { dataUi } from '../data/_uidata';

import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { updateProfileSession } from '../../lib/profileManager';
import GlowingStatusBar from '../components/GlowingStatusBar';
import AddChildModal from '../components/AddChildModal';
import DelegationCheckModal from '../components/DelegationCheckModal';
import BannerCarousel from '../components/BannerCarousel';
import { useActiveTrip } from '../../hooks/useActiveTrip';
import { stopBackgroundLocationTask, isBackgroundTaskRunning } from '../../lib/transport-location-task';
import ProfileAvatar from '../components/ProfileAvatar';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isSmallDevice = SCREEN_WIDTH < 375;
const isShortDevice = SCREEN_HEIGHT < 700;

// Dynamic refresh offset calculation - accounts for safe area and header height
const getRefreshOffset = (insetTop, headerHeight) => {
    // Base offset = header height + safe area top + extra buffer
    // On larger devices, we need more offset
    const baseOffset = headerHeight + (insetTop || 0);
    const extraBuffer = SCREEN_HEIGHT > 800 ? 60 : 40;
    return baseOffset + extraBuffer;
};


// Icon mapping
const IconMap = {
    refresh: RefreshCcw,
    bell: Bell,
    settings: Settings,
};



// ============================================
// CENTRALIZED QUERY KEYS
// ============================================
const QUERY_KEYS = {
    notifications: (userId) => ['notifications', userId],
    parentChildren: (schoolId, parentId) => ['parent-children', schoolId, parentId],
    todaysClasses: (userId, schoolId) => ['todaysClasses', userId, schoolId],
    subjects: (userId, schoolId) => ['subjects', userId, schoolId],
    upcomingExam: (userId, schoolId) => ['upcomingExam', userId, schoolId],
    dashboardOverview: (schoolId, academicYearId) => ['dashboard', 'overview', schoolId, academicYearId],
};

// ============================================
// CENTRALIZED CACHE CONFIGURATION
// Prevents screen reload on back navigation
// ============================================
const CACHE_CONFIG = {
    // Static data (events, profile, syllabus) - long cache
    STATIC: {
        staleTime: 1000 * 60 * 10, // 10 min
        gcTime: 1000 * 60 * 60, // 1 hour
        refetchOnMount: false,
        refetchOnWindowFocus: false, // No auto-refresh
    },
    // Semi-dynamic data (stats, homework, attendance)
    MODERATE: {
        staleTime: 1000 * 60 * 5, // 5 min
        gcTime: 1000 * 60 * 30, // 30 min
        refetchOnMount: false,
        refetchOnWindowFocus: false, // No auto-refresh
    },
    // Real-time data (notifications) - no auto polling
    REALTIME: {
        staleTime: 1000 * 60 * 2, // 2 min
        gcTime: 1000 * 60 * 30,
        refetchOnMount: false,
        refetchOnWindowFocus: false, // No auto-refresh
        // Removed refetchInterval - user must manually refresh
    },
};

export default function HomeScreen() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [notificationPermission, setNotificationPermission] = useState(false);



    // Active trip management
    const { activeTrip, resumeTrip } = useActiveTrip();

    // Navigation guard to prevent double-clicking
    const isNavigatingRef = useRef(false);

    // Track if initial load has happened - prevents refetch on back navigation
    const hasInitiallyLoadedRef = useRef(false);

    // Only load user data on FIRST focus - prevents rerenders on tab switch
    useFocusEffect(
        useCallback(() => {
            if (!hasInitiallyLoadedRef.current) {
                loadUser();
            }
        }, [])
    );

    // Safe navigation function - prevents multiple navigations
    const navigateOnce = useCallback((path, params) => {
        if (isNavigatingRef.current) return; // Already navigating, ignore
        isNavigatingRef.current = true;

        if (params) {
            router.push({ pathname: path, params });
        } else {
            router.push(path);
        }

        // Reset after a short delay (allows navigation to complete)
        setTimeout(() => {
            isNavigatingRef.current = false;
        }, 500);
    }, []);

    // Collapsible Header Logic (Must be top level to avoid rules of hooks error)
    const HEADER_MAX_HEIGHT = 160;
    const HEADER_MIN_HEIGHT = isSmallDevice ? 90 : 120; // Increased slightly to prevent crushing
    const scrollY = useSharedValue(0);

    // Safe area insets for dynamic refresh offset
    const insets = useSafeAreaInsets();
    const refreshOffset = getRefreshOffset(insets.top, HEADER_MAX_HEIGHT);

    const scrollHandler = useAnimatedScrollHandler((event) => {
        scrollY.value = event.contentOffset.y;
    });

    const headerAnimatedStyle = useAnimatedStyle(() => {
        const height = interpolate(
            scrollY.value,
            [0, 100],
            [HEADER_MAX_HEIGHT, HEADER_MIN_HEIGHT],
            Extrapolation.CLAMP
        );
        return { height };
    });

    const headerContentOpacity = useAnimatedStyle(() => {
        const opacity = interpolate(
            scrollY.value,
            [0, 60],
            [1, 0],
            Extrapolation.CLAMP
        );
        return { opacity, transform: [{ translateY: interpolate(scrollY.value, [0, 60], [0, -20], Extrapolation.CLAMP) }] };
    });

    // Name stays visible when collapsed (doesn't fade out)
    // Also shifts left slightly when collapsed
    const headerNameStyle = useAnimatedStyle(() => {
        const translateY = interpolate(
            scrollY.value,
            [0, 100],
            [0, -8],
            Extrapolation.CLAMP
        );
        const translateX = interpolate(
            scrollY.value,
            [0, 100],
            [0, -10], // Negative = move left, positive = move right
            Extrapolation.CLAMP
        );
        return { transform: [{ translateY }, { translateX }] };
    });

    const headerIconsTranslate = useAnimatedStyle(() => {
        const translateY = interpolate(
            scrollY.value,
            [0, 100],
            [0, 0], // Kept at 0 to prevent misalignment in collapsed state
            Extrapolation.CLAMP
        );
        return { transform: [{ translateY }] };
    });

    // Avatar size animation - bigger when expanded, smaller when collapsed
    const AVATAR_MAX_SIZE = 56;
    const AVATAR_MIN_SIZE = 40;
    const avatarAnimatedStyle = useAnimatedStyle(() => {
        const size = interpolate(
            scrollY.value,
            [0, 100],
            [AVATAR_MAX_SIZE, AVATAR_MIN_SIZE],
            Extrapolation.CLAMP
        );
        const borderRadius = size / 2;
        return {
            width: size,
            height: size,
            borderRadius
        };
    });
    const [showPermissionBanner, setShowPermissionBanner] = useState(false);

    function getGreeting() {
        // Reliable way to get IST hour
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const ist = new Date(utc + (3600000 * 5.5)); // IST is UTC + 5.30
        const hour = ist.getHours();

        if (hour >= 5 && hour < 12) {
            return "Good Morning";
        } else if (hour >= 12 && hour < 17) {
            return "Good Afternoon";
        } else if (hour >= 17 && hour < 21) {
            return "Good Evening";
        } else {
            return "Good Night";
        }
    }

    const queryClient = useQueryClient();
    const uiData = dataUi;
    const user_acc = useMemo(() => user, [user]);
    const userId = user_acc?.id;
    const schoolId = user_acc?.schoolId || user_acc?.school?.id;

    console.log('🏫 Home Screen - User:', userId, 'SchoolId:', schoolId, 'Role:', user_acc?.role?.name, user_acc);

    // Check notification permission status
    const checkNotificationPermission = useCallback(async () => {
        try {
            const { status } = await Notifications.getPermissionsAsync();
            setNotificationPermission(status);
            // Show banner if not granted and not explicitly denied
            if (status !== 'granted') {
                // Check if user has dismissed the banner before
                const dismissed = await SecureStore.getItemAsync('notificationBannerDismissed');
                if (!dismissed) {
                    setShowPermissionBanner(true);
                }
            } else {
                setShowPermissionBanner(false);
            }
        } catch (error) {
            console.error('Error checking notification permission:', error);
        }
    }, []);

    // Request notification permission
    const requestNotificationPermission = useCallback(async () => {
        try {
            const { status } = await Notifications.requestPermissionsAsync();
            setNotificationPermission(status);
            if (status === 'granted') {
                setShowPermissionBanner(false);
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
        }
    }, []);

    // Dismiss notification banner
    const dismissPermissionBanner = useCallback(async () => {
        setShowPermissionBanner(false);
        await SecureStore.setItemAsync('notificationBannerDismissed', 'true');
    }, []);

    // Fetch notifications with unread count
    const { data: notificationData, refetch: refetchNotifications } = useQuery({
        queryKey: ['notifications', userId, schoolId],
        queryFn: async () => {
            const res = await api.get(
                `/notifications?userId=${userId}&schoolId=${schoolId}&limit=20`
            );
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        ...CACHE_CONFIG.REALTIME,
    });

    // Filter out self-sent notifications and calculate unread count
    const filterSentByMe = (notifications) => {
        if (!notifications || !userId) return notifications || [];
        return notifications.filter(n => n.sender?.id !== userId);
    };

    // Calculate filtered unread count (exclude notifications sent by current user)
    const unreadCount = useMemo(() => {
        if (!notificationData?.notifications) return 0;
        const allFiltered = [
            ...filterSentByMe(notificationData.notifications.today || []),
            ...filterSentByMe(notificationData.notifications.yesterday || []),
            ...filterSentByMe(notificationData.notifications.earlier || []),
        ];
        return allFiltered.filter(n => !n.isRead).length;
    }, [notificationData, userId]);

    useEffect(() => {
        // Skip if already loaded - prevents refetch on back navigation
        if (hasInitiallyLoadedRef.current && user) {
            setLoading(false);
            return;
        }
        loadUser();
        checkNotificationPermission();
        // router.replace('/(screens)/wish')
    }, [checkNotificationPermission]);

    // Listen for auth changes to keep stored profile session fresh
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if ((event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') && session) {
                try {
                    const storedUser = await SecureStore.getItemAsync('user');
                    if (storedUser) {
                        const userData = JSON.parse(storedUser);
                        const schoolCode = userData.school?.schoolCode || userData.school?.schoolcode;
                        const userId = userData.id || userData.userId;

                        if (schoolCode && userId) {
                            await updateProfileSession(schoolCode, userId, session);
                        }
                    }
                } catch (err) {
                    // console.error('Auth listener error:', err);
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const loadUser = async (forceRefresh = false) => {
        // Skip if already loaded and not forcing refresh
        if (hasInitiallyLoadedRef.current && user && !forceRefresh) {
            setLoading(false);
            return;
        }

        try {
            const stored = await SecureStore.getItemAsync('user');
            if (stored) {
                const parsed = JSON.parse(stored);
                setUser(parsed);
                hasInitiallyLoadedRef.current = true; // Mark as loaded
            }
        } catch (error) {
            console.error('Failed to load user:', error);
        } finally {
            setLoading(false);
        }
    };
    const { data: teacher, isLoading } = useQuery({
        queryKey: ["teacher-profile", userId, schoolId],
        queryFn: async () => {
            const res = await api.get(
                `/schools/${schoolId}/teachers/${userId}/get?detail=true`
            );
            return res.data.teacher;
        },
        enabled: user_acc?.role?.name === "TEACHING_STAFF" && !!schoolId && !!userId,
        ...CACHE_CONFIG.STATIC,
    });

    // Pre-fetch transport staff data for Driver/Conductor roles
    const isTransportRole = user_acc?.role?.name === 'DRIVER' || user_acc?.role?.name === 'CONDUCTOR';

    const { data: transportStaffData, isLoading: isTransportStaffLoading } = useQuery({
        queryKey: ['transport-staff-home', schoolId, userId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/staff?schoolId=${schoolId}&userId=${userId}`);
            return res.data;
        },
        enabled: isTransportRole && !!schoolId && !!userId,
        ...CACHE_CONFIG.MODERATE,
    });

    const transportStaff = transportStaffData?.staff?.[0];
    const transportStaffId = transportStaff?.id;

    // Pre-fetch trips for Driver/Conductor
    const { data: transportTripsData, isLoading: isTransportTripsLoading } = useQuery({
        queryKey: ['transport-trips-home', schoolId, transportStaffId],
        queryFn: async () => {
            const today = new Date().toISOString().split('T')[0];
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const startDate = weekAgo.toISOString().split('T')[0];

            const isDriver = user_acc?.role?.name === 'DRIVER';
            const paramKey = isDriver ? 'driverId' : 'conductorId';

            const res = await api.get(`/schools/transport/trips?schoolId=${schoolId}&${paramKey}=${transportStaffId}&startDate=${startDate}&endDate=${today}`);
            return res.data;
        },
        enabled: isTransportRole && !!schoolId && !!transportStaffId,
        ...CACHE_CONFIG.MODERATE,
    });

    // Check if transport data is still loading
    const isTransportDataLoading = isTransportRole && (isTransportStaffLoading || (transportStaffId && isTransportTripsLoading));

    const { data: upcomingEventsData, isLoading: eventsLoading } = useQuery({
        queryKey: ['upcomingEvents', schoolId],
        queryFn: async () => {
            if (!schoolId) return { events: [], total: 0 };
            const res = await api.get(`/schools/${schoolId}/calendar/upcoming?limit=5`);
            return res.data;
        },
        enabled: !!schoolId,
        ...CACHE_CONFIG.STATIC,
    });
    // Helper function to get category icon
    const getCategoryIcon = (category, eventType) => {
        const icons = {
            'MEETING': '👥',
            'SPORTS': '⚽',
            'ACADEMIC': '📚',
            'CULTURAL': '🎭',
            'EXAM': '📝',
            'HOLIDAY': '🎉',
            'OTHER': '📅',
            'CUSTOM': '✨'
        };
        return icons[category] || icons[eventType] || '📅';
    };
    // Helper function to format date
    const formatEventDate = (startDate, endDate, isAllDay) => {
        const start = new Date(startDate);
        const end = new Date(endDate);

        const options = { month: 'short', day: 'numeric', year: 'numeric' };

        if (start.toDateString() === end.toDateString()) {
            return start.toLocaleDateString('en-US', options);
        }

        return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', options)}`;
    };

    // Helper function to check if event is today
    const isEventToday = (startDate) => {
        const today = new Date();
        const eventDate = new Date(startDate);
        return today.toDateString() === eventDate.toDateString();
    };
    // Process events data
    const upcomingEvents = useMemo(() => {
        if (!upcomingEventsData?.events) return [];

        return upcomingEventsData.events.map(event => ({
            id: event.id,
            title: event.title,
            date: formatEventDate(event.startDate, event.endDate, event.isAllDay),
            icon: getCategoryIcon(event.category, event.eventType),
            color: event.color || '#0469ff',
            location: event.location,
            isToday: isEventToday(event.startDate),
            rawStartDate: event.startDate,
        }));
    }, [upcomingEventsData]);

    // Filter today's events
    const todaysEvents = useMemo(() =>
        upcomingEvents.filter(event => event.isToday),
        [upcomingEvents]
    );



    // const unreadCount = notificationData?.unreadCount || uiData.notifications.today.filter(n => !n.read).length;

    // Pull to refresh handler - forces data reload
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await queryClient.invalidateQueries();
            await loadUser(true); // Force refresh
        } catch (error) {
            console.error('Refresh failed:', error);
        } finally {
            setRefreshing(false);
        }
    }, [queryClient]);

    const getInitials = useCallback((name) => {
        if (!name) return '';
        const parts = name.trim().split(' ');
        if (parts.length === 1) return parts[0][0];
        if (parts.length === 2) return parts[0][0] + parts[1][0];
        return parts[0][0] + parts[parts.length - 1][0];
    }, []);

    const getSchoolName = useCallback((name) => {
        if (!name) return '';
        const max = isSmallDevice ? 12 : 20;
        return name.length > max ? name.slice(0, max).toUpperCase() + '...' : name.toUpperCase();
    }, []);

    // Show unified loader for transport roles until all data is ready
    if (loading || isTransportDataLoading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
                {isTransportDataLoading && (
                    <Text style={{ marginTop: 12, color: '#666', fontSize: 14 }}>Loading your dashboard...</Text>
                )}
            </View>
        );
    }

    if (!user_acc) {
        return (
            <View style={styles.loaderContainer}>
                <Text style={{ fontSize: 16, color: '#666' }}>No user found</Text>
            </View>
        );
    }

    // Dynamic replace function
    const replaceDynamic = (str, role) => {
        if (!str) return '';

        const placeholders = {
            student: {
                '{name}': user_acc?.studentdatafull?.name || user_acc?.studentData?.name || user_acc?.name || 'Student',
                '{role.name}': user_acc?.role?.name || '',
                '{school.name}': user_acc?.school?.name || '',
                '{department}': user_acc?.department || '',
                '{child.class}': user_acc?.class?.className || user_acc?.classs?.className || '',
                '{child.section}': user_acc?.section?.name || '',
                '{admissionNo}': user_acc?.studentdatafull?.admissionNo || user_acc?.studentData?.admissionNo || '',
                '{classSection}': `Class ${user_acc?.class?.className || user_acc?.classs?.className || ''}${user_acc?.section?.name ? ' - ' + user_acc.section.name : ''}`,
            },
            teaching_staff: {
                '{name}': user_acc?.name || '',
                '{class}': (teacher?.sectionsAssigned?.[0]?.class?.className && teacher?.sectionsAssigned?.[0]?.name)
                    ? `${teacher.sectionsAssigned[0].class.className}'${teacher.sectionsAssigned[0].name}`
                    : '',
            },
            parent: {
                '{name}': user_acc?.parentData?.name || user_acc?.name || '',
                '{role.name}': user_acc?.role?.name || '',
                '{child.name}': user_acc?.studentdatafull?.name || '',
                '{emailparent}': user_acc?.parentData?.email || user_acc?.email || '',
                '{child.class}': user_acc?.classs?.className || 'N/A',
                '{child.section}': user_acc?.section?.name || 'N/A',
                '{school.name}': user_acc?.school?.name || '',
            },
            admin: {
                '{name}': user_acc?.name || '',
                '{role.name}': user_acc?.role?.name || '',
                '{school.name}': user_acc?.school?.name || '',
            },
            driver: {
                '{name}': user_acc?.name || 'Driver',
                '{role.name}': user_acc?.role?.name || 'Transport Staff',
                '{school.name}': user_acc?.school?.name || '',
            },
            conductor: {
                '{name}': user_acc?.name || 'Conductor',
                '{role.name}': user_acc?.role?.name || 'Transport Staff',
                '{school.name}': user_acc?.school?.name || '',
            },
            director: {
                '{name}': user_acc?.name || 'Director',
                '{role.name}': user_acc?.role?.name || 'Director',
                '{school.name}': user_acc?.school?.name || '',
            },
            principal: {
                '{name}': user_acc?.name || 'Principal',
                '{role.name}': user_acc?.role?.name || 'Principal',
                '{school.name}': user_acc?.school?.name || '',
            },
        };

        const map = placeholders[role.toLowerCase()] || {};
        return Object.entries(map).reduce(
            (acc, [key, value]) => acc.replace(new RegExp(key, 'g'), value),
            str
        );
    };

    // === DYNAMIC HEADER ===
    const Header = memo(() => {
        const roleKey = user_acc?.role?.name?.toLowerCase() ?? '';
        const config = uiData.header[roleKey] || uiData.header.student;
        const title = replaceDynamic(config.title, roleKey);
        const subtitle = config.subtitle.map((item, i) => {
            const text = replaceDynamic(item.text, roleKey);
            const baseStyle =
                item.type === 'role' ? styles.role :
                    item.type === 'separator' ? styles.separator :
                        item.type === 'school' ? styles.school :
                            item.type === 'department' ? styles.school :
                                item.type === 'childClass' ? styles.school :
                                    item.type === 'static' ? styles.role : styles.role;

            // Override color for white background
            return <Text key={i} style={[baseStyle, { color: 'rgba(255,255,255,0.9)' }]} numberOfLines={1}>{text}</Text>;
        });

        const icons = config.icons.map((key, i) => {
            const Icon = IconMap[key];
            if (!Icon) return null;

            const isBell = key === 'bell';
            const isRefresh = key === 'refresh';

            return (
                <HapticTouchable
                    key={i}
                    onPress={
                        isBell ? () => router.push('(screens)/notification') :
                            isRefresh ? onRefresh :
                                undefined
                    }
                >
                    <View style={[styles.iconButton, {
                        backgroundColor: '#fff',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.1,
                        shadowRadius: 4,
                        elevation: 3
                    }]}>
                        <Icon size={isSmallDevice ? 18 : 20} color="#0469ff" />

                        {isBell && unreadCount > 0 && (
                            <View style={[styles.badge, { backgroundColor: '#FF6B6B', borderWidth: 2, borderColor: '#fff' }]}>
                                <Text style={[styles.badgeText, { color: '#fff', fontSize: 10 }]}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </Text>
                            </View>
                        )}
                    </View>
                </HapticTouchable>
            );
        });
        return (
            <LinearGradient
                colors={['#0469ff', '#0256d0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.header, {
                    width: '100%',
                    borderBottomWidth: 0,
                    paddingBottom: 30,
                    marginBottom: 16,
                    // Ensure content starts below status bar transparently
                    paddingTop: (isSmallDevice ? 40 : 50),
                    borderBottomLeftRadius: 32,
                    borderBottomRightRadius: 32,
                    alignSelf: 'stretch',
                }]}
            >
                {/* Background Pattern - Shaded Look */}
                <Text style={{ position: 'absolute', top: -10, right: 80, fontSize: 40, color: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}>+</Text>
                <Text style={{ position: 'absolute', top: 50, right: 30, fontSize: 24, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>×</Text>
                <Text style={{ position: 'absolute', bottom: 20, right: 100, fontSize: 32, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>÷</Text>
                <Text style={{ position: 'absolute', top: 20, left: '25%', fontSize: 22, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>△</Text>
                <Text style={{ position: 'absolute', bottom: 15, left: '60%', fontSize: 28, color: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}>○</Text>
                <View style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)' }} />
                <View style={{ position: 'absolute', bottom: -60, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.05)' }} />

                <View style={styles.headerLeft}>
                    <ProfileAvatar
                        user={user_acc}
                        onPress={() => navigateOnce('(tabs)/profile')}
                    />
                    <View style={styles.headerInfo}>
                        <Text style={[styles.welcomeText, { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' }]}>{getGreeting()},</Text>
                        <Text style={[styles.name, { color: '#fff', fontSize: 18, marginTop: 2 }]} numberOfLines={1}>{title}</Text>
                        <View style={[styles.parentEmail, { marginTop: 4 }]}>{subtitle}</View>
                    </View>
                </View>
                <View style={styles.iconRow}>{icons}</View>
            </LinearGradient>
        );
    });
    // === ROLE-BASED CONTENT ===
    const headerComponent = <Header />;

    const permissionBanner = showPermissionBanner ? (
        <Animated.View entering={FadeInDown.duration(400)} style={styles.permissionBanner}>
            <View style={styles.permissionBannerContent}>
                <View style={styles.permissionIconContainer}>
                    <BellOff size={24} color="#F59E0B" />
                </View>
                <View style={styles.permissionTextContainer}>
                    <Text style={styles.permissionTitle}>Enable Notifications</Text>
                    <Text style={styles.permissionDesc}>
                        Get instant updates about your {user_acc?.role?.name === 'PARENT' ? "child's" : ''} attendance, fees, and important announcements.
                    </Text>
                </View>
            </View>
            <View style={styles.permissionActions}>
                <HapticTouchable onPress={dismissPermissionBanner} style={styles.permissionDismiss}>
                    <Text style={styles.permissionDismissText}>Not now</Text>
                </HapticTouchable>
                <HapticTouchable onPress={requestNotificationPermission} style={styles.permissionAllow}>
                    <Text style={styles.permissionAllowText}>Enable</Text>
                </HapticTouchable>
            </View>
        </Animated.View>
    ) : null;

    const renderContent = () => {
        const role = user_acc?.role?.name ? user_acc.role.name.toLowerCase() : '';
        const paddingTop = HEADER_MAX_HEIGHT + 20;

        switch (role) {
            case 'student':
                return <StudentView refreshing={refreshing} onRefresh={onRefresh} banner={permissionBanner} paddingTop={paddingTop} refreshOffset={refreshOffset} navigateOnce={navigateOnce} />;
            case 'teaching_staff':
                return <TeacherView refreshing={refreshing} schoolId={schoolId} userId={userId} teacher={teacher} onRefresh={onRefresh} upcomingEvents={upcomingEvents} todaysEvents={todaysEvents} banner={permissionBanner} paddingTop={paddingTop} refreshOffset={refreshOffset} onScroll={scrollHandler} navigateOnce={navigateOnce} />;
            case 'admin':
                return <AdminView refreshing={refreshing} onRefresh={onRefresh} banner={permissionBanner} paddingTop={paddingTop} refreshOffset={refreshOffset} navigateOnce={navigateOnce} />;
            case 'parent':
                return <ParentView
                    schoolId={user_acc?.schoolId}
                    parentId={user_acc?.parentData.id}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    onScroll={scrollHandler}
                    paddingTop={paddingTop}
                    refreshOffset={refreshOffset}
                    banner={permissionBanner}
                    navigateOnce={navigateOnce}
                />;
            case 'driver':
                return <DriverView
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    onScroll={scrollHandler}
                    paddingTop={paddingTop}
                    refreshOffset={refreshOffset}
                    schoolId={schoolId}
                    userId={userId}
                    prefetchedStaffData={transportStaff}
                    prefetchedTripsData={transportTripsData}
                    navigateOnce={navigateOnce}
                    upcomingEvents={upcomingEvents}
                    user_acc={user_acc}
                    user={user_acc}  /* Pass as user too for consistency */
                />;
            case 'conductor':
                return <ConductorView
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    onScroll={scrollHandler}
                    paddingTop={paddingTop}
                    refreshOffset={refreshOffset}
                    schoolId={schoolId}
                    userId={userId}
                    prefetchedStaffData={transportStaff}
                    prefetchedTripsData={transportTripsData}
                    navigateOnce={navigateOnce}
                    upcomingEvents={upcomingEvents}
                    user_acc={user_acc}
                    user={user_acc}
                />;
            case 'director':
                return <DirectorView
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    schoolId={schoolId}
                    userId={userId}
                    header={headerComponent}
                    refreshOffset={refreshOffset}
                    navigateOnce={navigateOnce}
                />;
            case 'principal':
                return <PrincipalView
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    schoolId={schoolId}
                    userId={userId}
                    header={headerComponent}
                    refreshOffset={refreshOffset}
                    navigateOnce={navigateOnce}
                />;
            default:
                return <StudentView refreshing={refreshing} onRefresh={onRefresh} header={headerComponent} refreshOffset={refreshOffset} navigateOnce={navigateOnce} />;
        }
    };

    // persistent active trip banner - only show for non-driver roles (drivers have their own indicator)
    const isDriverRole = user_acc?.role?.name === 'DRIVER' || user_acc?.role?.name === 'CONDUCTOR';
    const activeTripBanner = activeTrip && !isDriverRole ? (
        <Animated.View entering={FadeInUp.duration(500)} style={styles.activeTripFloatingBanner}>
            <HapticTouchable onPress={resumeTrip} style={styles.activeTripContent}>
                <View style={styles.activeTripIcon}>
                    <View style={styles.pulseDot} />
                    <Bus size={24} color="#fff" />
                </View>
                <View style={styles.activeTripInfo}>
                    <Text style={styles.activeTripTitle}>Trip in Progress</Text>
                    <Text style={styles.activeTripSubtitle}>{activeTrip.routeName || 'Tap to resume tracking'}</Text>
                </View>
                <View style={styles.activeTripArrow}>
                    <ChevronRight size={20} color="#fff" />
                </View>
            </HapticTouchable>
        </Animated.View>
    ) : null;

    // === STUDENT VIEW ===
    const StudentView = ({ refreshing, onRefresh, banner, paddingTop, refreshOffset, navigateOnce }) => {
        // Fetch notices for student
        const { data: recentNotices } = useQuery({
            queryKey: ['student-notices', schoolId, userId],
            queryFn: async () => {
                if (!schoolId || !userId) return { notices: [] };
                const res = await api.get(`/notices/${schoolId}?userId=${userId}&limit=4&page=1`);
                return res.data;
            },
            enabled: !!schoolId && !!userId,
            ...CACHE_CONFIG.MODERATE,
        });

        // Fetch student stats (attendance + exams + homework)
        const { data: studentStats } = useQuery({
            queryKey: ['student-home-stats', schoolId, userId],
            queryFn: async () => {
                if (!schoolId || !userId) return null;
                const now = new Date();
                const month = now.getMonth() + 1;
                const year = now.getFullYear();

                const [attendanceRes, examsRes, homeworkRes] = await Promise.all([
                    api.get(`/schools/${schoolId}/attendance/stats?userId=${userId}&month=${month}&year=${year}`).catch(() => ({ data: null })),
                    api.get(`/schools/${schoolId}/examination/student-results?studentId=${userId}`).catch(() => ({ data: null })),
                    api.get(`/homework/user/${userId}`).catch(() => ({ data: [] }))
                ]);

                return {
                    attendance: attendanceRes.data,
                    exams: examsRes.data,
                    homework: homeworkRes.data
                };
            },
            enabled: !!schoolId && !!userId,
            ...CACHE_CONFIG.MODERATE,
        });

        // Helper function to get grade label
        const getGradeLabel = (percentage) => {
            if (percentage >= 90) return 'A+';
            if (percentage >= 80) return 'A';
            if (percentage >= 70) return 'B+';
            if (percentage >= 60) return 'B';
            if (percentage >= 50) return 'C';
            if (percentage >= 40) return 'D';
            return 'F';
        };
        // Extract stats
        const monthlyStats = studentStats?.attendance?.monthlyStats || {};
        const attendancePercentage = monthlyStats.attendancePercentage || 0;
        const totalAbsent = monthlyStats.totalAbsent || 0;
        const totalWorkingDays = monthlyStats.totalWorkingDays || 0;

        const avgExamPercentage = studentStats?.exams?.stats?.avgPercentage || 0;
        const totalExams = studentStats?.exams?.stats?.totalExams || 0;
        const recentExamResults = studentStats?.exams?.results || [];

        // Count pending homework
        const allHomework = studentStats?.homework || [];
        const completedHomework = allHomework.filter(hw => hw.status === 'completed' || hw.status === 'submitted').length;
        const totalHomework = allHomework.length;
        const pendingHomework = allHomework.filter(hw => hw.status === 'pending' || hw.status === 'assigned').length;
        const homeworkCompletionRate = totalHomework > 0 ? (completedHomework / totalHomework) * 100 : 0;

        // Calculate holistic performance score based on ALL activities
        const calculateOverallScore = () => {
            // If absolutely no data exists, return 0
            if (totalWorkingDays === 0 && totalExams === 0 && totalHomework === 0) {
                return 0;
            }

            let totalScore = 0;
            let totalWeight = 0;

            // 1. Attendance Component (30% weight)
            // If there are working days, attendance matters (even if 0%)
            if (totalWorkingDays > 0) {
                // Attendance percentage directly contributes
                totalScore += attendancePercentage * 0.3;
                totalWeight += 0.3;

                // Additional penalty for excessive absences (>20% absent = further reduction)
                const absentRate = (totalAbsent / totalWorkingDays) * 100;
                if (absentRate > 20) {
                    const penalty = Math.min((absentRate - 20) * 0.2, 10); // Max 10 point penalty
                    totalScore -= penalty;
                }
            }

            // 2. Exam Performance (40% weight)
            if (totalExams > 0) {
                totalScore += avgExamPercentage * 0.4;
                totalWeight += 0.4;
            }

            // 3. Homework Completion (20% weight)
            if (totalHomework > 0) {
                totalScore += homeworkCompletionRate * 0.2;
                totalWeight += 0.2;
            }

            // 4. Consistency Bonus (10% weight)
            // Reward consistent performance across all areas
            if (totalWorkingDays > 0 && totalExams > 0 && totalHomework > 0) {
                const consistency = (attendancePercentage + avgExamPercentage + homeworkCompletionRate) / 3;
                totalScore += consistency * 0.1;
                totalWeight += 0.1;
            }

            // Calculate final score
            let finalScore = totalWeight > 0 ? totalScore / totalWeight : 0;

            // Ensure score is between 0-100
            finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

            return finalScore;
        };

        const overallScore = calculateOverallScore();

        const notices = recentNotices?.notices?.map((n) => ({
            id: n.id,
            title: n.title,
            time: new Date(n.createdAt).toLocaleString(),
            unread: !n.read,
        })) || [];

        // Quick access actions for student
        const actionGroups = [
            {
                title: 'Quick Actions',
                actions: [
                    { icon: TrendingUp, label: 'Performance', color: '#667eea', bgColor: '#EDE9FE', href: '/student/performance' },
                    { icon: Clock, label: 'My Timetable', color: '#8B5CF6', bgColor: '#EDE9FE', href: '/student/timetable' },
                    { icon: Calendar, label: 'My Attendance', color: '#10B981', bgColor: '#D1FAE5', href: '/student/attendance' },
                    { icon: BookOpen, label: 'Homework', color: '#0469ff', bgColor: '#DBEAFE', href: '/homework/view' },
                    { icon: Book, label: 'Library', color: '#F59E0B', bgColor: '#FEF3C7', href: '/student/library' },
                    { icon: Award, label: 'Exam Results', color: '#EF4444', bgColor: '#FEE2E2', href: '/student/exam-results' },
                    { icon: FileText, label: 'Certificates', color: '#06B6D4', bgColor: '#CFFAFE', href: '/student/certificates' },
                    { icon: ScrollText, label: 'Syllabus', color: '#9C27B0', bgColor: '#F3E5F5', href: '/syllabusview' },
                ],
            },
        ];

        // Get recent unread notice only (for updates widget)
        const recentNotice = upcomingEvents?.[0] || null;
        const nextEvent = upcomingEvents?.[1] || null;

        // Wait for critical stats to load before rendering
        const isStatsLoading = !studentStats;

        if (isStatsLoading) {
            return (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#0469ff" />
                    <Text style={{ marginTop: 12, color: '#666', fontSize: 14 }}>Loading...</Text>
                </View>
            );
        }

        return (
            <ScrollView
                style={styles.container}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: paddingTop }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                        colors={['#0469ff']}
                        progressViewOffset={refreshOffset}
                    />
                }
            >
                {banner}
                {/* Today's Events */}
                {todaysEvents.length > 0 && (
                    <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={styles.sectionTitle}>Today's Events</Text>
                                <View style={styles.todayBadge}>
                                    <Text style={styles.todayBadgeText}>NOW</Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.eventsContainer}>
                            {todaysEvents.map((event, index) => (
                                <Animated.View key={event.id} entering={FadeInRight.delay(200 + index * 100).duration(500)}>
                                    <HapticTouchable>
                                        <LinearGradient
                                            colors={[event.color, event.color + 'DD']}
                                            style={styles.todayEventCard}
                                        >
                                            <View style={styles.todayEventIcon}>
                                                <Text style={styles.eventEmoji}>{event.icon}</Text>
                                            </View>
                                            <View style={styles.eventInfo}>
                                                <Text style={styles.todayEventTitle}>{event.title}</Text>
                                                {event.location && (
                                                    <Text style={styles.todayEventLocation}>📍 {event.location}</Text>
                                                )}
                                            </View>
                                            <View style={styles.pulsingDot} />
                                        </LinearGradient>
                                    </HapticTouchable>
                                </Animated.View>
                            ))}
                        </View>
                    </Animated.View>
                )}

                {/* Updates Widget */}
                {(recentNotice || nextEvent) && (
                    <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.updatesWidget}>
                        {recentNotice && (
                            <HapticTouchable
                                style={styles.updateItem}
                                onPress={() => navigateOnce('/(screens)/calendarscreen')}
                            >
                                <View style={[styles.updateIconBg, { backgroundColor: '#E8F5E9' }]}>
                                    <Calendar size={14} color="#4CAF50" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.updateText} numberOfLines={1}>
                                        📅 {recentNotice.title}
                                    </Text>
                                    <Text style={styles.updateTime}>{recentNotice.date}</Text>
                                </View>
                                <ArrowRight size={14} color="#999" />
                            </HapticTouchable>
                        )}
                    </Animated.View>
                )}

                {/* Quick Stats - Gradient Cards with Real Data */}
                <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.section}>
                    <View style={styles.statsGrid}>
                        <HapticTouchable style={{ flex: 1 }} onPress={() => navigateOnce('/student/attendance')}>
                            <LinearGradient
                                colors={['#4ECDC4', '#26A69A']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.statCard, { shadowColor: '#4ECDC4', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                            >
                                <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <View style={styles.statIcon}>
                                    <CheckCircle2 size={22} color="#fff" />
                                </View>
                                <View>
                                    <Text style={styles.statValue}>{Math.round(attendancePercentage)}%</Text>
                                    <Text style={styles.statLabel}>Attendance</Text>
                                </View>
                            </LinearGradient>
                        </HapticTouchable>

                        <HapticTouchable style={{ flex: 1 }} onPress={() => navigateOnce('/student/performance')}>
                            <LinearGradient
                                colors={['#667eea', '#764ba2']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.statCard, { shadowColor: '#667eea', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                            >
                                <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <View style={styles.statIcon}>
                                    <TrendingUp size={22} color="#fff" />
                                </View>
                                <View>
                                    <Text style={styles.statValue}>{overallScore}</Text>
                                    <Text style={styles.statLabel}>Performance</Text>
                                </View>
                            </LinearGradient>
                        </HapticTouchable>

                        <HapticTouchable style={{ flex: 1 }} onPress={() => navigateOnce('/homework/view')}>
                            <LinearGradient
                                colors={['#f093fb', '#f5576c']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={[styles.statCard, { shadowColor: '#f093fb', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                            >
                                <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                <View style={styles.statIcon}>
                                    <BookOpen size={22} color="#fff" />
                                </View>
                                <View>
                                    <Text style={styles.statValue}>{pendingHomework}</Text>
                                    <Text style={styles.statLabel}>Pending Work</Text>
                                </View>
                            </LinearGradient>
                        </HapticTouchable>
                    </View>
                </Animated.View>



                {/* School Banner Carousel */}
                <BannerCarousel schoolId={schoolId} role={user_acc?.role?.name} />

                {/* Quick Actions - Grid like Teacher */}
                {
                    actionGroups.map((group, groupIndex) => (
                        <Animated.View
                            key={group.title}
                            entering={FadeInDown.delay(400 + groupIndex * 100).duration(600)}
                            style={styles.section}
                        >
                            <Text style={styles.sectionTitle}>{group.title}</Text>
                            <View style={styles.actionsGrid}>
                                {group.actions.map((action, index) => (
                                    <Animated.View
                                        key={action.label}
                                        entering={FadeInDown.delay(500 + index * 50).duration(400)}
                                    >
                                        <HapticTouchable onPress={() => navigateOnce(action.href || '')}>
                                            <View style={[styles.actionButton, { backgroundColor: action.bgColor }]}>
                                                {/* Decorative Graphics */}
                                                <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                                                <View style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' }} />

                                                <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                                                    <action.icon size={22} color={action.color} />
                                                </View>
                                                <Text style={styles.actionLabel} numberOfLines={1}>
                                                    {action.label}
                                                </Text>
                                            </View>
                                        </HapticTouchable>
                                    </Animated.View>
                                ))}
                            </View>
                        </Animated.View>
                    ))
                }

                {/* Upcoming Events */}
                <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Events</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(screens)/calendarscreen')}>
                            <Text style={styles.seeAll}>See All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.eventsContainer}>
                        {upcomingEvents && upcomingEvents.length > 0 ? (
                            upcomingEvents.slice(0, 4).map((event, index) => (
                                <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                    <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/calendarscreen', params: { eventid: event.id } })}>
                                        <View style={styles.eventCard}>
                                            <View style={[styles.eventIcon, { backgroundColor: event.color + '20' }]}>
                                                <Text style={styles.eventEmoji}>{event.icon}</Text>
                                            </View>
                                            <View style={styles.eventInfo}>
                                                <Text style={styles.eventTitle}>{event.title}</Text>
                                                <View style={styles.eventDate}>
                                                    <Calendar size={14} color="#666" />
                                                    <Text style={styles.eventDateText}>{event.date}</Text>
                                                </View>
                                            </View>
                                            <ChevronRight size={20} color="#999" />
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(700).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    You're all caught up!
                                </Text>
                            </Animated.View>
                        )}
                    </View>

                </Animated.View>
                {/* Recent Notices */}
                <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recent Notices</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                            <Text style={styles.seeAll}>View All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.noticesContainer}>
                        {notices && notices.length > 0 ? (
                            notices.map((notice, index) => (
                                <Animated.View
                                    key={notice.id}
                                    entering={FadeInRight.delay(900 + index * 100).duration(500)}
                                >
                                    <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                                        <View style={styles.noticeCard}>
                                            <View style={styles.noticeLeft}>
                                                <View style={[styles.noticeIcon, notice.unread && styles.unreadIcon]}>
                                                    <Bell size={16} color={notice.unread ? '#0469ff' : '#999'} />
                                                </View>
                                                <View style={styles.noticeInfo}>
                                                    <Text style={[styles.noticeTitle, notice.unread && styles.unreadTitle]} numberOfLines={1}>
                                                        {notice.title}
                                                    </Text>
                                                    <Text style={styles.noticeTime}>
                                                        {notice.time}
                                                    </Text>
                                                </View>
                                            </View>
                                            {notice.unread && <View style={styles.unreadDot} />}
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(900).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    No notices yet
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>

                {/* Bottom Spacer */}
                <View style={{ height: 100 }} />
            </ScrollView >
        );
    };

    // === ADMIN VIEW ===
    const AdminView = ({ refreshing, onRefresh, banner, paddingTop, refreshOffset, navigateOnce }) => (
        <ScrollView
            style={styles.container}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: paddingTop }}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#0469ff"
                    progressViewOffset={refreshOffset}
                />
            }
        >
            {banner}
            {todaysEvents.length > 0 && (
                <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.sectionTitle}>Today's Events</Text>
                            <View style={styles.todayBadge}>
                                <Text style={styles.todayBadgeText}>NOW</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.eventsContainer}>
                        {todaysEvents.map((event, index) => (
                            <Animated.View key={event.id} entering={FadeInRight.delay(600 + index * 100).duration(500)}>
                                <HapticTouchable>
                                    <LinearGradient
                                        colors={[event.color, event.color + 'DD']}
                                        style={styles.todayEventCard}
                                    >
                                        <View style={styles.todayEventIcon}>
                                            <Text style={styles.eventEmoji}>{event.icon}</Text>
                                        </View>
                                        <View style={styles.eventInfo}>
                                            <Text style={styles.todayEventTitle}>{event.title}</Text>
                                            {event.location && (
                                                <Text style={styles.todayEventLocation}>📍 {event.location}</Text>
                                            )}
                                        </View>
                                        <View style={styles.pulsingDot} />
                                    </LinearGradient>
                                </HapticTouchable>
                            </Animated.View>
                        ))}
                    </View>
                </Animated.View>
            )}

            {/* School Banner Carousel */}
            <BannerCarousel schoolId={schoolId} role={user_acc?.role?.name} />

            <Text style={styles.sectionTitle}>School Dashboard</Text>
            <Text style={{ padding: 16, color: '#666' }}>Admin features coming soon.</Text>

            {/* Bottom Spacer */}
            <View style={{ height: 100 }} />
        </ScrollView>
    );



    // / Complete ParentView Component
    const ParentView = ({ schoolId, parentId, refreshing, onRefresh, onScroll, paddingTop, refreshOffset, banner, navigateOnce }) => {
        const [showAddChildModal, setShowAddChildModal] = useState(false);
        // Use ref to track if we've restored from cache - prevents flash of null
        const hasRestoredChild = useRef(false);
        const [selectedChild, setSelectedChild] = useState(() => {
            // Synchronously try to get cached child (will be null on first render, populated on subsequent)
            return null;
        });

        // Local state for lastViewed timestamps - refreshed on focus to clear badges
        const [lastViewedTimestamps, setLastViewedTimestamps] = useState({
            homework: null,
            exams: null,
        });

        // Helper function to refresh timestamps from SecureStore
        const refreshBadgeTimestamps = useCallback(async (studentId) => {
            if (!studentId) return;

            const [homeworkLastViewed, examLastViewed] = await Promise.all([
                SecureStore.getItemAsync(`homework_last_viewed_${studentId}`),
                SecureStore.getItemAsync(`exam_last_viewed_${studentId}`),
            ]);

            setLastViewedTimestamps({
                homework: homeworkLastViewed,
                exams: examLastViewed,
            });
        }, []);

        // Refresh timestamps when selectedChild changes (handles initial load)
        useEffect(() => {
            if (selectedChild?.studentId) {
                refreshBadgeTimestamps(selectedChild.studentId);
            }
        }, [selectedChild?.studentId, refreshBadgeTimestamps]);

        // Also refresh timestamps when screen gains focus (handles back navigation)
        useFocusEffect(
            useCallback(() => {
                if (selectedChild?.studentId) {
                    refreshBadgeTimestamps(selectedChild.studentId);
                }
            }, [selectedChild?.studentId, refreshBadgeTimestamps])
        );

        const queryClient = useQueryClient();
        const {
            data: recentNotices,
            isFetching,
            isLoading,
            refetch,
        } = useQuery({
            queryKey: ['notices', schoolId, userId],
            queryFn: async () => {
                if (!schoolId || !userId) return { notices: [], pagination: {} };

                const cat = 'All';
                const unread = '';

                const res = await api.get(
                    `/notices/${schoolId}?userId=${userId}&${cat}&${unread}&limit=4&page=1`
                );
                return res.data; // { notices: [], pagination: { totalPages, currentPage } }
            },
            enabled: !!schoolId && !!userId,
            keepPreviousData: true,
            ...CACHE_CONFIG.MODERATE,
        });
        // console.log(recentNotices);
        const notices = recentNotices?.notices?.map((n) => ({
            id: n.id,
            title: n.title,
            time: new Date(n.createdAt).toLocaleString(), // or format like "2 hours ago"
            unread: !n.read,
        })) || [];


        // Batch child stats queries for faster loading
        const { data: childStats, isFetching: isChildStatsFetching } = useQuery({
            queryKey: ['parent-child-stats', schoolId, selectedChild?.studentId],
            queryFn: async () => {
                if (!schoolId || !selectedChild?.studentId) return null;
                const now = new Date();
                const month = now.getMonth() + 1;
                const year = now.getFullYear();

                const [attendanceRes, homeworkRes, examRes] = await Promise.all([
                    api.get(`/schools/${schoolId}/attendance/stats?userId=${selectedChild.studentId}&month=${month}&year=${year}`).catch(() => ({ data: null })),
                    api.get(`/schools/homework?schoolId=${schoolId}&studentId=${selectedChild.studentId}`).catch(() => ({ data: { homework: [] } })),
                    api.get(`/schools/${schoolId}/examination/student-results?studentId=${selectedChild.studentId}`).catch(() => ({ data: { stats: {}, results: [] } })),
                ]);

                // Get last viewed timestamps
                const homeworkLastViewedKey = `homework_last_viewed_${selectedChild.studentId}`;
                const examLastViewedKey = `exam_last_viewed_${selectedChild.studentId}`;

                const [homeworkLastViewed, examLastViewed] = await Promise.all([
                    SecureStore.getItemAsync(homeworkLastViewedKey),
                    SecureStore.getItemAsync(examLastViewedKey),
                ]);

                return {
                    attendance: attendanceRes.data,
                    homework: { ...homeworkRes.data, lastViewed: homeworkLastViewed },
                    exams: { ...examRes.data, lastViewed: examLastViewed },
                };
            },
            enabled: !!schoolId && !!selectedChild?.studentId,
            ...CACHE_CONFIG.MODERATE,
        });

        // Extract stats from batched query
        const attendanceStats = childStats?.attendance;
        const homeworkData = childStats?.homework;
        const examBadgeData = childStats?.exams;

        // Fetch fee status for selected child (for dashboard card)
        const { data: academicYearData } = useQuery({
            queryKey: ['academic-years-parent', schoolId],
            queryFn: async () => {
                const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
                return res.data?.find(y => y.isActive);
            },
            enabled: !!schoolId,
            staleTime: 1000 * 60 * 10,
        });

        const { data: feeData } = useQuery({
            queryKey: ['parent-child-fee', selectedChild?.studentId, academicYearData?.id],
            queryFn: async () => {
                if (!selectedChild?.studentId || !academicYearData?.id) return null;
                const params = new URLSearchParams({ academicYearId: academicYearData.id });
                const res = await api.get(`/schools/fee/students/${selectedChild.studentId}?${params}`);
                return res.data;
            },
            enabled: !!selectedChild?.studentId && !!academicYearData?.id,
            staleTime: 1000 * 60 * 5,
        });

        // Helper for abbreviated currency formatting (K, L, Cr) - clean whole numbers
        const formatAbbr = (amount) => {
            if (!amount || amount === 0) return '0';
            const value = Math.abs(amount);
            if (value >= 10000000) return `${Math.round(value / 10000000)}Cr`;
            if (value >= 100000) return `${(value / 100000).toFixed(1).replace(/\.0$/, '')}L`;
            if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
            return `${Math.round(value)}`;
        };

        // Calculate dashboard card values
        const childAttendance = attendanceStats?.monthlyStats?.attendancePercentage ?? 0;

        // Fee status calculation
        const totalFee = feeData?.originalAmount || 0;
        const paidFee = feeData?.paidAmount || 0;
        const pendingFee = feeData?.balanceAmount || 0;

        const feeStatusDisplay = `₹${formatAbbr(paidFee)}`;

        // Fetch upcoming events for parent
        const { data: upcomingEvents } = useQuery({
            queryKey: ['parent-upcoming-events', schoolId],
            queryFn: async () => {
                if (!schoolId) return [];
                const res = await api.get(`/schools/${schoolId}/calendar/upcoming?limit=3`);
                return res.data?.events || res.data || [];
            },
            enabled: !!schoolId,
            ...CACHE_CONFIG.STATIC,
        });

        // Get recent unread notice only (don't show if already read)
        const recentNotice = notices?.find(n => n.unread) || null;
        const nextEvent = upcomingEvents?.[0] || null;


        // Count only new homework (created after last viewed, if exists)
        const pendingHomework = (homeworkData?.homework || []).filter(hw => {
            const isPending = !hw.mySubmission || hw.mySubmission.status === 'PENDING';
            if (!isPending) return false;

            // Use focus-refreshed lastViewed timestamp for accurate badge count
            if (lastViewedTimestamps.homework) {
                const lastViewedDate = new Date(lastViewedTimestamps.homework);
                const homeworkDate = new Date(hw.createdAt);
                return homeworkDate > lastViewedDate;
            }
            return true; // No lastViewed = show all pending
        }).length;

        // Combined loading state for stats cards
        const isStatsLoading = isChildStatsFetching;

        // Count new exam results (CREATED after last viewed) - uses focus-refreshed timestamp
        // Uses createdAt (when result was published), NOT examDate (which can be in the future)
        const newExamResults = (() => {
            if (!lastViewedTimestamps.exams) {
                // First time viewing - no badge
                return 0;
            }
            const lastViewedDate = new Date(lastViewedTimestamps.exams);

            // Count results that were CREATED after user last viewed
            // (ignoring examDate which might be in the future for scheduled exams)
            return (examBadgeData?.results || []).filter(r => {
                // Use createdAt (when result was published to system)
                const createdDate = r.createdAt ? new Date(r.createdAt) : null;
                return createdDate && createdDate > lastViewedDate;
            }).length;
        })();

        // Calculate performance using same formula as performance page (40% attendance + 60% exams)
        const childPerformance = (() => {
            let score = 0;
            let weight = 0;

            // Attendance component (40% weight)
            const attendancePercent = attendanceStats?.monthlyStats?.attendancePercentage;
            if (attendancePercent !== undefined && attendancePercent !== null) {
                score += (attendancePercent || 0) * 0.4;
                weight += 0.4;
            }

            // Exam component (60% weight)
            const examPercent = examBadgeData?.stats?.avgPercentage;
            if (examPercent !== undefined && examPercent !== null) {
                score += (examPercent || 0) * 0.6;
                weight += 0.6;
            }

            if (weight > 0) {
                return `${Math.round(score / weight)}%`;
            }
            return '0';
        })();

        // qucik access for parent
        const actionGroups = [
            {
                title: 'Quick Actions',
                actions: [
                    {
                        icon: TrendingUp,
                        label: 'Performance',
                        color: '#0469ff',
                        bgColor: '#E3F2FD',
                        href: "/my-child/parent-performance",
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                    {
                        icon: Calendar, label: 'Attendance', color: '#4ECDC4', bgColor: '#E0F7F4', href: "/my-child/attendance",
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                    {
                        icon: Calendar,
                        label: 'School Calendar',
                        color: '#4CAF50',     // green icon
                        bgColor: '#E8F5E9',   // light green background
                        href: "/(screens)/calendarscreen"
                    },
                    {
                        icon: ScrollText,
                        label: 'Syllabus',
                        color: '#9C27B0',
                        bgColor: '#F3E5F5',
                        href: "/syllabusview"
                    },
                    {
                        icon: Book,
                        label: 'Homework',
                        color: '#FF6B6B',
                        bgColor: '#FFE9E9',
                        href: '/my-child/parent-homework',
                        params: { childData: JSON.stringify(selectedChild) },
                        badge: pendingHomework > 0 ? pendingHomework : null,
                    },
                    {
                        icon: FileText,
                        label: 'Documents',
                        color: '#8B5CF6',
                        bgColor: '#F3E8FF',
                        href: '/my-child/parent-documents',
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                    {
                        icon: Calendar,
                        label: 'Timetable',
                        color: '#0EA5E9',
                        bgColor: '#E0F2FE',
                        href: '/my-child/parent-timetable',
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                    {
                        icon: BookOpen,
                        label: 'Library',
                        color: '#6366F1',
                        bgColor: '#EEF2FF',
                        href: '/my-child/parent-library',
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                ],
            },
            {
                title: 'Examination',
                actions: [
                    {
                        icon: Award,
                        label: 'Exam Results',
                        color: '#FFD93D',
                        bgColor: '#FFF9E0',
                        href: '/my-child/parent-exams',
                        params: { childData: JSON.stringify(selectedChild) },
                        badge: newExamResults > 0 ? newExamResults : null,
                    },
                ],
            },
            {
                title: 'Fee Management',
                actions: [
                    {
                        icon: DollarSign,
                        label: 'Pay Fees',
                        color: '#FF6B6B',
                        bgColor: '#FFE9E9',
                        href: "/(screens)/payfees",
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                    {
                        icon: TimerIcon,
                        label: 'History',
                        color: '#4CAF50',
                        bgColor: '#E7F5E9',
                        href: "/(screens)/paymenthistory",
                        params: {
                            childData: JSON.stringify({
                                ...selectedChild,
                                parentId
                            })
                        }
                    },
                ],
            },
            {
                title: 'Transport',
                actions: [
                    {
                        icon: Users,
                        label: 'Bus Request',
                        color: '#3B82F6',
                        bgColor: '#DBEAFE',
                        href: "/(screens)/transport/bus-request",
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                    {
                        icon: Calendar,
                        label: 'Track Bus',
                        color: '#10B981',
                        bgColor: '#D1FAE5',
                        href: "/(screens)/transport/bus-tracking",
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                    {
                        icon: CheckCircle2,
                        label: 'Bus Attendance',
                        color: '#8B5CF6',
                        bgColor: '#EDE9FE',
                        href: "/(screens)/transport/attendance-history",
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                    {
                        icon: DollarSign,
                        label: 'Transport Fee',
                        color: '#F59E0B',
                        bgColor: '#FEF3C7',
                        href: "/(screens)/transport/transport-fee",
                        params: { childData: JSON.stringify(selectedChild) },
                    },
                ],
            },
        ];
        const { data, isPending } = useQuery({
            queryKey: QUERY_KEYS.parentChildren(schoolId, parentId),
            queryFn: async () => {
                const res = await api.get(`/schools/${schoolId}/parents/${parentId}/child`);
                return res.data;
            },
            enabled: Boolean(schoolId && parentId),
            ...CACHE_CONFIG.MODERATE,
        });

        const uiChildren = useMemo(() =>
            data?.children?.map((child) => ({
                id: child.studentId,
                studentId: child.studentId,
                name: child.name,
                class: child.class,
                classId: child.classId,
                section: child.section,
                sectionId: child.sectionId,
                rollNo: child.rollNumber,
                avatar: child.profilePicture,
                attendance: Math.floor(Math.random() * 21) + 80,
                feeStatus: "Paid",
                performance: "Excellent",
                pendingFee: 0
            })) || [],
            [data]);

        const icon = require("../../assets/avatar_face.png");
        const parentData = useMemo(() => ({
            name: "Sarah Johnson",
            email: "sarah.johnson@email.com",
            phone: "+91 9876543210",
            // upcomingEvents: [
            //     { id: 1, title: "Parent-Teacher Meeting", date: "Nov 15, 2025", icon: "👥", color: "#FF6B6B" },
            //     { id: 2, title: "Annual Sports Day", date: "Nov 20, 2025", icon: "⚽", color: "#4ECDC4" },
            //     { id: 3, title: "Science Exhibition", date: "Nov 25, 2025", icon: "🔬", color: "#FFD93D" }
            // ],
            recentNotices: [
                { id: 1, title: "Winter Break Schedule", time: "2 hours ago", unread: true },
                { id: 2, title: "Fee Payment Reminder", time: "1 day ago", unread: true },
                { id: 3, title: "School Uniform Guidelines", time: "3 days ago", unread: false }
            ]
        }), []);

        // Restore selectedChild from cache on mount, then persist on change
        useEffect(() => {
            const restoreSelectedChild = async () => {
                if (hasRestoredChild.current) return;
                hasRestoredChild.current = true;

                try {
                    const cachedChild = await SecureStore.getItemAsync(`selectedChild_${parentId}`);
                    if (cachedChild) {
                        const parsed = JSON.parse(cachedChild);
                        // Validate cached child exists in current children list
                        if (uiChildren.some(c => c.studentId === parsed.studentId)) {
                            setSelectedChild(parsed);
                            return;
                        }
                    }
                } catch (e) {
                    console.log('Error restoring selected child:', e);
                }

                // Fallback to first child if no valid cache
                if (uiChildren.length > 0 && !selectedChild) {
                    setSelectedChild(uiChildren[0]);
                }
            };

            if (uiChildren.length > 0) {
                restoreSelectedChild();
            }
        }, [uiChildren, parentId]);

        // Persist selectedChild when it changes
        useEffect(() => {
            const persistSelectedChild = async () => {
                if (selectedChild && parentId) {
                    try {
                        await SecureStore.setItemAsync(
                            `selectedChild_${parentId}`,
                            JSON.stringify(selectedChild)
                        );
                    } catch (e) {
                        console.log('Error persisting selected child:', e);
                    }
                }
            };
            persistSelectedChild();
        }, [selectedChild, parentId]);

        const handleAddChildSuccess = useCallback(async () => {
            try {
                // Refresh the children list
                await queryClient.invalidateQueries(QUERY_KEYS.parentChildren(schoolId, parentId));
                // Trigger parent refresh
                if (onRefresh && typeof onRefresh === 'function') {
                    onRefresh();
                }
            } catch (error) {
                console.error('Failed to refresh after adding child:', error);
            }
        }, [queryClient, schoolId, parentId, onRefresh]);

        // Loading state
        if (isPending) {
            return (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#0469ff" />
                </View>
            );
        }

        // Empty state - No children added yet
        if (!isPending && uiChildren.length === 0) {
            return (
                <View style={styles.container}>
                    <ScrollView
                        contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                tintColor="#0469ff"
                                colors={['#0469ff']}
                            />
                        }
                    >
                        <View style={{ alignItems: 'center' }}>

                            <View style={{
                                width: 120,
                                height: 120,
                                borderRadius: 60,
                                backgroundColor: '#E3F2FD',
                                justifyContent: 'center',
                                alignItems: 'center',
                                marginBottom: 24
                            }}>
                                <Users size={48} color="#0469ff" />
                            </View>
                            <Text style={{ fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8 }}>
                                No Children Added
                            </Text>
                            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 32, lineHeight: 20, paddingHorizontal: 16 }}>
                                Add your child to view their information and stay connected with their education
                            </Text>
                            <HapticTouchable onPress={() => setShowAddChildModal(true)}>
                                <View style={{
                                    backgroundColor: '#0469ff',
                                    paddingHorizontal: 32,
                                    paddingVertical: 16,
                                    borderRadius: 12,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 8
                                }}>
                                    <Plus size={20} color="#fff" />
                                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                                        Add Your Child
                                    </Text>
                                </View>
                            </HapticTouchable>
                        </View>
                    </ScrollView>

                    {/* Add Child Modal */}
                    <AddChildModal
                        visible={showAddChildModal}
                        onClose={() => setShowAddChildModal(false)}
                        parentId={parentId}
                        schoolId={schoolId}
                        onSuccess={handleAddChildSuccess}
                    />
                </View>
            );
        }
        const ActionButtonWithBadge = ({ action, onPress }) => {
            return (
                <HapticTouchable onPress={onPress}>
                    <View style={[styles.actionButton, { backgroundColor: action.bgColor }]}>
                        <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                            <action.icon size={22} color={action.color} />
                            {action.badge && (
                                <View style={styles.badgeContainer}>
                                    <Text style={styles.badgeText}>{action.badge}</Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.actionLabel} numberOfLines={1}>
                            {action.label}
                        </Text>
                    </View>
                </HapticTouchable>
            );
        };

        // Loading state - wait for ALL critical data before rendering
        const isCriticalDataLoading = isPending || !selectedChild || isChildStatsFetching;

        if (isCriticalDataLoading) {
            return (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                    <ActivityIndicator size="large" color="#0469ff" />
                    <Text style={{ marginTop: 12, color: '#666', fontSize: 14 }}>Loading...</Text>
                </View>
            );
        }


        // Main content - child selected
        return (
            <Animated.ScrollView
                style={styles.container}
                showsVerticalScrollIndicator={false}
                onScroll={onScroll}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingTop: paddingTop }}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                        colors={['#0469ff']}
                        progressViewOffset={refreshOffset}
                    />
                }
            >
                {banner}

                {todaysEvents.length > 0 && (
                    <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Text style={styles.sectionTitle}>Today's Events</Text>
                                <View style={styles.todayBadge}>
                                    <Text style={styles.todayBadgeText}>NOW</Text>
                                </View>
                            </View>
                        </View>
                        <View style={styles.eventsContainer}>
                            {todaysEvents.map((event, index) => (
                                <Animated.View key={event.id} entering={FadeInRight.delay(600 + index * 100).duration(500)}>
                                    <HapticTouchable>
                                        <LinearGradient
                                            colors={[event.color, event.color + 'DD']}
                                            style={styles.todayEventCard}
                                        >
                                            <View style={styles.todayEventIcon}>
                                                <Text style={styles.eventEmoji}>{event.icon}</Text>
                                            </View>
                                            <View style={styles.eventInfo}>
                                                <Text style={styles.todayEventTitle}>{event.title}</Text>
                                                {event.location && (
                                                    <Text style={styles.todayEventLocation}>📍 {event.location}</Text>
                                                )}
                                            </View>
                                            <View style={styles.pulsingDot} />
                                        </LinearGradient>
                                    </HapticTouchable>
                                </Animated.View>
                            ))}
                        </View>
                    </Animated.View>
                )}
                {/* School Banner Carousel */}
                <BannerCarousel schoolId={schoolId} role={user_acc?.role?.name} />
                {/* Children Selector */}
                <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View>
                            <Text style={styles.sectionTitle}>Your Children</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                            <Text style={styles.childrenCount}>{uiChildren?.length || 0}</Text>
                            <HapticTouchable onPress={() => setShowAddChildModal(true)}>
                                <Plus style={styles.childrenCount} color={'#0469ff'} strokeWidth={0.9} />
                            </HapticTouchable>
                        </View>
                    </View>
                    {/* Carousel Container */}
                    <View style={[styles.carouselContainer, uiChildren.length === 1 && { height: 'auto' }]}>
                        {uiChildren.length === 1 ? (
                            // Single child - fill like other sections, no vertical centering
                            <View style={{ width: '100%' }}>
                                <Animated.View entering={FadeInRight.delay(200).duration(500)} style={{ width: '100%' }}>
                                    <HapticTouchable onPress={() => setSelectedChild(uiChildren[0])}>
                                        <LinearGradient
                                            colors={['#0469ff', '#0347b8']}
                                            style={[
                                                {
                                                    // Use childCard styles but override width
                                                    flexDirection: 'row',
                                                    padding: 16,
                                                    borderRadius: 16,
                                                    gap: 12,
                                                    position: 'relative',
                                                    width: '100%', // Full width instead of fixed SCREEN_WIDTH * 0.75
                                                },
                                                styles.selectedChildCard,
                                                {
                                                    shadowColor: '#0469ff',
                                                    shadowOpacity: 0.3,
                                                    shadowRadius: 12,
                                                    elevation: 8,
                                                }
                                            ]}
                                        >{/* Decorative Education Pattern */}
                                            <Text style={{ position: 'absolute', top: 5, right: 50, fontSize: 24, color: 'rgba(255,255,255,0.25)', fontWeight: '300' }}>+</Text>
                                            <Text style={{ position: 'absolute', top: 40, right: 15, fontSize: 18, color: 'rgba(255,255,255,0.2)', fontWeight: '300' }}>×</Text>
                                            <Text style={{ position: 'absolute', bottom: 8, right: 80, fontSize: 20, color: 'rgba(255,255,255,0.18)', fontWeight: '300' }}>÷</Text>
                                            <Text style={{ position: 'absolute', top: 10, left: '45%', fontSize: 16, color: 'rgba(255,255,255,0.2)', fontWeight: '300' }}>△</Text>
                                            <Text style={{ position: 'absolute', bottom: 5, left: '55%', fontSize: 14, color: 'rgba(255,255,255,0.18)', fontWeight: '300' }}>○</Text>
                                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                                            <View style={{ position: 'absolute', bottom: -25, left: '25%', width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.06)' }} />

                                            <Image
                                                source={
                                                    uiChildren[0]?.avatar &&
                                                        !uiChildren[0].avatar.includes('default.png')
                                                        ? { uri: uiChildren[0].avatar }
                                                        : icon
                                                }
                                                style={styles.childAvatar}
                                            />


                                            <View style={styles.childInfo}>
                                                <Text style={[styles.childName, styles.selectedText]} numberOfLines={1}>
                                                    {uiChildren[0].name}
                                                </Text>
                                                <Text style={[styles.childClass, styles.selectedSubText]}>
                                                    Class {uiChildren[0].class} - {uiChildren[0].section}
                                                </Text>
                                                <View style={styles.childMeta}>
                                                    <View style={[styles.metaBadge, styles.selectedBadge]}>
                                                        <Text style={[styles.metaText, styles.selectedText]}>
                                                            Roll: {uiChildren[0].rollNo}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                            <View style={styles.selectedIndicator}>
                                                <Text style={styles.checkmark}>✓</Text>
                                            </View>
                                        </LinearGradient>
                                    </HapticTouchable>
                                </Animated.View>
                            </View>
                        ) : (
                            // Multiple children - use carousel
                            <FlatList
                                data={uiChildren}
                                horizontal
                                pagingEnabled={false}
                                showsHorizontalScrollIndicator={false}
                                snapToInterval={SCREEN_WIDTH * 0.75 + 16} // card width + margin
                                snapToAlignment="center"
                                decelerationRate="fast"
                                contentContainerStyle={{
                                    paddingHorizontal: (SCREEN_WIDTH - (isSmallDevice ? SCREEN_WIDTH * 0.7 : SCREEN_WIDTH * 0.75)) / 2,
                                    alignItems: 'center',
                                }}
                                keyExtractor={(item) => item.id}
                                renderItem={({ item: child, index }) => {
                                    const isSelected = selectedChild?.id === child.id;
                                    const distanceFromCenter = Math.abs(
                                        index - uiChildren.findIndex(c => c.id === selectedChild?.id)
                                    );

                                    // Calculate opacity and scale based on distance from selected
                                    const opacity = isSelected ? 1 : Math.max(0.3, 1 - (distanceFromCenter * 0.4));
                                    const scale = isSelected ? 1 : Math.max(0.85, 1 - (distanceFromCenter * 0.1));

                                    return (
                                        <Animated.View
                                            entering={FadeInRight.delay(200 + index * 100).duration(500)}
                                            style={{
                                                marginHorizontal: 8,
                                                opacity,
                                                transform: [{ scale }],
                                            }}
                                        >
                                            <HapticTouchable onPress={() => setSelectedChild(child)}>
                                                <LinearGradient
                                                    colors={isSelected ? ['#0469ff', '#0347b8'] : ['#f8f9fa', '#e9ecef']}
                                                    style={[
                                                        styles.childCard,
                                                        isSelected && styles.selectedChildCard,
                                                        {
                                                            shadowColor: isSelected ? '#0469ff' : '#000',
                                                            shadowOpacity: isSelected ? 0.3 : 0.1,
                                                            shadowRadius: isSelected ? 12 : 4,
                                                            elevation: isSelected ? 8 : 2,
                                                        }
                                                    ]}
                                                >
                                                    {/* Decorative Education Pattern (only on selected) */}
                                                    {isSelected && (
                                                        <>
                                                            <Text style={{ position: 'absolute', top: 8, right: 45, fontSize: 14, color: 'rgba(255,255,255,0.15)', fontWeight: '300' }}>+</Text>
                                                            <Text style={{ position: 'absolute', top: 35, right: 20, fontSize: 10, color: 'rgba(255,255,255,0.12)', fontWeight: '300' }}>×</Text>
                                                            <Text style={{ position: 'absolute', bottom: 12, right: 70, fontSize: 16, color: 'rgba(255,255,255,0.1)', fontWeight: '300' }}>÷</Text>
                                                            <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)' }} />
                                                        </>
                                                    )}
                                                    <Image source={{ uri: child.avatar }} style={styles.childAvatar} />
                                                    <View style={styles.childInfo}>
                                                        <Text style={[styles.childName, isSelected && styles.selectedText]} numberOfLines={1}>
                                                            {child.name}
                                                        </Text>
                                                        <Text style={[styles.childClass, isSelected && styles.selectedSubText]}>
                                                            Class {child.class} - {child.section}
                                                        </Text>
                                                        <View style={styles.childMeta}>
                                                            <View style={[styles.metaBadge, isSelected && styles.selectedBadge]}>
                                                                <Text style={[styles.metaText, isSelected && styles.selectedText]}>
                                                                    Roll: {child.rollNo}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                    {isSelected && (
                                                        <View style={styles.selectedIndicator}>
                                                            <Text style={styles.checkmark}>✓</Text>
                                                        </View>
                                                    )}
                                                </LinearGradient>
                                            </HapticTouchable>
                                        </Animated.View>
                                    );
                                }}
                            />
                        )}
                    </View>
                </Animated.View>

                {/* Updates & Alerts Widget */}
                {(pendingHomework > 0 || newExamResults > 0 || recentNotice || nextEvent) && (
                    <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.updatesWidget}>
                        {pendingHomework > 0 && (
                            <HapticTouchable
                                style={styles.updateItem}
                                onPress={() => navigateOnce({ pathname: '/my-child/parent-homework', params: { childData: JSON.stringify(selectedChild) } })}
                            >
                                <View style={[styles.updateIconBg, { backgroundColor: '#E3F2FD' }]}>
                                    <BookOpen size={14} color="#3B82F6" />
                                </View>
                                <Text style={styles.updateText} numberOfLines={1}>
                                    {pendingHomework} new homework
                                </Text>
                                <ArrowRight size={14} color="#999" />
                            </HapticTouchable>
                        )}
                        {newExamResults > 0 && (
                            <HapticTouchable
                                style={styles.updateItem}
                                onPress={() => navigateOnce({ pathname: '/my-child/parent-exams', params: { childData: JSON.stringify(selectedChild) } })}
                            >
                                <View style={[styles.updateIconBg, { backgroundColor: '#FEF3C7' }]}>
                                    <Award size={14} color="#F59E0B" />
                                </View>
                                <Text style={styles.updateText} numberOfLines={1}>
                                    {newExamResults} new exam result{newExamResults > 1 ? 's' : ''}
                                </Text>
                                <ArrowRight size={14} color="#999" />
                            </HapticTouchable>
                        )}
                        {recentNotice && (
                            <HapticTouchable
                                style={styles.updateItem}
                                onPress={() => navigateOnce('/(tabs)/noticeboard')}
                            >
                                <View style={[styles.updateIconBg, { backgroundColor: '#FFEBEE' }]}>
                                    <Bell size={14} color="#EF4444" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.updateText} numberOfLines={1}>
                                        🔴 {recentNotice.title}
                                    </Text>
                                    <Text style={styles.updateTime}>{recentNotice.time}</Text>
                                </View>
                                <ArrowRight size={14} color="#999" />
                            </HapticTouchable>
                        )}
                        {nextEvent && (
                            <HapticTouchable
                                style={styles.updateItem}
                                onPress={() => navigateOnce('/(screens)/calendarscreen')}
                            >
                                <View style={[styles.updateIconBg, { backgroundColor: '#E8F5E9' }]}>
                                    <Calendar size={14} color="#4CAF50" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.updateText} numberOfLines={1}>
                                        📅 {nextEvent.title || nextEvent.name}
                                    </Text>
                                    <Text style={styles.updateTime}>
                                        {nextEvent.date ? new Date(nextEvent.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}
                                    </Text>
                                </View>
                                <ArrowRight size={14} color="#999" />
                            </HapticTouchable>
                        )}
                    </Animated.View>
                )}

                {/* Quick Stats for Selected Child */}
                <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.section}>
                    {isStatsLoading ? (
                        <View style={styles.statsLoadingContainer}>
                            <ActivityIndicator size="small" color="#0469ff" />
                            <Text style={styles.statsLoadingText}>Updating stats...</Text>
                        </View>
                    ) : (
                        <View style={styles.statsGrid}>
                            <HapticTouchable style={{ flex: 1 }} onPress={() => navigateOnce({ pathname: '/my-child/attendance', params: { childData: JSON.stringify(selectedChild) } })}>
                                <LinearGradient
                                    colors={['#4ECDC4', '#26A69A']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={[styles.statCard, { shadowColor: '#4ECDC4', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                                >
                                    {/* Decorative Elements */}
                                    <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                    <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />

                                    <View style={styles.statIcon}>
                                        <CheckCircle2 size={22} color="#fff" />
                                    </View>
                                    <View>
                                        <Text style={styles.statValue}>
                                            {childAttendance === 0 ? '0%' : `${Math.round(childAttendance)}%`}
                                        </Text>
                                        <Text style={styles.statLabel}>Attendance</Text>
                                    </View>
                                </LinearGradient>
                            </HapticTouchable>

                            <HapticTouchable style={{ flex: 1 }} onPress={() => navigateOnce({ pathname: '/my-child/parent-exams', params: { childData: JSON.stringify(selectedChild) } })}>
                                <LinearGradient
                                    colors={['#FF9F43', '#F59E0B']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={[styles.statCard, { shadowColor: '#FF9F43', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                                >
                                    {/* Decorative Elements */}
                                    <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                    <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />

                                    <View style={styles.statIcon}>
                                        <TrendingUp size={22} color="#fff" />
                                    </View>
                                    <View>
                                        <Text style={styles.statValue}>{childPerformance}</Text>
                                        <Text style={styles.statLabel}>Performance</Text>
                                    </View>
                                </LinearGradient>
                            </HapticTouchable>

                            <HapticTouchable style={{ flex: 1 }} onPress={() => navigateOnce({ pathname: '/(screens)/payfees', params: { childData: JSON.stringify(selectedChild) } })}>
                                <LinearGradient
                                    colors={pendingFee > 0 ? ['#FF6B6B', '#EE5A5A'] : ['#10B981', '#059669']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={[styles.statCard, { shadowColor: pendingFee > 0 ? '#FF6B6B' : '#10B981', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                                >
                                    {/* Decorative Elements */}
                                    <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                                    <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />

                                    <View style={styles.statIcon}>
                                        <DollarSign size={22} color="#fff" />
                                    </View>
                                    <View>
                                        <Text style={styles.statValue}>{feeStatusDisplay}</Text>
                                        <Text style={styles.statLabel}>Fee Status</Text>
                                    </View>
                                </LinearGradient>
                            </HapticTouchable>
                        </View>
                    )}
                </Animated.View>
                {/* Quick Actions */}
                {
                    actionGroups && actionGroups.map((group, groupIndex) => (
                        <Animated.View
                            key={group.title}
                            entering={FadeInDown.delay(400 + groupIndex * 100).duration(600)}
                            style={styles.section}
                        >
                            <Text style={styles.sectionTitle}>{group.title}</Text>
                            <View style={styles.actionsGrid}>
                                {group.actions.map((action, index) => {
                                    const totalItems = group.actions.length;
                                    // Full width for: single item OR last item when odd count
                                    const isFullWidth = totalItems === 1 || (totalItems % 2 === 1 && index === totalItems - 1);
                                    const itemWidth = isFullWidth
                                        ? SCREEN_WIDTH - (isSmallDevice ? 24 : 32)
                                        : (SCREEN_WIDTH - (isSmallDevice ? 24 : 32) - 12) / 2;

                                    return (
                                        <Animated.View
                                            key={action.label}
                                            entering={FadeInDown.delay(500 + index * 50).duration(400)}
                                        >
                                            <HapticTouchable
                                                onPress={() => {
                                                    if (action.params) {
                                                        navigateOnce(action.href, action.params);
                                                    } else {
                                                        navigateOnce(action.href || '');
                                                    }
                                                }}
                                            >
                                                <View style={[
                                                    styles.actionButton,
                                                    { backgroundColor: action.bgColor, width: itemWidth }
                                                ]}>
                                                    {/* Decorative Graphics */}
                                                    <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                                                    <View style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' }} />
                                                    <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                                                        <action.icon size={22} color={action.color} />
                                                        {action.badge && (
                                                            <View style={styles.badgeContainer}>
                                                                <Text style={styles.badgeText}>{action.badge > 99 ? '99+' : action.badge}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={styles.actionLabel} numberOfLines={1}>
                                                        {action.label}
                                                    </Text>
                                                </View>
                                            </HapticTouchable>
                                        </Animated.View>
                                    );
                                })}
                            </View>
                        </Animated.View>
                    ))
                }
                {/* Upcoming Events */}
                <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Events</Text>
                        <HapticTouchable>
                            <Text style={styles.seeAll}>See All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.eventsContainer}>
                        {upcomingEvents && upcomingEvents.length > 0 ? (
                            upcomingEvents.map((event, index) => (
                                <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                    <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/calendarscreen', params: { eventid: event.id } })}>
                                        <View style={styles.eventCard}>
                                            <View style={[styles.eventIcon, { backgroundColor: event.color + '20' }]}>
                                                <Text style={styles.eventEmoji}>{event.icon}</Text>
                                            </View>
                                            <View style={styles.eventInfo}>
                                                <Text style={styles.eventTitle}>{event.title}</Text>
                                                <View style={styles.eventDate}>
                                                    <Calendar size={14} color="#666" />
                                                    <Text style={styles.eventDateText}>{event.date}</Text>
                                                </View>
                                            </View>
                                            <ChevronRight size={20} color="#999" />
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={{ alignItems: 'center', padding: 20, backgroundColor: '#f9f9f9', borderRadius: 12 }}>
                                <PartyPopperIcon size={40} color="#10b981" style={{ marginBottom: 8 }} />
                                <Text style={{ color: '#666', fontSize: 14, fontWeight: '500' }}>You are all caught up!</Text>
                                <Text style={{ color: '#999', fontSize: 12 }}>No upcoming events.</Text>
                            </View>
                        )}
                    </View>
                </Animated.View>
                {/* Recent Notices */}
                <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recent Notices</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                            <Text style={styles.seeAll}>View All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.noticesContainer}>
                        {notices && notices.length > 0 ? (
                            notices.map((notice, index) => (
                                <Animated.View
                                    key={notice.id}
                                    entering={FadeInRight.delay(900 + index * 100).duration(500)}
                                >
                                    <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                                        <View style={styles.noticeCard}>
                                            <View style={styles.noticeLeft}>
                                                <View style={[styles.noticeIcon, notice.unread && styles.unreadIcon]}>
                                                    <Bell size={16} color={notice.unread ? '#0469ff' : '#999'} />
                                                </View>
                                                <View style={styles.noticeInfo}>
                                                    <Text style={[styles.noticeTitle, notice.unread && styles.unreadTitle]}>
                                                        {notice.title}
                                                    </Text>

                                                    <Text style={styles.noticeTime}>{notice.time}</Text>
                                                </View>
                                            </View>
                                            {notice.unread && <View style={styles.unreadDot} />}
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <View style={{ alignItems: 'center', padding: 20, backgroundColor: '#f9f9f9', borderRadius: 12 }}>
                                <PartyPopperIcon size={40} color="#10b981" style={{ marginBottom: 8 }} />
                                <Text style={{ color: '#666', fontSize: 14, fontWeight: '500' }}>You are all caught up!</Text>
                                <Text style={{ color: '#999', fontSize: 12 }}>No recent notices.</Text>
                            </View>
                        )}
                    </View>
                </Animated.View>

                {/* Bottom Spacer */}
                <View style={{ height: 100 }} />

                {/* Add Child Modal */}
                <AddChildModal
                    visible={showAddChildModal}
                    onClose={() => setShowAddChildModal(false)}
                    parentId={parentId}
                    schoolId={schoolId}
                    onSuccess={handleAddChildSuccess}
                />
            </Animated.ScrollView >
        );
    };


    // === DRIVER VIEW ===

    // === DIRECTOR VIEW ===
    const DirectorView = ({ refreshing, onRefresh, schoolId, userId, header, refreshOffset, navigateOnce }) => {
        // Fetch academic years first (like admin web dashboard)
        const { data: academicYears, isLoading: isLoadingYears } = useQuery({
            queryKey: ['academic-years', schoolId],
            queryFn: async () => {
                const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
                return Array.isArray(res.data) ? res.data : (res.data?.academicYears || []);
            },
            enabled: !!schoolId,
            ...CACHE_CONFIG.STATIC,
        });

        // Get active academic year from fetched data
        const academicYearId = academicYears?.find(ay => ay.isActive)?.id;

        console.log('🎯 DirectorView Debug:', {
            schoolId,
            academicYearId,
            academicYears,
            queryEnabled: !!schoolId
        });

        // Fetch dashboard stats with TanStack Query
        const { data: apiStats, isLoading, error } = useQuery({
            queryKey: QUERY_KEYS.dashboardOverview(schoolId, academicYearId),
            queryFn: async () => {
                console.log('📡 Fetching dashboard data with academicYearId:', academicYearId);
                const res = await api.get(
                    `/schools/${schoolId}/dashboard/overview`,
                    { params: { academicYearId: academicYearId || undefined } }
                );
                console.log('✅ Dashboard data received:', res.data);
                return res.data;
            },
            staleTime: 60 * 1000, // 1 minute
            cacheTime: 5 * 60 * 1000, // 5 minutes
            refetchOnWindowFocus: true,
            refetchInterval: 2 * 60 * 1000, // Background refetch every 2min
            enabled: !!schoolId && !!academicYearId, // Wait for academicYearId
            onError: (err) => {
                console.error('❌ Dashboard API error:', err);
            }
        });
        // Fetch detailed fee dashboard data
        const { data: feeStats } = useQuery({
            queryKey: ['fee-dashboard', schoolId, academicYearId],
            queryFn: async () => {
                const res = await api.get('/schools/fee/admin/dashboard', {
                    params: { schoolId, academicYearId }
                });
                return res.data;
            },
            enabled: !!schoolId && !!academicYearId,
            staleTime: 60 * 1000,
        });

        // Combined loading state for both academic years and dashboard data
        const isFetching = isLoadingYears || isLoading || (!academicYearId && !!schoolId);

        // Smart currency formatter (abbreviated for small cards)
        const formatCurrency = (amount) => {
            if (amount === 0) return '₹0';
            if (amount < 1000) return `₹${amount}`;
            if (amount < 100000) return `₹${(amount / 1000).toFixed(1)}K`; // Thousands
            if (amount < 10000000) return `₹${(amount / 100000).toFixed(1)}L`; // Lakhs
            return `₹${(amount / 10000000).toFixed(1)}Cr`; // Crores
        };

        // Exact currency formatter for fees (shows full amount up to lakhs, then abbreviates)
        const formatExactCurrency = (amount) => {
            if (amount === 0 || !amount) return '₹0';
            if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`; // 1 Crore+
            return `₹${amount.toLocaleString('en-IN')}`; // Show exact: ₹7,44,000
        };

        // Fetch notices for director
        const { data: recentNotices } = useQuery({
            queryKey: ['director-notices', schoolId, userId],
            queryFn: async () => {
                if (!schoolId || !userId) return { notices: [] };
                const res = await api.get(`/notices/${schoolId}?userId=${userId}&limit=4&page=1`);
                return res.data;
            },
            enabled: !!schoolId && !!userId,
            ...CACHE_CONFIG.MODERATE,
        });

        const notices = recentNotices?.notices?.map((n) => ({
            id: n.id,
            title: n.title,
            time: new Date(n.createdAt).toLocaleString(),
            unread: !n.read,
        })) || [];

        // Map API data to dashboard cards
        const dashboardStats = apiStats ? [
            {
                label: 'Students Present',
                value: apiStats.students.present.toString(),
                subtext: `of ${apiStats.students.total} • ${apiStats.attendance.percentage}%`,
                icon: UserCheck,
                color: '#10B981',
                bgColor: '#D1FAE5',
                href: '/attendance/view'
            },
            {
                label: 'Staff Present',
                value: apiStats.teachers.present.toString(),
                subtext: `of ${apiStats.teachers.total} total staff`,
                icon: User,
                color: '#8B5CF6',
                bgColor: '#F5F3FF',
                href: '/director/teachers'
            },
            {
                label: 'Fees Expected',
                value: formatExactCurrency(feeStats?.summary?.totalExpected || 0),
                subtext: `${feeStats?.summary?.collectionPercentage || 0}% collected`,
                icon: DollarSign,
                color: '#10B981',
                bgColor: '#D1FAE5',
                href: '/director/fees-collected'
            },
            {
                label: 'Fees Collected',
                value: formatExactCurrency(feeStats?.summary?.totalCollected || apiStats.fees.collected),
                subtext: 'This year',
                icon: DollarSign,
                color: '#F59E0B',
                bgColor: '#FFFBEB',
                href: '/director/fees-collected'
            },
            {
                label: 'Fees Due',
                value: formatExactCurrency(feeStats?.summary?.totalBalance || 0),
                subtext: `${feeStats?.statusCounts?.unpaid || 0} unpaid students`,
                icon: Wallet,
                color: '#EF4444',
                bgColor: '#FEF2F2',
                href: '/director/fees-pending'
            },
            {
                label: 'Payroll Due',
                value: formatCurrency(apiStats.payroll.pending),
                subtext: 'Pending approval',
                icon: DollarSign,
                color: '#EC4899',
                bgColor: '#FDF2F8',
                href: '/director/payroll'
            },
            {
                label: 'Library Books',
                value: apiStats.library.totalBooks.toString(),
                subtext: `${apiStats.library.issued} issued`,
                icon: BookOpen,
                color: '#0EA5E9',
                bgColor: '#F0F9FF',
                href: '/director/library'
            },
            {
                label: 'Inventory Items',
                value: apiStats.inventory.totalItems.toString(),
                subtext: `${apiStats.inventory.lowStock} low stock`,
                icon: ClipboardList,
                color: '#8B5CF6',
                bgColor: '#F5F3FF',
                href: '/director/inventory'
            },
            {
                label: 'Active Buses',
                value: apiStats.transport.totalBuses.toString(),
                subtext: `${apiStats.transport.activeRoutes} on route`,
                icon: Bus,
                color: '#F59E0B',
                bgColor: '#FFFBEB',
                href: '/director/transport'
            },
        ] : [];

        return (
            <ScrollView
                style={styles.container}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                        colors={['#0469ff']}
                        progressViewOffset={refreshOffset}
                    />
                }
            >
                {header}
                {/* School Banner Carousel */}
                <BannerCarousel schoolId={schoolId} role={user_acc?.role?.name} />

                {/* Dashboard Stats */}
                <View style={styles.dashboardSection}>
                    <Text style={styles.dashboardSectionTitle}>Dashboard Overview</Text>
                    <View style={styles.statsCardGrid}>
                        {isFetching ? (
                            // Loading skeleton
                            [...Array(9)].map((_, index) => (
                                <View key={`skeleton-${index}`} style={[styles.statDataCard, { backgroundColor: '#F3F4F6' }]}>
                                    <View style={styles.statDataHeader}>
                                        <View style={[styles.statDataIconContainer, { backgroundColor: '#E5E7EB' }]} />
                                        <View style={{ flex: 1, height: 10, backgroundColor: '#E5E7EB', borderRadius: 4 }} />
                                    </View>
                                    <View style={{ height: 24, backgroundColor: '#E5E7EB', borderRadius: 4, marginBottom: 4 }} />
                                    <View style={{ height: 10, backgroundColor: '#E5E7EB', borderRadius: 4, width: '60%' }} />
                                </View>
                            ))
                        ) : dashboardStats.length > 0 ? (
                            dashboardStats.map((stat, index) => (
                                <HapticTouchable
                                    key={index}
                                    onPress={() => stat.href && navigateOnce({ pathname: stat.href, params: { schoolId } })}
                                    disabled={!stat.href}
                                >
                                    <View style={[styles.statDataCard, { backgroundColor: stat.bgColor }]}>
                                        <View style={styles.statDataHeader}>
                                            <View style={[styles.statDataIconContainer, { backgroundColor: stat.color + '20' }]}>
                                                <stat.icon size={20} color={stat.color} />
                                            </View>
                                            <Text style={styles.statDataLabel}>{stat.label}</Text>
                                        </View>
                                        <Text style={[styles.statDataValue, { color: stat.color }]}>{stat.value}</Text>
                                        <Text style={styles.statDataSubtext}>{stat.subtext}</Text>
                                    </View>
                                </HapticTouchable>
                            ))
                        ) : (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <Text style={{ color: '#9CA3AF' }}>No data available</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Quick Actions */}
                <View style={styles.dashboardSection}>
                    <Text style={styles.dashboardSectionTitle}>Quick Actions</Text>
                    <View style={styles.actionsGrid3x3}>
                        {[
                            { icon: Calendar, label: 'Leave Mgmt', color: '#8B5CF6', bgColor: '#F5F3FF', href: '/(screens)/director/leave-management' },
                            { icon: Users, label: 'Manage Staff', color: '#10B981', bgColor: '#D1FAE5', href: '/(screens)/director/teachers' },
                            { icon: GraduationCap, label: 'Students', color: '#0EA5E9', bgColor: '#F0F9FF', href: '/(screens)/director/students' },
                            { icon: Bell, label: 'Broadcast', color: '#F59E0B', bgColor: '#FFFBEB', href: '/(screens)/director/broadcast' },
                            { icon: CheckCircle2, label: 'Approvals', color: '#EC4899', bgColor: '#FDF2F8', href: '/(screens)/principal/approvals' },
                            {
                                icon: Calendar,
                                label: 'School Calendar',
                                color: '#4CAF50',     // green icon
                                bgColor: '#E8F5E9',   // light green background
                                href: "/(screens)/calendarscreen"
                            },
                        ].map((action, index) => (
                            <HapticTouchable key={action.label} onPress={() => action.href && navigateOnce(action.href)} disabled={!action.href}>
                                <View style={[styles.actionButton3x3, { backgroundColor: action.bgColor, opacity: action.href ? 1 : 0.5 }]}>
                                    <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                                        <action.icon size={22} color={action.color} />
                                    </View>
                                    <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
                                </View>
                            </HapticTouchable>
                        ))}
                    </View>
                </View>

                {/* Upcoming Events */}
                <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Events</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(screens)/calendarscreen')}>
                            <Text style={styles.seeAll}>See All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.eventsContainer}>
                        {upcomingEvents && upcomingEvents.length > 0 ? (
                            upcomingEvents.slice(0, 4).map((event, index) => (
                                <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                    <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/calendarscreen', params: { eventid: event.id } })}>
                                        <View style={styles.eventCard}>
                                            <View style={[styles.eventIcon, { backgroundColor: event.color + '20' }]}>
                                                <Text style={styles.eventEmoji}>{event.icon}</Text>
                                            </View>
                                            <View style={styles.eventInfo}>
                                                <Text style={styles.eventTitle}>{event.title}</Text>
                                                <View style={styles.eventDate}>
                                                    <Calendar size={14} color="#666" />
                                                    <Text style={styles.eventDateText}>{event.date}</Text>
                                                </View>
                                            </View>
                                            <ChevronRight size={20} color="#999" />
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(700).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    You're all caught up!
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>
                {/* Recent Notices */}
                <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recent Notices</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                            <Text style={styles.seeAll}>View All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.noticesContainer}>
                        {notices && notices.length > 0 ? (
                            notices.map((notice, index) => (
                                <Animated.View
                                    key={notice.id}
                                    entering={FadeInRight.delay(900 + index * 100).duration(500)}
                                >
                                    <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                                        <View style={styles.noticeCard}>
                                            <View style={styles.noticeLeft}>
                                                <View style={[styles.noticeIcon, notice.unread && styles.unreadIcon]}>
                                                    <Bell size={16} color={notice.unread ? '#0469ff' : '#999'} />
                                                </View>
                                                <View style={styles.noticeInfo}>
                                                    <Text style={[styles.noticeTitle, notice.unread && styles.unreadTitle]} numberOfLines={1}>
                                                        {notice.title}
                                                    </Text>
                                                    <Text style={styles.noticeTime}>
                                                        {notice.time}
                                                    </Text>
                                                </View>
                                            </View>
                                            {notice.unread && <View style={styles.unreadDot} />}
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(900).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    No notices yet
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>

                {/* Bottom Spacer */}
                <View style={{ height: 100 }} />
            </ScrollView>
        );
    };


    // === PRINCIPAL VIEW ===
    const PrincipalView = ({ refreshing, onRefresh, schoolId, userId, header, refreshOffset, navigateOnce }) => {
        // Fetch academic years first (like admin web dashboard)
        const { data: academicYears, isLoading: isLoadingYears } = useQuery({
            queryKey: ['academic-years', schoolId],
            queryFn: async () => {
                const res = await api.get(`/schools/academic-years?schoolId=${schoolId}`);
                return Array.isArray(res.data) ? res.data : (res.data?.academicYears || []);
            },
            enabled: !!schoolId,
            ...CACHE_CONFIG.STATIC,
        });

        // Get active academic year from fetched data
        const academicYearId = academicYears?.find(ay => ay.isActive)?.id;

        // Fetch dashboard stats with TanStack Query
        const { data: apiStats, isLoading, error } = useQuery({
            queryKey: QUERY_KEYS.dashboardOverview(schoolId, academicYearId),
            queryFn: async () => {
                const res = await api.get(
                    `/schools/${schoolId}/dashboard/overview`,
                    { params: { academicYearId: academicYearId || undefined } }
                );
                return res.data;
            },
            staleTime: 60 * 1000,
            cacheTime: 5 * 60 * 1000,
            refetchOnWindowFocus: true,
            refetchInterval: 2 * 60 * 1000,
            enabled: !!schoolId && !!academicYearId, // Wait for academicYearId
        });

        // Combined loading state for both academic years and dashboard data
        const isFetching = isLoadingYears || isLoading || (!academicYearId && !!schoolId);

        // Smart currency formatter
        const formatCurrency = (amount) => {
            if (amount === 0) return '₹0';
            if (amount < 1000) return `₹${amount}`;
            if (amount < 100000) return `₹${(amount / 1000).toFixed(1)}K`;
            if (amount < 10000000) return `₹${(amount / 100000).toFixed(1)}L`;
            return `₹${(amount / 10000000).toFixed(1)}Cr`;
        };

        // Fetch notices for principal
        const { data: recentNotices } = useQuery({
            queryKey: ['principal-notices', schoolId, userId],
            queryFn: async () => {
                if (!schoolId || !userId) return { notices: [] };
                const res = await api.get(`/notices/${schoolId}?userId=${userId}&limit=4&page=1`);
                return res.data;
            },
            enabled: !!schoolId && !!userId,
            ...CACHE_CONFIG.MODERATE,
        });

        const notices = recentNotices?.notices?.map((n) => ({
            id: n.id,
            title: n.title,
            time: new Date(n.createdAt).toLocaleString(),
            unread: !n.read,
        })) || [];

        // Map API data to dashboard cards (Principal-specific view)
        const dashboardStats = apiStats ? [
            {
                label: 'Students Present',
                value: apiStats.students.present.toString(),
                subtext: `of ${apiStats.students.total} • ${apiStats.attendance.percentage}%`,
                icon: UserCheck,
                color: '#10B981',
                bgColor: '#D1FAE5',
                href: '/attendance/view'
            },
            {
                label: 'Staff Present',
                value: apiStats.teachers.present.toString(),
                subtext: `of ${apiStats.teachers.total} total staff`,
                icon: User,
                color: '#8B5CF6',
                bgColor: '#F5F3FF',
                href: '/director/teachers'
            },
            {
                label: 'Students Absent',
                value: apiStats.students.absent.toString(),
                subtext: `${(100 - apiStats.attendance.percentage).toFixed(1)}% absent rate`,
                icon: X,
                color: '#EF4444',
                bgColor: '#FEF2F2',
                href: '/attendance/absent'
            },
            {
                label: 'Payroll Approval',
                value: apiStats.payroll.approvalCount.toString(),
                subtext: 'Pending review',
                icon: DollarSign,
                color: '#F59E0B',
                bgColor: '#FFFBEB',
                href: '/director/payroll'
            },
            {
                label: 'Library Requests',
                value: apiStats.library.approvalRequests.toString(),
                subtext: 'Need approval',
                icon: BookOpen,
                color: '#0EA5E9',
                bgColor: '#F0F9FF',
                href: '/director/library'
            },
            {
                label: 'Active Classes',
                value: apiStats.academics.totalClasses.toString(),
                subtext: `${apiStats.academics.activeNow} in session`,
                icon: Book,
                color: '#8B5CF6',
                bgColor: '#F5F3FF',
                href: '/classes'
            },
            {
                label: 'Exam Schedule',
                value: apiStats.academics.examsThisWeek.toString(),
                subtext: 'This week',
                icon: Calendar,
                color: '#EC4899',
                bgColor: '#FDF2F8',
                href: '/exams'
            },
            {
                label: 'Active Buses',
                value: apiStats.transport.totalBuses.toString(),
                subtext: `${apiStats.transport.activeRoutes} on route`,
                icon: Bus,
                color: '#F59E0B',
                bgColor: '#FFFBEB',
                href: '/director/transport'
            },
        ] : [];

        return (
            <ScrollView
                style={styles.container}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                        colors={['#0469ff']}
                        progressViewOffset={refreshOffset}
                    />
                }
            >
                {header}
                <BannerCarousel schoolId={schoolId} role={user_acc?.role?.name} />
                {/* Dashboard Stats */}
                <View style={styles.dashboardSection}>
                    <Text style={styles.dashboardSectionTitle}>Dashboard Overview</Text>
                    <View style={styles.statsCardGrid}>
                        {isFetching ? (
                            // Loading skeleton
                            [...Array(9)].map((_, index) => (
                                <View key={`skeleton-${index}`} style={[styles.statDataCard, { backgroundColor: '#F3F4F6' }]}>
                                    <View style={styles.statDataHeader}>
                                        <View style={[styles.statDataIconContainer, { backgroundColor: '#E5E7EB' }]} />
                                        <View style={{ flex: 1, height: 10, backgroundColor: '#E5E7EB', borderRadius: 4 }} />
                                    </View>
                                    <View style={{ height: 24, backgroundColor: '#E5E7EB', borderRadius: 4, marginBottom: 4 }} />
                                    <View style={{ height: 10, backgroundColor: '#E5E7EB', borderRadius: 4, width: '60%' }} />
                                </View>
                            ))
                        ) : dashboardStats.length > 0 ? (
                            dashboardStats.map((stat, index) => (
                                <HapticTouchable
                                    key={index}
                                    onPress={() => stat.href && navigateOnce({ pathname: stat.href, params: { schoolId } })}
                                    disabled={!stat.href}
                                >
                                    <View style={[styles.statDataCard, { backgroundColor: stat.bgColor }]}>
                                        <View style={styles.statDataHeader}>
                                            <View style={[styles.statDataIconContainer, { backgroundColor: stat.color + '20' }]}>
                                                <stat.icon size={20} color={stat.color} />
                                            </View>
                                            <Text style={styles.statDataLabel}>{stat.label}</Text>
                                        </View>
                                        <Text style={[styles.statDataValue, { color: stat.color }]}>{stat.value}</Text>
                                        <Text style={styles.statDataSubtext}>{stat.subtext}</Text>
                                    </View>
                                </HapticTouchable>
                            ))
                        ) : (
                            <View style={{ padding: 20, alignItems: 'center' }}>
                                <Text style={{ color: '#9CA3AF' }}>No data available</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Quick Actions */}
                <View style={styles.dashboardSection}>
                    <Text style={styles.dashboardSectionTitle}>Quick Actions</Text>
                    <View style={styles.actionsGrid3x3}>
                        {[
                            { icon: Calendar, label: 'Leave Mgmt', color: '#8B5CF6', bgColor: '#F5F3FF', href: '/(screens)/principal/leave-management' },
                            { icon: CheckCircle2, label: 'Approvals', color: '#10B981', bgColor: '#D1FAE5', href: '/(screens)/principal/approvals' },
                            { icon: Users, label: 'Staff', color: '#0EA5E9', bgColor: '#F0F9FF', href: '/(screens)/director/teachers' },
                            { icon: GraduationCap, label: 'Students', color: '#F59E0B', bgColor: '#FFFBEB', href: '/(screens)/director/students' },
                            { icon: Bell, label: 'Broadcast', color: '#EC4899', bgColor: '#FDF2F8', href: '/(screens)/director/broadcast' },
                            { icon: Settings, label: 'Settings', color: '#64748B', bgColor: '#F1F5F9', href: '/profile' },
                        ].map((action, index) => (
                            <HapticTouchable key={action.label} onPress={() => action.href && navigateOnce(action.href)} disabled={!action.href}>
                                <View style={[styles.actionButton3x3, { backgroundColor: action.bgColor, opacity: action.href ? 1 : 0.5 }]}>
                                    <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                                        <action.icon size={22} color={action.color} />
                                    </View>
                                    <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
                                </View>
                            </HapticTouchable>
                        ))}
                    </View>
                </View>

                {/* Upcoming Events */}
                <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Events</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(screens)/calendarscreen')}>
                            <Text style={styles.seeAll}>See All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.eventsContainer}>
                        {upcomingEvents && upcomingEvents.length > 0 ? (
                            upcomingEvents.slice(0, 4).map((event, index) => (
                                <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                    <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/calendarscreen', params: { eventid: event.id } })}>
                                        <View style={styles.eventCard}>
                                            <View style={[styles.eventIcon, { backgroundColor: event.color + '20' }]}>
                                                <Text style={styles.eventEmoji}>{event.icon}</Text>
                                            </View>
                                            <View style={styles.eventInfo}>
                                                <Text style={styles.eventTitle}>{event.title}</Text>
                                                <View style={styles.eventDate}>
                                                    <Calendar size={14} color="#666" />
                                                    <Text style={styles.eventDateText}>{event.date}</Text>
                                                </View>
                                            </View>
                                            <ChevronRight size={20} color="#999" />
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(700).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    You're all caught up!
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>
                {/* Recent Notices */}
                <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recent Notices</Text>
                        <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                            <Text style={styles.seeAll}>View All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.noticesContainer}>
                        {notices && notices.length > 0 ? (
                            notices.map((notice, index) => (
                                <Animated.View
                                    key={notice.id}
                                    entering={FadeInRight.delay(900 + index * 100).duration(500)}
                                >
                                    <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                                        <View style={styles.noticeCard}>
                                            <View style={styles.noticeLeft}>
                                                <View style={[styles.noticeIcon, notice.unread && styles.unreadIcon]}>
                                                    <Bell size={16} color={notice.unread ? '#0469ff' : '#999'} />
                                                </View>
                                                <View style={styles.noticeInfo}>
                                                    <Text style={[styles.noticeTitle, notice.unread && styles.unreadTitle]} numberOfLines={1}>
                                                        {notice.title}
                                                    </Text>
                                                    <Text style={styles.noticeTime}>
                                                        {notice.time}
                                                    </Text>
                                                </View>
                                            </View>
                                            {notice.unread && <View style={styles.unreadDot} />}
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            ))
                        ) : (
                            <Animated.View
                                entering={FadeInRight.delay(900).duration(500)}
                                style={{
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    paddingVertical: 20,
                                    opacity: 0.8,
                                }}
                            >
                                <CheckCircle2 size={26} color="#0469ff" />
                                <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                    No notices yet
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>

                {/* Bottom Spacer */}
                <View style={{ height: 100 }} />
            </ScrollView>
        );
    };

    // Collapsible Header Logic


    return (
        <View style={styles.container} edges={['top']}>
            <StatusBar style="light" />
            <Animated.View style={[{ zIndex: 100, position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_MAX_HEIGHT }, headerAnimatedStyle]}>
                {/* Dynamically render header content with animations */}
                {(() => {
                    const roleKey = user_acc?.role?.name?.toLowerCase() ?? '';
                    const config = uiData.header[roleKey] || uiData.header.student;
                    const title = replaceDynamic(config.title, roleKey);
                    const subtitle = config.subtitle.map((item, i) => replaceDynamic(item.text, roleKey)).join(' • '); // Simplification for demo

                    const icons = config.icons.map((key, i) => {
                        const Icon = IconMap[key];
                        if (!Icon) return null;
                        const isBell = key === 'bell';
                        const isRefresh = key === 'refresh';
                        return (
                            <HapticTouchable key={i} onPress={isBell ? () => navigateOnce('(screens)/notification') : isRefresh ? onRefresh : undefined}>
                                <View style={[styles.iconButton, { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }]}>
                                    <Icon size={isSmallDevice ? 18 : 20} color="#0469ff" />
                                    {isBell && unreadCount > 0 && (
                                        <View style={[styles.badge, { backgroundColor: '#FF6B6B' }]}>
                                            <Text style={[styles.badgeText, { color: '#fff', fontSize: 10 }]}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                                        </View>
                                    )}
                                </View>
                            </HapticTouchable>
                        );
                    });

                    return (
                        <LinearGradient colors={['#0469ff', '#0256d0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { width: '100%', borderBottomLeftRadius: 30, borderBottomRightRadius: 30, paddingTop: isSmallDevice ? 30 : 40, paddingBottom: 0, height: '100%' }]}>
                            {/* Background Pattern */}
                            <Text style={{ position: 'absolute', top: -10, right: 80, fontSize: 40, color: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}>+</Text>
                            <Text style={{ position: 'absolute', top: 50, right: 30, fontSize: 24, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>×</Text>
                            <View style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)' }} />

                            <View style={[styles.headerLeft, { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 20 }]}>
                                <HapticTouchable onPress={() => navigateOnce('(tabs)/profile')}>
                                    <Animated.View style={[avatarAnimatedStyle, {
                                        backgroundColor: '#f0f0f0',
                                        borderWidth: 2.5,
                                        borderColor: '#fff',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        overflow: 'hidden',
                                    }]}>
                                        {user_acc?.profilePicture && user_acc.profilePicture !== 'default.png' ? (
                                            <Image source={{ uri: user_acc.profilePicture }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                                        ) : (
                                            <Text style={{ color: '#0469ff', fontSize: 22, fontWeight: '700' }}>
                                                {getInitials(user_acc?.parentData?.name || user_acc?.name || 'User') || 'U'}
                                            </Text>
                                        )}
                                    </Animated.View>
                                </HapticTouchable>

                                <View style={[styles.headerInfo, { marginLeft: 12, flex: 1, justifyContent: 'center' }]}>
                                    <Animated.View style={headerContentOpacity}>
                                        <Text style={[styles.welcomeText, { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' }]}>{getGreeting()},</Text>
                                    </Animated.View>
                                    <Animated.View style={headerNameStyle}>
                                        <Text style={[styles.name, { color: '#fff', fontSize: 18, marginTop: 2 }]} numberOfLines={1}>{title}</Text>
                                        <Text style={[styles.parentEmail, { marginTop: 4, color: 'rgba(255,255,255,0.7)', fontSize: 12 }]} numberOfLines={1}>
                                            {user_acc?.email || user_acc?.parentData?.email || 'test@email.com'}
                                        </Text>
                                    </Animated.View>
                                </View>

                                <Animated.View style={[{ flexDirection: 'row', gap: 10 }, headerIconsTranslate]}>
                                    {icons}
                                </Animated.View>
                            </View>
                        </LinearGradient>
                    );
                })()}
            </Animated.View>

            {/* Today's Events (if any) */}
            {renderContent()}
            {activeTripBanner}
        </View>
    );
}


// === STYLES ===
const styles = StyleSheet.create({
    activeTripFloatingBanner: {
        position: 'absolute',
        bottom: 90, // Above bottom tabs
        left: 16,
        right: 16,
        backgroundColor: '#10B981',
        borderRadius: 16,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
        zIndex: 100,
    },
    activeTripContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    activeTripIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        position: 'relative',
    },
    pulseDot: {
        position: 'absolute',
        top: 0,
        right: 0,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#EF4444',
        borderWidth: 1.5,
        borderColor: '#10B981',
    },
    activeTripInfo: {
        flex: 1,
    },
    activeTripTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    activeTripSubtitle: {
        color: 'rgba(255,255,255,0.9)',
        fontSize: 12,
        marginTop: 2,
    },
    activeTripArrow: {
        marginLeft: 8,
    },
    container: { flex: 1, backgroundColor: '#fff' },
    schoolBadge: {
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 8,
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: '#F3F4F6',
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    schoolBadgeText: {
        fontSize: 14,
        color: '#6B7280',
        fontWeight: '600',
    },
    dashboardSection: {
        marginHorizontal: 16,
        marginBottom: 20,
        marginTop: 20,
    },
    dashboardSectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#6B7280',
        marginBottom: 16,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    statsCardGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    statDataCard: {
        width: (SCREEN_WIDTH - 56) / 2,
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#00000008',
    },
    statDataHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    statDataIconContainer: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    statDataLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#6B7280',
        flex: 1,
    },
    statDataValue: {
        fontSize: 24,
        fontWeight: '700',
        marginBottom: 2,
    },
    statDataSubtext: {
        fontSize: 11,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: isSmallDevice ? 12 : 16,
        paddingBottom: 8,
        paddingTop: 8,
        // borderBottomColor: '#f0f0f0',
        // borderBottomWidth: 1,
        // backgroundColor removed - LinearGradient provides the background
    },
    // Notification Permission Banner Styles
    permissionBanner: {
        marginHorizontal: 16,
        marginTop: 12,
        backgroundColor: '#FFFBEB',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FDE68A',
        padding: 14,
    },
    permissionBannerContent: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
    },
    permissionIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FEF3C7',
        alignItems: 'center',
        justifyContent: 'center',
    },
    permissionTextContainer: {
        flex: 1,
    },
    permissionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#92400E',
        marginBottom: 4,
    },
    permissionDesc: {
        fontSize: 13,
        color: '#A16207',
        lineHeight: 18,
    },
    permissionActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: 12,
        gap: 12,
    },
    permissionDismiss: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    permissionDismissText: {
        fontSize: 14,
        color: '#92400E',
        fontWeight: '500',
    },
    permissionAllow: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        backgroundColor: '#F59E0B',
        borderRadius: 8,
    },
    permissionAllowText: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '600',
    },
    // Add these styles to your existing StyleSheet.create() in your styles file
    // Merge these with your existing styles object

    // ADD TO YOUR EXISTING STYLES:

    // Delegation Banner Styles
    delegationBannerContainer: {
        paddingHorizontal: isSmallDevice ? 12 : 16,
        paddingTop: 16,
        gap: 12,
    },
    delegationBanner: {
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#0469ff',
        shadowColor: '#0469ff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    delegationBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    delegationBannerIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    delegationBannerText: {
        flex: 1,
    },
    delegationBannerTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    delegationBannerSubtitle: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.95)',
        fontWeight: '500',
        marginBottom: 6,
    },
    delegationBannerDate: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    delegationBannerDateText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.9)',
    },
    delegationBannerClose: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    delegationBannerContainer: {
        paddingHorizontal: isSmallDevice ? 12 : 16,
        paddingTop: 16,
        gap: 12,
    },
    delegationBanner: {
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#0469ff',
        shadowColor: '#0469ff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    delegationBannerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    delegationBannerIcon: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    delegationBannerText: {
        flex: 1,
    },
    delegationBannerTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    delegationBannerSubtitle: {
        fontSize: 13,
        color: 'rgba(255, 255, 255, 0.95)',
        fontWeight: '500',
        marginBottom: 6,
    },
    delegationBannerDate: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    delegationBannerDateText: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.9)',
    },
    delegationBannerClose: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: isSmallDevice ? 8 : 12,
        flex: 1,
        marginRight: 8,
    },
    userInfo: { flex: 1, minWidth: 0 },
    avatar: {
        width: isSmallDevice ? 44 : 50,
        height: isSmallDevice ? 44 : 50,
        borderRadius: isSmallDevice ? 22 : 25,
        backgroundColor: '#eee',
    },
    fallbackAvatar: { backgroundColor: '#ccc', justifyContent: 'center', alignItems: 'center' },
    fallbackText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    name: {
        fontSize: isSmallDevice ? 17 : 19,
        fontWeight: '700',
        color: '#111',
        marginTop: 1,
    },
    roleRow: { flexDirection: 'row', gap: 5, alignItems: 'center', flexWrap: 'nowrap' },
    role: { fontSize: isSmallDevice ? 11 : 13, color: '#666', flexShrink: 1 },
    separator: { fontSize: isSmallDevice ? 11 : 13, color: '#666' },
    school: { fontSize: isSmallDevice ? 11 : 13, color: '#666', flexShrink: 1 },
    iconRow: { flexDirection: 'row', gap: isSmallDevice ? 6 : 8, flexShrink: 0 },
    iconButton: {
        width: isSmallDevice ? 36 : 38,
        height: isSmallDevice ? 36 : 38,
        borderRadius: isSmallDevice ? 18 : 19,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#ff4444',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
    },
    badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
    content: { flex: 1, padding: isSmallDevice ? 12 : 16 },
    examCard: { borderRadius: 16, padding: isSmallDevice ? 16 : 20, marginBottom: 20 },
    examContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    examTextContainer: { flex: 1, marginRight: 12 },
    examTitle: { fontSize: isSmallDevice ? 18 : 20, fontWeight: '700', color: '#fff', marginBottom: 4 },
    examDate: { fontSize: isSmallDevice ? 12 : 13, color: '#fff', opacity: 0.9, marginBottom: 8 },
    examSubject: { fontSize: isSmallDevice ? 14 : 15, color: '#fff', fontWeight: '500' },
    examIcon: {
        width: isSmallDevice ? 50 : 60,
        height: isSmallDevice ? 50 : 60,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: isSmallDevice ? 25 : 30,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    examEmoji: { fontSize: isSmallDevice ? 28 : 32 },
    section: { marginBottom: 30 },
    quickAccessScrollView: { marginLeft: isSmallDevice ? -12 : -16, paddingLeft: isSmallDevice ? 12 : 16 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sectionTitle: { fontSize: isSmallDevice ? 16 : 18, fontWeight: '600', color: '#111' },
    seeAll: { fontSize: isSmallDevice ? 13 : 14, color: '#0469ff', fontWeight: '500' },
    classesRow: { gap: 12, paddingRight: isSmallDevice ? 12 : 16 },
    classCard: {
        width: isSmallDevice ? SCREEN_WIDTH * 0.75 : SCREEN_WIDTH * 0.45,
        padding: isSmallDevice ? 14 : 16,
        borderRadius: 12,
        minHeight: 140,
    },
    classSubject: { fontSize: isSmallDevice ? 16 : 18, fontWeight: '600', color: '#111', marginBottom: 4 },
    classTime: { fontSize: isSmallDevice ? 12 : 13, color: '#666', marginBottom: 2 },
    classTopic: { fontSize: isSmallDevice ? 12 : 13, color: '#666', marginBottom: 12 },
    classTeacher: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto' },
    teacherAvatar: { width: 20, height: 20, borderRadius: 10 },
    teacherName: { fontSize: 12, color: '#333', flex: 1 },
    quickAccessButton: {
        paddingVertical: isSmallDevice ? 8 : 10,
        paddingHorizontal: isSmallDevice ? 16 : 20,
        borderRadius: 20,
        alignItems: 'center',
        marginRight: 8,
        minWidth: isSmallDevice ? 80 : 100,
    },
    quickAccessText: { fontSize: isSmallDevice ? 12 : 13, fontWeight: '500' },
    subjectsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
    subjectCard: {
        width: isSmallDevice ? '47.5%' : '48%',
        padding: isSmallDevice ? 14 : 16,
        borderRadius: 12,
        minHeight: 100,
    },
    subjectName: { fontSize: isSmallDevice ? 15 : 16, fontWeight: '600', color: '#111', marginBottom: 8 },
    subjectChapter: { fontSize: isSmallDevice ? 11 : 12, color: '#666', marginBottom: 4 },
    subjectSubmission: { fontSize: isSmallDevice ? 11 : 12, color: '#666' },

    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatar: {
        width: isSmallDevice ? 50 : 56,
        height: isSmallDevice ? 50 : 56,
        borderRadius: isSmallDevice ? 25 : 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    parentAvatar: {
        backgroundColor: '#0469ff',
    },
    avatarText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '700',
    },
    headerInfo: {
        flex: 1,
    },
    welcomeText: {
        fontSize: isSmallDevice ? 12 : 13,
        color: '#17b512ff',
        // fontWeight:'200',
    },
    parentName: {
        fontSize: isSmallDevice ? 17 : 19,
        fontWeight: '700',
        color: '#111',
        marginTop: 2,
    },
    parentEmail: {
        fontSize: isSmallDevice ? 11 : 12,
        color: '#999',
        marginTop: 2,
    },
    notificationButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    notificationBadge: {
        position: 'absolute',
        top: -2,
        right: -2,
        backgroundColor: '#FF6B6B',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 4,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '700',
    },
    section: {
        paddingHorizontal: isSmallDevice ? 12 : 16,
        marginTop: 12,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: isSmallDevice ? 17 : 19,
        fontWeight: '700',
        color: '#111',
    },
    childrenCount: {
        fontSize: 14,
        color: '#666',
        backgroundColor: '#f5f5f5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        fontWeight: '600',
    },
    seeAll: {
        fontSize: 14,
        color: '#0469ff',
        fontWeight: '600',
    },
    carouselContainer: {
        height: 160,
        marginTop: 12,
    },
    childrenScroll: {
        gap: 12,
        paddingRight: 16,
    },
    childCard: {
        width: isSmallDevice ? SCREEN_WIDTH * 0.7 : SCREEN_WIDTH * 0.75,
        flexDirection: 'row',
        padding: 16,
        borderRadius: 16,
        gap: 12,
        position: 'relative',
    },
    selectedChildCard: {
        shadowColor: '#0469ff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    childAvatar: {
        width: 60,
        height: 60,
        objectFit: 'center',
        objectPosition: 'center',
        borderRadius: 30,
        backgroundColor: '#eee',
    },
    childInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    childName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
        marginBottom: 4,
    },
    childClass: {
        fontSize: 13,
        color: '#666',
        marginBottom: 6,
    },
    selectedText: {
        color: '#fff',
    },
    selectedSubText: {
        color: 'rgba(255,255,255,0.9)',
    },
    childMeta: {
        flexDirection: 'row',
        gap: 6,
    },
    metaBadge: {
        backgroundColor: 'rgba(0,0,0,0.1)',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    selectedBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    metaText: {
        fontSize: 11,
        color: '#666',
        fontWeight: '600',
    },
    selectedIndicator: {
        position: 'absolute',
        top: 12,
        right: 12,
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkmark: {
        color: '#0469ff',
        fontSize: 14,
        fontWeight: '700',
    },
    updatesWidget: {
        backgroundColor: '#fff',
        borderRadius: 16,
        marginHorizontal: 16,
        marginTop: 12,
        marginBottom: 8,
        padding: 10,
        borderWidth: 1,
        borderColor: '#f0f0f0',
        gap: 6,
    },
    updateItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        backgroundColor: '#fafafa',
        borderRadius: 10,
        gap: 10,
    },
    updateIconBg: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    updateText: {
        fontSize: 13,
        color: '#333',
        fontWeight: '500',
    },
    updateTime: {
        fontSize: 11,
        color: '#888',
        marginTop: 2,
    },
    statsLoadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        paddingVertical: 40,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
    },
    statsLoadingText: {
        fontSize: 13,
        color: '#666',
        fontWeight: '500',
    },
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 2,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 20,
        minHeight: 130,
        justifyContent: 'space-between',
        overflow: 'hidden',
        position: 'relative',
    },
    statIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    statIconBg: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    statValue: {
        fontSize: 28,
        fontWeight: '800',
        color: '#fff',
        marginTop: 12,
        letterSpacing: -0.5,
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.85)',
        fontWeight: '600',
        letterSpacing: 0.3,
        marginTop: 2,
    },
    // Default 2x2 grid for most roles
    actionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 12,
    },
    actionButton: {
        // 2 columns
        width: (SCREEN_WIDTH - (isSmallDevice ? 24 : 32) - 12) / 2,
        padding: 16,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 120, // Taller for better proportions
        overflow: 'hidden',
        position: 'relative',
    },
    // 3x3 grid for Director/Principal
    actionsGrid3x3: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        marginTop: 12,
    },
    actionButton3x3: {
        width: (SCREEN_WIDTH - 40 - 20) / 3, // 3 columns
        padding: 14,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 100,
    },
    actionIcon: {
        width: 50,
        height: 50,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
    },
    actionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        textAlign: 'center',
        marginTop: 2,
        lineHeight: 18,
    },
    eventsContainer: {
        gap: 12,
    },
    eventCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        gap: 12,
    },
    eventIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    eventEmoji: {
        fontSize: 24,
    },
    eventInfo: {
        flex: 1,
    },
    eventTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
        marginBottom: 4,
    },
    eventDate: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    eventDateText: {
        fontSize: 12,
        color: '#666',
    },
    noticesContainer: {
        gap: 10,
    },
    badgeContainer: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#FF6B6B',
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
    },
    badgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    noticeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
    },
    noticeLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    noticeIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    unreadIcon: {
        backgroundColor: '#E3F2FD',
    },
    noticeInfo: {
        flex: 1,
    },
    noticeTitle: {
        fontSize: 13,
        color: '#666',
        marginBottom: 2,
    },
    unreadTitle: {
        fontWeight: '600',
        color: '#111',
    },
    noticeTime: {
        fontSize: 11,
        color: '#999',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#0469ff',
    },
    // School Card Styles
    schoolCard: {
        marginHorizontal: 16,
        marginBottom: 16,
        borderRadius: 16,
        marginTop: 20,
        overflow: 'hidden',
        backgroundColor: '#F8FAFC',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    schoolCardGradient: {
        backgroundColor: '#F8FAFC',
        padding: 16,
        // borderBottomWidth: 2,
        // borderBottomColor: '#E0E7FF',
    },
    schoolCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    schoolLogoContainer: {
        marginRight: 12,
    },
    schoolLogo: {
        width: 56,
        height: 56,
        borderRadius: 12,
        backgroundColor: '#FFFFFF',
        borderWidth: 1.5,
        borderColor: '#E0E7FF',
    },
    schoolLogoPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#EEF2FF',
    },
    schoolInfo: {
        flex: 1,
    },
    schoolName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
        marginBottom: 4,
    },
    schoolLocation: {
        fontSize: 13,
        color: '#64748B',
        flexDirection: 'row',
        alignItems: 'center',
    },
    todayEventCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        gap: 12,
        position: 'relative',
        overflow: 'hidden',
    },
    todayEventIcon: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    todayEventTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    todayEventLocation: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '500',
    },
    pulsingDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#fff',
        position: 'absolute',
        top: 16,
        right: 16,
    },
    eventLocation: {
        fontSize: 11,
        color: '#888',
        marginTop: 2,
    },

    // Student View Styles
    statsContainer: {
        flexDirection: 'row',
        paddingHorizontal: isSmallDevice ? 12 : 16,
        paddingVertical: 16,
        gap: 12,
    },
    studentStatCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 12,
        gap: 10,
    },
    studentStatIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
    },
    studentStatValue: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    studentStatLabel: {
        fontSize: 11,
        color: '#666',
    },
    quickAccessGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: isSmallDevice ? 12 : 16,
        gap: 12,
    },
    quickAccessCard: {
        width: (SCREEN_WIDTH - 56) / 3,
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        gap: 10,
    },
    quickAccessIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    quickAccessLabel: {
        fontSize: 12,
        fontWeight: '600',
        textAlign: 'center',
    },
    studentEventCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 12,
        borderLeftWidth: 4,
        marginBottom: 8,
        gap: 12,
    },
    studentEventTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    studentEventLocation: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    upcomingEventCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        padding: 12,
        marginHorizontal: isSmallDevice ? 12 : 16,
        marginBottom: 8,
        gap: 12,
    },
    upcomingEventIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    upcomingEventInfo: {
        flex: 1,
    },
    upcomingEventTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    upcomingEventDate: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
});

// === TEACHER VIEW (MOVED) ===
// === TEACHING STAFF VIEW ===
const TeacherView = memo(({ schoolId, userId, teacher, refreshing, onRefresh, upcomingEvents, todaysEvents, banner, onScroll, paddingTop, refreshOffset, navigateOnce }) => {
    const [showDelegationModal, setShowDelegationModal] = useState(false);
    const [activeDelegations, setActiveDelegations] = useState([]);
    const [shownDelegations, setShownDelegations] = useState({});
    // const queryClient = useQueryClient(); // Unused here if we don't use it directly

    // Load shown delegations from secure storage
    useEffect(() => {
        loadShownDelegations();
    }, []);

    const loadShownDelegations = async () => {
        try {
            const stored = await SecureStore.getItemAsync('delegation_shown_versions');
            if (stored) {
                setShownDelegations(JSON.parse(stored));
            }
        } catch (error) {
            console.error('Error loading shown delegations:', error);
        }
    };

    const saveDelegationAsShown = async (delegationId, version) => {
        try {
            const updated = {
                ...shownDelegations,
                [delegationId]: version
            };
            await SecureStore.setItemAsync('delegation_shown_versions', JSON.stringify(updated));
            setShownDelegations(updated);
        } catch (error) {
            console.error('Error saving delegation status:', error);
        }
    };

    // --- BATCHED QUERY FOR TEACHER DASHBOARD ---
    const { data: dashboardData, isLoading: isDashboardLoading, refetch: refetchDashboard } = useQuery({
        queryKey: ['teacher-dashboard-combined', schoolId, userId],
        queryFn: async () => {
            if (!schoolId || !userId) return null;

            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();

            const [delegationRes, noticesRes, attendanceRes, leavesRes] = await Promise.all([
                api.get(`/schools/${schoolId}/attendance/delegations/check?teacherId=${userId}`),
                api.get(`/notices/${schoolId}?userId=${userId}&limit=4&page=1`),
                api.get(`/schools/${schoolId}/attendance/stats?userId=${userId}&month=${month}&year=${year}`),
                api.get(`/schools/${schoolId}/attendance/leaves/balance?userId=${userId}`)
            ]);

            return {
                delegations: delegationRes.data,
                notices: noticesRes.data,
                attendance: attendanceRes.data,
                leaves: leavesRes.data
            };
        },
        enabled: !!schoolId && !!userId,
        ...CACHE_CONFIG.MODERATE,
    });

    // Extract data
    const delegationCheck = dashboardData?.delegations;
    // Get events and notices from dashboard data
    // const upcomingEvents = dashboardData?.events || [];
    const recentNotices = dashboardData?.notices || [];
    const attendanceStats = dashboardData?.attendance;
    const leaveData = dashboardData?.leaves;

    const notices = recentNotices?.notices?.map((n) => ({
        id: n.id,
        title: n.title,
        time: new Date(n.createdAt).toLocaleString(),
        unread: !n.read,
    })) || [];

    const recentNotice = notices?.find(n => n.unread) || null;
    const nextEvent = upcomingEvents?.[0] || null;

    // Calculate stats
    const totalDaysWorked = attendanceStats?.monthlyStats?.presentDays || 0;
    const attendancePercent = attendanceStats?.monthlyStats?.attendancePercentage || 0;
    const totalLeavesTaken = leaveData?.totalUsed || 0;

    // Handle delegation modal logic
    useEffect(() => {
        if (delegationCheck?.hasDelegations && delegationCheck.delegations.length > 0) {
            const unacknowledgedDelegations = delegationCheck.delegations.filter(
                delegation => !delegation.acknowledgedAt
            );

            if (unacknowledgedDelegations.length > 0) {
                setActiveDelegations(unacknowledgedDelegations);
                setShowDelegationModal(true);
            } else {
                setActiveDelegations(delegationCheck.delegations);
                setShowDelegationModal(false);
            }
        } else {
            setActiveDelegations([]);
            setShowDelegationModal(false);
        }
    }, [delegationCheck]);

    const handleSelectDelegation = async (delegation) => {
        await saveDelegationAsShown(delegation.id, delegation.version);
        setShowDelegationModal(false);
        navigateOnce({
            pathname: 'teachers/delegationmarking',
            params: {
                delegationId: delegation.id,
                classId: delegation.classId,
                sectionId: delegation.sectionId || 'all',
                className: delegation.className,
                sectionName: delegation.sectionName || '',
                isDelegation: 'true'
            }
        });
    };

    const handleDismissDelegationModal = async () => {
        for (const delegation of activeDelegations) {
            await saveDelegationAsShown(delegation.id, delegation.version);
        }
        setShowDelegationModal(false);
    };
    // Quick Actions (Teacher Dashboard)

    const actionGroups = [
        // =========================
        // Attendance
        // =========================
        {
            title: 'Attendance',
            actions: [
                {
                    icon: Calendar,
                    label: 'Check In / Out',
                    color: '#F9A825',
                    bgColor: '#FFF8E1',
                    href: '/teachers/attendance',
                    params: { teacherData: JSON.stringify(teacher) },
                },
                {
                    icon: ClipboardList,
                    label: 'Take Class Attendance',
                    color: '#3B82F6',
                    bgColor: '#DBEAFE',
                    href: '/teachers/mark-attendance',
                    params: { teacherData: JSON.stringify(teacher) },
                },
                {
                    icon: ClipboardList,
                    label: 'Class Attendance Records',
                    color: '#2563EB',
                    bgColor: '#E0EAFF',
                    href: '/teachers/class-attendance',
                },
                {
                    icon: ChartPie,
                    label: 'My Attendance Summary',
                    color: '#F59E0B',
                    bgColor: '#FEF3C7',
                    href: '/teachers/stats-calendar',
                    params: {
                        teacherData: JSON.stringify({ schoolId, userId, ...teacher }),
                    },
                },
            ],
        },

        // =========================
        // Teaching
        // =========================
        {
            title: 'Teaching',
            actions: [
                {
                    icon: Book,
                    label: 'Add Homework',
                    color: '#0469ff',
                    bgColor: '#E3F2FD',
                    href: '/homework/assign',
                    params: { teacherData: JSON.stringify(teacher) },
                },
                {
                    icon: ScrollText,
                    label: 'Syllabus',
                    color: '#9C27B0',
                    bgColor: '#F3E5F5',
                    href: '/syllabusview',
                },
                {
                    icon: Award,
                    label: 'Examinations',
                    color: '#F59E0B',
                    bgColor: '#FEF3C7',
                    href: '/teachers/exam-results',
                },
            ],
        },

        // =========================
        // Schedule & Planning
        // =========================
        {
            title: 'Schedule & Planning',
            actions: [
                {
                    icon: Clock,
                    label: 'My Timetable',
                    color: '#8B5CF6',
                    bgColor: '#EDE9FE',
                    href: '/teachers/timetable',
                },
                {
                    icon: Calendar,
                    label: 'School Calendar',
                    color: '#4CAF50',
                    bgColor: '#E8F5E9',
                    href: '/(screens)/calendarscreen',
                },
            ],
        },

        // =========================
        // Resources
        // =========================
        {
            title: 'Resources',
            actions: [
                {
                    icon: BookOpen,
                    label: 'Library',
                    color: '#10b981',
                    bgColor: '#dcfce7',
                    href: '/teachers/teacher-library',
                },
            ],
        },

        // =========================
        // My Account
        // =========================
        {
            title: 'My Account',
            actions: [
                {
                    icon: Wallet,
                    label: 'My Payroll',
                    color: '#059669',
                    bgColor: '#D1FAE5',
                    href: '/teachers/my-payroll',
                },
            ],
        },
    ];

    // MAIN LOADER - Shows until EVERYTHING is ready
    if (isDashboardLoading && !refreshing) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 50 }}>
                <ActivityIndicator size="large" color="#0469ff" />
                <Text style={{ marginTop: 12, color: '#666', fontSize: 14 }}>Loading Dashboard...</Text>
            </View>
        );
    }

    return (
        <Animated.ScrollView
            style={{ flex: 1, backgroundColor: '#fff' }}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: 100, paddingTop: paddingTop }}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={() => {
                        onRefresh();
                        refetchDashboard();
                    }}
                    tintColor="#0469ff"
                    colors={['#0469ff']}
                    progressViewOffset={refreshOffset}
                />
            }
        >
            {banner}
            {/* Delegation Banner */}
            {activeDelegations.length > 0 && (
                <Animated.View entering={FadeInDown.duration(400)} style={styles.delegationBannerContainer}>
                    {activeDelegations.map((delegation, index) => (
                        <Animated.View key={delegation.id} entering={FadeInDown.delay(index * 100).duration(400)} style={styles.delegationBanner}>
                            <HapticTouchable onPress={() => handleSelectDelegation(delegation)} style={{ flex: 1 }}>
                                <View style={styles.delegationBannerContent}>
                                    <View style={styles.delegationBannerIcon}><UserCheck size={20} color="#fff" /></View>
                                    <View style={styles.delegationBannerText}>
                                        <Text style={styles.delegationBannerTitle}>Substitute Teacher Assignment</Text>
                                        <Text style={styles.delegationBannerSubtitle}>You are assigned to {delegation.className}{delegation.sectionName && ` - ${delegation.sectionName}`} For Attendance Marking!</Text>
                                        <View style={styles.delegationBannerDate}>
                                            <Calendar size={12} color="rgba(255, 255, 255, 0.9)" />
                                            <Text style={styles.delegationBannerDateText}>Until {new Date(delegation.endDate).toLocaleDateString()}</Text>
                                        </View>
                                        <Text style={{ fontSize: 12, marginTop: 5, color: 'rgba(255, 255, 255, 0.9)' }}>Click To Mark</Text>
                                    </View>
                                </View>
                            </HapticTouchable>
                        </Animated.View>
                    ))}
                </Animated.View>
            )}
            {/* Today's Events */}
            {todaysEvents && todaysEvents.length > 0 && (
                <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={styles.sectionTitle}>Today's Events</Text>
                            <View style={styles.todayBadge}>
                                <Text style={styles.todayBadgeText}>NOW</Text>
                            </View>
                        </View>
                    </View>
                    <View style={styles.eventsContainer}>
                        {todaysEvents.map((event, index) => (
                            <Animated.View key={event.id} entering={FadeInRight.delay(600 + index * 100).duration(500)}>
                                <HapticTouchable>
                                    <LinearGradient
                                        colors={[event.color, event.color + 'DD']}
                                        style={styles.todayEventCard}
                                    >
                                        <View style={styles.todayEventIcon}>
                                            <Text style={styles.eventEmoji}>{event.icon}</Text>
                                        </View>
                                        <View style={styles.eventInfo}>
                                            <Text style={styles.todayEventTitle}>{event.title}</Text>
                                            {event.location && (
                                                <Text style={styles.todayEventLocation}>📍 {event.location}</Text>
                                            )}
                                        </View>
                                        <View style={styles.pulsingDot} />
                                    </LinearGradient>
                                </HapticTouchable>
                            </Animated.View>
                        ))}
                    </View>
                </Animated.View>
            )}

            {/* Updates Widget */}
            {(recentNotice || nextEvent) && (
                <Animated.View entering={FadeInDown.delay(250).duration(500)} style={styles.updatesWidget}>
                    {recentNotice && (
                        <HapticTouchable style={styles.updateItem} onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                            <View style={[styles.updateIconBg, { backgroundColor: '#FFEBEE' }]}>
                                <Bell size={14} color="#EF4444" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.updateText} numberOfLines={1}>🔴 {recentNotice.title}</Text>
                                <Text style={styles.updateTime}>{recentNotice.time}</Text>
                            </View>
                            <ArrowRight size={14} color="#999" />
                        </HapticTouchable>
                    )}
                    {nextEvent && (
                        <HapticTouchable
                            style={styles.updateItem}
                            onPress={() => navigateOnce('/(screens)/calendarscreen')}
                        >
                            <View style={[styles.updateIconBg, { backgroundColor: '#E8F5E9' }]}>
                                <Calendar size={14} color="#4CAF50" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.updateText} numberOfLines={1}>
                                    📅 {nextEvent.title}
                                </Text>
                                <Text style={styles.updateTime}>
                                    {nextEvent.date}
                                </Text>
                            </View>
                            <ArrowRight size={14} color="#999" />
                        </HapticTouchable>
                    )}
                </Animated.View>
            )}

            {/* Quick Stats - Enhanced */}
            <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.section}>
                <View style={styles.statsGrid}>
                    <HapticTouchable style={{ flex: 1 }} onPress={() => navigateOnce('/teachers/attendance')}>
                        <LinearGradient
                            colors={['#0EA5E9', '#0284C7']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statCard, { shadowColor: '#0EA5E9', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                        >
                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={styles.statIcon}><CalendarDays size={22} color="#fff" /></View>
                            <View>
                                <Text style={styles.statValue}>{totalDaysWorked}</Text>
                                <Text style={styles.statLabel}>Days Present</Text>
                            </View>
                        </LinearGradient>
                    </HapticTouchable>

                    <HapticTouchable style={{ flex: 1 }} onPress={() => navigateOnce('/teachers/attendance')}>
                        <LinearGradient
                            colors={['#F59E0B', '#D97706']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statCard, { shadowColor: '#F59E0B', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                        >
                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={styles.statIcon}><Award size={22} color="#fff" /></View>
                            <View>
                                <Text style={styles.statValue}>{Math.round(attendancePercent)}%</Text>
                                <Text style={styles.statLabel}>Attendance</Text>
                            </View>
                        </LinearGradient>
                    </HapticTouchable>

                    <HapticTouchable style={{ flex: 1 }} onPress={() => navigateOnce('/teachers/attendance')}>
                        <LinearGradient
                            colors={['#EF4444', '#DC2626']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statCard, { shadowColor: '#EF4444', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                        >
                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={styles.statIcon}><Umbrella size={22} color="#fff" /></View>
                            <View>
                                <Text style={styles.statValue}>{totalLeavesTaken}</Text>
                                <Text style={styles.statLabel}>Leaves Taken</Text>
                            </View>
                        </LinearGradient>
                    </HapticTouchable>
                </View>
            </Animated.View>

            {/* School Banner Carousel */}
            <BannerCarousel schoolId={schoolId} role="TEACHING_STAFF" />

            {/* Quick Actions */}
            {actionGroups.map((group, groupIndex) => (
                <Animated.View key={group.title} entering={FadeInDown.delay(400 + groupIndex * 100).duration(600)} style={styles.section}>
                    <Text style={styles.sectionTitle}>{group.title}</Text>
                    <View style={styles.actionsGrid}>
                        {group.actions.map((action, index) => (
                            <Animated.View key={action.label} entering={FadeInDown.delay(500 + index * 50).duration(400)}>
                                <HapticTouchable onPress={() => action.params ? navigateOnce(action.href, action.params) : navigateOnce(action.href || '')}>
                                    <View style={[styles.actionButton, { backgroundColor: action.bgColor }]}>
                                        {/* Decorative Graphics */}
                                        <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                                        <View style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' }} />

                                        <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}><action.icon size={22} color={action.color} /></View>
                                        <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
                                    </View>
                                </HapticTouchable>
                            </Animated.View>
                        ))}
                    </View>
                </Animated.View>
            ))}

            {/* Upcoming Events */}
            <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Upcoming Events</Text>
                    <HapticTouchable onPress={() => navigateOnce('/(screens)/calendarscreen')}>
                        <Text style={styles.seeAll}>See All</Text>
                    </HapticTouchable>
                </View>
                <View style={styles.eventsContainer}>
                    {upcomingEvents && upcomingEvents.length > 0 ? (
                        upcomingEvents.map((event, index) => (
                            <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/calendarscreen', params: { eventid: event.id } })}>
                                    <View style={styles.eventCard}>
                                        <View style={[styles.eventIcon, { backgroundColor: event.color + '20' }]}>
                                            <Text style={styles.eventEmoji}>{event.icon}</Text>
                                        </View>
                                        <View style={styles.eventInfo}>
                                            <Text style={styles.eventTitle}>{event.title}</Text>
                                            <View style={styles.eventDate}>
                                                <Calendar size={14} color="#666" />
                                                <Text style={styles.eventDateText}>{event.date}</Text>
                                            </View>
                                        </View>
                                        <ChevronRight size={20} color="#999" />
                                    </View>
                                </HapticTouchable>
                            </Animated.View>
                        ))
                    ) : (
                        <Animated.View
                            entering={FadeInRight.delay(700).duration(500)}
                            style={{
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 20,
                                opacity: 0.8,
                            }}
                        >
                            <CheckCircle2 size={26} color="#0469ff" />
                            <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                You're all caught up!
                            </Text>
                        </Animated.View>
                    )}
                </View>
            </Animated.View>

            {/* Recent Notices */}
            <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent Notices</Text>
                    <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}><Text style={styles.seeAll}>View All</Text></HapticTouchable>
                </View>
                <View style={styles.noticesContainer}>
                    {notices.length > 0 ? (
                        notices.map((notice, index) => (
                            <Animated.View key={notice.id} entering={FadeInRight.delay(900 + index * 100).duration(500)}>
                                <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                                    <View style={styles.noticeCard}>
                                        <View style={styles.noticeLeft}>
                                            <View style={[styles.noticeIcon, notice.unread && styles.unreadIcon]}>
                                                <Bell size={16} color={notice.unread ? '#0469ff' : '#999'} />
                                            </View>
                                            <View style={styles.noticeInfo}>
                                                <Text style={[styles.noticeTitle, notice.unread && styles.unreadTitle]}>{notice.title}</Text>
                                                <Text style={styles.noticeTime}>{notice.time}</Text>
                                            </View>
                                        </View>
                                        {notice.unread && <View style={styles.unreadDot} />}
                                    </View>
                                </HapticTouchable>
                            </Animated.View>
                        ))
                    ) : (
                        <View style={{ alignItems: 'center', padding: 20 }}>
                            <Text style={{ color: '#666' }}>No notices yet</Text>
                        </View>
                    )}
                </View>
            </Animated.View>

            {/* Bottom Spacer */}
            <View style={{ height: 100 }} />

            {/* Delegation Modal */}
            <DelegationCheckModal
                visible={showDelegationModal}
                delegations={activeDelegations}
                onSelectDelegation={handleSelectDelegation}
                onClose={handleDismissDelegationModal}
            />
        </Animated.ScrollView>
    );
}); const DriverView = ({ refreshing, onRefresh, onScroll, paddingTop, refreshOffset, schoolId, userId, prefetchedStaffData, prefetchedTripsData, navigateOnce, upcomingEvents, user_acc }) => {
    // Location tracking state
    const [isPollingLocation, setIsPollingLocation] = useState(false);
    const [startingTripId, setStartingTripId] = useState(null); // Track which trip is being started
    const locationWatchRef = useRef(null);
    const appStateRef = useRef(AppState.currentState);
    const queryClient = useQueryClient();

    // Use prefetched data directly
    const staffData = prefetchedStaffData;
    const transportStaffId = staffData?.id;

    // Get assignment from trips data (for on-demand trip creation)
    const tripsData = prefetchedTripsData;
    const trips = tripsData?.trips || [];
    const assignment = tripsData?.assignment;

    // Try to get vehicle from vehicleAssignments first, fallback to assignment
    const vehicle = staffData?.vehicleAssignments?.[0]?.vehicle || assignment?.vehicle;
    const route = staffData?.vehicleAssignments?.[0]?.vehicle?.routes?.[0] || assignment?.route;
    const routeStopsCount = route?.stops?.length || route?.busStops?.length || 0;

    // Refetch function for manual refresh
    // Refetch function - use parent's onRefresh to avoid duplicate refreshes
    const refetch = useCallback(() => {
        if (onRefresh && typeof onRefresh === 'function') {
            onRefresh();
        }
    }, [onRefresh]);

    // Filter: Show today's trips + any IN_PROGRESS trips from previous days
    const today = new Date().toISOString().split('T')[0];
    const relevantTrips = trips.filter(t => {
        const tripDate = new Date(t.scheduledDate || t.createdAt).toISOString().split('T')[0];
        // Include if: today's trip OR it's still IN_PROGRESS
        return tripDate === today || t.status === 'IN_PROGRESS';
    });

    // Detect stale trips (IN_PROGRESS from previous days)
    const staleTrips = trips.filter(t => {
        const tripDate = new Date(t.scheduledDate || t.createdAt).toISOString().split('T')[0];
        return t.status === 'IN_PROGRESS' && tripDate < today;
    });

    const activeTrip = relevantTrips.find(t => t.status === 'IN_PROGRESS');
    const completedTrips = relevantTrips.filter(t => t.status === 'COMPLETED').length;
    const totalTrips = relevantTrips.length;


    // Force-complete mutation for stale trips
    const forceCompleteMutation = useMutation({
        mutationFn: async (tripId) => {
            const res = await api.post(`/schools/transport/trips/${tripId}/complete`);
            return res.data;
        },
        onSuccess: () => {
            refetch();
            Alert.alert('Success', 'Trip marked as completed!');
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || 'Failed to complete trip');
        }
    });

    // Function to force-complete a stale trip
    const handleForceComplete = (trip) => {
        const tripDate = new Date(trip.scheduledDate || trip.createdAt).toLocaleDateString();
        Alert.alert(
            'Complete Old Trip?',
            `This trip from ${tripDate} is still marked as in-progress. Mark it as completed?`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Complete Now', style: 'default', onPress: () => forceCompleteMutation.mutate(trip.id) }
            ]
        );
    };

    // Auto-complete stale trips on load (optional - uncomment to enable)
    // useEffect(() => {
    //     if (staleTrips.length > 0) {
    //         staleTrips.forEach(trip => forceCompleteMutation.mutate(trip.id));
    //     }
    // }, [staleTrips.length]);

    // Location Tracking Functions
    const startLocationTracking = useCallback(async (tripId, vehicleId) => {
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission Required', 'Location permission is needed for live tracking.');
                return;
            }

            locationWatchRef.current = await Location.watchPositionAsync(
                { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 20 },
                async (location) => {
                    try {
                        await api.post('/schools/transport/location/update', {
                            vehicleId,
                            tripId,
                            transportStaffId,
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude,
                            speed: location.coords.speed,
                            heading: location.coords.heading,
                        });
                    } catch (err) {
                        console.error('Error updating location:', err);
                    }
                }
            );
            setIsPollingLocation(true);
        } catch (err) {
            console.error('Error starting location tracking:', err);
        }
    }, [transportStaffId]);

    const stopLocationTracking = useCallback(async () => {
        // Stop foreground watcher
        if (locationWatchRef.current) {
            locationWatchRef.current.remove();
            locationWatchRef.current = null;
        }
        setIsPollingLocation(false);

        // Also stop background task if it's running
        try {
            const isRunning = await isBackgroundTaskRunning();
            if (isRunning) {
                console.log('🧹 DriverView: Stopping background location task');
                await stopBackgroundLocationTask();
            }
        } catch (err) {
            console.error('Error stopping background task:', err);
        }
    }, []);

    // Auto-start/stop location tracking based on active trip
    useEffect(() => {
        if (activeTrip && !isPollingLocation && vehicle) {
            startLocationTracking(activeTrip.id, vehicle.id);
        } else if (!activeTrip && isPollingLocation) {
            stopLocationTracking();
        }

        return () => stopLocationTracking();
    }, [activeTrip?.id, vehicle?.id]);

    // Proactive cleanup: When DriverView mounts/updates with no active trip, 
    // ensure background location task is stopped (handles coming back from active-trip screen)
    useEffect(() => {
        const cleanupStaleBackgroundTask = async () => {
            if (!activeTrip) {
                try {
                    const isRunning = await isBackgroundTaskRunning();
                    if (isRunning) {
                        console.log('🧹 DriverView: No active trip but background task running - cleaning up');
                        await stopBackgroundLocationTask();
                    }
                } catch (err) {
                    console.error('Error in proactive cleanup:', err);
                }
            }
        };
        cleanupStaleBackgroundTask();
    }, [activeTrip]);

    // Handle app state changes - only restart location tracking, don't refetch (parent handles refresh)
    useEffect(() => {
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
                // Restart location tracking if there's an active trip
                if (activeTrip && vehicle && !isPollingLocation) {
                    startLocationTracking(activeTrip.id, vehicle.id);
                }
            }
            appStateRef.current = nextAppState;
        });
        return () => subscription.remove();
    }, [activeTrip?.id, vehicle?.id, isPollingLocation, startLocationTracking]);

    const quickActions = [
        { icon: Bus, label: 'My Vehicle', color: '#0469ff', bgColor: '#DBEAFE', href: '/(screens)/transport/my-vehicle' },
        { icon: Users, label: 'Attendance', color: '#10B981', bgColor: '#D1FAE5', href: activeTrip ? { pathname: '/(screens)/transport/attendance-marking', params: { tripId: activeTrip.id } } : '/(screens)/transport/driver-attendance-history' },
        { icon: MapPin, label: 'My Route', color: '#8B5CF6', bgColor: '#EDE9FE', href: '/(screens)/transport/my-route' },
        { icon: Calendar, label: 'Trip History', color: '#F59E0B', bgColor: '#FEF3C7', href: '/(screens)/transport/driver-attendance-history' },
    ];
    // Get today's scheduled trips for this driver
    const todaysScheduledTrips = trips.filter(t => t.status === 'SCHEDULED');

    // Check what trip types are already done/in-progress today
    const todaysPickupDone = trips.some(t => t.tripType === 'PICKUP' && (t.status === 'COMPLETED' || t.status === 'IN_PROGRESS'));
    const todaysDropDone = trips.some(t => t.tripType === 'DROP' && (t.status === 'COMPLETED' || t.status === 'IN_PROGRESS'));

    // On-demand start trip function (creates trip on the fly)
    const handleStartOnDemand = async (tripType) => {
        if (!assignment) return;

        // Double-check for DROP
        if (tripType === 'DROP' && !todaysPickupDone) {
            Alert.alert(
                '⚠️ PICKUP Not Completed',
                'The PICKUP trip for today hasn\'t been completed yet. Are you sure you want to start the DROP trip?',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Start Anyway', style: 'destructive', onPress: () => startOnDemandTrip(tripType) }
                ]
            );
            return;
        }
        startOnDemandTrip(tripType);
    };

    const startOnDemandTrip = async (tripType) => {
        Alert.alert(
            `Start ${tripType} Trip?`,
            `You are about to start the ${tripType.toLowerCase()} trip for ${assignment.route?.name}.\n\nThis will begin live tracking and notify parents.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Start Trip',
                    style: 'default',
                    onPress: async () => {
                        setStartingTripId(`ondemand-${tripType}`); // Show loading
                        try {
                            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
                            const res = await api.post('/schools/transport/trips/start-on-demand', {
                                assignmentId: assignment.id,
                                tripType,
                                driverId: transportStaffId,
                                latitude: location.coords.latitude,
                                longitude: location.coords.longitude
                            });
                            if (res.data.success) {
                                refetch();
                                router.push({ pathname: '/(screens)/transport/active-trip', params: { tripId: res.data.trip.id } });
                            }
                        } catch (err) {
                            console.error('Failed to start on-demand trip:', err);
                            const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to start trip. Please try again.';
                            Alert.alert('Error', errorMsg);
                            setStartingTripId(null);
                        }
                    }
                }
            ]
        );
    };

    // Fetch notices for driver
    const { data: recentNotices } = useQuery({
        queryKey: ['driver-notices', schoolId, userId],
        queryFn: async () => {
            if (!schoolId || !userId) return { notices: [] };
            const res = await api.get(`/notices/${schoolId}?userId=${userId}&limit=4&page=1`);
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        ...CACHE_CONFIG.MODERATE,
    });

    const notices = recentNotices?.notices?.map((n) => ({
        id: n.id,
        title: n.title,
        time: new Date(n.createdAt).toLocaleString(),
        unread: !n.read,
    })) || [];

    return (
        <Animated.ScrollView
            style={styles.container}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: paddingTop }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#0469ff"
                    colors={['#0469ff']}
                    progressViewOffset={refreshOffset}
                />
            }
        >

            <BannerCarousel schoolId={schoolId} role={user_acc?.role?.name} />

            {/* Stats Cards - Moved below Bus Card */}
            <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
                <View style={styles.statsGrid}>
                    <HapticTouchable style={{ flex: 1 }}>
                        <LinearGradient
                            colors={['#667eea', '#764ba2']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statCard, { shadowColor: '#667eea', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                        >
                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={styles.statIcon}><Calendar size={22} color="#fff" /></View>
                            <View>
                                <Text style={styles.statValue}>{totalTrips}</Text>
                                <Text style={styles.statLabel}>Today's Trips</Text>
                            </View>
                        </LinearGradient>
                    </HapticTouchable>
                    <HapticTouchable style={{ flex: 1 }}>
                        <LinearGradient
                            colors={['#4ECDC4', '#26A69A']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statCard, { shadowColor: '#4ECDC4', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                        >
                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={styles.statIcon}><CheckCircle2 size={22} color="#fff" /></View>
                            <View>
                                <Text style={styles.statValue}>{completedTrips}</Text>
                                <Text style={styles.statLabel}>Completed</Text>
                            </View>
                        </LinearGradient>
                    </HapticTouchable>
                    <HapticTouchable style={{ flex: 1 }}>
                        <LinearGradient
                            colors={activeTrip ? ['#10B981', '#059669'] : ['#f093fb', '#f5576c']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statCard, { shadowColor: activeTrip ? '#10B981' : '#f093fb', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                        >
                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={styles.statIcon}><Users size={22} color="#fff" /></View>
                            <View>
                                <Text style={styles.statValue}>{activeTrip ? 'Active' : 'Idle'}</Text>
                                <Text style={styles.statLabel}>Status</Text>
                            </View>
                        </LinearGradient>
                    </HapticTouchable>
                </View>
            </Animated.View>
            {/* Bus Assignment Card - Moved to Top */}
            {/* School Banner Carousel */}
            {vehicle && (
                <Animated.View entering={FadeInDown.delay(50).duration(600)} style={styles.section}>
                    <LinearGradient colors={['#0469ff', '#0052cc']} style={{ borderRadius: 20, padding: 20, shadowColor: "#0469ff", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                <Bus size={30} color="#fff" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 }}>MY ASSIGNED BUS</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 24, fontWeight: '800', color: '#fff' }}>{vehicle.licensePlate}</Text>
                                    <HapticTouchable onPress={() => navigateOnce('/(screens)/transport/my-vehicle')} style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Details</Text>
                                    </HapticTouchable>
                                </View>
                            </View>
                        </View>
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 16, padding: 16 }}>
                            <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Model</Text>
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{vehicle.model || 'N/A'}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Capacity</Text>
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{vehicle.capacity || 'N/A'} Seats</Text>
                                </View>
                            </View>
                            {route && (
                                <View>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>Assigned Route</Text>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <MapPin size={14} color="rgba(255,255,255,0.9)" style={{ marginRight: 6 }} />
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>{route.name}</Text>
                                    </View>
                                </View>
                            )}
                            {todaysScheduledTrips.length > 0 && (
                                <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.15)' }}>
                                    <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 10 }}>Today's Tripr</Text>
                                    {todaysScheduledTrips.map((trip, idx) => (
                                        <View key={trip.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: idx < todaysScheduledTrips.length - 1 ? 8 : 0 }}>
                                            <View style={{ width: 24, alignItems: 'flex-start' }}>
                                                <Text style={{ fontSize: 14 }}>{trip.tripType === 'PICKUP' ? '🌅' : '🌆'}</Text>
                                            </View>
                                            <Text style={{ fontSize: 14, color: '#fff', marginLeft: 8, flex: 1 }}>{trip.tripType} • {trip.route?.name}</Text>
                                            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                                                <Text style={{ fontSize: 11, color: '#fff', fontWeight: '600' }}>{trip.status}</Text>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    </LinearGradient>
                </Animated.View>
            )}

            {/* Start Trip Widget - Enhanced with PICKUP before DROP logic */}
            {!activeTrip && todaysScheduledTrips.length > 0 && (() => {
                // Check if PICKUP trip is completed for today
                const todaysPickupCompleted = trips.some(t => {
                    const tripDate = new Date(t.scheduledDate || t.createdAt).toISOString().split('T')[0];
                    return tripDate === today && t.tripType === 'PICKUP' && t.status === 'COMPLETED';
                });

                // Sort trips: PICKUP first, then DROP
                const sortedTrips = [...todaysScheduledTrips].sort((a, b) => {
                    if (a.tripType === 'PICKUP' && b.tripType !== 'PICKUP') return -1;
                    if (a.tripType !== 'PICKUP' && b.tripType === 'PICKUP') return 1;
                    return 0;
                });

                const handleStartTrip = async (trip) => {
                    // Show warning if trying to start DROP without completing PICKUP (but don't block)
                    if (trip.tripType === 'DROP' && !todaysPickupCompleted) {
                        Alert.alert(
                            '⚠️ PICKUP Not Completed',
                            'The PICKUP trip for today hasn\'t been completed yet. Are you sure you want to start the DROP trip?',
                            [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Start Anyway',
                                    style: 'destructive',
                                    onPress: () => showStartConfirmation(trip)
                                }
                            ]
                        );
                        return;
                    }

                    showStartConfirmation(trip);
                };

                const showStartConfirmation = (trip) => {
                    // Confirmation dialog
                    Alert.alert(
                        `Start ${trip.tripType} Trip?`,
                        `You are about to start the ${trip.tripType.toLowerCase()} trip for ${trip.route?.name}.\n\nThis will begin live tracking and notify parents.`,
                        [
                            { text: 'Cancel', style: 'cancel' },
                            {
                                text: 'Start Trip',
                                style: 'default',
                                onPress: async () => {
                                    setStartingTripId(trip.id); // Show loading spinner
                                    try {
                                        const res = await api.post(`/schools/transport/trips/${trip.id}/start`, { driverId: transportStaffId });
                                        if (res.data.success) {
                                            refetch();
                                            router.push({ pathname: '/(screens)/transport/active-trip', params: { tripId: trip.id } });
                                        }
                                    } catch (err) {
                                        console.error('Failed to start trip:', err);
                                        Alert.alert('Error', err.response?.data?.error || 'Failed to start trip. Please try again.');
                                        setStartingTripId(null); // Clear loading on error
                                    }
                                }
                            }
                        ]
                    );
                };

                return (
                    <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.section}>
                        <View style={{ backgroundColor: '#FFF7ED', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#FDBA74' }}>
                            {/* Header */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' }}>
                                    <Clock size={24} color="#EA580C" />
                                </View>
                                <View style={{ marginLeft: 14, flex: 1 }}>
                                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#9A3412' }}>Ready to Start</Text>
                                    <Text style={{ fontSize: 13, color: '#C2410C' }}>{todaysScheduledTrips.length} trip{todaysScheduledTrips.length > 1 ? 's' : ''} scheduled</Text>
                                </View>
                            </View>

                            {/* Vehicle Info Banner */}
                            {vehicle && (
                                <View style={{ backgroundColor: '#FFEDD5', borderRadius: 12, padding: 12, marginBottom: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#FDBA74' }}>
                                    <Bus size={20} color="#EA580C" />
                                    <View style={{ marginLeft: 10, flex: 1 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#9A3412' }}>{vehicle.licensePlate}</Text>
                                        <Text style={{ fontSize: 12, color: '#C2410C' }}>{vehicle.model} • {vehicle.capacity} seats</Text>
                                    </View>
                                </View>
                            )}

                            {/* Trip Cards with Premium Start Button */}
                            {sortedTrips.map((trip, idx) => {
                                const isDropLocked = trip.tripType === 'DROP' && !todaysPickupCompleted;

                                return (
                                    <HapticTouchable
                                        key={trip.id}
                                        onPress={() => handleStartTrip(trip)}
                                        style={{
                                            backgroundColor: isDropLocked ? '#F8FAFC' : '#fff',
                                            padding: 16,
                                            borderRadius: 16,
                                            marginTop: idx > 0 ? 12 : 0,
                                            opacity: isDropLocked ? 0.7 : 1,
                                            borderWidth: 1,
                                            borderColor: isDropLocked ? '#E2E8F0' : '#10B981',
                                            shadowColor: isDropLocked ? '#000' : '#10B981',
                                            shadowOffset: { width: 0, height: 4 },
                                            shadowOpacity: isDropLocked ? 0.05 : 0.2,
                                            shadowRadius: 8,
                                            elevation: isDropLocked ? 1 : 4,
                                        }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                            <View style={{
                                                width: 52,
                                                height: 52,
                                                borderRadius: 26,
                                                backgroundColor: trip.tripType === 'PICKUP' ? '#DBEAFE' : '#FCE7F3',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <Text style={{ fontSize: 24 }}>{trip.tripType === 'PICKUP' ? '🌅' : '🌆'}</Text>
                                            </View>
                                            <View style={{ flex: 1, marginLeft: 14 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                    <Text style={{ fontSize: 17, fontWeight: '700', color: isDropLocked ? '#92400E' : '#1E293B' }}>
                                                        {trip.route?.name || 'Route'}
                                                    </Text>
                                                    {isDropLocked && (
                                                        <View style={{ marginLeft: 8, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                            <AlertTriangle size={10} color="#D97706" />
                                                            <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '700' }}>PICKUP First</Text>
                                                        </View>
                                                    )}
                                                </View>
                                                <Text style={{ fontSize: 13, color: '#64748B', marginTop: 3 }}>
                                                    {trip.tripType} Trip • {trip.route?.busStops?.length || 0} stops
                                                </Text>
                                            </View>
                                        </View>

                                        {/* Start Button */}
                                        <View style={{
                                            marginTop: 14,
                                            backgroundColor: isDropLocked ? '#F59E0B' : '#10B981',
                                            paddingVertical: 14,
                                            borderRadius: 12,
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 8,
                                        }}>
                                            {startingTripId === trip.id ? (
                                                <>
                                                    <ActivityIndicator size="small" color="#fff" />
                                                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Starting Trip...</Text>
                                                </>
                                            ) : isDropLocked ? (
                                                <>
                                                    <AlertTriangle size={18} color="#fff" />
                                                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Start DROP (PICKUP pending)</Text>
                                                </>
                                            ) : (
                                                <>
                                                    <View style={{
                                                        width: 28,
                                                        height: 28,
                                                        borderRadius: 14,
                                                        backgroundColor: 'rgba(255,255,255,0.25)',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}>
                                                        <Play size={14} color="#fff" fill="#fff" />
                                                    </View>
                                                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#fff' }}>Start {trip.tripType} Trip</Text>
                                                </>
                                            )}
                                        </View>
                                    </HapticTouchable>
                                );
                            })}

                            {/* Helpful tip */}
                            {sortedTrips.some(t => t.tripType === 'DROP') && !todaysPickupCompleted && (
                                <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FCD34D' }}>
                                    <AlertTriangle size={16} color="#D97706" />
                                    <Text style={{ fontSize: 12, color: '#92400E', flex: 1, marginLeft: 8 }}>PICKUP not completed yet. You can still start DROP if needed.</Text>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                );
            })()}

            {/* ON-DEMAND Start Trip Widget - Shows when no scheduled trips but has assignment AND trips still pending */}
            {!activeTrip && todaysScheduledTrips.length === 0 && assignment && !(todaysPickupDone && todaysDropDone) && (() => {
                return (
                    <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.section}>
                        <View style={{ backgroundColor: '#F0FDF4', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#86EFAC' }}>
                            {/* Header */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center' }}>
                                    <Play size={24} color="#16A34A" />
                                </View>
                                <View style={{ marginLeft: 14, flex: 1 }}>
                                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#166534' }}>Ready to Start</Text>
                                    <Text style={{ fontSize: 13, color: '#15803D' }}>Tap to begin your trip</Text>
                                </View>
                            </View>

                            {/* Assignment Info Banner */}
                            <View style={{ backgroundColor: '#DCFCE7', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#86EFAC' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Bus size={20} color="#16A34A" />
                                    <View style={{ marginLeft: 10, flex: 1 }}>
                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#166534' }}>{assignment.vehicle?.licensePlate}</Text>
                                        <Text style={{ fontSize: 12, color: '#15803D' }}>{assignment.route?.name}</Text>
                                    </View>
                                </View>
                            </View>

                            {/* Start PICKUP Button */}
                            {!todaysPickupDone && (
                                <HapticTouchable
                                    onPress={() => handleStartOnDemand('PICKUP')}
                                    disabled={startingTripId === 'ondemand-PICKUP'}
                                    style={{ marginBottom: 12 }}
                                >
                                    <View style={{
                                        backgroundColor: '#10B981',
                                        paddingVertical: 16,
                                        borderRadius: 14,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 10,
                                    }}>
                                        {startingTripId === 'ondemand-PICKUP' ? (
                                            <>
                                                <ActivityIndicator size="small" color="#fff" />
                                                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Starting Trip...</Text>
                                            </>
                                        ) : (
                                            <>
                                                <Text style={{ fontSize: 22 }}>🌅</Text>
                                                <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>Start PICKUP Trip</Text>
                                            </>
                                        )}
                                    </View>
                                </HapticTouchable>
                            )}

                            {/* Start DROP Button */}
                            {!todaysDropDone && (
                                <HapticTouchable
                                    onPress={() => handleStartOnDemand('DROP')}
                                    disabled={startingTripId === 'ondemand-DROP'}
                                >
                                    <View style={{
                                        backgroundColor: todaysPickupDone ? '#8B5CF6' : '#F59E0B',
                                        paddingVertical: 16,
                                        borderRadius: 14,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 10,
                                    }}>
                                        {startingTripId === 'ondemand-DROP' ? (
                                            <>
                                                <ActivityIndicator size="small" color="#fff" />
                                                <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Starting Trip...</Text>
                                            </>
                                        ) : (
                                            <>
                                                <Text style={{ fontSize: 22 }}>🌆</Text>
                                                <Text style={{ fontSize: 17, fontWeight: '800', color: '#fff' }}>
                                                    {todaysPickupDone ? 'Start DROP Trip' : 'Start DROP (PICKUP pending)'}
                                                </Text>
                                            </>
                                        )}
                                    </View>
                                </HapticTouchable>
                            )}

                            {/* Helpful tip for DROP when PICKUP not done */}
                            {!todaysPickupDone && (
                                <View style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEF3C7', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#FCD34D' }}>
                                    <AlertTriangle size={16} color="#D97706" />
                                    <Text style={{ fontSize: 12, color: '#92400E', flex: 1, marginLeft: 8 }}>PICKUP not completed yet. You can still start DROP if needed.</Text>
                                </View>
                            )}
                        </View>
                    </Animated.View>
                );
            })()}

            {/* All Trips Completed Widget - Shows when both PICKUP and DROP are done */}
            {!activeTrip && assignment && todaysPickupDone && todaysDropDone && (
                <Animated.View entering={FadeInDown.delay(150).duration(600)} style={styles.section}>
                    <View style={{ backgroundColor: '#F0FDF4', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#86EFAC', alignItems: 'center' }}>
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                            <CheckCircle2 size={36} color="#16A34A" />
                        </View>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#166534', marginBottom: 4 }}>All Done for Today! 🎉</Text>
                        <Text style={{ fontSize: 14, color: '#15803D', textAlign: 'center' }}>Both PICKUP and DROP trips completed successfully.</Text>
                        <View style={{ flexDirection: 'row', marginTop: 16, gap: 12 }}>
                            <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}>
                                <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600' }}>🌅 PICKUP ✓</Text>
                            </View>
                            <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 }}>
                                <Text style={{ fontSize: 13, color: '#166534', fontWeight: '600' }}>🌆 DROP ✓</Text>
                            </View>
                        </View>
                    </View>
                </Animated.View>
            )}

            {activeTrip && (
                <Animated.View entering={FadeInDown.delay(75).duration(600)} style={styles.section}>
                    {/* Location Tracking Banner */}
                    {isPollingLocation && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: '#86EFAC' }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#16A34A' }} />
                            <MapPin size={14} color="#16A34A" />
                            <Text style={{ fontSize: 12, color: '#166534', fontWeight: '600', flex: 1 }}>Location tracking active</Text>
                            <Text style={{ fontSize: 11, color: '#16A34A' }}>Parents can track</Text>
                        </View>
                    )}
                    <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/transport/active-trip', params: { tripId: activeTrip.id } })}>
                        <LinearGradient colors={['#10B981', '#059669']} style={{ borderRadius: 16, padding: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                    <Clock size={24} color="#fff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Trip in Progress</Text>
                                        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' }} />
                                    </View>
                                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>{activeTrip.route?.name} • {activeTrip.tripType}</Text>
                                </View>
                                <ChevronRight size={24} color="#fff" />
                            </View>
                        </LinearGradient>
                    </HapticTouchable>
                </Animated.View>
            )}



            <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.section}>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <View style={styles.actionsGrid}>
                    {quickActions.map((action, index) => (
                        <Animated.View key={action.label} entering={FadeInDown.delay(300 + index * 50).duration(400)}>
                            <HapticTouchable onPress={() => action.href && navigateOnce(action.href)} disabled={!action.href}>
                                <View style={[styles.actionButton, { backgroundColor: action.bgColor, opacity: action.href ? 1 : 0.5 }]}>
                                    {/* Decorative Graphics */}
                                    <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                                    <View style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' }} />

                                    <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                                        <action.icon size={22} color={action.color} />
                                    </View>
                                    <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
                                </View>
                            </HapticTouchable>
                        </Animated.View>
                    ))}
                </View>
            </Animated.View>

            {/* Today's Schedule - Redesigned */}
            <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.section}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Text style={styles.sectionTitle}>Today's Schedule</Text>
                    {relevantTrips.length > 0 && (
                        <View style={{ backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                            <Text style={{ fontSize: 12, fontWeight: '600', color: '#0469ff' }}>{relevantTrips.length} trip{relevantTrips.length > 1 ? 's' : ''}</Text>
                        </View>
                    )}
                </View>

                {relevantTrips.length === 0 ? (
                    /* Empty State */
                    <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <Calendar size={28} color="#94A3B8" />
                        </View>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#64748B', marginBottom: 6 }}>No trips for today</Text>
                        <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center' }}>Your scheduled trips will appear here</Text>
                    </View>
                ) : (
                    /* Trip Cards */
                    <View style={{ gap: 12 }}>
                        {relevantTrips.map((trip, index) => (
                            <HapticTouchable
                                key={trip.id}
                                onPress={() => trip.status === 'IN_PROGRESS' && navigateOnce({ pathname: '/(screens)/transport/active-trip', params: { tripId: trip.id } })}
                            >
                                <View style={{
                                    backgroundColor: trip.status === 'IN_PROGRESS' ? '#F0FDF4' : trip.status === 'COMPLETED' ? '#F0FDF4' : '#F8FAFC',
                                    borderRadius: 16,
                                    padding: 16,
                                    borderWidth: 1,
                                    borderColor: trip.status === 'IN_PROGRESS' ? '#86EFAC' : trip.status === 'COMPLETED' ? '#BBF7D0' : '#E2E8F0'
                                }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        {/* Trip Type Icon */}
                                        <View style={{
                                            width: 48,
                                            height: 48,
                                            borderRadius: 12,
                                            backgroundColor: trip.tripType === 'PICKUP' ? '#FEF3C7' : '#E0E7FF',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginRight: 12
                                        }}>
                                            <Text style={{ fontSize: 24 }}>{trip.tripType === 'PICKUP' ? '🌅' : '🌆'}</Text>
                                        </View>

                                        {/* Trip Details */}
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1E293B' }}>{trip.route?.name || 'Route'}</Text>
                                                <View style={{
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 4,
                                                    borderRadius: 8,
                                                    backgroundColor: trip.status === 'COMPLETED' ? '#D1FAE5' : trip.status === 'IN_PROGRESS' ? '#FEF3C7' : '#DBEAFE'
                                                }}>
                                                    <Text style={{
                                                        fontSize: 11,
                                                        fontWeight: '700',
                                                        color: trip.status === 'COMPLETED' ? '#059669' : trip.status === 'IN_PROGRESS' ? '#D97706' : '#0469ff'
                                                    }}>
                                                        {trip.status === 'IN_PROGRESS' ? '● ACTIVE' : trip.status}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                    <Clock size={14} color="#64748B" />
                                                    <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500' }}>{trip.tripType}</Text>
                                                </View>
                                                {trip.vehicle && (
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                        <Bus size={14} color="#64748B" />
                                                        <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500' }}>{trip.vehicle.licensePlate}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>

                                        {/* Arrow for active trips */}
                                        {trip.status === 'IN_PROGRESS' && (
                                            <ChevronRight size={20} color="#10B981" style={{ marginLeft: 8 }} />
                                        )}
                                    </View>
                                </View>
                            </HapticTouchable>
                        ))}
                    </View>
                )}
            </Animated.View>

            {/* Upcoming Events */}
            <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Upcoming Events</Text>
                    <HapticTouchable onPress={() => navigateOnce('/(screens)/calendarscreen')}>
                        <Text style={styles.seeAll}>See All</Text>
                    </HapticTouchable>
                </View>
                <View style={styles.eventsContainer}>
                    {upcomingEvents && upcomingEvents.length > 0 ? (
                        upcomingEvents.slice(0, 4).map((event, index) => (
                            <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/calendarscreen', params: { eventid: event.id } })}>
                                    <View style={styles.eventCard}>
                                        <View style={[styles.eventIcon, { backgroundColor: event.color + '20' }]}>
                                            <Text style={styles.eventEmoji}>{event.icon}</Text>
                                        </View>
                                        <View style={styles.eventInfo}>
                                            <Text style={styles.eventTitle}>{event.title}</Text>
                                            <View style={styles.eventDate}>
                                                <Calendar size={14} color="#666" />
                                                <Text style={styles.eventDateText}>{event.date}</Text>
                                            </View>
                                        </View>
                                        <ChevronRight size={20} color="#999" />
                                    </View>
                                </HapticTouchable>
                            </Animated.View>
                        ))
                    ) : (
                        <Animated.View
                            entering={FadeInRight.delay(700).duration(500)}
                            style={{
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 20,
                                opacity: 0.8,
                            }}
                        >
                            <CheckCircle2 size={26} color="#0469ff" />
                            <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                You're all caught up!
                            </Text>
                        </Animated.View>
                    )}
                </View>
            </Animated.View>
            {/* Recent Notices */}
            <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent Notices</Text>
                    <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                        <Text style={styles.seeAll}>View All</Text>
                    </HapticTouchable>
                </View>
                <View style={styles.noticesContainer}>
                    {notices && notices.length > 0 ? (
                        notices.map((notice, index) => (
                            <Animated.View
                                key={notice.id}
                                entering={FadeInRight.delay(900 + index * 100).duration(500)}
                            >
                                <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                                    <View style={styles.noticeCard}>
                                        <View style={styles.noticeLeft}>
                                            <View style={[styles.noticeIcon, notice.unread && styles.unreadIcon]}>
                                                <Bell size={16} color={notice.unread ? '#0469ff' : '#999'} />
                                            </View>
                                            <View style={styles.noticeInfo}>
                                                <Text style={[styles.noticeTitle, notice.unread && styles.unreadTitle]} numberOfLines={1}>
                                                    {notice.title}
                                                </Text>
                                                <Text style={styles.noticeTime}>
                                                    {notice.time}
                                                </Text>
                                            </View>
                                        </View>
                                        {notice.unread && <View style={styles.unreadDot} />}
                                    </View>
                                </HapticTouchable>
                            </Animated.View>
                        ))
                    ) : (
                        <Animated.View
                            entering={FadeInRight.delay(900).duration(500)}
                            style={{
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 20,
                                opacity: 0.8,
                            }}
                        >
                            <CheckCircle2 size={26} color="#0469ff" />
                            <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                No notices yet
                            </Text>
                        </Animated.View>
                    )}
                </View>
            </Animated.View>

            {/* Bottom Spacer */}
            <View style={{ height: 100 }} />
        </Animated.ScrollView>
    );
};

// === CONDUCTOR VIEW ===
const ConductorView = ({ refreshing, onRefresh, onScroll, paddingTop, refreshOffset, schoolId, userId, prefetchedStaffData, prefetchedTripsData, navigateOnce, upcomingEvents, user_acc }) => {
    const queryClient = useQueryClient();

    // Use prefetched data directly
    const staffData = prefetchedStaffData;
    const transportStaffId = staffData?.id;

    // Use prefetched trips data
    const tripsData = prefetchedTripsData;
    const trips = tripsData?.trips || [];
    const assignment = tripsData?.assignment;

    // Try to get vehicle from vehicleAssignments first, fallback to assignment
    const vehicle = staffData?.vehicleAssignments?.[0]?.vehicle || assignment?.vehicle;
    // Refetch function - use parent's onRefresh to avoid duplicate refreshes
    const refetch = useCallback(() => {
        if (onRefresh && typeof onRefresh === 'function') {
            onRefresh();
        }
    }, [onRefresh]);

    const activeTrip = trips.find(t => t.status === 'IN_PROGRESS');
    const totalStudents = activeTrip?.route?.busStops?.reduce((sum, stop) => sum + (stop.students?.length || 0), 0) || 0;
    const completedTrips = trips.filter(t => t.status === 'COMPLETED').length;

    // Fetch notices for conductor
    const { data: recentNotices } = useQuery({
        queryKey: ['conductor-notices', schoolId, userId],
        queryFn: async () => {
            if (!schoolId || !userId) return { notices: [] };
            const res = await api.get(`/notices/${schoolId}?userId=${userId}&limit=4&page=1`);
            return res.data;
        },
        enabled: !!schoolId && !!userId,
        ...CACHE_CONFIG.MODERATE,
    });

    const notices = recentNotices?.notices?.map((n) => ({
        id: n.id,
        title: n.title,
        time: new Date(n.createdAt).toLocaleString(),
        unread: !n.read,
    })) || [];

    const quickActions = [
        { icon: Bus, label: 'My Vehicle', color: '#0469ff', bgColor: '#DBEAFE', href: '/(screens)/transport/my-vehicle' },
        { icon: Users, label: 'Attendance', color: '#10B981', bgColor: '#D1FAE5', href: activeTrip ? { pathname: '/(screens)/transport/attendance-marking', params: { tripId: activeTrip.id } } : '/(screens)/transport/driver-attendance-history' },
        { icon: MapPin, label: 'My Route', color: '#8B5CF6', bgColor: '#EDE9FE', href: '/(screens)/transport/my-route' },
        { icon: Calendar, label: 'History', color: '#F59E0B', bgColor: '#FEF3C7', href: '/(screens)/transport/driver-attendance-history' },
    ];

    // Note: Loading is handled at HomeScreen level now

    return (
        <Animated.ScrollView
            style={styles.container}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: paddingTop }}
            onScroll={onScroll}
            scrollEventThrottle={16}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#0469ff"
                    colors={['#0469ff']}
                    progressViewOffset={refreshOffset}
                />
            }
        >
            {/* Header is rendered outside the ScrollView by parent component */}
            {/* Bus Assignment Card for Conductor */}
            {vehicle && (
                <Animated.View entering={FadeInDown.delay(50).duration(600)} style={styles.section}>
                    <LinearGradient colors={['#8B5CF6', '#7C3AED']} style={{ borderRadius: 20, padding: 20, shadowColor: "#8B5CF6", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                                <Bus size={26} color="#fff" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 16 }}>
                                <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600', letterSpacing: 0.5, marginBottom: 2 }}>ASSIGNED BUS</Text>
                                <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff' }}>{vehicle.licensePlate}</Text>
                            </View>
                            <HapticTouchable onPress={() => navigateOnce('/(screens)/transport/my-vehicle')} style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 }}>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Details</Text>
                            </HapticTouchable>
                        </View>
                        <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 12, padding: 12, flexDirection: 'row' }}>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Model</Text>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{vehicle.model || 'N/A'}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>Capacity</Text>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{vehicle.capacity || 'N/A'} Seats</Text>
                            </View>
                        </View>
                    </LinearGradient>
                </Animated.View>
            )}

            {activeTrip && (
                <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
                    <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/transport/attendance-marking', params: { tripId: activeTrip.id } })}>
                        <LinearGradient colors={['#10B981', '#059669']} style={{ borderRadius: 16, padding: 16 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                                    <Users size={24} color="#fff" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#fff' }}>Trip Active</Text>
                                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2 }}>Tap to mark attendance</Text>
                                </View>
                                <ChevronRight size={24} color="#fff" />
                            </View>
                        </LinearGradient>
                    </HapticTouchable>
                </Animated.View>
            )}

            <Animated.View entering={FadeInDown.delay(100).duration(600)} style={styles.section}>
                <View style={styles.statsGrid}>
                    <HapticTouchable style={{ flex: 1 }}>
                        <LinearGradient
                            colors={['#667eea', '#764ba2']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statCard, { shadowColor: '#667eea', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                        >
                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={styles.statIcon}><Calendar size={22} color="#fff" /></View>
                            <View>
                                <Text style={styles.statValue}>{trips.length}</Text>
                                <Text style={styles.statLabel}>Today's Trips</Text>
                            </View>
                        </LinearGradient>
                    </HapticTouchable>
                    <HapticTouchable style={{ flex: 1 }}>
                        <LinearGradient
                            colors={['#4ECDC4', '#26A69A']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statCard, { shadowColor: '#4ECDC4', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                        >
                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={styles.statIcon}><CheckCircle2 size={22} color="#fff" /></View>
                            <View>
                                <Text style={styles.statValue}>{completedTrips}</Text>
                                <Text style={styles.statLabel}>Completed</Text>
                            </View>
                        </LinearGradient>
                    </HapticTouchable>
                    <HapticTouchable style={{ flex: 1 }}>
                        <LinearGradient
                            colors={['#f093fb', '#f5576c']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[styles.statCard, { shadowColor: '#f093fb', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 }]}
                        >
                            <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                            <View style={{ position: 'absolute', bottom: -30, left: -20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.08)' }} />
                            <View style={styles.statIcon}><Users size={22} color="#fff" /></View>
                            <View>
                                <Text style={styles.statValue}>{totalStudents}</Text>
                                <Text style={styles.statLabel}>Students</Text>
                            </View>
                        </LinearGradient>
                    </HapticTouchable>
                </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.section}>
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <View style={styles.actionsGrid}>
                    {quickActions.map((action, index) => (
                        <Animated.View key={action.label} entering={FadeInDown.delay(300 + index * 50).duration(400)}>
                            <HapticTouchable onPress={() => action.href && navigateOnce(action.href)} disabled={!action.href}>
                                <View style={[styles.actionButton, { backgroundColor: action.bgColor, opacity: action.href ? 1 : 0.5 }]}>
                                    {/* Decorative Graphics */}
                                    <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                                    <View style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' }} />

                                    <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                                        <action.icon size={22} color={action.color} />
                                    </View>
                                    <Text style={styles.actionLabel} numberOfLines={1}>{action.label}</Text>
                                </View>
                            </HapticTouchable>
                        </Animated.View>
                    ))}
                </View>
            </Animated.View>

            {/* Upcoming Events */}
            <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Upcoming Events</Text>
                    <HapticTouchable onPress={() => navigateOnce('/(screens)/calendarscreen')}>
                        <Text style={styles.seeAll}>See All</Text>
                    </HapticTouchable>
                </View>
                <View style={styles.eventsContainer}>
                    {upcomingEvents && upcomingEvents.length > 0 ? (
                        upcomingEvents.slice(0, 4).map((event, index) => (
                            <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                <HapticTouchable onPress={() => navigateOnce({ pathname: '/(screens)/calendarscreen', params: { eventid: event.id } })}>
                                    <View style={styles.eventCard}>
                                        <View style={[styles.eventIcon, { backgroundColor: event.color + '20' }]}>
                                            <Text style={styles.eventEmoji}>{event.icon}</Text>
                                        </View>
                                        <View style={styles.eventInfo}>
                                            <Text style={styles.eventTitle}>{event.title}</Text>
                                            <View style={styles.eventDate}>
                                                <Calendar size={14} color="#666" />
                                                <Text style={styles.eventDateText}>{event.date}</Text>
                                            </View>
                                        </View>
                                        <ChevronRight size={20} color="#999" />
                                    </View>
                                </HapticTouchable>
                            </Animated.View>
                        ))
                    ) : (
                        <Animated.View
                            entering={FadeInRight.delay(700).duration(500)}
                            style={{
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 20,
                                opacity: 0.8,
                            }}
                        >
                            <CheckCircle2 size={26} color="#0469ff" />
                            <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                You're all caught up!
                            </Text>
                        </Animated.View>
                    )}
                </View>
            </Animated.View>
            {/* Recent Notices */}
            <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Recent Notices</Text>
                    <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                        <Text style={styles.seeAll}>View All</Text>
                    </HapticTouchable>
                </View>
                <View style={styles.noticesContainer}>
                    {notices && notices.length > 0 ? (
                        notices.map((notice, index) => (
                            <Animated.View
                                key={notice.id}
                                entering={FadeInRight.delay(900 + index * 100).duration(500)}
                            >
                                <HapticTouchable onPress={() => navigateOnce('/(tabs)/noticeboard')}>
                                    <View style={styles.noticeCard}>
                                        <View style={styles.noticeLeft}>
                                            <View style={[styles.noticeIcon, notice.unread && styles.unreadIcon]}>
                                                <Bell size={16} color={notice.unread ? '#0469ff' : '#999'} />
                                            </View>
                                            <View style={styles.noticeInfo}>
                                                <Text style={[styles.noticeTitle, notice.unread && styles.unreadTitle]} numberOfLines={1}>
                                                    {notice.title}
                                                </Text>
                                                <Text style={styles.noticeTime}>
                                                    {notice.time}
                                                </Text>
                                            </View>
                                        </View>
                                        {notice.unread && <View style={styles.unreadDot} />}
                                    </View>
                                </HapticTouchable>
                            </Animated.View>
                        ))
                    ) : (
                        <Animated.View
                            entering={FadeInRight.delay(900).duration(500)}
                            style={{
                                alignItems: 'center',
                                justifyContent: 'center',
                                paddingVertical: 20,
                                opacity: 0.8,
                            }}
                        >
                            <CheckCircle2 size={26} color="#0469ff" />
                            <Text style={{ marginTop: 8, fontSize: 14, color: '#555' }}>
                                No notices yet
                            </Text>
                        </Animated.View>
                    )}
                </View>
            </Animated.View>

            {/* Bottom Spacer */}
            <View style={{ height: 100 }} />
        </Animated.ScrollView>
    );
};
