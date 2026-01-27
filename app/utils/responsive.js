import { Dimensions, Platform, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Standard reference dimensions (iPhone 11 Pro)
// You can adjust these based on the design mockups
const STANDARD_WIDTH = 375;
const STANDARD_HEIGHT = 812;

const scale = SCREEN_WIDTH / STANDARD_WIDTH;

export function normalize(size) {
    const newSize = size * scale;
    if (Platform.OS === 'ios') {
        return Math.round(PixelRatio.roundToNearestPixel(newSize));
    } else {
        return Math.round(PixelRatio.roundToNearestPixel(newSize)) - 2;
    }
}

/**
 * Calculates a responsive font size based on the device width.
 * @param {number} fontSize - The font size for the standard screen width.
 * @returns {number} - The calculated responsive font size.
 */
export const responsiveFontSize = (fontSize) => {
    const heightPercent = (fontSize * SCREEN_HEIGHT) / STANDARD_HEIGHT;
    const widthPercent = (fontSize * SCREEN_WIDTH) / STANDARD_WIDTH;
    const average = (heightPercent + widthPercent) / 2;
    return PixelRatio.roundToNearestPixel(average);
};

// Helper for height-based scaling if needed
export const responsiveHeight = (height) => {
    return PixelRatio.roundToNearestPixel((height * SCREEN_HEIGHT) / STANDARD_HEIGHT);
};

// Helper for width-based scaling if needed
export const responsiveWidth = (width) => {
    return PixelRatio.roundToNearestPixel((width * SCREEN_WIDTH) / STANDARD_WIDTH);
};
