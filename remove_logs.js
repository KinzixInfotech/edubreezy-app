const fs = require('fs');
const path = require('path');

const TARGET_DIRS = [
    '/Users/manshajami/Documents/Edubreezy/app',
    '/Users/manshajami/Documents/edutemp/src'
];

const EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const TARGETS = ['console.log', 'console.warn'];

// Robust Parser
function stripConsoleLogs(source) {
    let output = '';
    let i = 0;
    let len = source.length;
    let lastValidIndex = 0;

    // States
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let inBacktick = false;
    let inLineComment = false;
    let inBlockComment = false;

    while (i < len) {
        let char = source[i];

        // Handle State Transitions
        if (inLineComment) {
            if (char === '\n') inLineComment = false;
            i++; continue;
        }
        if (inBlockComment) {
            if (char === '*' && source[i + 1] === '/') {
                inBlockComment = false;
                i += 2;
                continue;
            }
            i++; continue;
        }
        if (inSingleQuote) {
            if (char === "'" && source[i - 1] !== '\\') inSingleQuote = false;
            i++; continue;
        }
        if (inDoubleQuote) {
            if (char === '"' && source[i - 1] !== '\\') inDoubleQuote = false;
            i++; continue;
        }
        if (inBacktick) {
            if (char === '`' && source[i - 1] !== '\\') inBacktick = false;
            i++; continue;
        }

        // Check for start of comments/strings
        if (char === '/' && source[i + 1] === '/') {
            inLineComment = true;
            i += 2; continue;
        }
        if (char === '/' && source[i + 1] === '*') {
            inBlockComment = true;
            i += 2; continue;
        }
        if (char === "'") { inSingleQuote = true; i++; continue; }
        if (char === '"') { inDoubleQuote = true; i++; continue; }
        if (char === '`') { inBacktick = true; i++; continue; }

        // CHECK FOR TARGETS
        // Optimization: check 'c' first
        if (char === 'c') {
            let matchedTarget = null;

            for (const target of TARGETS) {
                if (source.substring(i, i + target.length) === target) {
                    matchedTarget = target;
                    break;
                }
            }

            if (matchedTarget) {
                // Verify word boundary
                let prev = i > 0 ? source[i - 1] : ' ';
                if (/[a-zA-Z0-9_$]/.test(prev)) {
                    i++; continue;
                }

                // Look ahead for (
                let j = i + matchedTarget.length;
                while (j < len && /\s/.test(source[j])) j++;

                if (source[j] === '(') {
                    // Match found!
                    // Find end of parens
                    let endParen = findMatchingParen(source, j);
                    if (endParen !== -1) {
                        // Check for trailing semicolon
                        let k = endParen + 1;
                        // Optional whitespace before semicolon
                        while (k < len && /[ \t]/.test(source[k])) k++;

                        let removeEnd = endParen + 1;
                        if (source[k] === ';') {
                            removeEnd = k + 1;
                        }

                        // Now we skip this whole block from output
                        // Append everything from lastValidIndex to i
                        output += source.substring(lastValidIndex, i);

                        // Advance i to removeEnd
                        i = removeEnd;
                        lastValidIndex = i;

                        continue;
                    }
                }
            }
        }

        i++;
    }

    output += source.substring(lastValidIndex);
    return output;
}

function findMatchingParen(str, startIndices) {
    let depth = 1;
    let i = startIndices + 1;
    let inSQ = false, inDQ = false, inBT = false, inLC = false, inBC = false;

    while (i < str.length && depth > 0) {
        const char = str[i];

        if (inLC) { if (char === '\n') inLC = false; i++; continue; }
        if (inBC) { if (char === '*' && str[i + 1] === '/') { inBC = false; i += 2; continue; } i++; continue; }
        if (inSQ) { if (char === "'" && str[i - 1] !== '\\') inSQ = false; i++; continue; }
        if (inDQ) { if (char === '"' && str[i - 1] !== '\\') inDQ = false; i++; continue; }
        if (inBT) { if (char === '`' && str[i - 1] !== '\\') inBT = false; i++; continue; }

        if (char === '/' && str[i + 1] === '/') { inLC = true; i += 2; continue; }
        if (char === '/' && str[i + 1] === '*') { inBC = true; i += 2; continue; }
        if (char === "'") { inSQ = true; i++; continue; }
        if (char === '"') { inDQ = true; i++; continue; }
        if (char === '`') { inBT = true; i++; continue; }

        if (char === '(') depth++;
        else if (char === ')') depth--;

        i++;
    }

    return depth === 0 ? i - 1 : -1;
}

function getAllFiles(dirPath, arrayOfFiles) {
    if (!fs.existsSync(dirPath)) return arrayOfFiles || [];

    files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (EXTENSIONS.includes(path.extname(file))) {
                arrayOfFiles.push(path.join(dirPath, file));
            }
        }
    });

    return arrayOfFiles;
}

function processFiles() {
    let filesToProcess = [];
    TARGET_DIRS.forEach(dir => {
        console.log(`Scanning: ${dir}`);
        filesToProcess = filesToProcess.concat(getAllFiles(dir));
    });

    console.log(`Found ${filesToProcess.length} files. Processing...`);

    let modifiedCount = 0;

    filesToProcess.forEach(filePath => {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const newContent = stripConsoleLogs(content);

            if (content !== newContent) {
                fs.writeFileSync(filePath, newContent, 'utf8');
                console.log(`Modified: ${filePath}`);
                modifiedCount++;
            }
        } catch (err) {
            console.error(`Error processing ${filePath}:`, err);
        }
    });

    console.log(`Done. Removed [${TARGETS.join(', ')}] from ${modifiedCount} files.`);
}

if (require.main === module) {
    processFiles();
} else {
    module.exports = { stripConsoleLogs };
}
