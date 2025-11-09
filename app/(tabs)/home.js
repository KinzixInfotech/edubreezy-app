import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Dimensions, RefreshControl } from 'react-native';
import { Link, router } from 'expo-router';
import { Bell, Calendar, TrendingUp, FileText, DollarSign, MessageCircle, Award, BookOpen, Clock, Users, ChevronRight, RefreshCw, Settings, Plus, CheckCircle2 } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../components/HapticTouch';
import { useEffect, useMemo, useState, useCallback, act } from 'react';
import Animated, { FadeInDown, FadeInRight, FadeInUp } from 'react-native-reanimated';
import { dataUi } from '../data/uidata';

import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import GlowingStatusBar from '../components/GlowingStatusBar';
import AddChildModal from '../components/AddChildModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallDevice = SCREEN_WIDTH < 375;

// Icon mapping
const IconMap = {
    refresh: RefreshCw,
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
};

export default function HomeScreen() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const queryClient = useQueryClient();
    const uiData = dataUi;

    useEffect(() => {
        loadUser();
        // router.replace('/(screens)/greeting')
    }, []);

    const loadUser = async () => {
        try {
            const stored = await SecureStore.getItemAsync('user');
            if (stored) {
                const parsed = JSON.parse(stored);
                setUser(parsed);
            }
        } catch (error) {
            console.error('Failed to load user:', error);
        } finally {
            setLoading(false);
        }
    };

    const user_acc = useMemo(() => user, [user]);
    const userId = user_acc?.id;
    const schoolId = user_acc?.schoolId;

    // Fetch notifications for badge count
    const { data: notificationData } = useQuery({
        queryKey: QUERY_KEYS.notifications(userId),
        queryFn: async () => {
            const res = await api.get(`/notifications/${userId}`);
            return res.data;
        },
        enabled: Boolean(userId),
        staleTime: 1000 * 60 * 2,
        select: (data) => ({
            unreadCount: data?.notifications?.filter(n => !n.read).length || 0
        })
    });

    const unreadCount = notificationData?.unreadCount || uiData.notifications.today.filter(n => !n.read).length;

    // Pull to refresh handler
    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await queryClient.invalidateQueries();
            await loadUser();
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

    if (loading) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
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
                '{name}': user_acc?.studentdatafull?.name || '',
                '{role.name}': user_acc?.role?.name || '',
                '{school.name}': user_acc?.school?.name || '',
                '{department}': user_acc?.department || 'N/A',
                '{child.class}': user_acc?.classs?.className || 'N/A',
                '{child.section}': user_acc?.section?.name || 'N/A',
            },
            teacher: {
                '{name}': user_acc?.name || '',
                '{role.name}': user_acc?.role?.name || '',
                '{school.name}': user_acc?.school?.name || '',
                '{department}': user_acc?.department || 'N/A',
            },
            parent: {
                '{name}': user_acc?.name || '',
                '{role.name}': user_acc?.role?.name || '',
                '{child.name}': user_acc?.studentdatafull?.name || '',
                '{emailparent}': user_acc?.email || '',
                '{child.class}': user_acc?.classs?.className || 'N/A',
                '{child.section}': user_acc?.section?.name || 'N/A',
                '{school.name}': user_acc?.school?.name || '',
            },
            admin: {
                '{name}': user_acc?.name || '',
                '{role.name}': user_acc?.role?.name || '',
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
    const Header = () => {
        const roleKey = user_acc?.role?.name?.toLowerCase() ?? '';
        const config = uiData.header[roleKey] || uiData.header.student;

        const title = replaceDynamic(config.title, roleKey);
        const subtitle = config.subtitle.map((item, i) => {
            const text = replaceDynamic(item.text, roleKey);
            const style =
                item.type === 'role' ? styles.role :
                    item.type === 'separator' ? styles.separator :
                        item.type === 'school' ? styles.school :
                            item.type === 'department' ? styles.school :
                                item.type === 'childClass' ? styles.school :
                                    item.type === 'static' ? styles.role : styles.role;
            return <Text key={i} style={style} numberOfLines={1}>{text}</Text>;
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
                    <View style={styles.iconButton}>
                        <Icon size={isSmallDevice ? 18 : 20} color="#0469ff" />
                        {isBell && unreadCount > 0 && (
                            <Animated.View entering={FadeInDown.springify()} style={styles.badge}>
                                <Text style={styles.badgeText}>{unreadCount}</Text>
                            </Animated.View>
                        )}
                    </View>
                </HapticTouchable>
            );
        });
        function getGreeting() {
            // Get current time in IST
            const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
            const hour = new Date(now).getHours();

            if (hour < 12) {
                return "Good Morning";
            } else if (hour < 18) {
                return "Good Afternoon";
            } else {
                return "Good Evening";
            }
        }


        return (
            <Animated.View entering={FadeInUp.duration(600)} style={styles.header}>
                <View style={styles.headerLeft}>
                    <HapticTouchable onPress={() => router.push('(tabs)/profile')}>
                        {user_acc?.profilePicture && user_acc.profilePicture !== 'default.png' ? (
                            <View style={styles.avatarContainer}>
                                <Image source={{ uri: user_acc.profilePicture }} style={styles.avatar} />
                            </View>
                        ) : (
                            <View style={[styles.avatar, styles.parentAvatar]}>
                                <Text style={styles.fallbackText}>
                                    {user_acc?.name ? getInitials(user_acc.name) : 'U'}
                                </Text>
                            </View>
                        )}
                    </HapticTouchable>
                    <View style={styles.headerInfo}>
                        <Text style={styles.welcomeText}>{getGreeting()},</Text>
                        <Text style={styles.name} numberOfLines={1}>{title}</Text>
                        <View style={styles.parentEmail}>{subtitle}</View>
                    </View>
                </View>
                <View style={styles.iconRow}>{icons}</View>
            </Animated.View>
        );
    };

    // === ROLE-BASED CONTENT ===
    const renderContent = () => {
        const role = user_acc?.role?.name ? user_acc.role.name.toLowerCase() : '';

        switch (role) {
            case 'student':
                return <StudentView refreshing={refreshing} onRefresh={onRefresh} />;
            case 'teacher':
                return <TeacherView refreshing={refreshing} onRefresh={onRefresh} />;
            case 'admin':
                return <AdminView refreshing={refreshing} onRefresh={onRefresh} />;
            case 'parent':
                return <ParentView
                    schoolId={user_acc?.schoolId}
                    parentId={user_acc?.parentData.id}
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                />;
            default:
                return <StudentView refreshing={refreshing} onRefresh={onRefresh} />;
        }
    };

    // === STUDENT VIEW ===
    const StudentView = ({ refreshing, onRefresh }) => (
        <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#0469ff"
                    colors={['#0469ff']}
                />
            }
        >
            {/* Upcoming Exam */}
            <Animated.View
                entering={FadeInDown.delay(100).duration(600)}
                style={[styles.examCard, { backgroundColor: uiData.upcomingExam.backgroundColor }]}
            >
                <View style={styles.examContent}>
                    <View style={styles.examTextContainer}>
                        <Text style={styles.examTitle}>{uiData.upcomingExam.title}</Text>
                        <Text style={styles.examDate}>{uiData.upcomingExam.date}</Text>
                        <Text style={styles.examSubject}>{uiData.upcomingExam.subject}</Text>
                    </View>
                    <View style={styles.examIcon}>
                        <Text style={styles.examEmoji}>{uiData.upcomingExam.icon}</Text>
                    </View>
                </View>
            </Animated.View>

            {/* Today's Classes */}
            <View style={styles.section}>
                <Animated.View entering={FadeInDown.delay(200).duration(600)} style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Today's Classes</Text>
                    <HapticTouchable>
                        <Text style={styles.seeAll}>See All</Text>
                    </HapticTouchable>
                </Animated.View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.classesRow}>
                    {uiData.todaysClasses.map((cls, index) => (
                        <Animated.View
                            key={cls.id}
                            entering={FadeInRight.delay(300 + index * 100).duration(600)}
                            style={[styles.classCard, { backgroundColor: cls.backgroundColor }]}
                        >
                            <Text style={styles.classSubject}>{cls.subject}</Text>
                            <Text style={styles.classTime}>{cls.time}</Text>
                            <Text style={styles.classTopic} numberOfLines={2}>{cls.topic}</Text>
                            <View style={styles.classTeacher}>
                                <Image source={{ uri: cls.teacher.avatar }} style={styles.teacherAvatar} />
                                <Text style={styles.teacherName} numberOfLines={1}>{cls.teacher.name}</Text>
                            </View>
                        </Animated.View>
                    ))}
                </ScrollView>
            </View>

            {/* Quick Access */}
            <View style={styles.section}>
                <Animated.View entering={FadeInDown.delay(500).duration(600)} style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Quick Access</Text>
                    <HapticTouchable>
                        <Text style={styles.seeAll}>See All</Text>
                    </HapticTouchable>
                </Animated.View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickAccessScrollView}>
                    {uiData.quickAccess.map((item, index) => (
                        <Animated.View key={item.id} entering={FadeInRight.delay(600 + index * 80).duration(500)}>
                            <HapticTouchable>
                                <View style={[styles.quickAccessButton, { backgroundColor: item.backgroundColor }]}>
                                    <Text style={[styles.quickAccessText, { color: item.textColor }]} numberOfLines={1}>
                                        {item.label}
                                    </Text>
                                </View>
                            </HapticTouchable>
                        </Animated.View>
                    ))}
                </ScrollView>
            </View>

            {/* Subjects Grid */}
            <View style={styles.subjectsGrid}>
                {uiData.subjects.map((subject, index) => (
                    <Animated.View
                        key={subject.id}
                        entering={FadeInDown.delay(800 + index * 100).duration(600)}
                        style={[styles.subjectCard, { backgroundColor: subject.backgroundColor }]}
                    >
                        <Text style={styles.subjectName} numberOfLines={1}>{subject.name}</Text>
                        <Text style={styles.subjectChapter} numberOfLines={1}>{subject.chapter}</Text>
                        <Text style={styles.subjectSubmission} numberOfLines={1}>{subject.submission}</Text>
                    </Animated.View>
                ))}
            </View>
        </ScrollView>
    );

    // === TEACHER VIEW ===
    const TeacherView = ({ refreshing, onRefresh }) => (
        <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#0469ff"
                    colors={['#0469ff']}
                />
            }
        >
            <Text style={styles.sectionTitle}>Your Classes Today</Text>
            <Text style={{ padding: 16, color: '#666' }}>No classes scheduled.</Text>
        </ScrollView>
    );

    // === ADMIN VIEW ===
    const AdminView = ({ refreshing, onRefresh }) => (
        <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
                <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                    tintColor="#0469ff"
                    colors={['#0469ff']}
                />
            }
        >
            <Text style={styles.sectionTitle}>School Dashboard</Text>
            <Text style={{ padding: 16, color: '#666' }}>Admin features coming soon.</Text>
        </ScrollView>
    );



    // / Complete ParentView Component
    const ParentView = ({ schoolId, parentId, refreshing, onRefresh }) => {
        const [showAddChildModal, setShowAddChildModal] = useState(false);
        const [selectedChild, setSelectedChild] = useState(null);
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
            staleTime: 0,               // ← force fresh data on mount / category change
        });
        // console.log(recentNotices);
        const notices = recentNotices?.notices?.map((n) => ({
            id: n.id,
            title: n.title,
            time: new Date(n.createdAt).toLocaleString(), // or format like "2 hours ago"
            unread: !n.read,
        })) || [];
        // qucik access for parent
        const actionGroups = [
            {
                title: 'Quick Actions',
                actions: [
                    { icon: TrendingUp, label: 'Performance', color: '#0469ff', bgColor: '#E3F2FD', href: "/payfees" },
                    { icon: Calendar, label: 'Attendance', color: '#4ECDC4', bgColor: '#E0F7F4', href: "/payfees" },
                    { icon: MessageCircle, label: 'Messages', color: '#9C27B0', bgColor: '#F3E5F5', href: "/payfees" },
                ],
            },
            {
                title: 'Examination',
                actions: [
                    { icon: FileText, label: 'Report Card', color: '#FFD93D', bgColor: '#FFF9E0', href: "/payfees" },
                    { icon: BookOpen, label: 'Assignments', color: '#FF9800', bgColor: '#FFF3E0', href: "/payfees" },
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
            placeholderData: { parent: null, children: [] },
            staleTime: 1000 * 60,
        });

        const uiChildren = useMemo(() =>
            data?.children?.map((child) => ({
                id: child.studentId,
                studentId: child.studentId,
                name: child.name,
                class: child.class,
                section: child.section,
                rollNo: child.rollNumber,
                avatar: child.profilePicture,
                attendance: Math.floor(Math.random() * 21) + 80,
                feeStatus: "Paid",
                performance: "Excellent",
                pendingFee: 0
            })) || [],
            [data]);

        const parentData = useMemo(() => ({
            name: "Sarah Johnson",
            email: "sarah.johnson@email.com",
            phone: "+91 9876543210",
            upcomingEvents: [
                { id: 1, title: "Parent-Teacher Meeting", date: "Nov 15, 2025", icon: "👥", color: "#FF6B6B" },
                { id: 2, title: "Annual Sports Day", date: "Nov 20, 2025", icon: "⚽", color: "#4ECDC4" },
                { id: 3, title: "Science Exhibition", date: "Nov 25, 2025", icon: "🔬", color: "#FFD93D" }
            ],
            recentNotices: [
                { id: 1, title: "Winter Break Schedule", time: "2 hours ago", unread: true },
                { id: 2, title: "Fee Payment Reminder", time: "1 day ago", unread: true },
                { id: 3, title: "School Uniform Guidelines", time: "3 days ago", unread: false }
            ]
        }), []);

        useEffect(() => {
            if (uiChildren.length > 0 && !selectedChild) {
                setSelectedChild(uiChildren[0]);
            }
        }, [uiChildren, selectedChild]);

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

        // Main view with children
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
                    />
                }
            >
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

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.childrenScroll}>
                        {uiChildren.map((child, index) => (
                            <Animated.View key={child.id} entering={FadeInRight.delay(200 + index * 100).duration(500)}>
                                <HapticTouchable onPress={() => setSelectedChild(child)}>
                                    <LinearGradient
                                        colors={selectedChild?.id === child.id ? ['#0469ff', '#0347b8'] : ['#f8f9fa', '#e9ecef']}
                                        style={[styles.childCard, selectedChild?.id === child.id && styles.selectedChildCard]}
                                    >
                                        <Image source={{ uri: child.avatar }} style={styles.childAvatar} />
                                        <View style={styles.childInfo}>
                                            <Text style={[styles.childName, selectedChild?.id === child.id && styles.selectedText]} numberOfLines={1}>
                                                {child.name}
                                            </Text>
                                            <Text style={[styles.childClass, selectedChild?.id === child.id && styles.selectedSubText]}>
                                                Class {child.class} - {child.section}
                                            </Text>
                                            <View style={styles.childMeta}>
                                                <View style={[styles.metaBadge, selectedChild?.id === child.id && styles.selectedBadge]}>
                                                    <Text style={[styles.metaText, selectedChild?.id === child.id && styles.selectedText]}>
                                                        Roll: {child.rollNo}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                        {selectedChild?.id === child.id && (
                                            <View style={styles.selectedIndicator}>
                                                <Text style={styles.checkmark}>✓</Text>
                                            </View>
                                        )}
                                    </LinearGradient>
                                </HapticTouchable>
                            </Animated.View>
                        ))}
                    </ScrollView>
                </Animated.View>

                {/* Quick Stats for Selected Child */}
                <Animated.View entering={FadeInDown.delay(300).duration(600)} style={styles.section}>
                    <View style={styles.statsGrid}>
                        <LinearGradient colors={['#4ECDC4', '#44A08D']} style={styles.statCard}>
                            <View style={styles.statIcon}>
                                <Clock size={24} color="#fff" />
                            </View>
                            <Text style={styles.statValue}>{selectedChild?.attendance}%</Text>
                            <Text style={styles.statLabel}>Attendance</Text>
                        </LinearGradient>

                        <LinearGradient colors={['#FFD93D', '#F6C90E']} style={styles.statCard}>
                            <View style={styles.statIcon}>
                                <Award size={24} color="#fff" />
                            </View>
                            <Text style={styles.statValue}>{selectedChild?.performance}</Text>
                            <Text style={styles.statLabel}>Performance</Text>
                        </LinearGradient>

                        <LinearGradient colors={selectedChild?.pendingFee > 0 ? ['#FF6B6B', '#EE5A6F'] : ['#51CF66', '#37B24D']} style={styles.statCard}>
                            <View style={styles.statIcon}>
                                <DollarSign size={24} color="#fff" />
                            </View>
                            <Text style={styles.statValue}>{selectedChild?.feeStatus}</Text>
                            <Text style={styles.statLabel}>Fee Status</Text>
                        </LinearGradient>
                    </View>
                </Animated.View>
                {/* Quick Actions */}
                {actionGroups && actionGroups.map((group, groupIndex) => (
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
                                    <HapticTouchable
                                        onPress={() => {
                                            if (action.params) {
                                                router.push({
                                                    pathname: action.href,
                                                    params: action.params,
                                                });
                                            } else {
                                                router.push(action.href || '');
                                            }
                                        }}
                                    >
                                        <View style={[styles.actionButton, { backgroundColor: action.bgColor }]}>
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
                ))}
                {/* Upcoming Events */}
                <Animated.View entering={FadeInDown.delay(600).duration(600)} style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Events</Text>
                        <HapticTouchable>
                            <Text style={styles.seeAll}>See All</Text>
                        </HapticTouchable>
                    </View>
                    <View style={styles.eventsContainer}>
                        {parentData.upcomingEvents.map((event, index) => (
                            <Animated.View key={event.id} entering={FadeInRight.delay(700 + index * 100).duration(500)}>
                                <HapticTouchable>
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
                        ))}
                    </View>
                </Animated.View>

                {/* Recent Notices */}
                <Animated.View entering={FadeInDown.delay(800).duration(600)} style={[styles.section, { marginBottom: 30 }]}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Recent Notices</Text>
                        <HapticTouchable onPress={() => router.push('/(tabs)/noticeboard')}>
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
                                    <HapticTouchable onPress={() => router.push('/(tabs)/noticeboard')}>
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
                                    You’re all caught up!
                                </Text>
                            </Animated.View>
                        )}
                    </View>
                </Animated.View>

                {/* Add Child Modal */}
                <AddChildModal
                    visible={showAddChildModal}
                    onClose={() => setShowAddChildModal(false)}
                    parentId={parentId}
                    schoolId={schoolId}
                    onSuccess={handleAddChildSuccess}
                />
            </ScrollView>
        );
    };
    return (
        <View style={styles.container}>
            <Header />
            {renderContent()}
        </View>
    );
}

// === STYLES ===
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: isSmallDevice ? 12 : 16,
        paddingBottom: 12,
        paddingTop: 50,
        borderBottomColor: '#f0f0f0',
        borderBottomWidth: 1,
        backgroundColor: '#fff',
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
        marginTop: 2,
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
    section: { marginBottom: 20 },
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
        color: '#666',
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
        marginTop: 20,
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
    statsGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    statCard: {
        flex: 1,
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    statIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fff',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '500',
    },
    actionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginTop: 12,
    },
    actionButton: {
        width: (SCREEN_WIDTH - (isSmallDevice ? 48 : 56)) / 3,
        padding: 14,
        borderRadius: 16,
        alignItems: 'center',
        gap: 8,
    },
    actionIcon: {
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#333',
        textAlign: 'center',
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
});
