/**
 * Setup Calibre script
 * Downloads and installs Calibre for ebook conversion
 * Runs during npm install (postinstall hook)
 */

const https = require('https');
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

// Configuration - Calibre
const CALIBRE_VERSION = '8.16.2';
const CALIBRE_URL = `https://github.com/kovidgoyal/calibre/releases/download/v${CALIBRE_VERSION}/calibre-64bit-${CALIBRE_VERSION}.msi`;
const CALIBRE_INSTALL_PATH = 'C:\\Program Files\\Calibre2';
const CALIBRE_EXE = path.join(CALIBRE_INSTALL_PATH, 'ebook-convert.exe');
const TEMP_DIR = process.env.TEMP || 'C:\\temp';
const CALIBRE_MSI = path.join(TEMP_DIR, `calibre-${CALIBRE_VERSION}.msi`);

/**
 * Check if Calibre is already installed
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
 * Install Calibre using msiexec (interactive install with UI)
 */
async function installCalibre() {
  log('   Installing Calibre...', colors.cyan);
  log('   A Windows installer window will open. Please follow the prompts.', colors.yellow);

  try {
    // Use msiexec with passive mode (shows progress but no user interaction needed)
    // /passive = unattended mode with progress bar
    // /norestart = don't restart
    // If passive fails, fall back to full UI
    await execAsync(`msiexec /i "${CALIBRE_MSI}" /passive /norestart`, {
      timeout: 600000, // 10 minutes timeout
    });

    log('   Installation complete', colors.green);
    return true;
  } catch (error) {
    // If passive mode fails, try with full UI
    log('   Passive install failed, trying with full UI...', colors.yellow);
    try {
      await execAsync(`msiexec /i "${CALIBRE_MSI}" /norestart`, {
        timeout: 600000,
      });
      log('   Installation complete', colors.green);
      return true;
    } catch (uiError) {
      log(`   ⚠️  Installation failed: ${uiError.message}`, colors.yellow);
      return false;
    }
  }
}

/**
 * Clean up temporary files
 */
function cleanup() {
  if (fs.existsSync(CALIBRE_MSI)) {
    log(`   Removing temporary file: ${path.basename(CALIBRE_MSI)}`, colors.cyan);
    fs.unlinkSync(CALIBRE_MSI);
  }
}

/**
 * Setup Calibre
 */
async function setupCalibre() {
  if (isCalibreInstalled()) {
    log(`✅ Calibre is already installed`, colors.green);
    log(`   Location: ${CALIBRE_EXE}`, colors.cyan);

    // Get version info
    try {
      const { stdout } = await execAsync(`"${CALIBRE_EXE}" --version`);
      const versionLine = stdout.split('\n')[0];
      log(`   ${versionLine}`, colors.cyan);
    } catch {
      // Version check failed, but installation exists
    }
    return true;
  }

  log('\n📥 Downloading Calibre...', colors.blue);
  log(`   Version: ${CALIBRE_VERSION}`, colors.cyan);
  log(`   Size: ~170 MB`, colors.cyan);

  try {
    // Ensure temp directory exists
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    await downloadFile(CALIBRE_URL, CALIBRE_MSI);
    log('✅ Download complete', colors.green);

    log('\n📦 Installing Calibre...', colors.blue);
    const installed = await installCalibre();

    if (!installed) {
      log('\n⚠️  Automatic installation failed (administrator privileges required)', colors.yellow);
      log('   Please install Calibre manually:', colors.yellow);
      log(`   1. Run as Administrator: msiexec /i "${CALIBRE_MSI}"`, colors.yellow);
      log(`   2. Or download from: https://calibre-ebook.com/download_windows`, colors.yellow);
      return false;
    }

    if (fs.existsSync(CALIBRE_EXE)) {
      log('✅ Calibre installed successfully!', colors.green);
      log(`   Location: ${CALIBRE_EXE}`, colors.cyan);

      // Get version info
      try {
        const { stdout } = await execAsync(`"${CALIBRE_EXE}" --version`);
        const versionLine = stdout.split('\n')[0];
        log(`   ${versionLine}`, colors.cyan);
      } catch {
        // Version check failed, but installation succeeded
      }
      return true;
    } else {
      throw new Error('ebook-convert.exe not found after installation');
    }
  } catch (error) {
    log(`❌ Failed to install Calibre: ${error.message}`, colors.red);
    log('   You can manually download from:', colors.yellow);
    log(`   https://calibre-ebook.com/download_windows`, colors.yellow);
    return false;
  }
}

/**
 * Main setup function
 */
async function main() {
  log('\n📚 Setting up Calibre (Ebook Conversion Tool)...', colors.blue);
  log('='.repeat(50), colors.blue);

  await setupCalibre();

  // Clean up
  log('\n🧹 Cleaning up...', colors.blue);
  cleanup();

  log('\n' + '='.repeat(50), colors.blue);
  log('✨ Calibre setup complete!\n', colors.green);
}

// Run setup
main().catch((error) => {
  log(`\n❌ Setup failed with error: ${error.message}`, colors.red);
  process.exit(0); // Don't fail npm install if setup fails
});
