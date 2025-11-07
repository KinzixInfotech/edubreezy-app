import React from 'react';
import { TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';

export default function HapticTouchable({
    onPress,
    haptic = 'light', // 'light' | 'medium' | 'heavy' | 'none'
    children,
    ...props
}) {
    const handlePress = async (e) => {
        if (haptic !== 'none') {
            const styleMap = {
                light: Haptics.ImpactFeedbackStyle.Light,
                medium: Haptics.ImpactFeedbackStyle.Medium,
                heavy: Haptics.ImpactFeedbackStyle.Heavy,
            };
            await Haptics.impactAsync(styleMap[haptic] || Haptics.ImpactFeedbackStyle.Light);
        }

        onPress?.(e);
    };

    return (
        <TouchableOpacity {...props} onPress={handlePress}>
            {children}
        </TouchableOpacity>
    );
}
