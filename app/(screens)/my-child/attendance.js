// // Parent view for child's attendance - app/(tabs)/my-child-attendance.jsx
// import React, { useState, useMemo, useCallback } from 'react';
// import {
//     View,
//     Text,
//     StyleSheet,
//     ScrollView,
//     RefreshControl,
//     Dimensions,
//     ActivityIndicator,
//     Alert
// } from 'react-native';
// import { useQuery, useQueryClient } from '@tanstack/react-query';
// import { router, useLocalSearchParams } from 'expo-router';
// import { LinearGradient } from 'expo-linear-gradient';
// import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
// import {
//     Calendar as CalendarIcon,
//     TrendingUp,
//     Award,
//     AlertCircle,
//     CheckCircle,
//     XCircle,
//     Clock,
//     ChevronLeft,
//     ChevronRight,
//     ArrowLeft,
//     User,
//     Sparkles
// } from 'lucide-react-native';
// import * as SecureStore from 'expo-secure-store';
// import api from '../../../lib/api';
// import HapticTouchable from '../../components/HapticTouch';
// const getISTDateString = (dateInput = new Date()) => {
//     let date;
    
//     if (typeof dateInput === 'string') {
//         // If it's already YYYY-MM-DD, return as-is
//         if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
//             return dateInput;
//         }
//         date = new Date(dateInput);
//     } else {
//         date = new Date(dateInput);
//     }

//     if (isNaN(date.getTime())) return null;

//     const offset = 5.5 * 60 * 60 * 1000;
//     const istDate = new Date(date.getTime() + offset);
//     return istDate.toISOString().split('T')[0];
// };
// const formatIST = (dateString) => {
//     return new Date(dateString).toLocaleDateString('en-IN', {
//         timeZone: 'Asia/Kolkata',
//         day: 'numeric',
//         month: 'short',
//         year: 'numeric'
//     });
// };
// const { width: SCREEN_WIDTH } = Dimensions.get('window');
// const CALENDAR_DAY_SIZE = (SCREEN_WIDTH - 64) / 7;

// export default function ParentAttendanceView() {
//     const params = useLocalSearchParams();
//     const childData = params.childData ? JSON.parse(params.childData) : null;

//     const queryClient = useQueryClient();
//     const [refreshing, setRefreshing] = useState(false);
//     const [currentMonth, setCurrentMonth] = useState(() => {
//         const now = new Date();
//         const offset = 5.5 * 60 * 60 * 1000;
//         const ist = new Date(now.getTime() + offset);
//         return new Date(ist.getFullYear(), ist.getMonth(), 1);
//     });


//     // Load user data
//     const { data: userData } = useQuery({
//         queryKey: ['user-data'],
//         queryFn: async () => {
//             const stored = await SecureStore.getItemAsync('user');
//             return stored ? JSON.parse(stored) : null;
//         },
//         staleTime: Infinity,
//     });

//     const schoolId = userData?.schoolId;
//     const studentId = childData?.studentId;

//     // Fetch attendance stats
//     const { data: statsData, isLoading } = useQuery({
//         queryKey: ['child-attendance-stats', studentId, currentMonth],
//         queryFn: async () => {
//             if (!studentId) return null;
//             const month = currentMonth.getMonth() + 1;
//             const year = currentMonth.getFullYear();
//             const res = await api.get(
//                 `/schools/${schoolId}/attendance/stats?userId=${studentId}&month=${month}&year=${year}`
//             );
//             return res.data;
//         },
//         enabled: !!studentId && !!schoolId,
//         staleTime: 1000 * 60 * 2,
//     });

//     const stats = statsData?.monthlyStats;
//     const recentAttendance = statsData?.recentAttendance || [];
//     const streak = statsData?.streak;

//     // Generate calendar days
//     // const calendarDays = useMemo(() => {
//     //     const year = currentMonth.getFullYear();
//     //     const month = currentMonth.getMonth();
//     //     const firstDay = new Date(year, month, 1);
//     //     const lastDay = new Date(year, month + 1, 0);
//     //     const days = [];

//     //     for (let i = firstDay.getDay(); i > 0; i--) {
//     //         days.push({ date: null, isOtherMonth: true });
//     //     }

//     //     for (let i = 1; i <= lastDay.getDate(); i++) {
//     //         const date = new Date(year, month, i);
//     //         const dateStr = getISTDateString(date);
//     //         const dayData = recentAttendance.find(a =>
//     //             new Date(a.date).toISOString().split('T')[0] === dateStr
//     //         );
//     //         days.push({
//     //             date: i,
//     //             fullDate: dateStr,
//     //             isToday: dateStr === getISTDateString(),
//     //             attendance: dayData
//     //         });
//     //     }

//     //     return days;
//     // }, [currentMonth, recentAttendance]);
//     // In calendarDays useMemo
// const calendarDays = useMemo(() => {
//     const year = currentMonth.getFullYear();
//     const month = currentMonth.getMonth();
//     const days = [];

//     // Padding for first row
//     const firstDay = new Date(year, month, 1);
//     for (let i = 0; i < firstDay.getDay(); i++) {
//         days.push({ date: null, isOtherMonth: true });
//     }

//     // Today in IST (YYYY-MM-DD)
//     const todayIST = getISTDateString();

//     // Loop through days
//     for (let i = 1; i <= 31; i++) {
//         if (i > new Date(year, month + 1, 0).getDate()) break;

//         // Generate IST date string: "2025-11-12"
//         const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

//         // Find matching attendance — WORKS WITH ANY SERVER FORMAT
//         const dayData = recentAttendance.find(record => {
//             const serverDate = record.date;

//             if (!serverDate) return false;

//             // Case 1: Already "2025-11-12"
//             if (serverDate === dateStr) return true;

//             // Case 2: Full ISO string "2025-11-12T00:00:00.000Z"
//             if (typeof serverDate === 'string' && serverDate.includes('T')) {
//                 return getISTDateString(serverDate) === dateStr;
//             }

//             // Case 3: Any other format — convert to IST string
//             try {
//                 return getISTDateString(serverDate) === dateStr;
//             } catch (e) {
//                 return false;
//             }
//         });

//         days.push({
//             date: i,
//             fullDate: dateStr,
//             isToday: dateStr === todayIST,
//             attendance: dayData
//         });
//     }

//     return days;
// }, [currentMonth, recentAttendance]);
//     const onRefresh = useCallback(async () => {
//         setRefreshing(true);
//         await queryClient.invalidateQueries(['child-attendance-stats']);
//         setRefreshing(false);
//     }, []);

//     const getStatusColor = (status) => {
//         switch (status) {
//             case 'PRESENT': return '#51CF66';
//             case 'ABSENT': return '#FF6B6B';
//             case 'LATE': return '#FFB020';
//             case 'HALF_DAY': return '#FF8C42';
//             case 'ON_LEAVE': return '#8B5CF6';
//             default: return '#94A3B8';
//         }
//     };

//     const getStatusConfig = (status) => {
//         const configs = {
//             PRESENT: { color: '#51CF66', icon: CheckCircle, bg: '#E7F5E9' },
//             ABSENT: { color: '#FF6B6B', icon: XCircle, bg: '#FFE9E9' },
//             LATE: { color: '#FFB020', icon: Clock, bg: '#FFF9E0' },
//             HALF_DAY: { color: '#FF8C42', icon: Clock, bg: '#FFE9D6' },
//             ON_LEAVE: { color: '#8B5CF6', icon: AlertCircle, bg: '#F3E8FF' },
//         };
//         return configs[status] || { color: '#94A3B8', icon: AlertCircle, bg: '#F1F5F9' };
//     };

//     const formatDate = (dateString) => formatIST(dateString);
//     if (!childData) {
//         return (
//             <View style={styles.loaderContainer}>
//                 <AlertCircle size={48} color="#999" />
//                 <Text style={styles.noDataText}>No child selected</Text>
//                 <HapticTouchable onPress={() => router.back()}>
//                     <View style={styles.backButtonCenter}>
//                         <Text style={styles.backButtonText}>Go Back</Text>
//                     </View>
//                 </HapticTouchable>
//             </View>
//         );
//     }

//     return (
//         <View style={styles.container}>
//             {/* Header */}
//             <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
//                 <HapticTouchable onPress={() => router.back()}>
//                     <View style={styles.backButton}>
//                         <ArrowLeft size={24} color="#111" />
//                     </View>
//                 </HapticTouchable>
//                 <View style={styles.headerCenter}>
//                     <Text style={styles.headerTitle}>Attendance</Text>
//                     <Text style={styles.headerSubtitle}>
//                         {childData.name} - {childData.class?.className}
//                     </Text>
//                 </View>
//                 <View style={{ width: 40 }} />
//             </Animated.View>

//             <ScrollView
//                 style={styles.content}
//                 showsVerticalScrollIndicator={false}
//                 refreshControl={
//                     <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
//                 }
//             >
//                 {isLoading ? (
//                     <View style={styles.loadingContainer}>
//                         <ActivityIndicator size="large" color="#0469ff" />
//                     </View>
//                 ) : !stats ? (
//                     <Animated.View entering={FadeInDown.delay(300)} style={styles.noDataCard}>
//                         <AlertCircle size={48} color="#999" />
//                         <Text style={styles.noDataText}>No attendance data available</Text>
//                     </Animated.View>
//                 ) : (
//                     <>
//                         {/* Stats Cards */}
//                         <Animated.View entering={FadeInDown.delay(300).duration(500)}>
//                             <View style={styles.summaryGrid}>
//                                 <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
//                                     <TrendingUp size={24} color="#fff" />
//                                     <Text style={styles.summaryValue}>{Math.round(stats.attendancePercentage)}%</Text>
//                                     <Text style={styles.summaryLabel}>Attendance</Text>
//                                 </LinearGradient>

//                                 <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
//                                     <CheckCircle size={24} color="#fff" />
//                                     <Text style={styles.summaryValue}>{stats.totalPresent}</Text>
//                                     <Text style={styles.summaryLabel}>Present</Text>
//                                 </LinearGradient>

//                                 <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
//                                     <XCircle size={24} color="#fff" />
//                                     <Text style={styles.summaryValue}>{stats.totalAbsent}</Text>
//                                     <Text style={styles.summaryLabel}>Absent</Text>
//                                 </LinearGradient>
//                             </View>
//                         </Animated.View>

//                         {/* Streak Card */}
//                         {streak && streak.current > 0 && (
//                             <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.streakCard}>
//                                 <LinearGradient colors={['#FFB020', '#FF8C42']} style={styles.streakGradient}>
//                                     <Award size={32} color="#fff" />
//                                     <View style={styles.streakInfo}>
//                                         <Text style={styles.streakValue}>{streak.current} Days</Text>
//                                         <Text style={styles.streakLabel}>Current Streak 🔥</Text>
//                                     </View>
//                                     <View style={styles.streakBadge}>
//                                         <Sparkles size={14} color="#92400E" />
//                                         <Text style={styles.streakBadgeText}>Best: {streak.longest}</Text>
//                                     </View>
//                                 </LinearGradient>
//                             </Animated.View>
//                         )}

//                         {/* Low Attendance Warning */}
//                         {stats.attendancePercentage < 75 && (
//                             <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.warningCard}>
//                                 <View style={styles.warningIconContainer}>
//                                     <AlertCircle size={24} color="#FF6B6B" />
//                                 </View>
//                                 <View style={styles.warningContent}>
//                                     <Text style={styles.warningTitle}>Low Attendance Alert</Text>
//                                     <Text style={styles.warningMessage}>
//                                         Current attendance is {Math.round(stats.attendancePercentage)}%, below the required 75%
//                                     </Text>
//                                 </View>
//                             </Animated.View>
//                         )}

//                         {/* Calendar Section */}
//                         <View style={styles.sectionHeader}>
//                             <Text style={styles.sectionTitle}>Monthly Overview</Text>
//                         </View>

//                         <Animated.View entering={FadeInDown.delay(600).duration(500)} style={styles.calendarCard}>
//                             <View style={styles.calendarHeader}>
//                                 <HapticTouchable onPress={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}>
//                                     <View style={styles.calendarNavButton}>
//                                         <ChevronLeft size={20} color="#0469ff" />
//                                     </View>
//                                 </HapticTouchable>

//                                 <Text style={styles.calendarTitle}>
//                                     {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
//                                 </Text>

//                                 <HapticTouchable onPress={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}>
//                                     <View style={styles.calendarNavButton}>
//                                         <ChevronRight size={20} color="#0469ff" />
//                                     </View>
//                                 </HapticTouchable>
//                             </View>

//                             {/* Calendar Grid */}
//                             <View style={styles.calendar}>
//                                 {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
//                                     <View key={idx} style={styles.calendarDayHeader}>
//                                         <Text style={styles.calendarDayHeaderText}>{day}</Text>
//                                     </View>
//                                 ))}

//                                 {calendarDays.map((day, idx) => {
//                                     const statusConfig = day.attendance ? getStatusConfig(day.attendance.status) : null;

//                                     return (
//                                         <View
//                                             key={idx}
//                                             style={[
//                                                 styles.calendarDay,
//                                                 day.isOtherMonth && styles.calendarDayOther,
//                                                 day.isToday && styles.calendarDayToday,
//                                             ]}
//                                         >
//                                             {!day.isOtherMonth && (
//                                                 <>
//                                                     <Text style={[
//                                                         styles.calendarDayText,
//                                                         day.isToday && styles.calendarDayTextToday
//                                                     ]}>
//                                                         {day.date}
//                                                     </Text>
//                                                     {day.attendance && (
//                                                         <View style={[
//                                                             styles.calendarDayDot,
//                                                             { backgroundColor: statusConfig.color }
//                                                         ]} />
//                                                     )}
//                                                 </>
//                                             )}
//                                         </View>
//                                     );
//                                 })}
//                             </View>

//                             {/* Legend */}
//                             <View style={styles.legend}>
//                                 <View style={styles.legendItem}>
//                                     <View style={[styles.legendDot, { backgroundColor: '#51CF66' }]} />
//                                     <Text style={styles.legendText}>Present</Text>
//                                 </View>
//                                 <View style={styles.legendItem}>
//                                     <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
//                                     <Text style={styles.legendText}>Absent</Text>
//                                 </View>
//                                 <View style={styles.legendItem}>
//                                     <View style={[styles.legendDot, { backgroundColor: '#FFB020' }]} />
//                                     <Text style={styles.legendText}>Late</Text>
//                                 </View>
//                                 <View style={styles.legendItem}>
//                                     <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
//                                     <Text style={styles.legendText}>Leave</Text>
//                                 </View>
//                             </View>
//                         </Animated.View>

//                         {/* Recent Activity */}
//                         <View style={styles.sectionHeader}>
//                             <Text style={styles.sectionTitle}>Recent Activity</Text>
//                             <Text style={styles.activityCount}>{recentAttendance.slice(0, 7).length} Records</Text>
//                         </View>

//                         {recentAttendance.slice(0, 7).map((record, idx) => {
//                             const statusConfig = getStatusConfig(record.status);
//                             const StatusIcon = statusConfig.icon;

//                             return (
//                                 <Animated.View key={record.id} entering={FadeInRight.delay(700 + idx * 50)}>
//                                     <View style={styles.activityCard}>
//                                         <View style={[styles.activityIcon, { backgroundColor: statusConfig.bg }]}>
//                                             <StatusIcon size={20} color={statusConfig.color} />
//                                         </View>
//                                         <View style={styles.activityContent}>
//                                             <Text style={styles.activityDate}>
//                                                {formatIST(record.checkInTime)}
//                                             </Text>
//                                             <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
//                                                 <Text style={[styles.statusText, { color: statusConfig.color }]}>
//                                                     {record.status}
//                                                 </Text>
//                                             </View>
//                                         </View>
//                                         <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
//                                             <Clock size={12} color="#666" />
//                                             <Text style={styles.activityTime}>
//                                                 {formatIST(record.checkInTime)}
//                                             </Text>
//                                         </View>
//                                     </View>
//                                 </Animated.View>
//                             );
//                         })}

//                         <View style={{ height: 40 }} />
//                     </>
//                 )}
//             </ScrollView>
//         </View>
//     );
// }

// const styles = StyleSheet.create({
//     container: {
//         flex: 1,
//         backgroundColor: '#fff',
//     },
//     loaderContainer: {
//         flex: 1,
//         justifyContent: 'center',
//         alignItems: 'center',
//         gap: 16,
//     },
//     backButtonCenter: {
//         marginTop: 20,
//         paddingHorizontal: 24,
//         paddingVertical: 12,
//         backgroundColor: '#0469ff',
//         borderRadius: 12,
//     },
//     backButtonText: {
//         color: '#fff',
//         fontSize: 16,
//         fontWeight: '600',
//     },
//     header: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         justifyContent: 'space-between',
//         paddingHorizontal: 16,
//         paddingTop: 50,
//         paddingBottom: 16,
//         borderBottomWidth: 1,
//         borderBottomColor: '#f0f0f0',
//         backgroundColor: '#fff',
//     },
//     backButton: {
//         width: 40,
//         height: 40,
//         borderRadius: 20,
//         backgroundColor: '#f5f5f5',
//         alignItems: 'center',
//         justifyContent: 'center',
//     },
//     headerCenter: {
//         flex: 1,
//         alignItems: 'center',
//     },
//     headerTitle: {
//         fontSize: 18,
//         fontWeight: '700',
//         color: '#111',
//     },
//     headerSubtitle: {
//         fontSize: 13,
//         color: '#666',
//         marginTop: 2,
//     },
//     content: {
//         flex: 1,
//         padding: 16,
//     },
//     loadingContainer: {
//         padding: 40,
//         alignItems: 'center',
//     },
//     noDataCard: {
//         padding: 40,
//         alignItems: 'center',
//         gap: 12,
//         backgroundColor: '#f8f9fa',
//         borderRadius: 16,
//         marginTop: 20,
//     },
//     noDataText: {
//         fontSize: 16,
//         color: '#999',
//     },
//     summaryGrid: {
//         flexDirection: 'row',
//         gap: 12,
//         marginBottom: 16,
//     },
//     summaryCard: {
//         flex: 1,
//         padding: 16,
//         borderRadius: 16,
//         alignItems: 'center',
//         gap: 8,
//     },
//     summaryValue: {
//         fontSize: 20,
//         fontWeight: '700',
//         color: '#fff',
//     },
//     summaryLabel: {
//         fontSize: 12,
//         color: 'rgba(255,255,255,0.9)',
//         fontWeight: '600',
//     },
//     streakCard: {
//         marginBottom: 16,
//         borderRadius: 16,
//         overflow: 'hidden',
//     },
//     streakGradient: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         padding: 20,
//     },
//     streakInfo: {
//         flex: 1,
//         marginLeft: 12,
//     },
//     streakValue: {
//         fontSize: 24,
//         fontWeight: '700',
//         color: '#fff',
//     },
//     streakLabel: {
//         fontSize: 13,
//         color: '#fff',
//         marginTop: 2,
//         opacity: 0.9,
//     },
//     streakBadge: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 4,
//         paddingHorizontal: 12,
//         paddingVertical: 6,
//         backgroundColor: '#FDE047',
//         borderRadius: 12,
//     },
//     streakBadgeText: {
//         fontSize: 12,
//         fontWeight: '600',
//         color: '#92400E',
//     },
//     warningCard: {
//         flexDirection: 'row',
//         alignItems: 'flex-start',
//         marginBottom: 16,
//         padding: 16,
//         backgroundColor: '#FFE9E9',
//         borderRadius: 16,
//         borderWidth: 1,
//         borderColor: '#FFD6D6',
//     },
//     warningIconContainer: {
//         width: 40,
//         height: 40,
//         borderRadius: 20,
//         backgroundColor: '#fff',
//         alignItems: 'center',
//         justifyContent: 'center',
//     },
//     warningContent: {
//         flex: 1,
//         marginLeft: 12,
//     },
//     warningTitle: {
//         fontSize: 15,
//         fontWeight: '700',
//         color: '#991B1B',
//         marginBottom: 4,
//     },
//     warningMessage: {
//         fontSize: 13,
//         color: '#991B1B',
//         lineHeight: 18,
//     },
//     sectionHeader: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         justifyContent: 'space-between',
//         marginBottom: 12,
//         marginTop: 8,
//     },
//     sectionTitle: {
//         fontSize: 17,
//         fontWeight: '700',
//         color: '#111',
//     },
//     activityCount: {
//         fontSize: 13,
//         color: '#666',
//         backgroundColor: '#f5f5f5',
//         paddingHorizontal: 10,
//         paddingVertical: 4,
//         borderRadius: 12,
//         fontWeight: '600',
//     },
//     calendarCard: {
//         padding: 16,
//         backgroundColor: '#f8f9fa',
//         borderRadius: 16,
//         marginBottom: 16,
//     },
//     calendarHeader: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         justifyContent: 'space-between',
//         marginBottom: 16,
//     },
//     calendarNavButton: {
//         width: 36,
//         height: 36,
//         borderRadius: 18,
//         backgroundColor: '#fff',
//         justifyContent: 'center',
//         alignItems: 'center',
//         borderWidth: 1,
//         borderColor: '#e5e7eb',
//     },
//     calendarTitle: {
//         fontSize: 16,
//         fontWeight: '700',
//         color: '#111',
//     },
//     calendar: {
//         flexDirection: 'row',
//         flexWrap: 'wrap',
//     },
//     calendarDayHeader: {
//         width: CALENDAR_DAY_SIZE,
//         alignItems: 'center',
//         paddingVertical: 8,
//     },
//     calendarDayHeaderText: {
//         fontSize: 12,
//         fontWeight: '700',
//         color: '#666',
//     },
//     calendarDay: {
//         width: CALENDAR_DAY_SIZE,
//         aspectRatio: 1,
//         alignItems: 'center',
//         justifyContent: 'center',
//         borderRadius: 8,
//     },
//     calendarDayOther: {
//         opacity: 0,
//     },
//     calendarDayToday: {
//         backgroundColor: '#E3F2FD',
//         borderWidth: 2,
//         borderColor: '#0469ff',
//     },
//     calendarDayText: {
//         fontSize: 14,
//         fontWeight: '600',
//         color: '#111',
//     },
//     calendarDayTextToday: {
//         color: '#0469ff',
//         fontWeight: '700',
//     },
//     calendarDayDot: {
//         width: 6,
//         height: 6,
//         borderRadius: 3,
//         marginTop: 3,
//     },
//     legend: {
//         flexDirection: 'row',
//         justifyContent: 'space-around',
//         marginTop: 16,
//         paddingTop: 16,
//         borderTopWidth: 1,
//         borderTopColor: '#e5e7eb',
//     },
//     legendItem: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 6,
//     },
//     legendDot: {
//         width: 10,
//         height: 10,
//         borderRadius: 5,
//     },
//     legendText: {
//         fontSize: 11,
//         color: '#666',
//         fontWeight: '600',
//     },
//     activityCard: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         padding: 14,
//         backgroundColor: '#f8f9fa',
//         borderRadius: 12,
//         marginBottom: 8,
//     },
//     activityIcon: {
//         width: 40,
//         height: 40,
//         borderRadius: 20,
//         justifyContent: 'center',
//         alignItems: 'center',
//     },
//     activityContent: {
//         flex: 1,
//         marginLeft: 12,
//         gap: 4,
//     },
//     activityDate: {
//         fontSize: 14,
//         fontWeight: '600',
//         color: '#111',
//     },
//     statusBadge: {
//         alignSelf: 'flex-start',
//         paddingHorizontal: 8,
//         paddingVertical: 4,
//         borderRadius: 8,
//     },
//     statusText: {
//         fontSize: 11,
//         fontWeight: '700',
//     },
//     activityTime: {
//         fontSize: 12,
//         color: '#666',
//         fontWeight: '600',
//     },
// });
// Parent view for child's attendance - app/(tabs)/my-child-attendance.jsx
import React, { useState, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Dimensions,
    ActivityIndicator,
    Alert
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    Calendar as CalendarIcon,
    TrendingUp,
    Award,
    AlertCircle,
    CheckCircle,
    XCircle,
    Clock,
    ChevronLeft,
    ChevronRight,
    ArrowLeft,
    User,
    Sparkles
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import api from '../../../lib/api';
import HapticTouchable from '../../components/HapticTouch';

const getISTDateString = (dateInput = new Date()) => {
    let date;
    
    if (typeof dateInput === 'string') {
        // If it's already YYYY-MM-DD, return as-is
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
            return dateInput;
        }
        date = new Date(dateInput);
    } else {
        date = new Date(dateInput);
    }

    if (isNaN(date.getTime())) return null;

    const offset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(date.getTime() + offset);
    return istDate.toISOString().split('T')[0];
};

const formatIST = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

const formatISTTime = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_DAY_SIZE = (SCREEN_WIDTH - 64) / 7;

export default function ParentAttendanceView() {
    const params = useLocalSearchParams();
    const childData = params.childData ? JSON.parse(params.childData) : null;

    const queryClient = useQueryClient();
    const [refreshing, setRefreshing] = useState(false);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        const offset = 5.5 * 60 * 60 * 1000;
        const ist = new Date(now.getTime() + offset);
        return new Date(ist.getFullYear(), ist.getMonth(), 1);
    });


    // Load user data
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const studentId = childData?.studentId;

    // Fetch attendance stats
    const { data: statsData, isLoading } = useQuery({
        queryKey: ['child-attendance-stats', studentId, currentMonth],
        queryFn: async () => {
            if (!studentId) return null;
            const month = currentMonth.getMonth() + 1;
            const year = currentMonth.getFullYear();
            const res = await api.get(
                `/schools/${schoolId}/attendance/stats?userId=${studentId}&month=${month}&year=${year}`
            );
            return res.data;
        },
        enabled: !!studentId && !!schoolId,
        staleTime: 1000 * 60 * 2,
    });

    const stats = statsData?.monthlyStats;
    const recentAttendance = statsData?.recentAttendance || [];
    const streak = statsData?.streak;

    // Generate calendar days
    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        const days = [];

        // Padding for first row
        const firstDay = new Date(year, month, 1);
        for (let i = 0; i < firstDay.getDay(); i++) {
            days.push({ date: null, isOtherMonth: true });
        }

        // Today in IST (YYYY-MM-DD)
        const todayIST = getISTDateString();

        // Loop through days
        for (let i = 1; i <= 31; i++) {
            if (i > new Date(year, month + 1, 0).getDate()) break;

            // Generate IST date string: "2025-11-12"
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;

            // Find matching attendance — WORKS WITH ANY SERVER FORMAT (using checkInTime for date matching)
            const dayData = recentAttendance.find(record => {
                const serverDate = record.checkInTime; // Use checkInTime instead of date for IST alignment

                if (!serverDate) return false;

                // Case 1: Already "2025-11-12"
                if (serverDate === dateStr) return true;

                // Case 2: Full ISO string "2025-11-12T00:00:00.000Z"
                if (typeof serverDate === 'string' && serverDate.includes('T')) {
                    return getISTDateString(serverDate) === dateStr;
                }

                // Case 3: Any other format — convert to IST string
                try {
                    return getISTDateString(serverDate) === dateStr;
                } catch (e) {
                    return false;
                }
            });

            days.push({
                date: i,
                fullDate: dateStr,
                isToday: dateStr === todayIST,
                attendance: dayData
            });
        }

        return days;
    }, [currentMonth, recentAttendance]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['child-attendance-stats']);
        setRefreshing(false);
    }, []);

    const getStatusColor = (status) => {
        switch (status) {
            case 'PRESENT': return '#51CF66';
            case 'ABSENT': return '#FF6B6B';
            case 'LATE': return '#FFB020';
            case 'HALF_DAY': return '#FF8C42';
            case 'ON_LEAVE': return '#8B5CF6';
            default: return '#94A3B8';
        }
    };

    const getStatusConfig = (status) => {
        const configs = {
            PRESENT: { color: '#51CF66', icon: CheckCircle, bg: '#E7F5E9' },
            ABSENT: { color: '#FF6B6B', icon: XCircle, bg: '#FFE9E9' },
            LATE: { color: '#FFB020', icon: Clock, bg: '#FFF9E0' },
            HALF_DAY: { color: '#FF8C42', icon: Clock, bg: '#FFE9D6' },
            ON_LEAVE: { color: '#8B5CF6', icon: AlertCircle, bg: '#F3E8FF' },
        };
        return configs[status] || { color: '#94A3B8', icon: AlertCircle, bg: '#F1F5F9' };
    };

    const formatDate = (dateString) => formatIST(dateString);

    if (!childData) {
        return (
            <View style={styles.loaderContainer}>
                <AlertCircle size={48} color="#999" />
                <Text style={styles.noDataText}>No child selected</Text>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButtonCenter}>
                        <Text style={styles.backButtonText}>Go Back</Text>
                    </View>
                </HapticTouchable>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Attendance</Text>
                    <Text style={styles.headerSubtitle}>
                        {childData.name} - {childData.class?.className}
                    </Text>
                </View>
                <View style={{ width: 40 }} />
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
            >
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0469ff" />
                    </View>
                ) : !stats ? (
                    <Animated.View entering={FadeInDown.delay(300)} style={styles.noDataCard}>
                        <AlertCircle size={48} color="#999" />
                        <Text style={styles.noDataText}>No attendance data available</Text>
                    </Animated.View>
                ) : (
                    <>
                        {/* Stats Cards */}
                        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
                            <View style={styles.summaryGrid}>
                                <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.summaryCard}>
                                    <TrendingUp size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>{Math.round(stats.attendancePercentage)}%</Text>
                                    <Text style={styles.summaryLabel}>Attendance</Text>
                                </LinearGradient>

                                <LinearGradient colors={['#51CF66', '#37B24D']} style={styles.summaryCard}>
                                    <CheckCircle size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>{stats.totalPresent}</Text>
                                    <Text style={styles.summaryLabel}>Present</Text>
                                </LinearGradient>

                                <LinearGradient colors={['#FF6B6B', '#EE5A6F']} style={styles.summaryCard}>
                                    <XCircle size={24} color="#fff" />
                                    <Text style={styles.summaryValue}>{stats.totalAbsent}</Text>
                                    <Text style={styles.summaryLabel}>Absent</Text>
                                </LinearGradient>
                            </View>
                        </Animated.View>

                        {/* Streak Card */}
                        {streak && streak.current > 0 && (
                            <Animated.View entering={FadeInDown.delay(400).duration(500)} style={styles.streakCard}>
                                <LinearGradient colors={['#FFB020', '#FF8C42']} style={styles.streakGradient}>
                                    <Award size={32} color="#fff" />
                                    <View style={styles.streakInfo}>
                                        <Text style={styles.streakValue}>{streak.current} Days</Text>
                                        <Text style={styles.streakLabel}>Current Streak 🔥</Text>
                                    </View>
                                    <View style={styles.streakBadge}>
                                        <Sparkles size={14} color="#92400E" />
                                        <Text style={styles.streakBadgeText}>Best: {streak.longest}</Text>
                                    </View>
                                </LinearGradient>
                            </Animated.View>
                        )}

                        {/* Low Attendance Warning */}
                        {stats.attendancePercentage < 75 && (
                            <Animated.View entering={FadeInDown.delay(500).duration(500)} style={styles.warningCard}>
                                <View style={styles.warningIconContainer}>
                                    <AlertCircle size={24} color="#FF6B6B" />
                                </View>
                                <View style={styles.warningContent}>
                                    <Text style={styles.warningTitle}>Low Attendance Alert</Text>
                                    <Text style={styles.warningMessage}>
                                        Current attendance is {Math.round(stats.attendancePercentage)}%, below the required 75%
                                    </Text>
                                </View>
                            </Animated.View>
                        )}

                        {/* Calendar Section */}
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Monthly Overview</Text>
                        </View>

                        <Animated.View entering={FadeInDown.delay(600).duration(500)} style={styles.calendarCard}>
                            <View style={styles.calendarHeader}>
                                <HapticTouchable onPress={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}>
                                    <View style={styles.calendarNavButton}>
                                        <ChevronLeft size={20} color="#0469ff" />
                                    </View>
                                </HapticTouchable>

                                <Text style={styles.calendarTitle}>
                                    {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                </Text>

                                <HapticTouchable onPress={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}>
                                    <View style={styles.calendarNavButton}>
                                        <ChevronRight size={20} color="#0469ff" />
                                    </View>
                                </HapticTouchable>
                            </View>

                            {/* Calendar Grid */}
                            <View style={styles.calendar}>
                                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                    <View key={idx} style={styles.calendarDayHeader}>
                                        <Text style={styles.calendarDayHeaderText}>{day}</Text>
                                    </View>
                                ))}

                                {calendarDays.map((day, idx) => {
                                    const statusConfig = day.attendance ? getStatusConfig(day.attendance.status) : null;

                                    return (
                                        <View
                                            key={idx}
                                            style={[
                                                styles.calendarDay,
                                                day.isOtherMonth && styles.calendarDayOther,
                                                day.isToday && styles.calendarDayToday,
                                            ]}
                                        >
                                            {!day.isOtherMonth && (
                                                <>
                                                    <Text style={[
                                                        styles.calendarDayText,
                                                        day.isToday && styles.calendarDayTextToday
                                                    ]}>
                                                        {day.date}
                                                    </Text>
                                                    {day.attendance && (
                                                        <View style={[
                                                            styles.calendarDayDot,
                                                            { backgroundColor: statusConfig.color }
                                                        ]} />
                                                    )}
                                                </>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>

                            {/* Legend */}
                            <View style={styles.legend}>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#51CF66' }]} />
                                    <Text style={styles.legendText}>Present</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#FF6B6B' }]} />
                                    <Text style={styles.legendText}>Absent</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#FFB020' }]} />
                                    <Text style={styles.legendText}>Late</Text>
                                </View>
                                <View style={styles.legendItem}>
                                    <View style={[styles.legendDot, { backgroundColor: '#8B5CF6' }]} />
                                    <Text style={styles.legendText}>Leave</Text>
                                </View>
                            </View>
                        </Animated.View>

                        {/* Recent Activity */}
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Recent Activity</Text>
                            <Text style={styles.activityCount}>{recentAttendance.slice(0, 7).length} Records</Text>
                        </View>

                        {recentAttendance.slice(0, 7).map((record, idx) => {
                            const statusConfig = getStatusConfig(record.status);
                            const StatusIcon = statusConfig.icon;

                            return (
                                <Animated.View key={record.id} entering={FadeInRight.delay(700 + idx * 50)}>
                                    <View style={styles.activityCard}>
                                        <View style={[styles.activityIcon, { backgroundColor: statusConfig.bg }]}>
                                            <StatusIcon size={20} color={statusConfig.color} />
                                        </View>
                                        <View style={styles.activityContent}>
                                            <Text style={styles.activityDate}>
                                                {formatIST(record.checkInTime)}
                                            </Text>
                                            <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                                                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                                                    {record.status}
                                                </Text>
                                            </View>
                                        </View>
                                        {record.checkInTime && (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                                <Clock size={12} color="#666" />
                                                <Text style={styles.activityTime}>
                                                    {formatISTTime(record.checkInTime)}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </Animated.View>
                            );
                        })}

                        <View style={{ height: 40 }} />
                    </>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    backButtonCenter: {
        marginTop: 20,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#0469ff',
        borderRadius: 12,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 13,
        color: '#666',
        marginTop: 2,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    loadingContainer: {
        padding: 40,
        alignItems: 'center',
    },
    noDataCard: {
        padding: 40,
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        marginTop: 20,
    },
    noDataText: {
        fontSize: 16,
        color: '#999',
    },
    summaryGrid: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    summaryCard: {
        flex: 1,
        padding: 16,
        borderRadius: 16,
        alignItems: 'center',
        gap: 8,
    },
    summaryValue: {
        fontSize: 20,
        fontWeight: '700',
        color: '#fff',
    },
    summaryLabel: {
        fontSize: 12,
        color: 'rgba(255,255,255,0.9)',
        fontWeight: '600',
    },
    streakCard: {
        marginBottom: 16,
        borderRadius: 16,
        overflow: 'hidden',
    },
    streakGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 20,
    },
    streakInfo: {
        flex: 1,
        marginLeft: 12,
    },
    streakValue: {
        fontSize: 24,
        fontWeight: '700',
        color: '#fff',
    },
    streakLabel: {
        fontSize: 13,
        color: '#fff',
        marginTop: 2,
        opacity: 0.9,
    },
    streakBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#FDE047',
        borderRadius: 12,
    },
    streakBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#92400E',
    },
    warningCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 16,
        padding: 16,
        backgroundColor: '#FFE9E9',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#FFD6D6',
    },
    warningIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },
    warningContent: {
        flex: 1,
        marginLeft: 12,
    },
    warningTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#991B1B',
        marginBottom: 4,
    },
    warningMessage: {
        fontSize: 13,
        color: '#991B1B',
        lineHeight: 18,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        marginTop: 8,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
    },
    activityCount: {
        fontSize: 13,
        color: '#666',
        backgroundColor: '#f5f5f5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        fontWeight: '600',
    },
    calendarCard: {
        padding: 16,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        marginBottom: 16,
    },
    calendarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    calendarNavButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    calendarTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    calendar: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    calendarDayHeader: {
        width: CALENDAR_DAY_SIZE,
        alignItems: 'center',
        paddingVertical: 8,
    },
    calendarDayHeaderText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#666',
    },
    calendarDay: {
        width: CALENDAR_DAY_SIZE,
        aspectRatio: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
    },
    calendarDayOther: {
        opacity: 0,
    },
    calendarDayToday: {
        backgroundColor: '#E3F2FD',
        borderWidth: 2,
        borderColor: '#0469ff',
    },
    calendarDayText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    calendarDayTextToday: {
        color: '#0469ff',
        fontWeight: '700',
    },
    calendarDayDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginTop: 3,
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    legendText: {
        fontSize: 11,
        color: '#666',
        fontWeight: '600',
    },
    activityCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 8,
    },
    activityIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    activityContent: {
        flex: 1,
        marginLeft: 12,
        gap: 4,
    },
    activityDate: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    statusBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 11,
        fontWeight: '700',
    },
    activityTime: {
        fontSize: 12,
        color: '#666',
        fontWeight: '600',
    },
});