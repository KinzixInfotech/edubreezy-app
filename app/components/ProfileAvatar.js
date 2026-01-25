import React, { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Image } from 'expo-image';
import HapticTouchable from './HapticTouch';
import { onProfilePictureChange } from '../../lib/profileEvents';

/**
 * ProfileAvatar Component
 * 
 * Handles its own subscription to profile picture updates to prevent
 * parent components (like HomeScreen) from re-rendering unnecessarily.
 */
const ProfileAvatar = ({
    user,
    size = 40,
    onPress,
    borderColor = '#fff',
    borderWidth = 2
}) => {
    // Local state for profile picture only
    const [currentImage, setCurrentImage] = useState(user?.profilePicture);

    // Update local state if prop changes (initial load or full user refresh)
    useEffect(() => {
        setCurrentImage(user?.profilePicture);
    }, [user?.profilePicture]);

    // Subscribe to profile picture update events
    useEffect(() => {
        console.log('🔔 ProfileAvatar subscribing to events');
        const unsubscribe = onProfilePictureChange((newUrl) => {
            console.log('📸 ProfileAvatar received update:', newUrl);
            setCurrentImage(newUrl);
        });

        return unsubscribe;
    }, []);

    const getInitials = (name) => {
        if (!name) return 'U';
        const parts = name.trim().split(' ');
        if (parts.length === 1) return parts[0][0].toUpperCase();
        if (parts.length === 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const hasImage = currentImage && currentImage !== 'default.png' && currentImage !== 'N/A';
    const displayName = user?.parentData?.name || user?.name || 'User';

    return (
        <HapticTouchable onPress={onPress}>
            {hasImage ? (
                <View style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    borderColor: borderColor,
                    borderWidth: borderWidth,
                    overflow: 'hidden',
                    backgroundColor: '#eee'
                }}>
                    <Image
                        source={{ uri: currentImage }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                    />
                </View>
            ) : (
                <View style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: '#f0f0f0',
                    borderWidth: borderWidth,
                    borderColor: borderColor,
                    justifyContent: 'center',
                    alignItems: 'center',
                }}>
                    <Text style={{ color: '#0469ff', fontSize: size * 0.4, fontWeight: '700' }}>
                        {getInitials(displayName)}
                    </Text>
                </View>
            )}
        </HapticTouchable>
    );
};

export default React.memo(ProfileAvatar);
