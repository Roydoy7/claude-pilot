/**
 * Setup LibreOffice Portable script
 * Extracts the bundled LibreOffice Portable ZIP for document conversion
 * Runs during npm install (postinstall hook) or manually
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

// Configuration - LibreOffice Portable
const PACKAGES_DIR = path.join(process.cwd(), 'packages');
const LIBREOFFICE_DIR = path.join(PACKAGES_DIR, 'libreofficePortable');
const LIBREOFFICE_ZIP = path.join(LIBREOFFICE_DIR, 'LibreOfficePortable.zip');
// The ZIP's top-level folder is "LibreOfficePortable" - extracting in place keeps
// the final layout at packages/libreofficePortable/LibreOfficePortable
const LIBREOFFICE_EXTRACTED_DIR = path.join(LIBREOFFICE_DIR, 'LibreOfficePortable');
const LIBREOFFICE_EXE = path.join(LIBREOFFICE_EXTRACTED_DIR, 'App', 'libreoffice', 'program', 'soffice.exe');

const STANDARD_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

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
 * Check if LibreOffice is already installed (portable or system-wide)
 */
function findInstalledLibreOffice() {
  if (fs.existsSync(LIBREOFFICE_EXE)) {
    return LIBREOFFICE_EXE;
  }
  return STANDARD_PATHS.find((p) => fs.existsSync(p)) || null;
}

/**
 * Extract LibreOffice Portable from the bundled ZIP using PowerShell (Windows built-in)
 */
async function extractLibreOffice() {
  log(`   Extracting to: ${LIBREOFFICE_EXTRACTED_DIR}`, colors.cyan);
  log(`   This may take a minute...`, colors.cyan);

  // Remove existing extracted output to avoid a stale/partial extraction
  // (the ZIP itself lives alongside it in LIBREOFFICE_DIR, so don't remove that)
  if (fs.existsSync(LIBREOFFICE_EXTRACTED_DIR)) {
    log(`   Removing existing directory...`, colors.cyan);
    removeDir(LIBREOFFICE_EXTRACTED_DIR);
  }

  ensureDir(LIBREOFFICE_DIR);

  const psCommand = `Expand-Archive -Path "${LIBREOFFICE_ZIP}" -DestinationPath "${LIBREOFFICE_DIR}" -Force`;

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
 * Get LibreOffice version from installed instance
 */
async function getLibreOfficeVersion(sofficeExe) {
  try {
    const { stdout } = await execAsync(`"${sofficeExe}" --version`, { timeout: 30000 });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Setup LibreOffice
 */
async function setupLibreOffice() {
  const installed = findInstalledLibreOffice();
  if (installed) {
    log(`✅ LibreOffice is already installed`, colors.green);
    log(`   Location: ${installed}`, colors.cyan);
    const version = await getLibreOfficeVersion(installed);
    log(`   Version: ${version}`, colors.cyan);
    return true;
  }

  if (!fs.existsSync(LIBREOFFICE_ZIP)) {
    log(`❌ LibreOffice Portable archive not found`, colors.red);
    log(`   Expected: ${LIBREOFFICE_ZIP}`, colors.yellow);
    return false;
  }

  log('\n📦 Extracting LibreOffice Portable...', colors.blue);
  log(`   Source: ${LIBREOFFICE_ZIP}`, colors.cyan);

  try {
    await extractLibreOffice();

    if (fs.existsSync(LIBREOFFICE_EXE)) {
      log('✅ LibreOffice Portable installed successfully!', colors.green);
      log(`   Location: ${LIBREOFFICE_EXTRACTED_DIR}`, colors.cyan);
      const version = await getLibreOfficeVersion(LIBREOFFICE_EXE);
      log(`   Version: ${version}`, colors.cyan);
      return true;
    }

    throw new Error('soffice.exe not found after extraction');
  } catch (error) {
    log(`❌ Failed to install LibreOffice Portable: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Main setup function
 */
async function main() {
  log('\n📝 Setting up LibreOffice Portable (Document Conversion)...', colors.blue);
  log('='.repeat(55), colors.blue);

  await setupLibreOffice();

  log('\n' + '='.repeat(55), colors.blue);
  log('✨ LibreOffice setup complete!\n', colors.green);
}

// Run setup
main().catch((error) => {
  log(`\n❌ Setup failed with error: ${error.message}`, colors.red);
  process.exit(0); // Don't fail npm install if setup fails
});
