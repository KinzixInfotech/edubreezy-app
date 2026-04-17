import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const INSTALLATION_ID_KEY = 'attendance_installation_id';

async function getInstallationId() {
    let installationId = await SecureStore.getItemAsync(INSTALLATION_ID_KEY);
    if (!installationId) {
        installationId = `att_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
        await SecureStore.setItemAsync(INSTALLATION_ID_KEY, installationId);
    }
    return installationId;
}

/**
 * Get unified device info for session tracking
 */
export async function getDeviceInfo() {
    try {
        const deviceName = Device.deviceName || Device.modelName || 'Unknown Device';
        const modelName = Device.modelName || 'Unknown';
        const osName = Device.osName || Platform.OS;
        const osVersion = Device.osVersion || Platform.Version;

        let deviceType = 'mobile';
        const type = await Device.getDeviceTypeAsync();
        if (type === Device.DeviceType.TABLET) deviceType = 'tablet';
        else if (type === Device.DeviceType.DESKTOP) deviceType = 'desktop';
        else if (type === Device.DeviceType.TV) deviceType = 'tv';

        return {
            deviceName: `${deviceName} (${modelName})`,
            modelName,
            deviceType,
            installationId: await getInstallationId(),
            os: osName,
            osVersion: osVersion.toString(),
            isPhysicalDevice: !!Device.isDevice,
            browser: Constants.appOwnership === 'expo' ? 'Expo Go' : 'Standalone App',
            browserVersion: Constants.expoVersion || '1.0.0',
        };
    } catch (error) {
        console.error('Error getting device info:', error);
        return {
            deviceName: 'Unknown Mobile Device',
            modelName: 'Unknown',
            deviceType: 'mobile',
            installationId: await getInstallationId(),
            os: Platform.OS,
            osVersion: Platform.Version.toString(),
            isPhysicalDevice: !!Device.isDevice,
            browser: 'App',
        };
    }
}

export default {
    getDeviceInfo,
};
