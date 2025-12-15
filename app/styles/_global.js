import { Text } from 'react-native';
import React from 'react';

// override default Text component globally
export const applyGlobalFont = (fontFamily = 'Roboto_400Regular') => {
    const oldRender = Text.render;
    Text.render = function (...args) {
        const origin = oldRender.call(this, ...args);
        return React.cloneElement(origin, {
            style: [{ fontFamily }, origin.props.style],
        });
    };
};
