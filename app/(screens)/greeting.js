// GreetingScreen.js
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, StatusBar } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    withRepeat,
    withSequence,
    Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Rect, Path } from 'react-native-svg';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
const { height, width } = Dimensions.get('window');

export default function GreetingScreen() {
    const [user, setUser] = useState(null);
    const loadUser = async () => {
        try {
            const stored = await SecureStore.getItemAsync('user');
            if (stored) {
                const parsed = JSON.parse(stored);
                setUser(parsed);
                // console.log(parsed);

            }
        } catch (error) {
            console.error('Failed to load user:', error);
        }
    };
    useEffect(() => {
        loadUser();
    }, [user])

    // Get title based on gender
    const getGenderTitle = (gender) => {
        if (!gender || gender === 'Unknown') return ''; // No title if unknown
        const genderLower = gender.toLowerCase();
        if (genderLower === 'male') return 'Mr.';
        if (genderLower === 'female') return 'Ms.';
        return ''; // No title for other cases
    };

    const userName = (() => {
        const role = user?.role?.name?.toUpperCase();
        let name = '';
        let gender = user?.gender || 'Unknown';

        switch (role) {
            case 'PARENT':
                name = user?.parentData?.name || '';
                gender = user?.gender || user?.parentData?.user?.gender || 'Unknown';
                break;
            case 'STUDENT':
                name = user?.studentData?.name || user?.studentdatafull?.name || user?.name || '';
                gender = user?.gender || user?.studentData?.gender || 'Unknown';
                break;
            case 'TEACHING_STAFF':
            case 'NON_TEACHING_STAFF':
                name = user?.name || user?.staffData?.name || '';
                gender = user?.gender || user?.staffData?.gender || 'Unknown';
                break;
            case 'ADMIN':
                name = user?.name || '';
                break;
            default:
                name = user?.name || '';
        }

        const title = getGenderTitle(gender);
        return title ? `${title} ${name}` : name;
    })();


    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) {
            return {
                first: "Good",
                second: "Morning",
                highlightColor: '#FFD700', // Gold
                patternColor: '#FFF9E6'
            };
        } else if (hour >= 12 && hour < 17) {
            return {
                first: "Good",
                second: "Afternoon",
                highlightColor: '#FF6B9D', // Pink
                patternColor: '#FFF0F5'
            };
        } else {
            return {
                first: "Good",
                second: "Evening",
                highlightColor: '#9D84FF', // Purple
                patternColor: '#F5F3FF'
            };
        }
    };

    const greeting = getGreeting();

    const goodOpacity = useSharedValue(0);
    const timeOpacity = useSharedValue(0);
    const nameOpacity = useSharedValue(0);
    const goodTranslateY = useSharedValue(30);
    const timeTranslateY = useSharedValue(30);
    const nameTranslateY = useSharedValue(30);
    const goodScale = useSharedValue(0.8);
    const timeScale = useSharedValue(0.8);
    const nameScale = useSharedValue(0.8);

    useEffect(() => {
        // Initial entrance animation
        const entranceAnimation = () => {
            // Animate "Good"
            goodOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
            goodTranslateY.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) });
            goodScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });

            // Animate time word after 350ms
            setTimeout(() => {
                timeOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
                timeTranslateY.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) });
                timeScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
            }, 350);

            // Animate username after 700ms
            setTimeout(() => {
                nameOpacity.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
                nameTranslateY.value = withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) });
                nameScale.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });

                // After animation completes, wait 2 seconds then navigate to home
                setTimeout(() => {
                    router.replace('/(tabs)/home');
                }, 2000);
            }, 700);
        };

        entranceAnimation();
    }, []);

    const goodAnimatedStyle = useAnimatedStyle(() => ({
        opacity: goodOpacity.value,
        transform: [
            { translateY: goodTranslateY.value },
            { scale: goodScale.value }
        ],
    }));

    const timeAnimatedStyle = useAnimatedStyle(() => ({
        opacity: timeOpacity.value,
        transform: [
            { translateY: timeTranslateY.value },
            { scale: timeScale.value }
        ],
    }));

    const nameAnimatedStyle = useAnimatedStyle(() => ({
        opacity: nameOpacity.value,
        transform: [
            { translateY: nameTranslateY.value },
            { scale: nameScale.value }
        ],
    }));

    // Create dot pattern
    const DotPattern = () => {
        const dots = [];
        const rows = 20;
        const cols = 10;

        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                dots.push(
                    <View
                        key={`${i}-${j}`}
                        style={[
                            styles.dot,
                            {
                                top: i * (height / rows),
                                left: j * (width / cols),
                                backgroundColor: greeting.patternColor,
                            },
                        ]}
                    />
                );
            }
        }
        return dots;
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

            {/* Background Patterns */}
            <View style={styles.patternContainer}>
                {/* Dot Pattern */}
                <View style={styles.dotPattern}>
                    {DotPattern()}
                </View>

                {/* Decorative Shapes */}
                <Svg style={styles.svgPattern} height="100%" width="100%">
                    {/* Circle decorations */}
                    <Circle cx="80%" cy="15%" r="80" fill={greeting.patternColor} opacity="0.4" />
                    <Circle cx="15%" cy="85%" r="100" fill={greeting.patternColor} opacity="0.3" />
                    <Circle cx="90%" cy="75%" r="60" fill={greeting.patternColor} opacity="0.5" />

                    {/* Wave pattern */}
                    <Path
                        d={`M 0 ${height * 0.3} Q ${width * 0.25} ${height * 0.25}, ${width * 0.5} ${height * 0.3} T ${width} ${height * 0.3}`}
                        stroke={greeting.patternColor}
                        strokeWidth="40"
                        fill="none"
                        opacity="0.3"
                    />

                    {/* Abstract lines */}
                    <Rect x="70%" y="30%" width="200" height="4" fill={greeting.patternColor} opacity="0.4" transform="rotate(45)" />
                    <Rect x="10%" y="20%" width="150" height="4" fill={greeting.patternColor} opacity="0.4" transform="rotate(-30)" />
                </Svg>
            </View>

            <View style={styles.textContainer}>
                <Animated.View style={goodAnimatedStyle}>
                    <Text style={styles.greetingText}>Good</Text>
                </Animated.View>

                <Animated.View style={timeAnimatedStyle}>
                    <View style={styles.highlightContainer}>
                        <View style={[styles.highlight, { backgroundColor: greeting.highlightColor }]} />
                        <Text style={[styles.greetingText, styles.timeText]}>{greeting.second}</Text>
                    </View>
                </Animated.View>

                {userName && userName.trim() !== '' && (
                    <Animated.View style={nameAnimatedStyle}>
                        <Text style={styles.nameText}>{userName}</Text>
                    </Animated.View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        paddingHorizontal: 30,
    },
    patternContainer: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
    dotPattern: {
        position: 'absolute',
        width: '100%',
        height: '100%',
    },
    svgPattern: {
        position: 'absolute',
    },
    dot: {
        position: 'absolute',
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    textContainer: {
        height: height * 0.5,
        justifyContent: 'center',
        alignItems: 'flex-start',
        zIndex: 10,
    },
    greetingText: {
        fontSize: width * 0.18,
        fontWeight: '900',
        color: '#000000',
        textAlign: 'left',
        letterSpacing: -2,
        lineHeight: width * 0.19,
    },
    timeText: {
        fontStyle: 'italic',
        position: 'relative',
    },
    highlightContainer: {
        position: 'relative',
    },
    highlight: {
        position: 'absolute',
        height: '70%',
        width: '105%',
        bottom: 6,
        left: -5,
        opacity: 0.5,
        borderRadius: 8,
        transform: [{ skewY: '-2deg' }],
    },
    nameText: {
        fontSize: width * 0.16,
        fontWeight: '800',
        color: '#000000',
        textAlign: 'left',
        marginTop: 5,
        letterSpacing: -1,
    },
});