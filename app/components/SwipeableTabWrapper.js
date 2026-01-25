import React from 'react';
import { Dimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    runOnJS
} from 'react-native-reanimated';
import { router, usePathname } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25; // 25% of screen width
const VELOCITY_THRESHOLD = 500;

// Tab order for navigation
const TAB_ORDER = ['home', 'profile', 'noticeboard'];

export default function SwipeableTabWrapper({ children }) {
    const pathname = usePathname();
    const translateX = useSharedValue(0);

    // Get current tab index
    const getCurrentTabIndex = () => {
        const currentTab = pathname.replace('/(tabs)/', '').replace('/', '') || 'home';
        const index = TAB_ORDER.indexOf(currentTab);
        return index >= 0 ? index : 0;
    };

    // Navigate to adjacent tab
    const navigateToTab = (direction) => {
        const currentIndex = getCurrentTabIndex();
        const newIndex = currentIndex + direction;

        if (newIndex >= 0 && newIndex < TAB_ORDER.length) {
            const newTab = TAB_ORDER[newIndex];
            router.navigate(`/(tabs)/${newTab}`);
        }
    };

    const panGesture = Gesture.Pan()
        .activeOffsetX([-15, 15]) // Start gesture only after 15px horizontal movement
        .failOffsetY([-10, 10]) // Fail if vertical movement exceeds 10px (allows vertical scroll)
        .onUpdate((event) => {
            // Limit drag distance and add resistance at edges
            const currentIndex = getCurrentTabIndex();
            const isAtStart = currentIndex === 0 && event.translationX > 0;
            const isAtEnd = currentIndex === TAB_ORDER.length - 1 && event.translationX < 0;

            if (isAtStart || isAtEnd) {
                // Add rubber band effect at edges
                translateX.value = event.translationX * 0.3;
            } else {
                translateX.value = Math.max(-SCREEN_WIDTH * 0.4, Math.min(SCREEN_WIDTH * 0.4, event.translationX));
            }
        })
        .onEnd((event) => {
            const currentIndex = getCurrentTabIndex();
            const shouldNavigate =
                Math.abs(event.translationX) > SWIPE_THRESHOLD ||
                Math.abs(event.velocityX) > VELOCITY_THRESHOLD;

            if (shouldNavigate) {
                if (event.translationX > 0 && currentIndex > 0) {
                    // Swipe right -> go to previous tab
                    runOnJS(navigateToTab)(-1);
                } else if (event.translationX < 0 && currentIndex < TAB_ORDER.length - 1) {
                    // Swipe left -> go to next tab
                    runOnJS(navigateToTab)(1);
                }
            }

            // Animate back to center
            translateX.value = withSpring(0, {
                damping: 20,
                stiffness: 200,
            });
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    return (
        <GestureDetector gesture={panGesture}>
            <Animated.View style={[{ flex: 1 }, animatedStyle]}>
                {children}
            </Animated.View>
        </GestureDetector>
    );
}
