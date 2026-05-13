import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
    View, Text, StyleSheet, SectionList, ActivityIndicator, TextInput,
    Linking, RefreshControl, Platform, Dimensions, PanResponder, ScrollView,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { ArrowLeft, Mail, Phone, Search, User, Users, ArrowUpDown } from 'lucide-react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import api from '../../lib/api';
import HapticTouchable from '../components/HapticTouch';

const { height: SH } = Dimensions.get('window');
const getInitial = (name = '') => name.trim().charAt(0).toUpperCase() || '?';

const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'hasParent', label: 'With Parents' },
    { key: 'noParent', label: 'No Parents' },
    { key: 'father', label: 'Father' },
    { key: 'mother', label: 'Mother' },
    { key: 'guardian', label: 'Guardian' },
];

const buildParentList = (student) => {
    if (student.parents?.length > 0) {
        return student.parents
            .filter((p) => p.name || p.phone || p.email)
            .map((p, i) => ({
                key: `${p.relation || 'parent'}-${i}`,
                relation: p.relation === 'FATHER' ? 'Father' : p.relation === 'MOTHER' ? 'Mother' : p.relation || 'Guardian',
                name: p.name, phone: p.phone, email: p.email,
            }));
    }
    return [
        { key: 'father', relation: 'Father', name: student.fatherName, phone: student.fatherPhone, email: null },
        { key: 'mother', relation: 'Mother', name: student.motherName, phone: student.motherPhone, email: null },
        { key: 'guardian', relation: student.guardianRelation || 'Guardian', name: student.guardianName, phone: student.guardianPhone, email: student.guardianEmail },
    ].filter((p) => p.name || p.phone || p.email);
};

// ─── Debounce hook ─────────────────────────────────────────────────────────────
function useDebounce(value, delay = 400) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
}

// ─── Alphabet sidebar ──────────────────────────────────────────────────────────
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
const LH = SH < 700 ? 16 : 18;

const AlphabetSidebar = ({ available, active, onPress }) => {
    const lastRef = useRef(null);
    const hit = (letter) => {
        if (!letter || letter === lastRef.current || !available.has(letter)) return;
        lastRef.current = letter;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress(letter);
    };
    const pan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => hit(ALPHA[Math.floor(e.nativeEvent.locationY / LH)]),
        onPanResponderMove: (e) => hit(ALPHA[Math.floor(e.nativeEvent.locationY / LH)]),
        onPanResponderRelease: () => { lastRef.current = null; },
    })).current;

    return (
        <View style={s.sidebarWrap} pointerEvents="box-none">
            <View style={s.sidebar} {...pan.panHandlers}>
                {ALPHA.map((l) => {
                    const on = available.has(l), act = l === active;
                    return (
                        <View key={l} style={{ height: LH, justifyContent: 'center', alignItems: 'center' }}>
                            <View style={[s.sbLetterW, act && s.sbLetterWAct]}>
                                <Text style={[s.sbLetter, !on && s.sbLetterOff, act && s.sbLetterAct]}>{l}</Text>
                            </View>
                        </View>
                    );
                })}
            </View>
        </View>
    );
};

// ═════════════════════════════════════════════════════════════════════════════
export default function TeacherParentDetailsScreen() {
    const qc = useQueryClient();
    const params = useLocalSearchParams();
    const listRef = useRef(null);
    const [search, setSearch] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [sortBy, setSortBy] = useState('az'); // 'az' | 'roll'
    const [activeLetter, setActiveLetter] = useState(null);
    const activeLetterRef = useRef(null);
    const sectionLayoutsRef = useRef({});

    const debouncedSearch = useDebounce(search, 400);

    const teacherData = useMemo(() => {
        if (!params.teacherData) return null;
        try { return JSON.parse(params.teacherData); } catch { return null; }
    }, [params.teacherData]);

    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId || teacherData?.schoolId || teacherData?.school?.id;
    const teacherId = userData?.id || teacherData?.userId || teacherData?.id;

    // ── Server-side fetch with debounced search ─────────────────────────────
    const { data: students = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: ['teacher-parent-details', schoolId, teacherId, debouncedSearch],
        queryFn: async () => {
            if (!schoolId || !teacherId) return [];
            const q = debouncedSearch.trim();
            const url = `/schools/${schoolId}/teachers/${teacherId}/students/parent-details${q ? `?search=${encodeURIComponent(q)}` : ''}`;
            const res = await api.get(url);
            return res.data?.students || [];
        },
        enabled: !!schoolId && !!teacherId,
        staleTime: 1000 * 60 * 5,
        keepPreviousData: true,
    });

    // ── Client-side filter + sort + section ─────────────────────────────────
    const { sections, availableLetters, totalCount } = useMemo(() => {
        let list = [...students];

        // Filter
        if (filter === 'hasParent') list = list.filter((s) => buildParentList(s).length > 0);
        else if (filter === 'noParent') list = list.filter((s) => buildParentList(s).length === 0);
        else if (filter === 'father') list = list.filter((s) => buildParentList(s).some((p) => p.relation === 'Father'));
        else if (filter === 'mother') list = list.filter((s) => buildParentList(s).some((p) => p.relation === 'Mother'));
        else if (filter === 'guardian') list = list.filter((s) => buildParentList(s).some((p) => p.relation !== 'Father' && p.relation !== 'Mother'));

        // Sort + group
        if (sortBy === 'roll') {
            list.sort((a, b) => {
                const ca = `${a.className}-${a.sectionName}`;
                const cb = `${b.className}-${b.sectionName}`;
                if (ca !== cb) return ca.localeCompare(cb);
                return (parseInt(a.rollNumber) || 999) - (parseInt(b.rollNumber) || 999);
            });
            const grouped = {};
            list.forEach((s) => {
                const key = s.className ? `${s.className}${s.sectionName ? ` - ${s.sectionName}` : ''}` : 'Other';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(s);
            });
            const secs = Object.keys(grouped).sort().map((k) => ({ title: k, data: grouped[k] }));
            return { sections: secs, availableLetters: new Set(secs.map((s) => s.title)), totalCount: list.length };
        }

        // Default: A-Z
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const grouped = {};
        list.forEach((s) => {
            const ch = (s.name || '?').charAt(0).toUpperCase();
            const letter = /[A-Z]/.test(ch) ? ch : '#';
            if (!grouped[letter]) grouped[letter] = [];
            grouped[letter].push(s);
        });
        const secs = Object.keys(grouped)
            .sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
            .map((l) => ({ title: l, data: grouped[l] }));
        return { sections: secs, availableLetters: new Set(secs.map((s) => s.title)), totalCount: list.length };
    }, [students, filter, sortBy]);

    // Reset section layouts when sections change
    useEffect(() => { sectionLayoutsRef.current = {}; }, [sections]);

    const scrollToLetter = useCallback((letter) => {
        const idx = sections.findIndex((s) => s.title === letter);
        if (idx < 0 || !listRef.current) return;
        activeLetterRef.current = letter;
        setActiveLetter(letter);
        try {
            listRef.current.scrollToLocation({
                sectionIndex: idx,
                itemIndex: 0,
                viewPosition: 0,
                animated: true,
            });
        } catch { }
    }, [sections]);

    const handleScroll = useCallback((e) => {
        const y = e.nativeEvent.contentOffset.y;
        const entries = Object.entries(sectionLayoutsRef.current).sort(([, a], [, b]) => a - b);
        if (!entries.length) return;
        let cur = entries[0]?.[0] || null;
        for (const [title, offset] of entries) {
            if (y >= offset - 40) cur = title;
            else break;
        }
        if (cur && cur !== activeLetterRef.current) {
            activeLetterRef.current = cur;
            setActiveLetter(cur);
            Haptics.selectionAsync();
        }
    }, []);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await qc.invalidateQueries({ queryKey: ['teacher-parent-details', schoolId, teacherId] });
        await refetch();
        setRefreshing(false);
    }, [qc, refetch, schoolId, teacherId]);

    const getVisibleParents = (student) => {
        const p = buildParentList(student);
        if (filter === 'father') return p.filter((x) => x.relation === 'Father');
        if (filter === 'mother') return p.filter((x) => x.relation === 'Mother');
        if (filter === 'guardian') return p.filter((x) => x.relation !== 'Father' && x.relation !== 'Mother');
        return p;
    };

    const contactChip = (type, value) => {
        if (!value) return null;
        const Icon = type === 'phone' ? Phone : Mail;
        return (
            <HapticTouchable onPress={() => Linking.openURL(type === 'phone' ? `tel:${value}` : `mailto:${value}`)}>
                <View style={s.contactChip}><Icon size={13} color="#0469ff" /><Text style={s.contactText} numberOfLines={1}>{value}</Text></View>
            </HapticTouchable>
        );
    };

    const renderItem = ({ item, index }) => {
        const parents = getVisibleParents(item);
        const hasPhoto = item.profilePicture && item.profilePicture !== 'default.png';
        return (
            <View style={s.card}>
                <View style={s.cardHead}>
                    <View style={s.avatarWrap}>
                        {hasPhoto ? <Image source={{ uri: item.profilePicture }} style={s.avatar} contentFit="cover" transition={200} />
                            : <View style={s.avatarFB}><Text style={s.avatarTxt}>{getInitial(item.name)}</Text></View>}
                    </View>
                    <View style={s.stuInfo}>
                        <Text style={s.stuName}>{item.name || 'Student'}</Text>
                        <Text style={s.stuMeta} numberOfLines={1}>
                            {item.className || 'Class'}{item.sectionName ? ` - ${item.sectionName}` : ''}
                            {item.rollNumber ? `  •  Roll ${item.rollNumber}` : ''}
                        </Text>
                        {item.admissionNo ? <Text style={s.admBadge}>{item.admissionNo}</Text> : null}
                    </View>
                </View>
                {parents.length > 0 ? parents.map((p) => (
                    <View key={p.key} style={s.parentRow}>
                        <View style={s.parentIcon}><User size={14} color="#0469ff" /></View>
                        <View style={s.parentInfo}>
                            <Text style={s.parentRel}>{p.relation}</Text>
                            <Text style={s.parentName}>{p.name || 'Name not added'}</Text>
                            <View style={s.contactRow}>{contactChip('phone', p.phone)}{contactChip('email', p.email)}</View>
                        </View>
                    </View>
                )) : <View style={s.noParent}><Text style={s.noParentTxt}>No parent details found.</Text></View>}
            </View>
        );
    };

    const renderHeader = ({ section: { title } }) => (
        <View style={s.secHead} onLayout={(e) => { sectionLayoutsRef.current[title] = e.nativeEvent.layout.y; }}>
            <Text style={s.secHeadTxt}>{title}</Text>
        </View>
    );

    if (!schoolId || !teacherId || isLoading) {
        return <View style={s.loader}><ActivityIndicator size="large" color="#0469ff" /><Text style={s.loadTxt}>Loading parent details...</Text></View>;
    }

    return (
        <View style={s.container}>
            <StatusBar style="dark" />
            <View style={s.header}>
                <HapticTouchable onPress={() => router.back()}><View style={s.backBtn}><ArrowLeft size={22} color="#111" /></View></HapticTouchable>
                <View style={s.hdrCenter}>
                    <Text style={s.hdrTitle}>Parent Details</Text>
                    <Text style={s.hdrSub}>{totalCount} student{totalCount === 1 ? '' : 's'}{filter !== 'all' ? ' (filtered)' : ''}</Text>
                </View>
                {/* Sort toggle */}
                <HapticTouchable onPress={() => setSortBy((p) => p === 'az' ? 'roll' : 'az')}>
                    <View style={s.sortBtn}>
                        <ArrowUpDown size={16} color="#0469ff" />
                        <Text style={s.sortTxt}>{sortBy === 'az' ? 'A-Z' : 'Roll'}</Text>
                    </View>
                </HapticTouchable>
            </View>

            {/* Search with loading indicator */}
            <View style={s.searchWrap}>
                <Search size={18} color="#64748B" />
                <TextInput value={search} onChangeText={setSearch} placeholder="Search name, phone, admission, email..." placeholderTextColor="#94A3B8" style={s.searchInput} />
                {isFetching && search.length > 0 && <ActivityIndicator size="small" color="#0469ff" />}
            </View>

            {/* Filters */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flexShrink: 0 }}
                contentContainerStyle={s.filterRow}
            >
                {FILTERS.map((f) => (
                    <HapticTouchable key={f.key} onPress={() => setFilter(f.key)}>
                        <View style={[s.chip, filter === f.key && s.chipOn]}>
                            <Text style={[s.chipTxt, filter === f.key && s.chipTxtOn]}>{f.label}</Text>
                        </View>
                    </HapticTouchable>
                ))}
            </ScrollView>

            <View style={s.listWrap}>
                <SectionList
                    ref={listRef}
                    sections={sections}
                    keyExtractor={(item) => String(item.id || item.studentId)}
                    renderItem={renderItem}
                    keyboardShouldPersistTaps="handled"
                    renderSectionHeader={renderHeader}
                    stickySectionHeadersEnabled
                    initialNumToRender={10}
                    windowSize={5}

                    contentContainerStyle={s.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />}
                    onScroll={handleScroll}
                    scrollEventThrottle={16}
                    ListEmptyComponent={
                        <View style={s.empty}>
                            <Users size={52} color="#CBD5E1" />
                            <Text style={s.emptyTitle}>No Students Found</Text>
                            <Text style={s.emptyTxt}>{search ? 'Try a different search.' : filter !== 'all' ? 'No students match this filter.' : 'No students assigned yet.'}</Text>
                        </View>
                    }
                    onScrollToIndexFailed={(info) => { setTimeout(() => { try { listRef.current?.scrollToLocation({ sectionIndex: info.index, itemIndex: 0, viewOffset: 0, animated: true }); } catch { } }, 200); }}
                />
                {/* {sections.length > 0 && sortBy === 'az' && (
                    <AlphabetSidebar available={availableLetters} active={activeLetter} onPress={scrollToLetter} />
                )} */}
            </View>
        </View>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', gap: 12 },
    loadTxt: { fontSize: 15, color: '#64748B', fontWeight: '600' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 50 : 40, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#fff' },
    backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
    hdrCenter: { flex: 1, alignItems: 'center' },
    hdrTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
    hdrSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
    sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF6FF', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12 },
    sortTxt: { fontSize: 11, fontWeight: '800', color: '#0469ff' },
    searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 8, paddingHorizontal: 14, height: 46, borderRadius: 13, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' },
    searchInput: { flex: 1, fontSize: 14, color: '#111827' },
    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 },
    listContent: { paddingHorizontal: 16, paddingBottom: 32, paddingRight: 30 },
    chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
    chipOn: { backgroundColor: '#0469ff', borderColor: '#0469ff' },
    chipTxt: { fontSize: 12, fontWeight: '700', color: '#64748B' },
    chipTxtOn: { color: '#fff' },
    listWrap: {
        flex: 1,
        position: 'relative',
        marginTop: 10,
    },
    secHead: { backgroundColor: '#F8FAFC', paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
    secHeadTxt: { fontSize: 14, fontWeight: '800', color: '#0469ff', letterSpacing: 0.5 },

    card: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, padding: 12, marginBottom: 10, backgroundColor: '#fff' },
    cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    avatarWrap: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#E3F2FD', borderWidth: 2, borderColor: '#DBEAFE' },
    avatar: { width: '100%', height: '100%' },
    avatarFB: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3F2FD' },
    avatarTxt: { fontSize: 16, fontWeight: '800', color: '#0469ff' },
    stuInfo: { flex: 1, marginLeft: 10 },
    stuName: { fontSize: 15, fontWeight: '800', color: '#111827' },
    stuMeta: { fontSize: 11, color: '#64748B', marginTop: 2, fontWeight: '500' },
    admBadge: { fontSize: 10, fontWeight: '700', color: '#0469ff', backgroundColor: '#EEF6FF', alignSelf: 'flex-start', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginTop: 3, overflow: 'hidden' },
    parentRow: { flexDirection: 'row', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
    parentIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF6FF', alignItems: 'center', justifyContent: 'center' },
    parentInfo: { flex: 1, paddingBottom: 6 },
    parentRel: { fontSize: 10, fontWeight: '700', color: '#0469ff', textTransform: 'uppercase', letterSpacing: 0.3 },
    parentName: { fontSize: 14, fontWeight: '700', color: '#111827', marginTop: 1 },
    contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    contactChip: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 200, paddingHorizontal: 8, paddingVertical: 5, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#F1F5F9' },
    contactText: { fontSize: 11, color: '#334155', fontWeight: '600' },
    noParent: { padding: 10, borderRadius: 10, backgroundColor: '#FEF9F0', borderWidth: 1, borderColor: '#FEF3C7' },
    noParentTxt: { fontSize: 12, color: '#92400E', fontWeight: '500' },
    sidebarWrap: { position: 'absolute', right: 0, top: 0, bottom: 0, justifyContent: 'center', zIndex: 10, width: 28 },
    sidebar: { alignItems: 'center', paddingVertical: 2, backgroundColor: 'rgba(248,250,252,0.9)', borderRadius: 14, marginVertical: 8 },
    sbLetterW: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    sbLetterWAct: { backgroundColor: '#0469ff', transform: [{ scale: 1.3 }] },
    sbLetter: { fontSize: 9, fontWeight: '700', color: '#0469ff', textAlign: 'center' },
    sbLetterOff: { color: '#D1D5DB' },
    sbLetterAct: { color: '#fff', fontWeight: '900' },
    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 14 },
    emptyTxt: { fontSize: 13, color: '#64748B', marginTop: 6, textAlign: 'center', lineHeight: 20 },
});
