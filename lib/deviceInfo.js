import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

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
            deviceType,
            os: osName,
            osVersion: osVersion.toString(),
            browser: Constants.appOwnership === 'expo' ? 'Expo Go' : 'Standalone App',
            browserVersion: Constants.expoVersion || '1.0.0',
        };
    } catch (error) {
        console.error('Error getting device info:', error);
        return {
            deviceName: 'Unknown Mobile Device',
            deviceType: 'mobile',
            os: Platform.OS,
            osVersion: Platform.Version.toString(),
            browser: 'App',
        };
    }
}

export default {
    getDeviceInfo,
};
