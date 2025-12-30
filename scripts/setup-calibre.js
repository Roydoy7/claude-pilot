/**
 * Setup Calibre Portable script
 * Downloads and extracts Calibre Portable for ebook conversion
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
// Note: Calibre Portable installer has a 59 character path limit, so we use a short directory name
const CALIBRE_VERSION = '8.16.2';
const CALIBRE_URL = `https://download.calibre-ebook.com/${CALIBRE_VERSION}/calibre-portable-installer-${CALIBRE_VERSION}.exe`;
const PACKAGES_DIR = path.join(__dirname, '..', 'packages');
const CALIBRE_DIR = path.join(PACKAGES_DIR, 'calibre');
const CALIBRE_EXE = path.join(CALIBRE_DIR, 'Calibre Portable', 'Calibre', 'ebook-convert.exe');
const INSTALLER_PATH = path.join(PACKAGES_DIR, `calibre-portable-installer-${CALIBRE_VERSION}.exe`);

/**
 * Ensure directory exists
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Check if Calibre Portable is already installed
 */
function isCalibreInstalled() {
  return fs.existsSync(CALIBRE_EXE);
}

/**
 * Download file from URL with redirect support
 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    log(`   Downloading from: ${url}`, colors.cyan);
    log(`   Size: ~180 MB (this may take a few minutes)`, colors.cyan);

    ensureDir(path.dirname(destPath));
    const file = fs.createWriteStream(destPath);
    let downloadedBytes = 0;
    let totalBytes = 0;

    const request = (currentUrl) => {
      const protocol = currentUrl.startsWith('https') ? https : require('http');

      protocol
        .get(currentUrl, (response) => {
          // Handle redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            log(`   Following redirect...`, colors.cyan);
            request(response.headers.location);
            return;
          }

          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
            return;
          }

          totalBytes = parseInt(response.headers['content-length'], 10) || 0;

          response.pipe(file);

          response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
              const mb = (downloadedBytes / (1024 * 1024)).toFixed(1);
              process.stdout.write(`\r   Downloaded: ${mb} MB (${percent}%)   `);
            }
          });

          file.on('finish', () => {
            file.close();
            console.log(''); // New line after progress
            resolve();
          });
        })
        .on('error', (err) => {
          fs.unlink(destPath, () => {}); // Delete partial file
          reject(err);
        });
    };

    request(url);
  });
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
 * Extract Calibre Portable using the installer
 * The portable installer accepts target directory as argument
 */
function extractCalibre() {
  return new Promise((resolve, reject) => {
    log(`   Extracting to: ${CALIBRE_DIR}`, colors.cyan);
    log(`   This may take a minute...`, colors.cyan);

    // Remove existing directory to avoid "Failed to move" error
    // The installer needs a clean target directory
    if (fs.existsSync(CALIBRE_DIR)) {
      log(`   Removing existing directory...`, colors.cyan);
      removeDir(CALIBRE_DIR);
    }

    // Ensure parent directory exists
    ensureDir(PACKAGES_DIR);

    // Calibre portable installer extracts to the specified directory
    const proc = spawn(INSTALLER_PATH, [CALIBRE_DIR], {
      stdio: 'inherit',
      windowsHide: true,
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Installer exited with code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Clean up installer file
 */
function cleanup() {
  if (fs.existsSync(INSTALLER_PATH)) {
    log(`   Removing installer: ${path.basename(INSTALLER_PATH)}`, colors.cyan);
    try {
      fs.unlinkSync(INSTALLER_PATH);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Setup Calibre Portable
 */
async function setupCalibre() {
  if (isCalibreInstalled()) {
    log(`✅ Calibre Portable is already installed`, colors.green);
    log(`   Location: ${CALIBRE_DIR}`, colors.cyan);
    return true;
  }

  log('\n📥 Downloading Calibre Portable...', colors.blue);
  log(`   Version: ${CALIBRE_VERSION}`, colors.cyan);

  try {
    // Download installer if not exists
    if (!fs.existsSync(INSTALLER_PATH)) {
      await downloadFile(CALIBRE_URL, INSTALLER_PATH);
      log('✅ Download complete', colors.green);
    } else {
      log(`   Installer already downloaded`, colors.cyan);
    }

    log('\n📦 Extracting Calibre Portable...', colors.blue);
    await extractCalibre();

    if (isCalibreInstalled()) {
      log('✅ Calibre Portable installed successfully!', colors.green);
      log(`   Location: ${CALIBRE_DIR}`, colors.cyan);
      return true;
    } else {
      // Check alternative structure
      const altExe = path.join(CALIBRE_DIR, 'ebook-convert.exe');
      if (fs.existsSync(altExe)) {
        log('✅ Calibre Portable installed successfully!', colors.green);
        log(`   Location: ${CALIBRE_DIR}`, colors.cyan);
        return true;
      }
      throw new Error('ebook-convert.exe not found after extraction');
    }
  } catch (error) {
    log(`❌ Failed to install Calibre Portable: ${error.message}`, colors.red);
    log('   You can manually download from:', colors.yellow);
    log(`   https://calibre-ebook.com/download_portable`, colors.yellow);
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

  // Clean up
  log('\n🧹 Cleaning up...', colors.blue);
  cleanup();

  log('\n' + '='.repeat(50), colors.blue);
  log('✨ Calibre Portable setup complete!\n', colors.green);
}

// Run setup
main().catch((error) => {
  log(`\n❌ Setup failed with error: ${error.message}`, colors.red);
  process.exit(0); // Don't fail npm install if setup fails
});
