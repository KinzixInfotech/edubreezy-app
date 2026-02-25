// lib/uploadthing.js
// Direct upload helper using the existing api.js axios client
// Bypasses @uploadthing/expo to avoid initialization crashes

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import api from './api';

/**
 * Upload a file to the server using the existing api client
 */
export const uploadFile = async (file, endpoint, input) => {
    const formData = new FormData();
    formData.append('file', {
        uri: file.uri,
        type: file.mimeType || 'application/octet-stream',
        name: file.name || 'upload',
    });

    // Add input metadata
    if (input) {
        Object.entries(input).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                formData.append(key, String(value));
            }
        });
    }

    try {
        const response = await api.post(`/mobile/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });

        return response.data;
    } catch (error) {
        console.error('[Upload] Error:', error.response?.data || error.message);
        throw error;
    }
};

/**
 * Pick and upload an image
 * @param {string} endpoint - Upload endpoint name
 * @param {object} input - Metadata to send with upload
 * @param {object} callbacks - { onStart, onProgress, onComplete, onError }
 *   - onStart: Called AFTER file is picked, BEFORE upload starts
 */
export const pickAndUploadImage = async (endpoint, input, callbacks = {}) => {
    const { onStart, onProgress, onComplete, onError } = callbacks;

    try {
        // No permission request needed — Android 13+ system Photo Picker
        // does NOT require READ_MEDIA_IMAGES / READ_MEDIA_VIDEO permissions.
        // Requesting them causes Google Play rejection.

        // Pick image - NO loading state yet
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1], // Square crop — matches circular profile avatar
            quality: 0.8,
        });

        // User cancelled - return without triggering loading
        if (result.canceled) {
            return null;
        }

        const asset = result.assets[0];

        // NOW we have a file - start loading state
        onStart?.();
        onProgress?.(10);

        // Upload to server
        const uploadResult = await uploadFile({
            uri: asset.uri,
            mimeType: asset.mimeType || 'image/jpeg',
            name: asset.fileName || `image_${Date.now()}.jpg`,
        }, endpoint, input);

        onProgress?.(100);
        onComplete?.([uploadResult]);

        return uploadResult;
    } catch (error) {
        onError?.(error);
        return null;
    }
};

/**
 * Pick and upload a document
 * @param {string} endpoint - Upload endpoint name  
 * @param {object} input - Metadata to send with upload
 * @param {object} callbacks - { onStart, onProgress, onComplete, onError }
 *   - onStart: Called AFTER file is picked, BEFORE upload starts
 */
export const pickAndUploadDocument = async (endpoint, input, callbacks = {}) => {
    const { onStart, onProgress, onComplete, onError } = callbacks;

    try {
        // Pick document - NO loading state yet
        const result = await DocumentPicker.getDocumentAsync({
            type: ['application/pdf', 'image/*', 'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            copyToCacheDirectory: true,
        });

        // User cancelled - return without triggering loading
        if (result.canceled) {
            return null;
        }

        const asset = result.assets[0];

        // NOW we have a file - start loading state
        onStart?.();
        onProgress?.(10);

        // Upload to server
        const uploadResult = await uploadFile({
            uri: asset.uri,
            mimeType: asset.mimeType || 'application/pdf',
            name: asset.name || `document_${Date.now()}`,
        }, endpoint, input);

        onProgress?.(100);
        onComplete?.([uploadResult]);

        return uploadResult;
    } catch (error) {
        onError?.(error);
        return null;
    }
};

// Export for compatibility
export const isUploadThingAvailable = () => true;