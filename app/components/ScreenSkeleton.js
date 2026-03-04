// Reusable Skeleton Loading Components for Student Screens
import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Shimmer hook ───
export function useShimmer() {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        const loop = Animated.loop(
            Animated.timing(anim, { toValue: 1, duration: 1200, useNativeDriver: true })
        );
        loop.start();
        return () => loop.stop();
    }, [anim]);
    return anim;
}

// ─── Single shimmer bone ───
export function Bone({ width, height, borderRadius = 8, style, animValue }) {
    const translateX = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
    });
    return (
        <View style={[{ width, height, borderRadius, backgroundColor: '#E8EDF5', overflow: 'hidden' }, style]}>
            <Animated.View style={{ ...StyleSheet.absoluteFillObject, transform: [{ translateX }] }}>
                <LinearGradient
                    colors={['transparent', 'rgba(255,255,255,0.55)', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFillObject}
                />
            </Animated.View>
        </View>
    );
}

// ─── Header skeleton (back button + title) ───
export function HeaderSkeleton({ anim }) {
    return (
        <View style={sk.header}>
            <Bone animValue={anim} width={40} height={40} borderRadius={20} />
            <View style={{ flex: 1, alignItems: 'center' }}>
                <Bone animValue={anim} width={160} height={18} borderRadius={6} />
                <Bone animValue={anim} width={100} height={12} borderRadius={5} style={{ marginTop: 6 }} />
            </View>
            <View style={{ width: 40 }} />
        </View>
    );
}

// ─── Stats row (2-4 stat boxes) ───
export function StatsRowSkeleton({ anim, count = 4 }) {
    return (
        <View style={sk.statsRow}>
            {Array.from({ length: count }).map((_, i) => (
                <View key={i} style={sk.statBox}>
                    <Bone animValue={anim} width={24} height={24} borderRadius={12} />
                    <Bone animValue={anim} width={40} height={20} borderRadius={5} style={{ marginTop: 8 }} />
                    <Bone animValue={anim} width={50} height={10} borderRadius={4} style={{ marginTop: 4 }} />
                </View>
            ))}
        </View>
    );
}

// ─── Card skeleton (generic rounded card) ───
export function CardSkeleton({ anim, lines = 3, showIcon = false }) {
    return (
        <View style={sk.card}>
            {showIcon && (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                    <Bone animValue={anim} width={36} height={36} borderRadius={18} />
                    <Bone animValue={anim} width={120} height={16} borderRadius={5} style={{ marginLeft: 10 }} />
                </View>
            )}
            {Array.from({ length: lines }).map((_, i) => (
                <Bone
                    key={i}
                    animValue={anim}
                    width={i === 0 ? '90%' : i === lines - 1 ? '60%' : '75%'}
                    height={14}
                    borderRadius={5}
                    style={{ marginTop: i > 0 ? 10 : 0 }}
                />
            ))}
        </View>
    );
}

// ─── List item skeleton ───
export function ListItemSkeleton({ anim }) {
    return (
        <View style={sk.listItem}>
            <Bone animValue={anim} width={44} height={44} borderRadius={12} />
            <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Bone animValue={anim} width={'70%'} height={14} borderRadius={5} />
                <Bone animValue={anim} width={'45%'} height={11} borderRadius={4} />
            </View>
            <Bone animValue={anim} width={50} height={22} borderRadius={6} />
        </View>
    );
}

// ─── List skeleton (multiple items) ───
export function ListSkeleton({ anim, count = 5 }) {
    return (
        <View style={{ paddingHorizontal: 16 }}>
            {Array.from({ length: count }).map((_, i) => (
                <ListItemSkeleton key={i} anim={anim} />
            ))}
        </View>
    );
}

// ─── Day tabs skeleton (for timetable) ───
export function DayTabsSkeleton({ anim, count = 6 }) {
    return (
        <View style={sk.dayTabs}>
            {Array.from({ length: count }).map((_, i) => (
                <Bone key={i} animValue={anim} width={48} height={56} borderRadius={12} style={{ marginRight: 8 }} />
            ))}
        </View>
    );
}

// ─── Calendar skeleton (for attendance) ───
export function CalendarSkeleton({ anim }) {
    return (
        <View style={sk.calendarCard}>
            {/* Month header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                <Bone animValue={anim} width={24} height={24} borderRadius={12} />
                <Bone animValue={anim} width={120} height={18} borderRadius={6} />
                <Bone animValue={anim} width={24} height={24} borderRadius={12} />
            </View>
            {/* Day names row */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 10 }}>
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((_, i) => (
                    <Bone key={i} animValue={anim} width={28} height={12} borderRadius={4} />
                ))}
            </View>
            {/* Calendar grid */}
            {Array.from({ length: 5 }).map((_, row) => (
                <View key={row} style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
                    {Array.from({ length: 7 }).map((_, col) => (
                        <Bone key={col} animValue={anim} width={28} height={28} borderRadius={14} />
                    ))}
                </View>
            ))}
        </View>
    );
}

// ─── Grid skeleton (for quick actions) ───
export function GridSkeleton({ anim, columns = 4, rows = 2 }) {
    return (
        <View style={sk.gridContainer}>
            {Array.from({ length: rows }).map((_, row) => (
                <View key={row} style={sk.gridRow}>
                    {Array.from({ length: columns }).map((_, col) => (
                        <View key={col} style={sk.gridItem}>
                            <Bone animValue={anim} width={48} height={48} borderRadius={16} />
                            <Bone animValue={anim} width={50} height={10} borderRadius={4} style={{ marginTop: 6 }} />
                        </View>
                    ))}
                </View>
            ))}
        </View>
    );
}

// ─── Banner skeleton ───
export function BannerSkeleton({ anim }) {
    return (
        <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
            <Bone animValue={anim} width={'100%'} height={140} borderRadius={16} />
        </View>
    );
}

// ─── Notice item skeleton ───
export function NoticeItemSkeleton({ anim }) {
    return (
        <View style={sk.noticeItem}>
            <Bone animValue={anim} width={48} height={48} borderRadius={12} />
            <View style={{ flex: 1, marginLeft: 12, gap: 6 }}>
                <Bone animValue={anim} width={'30%'} height={10} borderRadius={4} />
                <Bone animValue={anim} width={'80%'} height={14} borderRadius={5} />
                <Bone animValue={anim} width={'55%'} height={11} borderRadius={4} />
            </View>
        </View>
    );
}

// ─── Prebuilt screen skeletons ───

export function PerformanceSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 16, padding: 16 }}>
            {/* Overall score card */}
            <Bone animValue={anim} width={'100%'} height={100} borderRadius={20} />
            {/* Attendance section */}
            <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Bone animValue={anim} width={18} height={18} borderRadius={9} />
                    <Bone animValue={anim} width={150} height={14} borderRadius={5} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <View key={i} style={{ flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 6, backgroundColor: '#f8f9fa' }}>
                            <Bone animValue={anim} width={20} height={20} borderRadius={10} />
                            <Bone animValue={anim} width={36} height={18} borderRadius={5} />
                            <Bone animValue={anim} width={50} height={10} borderRadius={4} />
                        </View>
                    ))}
                </View>
            </View>
            {/* Exam section */}
            <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Bone animValue={anim} width={18} height={18} borderRadius={9} />
                    <Bone animValue={anim} width={130} height={14} borderRadius={5} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <View key={i} style={{ flex: 1, borderRadius: 12, padding: 10, alignItems: 'center', gap: 6, backgroundColor: '#f8f9fa' }}>
                            <Bone animValue={anim} width={20} height={20} borderRadius={10} />
                            <Bone animValue={anim} width={36} height={18} borderRadius={5} />
                            <Bone animValue={anim} width={50} height={10} borderRadius={4} />
                        </View>
                    ))}
                </View>
            </View>
            {/* Recent exams list */}
            <View style={{ backgroundColor: '#f8f9fa', borderRadius: 16, padding: 16 }}>
                <Bone animValue={anim} width={100} height={12} borderRadius={5} style={{ marginBottom: 12 }} />
                {Array.from({ length: 3 }).map((_, i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }}>
                        <View style={{ gap: 4 }}>
                            <Bone animValue={anim} width={150} height={14} borderRadius={5} />
                            <Bone animValue={anim} width={100} height={10} borderRadius={4} />
                        </View>
                        <Bone animValue={anim} width={50} height={28} borderRadius={8} />
                    </View>
                ))}
            </View>
        </View>
    );
}

export function TimetableSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 16, padding: 16 }}>
            {/* Next Period Card */}
            <Bone animValue={anim} width={'100%'} height={110} borderRadius={16} />
            {/* Stats Row - 2 cards */}
            <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, backgroundColor: '#f8f9fa', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8 }}>
                    <Bone animValue={anim} width={24} height={24} borderRadius={12} />
                    <Bone animValue={anim} width={30} height={20} borderRadius={5} />
                    <Bone animValue={anim} width={70} height={10} borderRadius={4} />
                </View>
                <View style={{ flex: 1, backgroundColor: '#f8f9fa', borderRadius: 16, padding: 16, alignItems: 'center', gap: 8 }}>
                    <Bone animValue={anim} width={24} height={24} borderRadius={12} />
                    <Bone animValue={anim} width={30} height={20} borderRadius={5} />
                    <Bone animValue={anim} width={70} height={10} borderRadius={4} />
                </View>
            </View>
            {/* Day Selector Chips */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                    <Bone key={i} animValue={anim} width={48} height={56} borderRadius={12} />
                ))}
            </View>
            {/* Period List */}
            {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8f9fa', borderRadius: 14, padding: 14, gap: 12 }}>
                    <View style={{ alignItems: 'center', gap: 4, width: 50 }}>
                        <Bone animValue={anim} width={40} height={12} borderRadius={4} />
                        <Bone animValue={anim} width={30} height={10} borderRadius={4} />
                    </View>
                    <View style={{ width: 1, height: 40, backgroundColor: '#E8EDF5' }} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <Bone animValue={anim} width={'70%'} height={14} borderRadius={5} />
                        <Bone animValue={anim} width={'50%'} height={11} borderRadius={4} />
                    </View>
                </View>
            ))}
        </View>
    );
}

export function AttendanceSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 16, padding: 16 }}>
            {/* Overall Stats Label */}
            <Bone animValue={anim} width={160} height={14} borderRadius={5} />
            {/* 3 Summary Cards Row */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <View key={i} style={{ flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 8, backgroundColor: '#f0f4ff' }}>
                        <Bone animValue={anim} width={24} height={24} borderRadius={12} />
                        <Bone animValue={anim} width={36} height={22} borderRadius={6} />
                        <Bone animValue={anim} width={55} height={10} borderRadius={4} />
                    </View>
                ))}
            </View>
            {/* Streak Card */}
            <Bone animValue={anim} width={'100%'} height={70} borderRadius={16} />
            {/* Calendar */}
            <CalendarSkeleton anim={anim} />
        </View>
    );
}

export function ExamResultsSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 16, padding: 16 }}>
            {/* Exam Info Card */}
            <View style={{ backgroundColor: '#f8f9fa', borderRadius: 16, padding: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Bone animValue={anim} width={20} height={20} borderRadius={10} />
                    <Bone animValue={anim} width={'60%'} height={16} borderRadius={5} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
                    {Array.from({ length: 3 }).map((_, i) => (
                        <View key={i} style={{ alignItems: 'center', gap: 4 }}>
                            <Bone animValue={anim} width={14} height={14} borderRadius={7} />
                            <Bone animValue={anim} width={40} height={10} borderRadius={4} />
                            <Bone animValue={anim} width={50} height={12} borderRadius={4} />
                        </View>
                    ))}
                </View>
            </View>
            {/* Summary Card with Circle */}
            <View style={{ backgroundColor: '#f8f9fa', borderRadius: 16, padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <Bone animValue={anim} width={70} height={70} borderRadius={35} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <Bone animValue={anim} width={80} height={12} borderRadius={4} />
                        <Bone animValue={anim} width={100} height={18} borderRadius={5} />
                        <Bone animValue={anim} width={70} height={24} borderRadius={8} />
                    </View>
                </View>
            </View>
            {/* Section Title */}
            <Bone animValue={anim} width={140} height={14} borderRadius={5} />
            {/* Subject Result Cards */}
            {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={{ backgroundColor: '#f8f9fa', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Bone animValue={anim} width={44} height={44} borderRadius={12} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <Bone animValue={anim} width={'65%'} height={14} borderRadius={5} />
                        <Bone animValue={anim} width={'100%'} height={6} borderRadius={3} />
                        <Bone animValue={anim} width={'40%'} height={10} borderRadius={4} />
                    </View>
                    <Bone animValue={anim} width={44} height={28} borderRadius={8} />
                </View>
            ))}
        </View>
    );
}

export function CertificatesSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 16, padding: 16 }}>
            {/* Stats Row - 3 cards */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <View key={i} style={{ flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 8, backgroundColor: '#f8f9fa' }}>
                        <Bone animValue={anim} width={24} height={24} borderRadius={12} />
                        <Bone animValue={anim} width={30} height={20} borderRadius={5} />
                        <Bone animValue={anim} width={60} height={10} borderRadius={4} />
                    </View>
                ))}
            </View>
            {/* Section Title */}
            <Bone animValue={anim} width={120} height={14} borderRadius={5} />
            {/* Document Cards */}
            {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={{ backgroundColor: '#f8f9fa', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Bone animValue={anim} width={48} height={48} borderRadius={12} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <Bone animValue={anim} width={'65%'} height={14} borderRadius={5} />
                        <Bone animValue={anim} width={'40%'} height={11} borderRadius={4} />
                        <Bone animValue={anim} width={'30%'} height={10} borderRadius={4} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        <Bone animValue={anim} width={32} height={32} borderRadius={10} />
                        <Bone animValue={anim} width={32} height={32} borderRadius={10} />
                    </View>
                </View>
            ))}
        </View>
    );
}

export function LibrarySkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 16, padding: 16 }}>
            {/* Tab bar */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <Bone animValue={anim} width={80} height={32} borderRadius={16} />
                <Bone animValue={anim} width={80} height={32} borderRadius={16} />
                <Bone animValue={anim} width={80} height={32} borderRadius={16} />
                <Bone animValue={anim} width={80} height={32} borderRadius={16} />
            </View>
            {/* Summary stats */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <View key={i} style={{ flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 6, backgroundColor: '#f8f9fa' }}>
                        <Bone animValue={anim} width={20} height={20} borderRadius={10} />
                        <Bone animValue={anim} width={28} height={18} borderRadius={5} />
                        <Bone animValue={anim} width={50} height={10} borderRadius={4} />
                    </View>
                ))}
            </View>
            {/* Book list */}
            {Array.from({ length: 5 }).map((_, i) => (
                <View key={i} style={{ backgroundColor: '#f8f9fa', borderRadius: 14, padding: 14, flexDirection: 'row', gap: 12 }}>
                    <Bone animValue={anim} width={50} height={70} borderRadius={8} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <Bone animValue={anim} width={'75%'} height={14} borderRadius={5} />
                        <Bone animValue={anim} width={'50%'} height={11} borderRadius={4} />
                        <Bone animValue={anim} width={'35%'} height={10} borderRadius={4} />
                        <Bone animValue={anim} width={60} height={22} borderRadius={6} style={{ marginTop: 4 }} />
                    </View>
                </View>
            ))}
        </View>
    );
}

export function NoticeboardSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 0 }}>
            {Array.from({ length: 10 }).map((_, i) => (
                <NoticeItemSkeleton key={i} anim={anim} />
            ))}
        </View>
    );
}

export function HomeSkeleton() {
    const anim = useShimmer();
    return (
        <View style={sk.container}>
            {/* Header */}
            <View style={[sk.header, { paddingTop: 50 }]}>
                <Bone animValue={anim} width={44} height={44} borderRadius={22} />
                <View style={{ flex: 1, marginLeft: 12, gap: 4 }}>
                    <Bone animValue={anim} width={100} height={12} borderRadius={5} />
                    <Bone animValue={anim} width={160} height={16} borderRadius={5} />
                </View>
                <Bone animValue={anim} width={36} height={36} borderRadius={18} />
            </View>
            {/* Banner */}
            <BannerSkeleton anim={anim} />
            {/* Quick Actions */}
            <View style={{ paddingHorizontal: 16, marginBottom: 16 }}>
                <Bone animValue={anim} width={120} height={16} borderRadius={5} style={{ marginBottom: 12 }} />
                <GridSkeleton anim={anim} columns={5} rows={2} />
            </View>
            {/* Announcements */}
            <View style={{ paddingHorizontal: 16 }}>
                <Bone animValue={anim} width={140} height={16} borderRadius={5} style={{ marginBottom: 12 }} />
                <CardSkeleton anim={anim} lines={3} />
                <CardSkeleton anim={anim} lines={2} />
            </View>
        </View>
    );
}

export function HomeworkSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 16, padding: 16 }}>
            {/* Filter tabs */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <Bone key={i} animValue={anim} width={80} height={32} borderRadius={16} />
                ))}
            </View>
            {/* Homework cards */}
            {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={sk.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Bone animValue={anim} width={'60%'} height={16} borderRadius={5} />
                        <Bone animValue={anim} width={60} height={22} borderRadius={6} />
                    </View>
                    <Bone animValue={anim} width={'80%'} height={12} borderRadius={4} />
                    <Bone animValue={anim} width={'45%'} height={12} borderRadius={4} style={{ marginTop: 6 }} />
                </View>
            ))}
        </View>
    );
}

export function HPCSkeleton() {
    const anim = useShimmer();
    return (
        <View style={sk.container}>
            {/* Gradient Header */}
            <View style={{ backgroundColor: '#0469ff', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 16, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
                {/* Header Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                    <Bone animValue={anim} width={40} height={40} borderRadius={12} />
                    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                        <Bone animValue={anim} width={160} height={16} borderRadius={5} />
                        <Bone animValue={anim} width={120} height={12} borderRadius={4} />
                    </View>
                    <Bone animValue={anim} width={36} height={36} borderRadius={12} />
                </View>
                {/* Student Info Card */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 12, gap: 12, marginBottom: 12 }}>
                    <Bone animValue={anim} width={44} height={44} borderRadius={22} />
                    <View style={{ flex: 1, gap: 4 }}>
                        <Bone animValue={anim} width={120} height={14} borderRadius={5} />
                        <Bone animValue={anim} width={180} height={11} borderRadius={4} />
                    </View>
                </View>
                {/* Score Widget */}
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 12, gap: 12 }}>
                    <Bone animValue={anim} width={56} height={56} borderRadius={28} />
                    <View style={{ flex: 1, gap: 4 }}>
                        <Bone animValue={anim} width={120} height={14} borderRadius={5} />
                        <Bone animValue={anim} width={200} height={10} borderRadius={4} />
                    </View>
                    <Bone animValue={anim} width={24} height={24} borderRadius={12} />
                </View>
            </View>
            {/* Content Sections */}
            <View style={{ padding: 16, gap: 16 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                    <View key={i} style={sk.card}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <Bone animValue={anim} width={36} height={36} borderRadius={18} />
                            <Bone animValue={anim} width={140} height={16} borderRadius={5} style={{ marginLeft: 10 }} />
                        </View>
                        {Array.from({ length: 3 }).map((_, j) => (
                            <View key={j} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                                <Bone animValue={anim} width={'55%'} height={12} borderRadius={4} />
                                <Bone animValue={anim} width={40} height={20} borderRadius={6} />
                            </View>
                        ))}
                    </View>
                ))}
            </View>
        </View>
    );
}

export function SyllabusSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 12 }}>
            {/* Academic Year info card */}
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#f8f9fa', borderRadius: 12, gap: 12 }}>
                <Bone animValue={anim} width={40} height={40} borderRadius={20} />
                <View style={{ gap: 4 }}>
                    <Bone animValue={anim} width={90} height={11} borderRadius={4} />
                    <Bone animValue={anim} width={70} height={15} borderRadius={5} />
                </View>
            </View>
            {/* Section title placeholder */}
            <Bone animValue={anim} width={140} height={16} borderRadius={5} />
            {/* Syllabus file items */}
            {Array.from({ length: 3 }).map((_, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#f8f9fa', borderRadius: 12, gap: 12 }}>
                    <Bone animValue={anim} width={48} height={48} borderRadius={24} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <Bone animValue={anim} width={60} height={14} borderRadius={5} />
                        <Bone animValue={anim} width={'65%'} height={13} borderRadius={5} />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Bone animValue={anim} width={12} height={12} borderRadius={6} />
                            <Bone animValue={anim} width={90} height={11} borderRadius={4} />
                        </View>
                    </View>
                    <Bone animValue={anim} width={36} height={36} borderRadius={18} />
                </View>
            ))}
        </View>
    );
}

export function GallerySkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ gap: 12 }}>
            {/* Category pills skeleton */}
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
                {Array.from({ length: 5 }).map((_, i) => (
                    <Bone key={i} animValue={anim} width={i === 0 ? 40 : 75} height={32} borderRadius={16} />
                ))}
            </View>
            {/* Album grid skeleton - 2 columns */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                    <View key={i} style={{ width: '48%', borderRadius: 16, overflow: 'hidden' }}>
                        <Bone animValue={anim} width={'100%'} height={180} borderRadius={16} />
                    </View>
                ))}
            </View>
        </View>
    );
}

// ─── Styles ───
const sk = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    statBox: {
        flex: 1,
        padding: 12,
        borderRadius: 12,
        backgroundColor: '#f8f9fa',
        alignItems: 'center',
    },
    card: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    dayTabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    calendarCard: {
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
        marginTop: 12,
    },
    gridContainer: { gap: 12 },
    gridRow: { flexDirection: 'row', justifyContent: 'space-around' },
    gridItem: { alignItems: 'center', width: 64 },
    noticeItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f5f5f5',
    },
    certCard: {
        flexDirection: 'row',
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 16,
    },
});
