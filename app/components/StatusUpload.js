import React, { useState, useCallback, useRef, memo, Suspense } from 'react';
import {
    View, Text, StyleSheet, Alert, TextInput, ScrollView, KeyboardAvoidingView,
    Platform, Dimensions, Modal, ActivityIndicator, Animated as RNAnimated
} from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Camera, ImageIcon, Type, X, Send, ChevronDown, Users, UserCheck, BookOpen,
    Play, Pause, Film, Check
} from 'lucide-react-native';
import HapticTouchable from './HapticTouch';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import api from '../../lib/api';
import { uploadFile } from '../../lib/uploadthing';
import { StatusBar } from 'expo-status-bar';

// Lazy load to avoid crash if expo-video-thumbnails native module isn't in current build
const VideoTrimmer = React.lazy(() => import('./VideoTrimmer'));

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const AUDIENCE_OPTIONS = [
    { key: 'all', label: 'Whole School', icon: Users, color: '#0469ff' },
    { key: 'teachers', label: 'Teachers Only', icon: UserCheck, color: '#8b5cf6' },
    { key: 'class', label: 'My Classes', icon: BookOpen, color: '#10b981' },
];

const TEXT_BG_GRADIENTS = [
    ['#667eea', '#764ba2'],
    ['#f093fb', '#f5576c'],
    ['#4facfe', '#00f2fe'],
    ['#43e97b', '#38f9d7'],
    ['#fa709a', '#fee140'],
    ['#a18cd1', '#fbc2eb'],
];

/**
 * StatusUpload — Modern dark-themed picker for creating a status
 * Features: upload progress bar, toast success feedback, dark UI
 */
const StatusUpload = ({ visible, onClose, schoolId, userId }) => {
    const insets = useSafeAreaInsets();
    const queryClient = useQueryClient();
    const [mode, setMode] = useState(null); // null | 'text' | 'preview'
    const [text, setText] = useState('');
    const [caption, setCaption] = useState('');
    const [audience, setAudience] = useState('all');
    const [selectedMedia, setSelectedMedia] = useState(null); // { uri, type, fileName }
    const [bgGradientIndex, setBgGradientIndex] = useState(0);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showTrimmer, setShowTrimmer] = useState(false);
    const [pendingVideo, setPendingVideo] = useState(null); // video that needs trimming
    const [isPlaying, setIsPlaying] = useState(false);
    const [showToast, setShowToast] = useState(false);
    const videoRef = useRef(null);
    const progressAnim = useRef(new RNAnimated.Value(0)).current;
    const toastAnim = useRef(new RNAnimated.Value(0)).current;

    const reset = useCallback(() => {
        setMode(null);
        setText('');
        setCaption('');
        setAudience('all');
        setSelectedMedia(null);
        setBgGradientIndex(0);
        setUploading(false);
        setUploadProgress(0);
        setShowTrimmer(false);
        setPendingVideo(null);
        setIsPlaying(false);
        setShowToast(false);
        progressAnim.setValue(0);
    }, []);

    const togglePlayback = useCallback(async () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            await videoRef.current.pauseAsync();
        } else {
            await videoRef.current.playAsync();
        }
        setIsPlaying(!isPlaying);
    }, [isPlaying]);

    const handleClose = useCallback(() => {
        reset();
        onClose?.();
    }, [onClose, reset]);

    // Pick image from gallery
    const pickImage = useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.75,
            });

            if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                setSelectedMedia({
                    uri: asset.uri,
                    type: 'image',
                    fileName: asset.fileName || `status_${Date.now()}.jpg`,
                    mimeType: asset.mimeType || 'image/jpeg',
                });
                setMode('preview');
            }
        } catch (err) {
            Alert.alert('Error', 'Failed to pick image');
        }
    }, []);

    // Pick video from gallery
    const pickVideo = useCallback(async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                allowsEditing: true,
                quality: 0.7,
            });

            if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                const durationSec = Math.ceil((asset.duration || 15000) / 1000);

                // If video > 30 seconds, show trimmer
                if (durationSec > 30) {
                    setPendingVideo({
                        uri: asset.uri,
                        fileName: asset.fileName || `status_${Date.now()}.mp4`,
                        mimeType: asset.mimeType || 'video/mp4',
                        totalDuration: durationSec,
                    });
                    setShowTrimmer(true);
                    return;
                }

                setSelectedMedia({
                    uri: asset.uri,
                    type: 'video',
                    fileName: asset.fileName || `status_${Date.now()}.mp4`,
                    mimeType: asset.mimeType || 'video/mp4',
                    duration: durationSec,
                });
                setMode('preview');
            }
        } catch (err) {
            Alert.alert('Error', 'Failed to pick video');
        }
    }, []);

    // Handle trim confirmation
    const handleTrimConfirm = useCallback(({ uri, trimStart, trimEnd, duration }) => {
        setShowTrimmer(false);
        setSelectedMedia({
            uri,
            type: 'video',
            fileName: pendingVideo?.fileName || `status_${Date.now()}.mp4`,
            mimeType: pendingVideo?.mimeType || 'video/mp4',
            duration,
            trimStart,
            trimEnd,
        });
        setPendingVideo(null);
        setMode('preview');
    }, [pendingVideo]);

    const handleTrimCancel = useCallback(() => {
        setShowTrimmer(false);
        setPendingVideo(null);
    }, []);

    // Take photo with camera
    const takePhoto = useCallback(async () => {
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission needed', 'Camera access is required to take photos.');
                return;
            }

            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                quality: 0.75,
            });

            if (!result.canceled && result.assets?.[0]) {
                const asset = result.assets[0];
                setSelectedMedia({
                    uri: asset.uri,
                    type: 'image',
                    fileName: asset.fileName || `status_${Date.now()}.jpg`,
                    mimeType: asset.mimeType || 'image/jpeg',
                });
                setMode('preview');
            }
        } catch (err) {
            Alert.alert('Error', 'Failed to capture photo');
        }
    }, []);

    // Show success toast
    const showSuccessToast = useCallback(() => {
        setShowToast(true);
        RNAnimated.sequence([
            RNAnimated.timing(toastAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            RNAnimated.delay(1500),
            RNAnimated.timing(toastAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]).start(() => {
            setShowToast(false);
        });
    }, [toastAnim]);

    // Post status
    const postStatus = useCallback(async () => {
        if (uploading) return;
        setUploading(true);
        setUploadProgress(0);
        progressAnim.setValue(0);

        try {
            let mediaUrl = null;
            let statusType = 'text';
            let duration = null;

            if (selectedMedia) {
                statusType = selectedMedia.type;
                duration = selectedMedia.duration || null;

                // Upload via existing upload route with progress tracking
                const formData = new FormData();
                formData.append('file', {
                    uri: selectedMedia.uri,
                    name: selectedMedia.fileName,
                    type: selectedMedia.mimeType,
                });
                formData.append('schoolId', schoolId);
                formData.append('userId', userId);
                formData.append('type', 'status');

                const uploadRes = await api.post('/mobile/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    timeout: 120000,
                    onUploadProgress: (progressEvent) => {
                        if (progressEvent.total) {
                            const pct = Math.min(100, Math.round((progressEvent.loaded / progressEvent.total) * 100));
                            setUploadProgress(pct);
                            RNAnimated.timing(progressAnim, {
                                toValue: pct / 100,
                                duration: 200,
                                useNativeDriver: false,
                            }).start();
                        }
                    },
                });

                mediaUrl = uploadRes.data?.url;
                if (!mediaUrl) throw new Error('Upload failed — no URL returned');
            }

            // Uploading complete, now create the status
            setUploadProgress(100);
            progressAnim.setValue(1);

            // Create status via API
            await api.post(`/schools/${schoolId}/status`, {
                userId,
                type: statusType,
                mediaUrl,
                text: statusType === 'text' ? text : null,
                caption: caption || null,
                audience,
                duration,
                trimStart: selectedMedia?.trimStart || null,
                trimEnd: selectedMedia?.trimEnd || null,
            });

            // Invalidate feed cache — partial match to catch ['statusFeed', schoolId, userId]
            queryClient.invalidateQueries({ queryKey: ['statusFeed'] });

            // Close immediately and show toast
            handleClose();
            // Small delay so modal animates out first
            setTimeout(() => showSuccessToast(), 300);

        } catch (err) {
            console.error('Post status error:', err);
            Alert.alert('Error', err.message || 'Failed to post status');
        } finally {
            setUploading(false);
        }
    }, [selectedMedia, text, caption, audience, schoolId, userId, uploading, handleClose, queryClient, progressAnim, showSuccessToast]);

    if (!visible && !showToast) return null;

    // Toast overlay (shows even after modal is closed)
    if (!visible && showToast) {
        return (
            <RNAnimated.View
                style={[styles.toastContainer, {
                    opacity: toastAnim,
                    transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
                }]}
                pointerEvents="none"
            >
                <View style={styles.toast}>
                    <View style={styles.toastIcon}>
                        <Check size={16} color="#fff" strokeWidth={3} />
                    </View>
                    <Text style={styles.toastText}>Status posted!</Text>
                </View>
            </RNAnimated.View>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" transparent={false}>
            <StatusBar style='dark' />
            <View style={[styles.container, { paddingTop: insets.top }]}>
                {/* Header */}
                <View style={styles.header}>
                    <HapticTouchable onPress={handleClose} style={styles.closeBtn}>
                        <X size={22} color="#333" />
                    </HapticTouchable>
                    <Text style={styles.headerTitle}>
                        {mode === 'text' ? 'Text Status' : mode === 'preview' ? 'Preview' : 'New Status'}
                    </Text>
                    {mode && (
                        <HapticTouchable
                            onPress={postStatus}
                            disabled={uploading || (mode === 'text' && !text.trim())}
                            style={[styles.postBtn, uploading && { opacity: 0.6 }]}
                        >
                            {uploading ? (
                                <ActivityIndicator size={16} color="#fff" />
                            ) : (
                                <Send size={16} color="#fff" />
                            )}
                            <Text style={styles.postBtnText}>
                                {uploading ? `${uploadProgress}%` : 'Post'}
                            </Text>
                        </HapticTouchable>
                    )}
                </View>

                {/* Upload Progress Bar */}
                {uploading && (
                    <View style={styles.uploadProgressContainer}>
                        <RNAnimated.View
                            style={[styles.uploadProgressFill, {
                                width: progressAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%'],
                                }),
                            }]}
                        />
                    </View>
                )}

                {/* Mode Selector (initial state) */}
                {!mode && (
                    <View style={styles.modeSelector}>
                        <Text style={styles.modeTitle}>What would you like to share?</Text>

                        <View style={styles.modeGrid}>
                            <HapticTouchable onPress={takePhoto} style={styles.modeCard}>
                                <LinearGradient colors={['#0469ff', '#0256d0']} style={styles.modeIconBg}>
                                    <Camera size={28} color="#fff" />
                                </LinearGradient>
                                <Text style={styles.modeLabel}>Camera</Text>
                            </HapticTouchable>

                            <HapticTouchable onPress={pickImage} style={styles.modeCard}>
                                <LinearGradient colors={['#8b5cf6', '#7c3aed']} style={styles.modeIconBg}>
                                    <ImageIcon size={28} color="#fff" />
                                </LinearGradient>
                                <Text style={styles.modeLabel}>Photo</Text>
                            </HapticTouchable>

                            <HapticTouchable onPress={pickVideo} style={styles.modeCard}>
                                <LinearGradient colors={['#f59e0b', '#d97706']} style={styles.modeIconBg}>
                                    <Film size={28} color="#fff" />
                                </LinearGradient>
                                <Text style={styles.modeLabel}>Video</Text>
                                <Text style={styles.modeSubLabel}>Max 30s</Text>
                            </HapticTouchable>

                            <HapticTouchable onPress={() => setMode('text')} style={styles.modeCard}>
                                <LinearGradient colors={['#10b981', '#059669']} style={styles.modeIconBg}>
                                    <Type size={28} color="#fff" />
                                </LinearGradient>
                                <Text style={styles.modeLabel}>Text</Text>
                            </HapticTouchable>
                        </View>

                        {/* Audience Selector */}
                        <Text style={styles.audienceTitle}>Share with</Text>
                        <View style={styles.audienceRow}>
                            {AUDIENCE_OPTIONS.map((opt) => (
                                <HapticTouchable
                                    key={opt.key}
                                    onPress={() => setAudience(opt.key)}
                                    style={[
                                        styles.audienceChip,
                                        audience === opt.key && { backgroundColor: opt.color + '20', borderColor: opt.color },
                                    ]}
                                >
                                    <opt.icon size={14} color={audience === opt.key ? opt.color : '#aaa'} />
                                    <Text style={[
                                        styles.audienceChipText,
                                        audience === opt.key && { color: opt.color, fontWeight: '600' },
                                    ]}>
                                        {opt.label}
                                    </Text>
                                </HapticTouchable>
                            ))}
                        </View>
                    </View>
                )}

                {/* Text Mode */}
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
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                style={styles.textInput}
                                multiline
                                maxLength={280}
                                autoFocus
                            />
                        </LinearGradient>

                        {/* Gradient picker */}
                        <View style={styles.gradientPickerContainer}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gradientPicker}>
                                {TEXT_BG_GRADIENTS.map((colors, idx) => (
                                    <HapticTouchable key={idx} onPress={() => setBgGradientIndex(idx)}>
                                        <LinearGradient
                                            colors={colors}
                                            style={[
                                                styles.gradientDot,
                                                bgGradientIndex === idx && styles.gradientDotActive,
                                            ]}
                                        />
                                    </HapticTouchable>
                                ))}
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                )}

                {/* Image/Video Preview */}
                {mode === 'preview' && selectedMedia && (
                    <View style={styles.previewContainer}>
                        {selectedMedia.type === 'video' ? (
                            <View style={{ flex: 1, backgroundColor: '#000' }}>
                                <Video
                                    ref={videoRef}
                                    source={{ uri: selectedMedia.uri }}
                                    style={styles.previewMedia}
                                    resizeMode={ResizeMode.CONTAIN}
                                    isLooping
                                    onPlaybackStatusUpdate={(status) => {
                                        if (status.isLoaded) setIsPlaying(status.isPlaying);
                                    }}
                                />
                                <HapticTouchable
                                    onPress={togglePlayback}
                                    style={styles.playPauseBtn}
                                >
                                    {isPlaying ? (
                                        <Pause size={32} color="#fff" fill="#fff" />
                                    ) : (
                                        <Play size={32} color="#fff" fill="#fff" />
                                    )}
                                </HapticTouchable>
                            </View>
                        ) : (
                            <View style={{ flex: 1, backgroundColor: '#000' }}>
                                <Image
                                    source={{ uri: selectedMedia.uri }}
                                    style={styles.previewMedia}
                                    contentFit="contain"
                                />
                            </View>
                        )}
                        <TextInput
                            value={caption}
                            onChangeText={setCaption}
                            placeholder="Add a caption..."
                            placeholderTextColor="#888"
                            style={styles.captionInput}
                            maxLength={200}
                        />
                    </View>
                )}

                {/* Video Trimmer */}
                {showTrimmer && (
                    <Suspense fallback={<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#0469ff" /></View>}>
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
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#f5f5f5',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111',
    },
    postBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#0469ff',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    postBtnText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },

    // Upload progress bar
    uploadProgressContainer: {
        height: 3,
        backgroundColor: '#eee',
        overflow: 'hidden',
    },
    uploadProgressFill: {
        height: '100%',
        backgroundColor: '#0469ff',
        borderRadius: 2,
    },

    // Toast
    toastContainer: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 999,
    },
    toast: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#333',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    toastIcon: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#10b981',
        alignItems: 'center',
        justifyContent: 'center',
    },
    toastText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },

    // Mode selector
    modeSelector: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 30,
    },
    modeTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111',
        marginBottom: 24,
    },
    modeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 14,
        justifyContent: 'center',
    },
    modeCard: {
        width: (SCREEN_WIDTH - 72) / 2,
        backgroundColor: '#f8f9fa',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        gap: 10,
    },
    modeIconBg: {
        width: 60,
        height: 60,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modeLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    modeSubLabel: {
        fontSize: 11,
        color: '#888',
        marginTop: -6,
    },

    // Audience
    audienceTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#555',
        marginTop: 32,
        marginBottom: 12,
    },
    audienceRow: {
        flexDirection: 'row',
        gap: 8,
        flexWrap: 'wrap',
    },
    audienceChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#ddd',
        backgroundColor: '#fafafa',
    },
    audienceChipText: {
        fontSize: 13,
        color: '#666',
    },

    // Text input
    textPreview: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    textInput: {
        color: '#fff',
        fontSize: 26,
        fontWeight: '700',
        textAlign: 'center',
        maxWidth: '90%',
        lineHeight: 36,
    },
    gradientPickerContainer: {
        backgroundColor: '#fff',
    },
    gradientPicker: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        maxHeight: 60,
    },
    gradientDot: {
        width: 36,
        height: 36,
        borderRadius: 18,
        marginRight: 10,
    },
    gradientDotActive: {
        borderWidth: 3,
        borderColor: '#333',
    },

    // Preview
    previewContainer: {
        flex: 1,
        backgroundColor: '#000',
    },
    previewMedia: {
        flex: 1,
    },
    playPauseBtn: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: -30,
        marginLeft: -30,
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: 'rgba(0,0,0,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    captionInput: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: '#111',
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        backgroundColor: '#fff',
    },
});

export default memo(StatusUpload);
