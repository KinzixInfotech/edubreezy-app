// import React, { useState, useEffect, useRef } from 'react';
// import {
//     View,
//     Text,
//     TextInput,
//     TouchableOpacity,
//     StyleSheet,
//     Dimensions,
//     Image,
//     KeyboardAvoidingView,
//     Platform,
//     ScrollView,
//     ActivityIndicator,
//     Alert,
//     useWindowDimensions,
//     Keyboard,
// } from 'react-native';
// import { useSafeAreaInsets } from 'react-native-safe-area-context';
// import fetchUser from '../../lib/queries/user';
// import Animated, {
//     useSharedValue,
//     useAnimatedStyle,
//     withTiming,
//     withSequence,
//     withRepeat,
//     withDelay,
//     Easing,
//     interpolate,
//     FadeIn,
//     FadeInDown,
//     FadeInUp,
// } from 'react-native-reanimated';
// import { router } from 'expo-router';
// import * as SecureStore from 'expo-secure-store';
// import { useLocalSearchParams } from 'expo-router';
// import { z } from 'zod';
// import { supabase } from '../../lib/supabase';
// import { StatusBar } from 'expo-status-bar';
// import { saveProfile, saveCurrentSchool, clearCurrentSchool, getCurrentSchool } from '../../lib/profileManager';
// import * as WebBrowser from 'expo-web-browser';
// import { Ionicons } from '@expo/vector-icons';
// import api from '../../lib/api';
// import { LinearGradient } from 'expo-linear-gradient';
// import { getDeviceInfo } from '../../lib/deviceInfo';
// import { queueReviewPromptAfterLogin } from '../../lib/reviewPrompt';
// import * as AppleAuthentication from 'expo-apple-authentication';
// import YoutubePlayer from 'react-native-youtube-iframe';
// import { clearTransientAuthState } from '../../lib/authRedirect';

// const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('screen');
// export const PRIMARY_COLOR = '#0b5cde';

// // Responsive scaling utilities
// const guidelineBaseWidth = 375;
// const guidelineBaseHeight = 812;

// const scale = (size) => (SCREEN_WIDTH / guidelineBaseWidth) * size;
// const verticalScale = (size) => (SCREEN_HEIGHT / guidelineBaseHeight) * size;
// const moderateScale = (size, factor = 0.5) => size + (scale(size) - size) * factor;

// const isTablet = SCREEN_WIDTH >= 768;
// const isSmallPhone = SCREEN_WIDTH < 375;

// const responsive = (small, normal, tablet) => {
//     if (isTablet) return tablet;
//     if (isSmallPhone) return small;
//     return normal;
// };

// // Animated Background Component
// const AnimatedBackground = () => {
//     const progress1 = useSharedValue(0);
//     const progress2 = useSharedValue(0);
//     const progress3 = useSharedValue(0);
//     const progress4 = useSharedValue(0);

//     useEffect(() => {
//         const easing = Easing.inOut(Easing.sin);
//         progress1.value = withRepeat(withTiming(1, { duration: 8000, easing }), -1, true);
//         progress2.value = withDelay(1000, withRepeat(withTiming(1, { duration: 10000, easing }), -1, true));
//         progress3.value = withDelay(2000, withRepeat(withTiming(1, { duration: 12000, easing }), -1, true));
//         progress4.value = withDelay(500, withRepeat(withTiming(1, { duration: 9000, easing }), -1, true));
//     }, []);

//     const orb1Style = useAnimatedStyle(() => ({
//         transform: [
//             { translateX: interpolate(progress1.value, [0, 1], [-30, 40]) },
//             { translateY: interpolate(progress1.value, [0, 1], [0, 50]) },
//             { scale: interpolate(progress1.value, [0, 0.5, 1], [1, 1.15, 1]) },
//         ],
//         opacity: interpolate(progress1.value, [0, 0.5, 1], [0.4, 0.6, 0.4]),
//     }));

//     const orb2Style = useAnimatedStyle(() => ({
//         transform: [
//             { translateX: interpolate(progress2.value, [0, 1], [30, -50]) },
//             { translateY: interpolate(progress2.value, [0, 1], [-20, 40]) },
//             { scale: interpolate(progress2.value, [0, 0.5, 1], [1, 1.2, 1]) },
//         ],
//         opacity: interpolate(progress2.value, [0, 0.5, 1], [0.3, 0.5, 0.3]),
//     }));

//     const orb3Style = useAnimatedStyle(() => ({
//         transform: [
//             { translateX: interpolate(progress3.value, [0, 1], [20, -30]) },
//             { translateY: interpolate(progress3.value, [0, 1], [30, -20]) },
//             { scale: interpolate(progress3.value, [0, 0.5, 1], [1, 1.1, 1]) },
//         ],
//         opacity: interpolate(progress3.value, [0, 0.5, 1], [0.25, 0.45, 0.25]),
//     }));

//     const orb4Style = useAnimatedStyle(() => ({
//         transform: [
//             { translateX: interpolate(progress4.value, [0, 1], [-20, 35]) },
//             { translateY: interpolate(progress4.value, [0, 1], [10, -40]) },
//             { scale: interpolate(progress4.value, [0, 0.5, 1], [1, 1.18, 1]) },
//         ],
//         opacity: interpolate(progress4.value, [0, 0.5, 1], [0.3, 0.55, 0.3]),
//     }));

//     return (
//         <View style={StyleSheet.absoluteFill} pointerEvents="none">
//             <Animated.View style={[styles.bgOrb, styles.bgOrb1, orb1Style]} />
//             <Animated.View style={[styles.bgOrb, styles.bgOrb2, orb2Style]} />
//             <Animated.View style={[styles.bgOrb, styles.bgOrb3, orb3Style]} />
//             <Animated.View style={[styles.bgOrb, styles.bgOrb4, orb4Style]} />
//         </View>
//     );
// };

// // Zod validation schemas
// const LoginSchema = z.object({
//     email: z
//         .string()
//         .min(1, 'Email is required')
//         .email('Please enter a valid email address'),
//     password: z
//         .string()
//         .min(6, 'Password must be at least 6 characters')
//         .max(50, 'Password is too long'),
// });

// // --- SCHOOL HERO CARD ---
// // Shows: cover image (if any) + YouTube embed (if any), then school identity below.
// // If neither cover nor video → no media block shown.
// const SchoolHeroCard = ({ schoolData, onSwitchSchool }) => {
//     if (!schoolData) return null;

//     const {
//         name,
//         profilePicture,
//         schoolCode,
//         city,
//         state,
//         publicProfile,
//     } = schoolData;

//     const tagline = publicProfile?.tagline || null;
//     // Location string
//     const locationParts = [city, state].filter(Boolean);
//     const locationStr = locationParts.length > 0 ? locationParts.join(', ') : null;

//     return (
//         <Animated.View
//             entering={FadeInDown.delay(150).duration(600).springify()}
//             style={styles.heroCard}
//         >
//             {/* Media Section: cover image backdrop + optional YouTube embed */}


//             {/* Identity Row */}
//             <View style={styles.heroIdentityRow}>
//                 {/* Logo */}
//                 <View style={styles.heroLogoWrapper}>
//                     {profilePicture ? (
//                         <Image
//                             source={{ uri: profilePicture }}
//                             style={styles.heroLogo}
//                             resizeMode="cover"
//                         />
//                     ) : (
//                         <View style={styles.heroLogoFallback}>
//                             <Text style={styles.heroLogoFallbackText}>
//                                 {name?.charAt(0)?.toUpperCase() || 'S'}
//                             </Text>
//                         </View>
//                     )}
//                 </View>

//                 {/* Name + tagline + meta */}
//                 <View style={styles.heroTextBlock}>
//                     <Text style={styles.heroSchoolName} numberOfLines={2}>
//                         {name || 'School'}
//                     </Text>

//                     {tagline && (
//                         <Text style={styles.heroTagline} numberOfLines={2}>
//                             {tagline}
//                         </Text>
//                     )}

//                     <View style={styles.heroMetaRow}>
//                         {locationStr && (
//                             <View style={styles.heroMetaChip}>
//                                 <Ionicons name="location-outline" size={11} color="#64748B" />
//                                 <Text style={styles.heroMetaChipText}>{locationStr}</Text>
//                             </View>
//                         )}
//                         {/* Show code chip only if no media (already shown as badge) */}
//                         {/* {schoolCode && !hasMedia && (
//                             <View style={[styles.heroMetaChip, styles.heroCodeChip]}>
//                                 <Ionicons name="school-outline" size={11} color={PRIMARY_COLOR} />
//                                 <Text style={[styles.heroMetaChipText, { color: PRIMARY_COLOR }]}>{schoolCode}</Text>
//                             </View>
//                         )} */}
//                     </View>
//                 </View>

//                 {/* Switch button */}
//                 <TouchableOpacity
//                     onPress={onSwitchSchool}
//                     style={styles.heroSwitchBtn}
//                     activeOpacity={0.7}
//                     hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
//                 >
//                     <Ionicons name="swap-horizontal-outline" size={16} color={PRIMARY_COLOR} />
//                     <Text style={styles.heroSwitchText}>Switch</Text>
//                 </TouchableOpacity>
//             </View>
//         </Animated.View>
//     );
// };

// // Roles that are blocked from the mobile app
// const BLOCKED_MOBILE_ROLES = ['ADMIN', 'LIBRARIAN', 'SUPER_ADMIN'];

// // Role accent colors for the scrollable selector
// const ROLE_ACCENT_COLORS = {
//     parent: '#0469ff',
//     student: '#10B981',
//     teacher: '#8B5CF6',
//     driver: '#F59E0B',
//     conductor: '#06B6D4',
//     accountant: '#84CC16',
//     director: '#7C3AED',
//     principal: '#DC2626',
// };

// const LOGIN_ROLE_OPTIONS = [
//     {
//         key: 'parent',
//         label: 'Parent',
//         helper: 'Use your mobile number',
//         placeholder: '10-digit mobile number',
//         icon: 'call-outline',
//         keyboardType: 'phone-pad',
//     },
//     {
//         key: 'student',
//         label: 'Student',
//         helper: 'Use your Student ID',
//         placeholder: 'Enter Student ID',
//         icon: 'school-outline',
//         keyboardType: 'default',
//     },
//     {
//         key: 'teacher',
//         label: 'Teacher',
//         helper: 'Use your school email',
//         placeholder: 'Enter email address',
//         icon: 'mail-outline',
//         keyboardType: 'email-address',
//     },
//     {
//         key: 'driver',
//         label: 'Driver',
//         helper: 'Use your work email',
//         placeholder: 'Enter email address',
//         icon: 'bus-outline',
//         keyboardType: 'email-address',
//     },
//     {
//         key: 'conductor',
//         label: 'Conductor',
//         helper: 'Use your work email',
//         placeholder: 'Enter email address',
//         icon: 'ticket-outline',
//         keyboardType: 'email-address',
//     },
//     {
//         key: 'accountant',
//         label: 'Accountant',
//         helper: 'Use your work email',
//         placeholder: 'Enter email address',
//         icon: 'calculator-outline',
//         keyboardType: 'email-address',
//     },
//     {
//         key: 'director',
//         label: 'Director',
//         helper: 'Use your work email',
//         placeholder: 'Enter email address',
//         icon: 'briefcase-outline',
//         keyboardType: 'email-address',
//     },
//     {
//         key: 'principal',
//         label: 'Principal',
//         helper: 'Use your work email',
//         placeholder: 'Enter email address',
//         icon: 'ribbon-outline',
//         keyboardType: 'email-address',
//     },
// ];

// export default function LoginScreen() {
//     const insets = useSafeAreaInsets();
//     const passwordRef = useRef(null);
//     const scrollViewRef = useRef(null);
//     const { schoolConfig: schoolConfigParam, prefillEmail, selectedRole: selectedRoleParam } = useLocalSearchParams();
//     const [schoolConfig, setSchoolConfig] = useState(null);
//     const [resolvedSchoolConfigParam, setResolvedSchoolConfigParam] = useState(
//         typeof schoolConfigParam === 'string' ? schoolConfigParam : null
//     );
//     const [selectedRole, setSelectedRole] = useState(selectedRoleParam || 'parent');
//     const [credential, setCredential] = useState(prefillEmail || '');
//     const [password, setPassword] = useState('');
//     const [errors, setErrors] = useState({});
//     const [loading, setLoading] = useState(false);
//     const [showPassword, setShowPassword] = useState(false);
//     const [keyboardVisible, setKeyboardVisible] = useState(false);
//     const [keyboardHeight, setKeyboardHeight] = useState(0);
//     const [googleLoading, setGoogleLoading] = useState(false);
//     const [appleLoading, setAppleLoading] = useState(false);

//     const buttonScale = useSharedValue(1);
//     const activeRole = LOGIN_ROLE_OPTIONS.find((option) => option.key === selectedRole) || LOGIN_ROLE_OPTIONS[0];
//     const allowSocialLogin = selectedRole === 'teacher';

//     useEffect(() => {
//         const showSub = Keyboard.addListener(
//             Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
//             (e) => {
//                 setKeyboardVisible(true);
//                 setKeyboardHeight(e.endCoordinates.height);
//                 if (Platform.OS === 'android') {
//                     setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
//                 }
//             }
//         );
//         const hideSub = Keyboard.addListener(
//             Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
//             () => {
//                 setKeyboardVisible(false);
//                 setKeyboardHeight(0);
//             }
//         );
//         return () => {
//             showSub.remove();
//             hideSub.remove();
//         };
//     }, []);

//     useEffect(() => {
//         const resolveSchoolContext = async () => {
//             try {
//                 if (typeof schoolConfigParam === 'string' && schoolConfigParam) {
//                     const config = JSON.parse(schoolConfigParam);
//                     setResolvedSchoolConfigParam(schoolConfigParam);
//                     setSchoolConfig(config.school || config);
//                     return;
//                 }

//                 const savedSchool = await getCurrentSchool();
//                 if (savedSchool?.schoolData) {
//                     setResolvedSchoolConfigParam(JSON.stringify(savedSchool.schoolData));
//                     setSchoolConfig(savedSchool.schoolData.school || savedSchool.schoolData);
//                     return;
//                 }

//                 setResolvedSchoolConfigParam(null);
//                 setSchoolConfig(null);
//             } catch (error) {
//                 console.error('Error resolving school config:', error);
//                 setResolvedSchoolConfigParam(null);
//                 setSchoolConfig(null);
//             }
//         };

//         resolveSchoolContext();
//     }, [schoolConfigParam]);

//     const handleForgotPassword = async () => {
//         router.push({
//             pathname: '/(auth)/forgot-password',
//             params: {
//                 prefillCredential: credential.trim(),
//                 ...(resolvedSchoolConfigParam ? { schoolConfig: resolvedSchoolConfigParam } : {}),
//             },
//         });
//     };

//     const handleSwitchSchool = async () => {
//         try {
//             console.log('🔄 Switching schools - clearing all data...');
//             await supabase.auth.signOut();
//             await clearTransientAuthState();
//             await SecureStore.deleteItemAsync('lastSchoolCode');
//             await clearCurrentSchool();
//             console.log('✅ All data cleared - navigating to school code');
//             router.replace('/(auth)/schoolcode');
//         } catch (error) {
//             console.error('Error switching schools:', error);
//             router.replace('/(auth)/schoolcode');
//         }
//     };

//     const validateEmail = (emailValue) => {
//         const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//         return emailRegex.test(emailValue);
//     };

//     const validatePhone = (phoneValue) => {
//         const phoneRegex = /^[6-9]\d{9}$/;
//         return phoneRegex.test(phoneValue);
//     };


//     const handleLogin = async () => {
//         setErrors({});

//         const newErrors = {};
//         const trimmedCredential = credential.trim();

//         if (!trimmedCredential) {
//             newErrors.credential = selectedRole === 'parent'
//                 ? 'Mobile number is required'
//                 : selectedRole === 'student'
//                     ? 'Student ID is required'
//                     : 'Email address is required';
//         } else if (selectedRole === 'parent' && !validatePhone(trimmedCredential)) {
//             newErrors.credential = 'Please enter a valid 10-digit mobile number';
//         } else if (selectedRole !== 'parent' && selectedRole !== 'student' && !validateEmail(trimmedCredential)) {
//             newErrors.credential = 'Please enter a valid email address';
//         }

//         if (!password) {
//             newErrors.password = 'Password is required';
//         } else if (password.length < 6) {
//             newErrors.password = 'Password must be at least 6 characters';
//         } else if (password.length > 50) {
//             newErrors.password = 'Password is too long';
//         }

//         if (Object.keys(newErrors).length > 0) {
//             setErrors(newErrors);
//             buttonScale.value = withSequence(
//                 withTiming(1.03, { duration: 80 }),
//                 withTiming(0.97, { duration: 80 }),
//                 withTiming(1.03, { duration: 80 }),
//                 withTiming(1, { duration: 80 })
//             );
//             return;
//         }

//         try {
//             setLoading(true);
//             await SecureStore.deleteItemAsync('token');

//             buttonScale.value = withSequence(
//                 withTiming(0.95, { duration: 100 }),
//                 withTiming(1, { duration: 100 })
//             );

//             const schoolId = schoolConfig?.id;
//             if (!schoolId) {
//                 setErrors({ general: 'School not configured. Please reopen this school and try again.' });
//                 setLoading(false);
//                 return;
//             }

//             const identifier = selectedRole === 'parent'
//                 ? trimmedCredential.replace(/\D/g, '').slice(0, 10)
//                 : selectedRole === 'student'
//                     ? trimmedCredential.toUpperCase().replace(/\s+/g, '')
//                     : trimmedCredential.toLowerCase();

//             const loginResponse = await api.post('/auth/password-login', {
//                 schoolId,
//                 role: selectedRole,
//                 identifier,
//                 password,
//             });
//             const loginData = loginResponse.data;

//             if (!loginData?.session?.access_token || !loginData?.session?.refresh_token || !loginData?.userId) {
//                 setErrors({ general: 'Authentication failed. Please try again.' });
//                 return;
//             }

//             const { error: sessionError } = await supabase.auth.setSession({
//                 access_token: loginData.session.access_token,
//                 refresh_token: loginData.session.refresh_token,
//             });
//             if (sessionError) {
//                 setErrors({ general: sessionError.message || 'Unable to restore your session.' });
//                 return;
//             }

//             const user = await fetchUser(loginData.userId, loginData.session.access_token);

//             if (!user) {
//                 await supabase.auth.signOut();
//                 setErrors({ general: 'User not found in system' });
//                 return;
//             }

//             if (BLOCKED_MOBILE_ROLES.includes(user.role?.name)) {
//                 await supabase.auth.signOut();
//                 Alert.alert(
//                     'Web Only',
//                     `${user.role?.name === 'ADMIN' ? 'Admin' : user.role?.name === 'LIBRARIAN' ? 'Librarian' : 'Super Admin'} accounts can only access the web dashboard at atlas.edubreezy.com.`,
//                     [{ text: 'OK' }]
//                 );
//                 setLoading(false);
//                 return;
//             }

//             const minimalUser = {
//                 id: user.id,
//                 email: user.email,
//                 name: user.name,
//                 profilePicture: user.profilePicture,
//                 role: user.role,
//                 schoolId: user.schoolId,
//                 loginIdentifier: user.loginIdentifier,
//                 loginRole: user.loginRole,
//                 ...(user.studentData && {
//                     studentData: {
//                         name: user.studentData.name,
//                         email: user.studentData.email,
//                         admissionNo: user.studentData.admissionNo,
//                         class: user.studentData.class || null,
//                         section: user.studentData.section || null,
//                     },
//                 }),
//                 ...(user.parentData && {
//                     parentData: {
//                         id: user.parentData.id,
//                         name: user.parentData.name,
//                         email: user.parentData.email,
//                     },
//                 }),
//                 ...(user.teacherData && {
//                     teacherData: {
//                         name: user.teacherData.name,
//                         email: user.teacherData.email,
//                     },
//                 }),
//                 ...(user.school && {
//                     school: {
//                         id: user.school.id,
//                         name: user.school.name,
//                         schoolCode: user.school.schoolCode,
//                     },
//                 }),
//             };
//             await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
//             await SecureStore.setItemAsync('userRole', user?.role?.name || '');
//             await SecureStore.setItemAsync('token', loginData.session.access_token);

//             const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
//             if (schoolCode) {
//                 try {
//                     await saveProfile(schoolCode, user, loginData.session);
//                     await saveCurrentSchool(schoolCode, { school: schoolConfig });
//                 } catch (saveError) {
//                     console.error('Failed to save profile:', saveError);
//                 }
//             }

//             try {
//                 const deviceInfo = await getDeviceInfo();
//                 const sessionRes = await api.post('/auth/sessions', {
//                     userId: user.id,
//                     supabaseSessionToken: loginData.session.access_token,
//                     ...deviceInfo,
//                 });
//                 if (sessionRes.data?.session?.id) {
//                     await SecureStore.setItemAsync('currentSessionId', sessionRes.data.session.id);
//                 }
//             } catch (sessionErr) {
//                 console.warn('Could not create session:', sessionErr.message);
//             }

//             await queueReviewPromptAfterLogin();
//             router.replace('/(screens)/greeting');
//         } catch (err) {
//             console.error(err);
//             let message = 'Something went wrong. Please try again.';
//             if (err.response?.status === 404) {
//                 message = 'No account found for this school.';
//             } else if (err.response?.status === 401) {
//                 message = 'Invalid credentials. Please check your password.';
//             } else if (!err.response) {
//                 message = 'Network error. Please check your connection.';
//             }
//             setErrors({ general: message });
//         } finally {
//             setLoading(false);
//         }
//     };

//     const buttonScaleStyle = useAnimatedStyle(() => ({
//         transform: [{ scale: buttonScale.value }],
//     }));

//     const handleGoogleLogin = async () => {
//         try {
//             setGoogleLoading(true);
//             setErrors({});
//             await SecureStore.deleteItemAsync('token');

//             const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
//                 provider: 'google',
//                 options: {
//                     redirectTo: 'edubreezy://(auth)/login',
//                     skipBrowserRedirect: true,
//                 },
//             });

//             if (oauthError) throw oauthError;
//             if (!oauthData?.url) {
//                 setErrors({ general: 'Failed to initiate Google sign-in.' });
//                 return;
//             }

//             const result = await WebBrowser.openAuthSessionAsync(oauthData.url, 'edubreezy://(auth)/login');
//             if (result.type !== 'success' || !result.url) {
//                 setGoogleLoading(false);
//                 return;
//             }

//             const urlFragment = result.url.split('#')[1];
//             if (!urlFragment) {
//                 setErrors({ general: 'Authentication failed. Please try again.' });
//                 return;
//             }

//             const params = new URLSearchParams(urlFragment);
//             const access_token = params.get('access_token');
//             const refresh_token = params.get('refresh_token');

//             if (!access_token || !refresh_token) {
//                 setErrors({ general: 'Authentication failed. Missing tokens.' });
//                 return;
//             }

//             const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
//                 access_token,
//                 refresh_token,
//             });

//             if (sessionError || !sessionData?.user) {
//                 setErrors({ general: sessionError?.message || 'Failed to establish session.' });
//                 return;
//             }

//             const verifyRes = await api.post('/auth/verify-oauth', {
//                 accessToken: access_token,
//                 provider: 'google',
//             });
//             const user = verifyRes.data;

//             if (!user || user.linked === false) {
//                 await supabase.auth.signOut();
//                 setErrors({
//                     general: user?.message ||
//                         'No account found for this Google email. Please contact your school admin.',
//                 });
//                 return;
//             }

//             if (BLOCKED_MOBILE_ROLES.includes(user.role?.name)) {
//                 await supabase.auth.signOut();
//                 Alert.alert('Web Only', `This account can only access the web dashboard.`, [{ text: 'OK' }]);
//                 setGoogleLoading(false);
//                 return;
//             }

//             const minimalUser = {
//                 id: user.id,
//                 email: user.email,
//                 name: user.name,
//                 profilePicture: user.profilePicture,
//                 role: user.role,
//                 schoolId: user.schoolId,
//                 ...(user.studentData && {
//                     studentData: {
//                         name: user.studentData.name,
//                         email: user.studentData.email,
//                         admissionNo: user.studentData.admissionNo,
//                         class: user.studentData.class || null,
//                         section: user.studentData.section || null,
//                     },
//                 }),
//                 ...(user.parentData && {
//                     parentData: { id: user.parentData.id, name: user.parentData.name, email: user.parentData.email },
//                 }),
//                 ...(user.teacherData && {
//                     teacherData: { name: user.teacherData.name, email: user.teacherData.email },
//                 }),
//                 ...(user.school && {
//                     school: { id: user.school.id, name: user.school.name, schoolCode: user.school.schoolCode },
//                 }),
//             };
//             await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
//             await SecureStore.setItemAsync('userRole', user?.role?.name || '');
//             await SecureStore.setItemAsync('token', access_token);

//             const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
//             if (schoolCode) {
//                 try {
//                     await saveProfile(schoolCode, user, sessionData.session);
//                     await saveCurrentSchool(schoolCode, { school: schoolConfig });
//                 } catch (saveError) {
//                     console.error('❌ Failed to save profile:', saveError);
//                 }
//             }

//             try {
//                 const deviceInfo = await getDeviceInfo();
//                 const sessionRes = await api.post('/auth/sessions', {
//                     userId: user.id,
//                     supabaseSessionToken: access_token,
//                     ...deviceInfo,
//                 });
//                 if (sessionRes.data?.session?.id) {
//                     await SecureStore.setItemAsync('currentSessionId', sessionRes.data.session.id);
//                 }
//             } catch (sessionErr) {
//                 console.warn('Could not create session:', sessionErr.message);
//             }

//             await queueReviewPromptAfterLogin();

//             router.replace('/(screens)/greeting');
//         } catch (err) {
//             console.error(err);
//             let message = 'Something went wrong. Please try again.';
//             if (err.response?.status === 404) message = 'This account is not linked to any school account.';
//             else if (err.response?.status === 401) message = 'Session expired. Please login again.';
//             else if (!err.response) message = 'Network error. Please check your connection.';
//             setErrors({ general: message });
//         } finally {
//             setGoogleLoading(false);
//         }
//     };

//     const handleAppleLogin = async () => {
//         const cleanupAppleIdentity = async () => {
//             try {
//                 const { data, error } = await supabase.auth.getUserIdentities();
//                 if (error) throw error;
//                 const appleIdentity = data?.identities?.find((identity) => identity.provider === 'apple');
//                 if (appleIdentity) {
//                     const { error: unlinkError } = await supabase.auth.unlinkIdentity(appleIdentity);
//                     if (unlinkError) throw unlinkError;
//                 }
//             } catch (cleanupError) {
//                 console.warn('Failed to unlink Apple identity:', cleanupError?.message || cleanupError);
//             } finally {
//                 await supabase.auth.signOut();
//             }
//         };

//         try {
//             setAppleLoading(true);
//             setErrors({});
//             await SecureStore.deleteItemAsync('token');

//             const appleAvailable = await AppleAuthentication.isAvailableAsync();
//             if (!appleAvailable) {
//                 setErrors({ general: 'Apple sign-in is not available on this device.' });
//                 return;
//             }

//             const credential = await AppleAuthentication.signInAsync({
//                 requestedScopes: [
//                     AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
//                     AppleAuthentication.AppleAuthenticationScope.EMAIL,
//                 ],
//             });

//             const identityToken = credential?.identityToken;
//             if (!identityToken) {
//                 setErrors({ general: 'Authentication failed. Apple did not return an identity token.' });
//                 return;
//             }

//             const { data: sessionData, error: sessionError } = await supabase.auth.signInWithIdToken({
//                 provider: 'apple',
//                 token: identityToken,
//             });

//             if (sessionError || !sessionData?.user) {
//                 setErrors({ general: sessionError?.message || 'Failed to establish session.' });
//                 return;
//             }

//             const access_token = sessionData.session?.access_token;
//             if (!access_token) {
//                 setErrors({ general: 'Failed to establish session.' });
//                 return;
//             }

//             const verifyRes = await api.post('/auth/verify-oauth', {
//                 accessToken: access_token,
//                 provider: 'apple',
//             });
//             const user = verifyRes.data;

//             if (!user || user.linked === false) {
//                 await cleanupAppleIdentity();
//                 setErrors({
//                     general: user?.message ||
//                         'No account found for this Apple ID. Please contact your school admin.',
//                 });
//                 return;
//             }

//             if (BLOCKED_MOBILE_ROLES.includes(user.role?.name)) {
//                 await cleanupAppleIdentity();
//                 Alert.alert('Web Only', `This account can only access the web dashboard.`, [{ text: 'OK' }]);
//                 setAppleLoading(false);
//                 return;
//             }

//             const minimalUser = {
//                 id: user.id,
//                 email: user.email,
//                 name: user.name,
//                 profilePicture: user.profilePicture,
//                 role: user.role,
//                 schoolId: user.schoolId,
//                 ...(user.studentData && {
//                     studentData: {
//                         name: user.studentData.name,
//                         email: user.studentData.email,
//                         admissionNo: user.studentData.admissionNo,
//                         class: user.studentData.class || null,
//                         section: user.studentData.section || null,
//                     },
//                 }),
//                 ...(user.parentData && {
//                     parentData: { id: user.parentData.id, name: user.parentData.name, email: user.parentData.email },
//                 }),
//                 ...(user.teacherData && {
//                     teacherData: { name: user.teacherData.name, email: user.teacherData.email },
//                 }),
//                 ...(user.school && {
//                     school: { id: user.school.id, name: user.school.name, schoolCode: user.school.schoolCode },
//                 }),
//             };
//             await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
//             await SecureStore.setItemAsync('userRole', user?.role?.name || '');
//             await SecureStore.setItemAsync('token', access_token);

//             const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
//             if (schoolCode) {
//                 try {
//                     await saveProfile(schoolCode, user, sessionData.session);
//                     await saveCurrentSchool(schoolCode, { school: schoolConfig });
//                 } catch (saveError) {
//                     console.error('❌ Failed to save profile:', saveError);
//                 }
//             }

//             try {
//                 const deviceInfo = await getDeviceInfo();
//                 const sessionRes = await api.post('/auth/sessions', {
//                     userId: user.id,
//                     supabaseSessionToken: access_token,
//                     ...deviceInfo,
//                 });
//                 if (sessionRes.data?.session?.id) {
//                     await SecureStore.setItemAsync('currentSessionId', sessionRes.data.session.id);
//                 }
//             } catch (sessionErr) {
//                 console.warn('Could not create session:', sessionErr.message);
//             }

//             await queueReviewPromptAfterLogin();

//             router.replace('/(screens)/greeting');
//         } catch (err) {
//             console.error(err);
//             let message = 'Something went wrong. Please try again.';
//             if (err.response?.status === 404) message = 'This account is not linked to any school account.';
//             else if (err.response?.status === 401) message = 'Session expired. Please login again.';
//             else if (!err.response) message = 'Network error. Please check your connection.';
//             setErrors({ general: message || 'Apple Sign In Failed' });
//         } finally {
//             setAppleLoading(false);
//         }
//     };

//     return (
//         <KeyboardAvoidingView
//             style={styles.container}
//             behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
//             keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
//         >
//             <StatusBar style="dark" />
//             <AnimatedBackground />

//             <ScrollView
//                 ref={scrollViewRef}
//                 contentContainerStyle={{ flexGrow: 1 }}
//                 showsVerticalScrollIndicator={false}
//                 keyboardShouldPersistTaps="handled"
//                 keyboardDismissMode="interactive"
//                 bounces={false}
//                 style={{ flex: 1 }}
//                 automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
//             >
//                 <View style={[styles.loginScreenWrapper, { paddingTop: insets.top + verticalScale(20), paddingBottom: Math.max(insets.bottom, 20) }]}>


//                     {/* Form Section */}
//                     <Animated.View
//                         entering={FadeInDown.delay(200).duration(500)}
//                         style={styles.loginFormSection}
//                     >
//                         {/* School Hero Card — replaces old compact card */}
//                         {schoolConfig && (
//                             <SchoolHeroCard
//                                 schoolData={schoolConfig}
//                                 onSwitchSchool={handleSwitchSchool}
//                             />
//                         )}
//                         {/* Header */}
//                         <Animated.View
//                             entering={FadeInDown.delay(100).duration(500)}
//                             style={styles.loginHeader}
//                         >
//                             <Text style={styles.signInTitle}>Login to Continue</Text>
//                             <Text style={styles.signInSubtitle}>Sign in with your school-issued credential.</Text>
//                         </Animated.View>

//                         {/* General Error */}
//                         {errors.general && (
//                             <Animated.View
//                                 entering={FadeIn.duration(300)}
//                                 style={styles.generalError}
//                             >
//                                 <Ionicons name="alert-circle" size={20} color="#DC2626" />
//                                 <Text style={styles.generalErrorText}>{errors.general}</Text>
//                             </Animated.View>
//                         )}

//                         {/* Role Badge (pre-selected from role-selector screen) */}
//                         <TouchableOpacity
//                             style={[
//                                 styles.roleHintCard,
//                                 { borderColor: (ROLE_ACCENT_COLORS[selectedRole] || PRIMARY_COLOR) + '30' },
//                             ]}
//                             activeOpacity={0.7}
//                             onPress={() => {
//                                 if (router.canGoBack()) router.back();
//                             }}
//                         >
//                             <View style={[
//                                 styles.roleHintIconWrap,
//                                 { backgroundColor: (ROLE_ACCENT_COLORS[selectedRole] || PRIMARY_COLOR) + '15' },
//                             ]}>
//                                 <Ionicons
//                                     name={activeRole.icon}
//                                     size={16}
//                                     color={ROLE_ACCENT_COLORS[selectedRole] || PRIMARY_COLOR}
//                                 />
//                             </View>
//                             <View style={{ flex: 1 }}>
//                                 <Text style={[styles.roleHintText, { color: ROLE_ACCENT_COLORS[selectedRole] || PRIMARY_COLOR }]}>
//                                     Logging in as {activeRole.label}
//                                 </Text>
//                                 <Text style={{ fontSize: moderateScale(11, 0.3), color: '#94A3B8', fontWeight: '500', marginTop: 1 }}>
//                                     {activeRole.helper}
//                                 </Text>
//                             </View>
//                             <View style={styles.roleChangeBtn}>
//                                 <Ionicons name="swap-horizontal-outline" size={14} color={ROLE_ACCENT_COLORS[selectedRole] || PRIMARY_COLOR} />
//                                 <Text style={[styles.roleChangeBtnText, { color: ROLE_ACCENT_COLORS[selectedRole] || PRIMARY_COLOR }]}>Change</Text>
//                             </View>
//                         </TouchableOpacity>

//                         {/* Credential Input */}
//                         <View style={styles.inputGroup}>
//                             <Text style={styles.inputLabel}>
//                                 {selectedRole === 'parent'
//                                     ? 'Mobile Number'
//                                     : selectedRole === 'student'
//                                         ? 'Student ID'
//                                         : 'Email Address'}
//                             </Text>
//                             <View
//                                 style={[
//                                     styles.inputWrapper,
//                                     (errors.credential || errors.email) && styles.inputWrapperError,
//                                 ]}
//                             >
//                                 <Ionicons
//                                     name={activeRole.icon}
//                                     size={20}
//                                     color={(errors.credential || errors.email) ? '#DC2626' : '#94A3B8'}
//                                     style={styles.inputIcon}
//                                 />
//                                 <TextInput
//                                     style={styles.input}
//                                     placeholder={activeRole.placeholder}
//                                     placeholderTextColor="#94A3B8"
//                                     value={credential}
//                                     onChangeText={(text) => {
//                                         setCredential(selectedRole === 'parent' ? text.replace(/\D/g, '').slice(0, 10) : text);
//                                         if (errors.credential || errors.email) {
//                                             setErrors({ ...errors, credential: null, email: null, general: null });
//                                         }
//                                     }}
//                                     keyboardType={activeRole.keyboardType}
//                                     autoCapitalize={selectedRole === 'student' ? 'characters' : 'none'}
//                                     autoCorrect={false}
//                                     returnKeyType="next"
//                                     onSubmitEditing={() => passwordRef.current?.focus()}
//                                     blurOnSubmit={false}
//                                 />
//                                 {credential.length > 0 && (
//                                     <Ionicons name="checkmark-circle" size={20} color="#22C55E" />
//                                 )}
//                             </View>
//                             {(errors.credential || errors.email) && (
//                                 <Animated.Text entering={FadeIn.duration(200)} style={styles.errorText}>
//                                     {errors.credential || errors.email}
//                                 </Animated.Text>
//                             )}
//                             <Text style={styles.fieldHelperText}>
//                                 {selectedRole === 'parent'
//                                     ? 'Use your registered mobile number.'
//                                     : selectedRole === 'student'
//                                         ? 'Use your Student ID. Ask the school if you are unsure.'
//                                         : 'Use your school email address.'}
//                             </Text>
//                         </View>

//                         {/* Password Input */}
//                         <View style={styles.inputGroup}>
//                             <Text style={styles.inputLabel}>Password</Text>
//                             <View
//                                 style={[
//                                     styles.inputWrapper,
//                                     errors.password && styles.inputWrapperError,
//                                 ]}
//                             >
//                                 <Ionicons
//                                     name="lock-closed-outline"
//                                     size={20}
//                                     color={errors.password ? '#DC2626' : '#94A3B8'}
//                                     style={styles.inputIcon}
//                                 />
//                                 <TextInput
//                                     ref={passwordRef}
//                                     style={styles.input}
//                                     placeholder="Enter your password"
//                                     placeholderTextColor="#94A3B8"
//                                     value={password}
//                                     onChangeText={(text) => {
//                                         setPassword(text);
//                                         if (errors.password) {
//                                             setErrors({ ...errors, password: null, general: null });
//                                         }
//                                     }}
//                                     secureTextEntry={!showPassword}
//                                     autoCapitalize="none"
//                                     autoCorrect={false}
//                                     returnKeyType="done"
//                                     onSubmitEditing={handleLogin}
//                                 />
//                                 <TouchableOpacity
//                                     onPress={() => setShowPassword(!showPassword)}
//                                     style={styles.eyeButton}
//                                     hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
//                                 >
//                                     <Ionicons
//                                         name={showPassword ? 'eye-off-outline' : 'eye-outline'}
//                                         size={22}
//                                         color="#94A3B8"
//                                     />
//                                 </TouchableOpacity>
//                             </View>
//                             {errors.password && (
//                                 <Animated.Text entering={FadeIn.duration(200)} style={styles.errorText}>
//                                     {errors.password}
//                                 </Animated.Text>
//                             )}
//                         </View>

//                         {/* Forgot Password */}
//                         <TouchableOpacity
//                             onPress={handleForgotPassword}
//                             style={styles.forgotPassword}
//                             activeOpacity={0.7}
//                         >
//                             <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
//                         </TouchableOpacity>

//                         {/* Login Button */}
//                         <Animated.View style={[buttonScaleStyle, { marginTop: verticalScale(8) }]}>
//                             <TouchableOpacity
//                                 style={[styles.loginButton, loading && styles.loginButtonDisabled]}
//                                 onPress={handleLogin}
//                                 disabled={loading}
//                                 activeOpacity={0.85}
//                             >
//                                 {loading ? (
//                                     <View style={styles.loadingContainer}>
//                                         <ActivityIndicator size="small" color="#FFFFFF" />
//                                         <Text style={styles.loginButtonText}>Signing in...</Text>
//                                     </View>
//                                 ) : (
//                                     <View style={styles.loginButtonContent}>
//                                         <Text style={styles.loginButtonText}>Log In</Text>
//                                         <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
//                                     </View>
//                                 )}
//                             </TouchableOpacity>
//                         </Animated.View>

//                         {allowSocialLogin && (
//                             <Animated.View
//                                 entering={FadeInDown.delay(350).duration(500)}
//                                 style={styles.orDivider}
//                             >
//                                 <View style={styles.orDividerLine} />
//                                 <Text style={styles.orDividerText}>OR</Text>
//                                 <View style={styles.orDividerLine} />
//                             </Animated.View>
//                         )}

//                         {allowSocialLogin && (
//                             <Animated.View entering={FadeInDown.delay(400).duration(500)}>
//                                 <TouchableOpacity
//                                     style={[styles.googleButton, googleLoading && styles.googleButtonDisabled]}
//                                     onPress={handleGoogleLogin}
//                                     disabled={googleLoading || loading}
//                                     activeOpacity={0.85}
//                                 >
//                                     {googleLoading ? (
//                                         <View style={styles.loadingContainer}>
//                                             <ActivityIndicator size="small" color="#374151" />
//                                             <Text style={styles.googleButtonText}>Signing in...</Text>
//                                         </View>
//                                     ) : (
//                                         <View style={styles.googleButtonContent}>
//                                             <Image
//                                                 source={require('../../assets/google.png')}
//                                                 style={{ width: 20, height: 20 }}
//                                             />
//                                             <Text style={styles.googleButtonText}>Continue with Google</Text>
//                                         </View>
//                                     )}
//                                 </TouchableOpacity>
//                             </Animated.View>
//                         )}

//                         {allowSocialLogin && Platform.OS === 'ios' && (
//                             <Animated.View entering={FadeInDown.delay(450).duration(500)} style={{ marginTop: verticalScale(10) }}>
//                                 <TouchableOpacity
//                                     style={[styles.appleButton, appleLoading && styles.appleButtonDisabled]}
//                                     onPress={handleAppleLogin}
//                                     disabled={appleLoading || loading}
//                                     activeOpacity={0.85}
//                                 >
//                                     {appleLoading ? (
//                                         <View style={styles.loadingContainer}>
//                                             <ActivityIndicator size="small" color="#FFFFFF" />
//                                             <Text style={styles.appleButtonText}>Signing in...</Text>
//                                         </View>
//                                     ) : (
//                                         <View style={styles.googleButtonContent}>
//                                             <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
//                                             <Text style={styles.appleButtonText}>Continue with Apple</Text>
//                                         </View>
//                                     )}
//                                 </TouchableOpacity>
//                             </Animated.View>
//                         )}
//                     </Animated.View>
//                 </View>
//             </ScrollView>
//         </KeyboardAvoidingView>
//     );
// }

// const styles = StyleSheet.create({
//     container: {
//         flex: 1,
//         backgroundColor: '#FFFFFF',
//     },

//     // --- Animated background orbs (unchanged) ---
//     bgOrb: {
//         position: 'absolute',
//         borderRadius: 999,
//     },
//     bgOrb1: {
//         width: SCREEN_WIDTH * 0.65,
//         height: SCREEN_WIDTH * 0.65,
//         backgroundColor: 'rgba(59, 130, 246, 0.12)',
//         top: SCREEN_HEIGHT * 0.05,
//         left: -SCREEN_WIDTH * 0.15,
//     },
//     bgOrb2: {
//         width: SCREEN_WIDTH * 0.55,
//         height: SCREEN_WIDTH * 0.55,
//         backgroundColor: 'rgba(99, 102, 241, 0.10)',
//         top: SCREEN_HEIGHT * 0.12,
//         right: -SCREEN_WIDTH * 0.1,
//     },
//     bgOrb3: {
//         width: SCREEN_WIDTH * 0.5,
//         height: SCREEN_WIDTH * 0.5,
//         backgroundColor: 'rgba(139, 92, 246, 0.08)',
//         bottom: SCREEN_HEIGHT * 0.15,
//         left: -SCREEN_WIDTH * 0.05,
//     },
//     bgOrb4: {
//         width: SCREEN_WIDTH * 0.45,
//         height: SCREEN_WIDTH * 0.45,
//         backgroundColor: 'rgba(14, 165, 233, 0.09)',
//         bottom: SCREEN_HEIGHT * 0.3,
//         right: SCREEN_WIDTH * 0.05,
//     },

//     // --- Layout ---
//     loginScreenWrapper: {
//         flexGrow: 1,
//         justifyContent: 'center',
//         paddingHorizontal: moderateScale(24),
//     },
//     loginHeader: {
//         // alignItems: 'center',
//         marginBottom: verticalScale(20),
//     },
//     signInTitle: {
//         fontSize: moderateScale(32, 0.4),
//         fontWeight: '800',
//         color: '#0F172A',
//         letterSpacing: -0.8,
//         marginBottom: verticalScale(6),
//     },
//     signInSubtitle: {
//         fontSize: moderateScale(14, 0.3),
//         fontWeight: '400',
//         color: '#64748B',
//         letterSpacing: 0.1,
//     },
//     loginFormSection: {
//         width: '100%',
//         maxWidth: isTablet ? 460 : '100%',
//         alignSelf: 'center',
//     },

//     // --- School Hero Card ---
//     heroCard: {
//         backgroundColor: '#FFFFFF',
//         borderRadius: moderateScale(16),
//         marginBottom: verticalScale(18),
//         borderWidth: 1,
//         borderColor: '#E2E8F0',
//         overflow: 'hidden',
//         // subtle shadow
//         shadowColor: '#0b5cde',
//         shadowOffset: { width: 0, height: 2 },
//         shadowOpacity: 0.07,
//         shadowRadius: 8,
//         elevation: 3,
//     },

//     // Media block (cover image + optional YouTube)
//     heroMediaContainer: {
//         width: '100%',
//         height: verticalScale(120),
//         backgroundColor: '#EFF6FF',
//         overflow: 'hidden',
//         position: 'relative',
//     },
//     heroCoverImage: {
//         width: '100%',
//         height: '100%',
//         position: 'absolute',
//     },
//     youtubeThumbnailContainer: {
//         ...StyleSheet.absoluteFillObject,
//         backgroundColor: '#000',
//         overflow: 'hidden',
//     },
//     mediaCodeBadge: {
//         position: 'absolute',
//         top: 10,
//         right: 10,
//         backgroundColor: 'rgba(255,255,255,0.92)',
//         borderRadius: 20,
//         paddingHorizontal: 10,
//         paddingVertical: 4,
//         borderWidth: 1,
//         borderColor: 'rgba(11,92,222,0.15)',
//     },
//     mediaCodeBadgeText: {
//         fontSize: moderateScale(11, 0.3),
//         fontWeight: '700',
//         color: PRIMARY_COLOR,
//         letterSpacing: 0.3,
//     },

//     // Identity row (logo + text + switch)
//     heroIdentityRow: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         paddingHorizontal: moderateScale(14),
//         paddingVertical: moderateScale(12),
//         gap: moderateScale(10),
//     },
//     heroLogoWrapper: {
//         width: responsive(46, 52, 60),
//         height: responsive(46, 52, 60),
//         borderRadius: moderateScale(12),
//         overflow: 'hidden',
//         borderWidth: 1.5,
//         borderColor: '#E2E8F0',
//         backgroundColor: '#F1F5F9',
//         flexShrink: 0,
//     },
//     heroLogo: {
//         width: '100%',
//         height: '100%',
//     },
//     heroLogoFallback: {
//         width: '100%',
//         height: '100%',
//         backgroundColor: PRIMARY_COLOR,
//         alignItems: 'center',
//         justifyContent: 'center',
//     },
//     heroLogoFallbackText: {
//         fontSize: moderateScale(20, 0.3),
//         fontWeight: '800',
//         color: '#FFFFFF',
//     },
//     heroTextBlock: {
//         flex: 1,
//         gap: 2,
//     },
//     heroSchoolName: {
//         fontSize: moderateScale(14, 0.3),
//         fontWeight: '800',
//         color: '#1E293B',
//         letterSpacing: -0.2,
//         lineHeight: moderateScale(18, 0.3),
//     },
//     heroTagline: {
//         fontSize: moderateScale(11, 0.3),
//         fontWeight: '500',
//         color: '#64748B',
//         lineHeight: moderateScale(15, 0.3),
//         marginTop: 1,
//     },
//     heroMetaRow: {
//         flexDirection: 'row',
//         flexWrap: 'wrap',
//         gap: 6,
//         marginTop: 5,
//     },
//     heroMetaChip: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 3,
//         backgroundColor: '#F8FAFC',
//         borderRadius: 20,
//         paddingHorizontal: 7,
//         paddingVertical: 3,
//         borderWidth: 1,
//         borderColor: '#E2E8F0',
//     },
//     heroCodeChip: {
//         backgroundColor: '#EFF6FF',
//         borderColor: 'rgba(11,92,222,0.15)',
//     },
//     heroMetaChipText: {
//         fontSize: moderateScale(10, 0.3),
//         fontWeight: '600',
//         color: '#64748B',
//     },
//     heroSwitchBtn: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 4,
//         backgroundColor: '#EFF6FF',
//         borderRadius: 20,
//         paddingHorizontal: 10,
//         paddingVertical: 6,
//         borderWidth: 1,
//         borderColor: 'rgba(11,92,222,0.15)',
//         flexShrink: 0,
//     },
//     heroSwitchText: {
//         fontSize: moderateScale(11, 0.3),
//         fontWeight: '700',
//         color: PRIMARY_COLOR,
//     },

//     // --- Role Badge (pre-selected from role-selector) ---
//     roleHintCard: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 10,
//         borderRadius: 14,
//         backgroundColor: '#F8FAFC',
//         borderWidth: 1,
//         borderColor: '#DBEAFE',
//         paddingHorizontal: 14,
//         paddingVertical: 12,
//         marginBottom: verticalScale(14),
//     },
//     roleHintIconWrap: {
//         width: 34,
//         height: 34,
//         borderRadius: 17,
//         alignItems: 'center',
//         justifyContent: 'center',
//     },
//     roleHintText: {
//         fontSize: moderateScale(13, 0.3),
//         fontWeight: '700',
//         color: '#1D4ED8',
//     },
//     roleChangeBtn: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 4,
//         backgroundColor: 'rgba(255,255,255,0.9)',
//         borderRadius: 20,
//         paddingHorizontal: 10,
//         paddingVertical: 5,
//         borderWidth: 1,
//         borderColor: '#E2E8F0',
//     },
//     roleChangeBtnText: {
//         fontSize: moderateScale(11, 0.3),
//         fontWeight: '700',
//     },
//     fieldHelperText: {
//         marginTop: verticalScale(6),
//         marginLeft: 4,
//         fontSize: moderateScale(12, 0.3),
//         color: '#64748B',
//         fontWeight: '500',
//     },

//     // --- Form elements (unchanged from original) ---
//     generalError: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         backgroundColor: '#FEE2E2',
//         paddingHorizontal: moderateScale(14),
//         paddingVertical: moderateScale(12),
//         borderRadius: moderateScale(12),
//         marginBottom: verticalScale(16),
//         gap: 10,
//         borderWidth: 1,
//         borderColor: '#FECACA',
//     },
//     generalErrorText: {
//         flex: 1,
//         color: '#DC2626',
//         fontSize: moderateScale(13, 0.3),
//         fontWeight: '600',
//     },
//     inputGroup: {
//         marginBottom: verticalScale(14),
//     },
//     inputLabel: {
//         fontSize: moderateScale(13, 0.3),
//         fontWeight: '700',
//         color: '#374151',
//         marginBottom: verticalScale(6),
//         marginLeft: 2,
//     },
//     inputWrapper: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         backgroundColor: '#F9FAFB',
//         borderRadius: moderateScale(12),
//         borderWidth: 1.5,
//         borderColor: '#E5E7EB',
//         paddingHorizontal: moderateScale(14),
//     },
//     inputWrapperError: {
//         borderColor: '#F87171',
//         backgroundColor: '#FEF2F2',
//     },
//     inputIcon: {
//         marginRight: moderateScale(10),
//     },
//     input: {
//         flex: 1,
//         paddingVertical: moderateScale(14),
//         fontSize: moderateScale(15, 0.3),
//         color: '#1F2937',
//         fontWeight: '500',
//     },
//     eyeButton: {
//         padding: 8,
//         marginRight: -8,
//     },
//     errorText: {
//         fontSize: moderateScale(12, 0.3),
//         color: '#DC2626',
//         marginTop: verticalScale(6),
//         marginLeft: 4,
//         fontWeight: '600',
//     },
//     forgotPassword: {
//         alignSelf: 'flex-end',
//         paddingVertical: 6,
//         marginBottom: verticalScale(4),
//     },
//     forgotPasswordText: {
//         fontSize: moderateScale(13, 0.3),
//         fontWeight: '700',
//         color: PRIMARY_COLOR,
//     },
//     loginButton: {
//         backgroundColor: PRIMARY_COLOR,
//         borderRadius: moderateScale(12),
//         paddingVertical: moderateScale(16),
//         alignItems: 'center',
//         justifyContent: 'center',
//     },
//     loginButtonDisabled: {
//         backgroundColor: '#93c5fd',
//     },
//     loadingContainer: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         gap: 10,
//     },
//     loginButtonContent: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         justifyContent: 'center',
//         gap: 8,
//     },
//     loginButtonText: {
//         fontSize: moderateScale(16, 0.3),
//         fontWeight: '800',
//         color: '#FFFFFF',
//         letterSpacing: 0.3,
//     },
//     orDivider: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         marginVertical: verticalScale(16),
//     },
//     orDividerLine: {
//         flex: 1,
//         height: 1,
//         backgroundColor: '#E5E7EB',
//     },
//     orDividerText: {
//         marginHorizontal: moderateScale(14),
//         fontSize: moderateScale(12, 0.3),
//         fontWeight: '700',
//         color: '#9CA3AF',
//         letterSpacing: 0.5,
//     },
//     googleButton: {
//         backgroundColor: '#FFFFFF',
//         borderRadius: moderateScale(12),
//         paddingVertical: moderateScale(14),
//         alignItems: 'center',
//         justifyContent: 'center',
//         borderWidth: 1.5,
//         borderColor: '#E5E7EB',
//     },
//     googleButtonDisabled: {
//         backgroundColor: '#F9FAFB',
//         borderColor: '#E5E7EB',
//     },
//     googleButtonContent: {
//         flexDirection: 'row',
//         alignItems: 'center',
//         justifyContent: 'center',
//         gap: 10,
//     },
//     googleButtonText: {
//         fontSize: moderateScale(15, 0.3),
//         fontWeight: '700',
//         color: '#374151',
//         letterSpacing: 0.2,
//     },
//     appleButton: {
//         backgroundColor: '#000000',
//         borderRadius: moderateScale(12),
//         paddingVertical: moderateScale(14),
//         alignItems: 'center',
//         justifyContent: 'center',
//     },
//     appleButtonDisabled: {
//         backgroundColor: '#4A4A4A',
//     },
//     appleButtonText: {
//         fontSize: moderateScale(15, 0.3),
//         fontWeight: '700',
//         color: '#FFFFFF',
//         letterSpacing: 0.2,
//     },
// });
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
    Alert,
    Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import fetchUser from '../../lib/queries/user';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withSequence,
    withRepeat,
    withDelay,
    Easing,
    interpolate,
    FadeIn,
    FadeInDown,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { StatusBar } from 'expo-status-bar';
import { saveProfile, saveCurrentSchool, clearCurrentSchool, getCurrentSchool } from '../../lib/profileManager';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import api from '../../lib/api';
import { getDeviceInfo } from '../../lib/deviceInfo';
import { queueReviewPromptAfterLogin } from '../../lib/reviewPrompt';
import * as AppleAuthentication from 'expo-apple-authentication';
import { clearTransientAuthState } from '../../lib/authRedirect';

// ─── Screen dimensions & responsive helpers ───────────────────────────────────
const { width: SW, height: SH } = Dimensions.get('screen');

const BASE_W = 375;
const BASE_H = 812;

// True proportional scale — never exceeds 1× on a large phone
const hs = (n) => (SW / BASE_W) * n;           // horizontal scale
const vs = (n) => (SH / BASE_H) * n;           // vertical scale
const ms = (n, f = 0.45) => n + (hs(n) - n) * f; // moderate scale

// Device tier helpers — used for one-off responsive picks
const isTablet = SW >= 768;
const isSmall = SW < 360;   // tiny phones (320–359 px)
const isMedium = SW < 390;   // normal small phones (360–389 px)

// Pick a value based on device tier:  pick(tablet, normal, small)
const pick = (t, n, s) => isTablet ? t : isSmall ? s : n;

// Font scale — base sizes tuned for 375 px; shrinks on smaller devices
const fs = (base) => {
    if (isTablet) return base * 1.08;
    if (isSmall) return base * 0.82;
    if (isMedium) return base * 0.90;
    return base;
};

// Spacing scale — same idea
const sp = (base) => {
    if (isTablet) return base * 1.1;
    if (isSmall) return base * 0.78;
    if (isMedium) return base * 0.88;
    return base;
};

export const PRIMARY_COLOR = '#0b5cde';

// ─── Role / screen config ─────────────────────────────────────────────────────
const BLOCKED_MOBILE_ROLES = ['ADMIN', 'LIBRARIAN', 'SUPER_ADMIN'];

const ROLE_ACCENT_COLORS = {
    parent: '#0469ff',
    student: '#10B981',
    teacher: '#8B5CF6',
    driver: '#F59E0B',
    conductor: '#06B6D4',
    accountant: '#84CC16',
    director: '#7C3AED',
    principal: '#DC2626',
};

const LOGIN_ROLE_OPTIONS = [
    { key: 'parent', label: 'Parent', helper: 'Use your mobile number', placeholder: '10-digit mobile number', icon: 'call-outline', keyboardType: 'phone-pad' },
    { key: 'student', label: 'Student', helper: 'Use your Student ID', placeholder: 'Enter Student ID', icon: 'school-outline', keyboardType: 'default' },
    { key: 'teacher', label: 'Teacher', helper: 'Use your school email', placeholder: 'Enter email address', icon: 'mail-outline', keyboardType: 'email-address' },
    { key: 'driver', label: 'Driver', helper: 'Use your work email', placeholder: 'Enter email address', icon: 'bus-outline', keyboardType: 'email-address' },
    { key: 'conductor', label: 'Conductor', helper: 'Use your work email', placeholder: 'Enter email address', icon: 'ticket-outline', keyboardType: 'email-address' },
    { key: 'accountant', label: 'Accountant', helper: 'Use your work email', placeholder: 'Enter email address', icon: 'calculator-outline', keyboardType: 'email-address' },
    { key: 'director', label: 'Director', helper: 'Use your work email', placeholder: 'Enter email address', icon: 'briefcase-outline', keyboardType: 'email-address' },
    { key: 'principal', label: 'Principal', helper: 'Use your work email', placeholder: 'Enter email address', icon: 'ribbon-outline', keyboardType: 'email-address' },
];

// ─── Animated background orbs ─────────────────────────────────────────────────
const AnimatedBackground = () => {
    const p1 = useSharedValue(0);
    const p2 = useSharedValue(0);
    const p3 = useSharedValue(0);
    const p4 = useSharedValue(0);

    useEffect(() => {
        const ease = Easing.inOut(Easing.sin);
        p1.value = withRepeat(withTiming(1, { duration: 8000, easing: ease }), -1, true);
        p2.value = withDelay(1000, withRepeat(withTiming(1, { duration: 10000, easing: ease }), -1, true));
        p3.value = withDelay(2000, withRepeat(withTiming(1, { duration: 12000, easing: ease }), -1, true));
        p4.value = withDelay(500, withRepeat(withTiming(1, { duration: 9000, easing: ease }), -1, true));
    }, []);

    const a1 = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(p1.value, [0, 1], [-30, 40]) },
            { translateY: interpolate(p1.value, [0, 1], [0, 50]) },
            { scale: interpolate(p1.value, [0, 0.5, 1], [1, 1.15, 1]) },
        ],
        opacity: interpolate(p1.value, [0, 0.5, 1], [0.4, 0.6, 0.4]),
    }));
    const a2 = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(p2.value, [0, 1], [30, -50]) },
            { translateY: interpolate(p2.value, [0, 1], [-20, 40]) },
            { scale: interpolate(p2.value, [0, 0.5, 1], [1, 1.2, 1]) },
        ],
        opacity: interpolate(p2.value, [0, 0.5, 1], [0.3, 0.5, 0.3]),
    }));
    const a3 = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(p3.value, [0, 1], [20, -30]) },
            { translateY: interpolate(p3.value, [0, 1], [30, -20]) },
            { scale: interpolate(p3.value, [0, 0.5, 1], [1, 1.1, 1]) },
        ],
        opacity: interpolate(p3.value, [0, 0.5, 1], [0.25, 0.45, 0.25]),
    }));
    const a4 = useAnimatedStyle(() => ({
        transform: [
            { translateX: interpolate(p4.value, [0, 1], [-20, 35]) },
            { translateY: interpolate(p4.value, [0, 1], [10, -40]) },
            { scale: interpolate(p4.value, [0, 0.5, 1], [1, 1.18, 1]) },
        ],
        opacity: interpolate(p4.value, [0, 0.5, 1], [0.3, 0.55, 0.3]),
    }));

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Animated.View style={[s.orb, s.orb1, a1]} />
            <Animated.View style={[s.orb, s.orb2, a2]} />
            <Animated.View style={[s.orb, s.orb3, a3]} />
            <Animated.View style={[s.orb, s.orb4, a4]} />
        </View>
    );
};

// ─── School hero card ─────────────────────────────────────────────────────────
const SchoolHeroCard = ({ schoolData, onSwitchSchool }) => {
    if (!schoolData) return null;
    const { name, profilePicture, city, state, publicProfile } = schoolData;
    const tagline = publicProfile?.tagline || null;
    const locationParts = [city, state].filter(Boolean);
    const locationStr = locationParts.join(', ') || null;

    return (
        <Animated.View entering={FadeInDown.delay(150).duration(500).springify()} style={s.heroCard}>
            <View style={s.heroRow}>
                {/* Logo */}
                <View style={s.heroLogoWrap}>
                    {profilePicture ? (
                        <Image source={{ uri: profilePicture }} style={s.heroLogo} resizeMode="cover" />
                    ) : (
                        <View style={s.heroLogoFallback}>
                            <Text style={s.heroLogoLetter}>{name?.charAt(0)?.toUpperCase() || 'S'}</Text>
                        </View>
                    )}
                </View>

                {/* Text */}
                <View style={s.heroText}>
                    <Text style={s.heroName} numberOfLines={1}>{name || 'School'}</Text>
                    {tagline ? (
                        <Text style={s.heroTagline} numberOfLines={1}>{tagline}</Text>
                    ) : locationStr ? (
                        <View style={s.heroLocRow}>
                            <Ionicons name="location-outline" size={fs(10)} color="#94A3B8" />
                            <Text style={s.heroLocText}>{locationStr}</Text>
                        </View>
                    ) : null}
                </View>

                {/* Switch */}
                <TouchableOpacity style={s.heroSwitch} onPress={onSwitchSchool} activeOpacity={0.7}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="swap-horizontal-outline" size={fs(14)} color={PRIMARY_COLOR} />
                    <Text style={s.heroSwitchText}>Switch</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ═════════════════════════════════════════════════════════════════════════════
export default function LoginScreen() {
    const insets = useSafeAreaInsets();
    const passwordRef = useRef(null);
    const scrollRef = useRef(null);

    const { schoolConfig: schoolConfigParam, prefillEmail, selectedRole: selectedRoleParam } = useLocalSearchParams();

    const [schoolConfig, setSchoolConfig] = useState(null);
    const [resolvedSchoolConfigParam, setResolvedSchoolConfigParam] = useState(
        typeof schoolConfigParam === 'string' ? schoolConfigParam : null
    );
    const [selectedRole, setSelectedRole] = useState(selectedRoleParam || 'parent');
    const [credential, setCredential] = useState(prefillEmail || '');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [appleLoading, setAppleLoading] = useState(false);

    const buttonScale = useSharedValue(1);
    const activeRole = LOGIN_ROLE_OPTIONS.find(o => o.key === selectedRole) || LOGIN_ROLE_OPTIONS[0];
    const roleColor = ROLE_ACCENT_COLORS[selectedRole] || PRIMARY_COLOR;
    const allowSocial = selectedRole === 'teacher';

    // ── keyboard scroll helper (Android) ─────────────────────────────────────
    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const show = Keyboard.addListener('keyboardDidShow', () => {
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
        });
        return () => show.remove();
    }, []);

    // ── resolve school context ────────────────────────────────────────────────
    useEffect(() => {
        const resolve = async () => {
            try {
                if (typeof schoolConfigParam === 'string' && schoolConfigParam) {
                    const config = JSON.parse(schoolConfigParam);
                    setResolvedSchoolConfigParam(schoolConfigParam);
                    setSchoolConfig(config.school || config);
                    return;
                }
                const saved = await getCurrentSchool();
                if (saved?.schoolData) {
                    setResolvedSchoolConfigParam(JSON.stringify(saved.schoolData));
                    setSchoolConfig(saved.schoolData.school || saved.schoolData);
                    return;
                }
                setResolvedSchoolConfigParam(null);
                setSchoolConfig(null);
            } catch (e) {
                console.error('Error resolving school config:', e);
                setSchoolConfig(null);
            }
        };
        resolve();
    }, [schoolConfigParam]);

    // ── helpers ───────────────────────────────────────────────────────────────
    const validateEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    const validatePhone = (v) => /^[6-9]\d{9}$/.test(v);

    const handleForgotPassword = () => {
        router.push({
            pathname: '/(auth)/forgot-password',
            params: {
                prefillCredential: credential.trim(),
                ...(resolvedSchoolConfigParam ? { schoolConfig: resolvedSchoolConfigParam } : {}),
            },
        });
    };

    const handleSwitchSchool = async () => {
        try {
            await supabase.auth.signOut();
            await clearTransientAuthState();
            await SecureStore.deleteItemAsync('lastSchoolCode');
            await clearCurrentSchool();
            router.replace('/(auth)/schoolcode');
        } catch {
            router.replace('/(auth)/schoolcode');
        }
    };

    // ── login ─────────────────────────────────────────────────────────────────
    const handleLogin = async () => {
        setErrors({});
        const newErrors = {};
        const trimmed = credential.trim();

        if (!trimmed) {
            newErrors.credential = selectedRole === 'parent' ? 'Mobile number is required'
                : selectedRole === 'student' ? 'Student ID is required' : 'Email address is required';
        } else if (selectedRole === 'parent' && !validatePhone(trimmed)) {
            newErrors.credential = 'Please enter a valid 10-digit mobile number';
        } else if (selectedRole !== 'parent' && selectedRole !== 'student' && !validateEmail(trimmed)) {
            newErrors.credential = 'Please enter a valid email address';
        }
        if (!password) newErrors.password = 'Password is required';
        else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
        else if (password.length > 50) newErrors.password = 'Password is too long';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            buttonScale.value = withSequence(
                withTiming(1.03, { duration: 80 }), withTiming(0.97, { duration: 80 }),
                withTiming(1.03, { duration: 80 }), withTiming(1, { duration: 80 }),
            );
            return;
        }

        try {
            setLoading(true);
            await SecureStore.deleteItemAsync('token');
            buttonScale.value = withSequence(withTiming(0.95, { duration: 100 }), withTiming(1, { duration: 100 }));

            const schoolId = schoolConfig?.id;
            if (!schoolId) { setErrors({ general: 'School not configured. Please reopen this school and try again.' }); setLoading(false); return; }

            const identifier = selectedRole === 'parent' ? trimmed.replace(/\D/g, '').slice(0, 10)
                : selectedRole === 'student' ? trimmed.toUpperCase().replace(/\s+/g, '')
                    : trimmed.toLowerCase();

            const loginResponse = await api.post('/auth/password-login', { schoolId, role: selectedRole, identifier, password });
            const loginData = loginResponse.data;

            if (!loginData?.session?.access_token || !loginData?.session?.refresh_token || !loginData?.userId) {
                setErrors({ general: 'Authentication failed. Please try again.' }); return;
            }

            const { error: sessionError } = await supabase.auth.setSession({
                access_token: loginData.session.access_token, refresh_token: loginData.session.refresh_token,
            });
            if (sessionError) { setErrors({ general: sessionError.message || 'Unable to restore your session.' }); return; }

            const user = await fetchUser(loginData.userId, loginData.session.access_token);
            if (!user) { await supabase.auth.signOut(); setErrors({ general: 'User not found in system' }); return; }

            if (BLOCKED_MOBILE_ROLES.includes(user.role?.name)) {
                await supabase.auth.signOut();
                Alert.alert('Web Only', `This account can only access the web dashboard at atlas.edubreezy.com.`, [{ text: 'OK' }]);
                setLoading(false); return;
            }

            const minimalUser = {
                id: user.id, email: user.email, name: user.name,
                profilePicture: user.profilePicture, role: user.role,
                schoolId: user.schoolId, loginIdentifier: user.loginIdentifier, loginRole: user.loginRole,
                ...(user.studentData && { studentData: { name: user.studentData.name, email: user.studentData.email, admissionNo: user.studentData.admissionNo, class: user.studentData.class || null, section: user.studentData.section || null } }),
                ...(user.parentData && { parentData: { id: user.parentData.id, name: user.parentData.name, email: user.parentData.email } }),
                ...(user.teacherData && { teacherData: { name: user.teacherData.name, email: user.teacherData.email } }),
                ...(user.school && { school: { id: user.school.id, name: user.school.name, schoolCode: user.school.schoolCode } }),
            };
            await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
            await SecureStore.setItemAsync('userRole', user?.role?.name || '');
            await SecureStore.setItemAsync('token', loginData.session.access_token);

            const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
            if (schoolCode) {
                try { await saveProfile(schoolCode, user, loginData.session); await saveCurrentSchool(schoolCode, { school: schoolConfig }); }
                catch (e) { console.error('Failed to save profile:', e); }
            }
            try {
                const deviceInfo = await getDeviceInfo();
                const sessionRes = await api.post('/auth/sessions', { userId: user.id, supabaseSessionToken: loginData.session.access_token, ...deviceInfo });
                if (sessionRes.data?.session?.id) await SecureStore.setItemAsync('currentSessionId', sessionRes.data.session.id);
            } catch (e) { console.warn('Could not create session:', e.message); }

            await queueReviewPromptAfterLogin();
            router.replace('/(screens)/greeting');
        } catch (err) {
            console.error(err);
            let message = 'Something went wrong. Please try again.';
            if (err.response?.status === 404) message = 'No account found for this school.';
            else if (err.response?.status === 401) message = 'Invalid credentials. Please check your password.';
            else if (!err.response) message = 'Network error. Please check your connection.';
            setErrors({ general: message });
        } finally {
            setLoading(false);
        }
    };

    // ── Google login ──────────────────────────────────────────────────────────
    const handleGoogleLogin = async () => {
        try {
            setGoogleLoading(true); setErrors({});
            await SecureStore.deleteItemAsync('token');

            const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: 'edubreezy://(auth)/login', skipBrowserRedirect: true },
            });
            if (oauthError) throw oauthError;
            if (!oauthData?.url) { setErrors({ general: 'Failed to initiate Google sign-in.' }); return; }

            const result = await WebBrowser.openAuthSessionAsync(oauthData.url, 'edubreezy://(auth)/login');
            if (result.type !== 'success' || !result.url) { setGoogleLoading(false); return; }

            const urlFragment = result.url.split('#')[1];
            if (!urlFragment) { setErrors({ general: 'Authentication failed. Please try again.' }); return; }

            const params = new URLSearchParams(urlFragment);
            const access_token = params.get('access_token');
            const refresh_token = params.get('refresh_token');
            if (!access_token || !refresh_token) { setErrors({ general: 'Authentication failed. Missing tokens.' }); return; }

            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
            if (sessionError || !sessionData?.user) { setErrors({ general: sessionError?.message || 'Failed to establish session.' }); return; }

            const verifyRes = await api.post('/auth/verify-oauth', { accessToken: access_token, provider: 'google' });
            const user = verifyRes.data;
            if (!user || user.linked === false) { await supabase.auth.signOut(); setErrors({ general: user?.message || 'No account found for this Google email. Please contact your school admin.' }); return; }
            if (BLOCKED_MOBILE_ROLES.includes(user.role?.name)) { await supabase.auth.signOut(); Alert.alert('Web Only', 'This account can only access the web dashboard.', [{ text: 'OK' }]); setGoogleLoading(false); return; }

            const minimalUser = { id: user.id, email: user.email, name: user.name, profilePicture: user.profilePicture, role: user.role, schoolId: user.schoolId, ...(user.studentData && { studentData: { name: user.studentData.name, email: user.studentData.email, admissionNo: user.studentData.admissionNo, class: user.studentData.class || null, section: user.studentData.section || null } }), ...(user.parentData && { parentData: { id: user.parentData.id, name: user.parentData.name, email: user.parentData.email } }), ...(user.teacherData && { teacherData: { name: user.teacherData.name, email: user.teacherData.email } }), ...(user.school && { school: { id: user.school.id, name: user.school.name, schoolCode: user.school.schoolCode } }) };
            await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
            await SecureStore.setItemAsync('userRole', user?.role?.name || '');
            await SecureStore.setItemAsync('token', access_token);

            const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
            if (schoolCode) { try { await saveProfile(schoolCode, user, sessionData.session); await saveCurrentSchool(schoolCode, { school: schoolConfig }); } catch (e) { console.error(e); } }
            try { const deviceInfo = await getDeviceInfo(); const sessionRes = await api.post('/auth/sessions', { userId: user.id, supabaseSessionToken: access_token, ...deviceInfo }); if (sessionRes.data?.session?.id) await SecureStore.setItemAsync('currentSessionId', sessionRes.data.session.id); } catch (e) { console.warn(e.message); }

            await queueReviewPromptAfterLogin();
            router.replace('/(screens)/greeting');
        } catch (err) {
            let message = 'Something went wrong. Please try again.';
            if (err.response?.status === 404) message = 'This account is not linked to any school account.';
            else if (!err.response) message = 'Network error. Please check your connection.';
            setErrors({ general: message });
        } finally { setGoogleLoading(false); }
    };

    // ── Apple login ───────────────────────────────────────────────────────────
    const handleAppleLogin = async () => {
        const cleanup = async () => {
            try {
                const { data } = await supabase.auth.getUserIdentities();
                const appleId = data?.identities?.find(i => i.provider === 'apple');
                if (appleId) await supabase.auth.unlinkIdentity(appleId);
            } catch (e) { console.warn(e); }
            finally { await supabase.auth.signOut(); }
        };

        try {
            setAppleLoading(true); setErrors({});
            await SecureStore.deleteItemAsync('token');

            const available = await AppleAuthentication.isAvailableAsync();
            if (!available) { setErrors({ general: 'Apple sign-in is not available on this device.' }); return; }

            const cred = await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL] });
            if (!cred?.identityToken) { setErrors({ general: 'Apple did not return an identity token.' }); return; }

            const { data: sessionData, error: sessionError } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
            if (sessionError || !sessionData?.user) { setErrors({ general: sessionError?.message || 'Failed to establish session.' }); return; }

            const access_token = sessionData.session?.access_token;
            if (!access_token) { setErrors({ general: 'Failed to establish session.' }); return; }

            const verifyRes = await api.post('/auth/verify-oauth', { accessToken: access_token, provider: 'apple' });
            const user = verifyRes.data;
            if (!user || user.linked === false) { await cleanup(); setErrors({ general: user?.message || 'No account found for this Apple ID. Please contact your school admin.' }); return; }
            if (BLOCKED_MOBILE_ROLES.includes(user.role?.name)) { await cleanup(); Alert.alert('Web Only', 'This account can only access the web dashboard.', [{ text: 'OK' }]); setAppleLoading(false); return; }

            const minimalUser = { id: user.id, email: user.email, name: user.name, profilePicture: user.profilePicture, role: user.role, schoolId: user.schoolId, ...(user.studentData && { studentData: { name: user.studentData.name, email: user.studentData.email, admissionNo: user.studentData.admissionNo, class: user.studentData.class || null, section: user.studentData.section || null } }), ...(user.parentData && { parentData: { id: user.parentData.id, name: user.parentData.name, email: user.parentData.email } }), ...(user.teacherData && { teacherData: { name: user.teacherData.name, email: user.teacherData.email } }), ...(user.school && { school: { id: user.school.id, name: user.school.name, schoolCode: user.school.schoolCode } }) };
            await SecureStore.setItemAsync('user', JSON.stringify(minimalUser));
            await SecureStore.setItemAsync('userRole', user?.role?.name || '');
            await SecureStore.setItemAsync('token', access_token);

            const schoolCode = schoolConfig?.schoolcode || schoolConfig?.schoolCode;
            if (schoolCode) { try { await saveProfile(schoolCode, user, sessionData.session); await saveCurrentSchool(schoolCode, { school: schoolConfig }); } catch (e) { console.error(e); } }
            try { const deviceInfo = await getDeviceInfo(); const sessionRes = await api.post('/auth/sessions', { userId: user.id, supabaseSessionToken: access_token, ...deviceInfo }); if (sessionRes.data?.session?.id) await SecureStore.setItemAsync('currentSessionId', sessionRes.data.session.id); } catch (e) { console.warn(e.message); }

            await queueReviewPromptAfterLogin();
            router.replace('/(screens)/greeting');
        } catch (err) {
            let message = 'Something went wrong. Please try again.';
            if (err.response?.status === 404) message = 'This account is not linked to any school account.';
            else if (!err.response) message = 'Network error. Please check your connection.';
            setErrors({ general: message || 'Apple Sign In Failed' });
        } finally { setAppleLoading(false); }
    };

    const btnScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonScale.value }] }));

    // ─────────────────────────────────────────────────────────────────────────
    return (
        // SafeAreaView handles top/bottom notches correctly on every device
        <SafeAreaView style={s.safeArea} edges={['top', 'bottom']}>
            <StatusBar style="dark" />
            <AnimatedBackground />

            <KeyboardAvoidingView
                style={s.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    ref={scrollRef}
                    contentContainerStyle={s.scroll}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="interactive"
                    bounces={false}
                    automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
                >
                    <View style={s.inner}>
                        {/* Form card */}
                        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={s.card}>

                            {/* School hero */}
                            {schoolConfig && (
                                <SchoolHeroCard schoolData={schoolConfig} onSwitchSchool={handleSwitchSchool} />
                            )}

                            {/* Header */}
                            <Animated.View entering={FadeInDown.delay(100).duration(500)} style={s.header}>
                                <Text style={s.title}>Login to Continue</Text>
                                <Text style={s.subtitle}>Sign in with your school-issued credential.</Text>
                            </Animated.View>

                            {/* General error */}
                            {errors.general && (
                                <Animated.View entering={FadeIn.duration(300)} style={s.errBox}>
                                    <Ionicons name="alert-circle" size={fs(18)} color="#DC2626" />
                                    <Text style={s.errBoxText}>{errors.general}</Text>
                                </Animated.View>
                            )}

                            {/* Role badge */}
                            <TouchableOpacity
                                style={[s.roleCard, { borderColor: roleColor + '30' }]}
                                activeOpacity={0.7}
                                onPress={() => router.canGoBack() && router.back()}
                            >
                                <View style={[s.roleIcon, { backgroundColor: roleColor + '15' }]}>
                                    <Ionicons name={activeRole.icon} size={fs(15)} color={roleColor} />
                                </View>
                                <View style={s.flex}>
                                    <Text style={[s.roleLabel, { color: roleColor }]}>Logging in as {activeRole.label}</Text>
                                    <Text style={s.roleHelper}>{activeRole.helper}</Text>
                                </View>
                                <View style={s.roleChangeBtn}>
                                    <Ionicons name="swap-horizontal-outline" size={fs(13)} color={roleColor} />
                                    <Text style={[s.roleChangeTxt, { color: roleColor }]}>Change</Text>
                                </View>
                            </TouchableOpacity>

                            {/* Credential input */}
                            <View style={s.inputGroup}>
                                <Text style={s.label}>
                                    {selectedRole === 'parent' ? 'Mobile Number' : selectedRole === 'student' ? 'Student ID' : 'Email Address'}
                                </Text>
                                <View style={[s.inputWrap, errors.credential && s.inputWrapErr]}>
                                    <Ionicons name={activeRole.icon} size={fs(18)} color={errors.credential ? '#DC2626' : '#94A3B8'} style={s.inputIcon} />
                                    <TextInput
                                        style={s.input}
                                        placeholder={activeRole.placeholder}
                                        placeholderTextColor="#94A3B8"
                                        value={credential}
                                        onChangeText={(t) => {
                                            setCredential(selectedRole === 'parent' ? t.replace(/\D/g, '').slice(0, 10) : t);
                                            if (errors.credential) setErrors({ ...errors, credential: null, general: null });
                                        }}
                                        keyboardType={activeRole.keyboardType}
                                        autoCapitalize={selectedRole === 'student' ? 'characters' : 'none'}
                                        autoCorrect={false}
                                        returnKeyType="next"
                                        onSubmitEditing={() => passwordRef.current?.focus()}
                                        blurOnSubmit={false}
                                    />
                                    {credential.length > 0 && <Ionicons name="checkmark-circle" size={fs(18)} color="#22C55E" />}
                                </View>
                                {errors.credential && (
                                    <Animated.Text entering={FadeIn.duration(200)} style={s.errText}>{errors.credential}</Animated.Text>
                                )}
                                <Text style={s.helper}>
                                    {selectedRole === 'parent' ? 'Use your registered mobile number.' : selectedRole === 'student' ? 'Use your Student ID. Ask the school if unsure.' : 'Use your school email address.'}
                                </Text>
                            </View>

                            {/* Password input */}
                            <View style={s.inputGroup}>
                                <Text style={s.label}>Password</Text>
                                <View style={[s.inputWrap, errors.password && s.inputWrapErr]}>
                                    <Ionicons name="lock-closed-outline" size={fs(18)} color={errors.password ? '#DC2626' : '#94A3B8'} style={s.inputIcon} />
                                    <TextInput
                                        ref={passwordRef}
                                        style={s.input}
                                        placeholder="Enter your password"
                                        placeholderTextColor="#94A3B8"
                                        value={password}
                                        onChangeText={(t) => { setPassword(t); if (errors.password) setErrors({ ...errors, password: null, general: null }); }}
                                        secureTextEntry={!showPassword}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                        returnKeyType="done"
                                        onSubmitEditing={handleLogin}
                                    />
                                    <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                        <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={fs(20)} color="#94A3B8" />
                                    </TouchableOpacity>
                                </View>
                                {errors.password && (
                                    <Animated.Text entering={FadeIn.duration(200)} style={s.errText}>{errors.password}</Animated.Text>
                                )}
                            </View>

                            {/* Forgot password */}
                            <TouchableOpacity onPress={handleForgotPassword} style={s.forgot} activeOpacity={0.7}>
                                <Text style={s.forgotTxt}>Forgot Password?</Text>
                            </TouchableOpacity>

                            {/* Login button */}
                            <Animated.View style={[btnScaleStyle, { marginTop: sp(8) }]}>
                                <TouchableOpacity
                                    style={[s.loginBtn, loading && s.loginBtnDisabled]}
                                    onPress={handleLogin}
                                    disabled={loading}
                                    activeOpacity={0.85}
                                >
                                    {loading ? (
                                        <View style={s.row}>
                                            <ActivityIndicator size="small" color="#FFF" />
                                            <Text style={s.loginBtnTxt}>Signing in...</Text>
                                        </View>
                                    ) : (
                                        <View style={s.row}>
                                            <Text style={s.loginBtnTxt}>Log In</Text>
                                            <Ionicons name="arrow-forward" size={fs(18)} color="#FFF" />
                                        </View>
                                    )}
                                </TouchableOpacity>
                            </Animated.View>

                            {/* Social divider */}
                            {allowSocial && (
                                <Animated.View entering={FadeInDown.delay(350).duration(500)} style={s.divider}>
                                    <View style={s.dividerLine} />
                                    <Text style={s.dividerTxt}>OR</Text>
                                    <View style={s.dividerLine} />
                                </Animated.View>
                            )}

                            {/* Google */}
                            {allowSocial && (
                                <Animated.View entering={FadeInDown.delay(400).duration(500)}>
                                    <TouchableOpacity
                                        style={[s.googleBtn, googleLoading && s.googleBtnDisabled]}
                                        onPress={handleGoogleLogin}
                                        disabled={googleLoading || loading}
                                        activeOpacity={0.85}
                                    >
                                        {googleLoading ? (
                                            <View style={s.row}><ActivityIndicator size="small" color="#374151" /><Text style={s.googleTxt}>Signing in...</Text></View>
                                        ) : (
                                            <View style={s.row}>
                                                <Image source={require('../../assets/google.png')} style={{ width: fs(19), height: fs(19) }} />
                                                <Text style={s.googleTxt}>Continue with Google</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                </Animated.View>
                            )}

                            {/* Apple */}
                            {allowSocial && Platform.OS === 'ios' && (
                                <Animated.View entering={FadeInDown.delay(450).duration(500)} style={{ marginTop: sp(10) }}>
                                    <TouchableOpacity
                                        style={[s.appleBtn, appleLoading && s.appleBtnDisabled]}
                                        onPress={handleAppleLogin}
                                        disabled={appleLoading || loading}
                                        activeOpacity={0.85}
                                    >
                                        {appleLoading ? (
                                            <View style={s.row}><ActivityIndicator size="small" color="#FFF" /><Text style={s.appleTxt}>Signing in...</Text></View>
                                        ) : (
                                            <View style={s.row}>
                                                <Ionicons name="logo-apple" size={fs(18)} color="#FFF" />
                                                <Text style={s.appleTxt}>Continue with Apple</Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                </Animated.View>
                            )}
                        </Animated.View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// STYLES  — all sizes go through fs() / sp() so they shrink on small devices
// ═════════════════════════════════════════════════════════════════════════════
const s = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
    flex: { flex: 1 },

    // Scroll
    scroll: { flexGrow: 1, justifyContent: 'center' },
    inner: { paddingHorizontal: sp(20), paddingVertical: sp(16) },

    // Card (max-width on tablets)
    card: {
        width: '100%',
        maxWidth: isTablet ? 460 : '100%',
        alignSelf: 'center',
    },

    // Background orbs
    orb: { position: 'absolute', borderRadius: 999 },
    orb1: { width: SW * 0.65, height: SW * 0.65, backgroundColor: 'rgba(59,130,246,0.12)', top: SH * 0.05, left: -SW * 0.15 },
    orb2: { width: SW * 0.55, height: SW * 0.55, backgroundColor: 'rgba(99,102,241,0.10)', top: SH * 0.12, right: -SW * 0.1 },
    orb3: { width: SW * 0.5, height: SW * 0.5, backgroundColor: 'rgba(139,92,246,0.08)', bottom: SH * 0.15, left: -SW * 0.05 },
    orb4: { width: SW * 0.45, height: SW * 0.45, backgroundColor: 'rgba(14,165,233,0.09)', bottom: SH * 0.3, right: SW * 0.05 },

    // School hero card
    heroCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: ms(14),
        marginBottom: sp(14),
        borderWidth: 1,
        borderColor: '#E2E8F0',
        overflow: 'hidden',
        shadowColor: PRIMARY_COLOR,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
    },
    heroRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: sp(12),
        paddingVertical: sp(10),
        gap: sp(10),
    },
    heroLogoWrap: {
        width: pick(56, 46, 40),
        height: pick(56, 46, 40),
        borderRadius: ms(10),
        overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: '#E2E8F0',
        backgroundColor: '#F1F5F9',
        flexShrink: 0,
    },
    heroLogo: { width: '100%', height: '100%' },
    heroLogoFallback: { width: '100%', height: '100%', backgroundColor: PRIMARY_COLOR, alignItems: 'center', justifyContent: 'center' },
    heroLogoLetter: { fontSize: fs(18), fontWeight: '800', color: '#FFF' },
    heroText: { flex: 1, gap: 2 },
    heroName: { fontSize: fs(13), fontWeight: '800', color: '#1E293B', letterSpacing: -0.2 },
    heroTagline: { fontSize: fs(11), fontWeight: '500', color: '#64748B' },
    heroLocRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    heroLocText: { fontSize: fs(11), color: '#94A3B8', fontWeight: '500' },
    heroSwitch: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        backgroundColor: '#EFF6FF', borderRadius: 20,
        paddingHorizontal: sp(9), paddingVertical: sp(5),
        borderWidth: 1, borderColor: 'rgba(11,92,222,0.15)', flexShrink: 0,
    },
    heroSwitchText: { fontSize: fs(11), fontWeight: '700', color: PRIMARY_COLOR },

    // Header
    header: { marginBottom: sp(16) },
    title: { fontSize: fs(28), fontWeight: '800', color: '#0F172A', letterSpacing: -0.8, marginBottom: sp(4) },
    subtitle: { fontSize: fs(13), fontWeight: '400', color: '#64748B' },

    // General error
    errBox: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#FEE2E2', borderRadius: ms(12),
        paddingHorizontal: sp(12), paddingVertical: sp(11),
        marginBottom: sp(14), gap: 10,
        borderWidth: 1, borderColor: '#FECACA',
    },
    errBoxText: { flex: 1, color: '#DC2626', fontSize: fs(12), fontWeight: '600' },

    // Role badge
    roleCard: {
        flexDirection: 'row', alignItems: 'center', gap: sp(10),
        borderRadius: ms(13), backgroundColor: '#F8FAFC',
        borderWidth: 1, borderColor: '#DBEAFE',
        paddingHorizontal: sp(12), paddingVertical: sp(11),
        marginBottom: sp(14),
    },
    roleIcon: { width: sp(32), height: sp(32), borderRadius: sp(16), alignItems: 'center', justifyContent: 'center' },
    roleLabel: { fontSize: fs(12), fontWeight: '700' },
    roleHelper: { fontSize: fs(11), color: '#94A3B8', fontWeight: '500', marginTop: 1 },
    roleChangeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: sp(9), paddingVertical: sp(4), borderWidth: 1, borderColor: '#E2E8F0' },
    roleChangeTxt: { fontSize: fs(11), fontWeight: '700' },

    // Inputs
    inputGroup: { marginBottom: sp(13) },
    label: { fontSize: fs(12), fontWeight: '700', color: '#374151', marginBottom: sp(6), marginLeft: 2 },
    inputWrap: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#F9FAFB', borderRadius: ms(12),
        borderWidth: 1.5, borderColor: '#E5E7EB',
        paddingHorizontal: sp(12),
    },
    inputWrapErr: { borderColor: '#F87171', backgroundColor: '#FEF2F2' },
    inputIcon: { marginRight: sp(9) },
    input: {
        flex: 1,
        paddingVertical: sp(13),
        fontSize: fs(14),
        color: '#1F2937',
        fontWeight: '500',
    },
    eyeBtn: { padding: 8, marginRight: -4 },
    errText: { fontSize: fs(11), color: '#DC2626', marginTop: sp(5), marginLeft: 4, fontWeight: '600' },
    helper: { marginTop: sp(5), marginLeft: 4, fontSize: fs(11), color: '#64748B', fontWeight: '500' },

    // Forgot
    forgot: { alignSelf: 'flex-end', paddingVertical: 6, marginBottom: sp(4) },
    forgotTxt: { fontSize: fs(12), fontWeight: '700', color: PRIMARY_COLOR },

    // Login button
    loginBtn: {
        backgroundColor: PRIMARY_COLOR, borderRadius: ms(12),
        paddingVertical: sp(15), alignItems: 'center', justifyContent: 'center',
    },
    loginBtnDisabled: { backgroundColor: '#93c5fd' },
    loginBtnTxt: { fontSize: fs(15), fontWeight: '800', color: '#FFF', letterSpacing: 0.3 },

    // Divider
    divider: { flexDirection: 'row', alignItems: 'center', marginVertical: sp(14) },
    dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
    dividerTxt: { marginHorizontal: sp(12), fontSize: fs(11), fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.5 },

    // Google button
    googleBtn: { backgroundColor: '#FFF', borderRadius: ms(12), paddingVertical: sp(13), alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E5E7EB' },
    googleBtnDisabled: { backgroundColor: '#F9FAFB' },
    googleTxt: { fontSize: fs(14), fontWeight: '700', color: '#374151', letterSpacing: 0.2 },

    // Apple button
    appleBtn: { backgroundColor: '#000', borderRadius: ms(12), paddingVertical: sp(13), alignItems: 'center', justifyContent: 'center' },
    appleBtnDisabled: { backgroundColor: '#4A4A4A' },
    appleTxt: { fontSize: fs(14), fontWeight: '700', color: '#FFF', letterSpacing: 0.2 },

    // Utility
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: sp(8) },
});