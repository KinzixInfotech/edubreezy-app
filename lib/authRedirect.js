import * as SecureStore from 'expo-secure-store';
import { clearAllProfiles, clearCurrentSchool, getAllProfiles, getCurrentSchool, getProfilesForSchool } from './profileManager';

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
    const allProfiles = await getAllProfiles();

    const getLastSchoolCode = async () => {
        try {
            const saved = await SecureStore.getItemAsync('lastSchoolCode');
            if (!saved) return null;

            const parsed = JSON.parse(saved);
            return parsed?.fullCode || null;
        } catch (error) {
            return null;
        }
    };

    const profileSchoolCodes = Object.keys(allProfiles || {}).filter(
        (schoolCode) => allProfiles[schoolCode]?.length > 0
    );

    const schoolCodesToCheck = [
        currentSchool?.schoolCode,
        await getLastSchoolCode(),
        ...profileSchoolCodes,
    ].filter(Boolean);

    const uniqueSchoolCodes = [...new Set(schoolCodesToCheck)];

    for (const schoolCode of uniqueSchoolCodes) {
        const savedProfiles = await getProfilesForSchool(schoolCode);

        if (savedProfiles?.length > 0) {
            return {
                pathname: '/(auth)/profile-selector',
                params: {
                    schoolCode,
                    ...(currentSchool?.schoolCode === schoolCode && currentSchool.schoolData && {
                        schoolData: JSON.stringify(currentSchool.schoolData),
                    }),
                },
            };
        }
    }

    if (currentSchool?.schoolCode) {
        if (currentSchool.schoolData) {
            return {
                pathname: '/(auth)/role-selector',
                params: {
                    schoolConfig: JSON.stringify(currentSchool.schoolData),
                },
            };
        }
    }

    return '/(auth)/schoolcode';
}
