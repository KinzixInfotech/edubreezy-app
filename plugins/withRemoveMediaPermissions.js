const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Config plugin to remove READ_MEDIA_IMAGES and READ_MEDIA_VIDEO permissions
 * from AndroidManifest.xml. These get auto-added by expo-image-picker but
 * Google Play rejects apps that declare them without persistent media access needs.
 * 
 * Since we use expo-image-picker (which launches the system photo picker / SAF),
 * we do NOT need these permissions — the picker grants one-time access.
 */
function withRemoveMediaPermissions(config) {
    return withAndroidManifest(config, async (config) => {
        const manifest = config.modResults;

        const PERMISSIONS_TO_REMOVE = [
            'android.permission.READ_MEDIA_IMAGES',
            'android.permission.READ_MEDIA_VIDEO',
            'android.permission.READ_MEDIA_AUDIO',
            'android.permission.READ_EXTERNAL_STORAGE',
            'android.permission.WRITE_EXTERNAL_STORAGE',
        ];

        // Filter out the unwanted permissions from the manifest
        if (manifest.manifest['uses-permission']) {
            manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'].filter(
                (perm) => {
                    const name = perm.$?.['android:name'];
                    if (PERMISSIONS_TO_REMOVE.includes(name)) {
                        console.log(`🗑️  Removed permission: ${name}`);
                        return false;
                    }
                    return true;
                }
            );
        }

        // Also check uses-permission-sdk-23 (some libraries add permissions there)
        if (manifest.manifest['uses-permission-sdk-23']) {
            manifest.manifest['uses-permission-sdk-23'] = manifest.manifest['uses-permission-sdk-23'].filter(
                (perm) => {
                    const name = perm.$?.['android:name'];
                    if (PERMISSIONS_TO_REMOVE.includes(name)) {
                        console.log(`🗑️  Removed sdk-23 permission: ${name}`);
                        return false;
                    }
                    return true;
                }
            );
        }

        return config;
    });
}

module.exports = withRemoveMediaPermissions;
