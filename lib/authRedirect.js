import * as SecureStore from 'expo-secure-store';
import { clearAllProfiles, clearCurrentSchool, getCurrentSchool, getProfilesForSchool } from './profileManager';

export async function clearTransientAuthState() {
    await Promise.all([
        SecureStore.deleteItemAsync('user'),
        SecureStore.deleteItemAsync('userRole'),
        SecureStore.deleteItemAsync('token'),
        SecureStore.deleteItemAsync('currentSessionId'),
        SecureStore.deleteItemAsync('transportUser'),
        SecureStore.deleteItemAsync('transportStaff'),
        SecureStore.deleteItemAsync('transportToken'),
        SecureStore.deleteItemAsync('transportRefreshToken'),
        SecureStore.deleteItemAsync('todayTrips'),
    ]);
}

export async function clearForcedLogoutDeviceState() {
    await Promise.all([
        clearTransientAuthState(),
        clearAllProfiles(),
        clearCurrentSchool(),
        SecureStore.deleteItemAsync('lastSchoolCode'),
    ]);
}

export async function getLoggedOutRedirectTarget() {
    const currentSchool = await getCurrentSchool();

    if (currentSchool?.schoolCode) {
        const savedProfiles = await getProfilesForSchool(currentSchool.schoolCode);

        if (savedProfiles?.length > 0) {
            return {
                pathname: '/(auth)/profile-selector',
                params: {
                    schoolCode: currentSchool.schoolCode,
                    ...(currentSchool.schoolData && {
                        schoolData: JSON.stringify(currentSchool.schoolData),
                    }),
                },
            };
        }

        if (currentSchool.schoolData) {
            return {
                pathname: '/(auth)/login',
                params: {
                    schoolConfig: JSON.stringify(currentSchool.schoolData),
                },
            };
        }
    }

    return '/(auth)/schoolcode';
}
