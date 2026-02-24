import React, { useState, useCallback, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TextInput,
    ActivityIndicator,
    RefreshControl,
    Alert,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { router } from 'expo-router';
import {
    ArrowLeft,
    Send,
    Users,
    UserCheck,
    GraduationCap,
    AlertTriangle,
    Megaphone,
    CheckCircle2,
    Clock,
    Image as ImageIcon,
    X,
    Wifi,
    WifiOff,
    SignalHigh,
    SignalLow,
} from 'lucide-react-native';
import NetInfo from "@react-native-community/netinfo";
import { Image } from 'expo-image';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';
import { pickAndUploadImage } from '../../../lib/uploadthing';
import { StatusBar } from 'expo-status-bar';

const AUDIENCE_OPTIONS = [
    { key: 'ALL', label: 'Everyone', icon: Users, color: '#0469ff', description: 'All staff, students & parents' },
    { key: 'STAFF', label: 'Staff Only', icon: UserCheck, color: '#8B5CF6', description: 'Teachers & non-teaching staff' },
    { key: 'TEACHING_STAFF', label: 'Teaching Staff', icon: UserCheck, color: '#6366F1', description: 'Teaching staff only' },
    { key: 'STUDENTS', label: 'Students', icon: GraduationCap, color: '#10B981', description: 'Students & their parents' },
    { key: 'PARENTS', label: 'Parents Only', icon: Users, color: '#F59E0B', description: 'All parents' },
];

const CATEGORY_OPTIONS = [
    { key: 'GENERAL', label: 'General', color: '#6B7280' },
    { key: 'EMERGENCY', label: 'Emergency', color: '#EF4444' },
    { key: 'EXAM', label: 'Exam', color: '#8B5CF6' },
    { key: 'HOLIDAY', label: 'Holiday', color: '#10B981' },
    { key: 'EVENT', label: 'Event', color: '#F59E0B' },
];

export default function BroadcastScreen() {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [audience, setAudience] = useState('ALL');
    const [category, setCategory] = useState('GENERAL');
    const [uploadedImage, setUploadedImage] = useState(null); // { url, name }
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [networkState, setNetworkState] = useState({
        isConnected: true,
        isInternetReachable: true,
        type: 'unknown',
        details: null
    });
    const queryClient = useQueryClient();

    // Monitor network status
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            setNetworkState({
                isConnected: state.isConnected,
                isInternetReachable: state.isInternetReachable,
                type: state.type,
                details: state.details
            });
        });

        return () => unsubscribe();
    }, []);

    const getNetworkQuality = () => {
        if (!networkState.isConnected || networkState.isInternetReachable === false) {
            return {
                label: 'Disconnected',
                color: '#EF4444',
                icon: WifiOff,
                quality: 'red',
                description: 'Internet connection is required to send broadcasts.'
            };
        }

        const isWeak = networkState.type === 'cellular' &&
            (networkState.details?.generation === '2g' || networkState.details?.generation === '3g');

        if (isWeak) {
            return {
                label: 'Weak Signal',
                color: '#F59E0B',
                icon: SignalLow,
                quality: 'yellow',
                description: 'Signal is weak. Your broadcast might fail or take longer.'
            };
        }

        return {
            label: 'Signal Strong',
            color: '#10B981',
            icon: Wifi,
            quality: 'green',
            description: 'Your connection is stable.'
        };
    };

    const netQuality = getNetworkQuality();

    // Get user data
    const { data: userData } = useQuery({
        queryKey: ['user-data'],
        queryFn: async () => {
            const stored = await SecureStore.getItemAsync('user');
            return stored ? JSON.parse(stored) : null;
        },
        staleTime: Infinity,
    });

    const schoolId = userData?.schoolId;
    const userId = userData?.id;

    // Fetch recent broadcasts (only current user's)
    const { data: recentBroadcasts, isLoading, refetch } = useQuery({
        queryKey: ['broadcasts', schoolId, userId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/broadcast?limit=30`);
            const all = res.data?.broadcasts || [];
            // Filter to only show current user's broadcasts
            const mine = all.filter(b => b.senderId === userId);
            return { ...res.data, broadcasts: mine };
        },
        enabled: !!schoolId && !!userId,
        staleTime: 60 * 1000,
    });

    // Pick and upload image using UploadThing
    const handlePickImage = async () => {
        if (!schoolId || !userId) {
            Alert.alert('Error', 'Please wait for user data to load');
            return;
        }

        try {
            await pickAndUploadImage('broadcast',
                { schoolId, userId, type: 'broadcast' },
                {
                    onStart: () => {
                        setIsUploading(true);
                        setUploadProgress(0);
                    },
                    onProgress: (progress) => setUploadProgress(progress),
                    onComplete: (res) => {
                        if (res?.[0]) {
                            setUploadedImage({
                                url: res[0].url,
                                name: res[0].fileName || res[0].name || 'Image',
                            });
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                    },
                    onError: (error) => {
                        Alert.alert('Upload Failed', error.message || 'Failed to upload image');
                    }
                }
            );
        } finally {
            setIsUploading(false);
            setUploadProgress(0);
        }
    };

    const removeImage = () => {
        setUploadedImage(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const broadcastMutation = useMutation({
        mutationFn: async (data) => {
            return api.post(`/schools/${schoolId}/broadcast`, data);
        },
        onSuccess: (response) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(
                'Broadcast Sent! 📢',
                `Your message has been sent to ${response.data.notifications?.targetUsers || 'all'} users.`,
                [{ text: 'OK' }]
            );
            setTitle('');
            setMessage('');
            setAudience('ALL');
            setCategory('GENERAL');
            setUploadedImage(null);
            queryClient.invalidateQueries(['broadcasts', schoolId]);
            queryClient.invalidateQueries(['notices', schoolId]);
        },
        onError: (error) => {
            Alert.alert('Error', error.response?.data?.error || 'Failed to send broadcast');
        },
    });

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await refetch();
        setRefreshing(false);
    }, [refetch]);

    const handleSend = async () => {
        // Network Check
        if (netQuality.quality === 'red') {
            Alert.alert(
                'No Connection 📡',
                'Your internet connection is currently offline. Please connect to the internet to send broadcasts.',
                [{ text: 'OK' }]
            );
            return;
        }

        if (!title.trim()) {
            Alert.alert('Error', 'Please enter a title');
            return;
        }
        if (!message.trim()) {
            Alert.alert('Error', 'Please enter a message');
            return;
        }
        if (isUploading) {
            Alert.alert('Please Wait', 'Image upload in progress...');
            return;
        }

        const isEmergency = category === 'EMERGENCY';
        const isWeak = netQuality.quality === 'yellow';

        const sendBroadcast = () => {
            broadcastMutation.mutate({
                title: title.trim(),
                message: message.trim(),
                audience,
                category,
                priority: isEmergency ? 'URGENT' : 'NORMAL',
                senderId: userId,
                imageUrl: uploadedImage?.url || null,
            });
        };

        Alert.alert(
            isEmergency ? '🚨 Send Emergency Broadcast?' : '📢 Send Broadcast?',
            `${isWeak ? '⚠️ WARNING: Your signal is weak.\n\n' : ''}This will send notifications to ${AUDIENCE_OPTIONS.find(a => a.key === audience)?.description}.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Send',
                    style: isEmergency ? 'destructive' : 'default',
                    onPress: sendBroadcast,
                },
            ]
        );
    };

    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    if (isLoading || !schoolId) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0469ff" />
            </View>
        );
    }

    const isSending = broadcastMutation.isPending || isUploading;

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <StatusBar style="dark" />
            {/* Header */}
            <View style={styles.header}>
                <HapticTouchable onPress={() => router.back()}>
                    <ArrowLeft size={24} color="#111" />
                </HapticTouchable>
                <View>
                    <Text style={styles.headerTitle}>Broadcast</Text>
                    <Text style={styles.headerSubtitle}>Send announcements</Text>
                </View>
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0469ff" />
                }
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Network Quality Indicator */}
                <View style={[styles.networkCard, { borderColor: netQuality.color + '30', backgroundColor: netQuality.color + '05' }]}>
                    <View style={[styles.networkIcon, { backgroundColor: netQuality.color + '20' }]}>
                        <netQuality.icon size={16} color={netQuality.color} />
                    </View>
                    <View style={styles.networkInfo}>
                        <Text style={[styles.networkLabel, { color: netQuality.color }]}>{netQuality.label}</Text>
                        <Text style={styles.networkDescription}>{netQuality.description}</Text>
                    </View>
                </View>

                {/* Compose Section */}
                <View style={styles.composeSection}>
                    <View style={styles.sectionHeader}>
                        <Megaphone size={20} color="#0469ff" />
                        <Text style={styles.sectionTitle}>New Broadcast</Text>
                    </View>

                    {/* Title Input */}
                    <TextInput
                        style={styles.titleInput}
                        placeholder="Announcement Title"
                        placeholderTextColor="#9CA3AF"
                        value={title}
                        onChangeText={setTitle}
                        maxLength={100}
                    />

                    {/* Message Input */}
                    <TextInput
                        style={styles.messageInput}
                        placeholder="Write your message..."
                        placeholderTextColor="#9CA3AF"
                        value={message}
                        onChangeText={setMessage}
                        multiline
                        numberOfLines={4}
                        maxLength={1000}
                    />

                    {/* Image Upload */}
                    <Text style={styles.label}>Attach Image (Optional)</Text>

                    {/* Upload Progress */}
                    {isUploading && (
                        <View style={styles.uploadProgressContainer}>
                            <View style={styles.uploadProgressBar}>
                                <View style={[styles.uploadProgressFill, { width: `${uploadProgress}%` }]} />
                            </View>
                            <Text style={styles.uploadProgressText}>Uploading... {Math.round(uploadProgress)}%</Text>
                        </View>
                    )}

                    {uploadedImage && !isUploading ? (
                        <View style={styles.imagePreviewContainer}>
                            <Image
                                source={{ uri: uploadedImage.url }}
                                style={styles.imagePreview}
                                contentFit="cover"
                            />
                            <View style={styles.uploadedBadge}>
                                <CheckCircle2 size={12} color="#10B981" />
                                <Text style={styles.uploadedText}>Uploaded to cloud</Text>
                            </View>
                            <HapticTouchable style={styles.removeImageBtn} onPress={removeImage}>
                                <X size={18} color="#fff" />
                            </HapticTouchable>
                        </View>
                    ) : !isUploading ? (
                        <HapticTouchable style={styles.imagePickerBtn} onPress={handlePickImage}>
                            <ImageIcon size={24} color="#6B7280" />
                            <Text style={styles.imagePickerText}>Tap to add image</Text>
                        </HapticTouchable>
                    ) : null}

                    {/* Category Selection */}
                    <Text style={styles.label}>Category</Text>
                    <View style={styles.categoryRow}>
                        {CATEGORY_OPTIONS.map((cat) => (
                            <HapticTouchable
                                key={cat.key}
                                style={[
                                    styles.categoryChip,
                                    category === cat.key && { backgroundColor: cat.color + '20', borderColor: cat.color },
                                ]}
                                onPress={() => setCategory(cat.key)}
                            >
                                <Text style={[
                                    styles.categoryChipText,
                                    category === cat.key && { color: cat.color },
                                ]}>
                                    {cat.label}
                                </Text>
                            </HapticTouchable>
                        ))}
                    </View>

                    {/* Audience Selection */}
                    <Text style={styles.label}>Send to</Text>
                    <View style={styles.audienceGrid}>
                        {AUDIENCE_OPTIONS.map((aud) => {
                            const Icon = aud.icon;
                            const isSelected = audience === aud.key;
                            return (
                                <HapticTouchable
                                    key={aud.key}
                                    style={[
                                        styles.audienceCard,
                                        isSelected && { borderColor: aud.color, backgroundColor: aud.color + '10' },
                                    ]}
                                    onPress={() => setAudience(aud.key)}
                                >
                                    <View style={[styles.audienceIcon, { backgroundColor: aud.color + '20' }]}>
                                        <Icon size={16} color={aud.color} />
                                    </View>
                                    <Text style={[styles.audienceLabel, isSelected && { color: aud.color }]}>
                                        {aud.label}
                                    </Text>
                                    {isSelected && (
                                        <CheckCircle2 size={14} color={aud.color} />
                                    )}
                                </HapticTouchable>
                            );
                        })}
                    </View>

                    {/* Emergency Warning */}
                    {category === 'EMERGENCY' && (
                        <View style={styles.emergencyWarning}>
                            <AlertTriangle size={16} color="#DC2626" />
                            <Text style={styles.emergencyText}>
                                Emergency broadcasts are sent with high priority
                            </Text>
                        </View>
                    )}

                    {/* Send Button */}
                    <HapticTouchable
                        style={[
                            styles.sendButton,
                            category === 'EMERGENCY' && styles.emergencyButton,
                            (isSending || netQuality.quality === 'red') && styles.sendButtonDisabled,
                        ]}
                        onPress={handleSend}
                        disabled={isSending || netQuality.quality === 'red'}
                    >
                        {isSending ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <Send size={18} color="#fff" />
                                <Text style={styles.sendButtonText}>
                                    {category === 'EMERGENCY' ? 'Send Emergency Alert' : 'Send Broadcast'}
                                </Text>
                            </>
                        )}
                    </HapticTouchable>
                </View>

                {/* Recent Broadcasts */}
                {recentBroadcasts?.broadcasts?.length > 0 && (
                    <View style={styles.recentSection}>
                        <Text style={styles.recentTitle}>Recent Broadcasts</Text>
                        {recentBroadcasts.broadcasts.slice(0, 5).map((broadcast) => (
                            <View key={broadcast.id} style={styles.broadcastItem}>
                                {broadcast.fileUrl && (
                                    <Image
                                        source={{ uri: broadcast.fileUrl }}
                                        style={styles.broadcastThumb}
                                        contentFit="cover"
                                    />
                                )}
                                <View style={styles.broadcastContent}>
                                    <Text style={styles.broadcastTitle} numberOfLines={1}>
                                        {broadcast.title}
                                    </Text>
                                    <View style={styles.broadcastMeta}>
                                        <Clock size={11} color="#9CA3AF" />
                                        <Text style={styles.broadcastTime}>
                                            {formatDate(broadcast.publishedAt)}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 14,
        gap: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#111',
    },
    headerSubtitle: {
        fontSize: 12,
        color: '#6B7280',
        marginTop: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 16,
        paddingBottom: 100,
    },
    composeSection: {
        backgroundColor: '#F9FAFB',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1F2937',
    },
    titleInput: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        padding: 12,
        fontSize: 15,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 10,
    },
    messageInput: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 10,
        padding: 12,
        fontSize: 14,
        color: '#1F2937',
        minHeight: 90,
        textAlignVertical: 'top',
        marginBottom: 14,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: '#6B7280',
        marginBottom: 8,
    },
    imagePickerBtn: {
        backgroundColor: '#fff',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        borderStyle: 'dashed',
        borderRadius: 10,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    imagePickerText: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 6,
    },
    imagePreviewContainer: {
        position: 'relative',
        marginBottom: 14,
    },
    imagePreview: {
        width: '100%',
        height: 160,
        borderRadius: 10,
    },
    removeImageBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0,0,0,0.6)',
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 14,
    },
    categoryChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    categoryChipText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#6B7280',
    },
    audienceGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 14,
    },
    audienceCard: {
        width: '48%',
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#fff',
        borderRadius: 10,
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        gap: 8,
    },
    audienceIcon: {
        width: 28,
        height: 28,
        borderRadius: 7,
        alignItems: 'center',
        justifyContent: 'center',
    },
    audienceLabel: {
        flex: 1,
        fontSize: 12,
        fontWeight: '600',
        color: '#4B5563',
    },
    emergencyWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#FEF2F2',
        padding: 10,
        borderRadius: 8,
        marginBottom: 14,
    },
    emergencyText: {
        flex: 1,
        fontSize: 11,
        color: '#DC2626',
    },
    sendButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#0469ff',
        paddingVertical: 14,
        borderRadius: 10,
    },
    emergencyButton: {
        backgroundColor: '#DC2626',
    },
    sendButtonDisabled: {
        opacity: 0.7,
    },
    sendButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    recentSection: {
        marginTop: 10,
    },
    recentTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 10,
    },
    broadcastItem: {
        flexDirection: 'row',
        backgroundColor: '#F9FAFB',
        borderRadius: 10,
        overflow: 'hidden',
        marginBottom: 8,
    },
    broadcastThumb: {
        width: 60,
        height: 60,
    },
    broadcastContent: {
        flex: 1,
        padding: 12,
        justifyContent: 'center',
    },
    broadcastTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#1F2937',
        marginBottom: 4,
    },
    broadcastMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    broadcastTime: {
        fontSize: 11,
        color: '#9CA3AF',
    },
    // UploadThing styles
    uploadProgressContainer: {
        marginBottom: 14,
        gap: 8,
    },
    uploadProgressBar: {
        height: 6,
        backgroundColor: '#E5E7EB',
        borderRadius: 3,
        overflow: 'hidden',
    },
    uploadProgressFill: {
        height: '100%',
        backgroundColor: '#0469ff',
        borderRadius: 3,
    },
    uploadProgressText: {
        fontSize: 12,
        color: '#6B7280',
        textAlign: 'center',
    },
    uploadedBadge: {
        position: 'absolute',
        bottom: 8,
        left: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(255,255,255,0.95)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    uploadedText: {
        fontSize: 11,
        color: '#10B981',
        fontWeight: '600',
    },
    // Network styles
    networkCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        marginBottom: 16,
        gap: 12,
    },
    networkIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
    networkInfo: {
        flex: 1,
    },
    networkLabel: {
        fontSize: 13,
        fontWeight: '700',
        marginBottom: 2,
    },
    networkDescription: {
        fontSize: 11,
        color: '#6B7280',
    },
});
