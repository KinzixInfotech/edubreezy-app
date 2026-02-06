const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PROGUARD_RULES = `
# ============================================
# React Native
# ============================================
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }

# React Native Gesture Handler
-keep class com.swmansion.gesturehandler.** { *; }

# React Native Screens
-keep class com.swmansion.rnscreens.** { *; }

# ============================================
# Firebase
# ============================================
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**
-dontwarn com.google.android.gms.**
-keep class io.invertase.firebase.** { *; }
-dontwarn io.invertase.firebase.**

# ============================================
# Expo
# ============================================
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# ============================================
# Razorpay (critical)
# ============================================
-keep class com.razorpay.** { *; }
-dontwarn com.razorpay.**
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ============================================
# Other Libraries
# ============================================
-keep class com.pusher.** { *; }
-dontwarn com.pusher.**
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class com.oblador.vectoricons.** { *; }
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# ============================================
# General
# ============================================
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Signature
-keepattributes Exceptions
-keepclassmembers class * { native <methods>; }
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
`;

function withProguardRules(config) {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const proguardPath = path.join(
                config.modRequest.platformProjectRoot,
                'app',
                'proguard-rules.pro'
            );

            // Read existing content
            let existingContent = '';
            if (fs.existsSync(proguardPath)) {
                existingContent = fs.readFileSync(proguardPath, 'utf-8');
            }

            // Append our rules if not already present
            if (!existingContent.includes('# Razorpay (critical)')) {
                fs.writeFileSync(proguardPath, existingContent + PROGUARD_RULES);
                console.log('✅ Added custom ProGuard rules');
            }

            return config;
        },
    ]);
}

module.exports = withProguardRules;
