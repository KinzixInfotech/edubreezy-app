import React, { useState, useCallback, useRef, memo, Suspense } from 'react';
import {
    View, Text, StyleSheet, Alert, TextInput, ScrollView, KeyboardAvoidingView,
    Platform, Dimensions, Modal, ActivityIndicator, Animated as RNAnimated, TouchableOpacity
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Camera, ImageIcon, Type, X, Send, Users, UserCheck, BookOpen,
    Play, Pause, Film, Check, Sparkles, ChevronLeft, Smile
} from 'lucide-react-native';
import HapticTouchable from './HapticTouch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import api from '../../lib/api';
import { getPresignedUrls, uploadToR2 } from '../../lib/r2Upload';
import { StatusBar } from 'expo-status-bar';
import Animated, { FadeInDown } from 'react-native-reanimated';

const VideoTrimmer = React.lazy(() => import('./VideoTrimmer'));

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = Math.floor((SCREEN_WIDTH - 42) / 2);

const AUDIENCE_OPTIONS = [
    { key: 'all', label: 'Whole School', icon: Users, color: '#0469ff', bg: '#EFF6FF', border: '#BFDBFE' },
    { key: 'teachers', label: 'Teachers Only', icon: UserCheck, color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
    { key: 'class', label: 'My Classes', icon: BookOpen, color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
];

const TEXT_BG_GRADIENTS = [
    ['#667eea', '#764ba2'],
    ['#f093fb', '#f5576c'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'],
    ['#a18cd1', '#fbc2eb'],
];

const MODE_OPTIONS = [
    { key: 'camera', label: 'Camera', subLabel: null, color: '#0469ff', icon: Camera },
    { key: 'photo', label: 'Photo', subLabel: null, color: '#7C3AED', icon: ImageIcon },
    { key: 'video', label: 'Video', subLabel: 'Max 30s', color: '#D97706', icon: Film },
    { key: 'text', label: 'Text', subLabel: null, color: '#059669', icon: Type },
];

const StatusUpload = ({ visible, onClose, schoolId, userId }) => {
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();

    const [mode, setMode] = useState(null);
    const [text, setText] = useState('');
    const [caption, setCaption] = useState('');
    const [audience, setAudience] = useState('all');
    const [selectedMedia, setSelectedMedia] = useState(null);
    const [bgGradientIndex, setBgGradientIndex] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showTrimmer, setShowTrimmer] = useState(false);
    const [pendingVideo, setPendingVideo] = useState(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [showToast, setShowToast] = useState(false);

    const videoRef = useRef(null);
    const progressAnim = useRef(new RNAnimated.Value(0)).current;
    const toastAnim = useRef(new RNAnimated.Value(0)).current;
    const captionRef = useRef(null);

    const reset = useCallback(() => {
        setMode(null); setText(''); setCaption(''); setAudience('all');
        setSelectedMedia(null); setBgGradientIndex(0); setUploading(false);
        setUploadProgress(0); setShowTrimmer(false); setPendingVideo(null);
        setIsPlaying(false); setShowToast(false);
        progressAnim.setValue(0);
    }, []);

    const handleClose = useCallback(() => { reset(); onClose?.(); }, [onClose, reset]);

    const togglePlayback = useCallback(async () => {
        if (!videoRef.current) return;
        if (isPlaying) await videoRef.current.pauseAsync();
        else await videoRef.current.playAsync();
        setIsPlaying(p => !p);
    }, [isPlaying]);

    const pickImage = useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75,
            });
            if (!result.canceled && result.assets?.[0]) {
                const a = result.assets[0];
                setSelectedMedia({ uri: a.uri, type: 'image', fileName: a.fileName || `status_${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg' });
                setMode('preview');
            }
        } catch { Alert.alert('Error', 'Failed to pick image'); }
    }, []);

    const pickVideo = useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Videos, allowsEditing: true, quality: 0.7,
            });
            if (!result.canceled && result.assets?.[0]) {
                const a = result.assets[0];
                const dur = Math.ceil((a.duration || 15000) / 1000);
                if (dur > 30) {
                    setPendingVideo({ uri: a.uri, fileName: a.fileName || `status_${Date.now()}.mp4`, mimeType: a.mimeType || 'video/mp4', totalDuration: dur });
                    setShowTrimmer(true); return;
                }
                setSelectedMedia({ uri: a.uri, type: 'video', fileName: a.fileName || `status_${Date.now()}.mp4`, mimeType: a.mimeType || 'video/mp4', duration: dur });
                setMode('preview');
            }
        } catch { Alert.alert('Error', 'Failed to pick video'); }
    }, []);

    const handleTrimConfirm = useCallback(({ uri, trimStart, trimEnd, duration }) => {
        setShowTrimmer(false);
        setSelectedMedia({ uri, type: 'video', fileName: pendingVideo?.fileName || `status_${Date.now()}.mp4`, mimeType: pendingVideo?.mimeType || 'video/mp4', duration, trimStart, trimEnd });
        setPendingVideo(null); setMode('preview');
    }, [pendingVideo]);

    const handleTrimCancel = useCallback(() => { setShowTrimmer(false); setPendingVideo(null); }, []);

    const takePhoto = useCallback(async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
            const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.75 });
            if (!result.canceled && result.assets?.[0]) {
                const a = result.assets[0];
                setSelectedMedia({ uri: a.uri, type: 'image', fileName: a.fileName || `status_${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg' });
                setMode('preview');
            }
        } catch { Alert.alert('Error', 'Failed to capture photo'); }
    }, []);

    const showSuccessToast = useCallback(() => {
        setShowToast(true);
        RNAnimated.sequence([
            RNAnimated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            RNAnimated.delay(1800),
            RNAnimated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => setShowToast(false));
    }, [toastAnim]);

    const postStatus = useCallback(async () => {
        if (uploading) return;
        setUploading(true); setUploadProgress(0); progressAnim.setValue(0);
        try {
            let mediaUrl = null, statusType = 'text', duration = null;
            if (selectedMedia) {
                statusType = selectedMedia.type; duration = selectedMedia.duration || null;
                const [presigned] = await getPresignedUrls(
                    [{ name: selectedMedia.fileName, type: selectedMedia.mimeType }],
                    schoolId, 'status'
                );
                await uploadToR2(selectedMedia.uri, presigned.url, selectedMedia.mimeType, (progressEvent) => {
                    if (progressEvent.total) {
                        const pct = Math.round((progressEvent.loaded / progressEvent.total) * 80);
                        setUploadProgress(pct);
                        RNAnimated.timing(progressAnim, { toValue: pct / 100, duration: 200, useNativeDriver: false }).start();
                    }
                });
                mediaUrl = presigned.publicUrl;
                if (!mediaUrl) throw new Error('Upload failed — no URL returned');
            }
            setUploadProgress(85);
            RNAnimated.timing(progressAnim, { toValue: 0.85, duration: 400, useNativeDriver: false }).start();
            const createRes = await api.post(`/schools/${schoolId}/status`, {
                userId, type: statusType, mediaUrl,
                text: statusType === 'text' ? text : null,
                caption: caption || null, audience, duration,
                trimStart: selectedMedia?.trimStart || null,
                trimEnd: selectedMedia?.trimEnd || null,
            });
            setUploadProgress(100); progressAnim.setValue(1);
            const newStatus = createRes.data?.status || createRes.data;
            queryClient.setQueryData(['statusFeed', schoolId, userId], (oldData) => {
                if (!oldData?.feed) return oldData;
                const optimisticStatus = {
                    id: newStatus?.id || `temp_${Date.now()}`, type: statusType, mediaUrl: mediaUrl || null,
                    thumbnailUrl: statusType === 'image' ? (selectedMedia?.uri || mediaUrl) : (newStatus?.thumbnailUrl || null),
                    text: statusType === 'text' ? text : null, caption: caption || null, duration,
                    trimStart: selectedMedia?.trimStart || null, trimEnd: selectedMedia?.trimEnd || null,
                    createdAt: new Date().toISOString(), isSeen: true, viewCount: 0,
                };
                const updatedFeed = oldData.feed.map((g) =>
                    g.userId === userId ? { ...g, statuses: [...(g.statuses || []), optimisticStatus] } : g
                );
                if (!oldData.feed.some((g) => g.userId === userId)) {
                    updatedFeed.unshift({ userId, userName: 'My Status', userAvatar: null, statuses: [optimisticStatus], hasUnseen: false });
                }
                return { ...oldData, feed: updatedFeed };
            });
            queryClient.invalidateQueries({ queryKey: ['statusFeed'] });
            handleClose();
            setTimeout(() => showSuccessToast(), 300);
        } catch (err) {
            Alert.alert('Error', err.message || 'Failed to post status');
        } finally {
            setUploading(false);
        }
    }, [selectedMedia, text, caption, audience, schoolId, userId, uploading, handleClose, queryClient, progressAnim, showSuccessToast]);

    const handleModePress = (key) => {
        if (key === 'camera') takePhoto();
        else if (key === 'photo') pickImage();
        else if (key === 'video') pickVideo();
        else setMode('text');
    };

    const selectedAudience = AUDIENCE_OPTIONS.find(o => o.key === audience);
    const canPost = mode === 'text' ? text.trim().length > 0 : !!selectedMedia;

    if (!visible && !showToast) return null;

    if (!visible && showToast) {
        return (
            <RNAnimated.View
                style={[styles.toastContainer, { top: insets.top + 8 },
                {
                    opacity: toastAnim,
                    transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }],
                }]}
                pointerEvents="none"
            >
                <View style={styles.toast}>
                    <View style={styles.toastDot}><Check size={11} color="#fff" strokeWidth={3} /></View>
                    <Text style={styles.toastText}>Status posted!</Text>
                </View>
            </RNAnimated.View>
        );
    }

    // ═══════════════════════════════════════════════════════════
    // PREVIEW SCREEN — full-bleed, WhatsApp-style
    // ═══════════════════════════════════════════════════════════
    if (mode === 'preview' && selectedMedia) {
        return (
            <Modal visible={visible} animationType="slide" transparent={false} statusBarTranslucent>
                <StatusBar style="light" />
                <KeyboardAvoidingView
                    style={{ flex: 1, backgroundColor: '#000' }}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={0}
                >
                    {/* ── Full-bleed media ── */}
                    <View style={StyleSheet.absoluteFill}>
                        {selectedMedia.type === 'video' ? (
                            <Video
                                ref={videoRef}
                                source={{ uri: selectedMedia.uri }}
                                style={StyleSheet.absoluteFill}
                                resizeMode={ResizeMode.CONTAIN}
                                isLooping
                                onPlaybackStatusUpdate={(s) => {
                                    if (s.isLoaded) setIsPlaying(s.isPlaying);
                                }}
                            />
                        ) : (
                            <Image
                                source={{ uri: selectedMedia.uri }}
                                style={StyleSheet.absoluteFill}
                                contentFit="cover"
                            />
                        )}
                    </View>

                    {/* ── Top gradient scrim ── */}
                    <LinearGradient
                        colors={['rgba(0,0,0,0.6)', 'transparent']}
                        style={[styles.previewTopScrim, { paddingTop: insets.top + 4 }]}
                        pointerEvents="box-none"
                    >
                        {/* Upload progress bar pinned to very top */}
                        {uploading && (
                            <View style={styles.previewProgressTrack}>
                                <RNAnimated.View style={[styles.previewProgressFill, {
                                    width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                                }]} />
                            </View>
                        )}

                        {/* Header row */}
                        <View style={styles.previewHeader}>
                            <HapticTouchable onPress={() => setMode(null)} style={styles.previewBackBtn}>
                                <ChevronLeft size={22} color="#fff" />
                            </HapticTouchable>

                            <View style={styles.previewHeaderRight}>
                                {/* Audience pill */}
                                {selectedAudience && (
                                    <View style={styles.audiencePill}>
                                        <selectedAudience.icon size={11} color="#fff" strokeWidth={2.5} />
                                        <Text style={styles.audiencePillText}>{selectedAudience.label}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    </LinearGradient>

                    {/* ── Video play/pause button (center) ── */}
                    {selectedMedia.type === 'video' && (
                        <HapticTouchable onPress={togglePlayback} style={styles.previewPlayArea}>
                            {!isPlaying && (
                                <View style={styles.previewPlayBtn}>
                                    <Play size={28} color="#fff" fill="#fff" />
                                </View>
                            )}
                        </HapticTouchable>
                    )}

                    {/* ── Duration badge (video) ── */}
                    {selectedMedia.type === 'video' && selectedMedia.duration && (
                        <View style={styles.previewDurationBadge}>
                            <Film size={10} color="#fff" />
                            <Text style={styles.previewDurationText}>{selectedMedia.duration}s</Text>
                        </View>
                    )}

                    {/* ── Bottom gradient scrim + caption + send ── */}
                    <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.75)']}
                        style={[styles.previewBottomScrim, { paddingBottom: insets.bottom + 8 }]}
                        pointerEvents="box-none"
                    >
                        <View style={styles.previewCaptionRow} pointerEvents="box-none">
                            {/* Emoji stub (cosmetic, like WhatsApp) */}
                            <View style={styles.previewEmojiBtn}>
                                <Smile size={20} color="rgba(255,255,255,0.8)" />
                            </View>

                            {/* Caption input */}
                            <View style={styles.previewCaptionInputWrap}>
                                <TextInput
                                    ref={captionRef}
                                    value={caption}
                                    onChangeText={setCaption}
                                    placeholder="Add a caption…"
                                    placeholderTextColor="rgba(255,255,255,0.45)"
                                    style={styles.previewCaptionInput}
                                    maxLength={200}
                                    multiline
                                    returnKeyType="done"
                                />
                                {caption.length > 0 && (
                                    <Text style={styles.previewCaptionCount}>{caption.length}/200</Text>
                                )}
                            </View>

                            {/* Send button */}
                            <HapticTouchable
                                onPress={postStatus}
                                disabled={uploading}
                                style={[styles.previewSendBtn, uploading && { opacity: 0.5 }]}
                            >
                                {uploading
                                    ? <ActivityIndicator size={16} color="#fff" />
                                    : <Send size={18} color="#fff" />}
                            </HapticTouchable>
                        </View>

                        {/* Upload % label */}
                        {uploading && (
                            <Text style={styles.previewUploadLabel}>{uploadProgress}% uploading…</Text>
                        )}
                    </LinearGradient>
                </KeyboardAvoidingView>
            </Modal>
        );
    }

    // ═══════════════════════════════════════════════════════════
    // MAIN MODAL (mode selector, text mode, trimmer)
    // ═══════════════════════════════════════════════════════════
    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <StatusBar style="dark" />
            <View style={[styles.container, { paddingTop: insets.top }]}>

                {/* ── Header ── */}
                <View style={styles.header}>
                    <HapticTouchable onPress={handleClose} style={styles.closeBtn}>
                        <X size={18} color="#374151" />
                    </HapticTouchable>
                    <View style={styles.headerCenter}>
                        <Text style={styles.headerTitle}>
                            {mode === 'text' ? 'Text Status' : 'New Status'}
                        </Text>
                        {mode && selectedAudience && (
                            <Text style={styles.headerSub} numberOfLines={1}>
                                {selectedAudience.label}
                            </Text>
                        )}
                    </View>
                    {mode === 'text' ? (
                        <HapticTouchable
                            onPress={postStatus}
                            disabled={uploading || !canPost}
                            style={[styles.postBtn, (!canPost || uploading) && { opacity: 0.4 }]}
                        >
                            <LinearGradient
                                colors={['#0469ff', '#0347b8']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                                style={styles.postBtnInner}
                            >
                                {uploading
                                    ? <ActivityIndicator size={12} color="#fff" />
                                    : <Send size={12} color="#fff" />}
                                <Text style={styles.postBtnText}>
                                    {uploading ? `${uploadProgress}%` : 'Post'}
                                </Text>
                            </LinearGradient>
                        </HapticTouchable>
                    ) : (
                        <View style={{ width: 64 }} />
                    )}
                </View>

                {/* ── Upload progress bar ── */}
                {uploading && (
                    <View style={styles.progressTrack}>
                        <RNAnimated.View style={[styles.progressFill, {
                            width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                        }]} />
                    </View>
                )}

                {/* ── Mode selector ── */}
                {!mode && (
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
                    >
                        <Animated.View entering={FadeInDown.delay(40).duration(380)}>
                            <LinearGradient
                                colors={['#0469ff', '#0347b8']}
                                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                                style={styles.heroCard}
                            >
                                <View style={styles.heroCircle1} />
                                <View style={styles.heroCircle2} />
                                <View style={styles.heroTop}>
                                    <View style={{ flex: 1, paddingRight: 12 }}>
                                        <Text style={styles.heroTitle}>Create a Status</Text>
                                        <Text style={styles.heroSub}>Share a moment with your school</Text>
                                    </View>
                                    <View style={styles.heroBadge}>
                                        <Sparkles size={11} color="#fff" />
                                        <Text style={styles.heroBadgeText}>New</Text>
                                    </View>
                                </View>
                                <Text style={styles.heroHint}>Pick a format to get started</Text>
                            </LinearGradient>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(100).duration(380)}>
                            <Text style={styles.sectionTitle}>Choose Format</Text>
                            <View style={styles.modeGrid}>
                                {MODE_OPTIONS.map((opt) => {
                                    const Icon = opt.icon;
                                    return (
                                        <HapticTouchable
                                            key={opt.key}
                                            onPress={() => handleModePress(opt.key)}
                                            style={styles.modeCard}
                                        >
                                            <View style={[styles.modeIconBox, { backgroundColor: opt.color + '18' }]}>
                                                <Icon size={20} color={opt.color} strokeWidth={2} />
                                            </View>
                                            <Text style={styles.modeCardLabel} numberOfLines={1}>{opt.label}</Text>
                                            {opt.subLabel ? (
                                                <Text style={styles.modeCardSub} numberOfLines={1}>{opt.subLabel}</Text>
                                            ) : null}
                                        </HapticTouchable>
                                    );
                                })}
                            </View>
                        </Animated.View>

                        <Animated.View entering={FadeInDown.delay(160).duration(380)}>
                            <Text style={styles.sectionTitle}>Share With</Text>
                            <View style={styles.audienceList}>
                                {AUDIENCE_OPTIONS.map((opt) => {
                                    const Icon = opt.icon;
                                    const active = audience === opt.key;
                                    return (
                                        <HapticTouchable
                                            key={opt.key}
                                            onPress={() => setAudience(opt.key)}
                                            style={[
                                                styles.audienceItem,
                                                active
                                                    ? { backgroundColor: opt.bg, borderColor: opt.border }
                                                    : { backgroundColor: '#fff', borderColor: '#E5E7EB' },
                                            ]}
                                        >
                                            <View style={[
                                                styles.audienceIconBox,
                                                { backgroundColor: active ? opt.color + '20' : '#F3F4F6' },
                                            ]}>
                                                <Icon size={14} color={active ? opt.color : '#9CA3AF'} strokeWidth={2} />
                                            </View>
                                            <Text style={[
                                                styles.audienceItemLabel,
                                                active && { color: opt.color, fontWeight: '700' },
                                            ]}>
                                                {opt.label}
                                            </Text>
                                            {active && (
                                                <View style={[styles.audienceTick, { backgroundColor: opt.color }]}>
                                                    <Check size={9} color="#fff" strokeWidth={3} />
                                                </View>
                                            )}
                                        </HapticTouchable>
                                    );
                                })}
                            </View>
                        </Animated.View>
                    </ScrollView>
                )}

                {/* ── Text mode ── */}
                {mode === 'text' && (
                    <KeyboardAvoidingView
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        style={{ flex: 1 }}
                    >
                        <LinearGradient
                            colors={TEXT_BG_GRADIENTS[bgGradientIndex]}
                            style={styles.textPreview}
                        >
                            <TextInput
                                value={text}
                                onChangeText={setText}
                                placeholder="Type something..."
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                style={styles.textInput}
                                multiline maxLength={280} autoFocus
                            />
                            <Text style={styles.charCount}>{text.length}/280</Text>
                        </LinearGradient>
                        <View style={[styles.gradientBar, { paddingBottom: insets.bottom + 8 }]}>
                            <ScrollView
                                horizontal showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.gradientScroll}
                            >
                                {TEXT_BG_GRADIENTS.map((colors, idx) => (
                                    <HapticTouchable key={idx} onPress={() => setBgGradientIndex(idx)}>
                                        <LinearGradient
                                            colors={colors}
                                            style={[
                                                styles.gradientDot,
                                                bgGradientIndex === idx && styles.gradientDotActive,
                                            ]}
                                        >
                                            {bgGradientIndex === idx && (
                                                <Check size={12} color="#fff" strokeWidth={3} />
                                            )}
                                        </LinearGradient>
                                    </HapticTouchable>
                                ))}
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                )}

                {/* ── Video Trimmer ── */}
                {showTrimmer && (
                    <Suspense fallback={
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="large" color="#0469ff" />
                        </View>
                    }>
                        <VideoTrimmer
                            visible={showTrimmer}
                            uri={pendingVideo?.uri}
                            totalDuration={pendingVideo?.totalDuration}
                            onConfirm={handleTrimConfirm}
                            onCancel={handleTrimCancel}
                        />
                    </Suspense>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },

    // ── Header ──────────────────────────────────────────────────
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10,
        backgroundColor: '#fff',
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
    },
    closeBtn: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center',
    },
    headerCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
    headerSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
    postBtn: { borderRadius: 16, overflow: 'hidden' },
    postBtnInner: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 14, paddingVertical: 8,
    },
    postBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    // ── Progress bar ─────────────────────────────────────────────
    progressTrack: { height: 2, backgroundColor: '#DBEAFE' },
    progressFill: { height: '100%', backgroundColor: '#0469ff' },

    // ── Toast ────────────────────────────────────────────────────
    toastContainer: {
        position: 'absolute', left: 0, right: 0,
        alignItems: 'center', zIndex: 999,
    },
    toast: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#1F2937',
        paddingHorizontal: 16, paddingVertical: 9, borderRadius: 18,
        shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18, shadowRadius: 8, elevation: 5,
    },
    toastDot: {
        width: 18, height: 18, borderRadius: 9,
        backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center',
    },
    toastText: { color: '#fff', fontSize: 13, fontWeight: '600' },

    // ── Scroll content ────────────────────────────────────────────
    scrollContent: { paddingHorizontal: 16, paddingTop: 16, gap: 18 },

    // ── Hero card ─────────────────────────────────────────────────
    heroCard: {
        borderRadius: 20, padding: 20, overflow: 'hidden',
        shadowColor: '#0469ff', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.16, shadowRadius: 10, elevation: 5,
    },
    heroCircle1: {
        position: 'absolute', top: -44, right: -44,
        width: 140, height: 140, borderRadius: 70,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    heroCircle2: {
        position: 'absolute', bottom: -28, left: -18,
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    heroTop: {
        flexDirection: 'row', alignItems: 'flex-start',
        justifyContent: 'space-between', marginBottom: 10,
    },
    heroTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
    heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.72)', marginTop: 3 },
    heroBadge: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(255,255,255,0.18)',
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    },
    heroBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },
    heroHint: { fontSize: 12, color: 'rgba(255,255,255,0.55)' },

    // ── Section title ─────────────────────────────────────────────
    sectionTitle: {
        fontSize: 10, fontWeight: '700', color: '#9CA3AF',
        textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
    },

    // ── Mode grid ─────────────────────────────────────────────────
    modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    modeCard: {
        width: CARD_WIDTH, backgroundColor: '#fff',
        borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: '#E5E7EB',
        padding: 16, flexDirection: 'column', alignItems: 'flex-start', gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    modeIconBox: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    modeCardLabel: { fontSize: 15, fontWeight: '700', color: '#111' },
    modeCardSub: { fontSize: 11, color: '#9CA3AF', fontWeight: '500', marginTop: -4 },

    // ── Audience ──────────────────────────────────────────────────
    audienceList: { gap: 8 },
    audienceItem: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 14, paddingVertical: 12,
        borderRadius: 14, borderWidth: 1,
    },
    audienceIconBox: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    audienceItemLabel: { flex: 1, fontSize: 14, color: '#6B7280', fontWeight: '500' },
    audienceTick: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

    // ── Text mode ─────────────────────────────────────────────────
    textPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
    textInput: {
        color: '#fff', fontSize: 26, fontWeight: '700',
        textAlign: 'center', lineHeight: 36, width: '100%',
    },
    charCount: {
        position: 'absolute', bottom: 14, right: 14,
        fontSize: 10, color: 'rgba(255,255,255,0.45)', fontWeight: '600',
    },
    gradientBar: {
        backgroundColor: '#fff',
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB',
        paddingTop: 12,
    },
    gradientScroll: { paddingHorizontal: 16, gap: 8 },
    gradientDot: {
        width: 34, height: 34, borderRadius: 9,
        alignItems: 'center', justifyContent: 'center',
    },
    gradientDotActive: {
        borderWidth: 2, borderColor: '#111',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15, shadowRadius: 4, elevation: 2,
    },

    // ══════════════════════════════════════════════════════════════
    // PREVIEW SCREEN (full-bleed, WhatsApp-style)
    // ══════════════════════════════════════════════════════════════

    // Top scrim — gradient fades from black → transparent
    previewTopScrim: {
        position: 'absolute', top: 0, left: 0, right: 0,
        zIndex: 10,
        paddingHorizontal: 14,
        paddingBottom: 20,
    },
    previewProgressTrack: {
        height: 2, backgroundColor: 'rgba(255,255,255,0.25)',
        marginBottom: 10, borderRadius: 1, overflow: 'hidden',
    },
    previewProgressFill: {
        height: '100%', backgroundColor: '#fff',
    },
    previewHeader: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between',
    },
    previewBackBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: 'rgba(0,0,0,0.35)',
        alignItems: 'center', justifyContent: 'center',
    },
    previewHeaderRight: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    audiencePill: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        backgroundColor: 'rgba(0,0,0,0.45)',
        paddingHorizontal: 10, paddingVertical: 5,
        borderRadius: 20,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    },
    audiencePillText: {
        fontSize: 11, color: '#fff', fontWeight: '600',
    },

    // Center tap-to-play area
    previewPlayArea: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center', justifyContent: 'center',
        zIndex: 5,
    },
    previewPlayBtn: {
        width: 64, height: 64, borderRadius: 32,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)',
    },

    // Duration badge
    previewDurationBadge: {
        position: 'absolute', top: '50%', right: 14,
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7,
        zIndex: 10,
    },
    previewDurationText: { color: '#fff', fontSize: 11, fontWeight: '700' },

    // Bottom scrim + caption bar
    previewBottomScrim: {
        position: 'absolute', bottom: 0, left: 0, right: 0,
        zIndex: 10,
        paddingTop: 40,
        paddingHorizontal: 12,
    },
    previewCaptionRow: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    },
    previewEmojiBtn: {
        width: 40, height: 40, borderRadius: 20,
        alignItems: 'center', justifyContent: 'center',
        marginBottom: 2,
    },
    previewCaptionInputWrap: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 22,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)',
        paddingHorizontal: 14, paddingVertical: 10,
        minHeight: 44, maxHeight: 110,
        justifyContent: 'center',
    },
    previewCaptionInput: {
        color: '#fff', fontSize: 14, lineHeight: 20,
        padding: 0, margin: 0,
    },
    previewCaptionCount: {
        fontSize: 9, color: 'rgba(255,255,255,0.4)',
        fontWeight: '600', marginTop: 3, textAlign: 'right',
    },
    previewSendBtn: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#0469ff',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#0469ff', shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.35, shadowRadius: 6, elevation: 4,
        marginBottom: 2,
    },
    previewUploadLabel: {
        textAlign: 'center', color: 'rgba(255,255,255,0.6)',
        fontSize: 11, fontWeight: '500', marginTop: 8,
    },
});

export default memo(StatusUpload);