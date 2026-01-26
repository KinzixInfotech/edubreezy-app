const { stripConsoleLogs } = require('./remove_logs');

const testCase = `
function test() {
    console.log("Hello World");
    console.warn("Warning message");
    const a = 1;
    console.log('Single Quote');
    console.warn(\`Backtick warning\`);
    
    console.error("Don't remove me");

    // console.warn("Commented warn should stay");
    
    console.log("End");
}
`;

const expectedOutput = `
function test() {
    
    
    const a = 1;
    
    
    
    console.error("Don't remove me");

    // console.warn("Commented warn should stay");
    
    
}
`;

console.log('Running Test...');
const result = stripConsoleLogs(testCase);

// Normalize for comparison
const normalize = str => str.replace(/\r\n/g, '\n').replace(/\n\s*\n/g, '\n').trim();

console.log('--- Original ---');
console.log(testCase);
console.log('--- Result ---');
console.log(result);

if (normalize(result) === normalize(expectedOutput)) {
    console.log('\nSUCCESS: Test passed! console.log AND console.warn removed.');
} else {
    console.log('\nFAILED: Output did not match expected.');
}
