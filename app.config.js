import 'dotenv/config';

export default {
    expo: {
        owner: "kinzix",
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
            googleServicesFile: "./GoogleService-Info.plist" || process.env.GOOGLE_SERVICE_INFO_PLIST,
            config: {
                googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
            },
            infoPlist: {
                UIBackgroundModes: [
                    "fetch",
                    "remote-notification"
                ],
                LSApplicationQueriesSchemes: [
                    "itms-apps"
                ],
                NSLocationWhenInUseUsageDescription:
                    "EduBreezy needs access to your location to show your position on the map and track bus routes while the app is in use."
            }
        },

        android: {
            splash: {
                image: "./assets/splash.png",
                resizeMode: "contain",
                backgroundColor: "#ffffff"
            },
            versionCode: 20,
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
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.ACCESS_FINE_LOCATION",
                "android.permission.FOREGROUND_SERVICE",
                "android.permission.FOREGROUND_SERVICE_LOCATION",
                "android.permission.VIBRATE"
            ],
            blockedPermissions: [
                "android.permission.ACCESS_BACKGROUND_LOCATION",
                "android.permission.READ_MEDIA_IMAGES",
                "android.permission.READ_MEDIA_VIDEO",
                "android.permission.READ_MEDIA_AUDIO",
                "android.permission.READ_EXTERNAL_STORAGE",
                "android.permission.WRITE_EXTERNAL_STORAGE"
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
                    locationWhenInUsePermission: "EduBreezy needs access to your location to track bus routes while the app is in use.",
                    isAndroidBackgroundLocationEnabled: false,
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
            "./plugins/withProguardRules",
            "./plugins/withRemoveMediaPermissions"
        ],

        extra: {
            router: {},
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
            eas: {
                projectId: "591b9e71-8be3-44cd-a787-b75f228b49ac"
                // projectId: "705e829d-f67a-48d6-b0aa-654cb5ae901d"
            }
        }
    }
};
