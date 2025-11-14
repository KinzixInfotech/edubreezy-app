import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Ellipse, Rect, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

const Confetti = ({ delay }) => {
  const translateY = useSharedValue(-100);
  const translateX = useSharedValue(Math.random() * width);
  const rotate = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withTiming(height + 100, {
        duration: 3500,
        easing: Easing.ease,
      })
    );
    opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
    rotate.value = withDelay(
      delay,
      withTiming(Math.random() * 1080, {
        duration: 3500,
        easing: Easing.ease,
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { rotate: `${rotate.value}deg` },
    ],
    opacity: opacity.value,
  }));

  const colors = ['#FF6B6B', '#4ECDC4', '#FFD93D', '#95E1D3', '#F38181', '#A8E6CF', '#FFB6D9', '#FFA07A', '#87CEEB'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const shapes = ['circle', 'square', 'rect'];
  const shape = shapes[Math.floor(Math.random() * shapes.length)];

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          width: shape === 'rect' ? 6 : 8,
          height: shape === 'rect' ? 12 : 8,
          backgroundColor: color,
          borderRadius: shape === 'circle' ? 4 : 1,
        },
        animatedStyle,
      ]}
    />
  );
};

const BigCartoonCake = () => {
  return (
    <Svg width="350" height="350" viewBox="0 0 350 350">
      <Defs>
        <LinearGradient id="cakeGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFE5B4" />
          <Stop offset="100%" stopColor="#F4A460" />
        </LinearGradient>
        <LinearGradient id="cakeGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#FFB6D9" />
          <Stop offset="100%" stopColor="#FF69B4" />
        </LinearGradient>
        <LinearGradient id="cakeGrad3" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor="#DDA0DD" />
          <Stop offset="100%" stopColor="#BA55D3" />
        </LinearGradient>
      </Defs>
      
      {/* Shadow */}
      <Ellipse cx="175" cy="310" rx="140" ry="20" fill="#00000020" />
      
      {/* Bottom Layer - Largest */}
      <Rect x="35" y="230" width="280" height="80" fill="url(#cakeGrad1)" rx="5" />
      <Ellipse cx="175" cy="230" rx="140" ry="25" fill="#FFE5B4" />
      
      {/* Frosting drips bottom */}
      <Circle cx="60" cy="310" r="8" fill="#FFE5B4" />
      <Circle cx="100" cy="310" r="8" fill="#FFE5B4" />
      <Circle cx="140" cy="310" r="8" fill="#FFE5B4" />
      <Circle cx="180" cy="310" r="8" fill="#FFE5B4" />
      <Circle cx="220" cy="310" r="8" fill="#FFE5B4" />
      <Circle cx="260" cy="310" r="8" fill="#FFE5B4" />
      <Circle cx="290" cy="310" r="8" fill="#FFE5B4" />
      
      {/* Middle Layer */}
      <Rect x="65" y="160" width="220" height="70" fill="url(#cakeGrad2)" rx="5" />
      <Ellipse cx="175" cy="160" rx="110" ry="20" fill="#FFB6D9" />
      
      {/* Frosting drips middle */}
      <Circle cx="80" cy="230" r="7" fill="#FFB6D9" />
      <Circle cx="120" cy="230" r="7" fill="#FFB6D9" />
      <Circle cx="160" cy="230" r="7" fill="#FFB6D9" />
      <Circle cx="200" cy="230" r="7" fill="#FFB6D9" />
      <Circle cx="240" cy="230" r="7" fill="#FFB6D9" />
      <Circle cx="270" cy="230" r="7" fill="#FFB6D9" />
      
      {/* Top Layer */}
      <Rect x="95" y="100" width="160" height="60" fill="url(#cakeGrad3)" rx="5" />
      <Ellipse cx="175" cy="100" rx="80" ry="18" fill="#DDA0DD" />
      
      {/* Frosting drips top */}
      <Circle cx="110" cy="160" r="6" fill="#DDA0DD" />
      <Circle cx="145" cy="160" r="6" fill="#DDA0DD" />
      <Circle cx="180" cy="160" r="6" fill="#DDA0DD" />
      <Circle cx="215" cy="160" r="6" fill="#DDA0DD" />
      <Circle cx="245" cy="160" r="6" fill="#DDA0DD" />
      
      {/* Decorative dots */}
      <Circle cx="80" cy="195" r="5" fill="#FF1493" />
      <Circle cx="110" cy="200" r="5" fill="#FFD700" />
      <Circle cx="140" cy="195" r="5" fill="#FF1493" />
      <Circle cx="170" cy="200" r="5" fill="#FFD700" />
      <Circle cx="200" cy="195" r="5" fill="#FF1493" />
      <Circle cx="230" cy="200" r="5" fill="#FFD700" />
      <Circle cx="260" cy="195" r="5" fill="#FF1493" />
      
      <Circle cx="120" cy="130" r="4" fill="#FFF" />
      <Circle cx="150" cy="135" r="4" fill="#FFF" />
      <Circle cx="180" cy="130" r="4" fill="#FFF" />
      <Circle cx="210" cy="135" r="4" fill="#FFF" />
      <Circle cx="230" cy="130" r="4" fill="#FFF" />
      
      {/* Cherry on top */}
      <Circle cx="175" cy="95" r="8" fill="#DC143C" />
      <Circle cx="173" cy="93" r="3" fill="#FF6B8A" />
      <Path d="M 175 95 Q 170 85, 168 75" stroke="#228B22" strokeWidth="2" fill="none" />
    </Svg>
  );
};

const BigCandle = ({ isBlown, isBlowing }) => {
  const flameOpacity = useSharedValue(1);
  const flameScale = useSharedValue(1);
  const flameTranslateX = useSharedValue(0);

  useEffect(() => {
    if (isBlowing) {
      // Blowing animation - flame moves side to side
      flameTranslateX.value = withSequence(
        withTiming(15, { duration: 150 }),
        withTiming(20, { duration: 150 }),
        withTiming(25, { duration: 150 })
      );
      flameScale.value = withSequence(
        withTiming(0.8, { duration: 150 }),
        withTiming(0.6, { duration: 150 }),
        withTiming(0.4, { duration: 150 })
      );
    }
    
    if (isBlown) {
      flameOpacity.value = withTiming(0, { duration: 300 });
      flameScale.value = withTiming(0, { duration: 300 });
    }
  }, [isBlown, isBlowing]);

  const flameStyle = useAnimatedStyle(() => ({
    opacity: flameOpacity.value,
    transform: [
      { scale: flameScale.value },
      { translateX: flameTranslateX.value }
    ],
  }));

  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.View style={flameStyle}>
        <Svg width="50" height="60" viewBox="0 0 50 60">
          {/* Outer flame */}
          <Path
            d="M25 8 Q18 22, 25 40 Q32 22, 25 8"
            fill="#FFD700"
          />
          {/* Inner flame */}
          <Path
            d="M25 12 Q21 22, 25 35 Q29 22, 25 12"
            fill="#FFA500"
          />
          {/* Core */}
          <Path
            d="M25 16 Q23 22, 25 30 Q27 22, 25 16"
            fill="#FF6347"
          />
        </Svg>
      </Animated.View>
      {/* Candle stick */}
      <Svg width="20" height="60" viewBox="0 0 20 60">
        <Defs>
          <LinearGradient id="candleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#FF1493" />
            <Stop offset="100%" stopColor="#FF69B4" />
          </LinearGradient>
        </Defs>
        <Rect x="5" y="0" width="10" height="60" fill="url(#candleGrad)" rx="2" />
        <Ellipse cx="10" cy="60" rx="5" ry="3" fill="#C71585" />
        <Rect x="5" y="0" width="10" height="8" fill="#FF69B4" rx="2" />
      </Svg>
    </View>
  );
};

export default function BirthdayScreen() {
  const [stage, setStage] = useState('zoom'); // 'zoom', 'blowing', 'blown', 'wish', 'quote'
  const [isBlowing, setIsBlowing] = useState(false);
  const [isBlown, setIsBlown] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const name = 'Sarah';

  const cakeScale = useSharedValue(3);
  const cakeOpacity = useSharedValue(1);
  const wishOpacity = useSharedValue(0);
  const wishTranslateY = useSharedValue(-30);
  const quoteOpacity = useSharedValue(0);

  useEffect(() => {
    // Initial zoom out animation
    cakeScale.value = withTiming(1, {
      duration: 2000,
      easing: Easing.out(Easing.cubic),
    });

    // Start blowing animation
    const blowingTimer = setTimeout(() => {
      setIsBlowing(true);
      setStage('blowing');
      
      // Candle blown after blowing animation
      setTimeout(() => {
        setIsBlown(true);
        setStage('blown');
        
        // Zoom in cake and show wish with confetti
        setTimeout(() => {
          setShowConfetti(true);
          setStage('wish');
          cakeScale.value = withTiming(1.2, { 
            duration: 600,
            easing: Easing.out(Easing.cubic) 
          });
          wishOpacity.value = withTiming(1, { duration: 800 });
          wishTranslateY.value = withTiming(0, { 
            duration: 800,
            easing: Easing.out(Easing.cubic)
          });
        }, 400);
      }, 500);
    }, 2200);

    return () => clearTimeout(blowingTimer);
  }, []);

  useEffect(() => {
    if (stage === 'wish') {
      // Show quote after wish
      const quoteTimer = setTimeout(() => {
        setStage('quote');
        cakeOpacity.value = withTiming(0, { duration: 600 });
        wishOpacity.value = withTiming(0, { duration: 600 });
        quoteOpacity.value = withDelay(700, withTiming(1, { duration: 1000 }));
      }, 4000);
      return () => clearTimeout(quoteTimer);
    }
  }, [stage]);

  const cakeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cakeScale.value }],
    opacity: cakeOpacity.value,
  }));

  const wishStyle = useAnimatedStyle(() => ({
    opacity: wishOpacity.value,
    transform: [{ translateY: wishTranslateY.value }],
  }));

  const quoteStyle = useAnimatedStyle(() => ({
    opacity: quoteOpacity.value,
  }));

  const handleSkip = () => {
    if (stage === 'zoom' || stage === 'blowing' || stage === 'blown') {
      setIsBlowing(true);
      setIsBlown(true);
      setShowConfetti(true);
      setStage('wish');
      cakeScale.value = withTiming(1.2, { duration: 400 });
      wishOpacity.value = withTiming(1, { duration: 400 });
      wishTranslateY.value = withTiming(0, { duration: 400 });
    } else if (stage === 'wish') {
      setStage('quote');
      cakeOpacity.value = withTiming(0, { duration: 300 });
      wishOpacity.value = withTiming(0, { duration: 300 });
      quoteOpacity.value = withTiming(1, { duration: 500 });
    }
  };

  return (
    <View style={styles.container}>
      {/* Skip Button */}
      {stage !== 'quote' && (
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Confetti falling from top across full width */}
      {showConfetti &&
        [...Array(120)].map((_, i) => (
          <Confetti key={i} delay={i * 30} />
        ))}

      {/* Cake Scene */}
      {stage !== 'quote' && (
        <Animated.View style={[styles.cakeContainer, cakeStyle]}>
          <View style={styles.cakeWrapper}>
            <View style={styles.candleContainer}>
              <BigCandle isBlown={isBlown} isBlowing={isBlowing} />
            </View>
            <BigCartoonCake />
          </View>
        </Animated.View>
      )}

      {/* Birthday Wish - Above the cake */}
      {stage === 'wish' && (
        <Animated.View style={[styles.wishContainer, wishStyle]}>
          <Text style={styles.wishText}>Happy Birthday</Text>
          <Text style={styles.nameText}>{name}!</Text>
        </Animated.View>
      )}

      {/* Quote */}
      {stage === 'quote' && (
        <Animated.View style={[styles.quoteContainer, quoteStyle]}>
          <Text style={styles.quoteIcon}>🎂</Text>
          <Text style={styles.quoteText}>
            "May your birthday be filled with sunshine, smiles, laughter, love, and cheer. 
            Wishing you the most wonderful year ahead!"
          </Text>
          <Text style={styles.quoteAuthor}>✨ With Love & Best Wishes ✨</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skipButton: {
    position: 'absolute',
    top: 50,
    right: 25,
    zIndex: 100,
    padding: 5,
  },
  skipText: {
    fontSize: 15,
    color: '#AAA',
    textDecorationLine: 'underline',
    fontWeight: '400',
  },
  cakeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cakeWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  candleContainer: {
    position: 'absolute',
    top: -50,
    zIndex: 10,
  },
  wishContainer: {
    position: 'absolute',
    alignItems: 'center',
    top: '15%',
  },
  wishText: {
    fontSize: 52,
    fontWeight: '900',
    color: '#FF1493',
    textShadowColor: '#FFB6D9',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 10,
    letterSpacing: 3,
    fontFamily: 'System',
  },
  nameText: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FF69B4',
    marginTop: 8,
    textShadowColor: '#FFD1DC',
    textShadowOffset: { width: 4, height: 4 },
    textShadowRadius: 10,
    letterSpacing: 4,
    fontFamily: 'System',
  },
  quoteContainer: {
    paddingHorizontal: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quoteIcon: {
    fontSize: 60,
    marginBottom: 30,
  },
  quoteText: {
    fontSize: 22,
    textAlign: 'center',
    color: '#8B4789',
    fontStyle: 'italic',
    lineHeight: 34,
    marginBottom: 30,
    fontWeight: '500',
  },
  quoteAuthor: {
    fontSize: 18,
    color: '#DA70D6',
    fontWeight: '700',
    letterSpacing: 1,
  },
});