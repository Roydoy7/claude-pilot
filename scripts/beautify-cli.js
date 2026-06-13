#!/usr/bin/env node
/**
 * Beautify Claude Agent SDK's sdk.mjs for easier debugging
 * This script runs after npm install to make the minified sdk.mjs readable
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLI_PATH = path.join(__dirname, '../node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs');
const BEAUTIFIED_PATH = path.join(__dirname, '../node_modules/@anthropic-ai/claude-agent-sdk/sdk.beautified.mjs');

console.log('🎨 Beautifying Claude Agent SDK sdk.mjs for debugging...');

try {
  // Check if sdk.mjs exists
  if (!fs.existsSync(CLI_PATH)) {
    console.log('⚠️  SDK bundle not found at:', CLI_PATH);
    console.log('   This is expected if @anthropic-ai/claude-agent-sdk is not installed yet.');
    process.exit(0);
  }

  // Check if already beautified (to avoid re-beautifying)
  if (fs.existsSync(BEAUTIFIED_PATH)) {
    const cliStats = fs.statSync(CLI_PATH);
    const beautifiedStats = fs.statSync(BEAUTIFIED_PATH);

    // If beautified file is newer than original, skip
    if (beautifiedStats.mtimeMs > cliStats.mtimeMs) {
      console.log('✅ sdk.beautified.mjs is already up to date');
      process.exit(0);
    }
  }

  console.log('   Source:', CLI_PATH);
  console.log('   Output:', BEAUTIFIED_PATH);

  // Use npx to run js-beautify
  execSync(`npx --yes js-beautify "${CLI_PATH}" > "${BEAUTIFIED_PATH}"`, {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });

  const originalSize = fs.statSync(CLI_PATH).size;
  const beautifiedSize = fs.statSync(BEAUTIFIED_PATH).size;

  console.log('✅ Successfully beautified sdk.mjs');
  console.log(`   Original size:   ${(originalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Beautified size: ${(beautifiedSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('');
  console.log('💡 Tip: You can now search the beautified file for debugging:');
  console.log('   grep -n "pattern" node_modules/@anthropic-ai/claude-agent-sdk/sdk.beautified.mjs');

} catch (error) {
  console.error('❌ Failed to beautify sdk.mjs:', error.message);
  // Don't fail the install process
  process.exit(0);
}
