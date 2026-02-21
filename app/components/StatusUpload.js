import React, { useState, useCallback, memo, Suspense } from 'react';
import {
    View, Text, StyleSheet, Alert, TextInput, ScrollView, KeyboardAvoidingView,
    Platform, Dimensions, Modal, ActivityIndicator
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
    Camera, ImageIcon, Type, X, Send, ChevronDown, Users, UserCheck, BookOpen
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
 * StatusUpload — Bottom sheet style picker for creating a status
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
    const [showTrimmer, setShowTrimmer] = useState(false);
    const [pendingVideo, setPendingVideo] = useState(null); // video that needs trimming

    const reset = useCallback(() => {
        setMode(null);
        setText('');
        setCaption('');
        setAudience('all');
        setSelectedMedia(null);
        setBgGradientIndex(0);
        setUploading(false);
        setShowTrimmer(false);
        setPendingVideo(null);
    }, []);

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
                aspect: [9, 16],
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
                aspect: [9, 16],
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

    // Post status
    const postStatus = useCallback(async () => {
        if (uploading) return;
        setUploading(true);

        try {
            let mediaUrl = null;
            let statusType = 'text';
            let duration = null;

            if (selectedMedia) {
                statusType = selectedMedia.type;
                duration = selectedMedia.duration || null;

                // Upload via existing upload route
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
                    timeout: 60000,
                });

                mediaUrl = uploadRes.data?.url;
                if (!mediaUrl) throw new Error('Upload failed — no URL returned');
            }

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

            handleClose();
            Alert.alert('✨', 'Status posted successfully!');

        } catch (err) {
            console.error('Post status error:', err);
            Alert.alert('Error', err.message || 'Failed to post status');
        } finally {
            setUploading(false);
        }
    }, [selectedMedia, text, caption, audience, schoolId, userId, uploading, handleClose, queryClient]);

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" transparent={false} >
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
                            style={[styles.postBtn, uploading && { opacity: 0.5 }]}
                        >
                            <Send size={18} color="#fff" />
                            <Text style={styles.postBtnText}>
                                {uploading ? 'Posting...' : 'Post'}
                            </Text>
                        </HapticTouchable>
                    )}
                </View>

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
                                    <Camera size={28} color="#fff" />
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
                                        audience === opt.key && { backgroundColor: opt.color + '15', borderColor: opt.color },
                                    ]}
                                >
                                    <opt.icon size={14} color={audience === opt.key ? opt.color : '#888'} />
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
                    </KeyboardAvoidingView>
                )}

                {/* Image/Video Preview */}
                {mode === 'preview' && selectedMedia && (
                    <View style={styles.previewContainer}>
                        <Image
                            source={{ uri: selectedMedia.uri }}
                            style={styles.previewImage}
                            contentFit="cover"
                        />
                        <TextInput
                            value={caption}
                            onChangeText={setCaption}
                            placeholder="Add a caption..."
                            placeholderTextColor="#999"
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
        gap: 16,
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
        width: 56,
        height: 56,
        borderRadius: 16,
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
    previewContainer: {
        flex: 1,
    },
    previewImage: {
        flex: 1,
    },
    captionInput: {
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 15,
        color: '#111',
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
});

export default memo(StatusUpload);
