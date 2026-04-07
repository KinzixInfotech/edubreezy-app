const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withModularHeaders = (config) => {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const filePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
            let contents = await fs.promises.readFile(filePath, 'utf-8');

            if (!contents.includes('use_modular_headers!')) {
                // Insert use_modular_headers! right after the target definition
                contents = contents.replace(
                    /target '[^']+' do\n/,
                    match => `${match}  use_modular_headers!\n`
                );
                await fs.promises.writeFile(filePath, contents, 'utf-8');
            }
            return config;
        },
    ]);
};

module.exports = withModularHeaders;
