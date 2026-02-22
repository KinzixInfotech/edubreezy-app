import 'dotenv/config';

export default {
    expo: {
        name: "EduBreezy",
        slug: "EduBreezy",
        scheme: "edubreezy",
        version: "1.0.2",
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
            supportsTablet: true,
            bundleIdentifier: "com.kinzix.edubreezy",
            googleServicesFile: "./GoogleService-Info.plist",
            config: {
                googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
            },
            infoPlist: {
                UIBackgroundModes: [
                    "fetch",
                    "location",
                    "remote-notification"
                ],
                LSApplicationQueriesSchemes: [
                    "itms-apps"
                ],
                NSLocationAlwaysAndWhenInUseUsageDescription:
                    "EduBreezy needs access to your location to track bus routes and provide real-time updates to parents.",
                NSLocationWhenInUseUsageDescription:
                    "EduBreezy needs access to your location to show your position on the map.",
                NSLocationAlwaysUsageDescription:
                    "EduBreezy needs background location access to track bus routes even when the app is closed."
            }
        },

        android: {
            splash: {
                image: "./assets/splash.png",
                resizeMode: "contain",
                backgroundColor: "#ffffff"
            },

            package: "com.kinzix.edubreezy",
            googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./google-services.json",
            edgeToEdgeEnabled: true,
            adaptiveIcon: {
                foregroundImage: "./assets/Android-Foreground-App-Icon.png",
                backgroundImage: "./assets/Android-background-App-Icon.png"
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
        },

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
            "expo-task-manager",
            [
                "expo-image-picker",
                {
                    "photosPermission": false,
                    "microphonePermission": false
                }
            ],
            "./plugins/withProguardRules"
        ],

        extra: {
            router: {},
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
            eas: {
                projectId: "705e829d-f67a-48d6-b0aa-654cb5ae901d"
            }
        }
    }
};
