/**
 * Profile Events - Lightweight event emitter for profile updates
 * 
 * Usage:
 * - Profile.js: emitProfilePictureChange(url) after upload
 * - Tab layout & Home: onProfilePictureChange(callback) to subscribe
 */

const listeners = new Set();

/**
 * Emit profile picture change event
 * @param {string} newUrl - The new profile picture URL
 */
export const emitProfilePictureChange = (newUrl) => {
    listeners.forEach(callback => callback(newUrl));
};

/**
 * Subscribe to profile picture changes
 * @param {function} callback - Called with new URL when profile picture changes
 * @returns {function} Unsubscribe function
 */
export const onProfilePictureChange = (callback) => {
    listeners.add(callback);
    // Return unsubscribe function
    return () => listeners.delete(callback);
};

/**
 * Unsubscribe from profile picture changes
 * @param {function} callback - The callback to remove
 */
export const offProfilePictureChange = (callback) => {
    listeners.delete(callback);
};
