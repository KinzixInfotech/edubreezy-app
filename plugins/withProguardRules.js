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

# React Native Safe Area Context
-keep class com.th3rdwave.safeareacontext.** { *; }

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
-keep class host.exp.exponent.** { *; }
-dontwarn expo.modules.**
-dontwarn host.exp.exponent.**

# ============================================
# Razorpay (critical)
# ============================================
-keep class com.razorpay.** { *; }
-dontwarn com.razorpay.**
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ============================================
# React Native UI Libraries
# ============================================
# React Native Elements (@rneui)
-keep class com.reactnativeelements.** { *; }

# React Navigation
-keep class com.reactnavigation.** { *; }
-keep class androidx.fragment.app.** { *; }

# React Native Picker
-keep class com.reactnativecommunity.picker.** { *; }

# React Native DateTimePicker
-keep class com.reactcommunity.rndatetimepicker.** { *; }

# React Native NetInfo
-keep class com.reactnativecommunity.netinfo.** { *; }

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

# Supabase / Networking
-keep class io.supabase.** { *; }
-dontwarn io.supabase.**

# TanStack Query
-keep class com.tanstack.** { *; }

# ============================================
# General
# ============================================
-keepattributes *Annotation*
-keepattributes SourceFile,LineNumberTable
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod

-keepclassmembers class * { native <methods>; }

# Keep enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Keep Parcelables
-keepclassmembers class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Keep Serializable
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# Suppress warnings
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn sun.misc.**
-dontwarn java.lang.invoke.**
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
