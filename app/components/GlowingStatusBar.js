import React, { useEffect } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GlowingStatusBar = () => {
  const opacity = useSharedValue(0.4);
  const scale = useSharedValue(1);

  useEffect(() => {
    // Opacity animation
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1500, easing: Easing.inOut(Easing.sine) }),
        withTiming(0.4, { duration: 1500, easing: Easing.inOut(Easing.sine) })
      ),
      -1,
      false
    );

    // Subtle scale animation for breathing effect
    scale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1500, easing: Easing.inOut(Easing.sine) }),
        withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.sine) })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scaleX: scale.value }],
  }));

  return (
    <Animated.View style={[styles.glowContainer, animatedStyle]}>
      <LinearGradient
        colors={[
          'rgba(255, 217, 61, 0)',
          'rgba(255, 217, 61, 0.6)',
          'rgba(81, 207, 102, 0.6)',
          'rgba(255, 217, 61, 0.6)',
          'rgba(255, 217, 61, 0)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        locations={[0, 0.3, 0.5, 0.7, 1]}
        style={styles.gradient}
      />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  glowContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    width: SCREEN_WIDTH * 0.6,
    height: 4,
    borderRadius: 10,
    shadowColor: '#FFD93D',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 15,
    elevation: 5,
  },
});

export default GlowingStatusBar;

// ==================================
// HOW TO USE IN YOUR HOMESCREEN:
// ==================================
// Import at top:
// import GlowingStatusBar from '../components/GlowingStatusBar';
//
// Add before Header in return statement:
// return (
//     <View style={styles.container}>
//         <GlowingStatusBar />
//         <Header />
//         {renderContent()}
//     </View>
// );