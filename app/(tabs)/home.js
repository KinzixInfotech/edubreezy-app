import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { Bell, RefreshCw, Settings } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import HapticTouchable from '../components/HapticTouch';
import { useEffect, useMemo, useState } from 'react';
import Animated, { FadeInDown, FadeInRight, FadeInUp } from 'react-native-reanimated';
import { dataUi } from '../data/uidata'; // ← Your file
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const isSmallDevice = SCREEN_WIDTH < 375;

// Icon mapping
const IconMap = {
    refresh: RefreshCw,
    bell: Bell,
    settings: Settings,
};

export default function HomeScreen() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [unreadCount, setUnreadCount] = useState(0);
    const uiData = dataUi;
    useEffect(() => {
        (async () => {
            try {
                const stored = await SecureStore.getItemAsync('user');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    setUser(parsed);

                    // Count unread notifications
                    const unread = uiData.notifications.today.filter(n => !n.read).length;
                    setUnreadCount(unread);
                }
            } catch (error) {
                console.error('Failed to load user:', error);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const user_acc = useMemo(() => user, [user]);

    const getInitials = (name) => {
        if (!name) return '';
        const parts = name.trim().split(' ');
        if (parts.length === 1) return parts[0][0];
        if (parts.length === 2) return parts[0][0] + parts[1][0];
        return parts[0][0] + parts[parts.length - 1][0];
    };

    const getSchoolName = (name) => {
        if (!name) return '';
        const max = isSmallDevice ? 12 : 20;
        return name.length > max ? name.slice(0, max).toUpperCase() + '...' : name.toUpperCase();
    };

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

    // === DYNAMIC HEADER ===
    const Header = () => {
        const roleKey = (user_acc?.role?.name || 'student').toLowerCase();
        const config = uiData.header[roleKey] || uiData.header.student;
        console.log('header config', config);

        const replace = (str) =>
            str
                .replace('{name}', user_acc?.studentdatafull?.name || '')
                .replace('{role.name}', user_acc?.role?.name || '')
                .replace('{school.name}', user_acc?.school?.name || '')
                .replace('{department}', user_acc?.department || 'N/A')
                .replace('{child.class}', user_acc?.classs.className || 'N/A')
                .replace('{child.section}', user_acc?.section?.name || 'N/A');

        const title = replace(config.title);
        const subtitle = config.subtitle.map((item, i) => {
            const text = replace(item.text);
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
            return (
                <HapticTouchable
                    key={i}
                    onPress={isBell ? () => router.push('(screens)/notification') : undefined}
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

        return (
            <Animated.View entering={FadeInUp.duration(600)} style={styles.header}>
                <View style={styles.userRow}>
                    <HapticTouchable onPress={() => router.push('(tabs)/profile')}>
                        {user_acc?.profilePicture ? (
                            <Image source={{ uri: user_acc.profilePicture }} style={styles.avatar} />
                        ) : (
                            <View style={[styles.avatar, styles.fallbackAvatar]}>
                                <Text style={styles.fallbackText}>{getInitials(user_acc?.name)}</Text>
                            </View>
                        )}
                    </HapticTouchable>

                    <View style={styles.userInfo}>
                        <Text style={styles.name} numberOfLines={1}>{title}</Text>
                        <View style={styles.roleRow}>{subtitle}</View>
                    </View>
                </View>

                <View style={styles.iconRow}>{icons}</View>
            </Animated.View>
        );
    };

    // === ROLE-BASED CONTENT ===
    const renderContent = () => {
        const role = (user_acc?.role?.name || 'student').toLowerCase();

        switch (role) {
            case 'student': return <StudentView />;
            case 'teacher': return <TeacherView />;
            case 'admin': return <AdminView />;
            case 'parent': return <ParentView />;
            default: return <StudentView />;
        }
    };

    // === STUDENT VIEW (Using your uiData) ===
    const StudentView = () => (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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

    // === OTHER ROLE VIEWS (Stubbed – extend as needed) ===
    const TeacherView = () => (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Your Classes Today</Text>
            <Text style={{ padding: 16, color: '#666' }}>No classes scheduled.</Text>
        </ScrollView>
    );

    const AdminView = () => (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>School Dashboard</Text>
            <Text style={{ padding: 16, color: '#666' }}>Admin features coming soon.</Text>
        </ScrollView>
    );

    const ParentView = () => (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>Your Child</Text>
            <Text style={{ padding: 16, color: '#666' }}>Tracking attendance and progress.</Text>
        </ScrollView>
    );

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
    name: { fontSize: isSmallDevice ? 16 : 18, fontWeight: '600', color: '#111' },
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
});