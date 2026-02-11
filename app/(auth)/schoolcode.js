import { useQuery } from '@tanstack/react-query';
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  FlatList,
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
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { z } from 'zod';
import api from '../../lib/api';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';

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

// ─── School Search Result Item ───
const SchoolSearchItem = ({ school, onPress }) => (
  <TouchableOpacity
    style={styles.searchResultItem}
    onPress={() => onPress(school)}
    activeOpacity={0.7}
  >
    <View style={styles.searchResultIcon}>
      {school.profilePicture ? (
        <Image source={{ uri: school.profilePicture }} style={styles.schoolThumb} />
      ) : (
        <LinearGradient
          colors={['#3b82f6', '#2563eb']}
          style={styles.schoolThumbPlaceholder}
        >
          <Text style={styles.schoolThumbText}>
            {school.name?.charAt(0)?.toUpperCase() || 'S'}
          </Text>
        </LinearGradient>
      )}
    </View>
    <View style={styles.searchResultInfo}>
      <Text style={styles.searchResultName} numberOfLines={1}>
        {school.name}
      </Text>
      <Text style={styles.searchResultLocation} numberOfLines={1}>
        📍 {school.location || 'Location not available'}
      </Text>
      <Text style={styles.searchResultCode} numberOfLines={1}>
        Code: {school.schoolCode}
      </Text>
    </View>
    <View style={styles.searchResultArrow}>
      <Text style={styles.arrowText}>→</Text>
    </View>
  </TouchableOpacity>
);

export default function SchoolCodePage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [prefix, setPrefix] = useState('EB');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedCode, setSavedCode] = useState(null);

  // ─── School Finder state ───
  const [activeTab, setActiveTab] = useState('find'); // 'find' | 'code'
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchTimeout = useRef(null);

  // ─── Geolocation state ───
  const [nearbySchools, setNearbySchools] = useState([]);
  const [userCity, setUserCity] = useState('');
  const [locationLoading, setLocationLoading] = useState(true);

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
        }
      } catch (error) {
        console.log('No saved code found');
      }
    };
    loadSavedCode();
  }, []);

  // ─── Fetch nearby schools via geolocation on mount ───
  useEffect(() => {
    const fetchNearbySchools = async () => {
      try {
        setLocationLoading(true);
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.log('📍 Location permission denied');
          setLocationLoading(false);
          return;
        }

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        });

        const [place] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });

        console.log('📍 Reverse geocode result:', JSON.stringify(place));

        // Try multiple location levels: city, subregion (district), region (state)
        const searchTerms = [
          place?.city,
          place?.subregion,
          place?.region,
        ].filter(Boolean);

        const displayCity = place?.city || place?.subregion || place?.region || '';
        setUserCity(displayCity);

        if (searchTerms.length === 0) {
          setLocationLoading(false);
          return;
        }

        // Search with each term and merge unique results
        const allSchools = new Map();
        for (const term of searchTerms) {
          try {
            console.log('🔍 Searching schools with term:', term);
            const res = await api.get(`/schools/search?q=${encodeURIComponent(term)}`);
            const schools = res.data?.schools || [];
            console.log(`✅ Found ${schools.length} schools for "${term}"`);
            schools.forEach((s) => allSchools.set(s.id, s));
          } catch (err) {
            console.log(`⚠️ Search failed for "${term}":`, err.message);
          }
        }

        setNearbySchools(Array.from(allSchools.values()));
      } catch (err) {
        console.log('❌ Location fetch error:', err);
      } finally {
        setLocationLoading(false);
      }
    };

    fetchNearbySchools();
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
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  // ─── Debounced School Search ───
  const handleSearch = useCallback((text) => {
    setSearchQuery(text);
    setSearchError('');

    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }

    if (text.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await api.get(`/schools/search?q=${encodeURIComponent(text.trim())}`);
        setSearchResults(res.data?.schools || []);
      } catch (err) {
        console.error('School search error:', err);
        setSearchError('Failed to search. Please try again.');
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // ─── Handle School Selection from Search ───
  const handleSchoolSelect = async (school) => {
    try {
      setLoading(true);
      setError('');

      // The school has schoolCode like "EB-12345", split to get code part
      const parts = school.schoolCode.split('-');
      const selectedPrefix = parts[0] || 'EB';
      const selectedCode = parts.slice(1).join('-') || '';

      setPrefix(selectedPrefix);
      setCode(selectedCode);

      // Fetch full school data using the school code
      const res = await api.get(`/schools/by-code?schoolcode=${school.schoolCode}`);
      const schoolData = res.data;

      if (schoolData?.school) {
        const fullCode = school.schoolCode;

        // Save the successful school code
        await SecureStore.setItemAsync('lastSchoolCode', JSON.stringify({
          prefix: selectedPrefix,
          code: selectedCode,
          fullCode,
          schoolName: schoolData.school.name,
          timestamp: new Date().toISOString(),
        }));

        // Check if there are saved profiles for this school
        const savedProfiles = await getProfilesForSchool(fullCode);

        if (savedProfiles.length > 0) {
          router.push({
            pathname: '/(auth)/profile-selector',
            params: {
              schoolCode: fullCode,
              schoolData: JSON.stringify(schoolData),
            },
          });
        } else {
          router.push({
            pathname: '/(auth)/login',
            params: { schoolConfig: JSON.stringify(schoolData) },
          });
        }
      } else {
        setError('Could not load school details. Please try again.');
      }
    } catch (err) {
      console.error('School select error:', err);
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = async () => {
    try {
      SchoolCodeSchema.parse({ prefix, code });
      setError('');
      setLoading(true);

      buttonPulse.value = withSequence(
        withTiming(0.95, { duration: 100 }),
        withTiming(1, { duration: 100 })
      );

      const { data } = await refetch();
      console.log(data);

      if (data?.school) {
        const fullCode = `${prefix}-${code}`;

        await SecureStore.setItemAsync('lastSchoolCode', JSON.stringify({
          prefix,
          code,
          fullCode,
          schoolName: data.school.name,
          timestamp: new Date().toISOString(),
        }));

        const savedProfiles = await getProfilesForSchool(fullCode);

        if (savedProfiles.length > 0) {
          router.push({
            pathname: '/(auth)/profile-selector',
            params: {
              schoolCode: fullCode,
              schoolData: JSON.stringify(data),
            },
          });
        } else {
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
    const numericText = text.replace(/[^0-9]/g, '');

    if (text !== numericText && text.length > 0) {
      setError('Only numbers are allowed');
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

  // ─── Render Search Results ───
  const renderSearchContent = () => {
    if (searching) {
      return (
        <View style={styles.searchStateContainer}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.searchStateText}>Searching schools...</Text>
        </View>
      );
    }

    if (searchError) {
      return (
        <View style={styles.searchStateContainer}>
          <Text style={styles.searchErrorText}>{searchError}</Text>
        </View>
      );
    }

    if (searchQuery.length >= 2 && searchResults.length === 0 && !searching) {
      return (
        <View style={styles.searchStateContainer}>
          <Text style={styles.noResultsEmoji}>🏫</Text>
          <Text style={styles.noResultsText}>No schools found</Text>
          <Text style={styles.noResultsSubtext}>
            Try a different name or city
          </Text>
          <TouchableOpacity
            style={styles.switchToCodeLink}
            onPress={() => setActiveTab('code')}
          >
            <Text style={styles.switchToCodeText}>Enter code manually →</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (searchResults.length > 0) {
      return (
        <ScrollView
          style={styles.searchResultsList}
          nestedScrollEnabled={true}
          showsVerticalScrollIndicator={true}
        >
          {searchResults.map((school) => (
            <SchoolSearchItem
              key={school.id}
              school={school}
              onPress={handleSchoolSelect}
            />
          ))}
        </ScrollView>
      );
    }

    // Default state — show nearby schools from geolocation
    if (locationLoading) {
      return (
        <View style={styles.searchStateContainer}>
          <ActivityIndicator size="small" color="#2563EB" />
          <Text style={styles.searchStateText}>Finding schools near you...</Text>
        </View>
      );
    }

    if (nearbySchools.length > 0) {
      return (
        <View>
          <View style={styles.nearbyHeader}>
            <Text style={styles.nearbyHeaderText}>
              📍 Schools in {userCity}
            </Text>
            <Text style={styles.nearbySubtext}>
              {nearbySchools.length} school{nearbySchools.length !== 1 ? 's' : ''} found
            </Text>
          </View>
          <ScrollView
            style={styles.searchResultsList}
            nestedScrollEnabled={true}
            showsVerticalScrollIndicator={true}
          >
            {nearbySchools.map((school) => (
              <SchoolSearchItem
                key={school.id}
                school={school}
                onPress={handleSchoolSelect}
              />
            ))}
          </ScrollView>
        </View>
      );
    }

    // Fallback — no location or no nearby schools
    return (
      <View style={styles.searchHintContainer}>
        <Text style={styles.searchHintEmoji}>🔍</Text>
        <Text style={styles.searchHintText}>
          Search by school name or city
        </Text>
        <Text style={styles.searchHintSubtext}>
          e.g. "DAV", "Delhi Public", "Hazaribagh"
        </Text>
      </View>
    );
  };

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

              {/* Glassmorphism Card */}
              <Animated.View style={[styles.cardWrapper, cardAnimatedStyle]}>
                <BlurView intensity={40} tint="light" style={styles.blurCard}>
                  <View style={styles.inputCard}>

                    {/* ─── Tab Switcher ─── */}
                    <View style={styles.tabContainer}>
                      <TouchableOpacity
                        style={[
                          styles.tab,
                          activeTab === 'find' && styles.tabActive,
                        ]}
                        onPress={() => {
                          setActiveTab('find');
                          setError('');
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.tabText,
                          activeTab === 'find' && styles.tabTextActive,
                        ]}>
                          Find School
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[
                          styles.tab,
                          activeTab === 'code' && styles.tabActive,
                        ]}
                        onPress={() => {
                          setActiveTab('code');
                          setSearchError('');
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.tabText,
                          activeTab === 'code' && styles.tabTextActive,
                        ]}>
                          Enter Code
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* ─── Find School Tab ─── */}
                    {activeTab === 'find' && (
                      <View>
                        <View style={[styles.searchInputWrapper, searchError && styles.inputWrapperError]}>
                          <Text style={styles.searchIcon}>🔍</Text>
                          <TextInput
                            style={styles.searchInput}
                            placeholder="Search by school name or city..."
                            placeholderTextColor="#94A3B8"
                            value={searchQuery}
                            onChangeText={handleSearch}
                            autoCorrect={false}
                            autoCapitalize="none"
                          />
                          {searchQuery.length > 0 && (
                            <TouchableOpacity
                              onPress={() => {
                                setSearchQuery('');
                                setSearchResults([]);
                                setSearchError('');
                              }}
                              style={styles.clearButton}
                            >
                              <Text style={styles.clearButtonText}>✕</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        {renderSearchContent()}

                        {/* Loading overlay when selecting a school */}
                        {loading && (
                          <View style={styles.selectingOverlay}>
                            <ActivityIndicator size="small" color="#FFFFFF" />
                            <Text style={styles.selectingText}>Connecting to school...</Text>
                          </View>
                        )}
                      </View>
                    )}

                    {/* ─── Enter Code Tab ─── */}
                    {activeTab === 'code' && (
                      <View>
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
                      </View>
                    )}

                    {/* Error display (shared) */}
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
    </View>
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

  // ─── Tab Switcher ───
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: moderateScale(12),
    padding: 3,
    marginBottom: verticalScale(16),
  },
  tab: {
    flex: 1,
    paddingVertical: moderateScale(10),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: moderateScale(13, 0.3),
    fontWeight: '600',
    color: '#94A3B8',
  },
  tabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },

  // ─── Search Input ───
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: moderateScale(14),
    backgroundColor: '#F8FAFC',
    paddingHorizontal: moderateScale(12),
    marginBottom: verticalScale(12),
  },
  searchIcon: {
    fontSize: moderateScale(16),
    marginRight: moderateScale(8),
  },
  searchInput: {
    flex: 1,
    paddingVertical: moderateScale(14),
    fontSize: moderateScale(15, 0.3),
    color: '#0F172A',
    fontWeight: '500',
  },
  clearButton: {
    padding: moderateScale(6),
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  clearButtonText: {
    fontSize: moderateScale(12),
    color: '#64748B',
    fontWeight: '700',
  },

  // ─── Search Results ───
  searchResultsList: {
    maxHeight: verticalScale(240),
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: moderateScale(12),
    paddingHorizontal: moderateScale(10),
    borderRadius: moderateScale(12),
    backgroundColor: '#F8FAFC',
    marginBottom: moderateScale(8),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchResultIcon: {
    marginRight: moderateScale(12),
  },
  schoolThumb: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(10),
  },
  schoolThumbPlaceholder: {
    width: moderateScale(40),
    height: moderateScale(40),
    borderRadius: moderateScale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  schoolThumbText: {
    color: '#FFFFFF',
    fontSize: moderateScale(18),
    fontWeight: '800',
  },
  searchResultInfo: {
    flex: 1,
  },
  searchResultName: {
    fontSize: moderateScale(14, 0.3),
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  searchResultLocation: {
    fontSize: moderateScale(12, 0.3),
    fontWeight: '500',
    color: '#64748B',
  },
  searchResultCode: {
    fontSize: moderateScale(11, 0.3),
    fontWeight: '600',
    color: '#2563EB',
    marginTop: 2,
  },
  searchResultArrow: {
    paddingLeft: moderateScale(8),
  },
  arrowText: {
    fontSize: moderateScale(18),
    color: '#2563EB',
    fontWeight: '600',
  },

  // ─── Nearby Schools ───
  nearbyHeader: {
    marginBottom: verticalScale(10),
  },
  nearbyHeaderText: {
    fontSize: moderateScale(14, 0.3),
    fontWeight: '700',
    color: '#0F172A',
  },
  nearbySubtext: {
    fontSize: moderateScale(12, 0.3),
    color: '#64748B',
    fontWeight: '500',
    marginTop: 2,
  },

  // ─── Search States ───
  searchStateContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(24),
  },
  searchStateText: {
    fontSize: moderateScale(13, 0.3),
    color: '#64748B',
    marginTop: verticalScale(8),
    fontWeight: '500',
  },
  searchErrorText: {
    fontSize: moderateScale(13, 0.3),
    color: '#DC2626',
    fontWeight: '600',
  },
  noResultsEmoji: {
    fontSize: moderateScale(32),
    marginBottom: verticalScale(8),
  },
  noResultsText: {
    fontSize: moderateScale(15, 0.3),
    fontWeight: '700',
    color: '#334155',
  },
  noResultsSubtext: {
    fontSize: moderateScale(13, 0.3),
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: verticalScale(4),
    marginBottom: verticalScale(12),
  },
  switchToCodeLink: {
    paddingVertical: moderateScale(8),
    paddingHorizontal: moderateScale(16),
    borderRadius: moderateScale(8),
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  switchToCodeText: {
    fontSize: moderateScale(13, 0.3),
    fontWeight: '600',
    color: '#2563EB',
  },

  // ─── Search Hints ───
  searchHintContainer: {
    alignItems: 'center',
    paddingVertical: verticalScale(20),
  },
  searchHintEmoji: {
    fontSize: moderateScale(28),
    marginBottom: verticalScale(8),
  },
  searchHintText: {
    fontSize: moderateScale(14, 0.3),
    fontWeight: '600',
    color: '#475569',
  },
  searchHintSubtext: {
    fontSize: moderateScale(12, 0.3),
    color: '#94A3B8',
    fontWeight: '500',
    marginTop: verticalScale(4),
    fontStyle: 'italic',
  },

  // ─── Selecting Overlay ───
  selectingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: moderateScale(14),
    borderRadius: moderateScale(12),
    marginTop: verticalScale(8),
    gap: 10,
  },
  selectingText: {
    color: '#FFFFFF',
    fontSize: moderateScale(14, 0.3),
    fontWeight: '700',
  },

  // ─── Existing Code Entry Styles ───
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