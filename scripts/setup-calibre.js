/**
 * Setup Calibre Portable script
 * Extracts the bundled Calibre Portable ZIP for ebook conversion
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

// Configuration - Calibre Portable
// Note: Calibre Portable has a 59 character path limit, so we use a short directory name
const PACKAGES_DIR = path.join(__dirname, '..', 'packages');
const CALIBRE_DIR = path.join(PACKAGES_DIR, 'calibrePortable');
const CALIBRE_ZIP = path.join(CALIBRE_DIR, 'CalibrePortable.zip');
// The ZIP's top-level folder is "CalibrePortable" - extracting in place keeps
// the final layout at packages/calibrePortable/CalibrePortable
const CALIBRE_EXTRACTED_DIR = path.join(CALIBRE_DIR, 'CalibrePortable');
const CALIBRE_EXE = path.join(CALIBRE_EXTRACTED_DIR, 'Calibre', 'ebook-convert.exe');

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Remove directory recursively
 */
function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Check if Calibre Portable is already installed
 */
function isCalibreInstalled() {
  return fs.existsSync(CALIBRE_EXE);
}

/**
 * Extract Calibre Portable from the bundled ZIP using PowerShell (Windows built-in)
 */
async function extractCalibre() {
  log(`   Extracting to: ${CALIBRE_EXTRACTED_DIR}`, colors.cyan);
  log(`   This may take a minute...`, colors.cyan);

  // Remove existing extracted output to avoid a stale/partial extraction
  // (the ZIP itself lives alongside it in CALIBRE_DIR, so don't remove that)
  if (fs.existsSync(CALIBRE_EXTRACTED_DIR)) {
    log(`   Removing existing directory...`, colors.cyan);
    removeDir(CALIBRE_EXTRACTED_DIR);
  }

  ensureDir(CALIBRE_DIR);

  const psCommand = `Expand-Archive -Path "${CALIBRE_ZIP}" -DestinationPath "${CALIBRE_DIR}" -Force`;

  try {
    await execAsync(`powershell -Command "${psCommand}"`, {
      timeout: 600000, // 10 minutes
      maxBuffer: 1024 * 1024 * 10,
    });
  } catch (error) {
    throw new Error(`Failed to extract ZIP: ${error.message}`);
  }
}

/**
 * Setup Calibre Portable
 */
async function setupCalibre() {
  if (isCalibreInstalled()) {
    log(`✅ Calibre Portable is already installed`, colors.green);
    log(`   Location: ${CALIBRE_EXTRACTED_DIR}`, colors.cyan);
    return true;
  }

  if (!fs.existsSync(CALIBRE_ZIP)) {
    log(`❌ Calibre Portable archive not found`, colors.red);
    log(`   Expected: ${CALIBRE_ZIP}`, colors.yellow);
    return false;
  }

  log('\n📦 Extracting Calibre Portable...', colors.blue);
  log(`   Source: ${CALIBRE_ZIP}`, colors.cyan);

  try {
    await extractCalibre();

    if (isCalibreInstalled()) {
      log('✅ Calibre Portable installed successfully!', colors.green);
      log(`   Location: ${CALIBRE_EXTRACTED_DIR}`, colors.cyan);
      return true;
    }

    throw new Error('ebook-convert.exe not found after extraction');
  } catch (error) {
    log(`❌ Failed to install Calibre Portable: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Main setup function
 */
async function main() {
  log('\n📚 Setting up Calibre Portable (Ebook Conversion Tool)...', colors.blue);
  log('='.repeat(50), colors.blue);

  await setupCalibre();

  log('\n' + '='.repeat(50), colors.blue);
  log('✨ Calibre Portable setup complete!\n', colors.green);
}

// Run setup
main().catch((error) => {
  log(`\n❌ Setup failed with error: ${error.message}`, colors.red);
  process.exit(0); // Don't fail npm install if setup fails
});
