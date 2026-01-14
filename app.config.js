import 'dotenv/config';

export default {
    expo: {
        name: "EduBreezy",
        slug: "EduBreezy",
        scheme: "edubreezy",
        version: "1.0.0",
        orientation: "portrait",
        icon: "./assets/icon.png",
        userInterfaceStyle: "light",
        newArchEnabled: true,
        splash: {
            image: "./assets/splash.png",
            resizeMode: "cover",
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
                    "location"
                ]
            },
            bundleIdentifier: "com.kinzix.edubreezy"
        },
        android: {
            package: "com.kinzix.edubreezy",
            adaptiveIcon: {
                foregroundImage: "./assets/adaptive-icon.png",
                backgroundColor: "#ffffff"
            },
            notification: {
                icon: "./assets/icon.png",
                color: "#ffffff"
            },
            config: {
                googleMaps: {
                    apiKey: process.env.GOOGLE_MAPS_API_KEY
                }
            },
            googleServicesFile: "./google-services.json",
            plugins: [
                "@react-native-firebase/app",
                "@react-native-firebase/messaging"
            ],
            edgeToEdgeEnabled: true,
            permissions: [
                "RECEIVE_BOOT_COMPLETED",
                "WAKE_LOCK",
                "android.permission.ACCESS_COARSE_LOCATION",
                "android.permission.ACCESS_FINE_LOCATION"
            ]
        },
        web: {
            favicon: "./assets/favicon.png"
        },
        plugins: [
            "expo-notifications",
            "expo-background-fetch",
            "expo-location",
            "expo-font",
            "expo-web-browser",
            "expo-router",
            "expo-secure-store"
        ],
        extra: {
            router: {},
            eas: {
                projectId: "bed9e655-de7a-49f6-b80c-423a0493c946"
            }
        }
    }
};
