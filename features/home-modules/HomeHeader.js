import { View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import HapticTouchable from '../../app/components/HapticTouch';

export default function HomeHeader({
    user = null,
    uiData = { header: {} },
    styles = {},
    iconMap = {},
    unreadCount,
    isSmallDevice,
    navigateOnce,
    onRefresh,
    replaceDynamic,
    getGreeting,
    getInitials,
    headerAnimatedStyle,
    headerContentOpacity,
    headerNameStyle,
    headerIconsTranslate,
    avatarAnimatedStyle,
    headerMaxHeight,
} = {}) {
    const roleKey = user?.role?.name?.toLowerCase() ?? '';
    const headerConfig = uiData?.header || {};
    const config = headerConfig[roleKey] || headerConfig.student;

    if (!config) {
        return null;
    }
    const title = replaceDynamic(config.title, roleKey);
    const subtitle = config.subtitle.map((item) => replaceDynamic(item.text, roleKey)).join(' • ');

    const icons = config.icons.map((key, i) => {
        const Icon = iconMap[key];
        if (!Icon) return null;

        const isBell = key === 'bell';
        const isRefresh = key === 'refresh';

        return (
            <HapticTouchable
                key={i}
                onPress={isBell ? () => navigateOnce('(screens)/notification') : isRefresh ? onRefresh : undefined}
            >
                <View
                    style={[
                        styles.iconButton,
                        {
                            backgroundColor: '#fff',
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.1,
                            shadowRadius: 4,
                            elevation: 3,
                        },
                    ]}
                >
                    <Icon size={isSmallDevice ? 18 : 20} color="#0469ff" />
                    {isBell && unreadCount > 0 && (
                        <View style={[styles.badge, { backgroundColor: '#FF6B6B' }]}>
                            <Text style={[styles.badgeText, { color: '#fff', fontSize: 10 }]}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </Text>
                        </View>
                    )}
                </View>
            </HapticTouchable>
        );
    });

    return (
        <Animated.View
            style={[
                { zIndex: 100, position: 'absolute', top: 0, left: 0, right: 0, height: headerMaxHeight },
                headerAnimatedStyle,
            ]}
        >
            <LinearGradient
                colors={['#0469ff', '#0256d0']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                    styles.header,
                    {
                        width: '100%',
                        borderBottomLeftRadius: 30,
                        borderBottomRightRadius: 30,
                        paddingTop: isSmallDevice ? 30 : 40,
                        paddingBottom: 0,
                        height: '100%',
                    },
                ]}
            >
                <Text style={{ position: 'absolute', top: -10, right: 80, fontSize: 40, color: 'rgba(255,255,255,0.1)', fontWeight: 'bold' }}>+</Text>
                <Text style={{ position: 'absolute', top: 50, right: 30, fontSize: 24, color: 'rgba(255,255,255,0.08)', fontWeight: 'bold' }}>×</Text>
                <View style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: 110, backgroundColor: 'rgba(255,255,255,0.05)' }} />

                <View style={[styles.headerLeft, { flexDirection: 'row', alignItems: 'center', width: '100%', paddingHorizontal: 20 }]}>
                    <HapticTouchable onPress={() => navigateOnce('(tabs)/profile')}>
                        <Animated.View
                            style={[
                                avatarAnimatedStyle,
                                {
                                    backgroundColor: '#f0f0f0',
                                    borderWidth: 2.5,
                                    borderColor: '#fff',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    overflow: 'hidden',
                                },
                            ]}
                        >
                            {user?.profilePicture && user.profilePicture !== 'default.png' ? (
                                <Image source={{ uri: user.profilePicture }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                            ) : (
                                <Text style={{ color: '#0469ff', fontSize: 22, fontWeight: '700' }}>
                                    {getInitials(user?.parentData?.name || user?.name || 'User') || 'U'}
                                </Text>
                            )}
                        </Animated.View>
                    </HapticTouchable>

                    <View style={[styles.headerInfo, { marginLeft: 12, flex: 1, justifyContent: 'center' }]}>
                        <Animated.View style={headerContentOpacity}>
                            <Text style={[styles.welcomeText, { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' }]}>
                                {getGreeting()},
                            </Text>
                        </Animated.View>
                        <Animated.View style={headerNameStyle}>
                            <Text style={[styles.name, { color: '#fff', fontSize: 18, marginTop: 2 }]} numberOfLines={1}>
                                {title}
                            </Text>
                            <Text
                                style={[styles.parentEmail, { marginTop: 4, color: 'rgba(255,255,255,0.7)', fontSize: 12 }]}
                                numberOfLines={1}
                            >
                                {subtitle}
                            </Text>
                        </Animated.View>
                    </View>

                    <Animated.View style={[{ flexDirection: 'row', gap: 10 }, headerIconsTranslate]}>
                        {icons}
                    </Animated.View>
                </View>
            </LinearGradient>
        </Animated.View>
    );
}
