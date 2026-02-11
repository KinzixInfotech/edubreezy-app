import { Platform, AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import SpInAppUpdates, { IAUUpdateKind } from 'sp-react-native-in-app-updates';
import api from '../lib/api';

const SKIPPED_VERSION_KEY = 'skipped_update_version';

// Get the current app version from Expo config
function getAppVersion() {
    return Constants.expoConfig?.version || Constants.manifest?.version || '1.0.0';
}

// Initialize the in-app updates instance
const inAppUpdates = new SpInAppUpdates(false); // isDebug = false

/**
 * Check for app updates and maintenance mode.
 * Returns { maintenanceMode, maintenanceMessage } if maintenance is active.
 * Otherwise handles the update flow automatically using sp-react-native-in-app-updates.
 */
export async function checkForUpdates() {
    try {
        const currentVersion = getAppVersion();
        const platform = Platform.OS;

        const { data } = await api.get(
            `/app-config/check-update?version=${currentVersion}&platform=${platform}`
        );

        // Maintenance mode takes priority
        if (data.maintenanceMode) {
            return {
                maintenanceMode: true,
                maintenanceMessage: data.maintenanceMessage,
            };
        }

        if (!data.needsUpdate) {
            return { maintenanceMode: false };
        }

        // Check if user previously skipped this version (only for flexible updates)
        if (data.canSkip) {
            const skippedVersion = await SecureStore.getItemAsync(SKIPPED_VERSION_KEY);
            if (skippedVersion === data.latestVersion) {
                console.log('[UpdateChecker] User previously skipped version', data.latestVersion);
                return { maintenanceMode: false };
            }
        }

        // Use sp-react-native-in-app-updates on both platforms
        await handleInAppUpdate(data);

        return { maintenanceMode: false, updateData: data };
    } catch (error) {
        console.log('[UpdateChecker] Error checking for updates:', error.message);
        return { maintenanceMode: false };
    }
}

/**
 * Handle in-app updates using sp-react-native-in-app-updates
 * Works on both Android (Play Core) and iOS (react-native-siren → App Store)
 */
async function handleInAppUpdate(data) {
    try {
        const result = await inAppUpdates.checkNeedsUpdate({
            curVersion: getAppVersion(),
        });

        if (result.shouldUpdate) {
            const isForce = data.updateType === 'IMMEDIATE' || !data.canSkip;

            if (Platform.OS === 'android') {
                // Android: use Play Core in-app updates
                await inAppUpdates.startUpdate({
                    updateType: isForce
                        ? IAUUpdateKind.IMMEDIATE
                        : IAUUpdateKind.FLEXIBLE,
                });
            } else {
                // iOS: uses react-native-siren to show App Store prompt
                const changelogText = data.changelog?.length > 0
                    ? '\n\nWhat\'s new:\n• ' + data.changelog
                        .slice(0, 1)
                        .flatMap(entry => entry.changes || [])
                        .join('\n• ')
                    : '';

                await inAppUpdates.startUpdate({
                    title: isForce ? '⚠️ Update Required' : '🆕 Update Available',
                    message: `A new version (v${data.latestVersion}) is available.${changelogText}`,
                    buttonUpgradeText: 'Update',
                    buttonCancelText: isForce ? undefined : 'Later',
                    forceUpgrade: isForce,
                });
            }

            // If user declined a flexible update, store skipped version
            if (data.canSkip) {
                await SecureStore.setItemAsync(SKIPPED_VERSION_KEY, data.latestVersion);
            }
        }
    } catch (error) {
        console.log('[UpdateChecker] In-app update error:', error.message);
    }
}

/**
 * Listen for app state changes to re-check updates when app comes to foreground
 */
export function setupUpdateListener(onMaintenanceMode) {
    let lastCheck = 0;
    const MIN_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

    const subscription = AppState.addEventListener('change', async (nextAppState) => {
        if (nextAppState === 'active') {
            const now = Date.now();
            if (now - lastCheck > MIN_CHECK_INTERVAL) {
                lastCheck = now;
                const result = await checkForUpdates();
                if (result.maintenanceMode && onMaintenanceMode) {
                    onMaintenanceMode(result.maintenanceMessage);
                }
            }
        }
    });

    return () => subscription.remove();
}
