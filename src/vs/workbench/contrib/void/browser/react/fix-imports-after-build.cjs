#!/usr/bin/env node

// Fix imports in built JavaScript files after React build
// This script replaces incorrect imports from voidSettingsPane.js to actionIDs.js

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing React build imports...');

function fixImportsInFile(filePath) {
    try {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;

        // Fix import for VOID_TOGGLE_SETTINGS_ACTION_ID and VOID_OPEN_SETTINGS_ACTION_ID
        // Updated regex to be more flexible with whitespace and semicolons
        content = content.replace(
            /import\s*{\s*VOID_TOGGLE_SETTINGS_ACTION_ID\s*,\s*VOID_OPEN_SETTINGS_ACTION_ID\s*as\s*([a-zA-Z0-9_$]+)\s*}\s*from\s*['"]\.\.\/\.\.\/\.\.\/voidSettingsPane\.js['"]\s*;?/g,
            "import { VOID_TOGGLE_SETTINGS_ACTION_ID, VOID_OPEN_SETTINGS_ACTION_ID as $1 } from '../../../actionIDs.js';"
        );

        // Fix simple VOID_OPEN_SETTINGS_ACTION_ID imports
        content = content.replace(
            /import\s*{\s*VOID_OPEN_SETTINGS_ACTION_ID\s*}\s*from\s*['"]\.\.\/\.\.\/\.\.\/voidSettingsPane\.js['"]\s*;?/g,
            "import { VOID_OPEN_SETTINGS_ACTION_ID } from '../../../actionIDs.js';"
        );

        // Remove standalone import of voidSettingsPane.js (dead import)
        content = content.replace(
            /import\s*['"]\.\.\/\.\.\/\.\.\/voidSettingsPane\.js['"]\s*;?\s*\n?/g,
            ''
        );

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Error fixing ${filePath}:`, error.message);
        return false;
    }
}

function findAndFixJSFiles(outDir) {
    if (!fs.existsSync(outDir)) {
        console.log(`Directory ${outDir} does not exist`);
        return;
    }

    const files = fs.readdirSync(outDir);
    let fixesApplied = 0;

    files.forEach(file => {
        const fullPath = path.join(outDir, file, 'index.js');
        if (fs.existsSync(fullPath)) {
            if (fixImportsInFile(fullPath)) {
                console.log(`Fixed imports in ${fullPath}`);
                fixesApplied++;
            }
        }
    });

    console.log(`Fixes applied to ${fixesApplied} files`);
}

// Run the fix
// Make sure we find the out directory regardless of where the script is run from
const scriptDir = __dirname;
let outDir = path.join(scriptDir, 'out');

if (!fs.existsSync(outDir)) {
    // Try relative to CWD as a fallback
    outDir = './out';
}

findAndFixJSFiles(outDir);

console.log('✅ Import fixes complete!');