import 'dotenv/config';

export default {
    expo: {
        name: "EduBreezy",
        slug: "EduBreezy",
        scheme: "edubreezy",
        version: "1.0.1",
        orientation: "portrait",
        icon: "./assets/icon.png",
        userInterfaceStyle: "light",
        newArchEnabled: true,

        splash: {
            image: "./assets/splash.png",
            resizeMode: "contain",
            backgroundColor: "#ffffff"
        },
        ios: {
            config: {
                googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
            },
            supportsTablet: true,
            infoPlist: {
                UIBackgroundModes: [
                    "fetch",
                    "location",
                    "remote-notification"
                ],
                NSLocationAlwaysAndWhenInUseUsageDescription:
                    "EduBreezy needs access to your location to track bus routes and provide real-time updates to parents.",
                NSLocationWhenInUseUsageDescription:
                    "EduBreezy needs access to your location to show your position on the map.",
                NSLocationAlwaysUsageDescription:
                    "EduBreezy needs background location access to track bus routes even when the app is closed."
            },
            bundleIdentifier: "com.kinzix.edubreezy",
            package: "com.kinzix.edubreezy",
            adaptiveIcon: {
                foregroundImage: "./assets/adaptive-icon.png",
                backgroundColor: "#ffffff"
            },
            notification: {
                icon: "./assets/notification-icon.png",
                color: "#000000"
            },
            config: {
                googleMaps: {
                    apiKey: process.env.GOOGLE_MAPS_API_KEY
                }
            },
            googleServicesFile: "./google-services.json",
            edgeToEdgeEnabled: true,
            permissions: [
                "RECEIVE_BOOT_COMPLETED",
                "WAKE_LOCK",
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.ACCESS_FINE_LOCATION",
                "android.permission.ACCESS_BACKGROUND_LOCATION",
                "android.permission.FOREGROUND_SERVICE",
                "android.permission.FOREGROUND_SERVICE_LOCATION",
                "android.permission.VIBRATE"
            ]
        },
        web: {
            favicon: "./assets/favicon.png"
        }, googleServicesFile: "./GoogleService-Info.plist"
    },
    android: {
        plugins: [
            "@react-native-firebase/app",
            "@react-native-firebase/messaging",
            [
                "expo-notifications",
                {
                    ios: {
                        allowAlert: true,
                        allowBadge: true,
                        allowSound: true
                    }
                }
            ],
            "expo-background-fetch",
            [
                "expo-location",
                {
                    locationAlwaysAndWhenInUsePermission: "EduBreezy needs access to your location to track bus routes.",
                    isAndroidBackgroundLocationEnabled: true,
                    isAndroidForegroundServiceEnabled: true
                }
            ],
            "expo-font",
            "expo-web-browser",
            "expo-router",
            "expo-secure-store",
            "expo-task-manager"
        ],
        extra: {
            router: {},
            eas: {
                projectId: "bed9e655-de7a-49f6-b80c-423a0493c946"
            }
        }
    }
};
