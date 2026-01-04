import React, { useState, useCallback } from 'react';
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
} from 'lucide-react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import * as Haptics from 'expo-haptics';
import HapticTouchable from '../../components/HapticTouch';
import api from '../../../lib/api';

const AUDIENCE_OPTIONS = [
    { key: 'ALL', label: 'Everyone', icon: Users, color: '#0469ff', description: 'All staff, students & parents' },
    { key: 'STAFF', label: 'Staff Only', icon: UserCheck, color: '#8B5CF6', description: 'Teachers & non-teaching staff' },
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

// Get API base URL from the api instance
const getBaseUrl = () => {
    return api.defaults.baseURL || 'http://192.0.0.2:3000/api';
};

export default function BroadcastScreen() {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [audience, setAudience] = useState('ALL');
    const [category, setCategory] = useState('GENERAL');
    const [selectedImage, setSelectedImage] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const queryClient = useQueryClient();

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

    // Fetch recent broadcasts
    const { data: recentBroadcasts, isLoading, refetch } = useQuery({
        queryKey: ['broadcasts', schoolId],
        queryFn: async () => {
            const res = await api.get(`/schools/${schoolId}/broadcast?limit=10`);
            return res.data;
        },
        enabled: !!schoolId,
        staleTime: 60 * 1000,
    });

    // Pick image from gallery
    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'Please allow access to photos to attach images.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [16, 9],
            quality: 0.8,
        });

        if (!result.canceled && result.assets?.[0]) {
            setSelectedImage(result.assets[0]);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
    };

    // Upload image to server
    const uploadImage = async () => {
        if (!selectedImage) return null;

        setIsUploading(true);
        try {
            const formData = new FormData();
            const uri = selectedImage.uri;
            const filename = uri.split('/').pop();
            const match = /\.(\w+)$/.exec(filename);
            const type = match ? `image/${match[1]}` : 'image/jpeg';

            formData.append('file', {
                uri,
                name: filename,
                type,
            });
            formData.append('schoolId', schoolId);
            formData.append('userId', userId);
            formData.append('type', 'broadcast');

            const response = await fetch(`${getBaseUrl()}/mobile/upload`, {
                method: 'POST',
                body: formData,
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });

            const data = await response.json();
            if (data.success && data.url) {
                return data.url;
            } else {
                throw new Error(data.error || 'Upload failed');
            }
        } catch (error) {
            console.error('Upload error:', error);
            Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
            return null;
        } finally {
            setIsUploading(false);
        }
    };

    // Send broadcast mutation
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
            setSelectedImage(null);
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
        if (!title.trim()) {
            Alert.alert('Error', 'Please enter a title');
            return;
        }
        if (!message.trim()) {
            Alert.alert('Error', 'Please enter a message');
            return;
        }

        const isEmergency = category === 'EMERGENCY';

        Alert.alert(
            isEmergency ? '🚨 Send Emergency Broadcast?' : '📢 Send Broadcast?',
            `This will send notifications to ${AUDIENCE_OPTIONS.find(a => a.key === audience)?.description}.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Send',
                    style: isEmergency ? 'destructive' : 'default',
                    onPress: async () => {
                        let imageUrl = null;
                        if (selectedImage) {
                            imageUrl = await uploadImage();
                        }

                        broadcastMutation.mutate({
                            title: title.trim(),
                            message: message.trim(),
                            audience,
                            category,
                            priority: isEmergency ? 'URGENT' : 'NORMAL',
                            senderId: userId,
                            imageUrl,
                        });
                    },
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

    const removeImage = () => {
        setSelectedImage(null);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                    {selectedImage ? (
                        <View style={styles.imagePreviewContainer}>
                            <Image
                                source={{ uri: selectedImage.uri }}
                                style={styles.imagePreview}
                                contentFit="cover"
                            />
                            <HapticTouchable style={styles.removeImageBtn} onPress={removeImage}>
                                <X size={18} color="#fff" />
                            </HapticTouchable>
                        </View>
                    ) : (
                        <HapticTouchable style={styles.imagePickerBtn} onPress={pickImage}>
                            <ImageIcon size={24} color="#6B7280" />
                            <Text style={styles.imagePickerText}>Tap to add image</Text>
                        </HapticTouchable>
                    )}

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
                            isSending && styles.sendButtonDisabled,
                        ]}
                        onPress={handleSend}
                        disabled={isSending}
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
});
