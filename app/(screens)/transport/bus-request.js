// Bus Request Screen for Parents — Modern Bottom Sheet Form
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    Alert,
    ActivityIndicator,
    RefreshControl,
    Modal,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
} from 'react-native';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import {
    ArrowLeft,
    Plus,
    X,
    Bus,
    MapPin,
    Send,
    User,
    Clock,
    CheckCircle2,
    AlertCircle,
    ChevronRight,
    Sparkles,
    Navigation,
    LocateFixed,
    Loader,
} from 'lucide-react-native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = ({ icon: Icon, title, subtitle, color = '#0469ff' }) => (
    <Animated.View entering={FadeInDown.delay(200).duration(400)} style={emptyStyles.wrap}>
        <View style={[emptyStyles.iconBg, { backgroundColor: color + '15' }]}>
            <Icon size={36} color={color} />
        </View>
        <Text style={emptyStyles.title}>{title}</Text>
        <Text style={emptyStyles.subtitle}>{subtitle}</Text>
    </Animated.View>
);

const emptyStyles = StyleSheet.create({
    wrap: { alignItems: 'center', paddingVertical: 56, gap: 10 },
    iconBg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    title: { fontSize: 16, fontWeight: '700', color: '#111' },
    subtitle: { fontSize: 13, color: '#888', textAlign: 'center', paddingHorizontal: 40, lineHeight: 19 },
});

const REQUEST_TYPES = [
    { key: 'NEW', label: 'New Service', emoji: '🆕', color: '#0469ff', bg: '#EEF4FF' },
    { key: 'CHANGE_STOP', label: 'Change Stop', emoji: '📍', color: '#8B5CF6', bg: '#F3EEFF' },
    { key: 'CANCEL', label: 'Cancel', emoji: '❌', color: '#EF4444', bg: '#FFF0F0' },
];

// ── Approximate location: suburb → district → state ───────────────────────────
async function getApproxLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('Permission denied');

    const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced, // no need for high accuracy
    });

    const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
    });

    // Build a human-readable approximate location (no house/street)
    // Priority: subregion (district) > city > region (state)
    const parts = [];
    if (geo.subregion) parts.push(geo.subregion);       // e.g. "Ranchi"
    else if (geo.city) parts.push(geo.city);             // fallback city
    if (geo.region) parts.push(geo.region);              // e.g. "Jharkhand"
    if (geo.country) parts.push(geo.country);            // e.g. "India"

    return parts.join(', ') || 'Unknown location';
}

export default function BusRequestScreen() {
    const params = useLocalSearchParams();
    const queryClient = useQueryClient();
    const insets = useSafeAreaInsets();

    const [refreshing, setRefreshing] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [locLoading, setLocLoading] = useState(false);
    const [formData, setFormData] = useState({
        studentId: '',
        requestType: 'NEW',
        preferredStop: '',
        reason: '',
    });

    const childData = params.childData ? JSON.parse(params.childData) : null;

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const parentId = userData?.parentData?.id || userData?.id;

    const { data: studentsData } = useQuery({
        queryKey: ['parent-students', schoolId, parentId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/parents/${parentId}/child`);
            return res.data;
        },
        enabled: !!schoolId && !!parentId,
    });

    const students = studentsData?.children || [];

    const { data: requestsData, isLoading } = useQuery({
        queryKey: ['bus-requests', schoolId, parentId],
        queryFn: async () => {
            const res = await api.get(`/schools/transport/requests?parentId=${parentId}&schoolId=${schoolId}`);
            return res.data;
        },
        enabled: !!schoolId && !!parentId,
        staleTime: 1000 * 60 * 2,
    });

    const requests = requestsData?.requests || [];

    const submitMutation = useMutation({
        mutationFn: async (data) => {
            const res = await api.post('/schools/transport/requests', { ...data, parentId, schoolId });
            return res.data;
        },
        onSuccess: () => {
            Alert.alert('✅ Submitted', 'Your bus request has been sent!');
            setShowModal(false);
            setFormData({ studentId: '', requestType: 'NEW', preferredStop: '', reason: '' });
            queryClient.invalidateQueries(['bus-requests']);
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || 'Failed to submit request');
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await queryClient.invalidateQueries(['bus-requests']);
        setRefreshing(false);
    }, [queryClient]);

    const handleSubmit = () => {
        if (!formData.studentId) { Alert.alert('Error', 'Please select a student'); return; }
        if (!formData.preferredStop && formData.requestType !== 'CANCEL') {
            Alert.alert('Error', 'Please enter preferred stop'); return;
        }
        submitMutation.mutate(formData);
    };

    const handleDetectLocation = async () => {
        try {
            setLocLoading(true);
            const approx = await getApproxLocation();
            setFormData(prev => ({ ...prev, preferredStop: approx }));
        } catch (e) {
            Alert.alert(
                'Location unavailable',
                e.message === 'Permission denied'
                    ? 'Please allow location permission in settings.'
                    : 'Could not detect location. Enter manually.',
            );
        } finally {
            setLocLoading(false);
        }
    };

    const closeModal = () => { Keyboard.dismiss(); setShowModal(false); };

    const getStatusConfig = (status) => {
        switch (status) {
            case 'PENDING': return { bg: '#FFF8E8', text: '#B45309', border: '#FDE68A', icon: Clock };
            case 'APPROVED': return { bg: '#ECFDF5', text: '#15803D', border: '#A7F3D0', icon: CheckCircle2 };
            case 'REJECTED': return { bg: '#FFF1F2', text: '#B91C1C', border: '#FECDD3', icon: AlertCircle };
            case 'IN_REVIEW': return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', icon: Clock };
            default: return { bg: '#F8FAFC', text: '#475569', border: '#E2E8F0', icon: Clock };
        }
    };

    useEffect(() => {
        if (childData && !formData.studentId) {
            setFormData(prev => ({ ...prev, studentId: childData.studentId || childData.id }));
        }
    }, [childData]);

    if (!userData) {
        return (
            <SafeAreaView style={styles.container}>
                <StatusBar style="dark" />
                <View style={styles.header}>
                    <HapticTouchable onPress={() => router.back()}>
                        <View style={styles.backButton}><ArrowLeft size={22} color="#111" /></View>
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>Bus Request</Text>
                    </View>
                    <View style={{ width: 40 }} />
                </View>
                <EmptyState icon={AlertCircle} title="Not Logged In" subtitle="Please login to continue" color="#EF4444" />
            </SafeAreaView>
        );
    }

    const pendingCount = requests.filter(r => r.status === 'PENDING').length;
    const approvedCount = requests.filter(r => r.status === 'APPROVED').length;
    const rejectedCount = requests.filter(r => r.status === 'REJECTED').length;

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="dark" />

            {/* ── Header ─────────────────────────────────────────────────── */}
            <Animated.View entering={FadeInDown.duration(400)} style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <View style={styles.backButton}><ArrowLeft size={22} color="#111" /></View>
                </HapticTouchable>
                <View style={styles.headerCenter}>
                    <Text style={styles.headerTitle}>Bus Request</Text>
                    <Text style={styles.headerSubtitle}>Transport management</Text>
                </View>
                <HapticTouchable onPress={() => setShowModal(true)}>
                    <LinearGradient colors={['#0469ff', '#0347c4']} style={styles.addButton}>
                        <Plus size={20} color="#fff" />
                    </LinearGradient>
                </HapticTouchable>
            </Animated.View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
            >
                {/* ── Hero banner ───────────────────────────────────────────── */}
                {childData && (
                    <Animated.View entering={FadeInDown.delay(80).duration(500)}>
                        <LinearGradient
                            colors={['#0469ff', '#0347c4']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.heroBanner}
                        >
                            <View style={styles.heroDeco1} />
                            <View style={styles.heroDeco2} />
                            <View style={styles.heroContent}>
                                <View style={styles.heroAvatar}>
                                    <User size={22} color="#0469ff" />
                                </View>
                                <View style={styles.heroText}>
                                    <Text style={styles.heroName}>{childData.name}</Text>
                                    <Text style={styles.heroClass}>Class {childData.class} · {childData.section}</Text>
                                </View>
                                <View style={styles.heroBusIcon}>
                                    <Bus size={22} color="rgba(255,255,255,0.7)" />
                                </View>
                            </View>
                            <View style={styles.heroStats}>
                                <View style={styles.heroStat}>
                                    <Text style={styles.heroStatVal}>{pendingCount}</Text>
                                    <Text style={styles.heroStatLabel}>Pending</Text>
                                </View>
                                <View style={styles.heroStatDivider} />
                                <View style={styles.heroStat}>
                                    <Text style={styles.heroStatVal}>{approvedCount}</Text>
                                    <Text style={styles.heroStatLabel}>Approved</Text>
                                </View>
                                <View style={styles.heroStatDivider} />
                                <View style={styles.heroStat}>
                                    <Text style={styles.heroStatVal}>{rejectedCount}</Text>
                                    <Text style={styles.heroStatLabel}>Rejected</Text>
                                </View>
                            </View>
                        </LinearGradient>
                    </Animated.View>
                )}

                {!childData && (
                    <Animated.View entering={FadeInDown.delay(80).duration(500)}>
                        <View style={styles.statsRow}>
                            {[
                                { count: pendingCount, label: 'Pending', bg: '#FFF8E8', val: '#B45309' },
                                { count: approvedCount, label: 'Approved', bg: '#ECFDF5', val: '#15803D' },
                                { count: rejectedCount, label: 'Rejected', bg: '#FFF1F2', val: '#B91C1C' },
                            ].map(s => (
                                <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
                                    <Text style={[styles.statValue, { color: s.val }]}>{s.count}</Text>
                                    <Text style={styles.statLabel}>{s.label}</Text>
                                </View>
                            ))}
                        </View>
                    </Animated.View>
                )}

                {/* ── CTA card ──────────────────────────────────────────────── */}
                <Animated.View entering={FadeInDown.delay(160).duration(500)}>
                    <HapticTouchable onPress={() => setShowModal(true)}>
                        <View style={styles.ctaCard}>
                            <View style={styles.ctaLeft}>
                                <View style={styles.ctaIconBg}>
                                    <Sparkles size={18} color="#0469ff" />
                                </View>
                                <View>
                                    <Text style={styles.ctaTitle}>New Transport Request</Text>
                                    <Text style={styles.ctaSubtitle}>Apply for stop, route or cancel</Text>
                                </View>
                            </View>
                            <View style={styles.ctaArrow}>
                                <ChevronRight size={18} color="#0469ff" />
                            </View>
                        </View>
                    </HapticTouchable>
                </Animated.View>

                {/* ── Requests list ─────────────────────────────────────────── */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Your Requests</Text>
                        <View style={styles.sectionBadge}>
                            <Text style={styles.sectionBadgeText}>{requests.length}</Text>
                        </View>
                    </View>

                    {isLoading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color="#0469ff" />
                            <Text style={styles.loadingText}>Loading requests…</Text>
                        </View>
                    ) : requests.length > 0 ? (
                        requests.map((request, index) => {
                            const cfg = getStatusConfig(request.status);
                            const StatusIcon = cfg.icon;
                            const typeInfo = REQUEST_TYPES.find(t => t.key === request.requestType) || { label: request.requestType, emoji: '🚌', color: '#64748B', bg: '#F1F5F9' };

                            return (
                                <Animated.View key={request.id} entering={FadeInRight.delay(240 + index * 70).duration(450)}>
                                    <View style={[styles.requestCard, { borderColor: cfg.border }]}>
                                        <View style={[styles.requestAccent, { backgroundColor: cfg.text }]} />
                                        <View style={styles.requestBody}>
                                            <View style={styles.requestTop}>
                                                <Text style={styles.requestStudent}>{request.student?.name}</Text>
                                                <View style={[styles.statusPill, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
                                                    <StatusIcon size={11} color={cfg.text} />
                                                    <Text style={[styles.statusPillText, { color: cfg.text }]}>{request.status}</Text>
                                                </View>
                                            </View>
                                            <View style={styles.requestMeta}>
                                                <View style={[styles.typePill, { backgroundColor: typeInfo.bg }]}>
                                                    <Text style={[styles.typePillText, { color: typeInfo.color }]}>
                                                        {typeInfo.emoji} {typeInfo.label}
                                                    </Text>
                                                </View>
                                                <Text style={styles.requestDate}>
                                                    {new Date(request.createdAt).toLocaleDateString('en-IN', {
                                                        day: '2-digit', month: 'short', year: 'numeric'
                                                    })}
                                                </Text>
                                            </View>
                                            {request.preferredStop && (
                                                <View style={styles.stopRow}>
                                                    <MapPin size={13} color="#94A3B8" />
                                                    <Text style={styles.stopText}>{request.preferredStop}</Text>
                                                </View>
                                            )}
                                            {request.adminNotes && (
                                                <View style={styles.adminNotes}>
                                                    <Text style={styles.adminNotesLabel}>📋 Admin Response</Text>
                                                    <Text style={styles.adminNotesText}>{request.adminNotes}</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                </Animated.View>
                            );
                        })
                    ) : (
                        <EmptyState
                            icon={Bus}
                            title="No Requests Yet"
                            subtitle="Tap the card above to submit your first bus request"
                            color="#0469ff"
                        />
                    )}
                </View>
            </ScrollView>

            {/* ── Bottom Sheet Modal ─────────────────────────────────────────
                FIX: wrap entire screen in a flex:1 View inside the Modal
                so the overlay covers all corners including system bar area.
            ────────────────────────────────────────────────────────────────── */}
            <Modal
                visible={showModal}
                transparent
                animationType="slide"
                statusBarTranslucent
                onRequestClose={closeModal}
            >
                {/* Full-screen container — covers status bar + nav bar */}
                <KeyboardAvoidingView
                    style={styles.modalRoot}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    {/* Dimmed overlay — absoluteFill so zero gaps */}
                    <Pressable style={StyleSheet.absoluteFill} onPress={closeModal}>
                        <View style={styles.modalOverlay} />
                    </Pressable>

                    {/* Sheet */}
                    <View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 20 }]}>
                        <View style={styles.sheetHandle} />

                        <View style={styles.sheetHeader}>
                            <View>
                                <Text style={styles.sheetTitle}>New Bus Request</Text>
                                <Text style={styles.sheetSubtitle}>Fill in your transport details</Text>
                            </View>
                            <HapticTouchable onPress={closeModal}>
                                <View style={styles.sheetClose}><X size={18} color="#666" /></View>
                            </HapticTouchable>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* Student */}
                            <Text style={styles.fieldLabel}>Select Student</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                                {students.map(student => {
                                    const sid = student.studentId || student.id;
                                    const active = formData.studentId === sid;
                                    return (
                                        <HapticTouchable key={sid} onPress={() => setFormData({ ...formData, studentId: sid })}>
                                            <View style={[styles.studentChip, active && styles.studentChipActive]}>
                                                {active && <CheckCircle2 size={13} color="#fff" />}
                                                <Text style={[styles.studentChipText, active && styles.studentChipTextActive]}>
                                                    {student.name}
                                                </Text>
                                            </View>
                                        </HapticTouchable>
                                    );
                                })}
                            </ScrollView>

                            {/* Request type tiles */}
                            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Request Type</Text>
                            <View style={styles.typeTileRow}>
                                {REQUEST_TYPES.map(type => {
                                    const active = formData.requestType === type.key;
                                    return (
                                        <HapticTouchable
                                            key={type.key}
                                            onPress={() => setFormData({ ...formData, requestType: type.key })}
                                            style={{ flex: 1 }}
                                        >
                                            <View style={[
                                                styles.typeTile,
                                                active && { backgroundColor: type.bg, borderColor: type.color },
                                            ]}>
                                                <Text style={styles.typeTileEmoji}>{type.emoji}</Text>
                                                <Text style={[styles.typeTileText, active && { color: type.color, fontWeight: '700' }]}>
                                                    {type.label}
                                                </Text>
                                                {active && (
                                                    <View style={[styles.typeTileCheck, { backgroundColor: type.color }]}>
                                                        <CheckCircle2 size={10} color="#fff" />
                                                    </View>
                                                )}
                                            </View>
                                        </HapticTouchable>
                                    );
                                })}
                            </View>

                            {/* Preferred stop + detect location */}
                            {formData.requestType !== 'CANCEL' && (
                                <>
                                    <View style={styles.stopLabelRow}>
                                        <Text style={[styles.fieldLabel, { marginTop: 18, marginBottom: 0 }]}>Preferred Stop</Text>
                                        {/* Detect approx location button */}
                                        <HapticTouchable onPress={handleDetectLocation} disabled={locLoading}>
                                            <View style={styles.detectBtn}>
                                                {locLoading ? (
                                                    <ActivityIndicator size="small" color="#0469ff" />
                                                ) : (
                                                    <>
                                                        <LocateFixed size={13} color="#0469ff" />
                                                        <Text style={styles.detectBtnText}>Detect area</Text>
                                                    </>
                                                )}
                                            </View>
                                        </HapticTouchable>
                                    </View>

                                    <View style={styles.inputRow}>
                                        <View style={styles.inputIconBox}>
                                            <Navigation size={16} color="#0469ff" />
                                        </View>
                                        <TextInput
                                            style={styles.fieldInput}
                                            placeholder="Enter landmark or address"
                                            placeholderTextColor="#C0CADC"
                                            value={formData.preferredStop}
                                            onChangeText={text => setFormData({ ...formData, preferredStop: text })}
                                        />
                                        {formData.preferredStop.length > 0 && (
                                            <HapticTouchable onPress={() => setFormData({ ...formData, preferredStop: '' })}>
                                                <View style={styles.inputClear}>
                                                    <X size={14} color="#94A3B8" />
                                                </View>
                                            </HapticTouchable>
                                        )}
                                    </View>

                                    {/* Hint */}
                                    <View style={styles.hintRow}>
                                        <MapPin size={11} color="#94A3B8" />
                                        <Text style={styles.hintText}>
                                            "Detect area" fills your general neighbourhood — not your exact address
                                        </Text>
                                    </View>
                                </>
                            )}

                            {/* Reason */}
                            <Text style={[styles.fieldLabel, { marginTop: 18 }]}>
                                Reason <Text style={{ color: '#C0CADC', fontWeight: '400' }}>(Optional)</Text>
                            </Text>
                            <TextInput
                                style={styles.reasonInput}
                                placeholder="Any additional details for the admin..."
                                placeholderTextColor="#C0CADC"
                                multiline
                                numberOfLines={3}
                                value={formData.reason}
                                onChangeText={text => setFormData({ ...formData, reason: text })}
                            />

                            {/* Submit */}
                            <HapticTouchable onPress={handleSubmit} disabled={submitMutation.isPending} style={{ marginTop: 24 }}>
                                <LinearGradient
                                    colors={['#0469ff', '#0347c4']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.submitBtn}
                                >
                                    {submitMutation.isPending ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Send size={18} color="#fff" />
                                            <Text style={styles.submitBtnText}>Submit Request</Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </HapticTouchable>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F7F9FC' },

    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1, borderBottomColor: '#F0F3F8',
    },
    backButton: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center',
    },
    addButton: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '800', color: '#0D1117', letterSpacing: -0.3 },
    headerSubtitle: { fontSize: 12, color: '#8A97B0', marginTop: 1 },

    content: { flex: 1, paddingHorizontal: 16 },

    heroBanner: {
        borderRadius: 22, padding: 20,
        marginTop: 16, marginBottom: 14,
        overflow: 'hidden', position: 'relative',
    },
    heroDeco1: {
        position: 'absolute', width: 130, height: 130, borderRadius: 65,
        backgroundColor: 'rgba(255,255,255,0.08)', top: -35, right: -25,
    },
    heroDeco2: {
        position: 'absolute', width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.06)', bottom: -20, left: 50,
    },
    heroContent: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
    heroAvatar: {
        width: 46, height: 46, borderRadius: 23,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    },
    heroText: { flex: 1 },
    heroName: { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
    heroClass: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
    heroBusIcon: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    },
    heroStats: {
        flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 14, padding: 14,
    },
    heroStat: { flex: 1, alignItems: 'center' },
    heroStatVal: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
    heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: '500' },
    heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },

    statsRow: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 14 },
    statCard: { flex: 1, borderRadius: 14, padding: 14, alignItems: 'center' },
    statValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
    statLabel: { fontSize: 11, color: '#64748B', marginTop: 3, fontWeight: '500' },

    ctaCard: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff', borderRadius: 18,
        padding: 16, marginBottom: 20,
        borderWidth: 1, borderColor: '#E8EEFF',
        shadowColor: '#0469ff',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
    },
    ctaLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
    ctaIconBg: {
        width: 44, height: 44, borderRadius: 14,
        backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center',
    },
    ctaTitle: { fontSize: 14, fontWeight: '700', color: '#0D1117' },
    ctaSubtitle: { fontSize: 12, color: '#8A97B0', marginTop: 2 },
    ctaArrow: {
        width: 32, height: 32, borderRadius: 10,
        backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center',
    },

    section: { marginBottom: 16 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0D1117', letterSpacing: -0.2 },
    sectionBadge: { backgroundColor: '#EEF4FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    sectionBadgeText: { fontSize: 12, fontWeight: '700', color: '#0469ff' },

    requestCard: {
        flexDirection: 'row', backgroundColor: '#fff',
        borderRadius: 16, marginBottom: 10, borderWidth: 1,
        overflow: 'hidden',
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    },
    requestAccent: { width: 4 },
    requestBody: { flex: 1, padding: 14 },
    requestTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    requestStudent: { fontSize: 14, fontWeight: '700', color: '#0D1117', flex: 1 },
    statusPill: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 9, paddingVertical: 4,
        borderRadius: 20, borderWidth: 1,
    },
    statusPillText: { fontSize: 10, fontWeight: '700' },
    requestMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    typePill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
    typePillText: { fontSize: 11, fontWeight: '600' },
    requestDate: { fontSize: 11, color: '#94A3B8' },
    stopRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    stopText: { fontSize: 12, color: '#64748B' },
    adminNotes: { marginTop: 10, padding: 10, backgroundColor: '#F0FDF4', borderRadius: 10 },
    adminNotesLabel: { fontSize: 11, fontWeight: '700', color: '#15803D', marginBottom: 3 },
    adminNotesText: { fontSize: 12, color: '#166534', lineHeight: 17 },

    loadingContainer: { padding: 40, alignItems: 'center', gap: 12 },
    loadingText: { fontSize: 14, color: '#888' },

    // ── Modal fix: absoluteFillObject = zero corner gaps on any Android ────────
    modalRoot: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'flex-end',
    },
    modalOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.52)',
    },

    bottomSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 12,
        maxHeight: '88%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.14,
        shadowRadius: 24,
        elevation: 24,
    },
    sheetHandle: {
        width: 40, height: 4, borderRadius: 2,
        backgroundColor: '#E2E8F0',
        alignSelf: 'center', marginBottom: 16,
    },
    sheetHeader: {
        flexDirection: 'row', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: 20,
    },
    sheetTitle: { fontSize: 20, fontWeight: '800', color: '#0D1117', letterSpacing: -0.4 },
    sheetSubtitle: { fontSize: 13, color: '#8A97B0', marginTop: 3 },
    sheetClose: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: '#F3F6FA', alignItems: 'center', justifyContent: 'center',
    },

    fieldLabel: { fontSize: 13, fontWeight: '700', color: '#4A5568', marginBottom: 10 },

    studentChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        paddingHorizontal: 16, paddingVertical: 10,
        backgroundColor: '#F3F6FA', borderRadius: 24,
        borderWidth: 1.5, borderColor: 'transparent',
    },
    studentChipActive: { backgroundColor: '#0469ff', borderColor: '#0347c4' },
    studentChipText: { fontSize: 13, fontWeight: '600', color: '#4A5568' },
    studentChipTextActive: { color: '#fff' },

    typeTileRow: { flexDirection: 'row', gap: 10 },
    typeTile: {
        flex: 1, alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 8,
        backgroundColor: '#F7F9FC',
        borderRadius: 16, borderWidth: 1.5, borderColor: '#EEF2F8',
        position: 'relative',
    },
    typeTileEmoji: { fontSize: 22, marginBottom: 6 },
    typeTileText: { fontSize: 11, fontWeight: '600', color: '#64748B', textAlign: 'center' },
    typeTileCheck: {
        position: 'absolute', top: 8, right: 8,
        width: 18, height: 18, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
    },

    // Stop label row with detect button inline
    stopLabelRow: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 18, marginBottom: 10,
    },
    detectBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 12, paddingVertical: 6,
        backgroundColor: '#EEF4FF',
        borderRadius: 20,
        borderWidth: 1, borderColor: '#BFDBFE',
        minWidth: 44, minHeight: 28, justifyContent: 'center',
    },
    detectBtnText: { fontSize: 12, fontWeight: '700', color: '#0469ff' },

    inputRow: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F7F9FC',
        borderRadius: 14, borderWidth: 1.5, borderColor: '#EEF2F8',
        overflow: 'hidden',
    },
    inputIconBox: {
        width: 48, height: 52,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#EEF4FF',
    },
    fieldInput: {
        flex: 1, paddingHorizontal: 14, paddingVertical: 14,
        fontSize: 14, color: '#0D1117',
    },
    inputClear: {
        width: 36, height: 52, alignItems: 'center', justifyContent: 'center',
    },

    hintRow: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 5,
        marginTop: 6, paddingHorizontal: 2,
    },
    hintText: { fontSize: 11, color: '#94A3B8', flex: 1, lineHeight: 16 },

    reasonInput: {
        backgroundColor: '#F7F9FC',
        borderRadius: 14, borderWidth: 1.5, borderColor: '#EEF2F8',
        paddingHorizontal: 16, paddingVertical: 14,
        fontSize: 14, color: '#0D1117',
        height: 90, textAlignVertical: 'top',
    },

    submitBtn: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 10, paddingVertical: 16, borderRadius: 16,
    },
    submitBtnText: { fontSize: 15, fontWeight: '800', color: '#fff', letterSpacing: -0.2 },
});