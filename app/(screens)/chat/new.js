// ============================================
// NEW CONVERSATION - Create a new chat
// ============================================

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
    View, Text, FlatList, ScrollView, TextInput,
    StyleSheet, Image, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Search, Users, User, GraduationCap, Check, Plus } from 'lucide-react-native';
import HapticTouchable from '../../components/HapticTouch';
import { useEligibleUsers, useCreateConversation } from '../../../hooks/useChat';
import { useShimmer, Bone } from '../../components/ScreenSkeleton';

function CategoryChip({ label, active, onPress, icon }) {
    return (
        <HapticTouchable style={[styles.chip, active && styles.chipActive]} onPress={onPress} haptic="light">
            {icon}
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
        </HapticTouchable>
    );
}

function UserListSkeleton() {
    const anim = useShimmer();
    return (
        <View style={{ padding: 16, gap: 12 }}>
            {Array.from({ length: 8 }).map((_, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Bone animValue={anim} width={46} height={46} borderRadius={23} />
                    <View style={{ flex: 1, gap: 6 }}>
                        <Bone animValue={anim} width="55%" height={13} borderRadius={4} />
                        <Bone animValue={anim} width="35%" height={11} borderRadius={4} />
                    </View>
                </View>
            ))}
        </View>
    );
}

function ListFooter({ isFetchingNextPage }) {
    if (!isFetchingNextPage) return null;
    return <View style={styles.footerLoader}><ActivityIndicator size="small" color="#0469ff" /></View>;
}

function UserRow({ user, selected, onPress, isGroupMode }) {
    const isAlreadyAdded = !isGroupMode && !!user.existingConversationId;
    const displayName = typeof user.name === 'string' ? user.name : user.name?.name || '';

    const subtitle = (() => {
        const r = typeof user.role === 'string' ? user.role : user.role?.name || '';
        const roleLabel = r === 'TEACHING_STAFF' ? 'Teacher' : r === 'PARENT' ? 'Parent' : r;
        let sub = '';
        if (r === 'TEACHING_STAFF' && user.teacher) {
            const { Class, sectionsAssigned, SectionSubjectTeacher } = user.teacher;
            if (Class?.length > 0) sub = `Class Teacher · ${Class[0].className}`;
            else if (sectionsAssigned?.length > 0) sub = `${sectionsAssigned[0].class?.className} - ${sectionsAssigned[0].name}`;
            else if (SectionSubjectTeacher?.length > 0) {
                const s = SectionSubjectTeacher[0].section;
                if (s) sub = `${s.class?.className} - ${s.name}`;
            }
        } else if (r === 'PARENT' && user.parent?.students?.length > 0) {
            const student = user.parent.students[0].student;
            if (student) sub = `${student.user?.name || ''} (${student.class?.className || ''}-${student.section?.name || ''})`;
        }
        return sub ? `${roleLabel} · ${sub}` : roleLabel;
    })();

    return (
        <HapticTouchable
            style={[styles.userRow, selected && styles.userRowSelected, isAlreadyAdded && styles.userRowDisabled]}
            onPress={() => onPress(user)}
            activeOpacity={isAlreadyAdded ? 0.6 : 0.7}
            haptic={isAlreadyAdded ? null : 'light'}
        >
            {user.profilePicture
                ? <Image source={{ uri: user.profilePicture }} style={styles.avatar} />
                : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
                    </View>
                )
            }
            <View style={styles.userInfo}>
                <Text style={[styles.userName, isAlreadyAdded && styles.userNameMuted]}>{displayName}</Text>
                <Text style={styles.userSub} numberOfLines={1}>{subtitle}</Text>
            </View>
            {isAlreadyAdded && (
                <View style={styles.openBadge}>
                    <Text style={styles.openBadgeText}>OPEN</Text>
                </View>
            )}
            {selected && !isAlreadyAdded && (
                <View style={styles.checkCircle}>
                    <Check size={13} color="#fff" strokeWidth={3} />
                </View>
            )}
        </HapticTouchable>
    );
}

export default function NewConversationScreen() {
    const insets = useSafeAreaInsets();
    const { schoolId: paramSchoolId } = useLocalSearchParams();

    const [schoolId, setSchoolId] = useState(paramSchoolId || null);
    const [currentUser, setCurrentUser] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [category, setCategory] = useState('all');
    const [isCreating, setIsCreating] = useState(false);
    const [isGroupMode, setIsGroupMode] = useState(false);
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [groupName, setGroupName] = useState('');

    useEffect(() => {
        SecureStore.getItemAsync('user').then((raw) => {
            if (raw) {
                const u = JSON.parse(raw);
                setCurrentUser(u);
                if (!schoolId) setSchoolId(u.schoolId);
            }
        }).catch(console.error);
    }, []);

    const { data, isLoading, isFetching, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useEligibleUsers(schoolId);
    const createMutation = useCreateConversation();

    const allUsers = useMemo(() => {
        if (!data) return [];
        if (data.pages) return data.pages.flatMap((p) => p.users ?? p.eligibleUsers ?? []);
        return data.users ?? data.eligibleUsers ?? [];
    }, [data]);

    const eligibleUsers = useMemo(() => {
        const str = (v) => (typeof v === 'string' ? v : v?.name || '');
        let list = allUsers;
        if (category === 'teachers') list = list.filter((u) => str(u.role) === 'TEACHING_STAFF');
        else if (category === 'parents') list = list.filter((u) => str(u.role) === 'PARENT');
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter((u) => str(u.name).toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
        }
        return list;
    }, [allUsers, category, searchQuery]);

    const handleRefresh = useCallback(() => refetch(), [refetch]);
    const handleEndReached = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    const handleUserPress = useCallback(async (user) => {
        if (isCreating) return;

        if (isGroupMode) {
            setSelectedUsers((prev) =>
                prev.find((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user]
            );
            return;
        }

        if (user.existingConversationId) {
            router.replace({
                pathname: '/(screens)/chat/[conversationId]',
                params: {
                    conversationId: user.existingConversationId,
                    title: typeof user.name === 'string' ? user.name : user.name?.name || 'Chat',
                    profilePicture: user.profilePicture,
                    schoolId,
                },
            });
            return;
        }

        setIsCreating(true);
        try {
            const str = (v) => (typeof v === 'string' ? v : v?.name || '');
            const myRole = str(currentUser?.role);
            const theirRole = str(user.role);
            let type = 'DIRECT';
            if ((myRole === 'PARENT' && theirRole === 'TEACHING_STAFF') || (myRole === 'TEACHING_STAFF' && theirRole === 'PARENT'))
                type = 'PARENT_TEACHER';
            else if (myRole === 'TEACHING_STAFF' && theirRole === 'TEACHING_STAFF')
                type = 'TEACHER_TEACHER';

            const result = await createMutation.mutateAsync({ schoolId, body: { type, participantUserIds: [user.id] } });
            const conv = result?.conversation;
            if (conv?.id) {
                // Bust cache so next time this user shows as OPEN
                refetch();
                router.replace({
                    pathname: '/(screens)/chat/[conversationId]',
                    params: {
                        conversationId: conv.id,
                        title: typeof user.name === 'string' ? user.name : user.name?.name || 'Chat',
                        profilePicture: user.profilePicture,
                        schoolId,
                    },
                });
            }
        } catch (err) {
            Alert.alert('Error', err?.response?.data?.error || 'Failed to create conversation');
        } finally {
            setIsCreating(false);
        }
    }, [isCreating, isGroupMode, currentUser, schoolId, createMutation, refetch]);

    const handleCreateGroup = async () => {
        if (!groupName.trim()) return Alert.alert('Error', 'Please enter a group name');
        if (selectedUsers.length === 0) return Alert.alert('Error', 'Select at least one participant');
        setIsCreating(true);
        try {
            const result = await createMutation.mutateAsync({
                schoolId,
                body: { type: 'COMMUNITY', title: groupName.trim(), participantUserIds: selectedUsers.map((u) => u.id) },
            });
            const conv = result?.conversation;
            if (conv?.id) {
                router.replace({ pathname: '/(screens)/chat/[conversationId]', params: { conversationId: conv.id, title: groupName.trim(), schoolId } });
            }
        } catch (err) {
            Alert.alert('Error', err?.response?.data?.error || 'Failed to create group');
        } finally {
            setIsCreating(false);
        }
    };

    const renderItem = useCallback(({ item }) => (
        <UserRow user={item} selected={selectedUsers.some((u) => u.id === item.id)} onPress={handleUserPress} isGroupMode={isGroupMode} />
    ), [handleUserPress, selectedUsers, isGroupMode]);

    const keyExtractor = useCallback((item) => item.id, []);

    const currentRole = typeof currentUser?.role === 'string' ? currentUser.role : currentUser?.role?.name;
    const showTeachers = ['TEACHING_STAFF', 'ADMIN', 'PRINCIPAL', 'DIRECTOR'].includes(currentRole);
    const showParents = currentRole === 'TEACHING_STAFF';

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>

            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={22} color="#111" strokeWidth={2} />
                </HapticTouchable>
                <Text style={styles.headerTitle}>New Message</Text>
                <View style={{ width: 34 }} />
            </View>

            {/* Search */}
            <View style={styles.searchBox}>
                <Search size={16} color="#9ca3af" strokeWidth={2} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search people..."
                    placeholderTextColor="#9ca3af"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
            </View>

            {/* Fixed-height chip row — prevents ScrollView from expanding vertically */}
            <View style={styles.chipRowWrapper}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRowContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <CategoryChip
                        label="All"
                        active={category === 'all' && !isGroupMode}
                        onPress={() => { setCategory('all'); setIsGroupMode(false); }}
                        icon={<Users size={13} color={category === 'all' && !isGroupMode ? '#fff' : '#6b7280'} strokeWidth={2} />}
                    />
                    <CategoryChip
                        label="New Group"
                        active={isGroupMode}
                        onPress={() => { setIsGroupMode(true); setCategory('all'); }}
                        icon={<Plus size={13} color={isGroupMode ? '#fff' : '#6b7280'} strokeWidth={2} />}
                    />
                    {showTeachers && !isGroupMode && (
                        <CategoryChip
                            label="Teachers"
                            active={category === 'teachers'}
                            onPress={() => setCategory('teachers')}
                            icon={<GraduationCap size={13} color={category === 'teachers' ? '#fff' : '#6b7280'} strokeWidth={2} />}
                        />
                    )}
                    {showParents && !isGroupMode && (
                        <CategoryChip
                            label="Parents"
                            active={category === 'parents'}
                            onPress={() => setCategory('parents')}
                            icon={<User size={13} color={category === 'parents' ? '#fff' : '#6b7280'} strokeWidth={2} />}
                        />
                    )}
                </ScrollView>
            </View>

            {/* Group form */}
            {isGroupMode && (
                <View style={styles.groupForm}>
                    <TextInput
                        style={styles.groupInput}
                        placeholder="Enter group name..."
                        placeholderTextColor="#9ca3af"
                        value={groupName}
                        onChangeText={setGroupName}
                    />
                    <HapticTouchable
                        style={[styles.createBtn, (!groupName.trim() || selectedUsers.length === 0) && styles.createBtnDisabled]}
                        onPress={handleCreateGroup}
                        disabled={!groupName.trim() || selectedUsers.length === 0 || isCreating}
                    >
                        <Text style={styles.createBtnText}>Create Group ({selectedUsers.length})</Text>
                    </HapticTouchable>
                </View>
            )}

            {/* Creating bar */}
            {isCreating && (
                <View style={styles.creatingBar}>
                    <ActivityIndicator size="small" color="#0469ff" />
                    <Text style={styles.creatingText}>Creating conversation...</Text>
                </View>
            )}

            {/* List */}
            {isLoading ? (
                <UserListSkeleton />
            ) : eligibleUsers.length === 0 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyText}>{searchQuery ? 'No results found' : 'No eligible users'}</Text>
                </View>
            ) : (
                <FlatList
                    data={eligibleUsers}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={
                        <RefreshControl
                            refreshing={isFetching && !isLoading && !isFetchingNextPage}
                            onRefresh={handleRefresh}
                            tintColor="#0469ff"
                            colors={['#0469ff']}
                        />
                    }
                    onEndReached={handleEndReached}
                    onEndReachedThreshold={0.3}
                    ListFooterComponent={<ListFooter isFetchingNextPage={isFetchingNextPage} />}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },

    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f2f5',
    },
    backBtn: { padding: 6 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },

    searchBox: {
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: 16, marginTop: 12,
        paddingHorizontal: 14, height: 40,
        borderRadius: 20, backgroundColor: '#f3f4f6', gap: 8,
    },
    searchInput: { flex: 1, fontSize: 14, color: '#111' },

    // KEY FIX: fixed height wrapper so ScrollView doesn't expand vertically
    chipRowWrapper: {
        height: 48,
        justifyContent: 'center',
    },
    chipRowContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        gap: 8,
    },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 12, paddingVertical: 6,
        borderRadius: 20, backgroundColor: '#f3f4f6',
    },
    chipActive: { backgroundColor: '#0469ff' },
    chipText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
    chipTextActive: { color: '#fff' },

    userRow: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f2f5',
    },
    userRowSelected: { backgroundColor: '#eff6ff' },
    userRowDisabled: { opacity: 0.5 },
    avatar: { width: 46, height: 46, borderRadius: 23 },
    avatarFallback: { backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
    avatarInitial: { fontSize: 17, fontWeight: '700', color: '#0469ff' },
    userInfo: { flex: 1, marginLeft: 13 },
    userName: { fontSize: 15, fontWeight: '600', color: '#111' },
    userNameMuted: { color: '#9ca3af' },
    userSub: { fontSize: 13, color: '#6b7280', marginTop: 1 },
    checkCircle: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#0469ff', alignItems: 'center', justifyContent: 'center' },
    openBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
    openBadgeText: { fontSize: 10, fontWeight: '700', color: '#0469ff', letterSpacing: 0.5 },

    footerLoader: { paddingVertical: 16, alignItems: 'center' },
    listContent: { paddingBottom: 40 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyText: { fontSize: 14, color: '#9ca3af' },
    creatingBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, gap: 8, backgroundColor: '#eff6ff' },
    creatingText: { fontSize: 13, color: '#0469ff', fontWeight: '600' },

    groupForm: { padding: 16, paddingTop: 8, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f2f5' },
    groupInput: { height: 44, borderRadius: 12, backgroundColor: '#f3f4f6', paddingHorizontal: 14, fontSize: 14, color: '#111' },
    createBtn: { height: 44, borderRadius: 12, backgroundColor: '#0469ff', alignItems: 'center', justifyContent: 'center' },
    createBtnDisabled: { backgroundColor: '#e5e7eb' },
    createBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});