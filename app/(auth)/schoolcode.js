import { useQuery } from '@tanstack/react-query';
import React, { useState, useEffect } from 'react';
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

const { width, height } = Dimensions.get('window');

// Enhanced Zod validation schema
const SchoolCodeSchema = z.object({
  prefix: z.string().min(1, 'Prefix is required'),
  code: z.string().min(1, 'Code is required'),
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

  const fadeIn = useSharedValue(0);
  const cardScale = useSharedValue(0.95);
  const buttonPulse = useSharedValue(1);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 800 });
    cardScale.value = withSpring(1, { damping: 15, stiffness: 100 });
  }, []);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['schoolCode', code],
    queryFn: async () => {
      const res = await api.get(`/schools/by-code?schoolcode=${prefix}-${code}`);
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

      if (data?.school) {
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
    if (error) setError('');
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
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.container}>
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
              <View style={styles.headingContainer}>
                <Text style={styles.mainHeading}>
                  All-in-One{'\n'}
                  <Text style={styles.gradientText}>Cloud Platform</Text>
                  {'\n'}for Modern Schools
                </Text>
                <Text style={styles.subtitle}>
                  One smart, seamless platform designed for modern education
                </Text>
              </View>

              {/* Glassmorphism Card */}
              <Animated.View style={[styles.cardWrapper, cardAnimatedStyle]}>
                <BlurView intensity={40} tint="light" style={styles.blurCard}>
                  <View style={styles.inputCard}>
                    <Text style={styles.inputLabel}>Enter Your School Code</Text>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    width: width * 0.6,
    height: width * 0.6,
    backgroundColor: '#3b82f6',
    top: -width * 0.2,
    left: -width * 0.15,
  },
  orb2: {
    width: width * 0.5,
    height: width * 0.5,
    backgroundColor: '#60a5fa',
    top: height * 0.3,
    right: -width * 0.2,
  },
  orb3: {
    width: width * 0.7,
    height: width * 0.7,
    backgroundColor: '#2563eb',
    bottom: -width * 0.3,
    left: -width * 0.2,
  },
  orb4: {
    width: width * 0.35,
    height: width * 0.35,
    backgroundColor: '#93c5fd',
    top: height * 0.15,
    left: width * 0.6,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    justifyContent: 'center',
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoContainer: {
    width: Math.min(width * 0.6, 240),
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  headingContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  mainHeading: {
    fontSize: Math.min(width * 0.085, 34),
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: Math.min(width * 0.1, 42),
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  gradientText: {
    color: '#2563EB',
    fontStyle: 'italic',
  },
  subtitle: {
    fontSize: Math.min(width * 0.04, 16),
    color: '#475569',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
    paddingHorizontal: 20,
  },
  cardWrapper: {
    marginBottom: 24,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  blurCard: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  inputCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  inputLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    marginBottom: 20,
    overflow: 'hidden',
  },
  inputWrapperError: {
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
  },
  prefixContainer: {
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  prefixText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 18,
    fontSize: 17,
    color: '#0F172A',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  getStartedButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonGradient: {
    paddingVertical: 18,
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
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorIcon: {
    marginRight: 8,
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
    marginTop: 24,
    paddingBottom: 16,
  },
  poweredByText: {
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  kinzixLogoContainer: {
    width: 130,
    height: 50,
  },
  kinzixLogo: {
    width: '100%',
    height: '100%',
  },
});