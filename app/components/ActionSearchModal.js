import React, { useState, useMemo, useEffect } from 'react';
import {
    View, Text, StyleSheet, Modal, TextInput, Platform, KeyboardAvoidingView, ScrollView, Dimensions
} from 'react-native';
import { Search, X, ChevronRight } from 'lucide-react-native';
import Animated, { FadeIn, FadeInDown, SlideInUp, SlideOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import HapticTouchable from './HapticTouch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const isTablet = SCREEN_WIDTH >= 768;

export default function ActionSearchModal({ visible, onClose, actionGroups, onNavigate, searchQuery, setSearchQuery }) {
    const insets = useSafeAreaInsets();
    const [localQuery, setLocalQuery] = useState('');

    useEffect(() => {
        if (visible) {
            setLocalQuery('');
            if (setSearchQuery) setSearchQuery('');
        }
    }, [visible]);

    const activeQuery = setSearchQuery ? searchQuery : localQuery;
    const updateQuery = setSearchQuery ? setSearchQuery : setLocalQuery;

    const filteredGroups = useMemo(() => {
        if (!activeQuery.trim()) return actionGroups;

        const query = activeQuery.toLowerCase().trim();

        return actionGroups.map(group => {
            // Filter actions
            const filteredActions = group.actions.filter(action =>
                action.label.toLowerCase().includes(query)
            );

            // If group title matches, return all actions, otherwise return filtered actions
            if (group.title && group.title.toLowerCase().includes(query)) {
                return group;
            }

            if (filteredActions.length > 0) {
                return { ...group, actions: filteredActions };
            }
            return null;
        }).filter(Boolean);
    }, [actionGroups, activeQuery]);

    const handleNavigate = (action) => {
        onClose();
        setTimeout(() => {
            if (onNavigate) {
                onNavigate(action);
            }
        }, 100);
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <StatusBar style="dark" />
            <View style={styles.modalContainer}>
                {Platform.OS === 'ios' ? (
                    <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
                ) : (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(240, 244, 248, 0.98)' }]} />
                )}

                <KeyboardAvoidingView
                    style={{ flex: 1 }}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
                        <View style={styles.searchBarContainer}>
                            <Search size={20} color="#666" style={styles.searchIcon} />
                            <TextInput
                                style={styles.searchInput}
                                placeholder="Search menus..."
                                placeholderTextColor="#999"
                                value={activeQuery}
                                onChangeText={updateQuery}
                                autoFocus={true}
                                returnKeyType="search"
                                clearButtonMode="while-editing"
                            />
                            {activeQuery.length > 0 && Platform.OS === 'android' && (
                                <HapticTouchable onPress={() => updateQuery('')} style={styles.clearBtn}>
                                    <X size={18} color="#666" />
                                </HapticTouchable>
                            )}
                        </View>
                        <HapticTouchable onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.cancelText}>Cancel</Text>
                        </HapticTouchable>
                    </View>

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
                        keyboardShouldPersistTaps="handled"
                    >
                        {filteredGroups.length === 0 ? (
                            <Animated.View entering={FadeIn.duration(300)} style={styles.emptyStateContainer}>
                                <Search size={48} color="#ccc" style={{ marginBottom: 16 }} />
                                <Text style={styles.emptyStateTitle}>No results found</Text>
                                <Text style={styles.emptyStateText}>
                                    We couldn't find any actions matching "{activeQuery}"
                                </Text>
                            </Animated.View>
                        ) : (
                            filteredGroups.map((group, groupIndex) => (
                                <Animated.View
                                    key={`group-${group.title || groupIndex}`}
                                    entering={FadeInDown.delay(50 * groupIndex).duration(400)}
                                    style={styles.section}
                                >
                                    {group.title && (
                                        <Text style={styles.sectionTitle}>{group.title}</Text>
                                    )}

                                    <View style={styles.actionsGrid}>
                                        {group.actions.map((action, index) => {
                                            const totalItems = group.actions.length;
                                            const isFullWidth = totalItems === 1;
                                            const itemWidth = isTablet ? '31.5%' : '48%';

                                            return (
                                                <View key={`action-${action.label}-${index}`} style={{ width: isFullWidth ? '100%' : itemWidth }}>
                                                    <HapticTouchable onPress={() => handleNavigate(action)}>
                                                        <View style={[styles.actionButton, { backgroundColor: action.bgColor || '#f0f0f0' }]}>
                                                            <View style={{ position: 'absolute', top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                                                            <View style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.15)' }} />

                                                            <View style={[styles.actionIcon, { backgroundColor: (action.color || '#000') + '20' }]}>
                                                                {action.icon && <action.icon size={22} color={action.color || '#000'} />}
                                                                {action.badge != null && (
                                                                    <View style={styles.badgeContainer}>
                                                                        <Text style={styles.badgeText}>
                                                                            {action.badge > 99 ? '99+' : action.badge}
                                                                        </Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                            <Text style={styles.actionLabel} numberOfLines={1}>
                                                                {action.label}
                                                            </Text>
                                                        </View>
                                                    </HapticTouchable>
                                                </View>
                                            );
                                        })}
                                    </View>
                                </Animated.View>
                            ))
                        )}
                    </ScrollView>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalContainer: {
        flex: 1,
        backgroundColor: '#F8FAFC',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(0,0,0,0.05)',
        backgroundColor: Platform.OS === 'ios' ? 'transparent' : '#fff',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: Platform.OS === 'ios' ? 0 : 0.05,
        shadowRadius: 8,
        elevation: 3,
        zIndex: 10,
    },
    searchBarContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Platform.OS === 'ios' ? 'rgba(0,0,0,0.05)' : '#F1F5F9',
        borderRadius: 12,
        paddingHorizontal: 12,
        height: 44,
        marginRight: 12,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: '#1e293b',
        height: '100%',
    },
    clearBtn: {
        padding: 4,
    },
    closeBtn: {
        paddingVertical: 8,
        paddingLeft: 4,
    },
    cancelText: {
        fontSize: 16,
        color: '#0469ff',
        fontWeight: '500',
    },
    scrollContent: {
        padding: 16,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1e293b',
        marginBottom: 16,
    },
    actionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 16,
    },
    actionButton: {
        padding: 16,
        borderRadius: 20,
        gap: 12,
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 2,
    },
    actionIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeContainer: {
        position: 'absolute',
        top: -4,
        right: -4,
        backgroundColor: '#FF3B30',
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        borderWidth: 2,
        borderColor: '#fff',
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    actionLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#334155',
    },
    emptyStateContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#334155',
        marginBottom: 8,
    },
    emptyStateText: {
        fontSize: 14,
        color: '#64748b',
        textAlign: 'center',
        paddingHorizontal: 32,
    },
});
