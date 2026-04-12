import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, FlatList } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Users,
    Plus,
    Search,
    Bell,
    ArrowRight,
    BookOpen,
    Award,
    Calendar,
    CheckCircle2,
    TrendingUp,
    DollarSign,
    TimerIcon,
    ScrollText,
    Book,
    FileText,
    GraduationCap,
    ImageIcon,
    ChevronRight,
} from 'lucide-react-native';
import api from '../../../lib/api';
import HapticTouchable from '../../../app/components/HapticTouch';
import AddChildModal from '../../../app/components/AddChildModal';
import BannerCarousel from '../../../app/components/BannerCarousel';
import StatusRow from '../../../app/components/StatusRow';
import ActionSearchModal from '../../../app/components/ActionSearchModal';
import { homeQueryKeys } from '../queryKeys';
import { HOME_CACHE_CONFIG } from '../cacheConfig';
import { mapParentChildren } from '../parentUtils';

export default function ParentHome({
    schoolId,
    parentId,
    userId,
    user,
    refreshing,
    onRefresh,
    onScroll,
    paddingTop,

    refreshOffset,
    banner,
    navigateOnce,
    todaysEvents = [],
    setSelectedStatusGroup,
    setShowStatusUpload,
    styles = {},
    isTablet,
    SCREEN_WIDTH,
    PARENT_QUICK_STAT_VALUE_FONT_SIZE,
    PARENT_QUICK_STAT_LABEL_FONT_SIZE,
} = {}) {
    const [showSearchModal, setShowSearchModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showAddChildModal, setShowAddChildModal] = useState(false);
    const hasRestoredChild = useRef(false);
    const [selectedChild, setSelectedChild] = useState(null);
    const [lastViewedTimestamps, setLastViewedTimestamps] = useState({
        homework: null,
        exams: null,
    });

    const queryClient = useQueryClient();
    const icon = require('../../../assets/avatar_face.png');

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

    useEffect(() => {
        if (selectedChild?.studentId) {
            refreshBadgeTimestamps(selectedChild.studentId);
        }
    }, [selectedChild?.studentId, refreshBadgeTimestamps]);

    useFocusEffect(
        useCallback(() => {
            if (selectedChild?.studentId) {
                refreshBadgeTimestamps(selectedChild.studentId);
            }
        }, [selectedChild?.studentId, refreshBadgeTimestamps])
    );

    const {
        data: dashboardData,
        isLoading,
        refetch,
    } = useQuery({
        queryKey: homeQueryKeys.parentDashboard(schoolId, parentId, selectedChild?.studentId),
        queryFn: async () => {
            if (!schoolId || !parentId) return null;
            let url = `/mobile/dashboard/parent?schoolId=${schoolId}&parentId=${parentId}&userId=${userId}`;
            if (selectedChild?.studentId) {
                url += `&childId=${selectedChild.studentId}`;
            }
            const res = await api.get(url);
            return res.data?.data || res.data;
        },
        enabled: !!schoolId && !!parentId,
        placeholderData: (previousData) => previousData,
        ...HOME_CACHE_CONFIG.MODERATE,
    });

    const { data: badgeTimestamps } = useQuery({
        queryKey: homeQueryKeys.parentBadgeTimestamps(selectedChild?.studentId),
        queryFn: async () => {
            if (!selectedChild?.studentId) return { homework: null, exams: null };
            const [homeworkLastViewed, examLastViewed] = await Promise.all([
                SecureStore.getItemAsync(`homework_last_viewed_${selectedChild.studentId}`),
                SecureStore.getItemAsync(`exam_last_viewed_${selectedChild.studentId}`),
            ]);
            return { homework: homeworkLastViewed, exams: examLastViewed };
        },
        enabled: !!selectedChild?.studentId,
        staleTime: 0,
    });

    const notices = useMemo(() => (
        (dashboardData?.notices || []).map((n) => ({
            id: n.id,
            title: n.title,
            time: new Date(n.time || n.createdAt).toLocaleString(),
            unread: n.unread ?? !n.read,
        }))
    ), [dashboardData?.notices]);

    const data = dashboardData ? { children: dashboardData.children || [] } : null;
    const uiChildren = useMemo(() => mapParentChildren(data?.children || []), [data]);

    useEffect(() => {
        const restoreSelectedChild = async () => {
            if (hasRestoredChild.current) return;
            hasRestoredChild.current = true;

            try {
                const cachedChild = await SecureStore.getItemAsync(`selectedChild_${parentId}`);
                if (cachedChild) {
                    const parsed = JSON.parse(cachedChild);
                    if (uiChildren.some((c) => c.studentId === parsed.studentId)) {
                        setSelectedChild(parsed);
                        return;
                    }
                }
            } catch (e) {
                console.log('Error restoring selected child:', e);
            }

            if (uiChildren.length > 0) {
                setSelectedChild(uiChildren[0]);
            }
        };

        if (uiChildren.length > 0) {
            restoreSelectedChild();
        }
    }, [uiChildren, parentId]);

    useEffect(() => {
        const persistSelectedChild = async () => {
            if (!selectedChild || !parentId) return;
            try {
                await SecureStore.setItemAsync(
                    `selectedChild_${parentId}`,
                    JSON.stringify(selectedChild)
                );
            } catch (e) {
                console.log('Error persisting selected child:', e);
            }
        };

        persistSelectedChild();
    }, [selectedChild, parentId]);

    const handleAddChildSuccess = useCallback(async () => {
        try {
            await queryClient.invalidateQueries({
                queryKey: homeQueryKeys.parentDashboardRoot(schoolId, parentId),
                refetchType: 'active',
            });
            await refetch();
        } catch (error) {
            console.error('Failed to refresh after adding child:', error);
        }
    }, [parentId, queryClient, refetch, schoolId]);
    const childStats = dashboardData?.childStats;
    const attendanceStats = childStats?.attendance;
    const feeData = childStats?.fees;

    const homeworkData = {
        homework: childStats?.homework?.homework || [],
        lastViewed: badgeTimestamps?.homework,
    };

    const examBadgeData = {
        results: childStats?.exams?.results || [],
        stats: childStats?.exams?.stats || {},
        lastViewed: badgeTimestamps?.exams,
    };

    const formatAbbr = (amount) => {
        if (!amount || amount === 0) return '0';
        const value = Math.abs(amount);
        if (value >= 10000000) return `${Math.round(value / 10000000)}Cr`;
        if (value >= 100000) return `${(value / 100000).toFixed(1).replace(/\.0$/, '')}L`;
        if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}K`;
        return `${Math.round(value)}`;
    };

    const childAttendance = attendanceStats?.monthlyStats?.attendancePercentage ?? 0;

    const paidFee = feeData?.paidAmount || 0;
    const pendingFee = feeData?.balanceAmount || 0;
    const feeStatusDisplay = `₹${formatAbbr(paidFee)}`;

    const upcomingEvents = dashboardData?.events || [];
    const recentNotice = notices.find((n) => n.unread) || null;
    const nextEvent = upcomingEvents[0] || null;

    const pendingHomework = (homeworkData.homework || []).filter((hw) => {
        const isPending = !hw.mySubmission || hw.mySubmission.status === 'PENDING';
        if (!isPending) return false;

        if (lastViewedTimestamps.homework) {
            const lastViewedDate = new Date(lastViewedTimestamps.homework);
            const homeworkDate = new Date(hw.createdAt);
            return homeworkDate > lastViewedDate;
        }

        return true;
    }).length;

    const isStatsLoading = isLoading && !dashboardData;

    const newExamResults = (() => {
        if (!lastViewedTimestamps.exams) return 0;

        const lastViewedDate = new Date(lastViewedTimestamps.exams);
        return (examBadgeData.results || []).filter((r) => {
            const createdDate = r.createdAt ? new Date(r.createdAt) : null;
            return createdDate && createdDate > lastViewedDate;
        }).length;
    })();

    const childPerformance = (() => {
        let score = 0;
        let weight = 0;

        const attendancePercent = attendanceStats?.monthlyStats?.attendancePercentage;
        if (attendancePercent !== undefined && attendancePercent !== null) {
            score += attendancePercent * 0.4;
            weight += 0.4;
        }

        const examPercent = examBadgeData?.stats?.avgPercentage;
        if (examPercent !== undefined && examPercent !== null) {
            score += examPercent * 0.6;
            weight += 0.6;
        }

        if (weight > 0) return `${Math.round(score / weight)}%`;
        return '0';
    })();

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
                    color: '#4CAF50',
                    bgColor: '#E8F5E9',
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
                {
                    icon: GraduationCap,
                    label: 'Progress Card',
                    color: '#8B5CF6',
                    bgColor: '#F3E8FF',
                    href: '/hpc/parent-view',
                    params: { studentId: selectedChild?.studentId, studentName: selectedChild?.name },
                },
                {
                    icon: ImageIcon,
                    label: 'Gallery',
                    color: '#EC4899',
                    bgColor: '#FCE7F3',
                    href: '/(screens)/gallery',
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
                    onRefresh={() => onRefresh({ parentId, selectedChildId: selectedChild?.studentId })}
                    tintColor="#0469ff"
                    colors={['#0469ff']}
                    progressViewOffset={refreshOffset}
                />
            }
        >
            {banner}

            {/* Status Row */}
            <StatusRow
                schoolId={schoolId}
                userId={userId}
                userRole={user?.role?.name}
                userName={user?.name}
                userAvatar={user?.profilePicture}
                onStatusPress={(group) => setSelectedStatusGroup(group)}
                onMyStatusPress={() => setShowStatusUpload(true)}
            />

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
            <BannerCarousel schoolId={schoolId} role={user?.role?.name} />
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
                <View style={{ marginTop: 12 }}>
                    {uiChildren.length === 1 ? (
                        // Single child - full width card
                        <Animated.View entering={FadeInRight.delay(200).duration(500)}>
                            <HapticTouchable onPress={() => setSelectedChild(uiChildren[0])}>
                                <LinearGradient
                                    colors={['#0469ff', '#0347b8']}
                                    style={{
                                        flexDirection: 'row',
                                        padding: 16,
                                        borderRadius: 16,
                                        gap: 12,
                                        position: 'relative',
                                        overflow: 'hidden',
                                        alignItems: 'center',
                                        shadowColor: '#0469ff',
                                        shadowOpacity: 0.3,
                                        shadowRadius: 12,
                                        shadowOffset: { width: 0, height: 6 },
                                        elevation: 8,
                                    }}
                                >
                                    <Text style={{ position: 'absolute', top: 5, right: 50, fontSize: 24, color: 'rgba(255,255,255,0.25)', fontWeight: '300' }}>+</Text>
                                    <Text style={{ position: 'absolute', top: 40, right: 15, fontSize: 18, color: 'rgba(255,255,255,0.2)', fontWeight: '300' }}>×</Text>
                                    <Text style={{ position: 'absolute', bottom: 8, right: 80, fontSize: 20, color: 'rgba(255,255,255,0.18)', fontWeight: '300' }}>÷</Text>
                                    <View style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.08)' }} />

                                    <Image
                                        source={
                                            uiChildren[0]?.avatar && !uiChildren[0].avatar.includes('default.png')
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
                                            <View style={[styles.metaBadge, styles.selectedBadge]}>
                                                <Text style={[styles.metaText, styles.selectedText]}>
                                                    {uiChildren[0].admissionNo || 'N/A'}
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
                    ) : (
                        // Multiple children - snap carousel, each card = full section width
                        (() => {
                            const CARD_WIDTH = SCREEN_WIDTH - 32;
                            const CARD_GAP = 12;
                            const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;
                            const selectedIndex = Math.max(0, uiChildren.findIndex(c => c.id === selectedChild?.id));

                            return (
                                <FlatList
                                    data={uiChildren}
                                    horizontal
                                    pagingEnabled={false}
                                    showsHorizontalScrollIndicator={false}
                                    snapToInterval={SNAP_INTERVAL}
                                    snapToAlignment="start"
                                    decelerationRate="fast"
                                    initialScrollIndex={selectedIndex}
                                    getItemLayout={(_, index) => ({
                                        length: SNAP_INTERVAL,
                                        offset: SNAP_INTERVAL * index,
                                        index,
                                    })}
                                    contentContainerStyle={{ paddingRight: 32 }}
                                    keyExtractor={(item) => item.id}
                                    // NO onMomentumScrollEnd - selection only changes on tap
                                    renderItem={({ item: child, index }) => {
                                        const isSelected = selectedChild?.id === child.id;
                                        return (
                                            <Animated.View
                                                entering={FadeInRight.delay(200 + index * 100).duration(500)}
                                                style={{
                                                    width: CARD_WIDTH,
                                                    marginRight: CARD_GAP,
                                                }}
                                            >
                                                <HapticTouchable onPress={() => setSelectedChild(child)}>
                                                    <LinearGradient
                                                        colors={isSelected ? ['#0469ff', '#0347b8'] : ['#f8f9fa', '#e9ecef']}
                                                        style={{
                                                            flexDirection: 'row',
                                                            padding: 16,
                                                            borderRadius: 16,
                                                            gap: 12,
                                                            position: 'relative',
                                                            overflow: 'hidden',
                                                            alignItems: 'center',
                                                            minHeight: 100,
                                                            shadowColor: isSelected ? '#0469ff' : '#000',
                                                            shadowOpacity: isSelected ? 0.3 : 0.08,
                                                            shadowRadius: isSelected ? 12 : 4,
                                                            shadowOffset: { width: 0, height: isSelected ? 6 : 2 },
                                                            elevation: isSelected ? 8 : 2,
                                                        }}
                                                    >
                                                        {isSelected && (
                                                            <>
                                                                <Text style={{ position: 'absolute', top: 8, right: 45, fontSize: 14, color: 'rgba(255,255,255,0.15)', fontWeight: '300' }}>+</Text>
                                                                <Text style={{ position: 'absolute', top: 35, right: 20, fontSize: 10, color: 'rgba(255,255,255,0.12)', fontWeight: '300' }}>×</Text>
                                                                <Text style={{ position: 'absolute', bottom: 12, right: 70, fontSize: 16, color: 'rgba(255,255,255,0.1)', fontWeight: '300' }}>÷</Text>
                                                                <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.05)' }} />
                                                            </>
                                                        )}

                                                        <Image
                                                            source={
                                                                child?.avatar && !child.avatar.includes('default.png')
                                                                    ? { uri: child.avatar }
                                                                    : icon
                                                            }
                                                            style={styles.childAvatar}
                                                        />
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
                                                                <View style={[styles.metaBadge, isSelected && styles.selectedBadge]}>
                                                                    <Text style={[styles.metaText, isSelected && styles.selectedText]}>
                                                                        {child.admissionNo || 'N/A'}
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
                            );
                        })()
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
                                    <Text
                                        style={[styles.statValue, { fontSize: PARENT_QUICK_STAT_VALUE_FONT_SIZE }]}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.7}
                                    >
                                        {childAttendance === 0 ? '0%' : `${Math.round(childAttendance)}%`}
                                    </Text>
                                    <Text style={[styles.statLabel, { fontSize: PARENT_QUICK_STAT_LABEL_FONT_SIZE }]}>Attendance</Text>
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
                                    <Text
                                        style={[styles.statValue, { fontSize: PARENT_QUICK_STAT_VALUE_FONT_SIZE }]}
                                        numberOfLines={1}
                                        ellipsizeMode="tail"
                                    >
                                        {childPerformance}
                                    </Text>
                                    <Text style={[styles.statLabel, { fontSize: PARENT_QUICK_STAT_LABEL_FONT_SIZE }]}>Performance</Text>
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
                                    <Text
                                        style={[styles.statValue, { fontSize: PARENT_QUICK_STAT_VALUE_FONT_SIZE }]}
                                        numberOfLines={1}
                                        adjustsFontSizeToFit
                                        minimumFontScale={0.7}
                                    >
                                        {feeStatusDisplay}
                                    </Text>
                                    <Text style={[styles.statLabel, { fontSize: PARENT_QUICK_STAT_LABEL_FONT_SIZE }]}>Fee Status</Text>
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>{group.title}</Text>
                            {groupIndex === 0 && (
                                <HapticTouchable onPress={() => setShowSearchModal(true)}>
                                    <View style={{ padding: 8, backgroundColor: 'rgba(4, 105, 255, 0.1)', borderRadius: 12 }}>
                                        <Search size={20} color="#0469ff" />
                                    </View>
                                </HapticTouchable>
                            )}
                        </View>
                        <View style={styles.actionsGrid}>
                            {group.actions.map((action, index) => {
                                const totalItems = group.actions.length;
                                // Tablet: 3 columns, Mobile: 2 columns
                                const columns = isTablet ? 3 : 2;
                                // Full width only for single item
                                const isFullWidth = totalItems === 1;
                                // Calculate width based on columns
                                const itemWidth = isTablet ? '31.5%' : '48%';

                                return (
                                    <Animated.View
                                        key={action.label}
                                        entering={FadeInDown.delay(500 + index * 50).duration(400)}
                                        style={{ width: isFullWidth ? '100%' : itemWidth }}
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
                                                { backgroundColor: action.bgColor, width: '100%' }
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
                        <View style={styles.emptyStateCard}>
                            <View style={styles.emptyStateIconContainer}>
                                <Calendar size={28} color="#10b981" />
                            </View>
                            <Text style={styles.emptyStateTitle}>You're all caught up!</Text>
                            <Text style={styles.emptyStateSubtitle}>No upcoming events scheduled</Text>
                            <HapticTouchable
                                onPress={() => navigateOnce('/(screens)/calendarscreen')}
                                style={styles.emptyStateButton}
                            >
                                <Text style={styles.emptyStateButtonText}>View Calendar</Text>
                                <ChevronRight size={16} color="#0469ff" />
                            </HapticTouchable>
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
                        <View style={styles.emptyStateCard}>
                            <View style={[styles.emptyStateIconContainer, { backgroundColor: '#FEF3C7' }]}>
                                <Bell size={28} color="#F59E0B" />
                            </View>
                            <Text style={styles.emptyStateTitle}>No new notices</Text>
                            <Text style={styles.emptyStateSubtitle}>You're up to date with all announcements</Text>
                            <HapticTouchable
                                onPress={() => navigateOnce('/(tabs)/noticeboard')}
                                style={styles.emptyStateButton}
                            >
                                <Text style={styles.emptyStateButtonText}>View Noticeboard</Text>
                                <ChevronRight size={16} color="#0469ff" />
                            </HapticTouchable>
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

            <ActionSearchModal
                visible={showSearchModal}
                onClose={() => setShowSearchModal(false)}
                actionGroups={actionGroups}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onNavigate={(action) => {
                    if (action.params) {
                        navigateOnce(action.href, action.params);
                    } else {
                        navigateOnce(action.href || '');
                    }
                }}
            />
        </Animated.ScrollView>
    )
}
