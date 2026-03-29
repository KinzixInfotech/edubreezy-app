// lib/r2Upload.js
// Client-side direct upload to Cloudflare R2 via presigned URLs
import * as ImagePicker from 'expo-image-picker';
import api from './api';

/**
 * Get presigned upload URLs from backend
 * @param {Array<{name: string, type: string, size?: number}>} files
 * @param {string} schoolId
 * @param {string} folder - R2 folder (default: 'chat')
 * @returns {Promise<Array<{url: string, key: string, publicUrl: string}>>}
 */
export const getPresignedUrls = async (files, schoolId, folder = 'chat') => {
    const { data } = await api.post('/r2/presign', {
        files,
        folder,
        schoolId,
    });
    return data;
};

/**
 * Upload a local file directly to R2 using a presigned URL
 * @param {string} localUri - Local file URI (from ImagePicker)
 * @param {string} presignedUrl - The presigned PUT URL
 * @param {string} contentType - MIME type
 * @returns {Promise<boolean>} - true if upload succeeded
 */
export const uploadToR2 = async (localUri, presignedUrl, contentType) => {
    // Read local file as blob
    const blob = await (await fetch(localUri)).blob();

    const response = await fetch(presignedUrl, {
        method: 'PUT',
        body: blob,
        headers: {
            'Content-Type': contentType || 'application/octet-stream',
        },
    });

    if (!response.ok) {
        throw new Error(`R2 upload failed: ${response.status} ${response.statusText}`);
    }

    return true;
};

/**
 * Pick media from gallery (images + videos)
 * @param {object} options
 * @param {boolean} options.allowsEditing - Allow cropping (default false for chat)
 * @param {number} options.quality - Image quality 0-1 (default 0.8)
 * @returns {Promise<{uri, mimeType, fileName, width, height, duration}|null>}
 */
export const pickMedia = async (options = {}) => {
    const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: options.allowsEditing ?? false,
        quality: options.quality ?? 0.8,
        videoMaxDuration: 120, // 2 min max
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    return {
        uri: asset.uri,
        mimeType: asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
        fileName: asset.fileName || `media_${Date.now()}.${getExtFromMime(asset.mimeType || 'image/jpeg')}`,
        width: asset.width,
        height: asset.height,
        duration: asset.duration || null,
    };
};

/**
 * Full flow: pick media → get presigned URL → upload to R2 → return public URL
 * @param {string} schoolId
 * @param {function} onProgress - Progress callback (0-100)
 * @returns {Promise<{publicUrl, mimeType, fileName, width, height}|null>}
 */
export const pickAndUploadMedia = async (schoolId, onProgress) => {
    // 1. Pick media
    const media = await pickMedia();
    if (!media) return null;

    onProgress?.(10);

    // 2. Get presigned URL
    const [presigned] = await getPresignedUrls(
        [{ name: media.fileName, type: media.mimeType }],
        schoolId,
        'chat'
    );

    onProgress?.(30);

    // 3. Upload directly to R2
    await uploadToR2(media.uri, presigned.url, media.mimeType);

    onProgress?.(100);

    // 4. Return the public CDN URL
    return {
        url: presigned.publicUrl,
        mimeType: media.mimeType,
        fileName: media.fileName,
        width: media.width,
        height: media.height,
    };
};

/**
 * Detect media type from URL or MIME type
 * @param {string} urlOrMime
 * @returns {'image'|'video'|'gif'|'file'}
 */
export const detectMediaType = (urlOrMime) => {
    const lower = (urlOrMime || '').toLowerCase();
    if (lower.includes('gif')) return 'gif';
    if (lower.match(/\.(jpg|jpeg|png|webp|heic|heif|avif)/)) return 'image';
    if (lower.match(/image\/(jpeg|png|webp|heic|heif|avif)/)) return 'image';
    if (lower.match(/\.(mp4|mov|avi|webm|m4v|3gp)/)) return 'video';
    if (lower.match(/video\//)) return 'video';
    return 'file';
};

/**
 * Get file extension from MIME type
 */
const getExtFromMime = (mime) => {
    const map = {
        'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
        'image/webp': 'webp', 'image/heic': 'heic',
        'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    };
    return map[mime] || 'bin';
};
