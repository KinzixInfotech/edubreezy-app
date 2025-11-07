import { useQuery } from '@tanstack/react-query';
import React, { useState, useEffect, use } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Dimensions, ScrollView, Image, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolate,
  withSequence,
} from 'react-native-reanimated';
import { z } from 'zod';
import api from '../../lib/api';

import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
const { width, height } = Dimensions.get('window');

// Enhanced Zod validation schema

const SchoolCodeSchema = z.object({
  prefix: z.string().min(1, 'Prefix is required'),
  code: z.string(),
});


// Animated wave background component
const WaveBackground = () => {
  const wave1 = useSharedValue(0);
  const wave2 = useSharedValue(0);
  const wave3 = useSharedValue(0);

  useEffect(() => {
    wave1.value = withRepeat(
      withTiming(1, { duration: 8000 }),
      -1,
      false
    );
    wave2.value = withRepeat(
      withTiming(1, { duration: 6000 }),
      -1,
      false
    );
    wave3.value = withRepeat(
      withTiming(1, { duration: 10000 }),
      -1,
      false
    );
  }, []);

  const wave1Style = useAnimatedStyle(() => {
    const translateX = interpolate(
      wave1.value,
      [0, 1],
      [-width, 0],
      Extrapolate.CLAMP
    );
    return { transform: [{ translateX }] };
  });

  const wave2Style = useAnimatedStyle(() => {
    const translateX = interpolate(
      wave2.value,
      [0, 1],
      [0, width],
      Extrapolate.CLAMP
    );
    return { transform: [{ translateX }] };
  });

  const wave3Style = useAnimatedStyle(() => {
    const translateX = interpolate(
      wave3.value,
      [0, 1],
      [-width * 0.5, width * 0.5],
      Extrapolate.CLAMP
    );
    return { transform: [{ translateX }] };
  });

  return (
    <View style={styles.waveContainer}>
      <Animated.View style={[styles.wave, styles.wave1, wave1Style]} />
      <Animated.View style={[styles.wave, styles.wave2, wave2Style]} />
      <Animated.View style={[styles.wave, styles.wave3, wave3Style]} />
    </View>
  );
};

// Floating decoration circles
const FloatingCircles = () => {
  const circle1 = useSharedValue(0);
  const circle2 = useSharedValue(0);
  const circle3 = useSharedValue(0);

  useEffect(() => {
    circle1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000 }),
        withTiming(0, { duration: 3000 })
      ),
      -1,
      false
    );
    circle2.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4000 }),
        withTiming(0, { duration: 4000 })
      ),
      -1,
      false
    );
    circle3.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 5000 }),
        withTiming(0, { duration: 5000 })
      ),
      -1,
      false
    );
  }, []);

  const circle1Style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(circle1.value, [0, 1], [0, -20]) },
      { scale: interpolate(circle1.value, [0, 0.5, 1], [1, 1.1, 1]) }
    ],
  }));

  const circle2Style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(circle2.value, [0, 1], [0, -30]) },
      { scale: interpolate(circle2.value, [0, 0.5, 1], [1, 1.15, 1]) }
    ],
  }));

  const circle3Style = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(circle3.value, [0, 1], [0, -25]) },
      { scale: interpolate(circle3.value, [0, 0.5, 1], [1, 1.2, 1]) }
    ],
  }));

  return (
    <>
      <Animated.View style={[styles.floatingCircle, styles.circle1, circle1Style]} />
      <Animated.View style={[styles.floatingCircle, styles.circle2, circle2Style]} />
      <Animated.View style={[styles.floatingCircle, styles.circle3, circle3Style]} />
    </>
  );
};


export default function SchoolCodePage() {
  const router = useRouter();
  const [prefix, setPrefix] = useState('EB');
  const [code, setCode] = useState('');
  const [error, setError] = useState(''); // <— restore this
  const [loading, setLoading] = useState(false);

  const scale = useSharedValue(1);
  const fadeIn = useSharedValue(0);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 800 });
  }, []);
  const { data, refetch, isFetching } = useQuery({
    queryKey: ['schoolCode', code],
    queryFn: async () => {
      const res = await api.get(`/schools/by-code?schoolcode=${prefix}-${code}`);
      return res.data;
    },
    enabled: false, // don't run automatically
  });
  const handleNext = async () => {
    try {
      SchoolCodeSchema.parse({ prefix, code });
      setError('');
      setLoading(true);
      const { data } = await refetch(); // wait for result
      console.log('✅ Response:', data);

      if (data?.school) {
        // Navigate to login page
        // alert('fetched')
        // await SecureStore.setItemAsync('schoolConfig', JSON.stringify(data));
        router.push({
          pathname: '/(auth)/login',
          params: { schoolConfig: JSON.stringify(data) },
        });
      } else {
        setError('Invalid school code');
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else {
        setError('Something went wrong, please try again');
      }
    } finally {
      setLoading(false);
    }
  };


  const handleCodeChange = (text) => {
    setCode(text);
    // Clear error when user starts typing
    if (error) {
      setError('');
    }
  };

  const containerStyle = useAnimatedStyle(() => {
    return {
      opacity: fadeIn.value,
      transform: [
        {
          translateY: interpolate(
            fadeIn.value,
            [0, 1],
            [50, 0],
            Extrapolate.CLAMP
          ),
        },
      ],
    };
  });

  const buttonScale = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <WaveBackground />
      <FloatingCircles />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={[styles.content, containerStyle]}>
          {/* Logo area */}
          <View style={styles.logoSection}>
            <View style={styles.logoContainer}>
              <Image
                style={styles.logo}
                source={require('../../assets/logo.png')}
                resizeMode="contain"
              />
            </View>
          </View>

          {/* Main content area */}
          <View style={styles.mainContent}>
            {/* Main heading with decorative elements */}
            <View style={styles.headingContainer}>
              <View style={styles.decorativeLine} />
              <Text style={styles.mainHeading}>
                All-in-One{'\n'}
                <Text style={styles.cloudText}>Cloud Platform</Text>
                {'\n'}for Modern Schools
              </Text>
              <View style={styles.decorativeLine} />
            </View>

            {/* Subtitle */}
            <Text style={styles.subtitle}>
              One smart, seamless platform designed for modern education
            </Text>
          </View>

          {/* Input card with gradient border */}
          <View style={styles.inputCardWrapper}>
            <View style={styles.gradientBorder}>
              <View style={styles.inputCard}>
                <Text style={styles.inputLabel}>
                  Enter Your School Code
                </Text>

                <View style={[
                  styles.inputWrapper,
                  error && styles.inputWrapperError
                ]}>
                  <View style={styles.prefixContainer}>
                    <Text style={styles.prefixText}>{prefix}</Text>
                  </View>

                  <TextInput
                    style={styles.input}
                    placeholder="0000"
                    placeholderTextColor="#94A3B8"
                    value={code}
                    onChangeText={handleCodeChange}
                    keyboardType="default"
                    maxLength={20}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.getStartedButton,
                    !code.trim() && styles.buttonDisabled
                  ]}
                  onPress={handleNext}
                  disabled={loading || !code.trim()}
                  activeOpacity={0.8}
                >
                  <Animated.View style={buttonScale}>
                    <Text style={styles.buttonText}>
                      {loading ? 'Loading...' : 'Get Started'}
                    </Text>
                  </Animated.View>
                </TouchableOpacity>

                {error ? (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorIcon}>⚠️</Text>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* Powered by section */}
          <View style={styles.poweredBySection}>
            <Text style={styles.poweredByText}>Powered By</Text>
            <View style={styles.kinzixLogoContainer}>
              <Image
                style={styles.kinzixLogo}
                source={require('../../assets/kinzix.png')}
                resizeMode="contain"
              />
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  scrollContent: {
    flexGrow: 1,
  },
  waveContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: height * 0.35,
    overflow: 'hidden',
  },
  wave: {
    position: 'absolute',
    bottom: 0,
    width: width * 2,
    height: height * 0.3,
  },
  wave1: {
    backgroundColor: '#BFDBFE',
    opacity: 0.4,
    borderTopLeftRadius: width,
    borderTopRightRadius: width,
  },
  wave2: {
    backgroundColor: '#93C5FD',
    opacity: 0.35,
    borderTopLeftRadius: width,
    borderTopRightRadius: width,
    bottom: -40,
  },
  wave3: {
    backgroundColor: '#60A5FA',
    opacity: 0.25,
    borderTopLeftRadius: width,
    borderTopRightRadius: width,
    bottom: -80,
  },
  floatingCircle: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.15,
  },
  circle1: {
    width: 120,
    height: 120,
    backgroundColor: '#3B82F6',
    top: 100,
    right: 30,
  },
  circle2: {
    width: 80,
    height: 80,
    backgroundColor: '#2563EB',
    top: 250,
    left: 20,
  },
  circle3: {
    width: 100,
    height: 100,
    backgroundColor: '#60A5FA',
    top: 400,
    right: 50,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    width: width * 0.7,
    maxWidth: 300,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  mainContent: {
    marginBottom: 30,
  },
  headingContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  decorativeLine: {
    width: 60,
    height: 4,
    backgroundColor: '#3B82F6',
    borderRadius: 2,
    marginVertical: 8,
  },
  mainHeading: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 44,
    letterSpacing: -1,
  },
  cloudText: {
    color: '#2563EB',
    fontStyle: 'italic',
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  inputCardWrapper: {
    marginBottom: 24,
  },
  gradientBorder: {
    padding: 3,
    borderRadius: 20,
    backgroundColor: '#fdfeff',
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
  },
  inputLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 14,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fdfeff',
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    marginBottom: 16,
  },
  inputWrapperError: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  prefixContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a57d2',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  prefixText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 17,
    color: '#0F172A',
    fontWeight: '600',
  },
  getStartedButton: {
    backgroundColor: '#0a57d2',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorIcon: {
    marginRight: 6,
    fontSize: 16,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  poweredBySection: {
    alignItems: 'center',
    marginTop: 70,
  },
  poweredByText: {
    fontSize: 15,
    color: '#64748B',
    fontWeight: '500',
    marginBottom: 1,
  },
  kinzixLogoContainer: {
    width: 140,
    height: 55,
  },
  kinzixLogo: {
    width: '100%',
    height: '100%',
  },
});