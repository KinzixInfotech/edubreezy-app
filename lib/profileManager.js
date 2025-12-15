import * as SecureStore from 'expo-secure-store';

const PROFILES_KEY = 'savedProfiles';

/**
 * Profile Manager - Handles saving, loading, and managing user profiles per school
 */

// Get all saved profiles
export async function getAllProfiles() {
    try {
        const data = await SecureStore.getItemAsync(PROFILES_KEY);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error('Error getting profiles:', error);
        return {};
    }
}

// Get profiles for a specific school code
export async function getProfilesForSchool(schoolCode) {
    try {
        const allProfiles = await getAllProfiles();
        return allProfiles[schoolCode] || [];
    } catch (error) {
        console.error('Error getting profiles for school:', error);
        return [];
    }
}

// Save a new profile or update existing
export async function saveProfile(schoolCode, profileData) {
    try {
        // Extract userId - the API returns 'id' not 'userId'
        const userId = profileData.userId || profileData.id;

        console.log('🔵 saveProfile called with:', { schoolCode, userId, hasUserId: !!profileData.userId, hasId: !!profileData.id });

        const allProfiles = await getAllProfiles();
        console.log('📦 Current profiles in storage:', JSON.stringify(allProfiles, null, 2));

        if (!allProfiles[schoolCode]) {
            allProfiles[schoolCode] = [];
            console.log('✨ Created new array for school code:', schoolCode);
        } else {
            console.log(`📋 Existing profiles for ${schoolCode}:`, allProfiles[schoolCode].length);
        }

        // Check if profile already exists (by userId)
        const existingIndex = allProfiles[schoolCode].findIndex(
            p => p.userId === userId
        );

        console.log('🔍 Searching for existing profile with userId:', userId);
        console.log('🔍 Existing index:', existingIndex);

        // Extract name from different user object structures
        const getName = () => {
            if (profileData.name && typeof profileData.name === 'string') return profileData.name;
            if (profileData.studentData?.name) return profileData.studentData.name;
            if (profileData.studentdatafull?.name) return profileData.studentdatafull.name;
            if (profileData.parentData?.name) return profileData.parentData.name;
            if (profileData.teacherData?.name) return profileData.teacherData.name;
            return 'User';
        };

        // Create a minimized version of userData for instant profile switching
        // Remove large nested objects that aren't needed for app functionality
        const minimalUserData = {
            id: profileData.id,
            email: profileData.email,
            name: profileData.name,
            role: profileData.role,
            profilePicture: profileData.profilePicture,
            schoolId: profileData.schoolId,
            // Include role-specific essential data only
            ...(profileData.studentData && {
                studentData: {
                    userId: profileData.studentData.userId,
                    name: profileData.studentData.name,
                    email: profileData.studentData.email,
                    admissionNo: profileData.studentData.admissionNo,
                    rollNumber: profileData.studentData.rollNumber,
                    classId: profileData.studentData.classId,
                    sectionId: profileData.studentData.sectionId,
                },
            }),
            ...(profileData.parentData && {
                parentData: {
                    id: profileData.parentData.id,
                    userId: profileData.parentData.userId,
                    name: profileData.parentData.name,
                    email: profileData.parentData.email,
                },
            }),
            ...(profileData.teacherData && {
                teacherData: {
                    userId: profileData.teacherData.userId,
                    name: profileData.teacherData.name,
                    email: profileData.teacherData.email,
                },
            }),
            // Keep class and section as extracted above
            class: profileData.class,
            section: profileData.section,
            // Keep school info minimal
            school: profileData.school ? {
                id: profileData.school.id,
                name: profileData.school.name,
                schoolCode: profileData.school.schoolCode,
            } : undefined,
        };

        const profile = {
            id: userId,
            userId: userId,
            name: getName(),
            role: profileData.role?.name || profileData.role,
            email: profileData.email || profileData.parentData?.email || '',
            profilePicture: profileData.profilePicture,
            schoolId: profileData.schoolId,
            lastUsed: new Date().toISOString(),
            // Additional role-specific data - extract strings from objects
            ...(profileData.class && {
                class: typeof profileData.class === 'string'
                    ? profileData.class
                    : profileData.class.className || ''
            }),
            ...(profileData.section && {
                section: typeof profileData.section === 'string'
                    ? profileData.section
                    : profileData.section.name || ''
            }),
            ...(profileData.admissionNo && { admissionNo: profileData.admissionNo }),
            // Store minimized userData for instant profile switching
            userData: minimalUserData,
        };

        console.log('📝 Profile to save:', {
            schoolCode,
            userName: profile.name,
            userId: profile.userId,
            role: profile.role,
            existingProfilesCount: allProfiles[schoolCode]?.length || 0,
        });

        if (existingIndex >= 0) {
            // Update existing profile
            console.log(`🔄 Updating existing profile at index ${existingIndex}`);
            allProfiles[schoolCode][existingIndex] = profile;
        } else {
            // Add new profile (max 5 per school)
            if (allProfiles[schoolCode].length >= 5) {
                throw new Error('Maximum 5 profiles per school reached');
            }
            console.log(`➕ Adding NEW profile (total will be: ${allProfiles[schoolCode].length + 1})`);
            allProfiles[schoolCode].push(profile);
        }

        console.log('💾 Saving to SecureStore...');
        console.log('📦 Final profiles array:', JSON.stringify(allProfiles[schoolCode], null, 2));

        await SecureStore.setItemAsync(PROFILES_KEY, JSON.stringify(allProfiles));
        console.log('✅ Successfully saved to SecureStore');

        return profile;
    } catch (error) {
        console.error('❌ Error saving profile:', error);
        throw error;
    }
}

// Remove a specific profile
export async function removeProfile(schoolCode, profileId) {
    try {
        const allProfiles = await getAllProfiles();

        if (allProfiles[schoolCode]) {
            allProfiles[schoolCode] = allProfiles[schoolCode].filter(
                p => p.id !== profileId
            );

            // Remove school entry if no profiles left
            if (allProfiles[schoolCode].length === 0) {
                delete allProfiles[schoolCode];
            }

            await SecureStore.setItemAsync(PROFILES_KEY, JSON.stringify(allProfiles));
        }
    } catch (error) {
        console.error('Error removing profile:', error);
        throw error;
    }
}

// Clear all profiles for a school
export async function clearSchoolProfiles(schoolCode) {
    try {
        const allProfiles = await getAllProfiles();
        delete allProfiles[schoolCode];
        await SecureStore.setItemAsync(PROFILES_KEY, JSON.stringify(allProfiles));
    } catch (error) {
        console.error('Error clearing school profiles:', error);
        throw error;
    }
}

// Update last used timestamp
export async function updateLastUsed(schoolCode, profileId) {
    try {
        const allProfiles = await getAllProfiles();

        if (allProfiles[schoolCode]) {
            const profile = allProfiles[schoolCode].find(p => p.id === profileId);
            if (profile) {
                profile.lastUsed = new Date().toISOString();
                await SecureStore.setItemAsync(PROFILES_KEY, JSON.stringify(allProfiles));
            }
        }
    } catch (error) {
        console.error('Error updating last used:', error);
    }
}

// Get most recently used profile
export async function getLastUsedProfile(schoolCode) {
    try {
        const profiles = await getProfilesForSchool(schoolCode);
        if (profiles.length === 0) return null;

        return profiles.reduce((latest, profile) => {
            return new Date(profile.lastUsed) > new Date(latest.lastUsed)
                ? profile
                : latest;
        });
    } catch (error) {
        console.error('Error getting last used profile:', error);
        return null;
    }
}
