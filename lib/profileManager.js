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
export async function saveProfile(schoolCode, profileData, sessionData = null) {
    try {
        // Extract userId - the API returns 'id' not 'userId'
        const userId = profileData.userId || profileData.id;

        console.log('🔵 saveProfile called with:', { schoolCode, userId, hasSession: !!sessionData });

        const allProfiles = await getAllProfiles();

        if (!allProfiles[schoolCode]) {
            allProfiles[schoolCode] = [];
            console.log('✨ Created new array for school code:', schoolCode);
        }

        // Check if profile already exists (by userId)
        const existingIndex = allProfiles[schoolCode].findIndex(
            p => p.userId === userId
        );

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
        const minimalUserData = {
            id: profileData.id,
            email: profileData.email,
            name: profileData.name,
            role: profileData.role,
            profilePicture: profileData.profilePicture,
            schoolId: profileData.schoolId,
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
            class: profileData.class,
            section: profileData.section,
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
            userData: minimalUserData,
            // Store session tokens for restoring Supabase session
            ...(sessionData && {
                sessionTokens: {
                    access_token: sessionData.access_token,
                    refresh_token: sessionData.refresh_token,
                }
            }),
        };

        console.log('📝 Profile to save:', {
            schoolCode,
            userName: profile.name,
            userId: profile.userId,
            role: profile.role,
            hasSessionTokens: !!profile.sessionTokens,
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

// Update session tokens for a specific profile (to keep them fresh)
export async function updateProfileSession(schoolCode, userId, sessionData) {
    try {
        if (!schoolCode || !userId || !sessionData) return;

        const allProfiles = await getAllProfiles();
        if (!allProfiles[schoolCode]) return;

        const profileIndex = allProfiles[schoolCode].findIndex(p => p.userId === userId);

        if (profileIndex >= 0) {
            console.log('🔄 Updating stored session tokens for user:', userId);

            // Update only the session tokens
            allProfiles[schoolCode][profileIndex].sessionTokens = {
                access_token: sessionData.access_token,
                refresh_token: sessionData.refresh_token,
            };

            // Update last used too since we're active
            allProfiles[schoolCode][profileIndex].lastUsed = new Date().toISOString();

            await SecureStore.setItemAsync(PROFILES_KEY, JSON.stringify(allProfiles));
            console.log('✅ Session tokens updated in storage');
        }
    } catch (error) {
        console.error('Error updating profile session:', error);
    }
}

// ============================================================================
// Current School Management - for maintaining school context across sessions
// ============================================================================

const CURRENT_SCHOOL_KEY = 'currentSchool';

/**
 * Save the current school data (used during login)
 * @param {string} schoolCode - The school code
 * @param {object} schoolData - The school data object (contains school info)
 */
export async function saveCurrentSchool(schoolCode, schoolData) {
    try {
        if (!schoolCode) {
            console.warn('⚠️ No school code provided, not saving current school');
            return;
        }

        const data = {
            schoolCode,
            schoolData,
            savedAt: new Date().toISOString(),
        };

        await SecureStore.setItemAsync(CURRENT_SCHOOL_KEY, JSON.stringify(data));
        console.log('✅ Saved current school:', schoolCode);
    } catch (error) {
        console.error('❌ Error saving current school:', error);
    }
}

/**
 * Get the current school data
 * @returns {object|null} - { schoolCode, schoolData } or null if not set
 */
export async function getCurrentSchool() {
    try {
        const data = await SecureStore.getItemAsync(CURRENT_SCHOOL_KEY);
        if (data) {
            const parsed = JSON.parse(data);
            console.log('📚 Retrieved current school:', parsed.schoolCode);
            return parsed;
        }
        return null;
    } catch (error) {
        console.error('Error getting current school:', error);
        return null;
    }
}

/**
 * Clear the current school data (used when switching schools)
 */
export async function clearCurrentSchool() {
    try {
        await SecureStore.deleteItemAsync(CURRENT_SCHOOL_KEY);
        console.log('🗑️ Cleared current school data');
    } catch (error) {
        console.error('Error clearing current school:', error);
    }
}

