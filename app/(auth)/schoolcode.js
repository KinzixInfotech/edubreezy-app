import { useQuery } from '@tanstack/react-query';
import React, { useState, useEffect } from 'react';
import { getProfilesForSchool } from '../../lib/profileManager';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Extrapolate,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { z } from 'zod';
import api from '../../lib/api';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');

// Responsive scaling utilities
const guidelineBaseWidth = 375;
const guidelineBaseHeight = 812;

const scale = (size) => (SCREEN_WIDTH / guidelineBaseWidth) * size;
const verticalScale = (size) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;
const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

const isTablet = SCREEN_WIDTH >= 768;
const isSmallPhone = SCREEN_WIDTH < 375;

const responsive = (small, normal, tablet) => {
  if (isTablet) return tablet;
  if (isSmallPhone) return small;
  return normal;
};

// Enhanced Zod validation schema - only numbers allowed for code
const SchoolCodeSchema = z.object({
  prefix: z.string().min(1, 'Prefix is required'),
  code: z
    .string()
    .min(1, 'School code is required')
    .min(4, 'School code must be at least 4 digits')
    .max(10, 'School code must be at most 10 digits')
    .regex(/^\d+$/, 'School code must contain only numbers'),
});

// Animated floating orbs background
const FloatingOrbs = () => {
  const orb1 = useSharedValue(0);
  const orb2 = useSharedValue(0);
  const orb3 = useSharedValue(0);
  const orb4 = useSharedValue(0);

  useEffect(() => {
    orb1.value = withRepeat(withTiming(1, { duration: 8000 }), -1, true);
    orb2.value = withRepeat(withTiming(1, { duration: 10000 }), -1, true);
    orb3.value = withRepeat(withTiming(1, { duration: 12000 }), -1, true);
    orb4.value = withRepeat(withTiming(1, { duration: 6000 }), -1, true);
  }, []);

  const orb1Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(orb1.value, [0, 1], [-20, 40], Extrapolate.CLAMP) },
      { translateY: interpolate(orb1.value, [0, 1], [0, -60], Extrapolate.CLAMP) },
      { scale: interpolate(orb1.value, [0, 0.5, 1], [1, 1.2, 1], Extrapolate.CLAMP) },
    ],
    opacity: interpolate(orb1.value, [0, 0.5, 1], [0.4, 0.7, 0.4], Extrapolate.CLAMP),
  }));

  const orb2Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(orb2.value, [0, 1], [20, -50], Extrapolate.CLAMP) },
      { translateY: interpolate(orb2.value, [0, 1], [0, 80], Extrapolate.CLAMP) },
      { scale: interpolate(orb2.value, [0, 0.5, 1], [1, 1.3, 1], Extrapolate.CLAMP) },
    ],
    opacity: interpolate(orb2.value, [0, 0.5, 1], [0.3, 0.6, 0.3], Extrapolate.CLAMP),
  }));

  const orb3Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(orb3.value, [0, 1], [-30, 30], Extrapolate.CLAMP) },
      { translateY: interpolate(orb3.value, [0, 1], [20, -40], Extrapolate.CLAMP) },
      { scale: interpolate(orb3.value, [0, 0.5, 1], [1, 1.15, 1], Extrapolate.CLAMP) },
    ],
    opacity: interpolate(orb3.value, [0, 0.5, 1], [0.25, 0.5, 0.25], Extrapolate.CLAMP),
  }));

  const orb4Style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(orb4.value, [0, 1], [10, -30], Extrapolate.CLAMP) },
      { translateY: interpolate(orb4.value, [0, 1], [-20, 50], Extrapolate.CLAMP) },
      { scale: interpolate(orb4.value, [0, 0.5, 1], [1, 1.25, 1], Extrapolate.CLAMP) },
    ],
    opacity: interpolate(orb4.value, [0, 0.5, 1], [0.35, 0.65, 0.35], Extrapolate.CLAMP),
  }));

  return (
    <View style={styles.orbsContainer}>
      <Animated.View style={[styles.orb, styles.orb1, orb1Style]} />
      <Animated.View style={[styles.orb, styles.orb2, orb2Style]} />
      <Animated.View style={[styles.orb, styles.orb3, orb3Style]} />
      <Animated.View style={[styles.orb, styles.orb4, orb4Style]} />
    </View>
  );
};

export default function SchoolCodePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prefix, setPrefix] = useState('EB');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedCode, setSavedCode] = useState(null); // Store last saved code

  const fadeIn = useSharedValue(0);
  const cardScale = useSharedValue(0.95);
  const buttonPulse = useSharedValue(1);

  // Load saved school code on mount
  useEffect(() => {
    const loadSavedCode = async () => {
      try {
        const saved = await SecureStore.getItemAsync('lastSchoolCode');
        if (saved) {
          const parsed = JSON.parse(saved);
          setSavedCode(parsed);
          // Optionally pre-fill the code
          // setCode(parsed.code);
        }
      } catch (error) {
        console.log('No saved code found');
      }
    };
    loadSavedCode();
  }, []);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 800 });
    cardScale.value = withSpring(1, { damping: 15, stiffness: 100 });
  }, []);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['schoolCode', code],
    queryFn: async () => {
      console.log('🔍 Fetching school code:', `${prefix}-${code}`);
      const res = await api.get(`/schools/by-code?schoolcode=${prefix}-${code}`);
      console.log('✅ School API response:', res.data);
      return res.data;
    },
    enabled: false,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
  });


  const handleNext = async () => {
    try {
      SchoolCodeSchema.parse({ prefix, code });
      setError('');
      setLoading(true);

      // Pulse animation on button
      buttonPulse.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withTiming(1, { duration: 100 })
      );

      const { data } = await refetch();
      console.log(data);

      if (data?.school) {
        const fullCode = `${prefix}-${code}`;

        // Save the successful school code
        await SecureStore.setItemAsync('lastSchoolCode', JSON.stringify({
          prefix,
          code,
          fullCode,
          schoolName: data.school.name,
          timestamp: new Date().toISOString(),
        }));

        // Check if there are saved profiles for this school
        const savedProfiles = await getProfilesForSchool(fullCode);

        if (savedProfiles.length > 0) {
          // Navigate to profile selector
          router.push({
            pathname: '/(auth)/profile-selector',
            params: {
              schoolCode: fullCode,
              schoolData: JSON.stringify(data),
            },
          });
        } else {
          // Navigate to login (no saved profiles)
          router.push({
            pathname: '/(auth)/login',
            params: { schoolConfig: JSON.stringify(data) },
          });
        }
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
    // Only allow numbers
    const numericText = text.replace(/[^0-9]/g, '');

    // If user tried to enter non-numeric characters, show brief error
    if (text !== numericText && text.length > 0) {
      setError('Only numbers are allowed');
      // Clear error after 2 seconds
      setTimeout(() => {
        if (error === 'Only numbers are allowed') {
          setError('');
        }
      }, 2000);
    } else if (error) {
      setError('');
    }

    setCode(numericText);
  };

  const containerStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
    transform: [
      { translateY: interpolate(fadeIn.value, [0, 1], [30, 0], Extrapolate.CLAMP) },
    ],
  }));

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonPulse.value }],
  }));

  return (
    <View style={styles.fullScreenContainer}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <FloatingOrbs />
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <Animated.View style={[styles.content, containerStyle]}>
              {/* Logo */}
              <View style={styles.logoSection}>
                <View style={styles.logoContainer}>
                  <Image
                    style={styles.logo}
                    source={require('../../assets/logo.png')}
                    resizeMode="contain"
                  />
                </View>
              </View>

              {/* Heading */}
              {/* <View style={styles.headingContainer}>
                <Text style={styles.mainHeading}>
                  All-in-One{'\n'}
                  <Text style={styles.gradientText}>Cloud Platform</Text>
                  {'\n'}for Modern Schools
                </Text>
                <Text style={styles.subtitle}>
                  One smart, seamless platform designed for modern education
                </Text>
              </View> */}

              {/* Glassmorphism Card */}
              <Animated.View style={[styles.cardWrapper, cardAnimatedStyle]}>
                <BlurView intensity={40} tint="light" style={styles.blurCard}>
                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Enter Your School Code</Text>
                    {savedCode && (
                      <TouchableOpacity
                        style={styles.savedCodeHint}
                        onPress={() => setCode(savedCode.code)}
                      >
                        <Text style={styles.savedCodeText}>Last used: {savedCode.fullCode}</Text>
                        <Text style={styles.savedCodeSubtext}>Tap to use</Text>
                      </TouchableOpacity>
                    )}

                    <View style={[styles.inputWrapper, error && styles.inputWrapperError]}>
                      <LinearGradient
                        colors={['#0a57d2', '#2563eb']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.prefixContainer}
                      >
                        <Text style={styles.prefixText}>{prefix}</Text>
                      </LinearGradient>

                      <TextInput
                        style={styles.input}
                        placeholder="00000"
                        placeholderTextColor="#94A3B8"
                        value={code}
                        onChangeText={handleCodeChange}
                        keyboardType="number-pad"
                        maxLength={5}
                        autoCorrect={false}
                      />
                    </View>

                    <Animated.View style={buttonAnimatedStyle}>
                      <TouchableOpacity
                        style={[
                          styles.getStartedButton,
                          (!code.trim() || loading) && styles.buttonDisabled,
                        ]}
                        onPress={handleNext}
                        disabled={loading || !code.trim()}
                        activeOpacity={0.85}
                      >
                        <LinearGradient
                          colors={loading || !code.trim() ? ['#94a3b8', '#94a3b8'] : ['#0a57d2', '#1d4ed8']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.buttonGradient}
                        >
                          {loading ? (
                            <View style={styles.loadingContainer}>
                              <ActivityIndicator size="small" color="#FFFFFF" />
                              <Text style={styles.buttonText}>Verifying...</Text>
                            </View>
                          ) : (
                            <Text style={styles.buttonText}>Get Started</Text>
                          )}
                        </LinearGradient>
                      </TouchableOpacity>
                    </Animated.View>

                    {error ? (
                      <View style={styles.errorContainer}>
                        <Text style={styles.errorIcon}>⚠️</Text>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    ) : null}
                  </View>
                </BlurView>
              </Animated.View>

              {/* Powered by */}
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
      </View>
    </View >
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  orbsContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orb1: {
    width: SCREEN_WIDTH * 0.6,
    height: SCREEN_WIDTH * 0.6,
    backgroundColor: '#3b82f6',
    top: -SCREEN_WIDTH * 0.2,
    left: -SCREEN_WIDTH * 0.15,
  },
  orb2: {
    width: SCREEN_WIDTH * 0.5,
    height: SCREEN_WIDTH * 0.5,
    backgroundColor: '#60a5fa',
    top: SCREEN_HEIGHT * 0.3,
    right: -SCREEN_WIDTH * 0.2,
  },
  orb3: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    backgroundColor: '#2563eb',
    bottom: -SCREEN_WIDTH * 0.3,
    left: -SCREEN_WIDTH * 0.2,
  },
  orb4: {
    width: SCREEN_WIDTH * 0.35,
    height: SCREEN_WIDTH * 0.35,
    backgroundColor: '#93c5fd',
    top: SCREEN_HEIGHT * 0.15,
    left: SCREEN_WIDTH * 0.6,
  },
  content: {
    flex: 1,
    paddingHorizontal: moderateScale(24),
    paddingTop: verticalScale(20),
    justifyContent: 'center',
    width: '100%',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: verticalScale(24),
  },
  logoContainer: {
    width: Math.min(SCREEN_WIDTH * 0.55, isTablet ? 300 : 240),
    height: responsive(60, 70, 90),
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  headingContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(32),
  },
  mainHeading: {
    fontSize: moderateScale(28, 0.4),
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: moderateScale(36, 0.4),
    letterSpacing: -0.5,
    marginBottom: verticalScale(12),
  },
  gradientText: {
    color: '#2563EB',
    fontStyle: 'italic',
  },
  subtitle: {
    fontSize: moderateScale(14, 0.3),
    color: '#475569',
    textAlign: 'center',
    lineHeight: moderateScale(22, 0.3),
    fontWeight: '500',
    paddingHorizontal: moderateScale(20),
  },
  cardWrapper: {
    marginBottom: verticalScale(24),
    borderRadius: moderateScale(22),
    overflow: 'hidden',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  blurCard: {
    borderRadius: moderateScale(22),
    overflow: 'hidden',
  },
  inputCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: moderateScale(20),
    borderRadius: moderateScale(22),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  inputLabel: {
    fontSize: moderateScale(16, 0.3),
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: verticalScale(14),
    letterSpacing: -0.3,
  },
  savedCodeHint: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(10),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: '#BFDBFE',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  savedCodeText: {
    fontSize: moderateScale(13, 0.3),
    fontWeight: '600',
    color: '#1E40AF',
  },
  savedCodeSubtext: {
    fontSize: moderateScale(11, 0.3),
    fontWeight: '500',
    color: '#60A5FA',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: moderateScale(14),
    backgroundColor: '#F8FAFC',
    marginBottom: verticalScale(18),
    overflow: 'hidden',
  },
  inputWrapperError: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  prefixContainer: {
    paddingHorizontal: moderateScale(16),
    paddingVertical: moderateScale(16),
  },
  prefixText: {
    color: '#FFFFFF',
    fontSize: moderateScale(16, 0.3),
    fontWeight: '800',
    letterSpacing: 1,
  },
  input: {
    flex: 1,
    paddingHorizontal: moderateScale(14),
    paddingVertical: moderateScale(16),
    fontSize: moderateScale(16, 0.3),
    color: '#0F172A',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  getStartedButton: {
    borderRadius: moderateScale(14),
    overflow: 'hidden',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    paddingVertical: moderateScale(16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: moderateScale(16, 0.3),
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: moderateScale(12),
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(10),
    marginTop: verticalScale(14),
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorIcon: {
    marginRight: moderateScale(8),
    fontSize: moderateScale(14, 0.3),
  },
  errorText: {
    color: '#DC2626',
    fontSize: moderateScale(13, 0.3),
    fontWeight: '600',
    flex: 1,
  },
  poweredBySection: {
    alignItems: 'center',
    marginTop: verticalScale(24),
    paddingBottom: verticalScale(16),
  },
  poweredByText: {
    fontSize: moderateScale(13, 0.3),
    color: '#64748B',
    fontWeight: '600',
    marginBottom: verticalScale(4),
    letterSpacing: 0.3,
  },
  kinzixLogoContainer: {
    width: responsive(110, 130, 160),
    height: responsive(40, 50, 60),
  },
  kinzixLogo: {
    width: '100%',
    height: '100%',
  },
});