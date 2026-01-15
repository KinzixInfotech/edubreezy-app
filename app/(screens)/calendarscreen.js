import React, { useState, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    RefreshControl,
    Dimensions,
    Pressable,
    Platform,
    Modal,
    Linking,
    ActivityIndicator
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import {
    Calendar as CalendarIcon,
    Clock,
    MapPin,
    ArrowLeft,
    X,
    ChevronLeft,
    ChevronRight,
    Sparkles,
    AlertCircle,
    ExternalLink
} from 'lucide-react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeInRight, FadeIn } from 'react-native-reanimated';
import * as SecureStore from 'expo-secure-store';
import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CALENDAR_WIDTH = SCREEN_WIDTH - 32;
const DAY_WIDTH = CALENDAR_WIDTH / 7;

const eventTypeColors = {
    CUSTOM: '#3B82F6',
    HOLIDAY: '#EF4444',
    VACATION: '#F59E0B',
    EXAM: '#8B5CF6',
    SPORTS: '#10B981',
    MEETING: '#6366F1',
    ADMISSION: '#EC4899',
    FEE_DUE: '#F97316',
    BIRTHDAY: '#14B8A6',
};

const eventTypeLabels = {
    CUSTOM: 'Custom Event',
    HOLIDAY: 'Holiday',
    VACATION: 'Vacation',
    EXAM: 'Examination',
    SPORTS: 'Sports Event',
    MEETING: 'Meeting',
    ADMISSION: 'Admission',
    FEE_DUE: 'Fee Due',
    BIRTHDAY: 'Birthday',
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function CalendarScreen() {
    const params = useLocalSearchParams();

    const [refreshing, setRefreshing] = useState(false);
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [detailModalVisible, setDetailModalVisible] = useState(false);
    const [dateEventsModalVisible, setDateEventsModalVisible] = useState(false);
    const [dateEvents, setDateEvents] = useState([]);

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

    // Calculate 6-month range once (centered on today)
    const dateRange = useMemo(() => {
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth() - 3, 1); // 3 months before
        const endDate = new Date(today.getFullYear(), today.getMonth() + 4, 0);   // 3 months after (end of month)
        return { startDate, endDate };
    }, []); // Only calculate once on mount

    // Fetch calendar events for 6-month range (single query, no refetch on month change)
    const { data: eventsData, isLoading, isFetching, refetch } = useQuery({
        queryKey: ['calendar-events-range', schoolId],
        queryFn: async () => {
            console.log('📅 Fetching calendar events...'); // Debug log
            const res = await api.get(
                `/schools/${schoolId}/calendar/events?startDate=${dateRange.startDate.toISOString()}&endDate=${dateRange.endDate.toISOString()}`
            );
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 10, // 10 minutes
        gcTime: 1000 * 60 * 30,    // Keep in cache for 30 minutes
        refetchOnMount: false,     // Don't refetch when component mounts if data exists
        refetchOnWindowFocus: false, // Don't refetch on app focus
    });

    // console.log(eventsData)

    // Fetch upcoming events
    const { data: upcomingData } = useQuery({
        queryKey: ['upcoming-events', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/calendar/upcoming?limit=10`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 1000 * 60 * 5,
    });


    const events = eventsData?.events || [];
    const upcomingEvents = upcomingData?.events || [];
    const hasGoogleCalendar = eventsData?.hasGoogleCalendar || false;

    // Calendar calculations
    const monthYear = currentDate.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric'
    });

    const getDaysInMonth = useCallback(() => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();

        const days = [];

        // Previous month days
        const prevMonthLastDay = new Date(year, month, 0).getDate();
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            days.push({
                date: prevMonthLastDay - i,
                isCurrentMonth: false,
                fullDate: new Date(year, month - 1, prevMonthLastDay - i),
            });
        }

        // Current month days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push({
                date: i,
                isCurrentMonth: true,
                fullDate: new Date(year, month, i),
            });
        }

        // Next month days
        const remainingDays = 42 - days.length;
        for (let i = 1; i <= remainingDays; i++) {
            days.push({
                date: i,
                isCurrentMonth: false,
                fullDate: new Date(year, month + 1, i),
            });
        }

        return days;
    }, [currentDate]);

    const getEventsForDate = useCallback((date) => {
        return events.filter(event => {
            const eventStart = new Date(event.startDate || event.start);
            return eventStart.toDateString() === date.toDateString();
        });
    }, [events]);

    const handleDateClick = (day) => {
        const dayEvents = getEventsForDate(day.fullDate);

        if (dayEvents.length === 1) {
            setSelectedEvent(dayEvents[0]);
            setDetailModalVisible(true);
        } else if (dayEvents.length > 1) {
            setSelectedDate(day.fullDate);
            setDateEvents(dayEvents);
            setDateEventsModalVisible(true);
        }
    };

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
    };

    const handleToday = () => {
        setCurrentDate(new Date());
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    };

    const formatTime = (time) => {
        if (!time) return '';
        const [hours, minutes] = time.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12;
        return `${displayHour}:${minutes} ${ampm}`;
    };

    const getStatusConfig = (eventType) => {
        return {
            color: eventTypeColors[eventType] || '#3B82F6',
            label: eventTypeLabels[eventType] || eventType,
        };
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const days = useMemo(() => getDaysInMonth(), [getDaysInMonth]);
    const today = new Date();

    if (!schoolId) {
        return (
            <View style={styles.loaderContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style='dark' />
            {/* Header */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}>
                        <ArrowLeft size={24} color="#111" />
                    </View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>School Calendar</Text>
                    <Text style={styles.headerSubtitle}>View all events</Text>
                </View>
                {hasGoogleCalendar && (
                    <View style={styles.googleBadge}>
                        <View style={styles.googleDot} />
                    </View>
                )}
                {!hasGoogleCalendar && <View style={{ width: 40 }} />}
            </Animated.View>

            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#0469ff"
                    />
                }
            >
                {/* Calendar Card */}
                <Animated.View entering={FadeInDown.delay(200).duration(500)}>
                    <View style={styles.calendarCard}>
                        {/* Calendar Header */}
                        <View style={styles.calendarHeader}>
                            <Text style={styles.monthYear}>{monthYear}</Text>
                            <View style={styles.calendarControls}>
                                <HapticTouchable onPress={handleToday}>
                                    <View style={styles.todayButton}>
                                        <Text style={styles.todayButtonText}>Today</Text>
                                    </View>
                                </HapticTouchable>
                                <HapticTouchable onPress={handlePrevMonth}>
                                    <View style={styles.navButton}>
                                        <ChevronLeft size={20} color="#666" />
                                    </View>
                                </HapticTouchable>
                                <HapticTouchable onPress={handleNextMonth}>
                                    <View style={styles.navButton}>
                                        <ChevronRight size={20} color="#666" />
                                    </View>
                                </HapticTouchable>
                            </View>
                        </View>

                        {/* Weekday Headers */}
                        <View style={styles.weekdayHeader}>
                            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
                                <View
                                    key={idx}
                                    style={[
                                        styles.weekdayCell,
                                        (idx === 0 || idx === 6) && styles.weekendHeader
                                    ]}
                                >
                                    <Text style={styles.weekdayText}>{day}</Text>
                                </View>
                            ))}
                        </View>

                        {/* Calendar Grid */}
                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#0469ff" />
                                <Text style={styles.loadingText}>Loading calendar...</Text>
                            </View>
                        ) : (
                            <View style={styles.calendarGrid}>
                                {days.map((day, idx) => {
                                    const dayEvents = getEventsForDate(day.fullDate);
                                    const isToday = day.fullDate.toDateString() === today.toDateString();
                                    const isWeekend = day.fullDate.getDay() === 0 || day.fullDate.getDay() === 6;

                                    return (
                                        <HapticTouchable
                                            key={idx}
                                            onPress={() => handleDateClick(day)}
                                            disabled={!day.isCurrentMonth || dayEvents.length === 0}
                                        >
                                            <View
                                                style={[
                                                    styles.dayCell,
                                                    !day.isCurrentMonth && styles.otherMonthDay,
                                                    isToday && styles.todayCell,
                                                    isWeekend && day.isCurrentMonth && styles.weekendCell,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.dayText,
                                                        !day.isCurrentMonth && styles.otherMonthText,
                                                        isToday && styles.todayText,
                                                    ]}
                                                >
                                                    {day.date}
                                                </Text>
                                                {dayEvents.length > 0 && (
                                                    <View style={styles.eventIndicators}>
                                                        {dayEvents.slice(0, 3).map((event, i) => (
                                                            <View
                                                                key={i}
                                                                style={[
                                                                    styles.eventDot,
                                                                    { backgroundColor: event.color || '#3B82F6' }
                                                                ]}
                                                            />
                                                        ))}
                                                    </View>
                                                )}
                                            </View>
                                        </HapticTouchable>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                </Animated.View>

                {/* Upcoming Events */}
                <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Events</Text>
                        <Text style={styles.eventCount}>{upcomingEvents.length} events</Text>
                    </View>

                    {upcomingEvents.length === 0 ? (
                        <View style={styles.noEventsCard}>
                            <CalendarIcon size={48} color="#ccc" />
                            <Text style={styles.noEventsText}>No upcoming events</Text>
                        </View>
                    ) : (
                        upcomingEvents.map((event, index) => {
                            const statusConfig = getStatusConfig(event.eventType);
                            const eventDate = new Date(event.startDate || event.start);
                            const isEventToday = eventDate.toDateString() === today.toDateString();

                            return (
                                <Animated.View
                                    key={event.id}
                                    entering={FadeInRight.delay(500 + index * 100).duration(500)}
                                >
                                    <HapticTouchable
                                        onPress={() => {
                                            setSelectedEvent(event);
                                            setDetailModalVisible(true);
                                        }}
                                    >
                                        <View style={styles.eventCard}>
                                            <View
                                                style={[
                                                    styles.eventColorBar,
                                                    { backgroundColor: statusConfig.color }
                                                ]}
                                            />
                                            <View style={styles.eventContent}>
                                                <View style={styles.eventHeader}>
                                                    <Text style={styles.eventTitle} numberOfLines={1}>
                                                        {event.title}
                                                    </Text>
                                                    {isEventToday && (
                                                        <View style={styles.todayBadge}>
                                                            <Text style={styles.todayBadgeText}>TODAY</Text>
                                                        </View>
                                                    )}
                                                </View>

                                                <View style={styles.eventMeta}>
                                                    <View style={styles.eventMetaRow}>
                                                        <CalendarIcon size={14} color="#666" />
                                                        <Text style={styles.eventMetaText}>
                                                            {formatDate(event.startDate || event.start)}
                                                        </Text>
                                                    </View>

                                                    {event.startTime && !event.isAllDay && (
                                                        <View style={styles.eventMetaRow}>
                                                            <Clock size={14} color="#666" />
                                                            <Text style={styles.eventMetaText}>
                                                                {formatTime(event.startTime)}
                                                                {event.endTime && ` - ${formatTime(event.endTime)}`}
                                                            </Text>
                                                        </View>
                                                    )}

                                                    {event.location && (
                                                        <View style={styles.eventMetaRow}>
                                                            <MapPin size={14} color="#666" />
                                                            <Text style={styles.eventMetaText} numberOfLines={1}>
                                                                {event.location}
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>

                                                <View style={styles.eventFooter}>
                                                    <View
                                                        style={[
                                                            styles.eventTypeBadge,
                                                            { backgroundColor: statusConfig.color + '20' }
                                                        ]}
                                                    >
                                                        <Text
                                                            style={[
                                                                styles.eventTypeText,
                                                                { color: statusConfig.color }
                                                            ]}
                                                        >
                                                            {statusConfig.label}
                                                        </Text>
                                                    </View>

                                                    {event.priority && event.priority !== 'NORMAL' && (
                                                        <View style={styles.priorityBadge}>
                                                            <Sparkles size={12} color="#FF6B6B" />
                                                            <Text style={styles.priorityText}>{event.priority}</Text>
                                                        </View>
                                                    )}

                                                    {event.source === 'google' && (
                                                        <View style={styles.sourceBadge}>
                                                            <Text style={styles.sourceText}>Google</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            </View>
                                        </View>
                                    </HapticTouchable>
                                </Animated.View>
                            );
                        })
                    )}
                </Animated.View>

                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Date Events Modal */}
            <Modal
                visible={dateEventsModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setDateEventsModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Animated.View entering={FadeIn.duration(200)} style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                {selectedDate?.toLocaleDateString('en-US', {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                })}
                            </Text>
                            <HapticTouchable onPress={() => setDateEventsModalVisible(false)}>
                                <X size={24} color="#666" />
                            </HapticTouchable>
                        </View>

                        <ScrollView style={styles.modalBody}>
                            {dateEvents.map((event, idx) => {
                                const statusConfig = getStatusConfig(event.eventType);
                                return (
                                    <HapticTouchable
                                        key={idx}
                                        onPress={() => {
                                            setDateEventsModalVisible(false);
                                            setSelectedEvent(event);
                                            setDetailModalVisible(true);
                                        }}
                                    >
                                        <View style={styles.modalEventCard}>
                                            <View
                                                style={[
                                                    styles.modalEventBar,
                                                    { backgroundColor: statusConfig.color }
                                                ]}
                                            />
                                            <View style={styles.modalEventContent}>
                                                <Text style={styles.modalEventTitle}>{event.title}</Text>
                                                {event.startTime && (
                                                    <Text style={styles.modalEventTime}>
                                                        {formatTime(event.startTime)} - {formatTime(event.endTime)}
                                                    </Text>
                                                )}
                                                <View
                                                    style={[
                                                        styles.modalEventBadge,
                                                        { backgroundColor: statusConfig.color + '20' }
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.modalEventBadgeText,
                                                            { color: statusConfig.color }
                                                        ]}
                                                    >
                                                        {statusConfig.label}
                                                    </Text>
                                                </View>
                                            </View>
                                        </View>
                                    </HapticTouchable>
                                );
                            })}
                        </ScrollView>
                    </Animated.View>
                </View>
            </Modal>

            {/* Event Detail Modal */}
            <Modal
                visible={detailModalVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setDetailModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <Animated.View entering={FadeIn.duration(200)} style={styles.detailModalContent}>
                        {selectedEvent && (
                            <>
                                <View style={styles.detailHeader}>
                                    <View style={styles.detailHeaderLeft}>
                                        <View
                                            style={[
                                                styles.detailColorBar,
                                                { backgroundColor: selectedEvent.color || '#3B82F6' }
                                            ]}
                                        />
                                        <Text style={styles.detailTitle} numberOfLines={2}>
                                            {selectedEvent.title}
                                        </Text>
                                    </View>
                                    <HapticTouchable onPress={() => setDetailModalVisible(false)}>
                                        <View style={styles.closeButton}>
                                            <X size={20} color="#666" />
                                        </View>
                                    </HapticTouchable>
                                </View>

                                <ScrollView style={styles.detailBody} showsVerticalScrollIndicator={false}>
                                    {selectedEvent.description && (
                                        <View style={styles.detailSection}>
                                            <Text style={styles.detailSectionTitle}>Description</Text>
                                            <Text style={styles.detailDescription}>
                                                {selectedEvent.description}
                                            </Text>
                                        </View>
                                    )}

                                    <View style={styles.detailInfoGrid}>
                                        <View style={styles.detailInfoCard}>
                                            <View style={styles.detailInfoIcon}>
                                                <CalendarIcon size={20} color="#0469ff" />
                                            </View>
                                            <View style={styles.detailInfoContent}>
                                                <Text style={styles.detailInfoLabel}>Date</Text>
                                                <Text style={styles.detailInfoValue}>
                                                    {formatDate(selectedEvent.startDate || selectedEvent.start)}
                                                </Text>
                                            </View>
                                        </View>

                                        {selectedEvent.startTime && !selectedEvent.isAllDay && (
                                            <View style={styles.detailInfoCard}>
                                                <View style={styles.detailInfoIcon}>
                                                    <Clock size={20} color="#0469ff" />
                                                </View>
                                                <View style={styles.detailInfoContent}>
                                                    <Text style={styles.detailInfoLabel}>Time</Text>
                                                    <Text style={styles.detailInfoValue}>
                                                        {formatTime(selectedEvent.startTime)} - {formatTime(selectedEvent.endTime)}
                                                    </Text>
                                                </View>
                                            </View>
                                        )}

                                        {selectedEvent.location && (
                                            <View style={styles.detailInfoCard}>
                                                <View style={styles.detailInfoIcon}>
                                                    <MapPin size={20} color="#0469ff" />
                                                </View>
                                                <View style={styles.detailInfoContent}>
                                                    <Text style={styles.detailInfoLabel}>Location</Text>
                                                    <Text style={styles.detailInfoValue}>
                                                        {selectedEvent.location}
                                                        {selectedEvent.venue && ` - ${selectedEvent.venue}`}
                                                    </Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>

                                    <View style={styles.detailBadges}>
                                        <View
                                            style={[
                                                styles.detailBadge,
                                                { backgroundColor: (selectedEvent.color || '#3B82F6') + '20' }
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.detailBadgeText,
                                                    { color: selectedEvent.color || '#3B82F6' }
                                                ]}
                                            >
                                                {getStatusConfig(selectedEvent.eventType).label}
                                            </Text>
                                        </View>

                                        {selectedEvent.priority && selectedEvent.priority !== 'NORMAL' && (
                                            <View style={styles.detailBadge}>
                                                <Sparkles size={12} color="#FF6B6B" />
                                                <Text style={styles.detailBadgeText}>{selectedEvent.priority}</Text>
                                            </View>
                                        )}

                                        {selectedEvent.source === 'google' && (
                                            <View style={styles.detailBadge}>
                                                <ExternalLink size={12} color="#666" />
                                                <Text style={styles.detailBadgeText}>Google Calendar</Text>
                                            </View>
                                        )}
                                    </View>

                                    {selectedEvent.source === 'google' && selectedEvent.htmlLink && (
                                        <HapticTouchable
                                            onPress={() => {
                                                const url = selectedEvent.htmlLink;
                                                if (!url) return;

                                                if (Platform.OS === 'android') {
                                                    // Open Google Calendar app directly
                                                    IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
                                                        data: url,
                                                        packageName: 'com.google.android.calendar',
                                                    }).catch(() => {
                                                        // Fallback to browser if Google Calendar app isn't installed
                                                        Linking.openURL(url).catch(() =>
                                                            Alert.alert('Cannot open Google Calendar event.')
                                                        );
                                                    });
                                                } else {
                                                    // iOS: just open in browser
                                                    Linking.openURL(url).catch(() =>
                                                        Alert.alert('Cannot open Google Calendar event.')
                                                    );
                                                }
                                            }}
                                        >

                                            <View style={styles.googleLinkButton}>
                                                <ExternalLink size={16} color="#0469ff" />
                                                <Text style={styles.googleLinkText}>View in Google Calendar</Text>
                                            </View>
                                        </HapticTouchable>
                                    )}
                                </ScrollView>
                            </>
                        )}
                    </Animated.View>
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
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
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
    googleBadge: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E7F5E9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    googleDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#51CF66',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    calendarCard: {
        backgroundColor: '#ffffffff',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
        // borderWidth:0.,
        // borderColor:'gray',
        // shadowColor: '#000',
        // shadowOffset: { width: 0, height: 2 },
        // shadowOpacity: 0.1,
        // shadowRadius: 8,
        // elevation: 4,
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    monthYear: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    calendarControls: {
        flexDirection: 'row',
        gap: 8,
    },
    todayButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: '#E3F2FD',
        borderRadius: 8,
    },
    todayButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#0469ff',
    },
    navButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    weekdayHeader: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    weekdayCell: {
        width: DAY_WIDTH,
        alignItems: 'center',
        paddingVertical: 8,
    },
    weekendHeader: {
        backgroundColor: '#f8f9fa',
    },
    weekdayText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
    },
    loadingContainer: {
        paddingVertical: 60,
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 14,
        color: '#666',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: DAY_WIDTH,
        height: DAY_WIDTH * 0.9,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 8,
        marginBottom: 4,
    },
    otherMonthDay: {
        opacity: 0.3,
    },
    todayCell: {
        backgroundColor: '#E3F2FD',
    },
    weekendCell: {
        backgroundColor: '#f8f9fa',
    },
    dayText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    otherMonthText: {
        color: '#999',
    },
    todayText: {
        color: '#0469ff',
    },
    eventIndicators: {
        flexDirection: 'row',
        gap: 2,
        marginTop: 4,
    },
    eventDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111',
    },
    eventCount: {
        fontSize: 14,
        color: '#666',
        backgroundColor: '#f5f5f5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    noEventsCard: {
        padding: 40,
        alignItems: 'center',
        gap: 12,
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
    },
    noEventsText: {
        fontSize: 16,
        color: '#999',
    },
    eventCard: {
        flexDirection: 'row',
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
    },
    eventColorBar: {
        width: 4,
    },
    eventContent: {
        flex: 1,
        padding: 14,
    },
    eventHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    eventTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111',
        flex: 1,
    },
    todayBadge: {
        backgroundColor: '#FF6B6B',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        marginLeft: 8,
    },
    todayBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
    },
    eventMeta: {
        gap: 6,
        marginBottom: 8,
    },
    eventMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    eventMetaText: {
        fontSize: 12,
        color: '#666',
        flex: 1,
    },
    eventFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    eventTypeBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    eventTypeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    priorityBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: '#FFE9E9',
        borderRadius: 8,
    },
    priorityText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#FF6B6B',
    },
    sourceBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: '#E0E0E0',
        borderRadius: 8,
    },
    sourceText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#666',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    modalBody: {
        padding: 20,
    },
    modalEventCard: {
        flexDirection: 'row',
        backgroundColor: '#f8f9fa',
        borderRadius: 12,
        marginBottom: 12,
        overflow: 'hidden',
    },
    modalEventBar: {
        width: 4,
    },
    modalEventContent: {
        flex: 1,
        padding: 12,
    },
    modalEventTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
        marginBottom: 4,
    },
    modalEventTime: {
        fontSize: 12,
        color: '#666',
        marginBottom: 8,
    },
    modalEventBadge: {
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    modalEventBadgeText: {
        fontSize: 11,
        fontWeight: '600',
    },
    detailModalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
    },
    detailHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    detailHeaderLeft: {
        flex: 1,
        flexDirection: 'row',
        gap: 12,
        alignItems: 'flex-start',
    },
    detailColorBar: {
        width: 4,
        height: '100%',
        borderRadius: 2,
        marginTop: 2,
    },
    detailTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111',
        flex: 1,
    },
    closeButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailBody: {
        padding: 20,
    },
    detailSection: {
        marginBottom: 20,
    },
    detailSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
    },
    detailDescription: {
        fontSize: 15,
        color: '#111',
        lineHeight: 22,
    },
    detailInfoGrid: {
        gap: 12,
        marginBottom: 20,
    },
    detailInfoCard: {
        flexDirection: 'row',
        backgroundColor: '#f8f9fa',
        padding: 14,
        borderRadius: 12,
        gap: 12,
    },
    detailInfoIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    detailInfoContent: {
        flex: 1,
        justifyContent: 'center',
    },
    detailInfoLabel: {
        fontSize: 12,
        color: '#666',
        marginBottom: 2,
    },
    detailInfoValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111',
    },
    detailBadges: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 20,
    },
    detailBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
    },
    detailBadgeText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
    },
    googleLinkButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: 16,
        marginBottom: 10,
        backgroundColor: '#E3F2FD',
        borderRadius: 12,
    },
    googleLinkText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#0469ff',
    },
});