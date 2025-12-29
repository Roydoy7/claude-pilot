/**
 * Setup LibreOffice Portable script
 * Downloads and extracts LibreOffice Portable for document conversion
 * Runs during npm install (postinstall hook) or manually
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

// Configuration - LibreOffice Portable
const LIBREOFFICE_VERSION = '25.2.3';
const LIBREOFFICE_PORTABLE_URL = `https://download.documentfoundation.org/libreoffice/portable/${LIBREOFFICE_VERSION}/LibreOfficePortable_${LIBREOFFICE_VERSION}_MultilingualStandard.paf.exe`;
const PACKAGES_DIR = path.join(process.cwd(), 'packages');
const LIBREOFFICE_DIR = path.join(PACKAGES_DIR, `libreoffice-${LIBREOFFICE_VERSION}`);
const LIBREOFFICE_EXE = path.join(LIBREOFFICE_DIR, 'App', 'libreoffice', 'program', 'soffice.exe');
const TEMP_DIR = process.env.TEMP || 'C:\\temp';
const INSTALLER_FILE = path.join(TEMP_DIR, `LibreOfficePortable_${LIBREOFFICE_VERSION}.paf.exe`);

// 7za path for extraction
const SEVEN_ZIP_PATH = path.join(PACKAGES_DIR, '7za', '7za.exe');

/**
 * Check if LibreOffice is already installed
 */
function isLibreOfficeInstalled() {
  // Check portable version
  if (fs.existsSync(LIBREOFFICE_EXE)) {
    return true;
  }
  // Check standard installation
  const standardPaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
  return standardPaths.some((p) => fs.existsSync(p));
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
 * Extract LibreOffice Portable using 7-Zip
 * The .paf.exe is actually a 7z self-extracting archive
 */
async function extractLibreOffice() {
  log('   Extracting LibreOffice Portable...', colors.cyan);

  if (!fs.existsSync(SEVEN_ZIP_PATH)) {
    throw new Error('7-Zip not found. Please ensure 7za is available in packages/7za/');
  }

  // Create target directory
  if (!fs.existsSync(LIBREOFFICE_DIR)) {
    fs.mkdirSync(LIBREOFFICE_DIR, { recursive: true });
  }

  // Extract using 7-Zip
  // The .paf.exe contains a $INSTDIR folder with the portable app
  const command = `"${SEVEN_ZIP_PATH}" x "${INSTALLER_FILE}" -o"${LIBREOFFICE_DIR}" -y`;

  try {
    await execAsync(command, { timeout: 600000 }); // 10 minutes timeout
    log('   Extraction complete', colors.green);
    return true;
  } catch (error) {
    log(`   ⚠️  Extraction failed: ${error.message}`, colors.yellow);
    return false;
  }
}

/**
 * Clean up temporary files
 */
function cleanup() {
  if (fs.existsSync(INSTALLER_FILE)) {
    log(`   Removing temporary file: ${path.basename(INSTALLER_FILE)}`, colors.cyan);
    fs.unlinkSync(INSTALLER_FILE);
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
  // Check if already installed
  if (fs.existsSync(LIBREOFFICE_EXE)) {
    log(`✅ LibreOffice Portable is already installed`, colors.green);
    log(`   Location: ${LIBREOFFICE_EXE}`, colors.cyan);
    const version = await getLibreOfficeVersion(LIBREOFFICE_EXE);
    log(`   Version: ${version}`, colors.cyan);
    return true;
  }

  // Check standard installation
  const standardPaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ];
  for (const standardPath of standardPaths) {
    if (fs.existsSync(standardPath)) {
      log(`✅ LibreOffice is installed (system-wide)`, colors.green);
      log(`   Location: ${standardPath}`, colors.cyan);
      const version = await getLibreOfficeVersion(standardPath);
      log(`   Version: ${version}`, colors.cyan);
      return true;
    }
  }

  log('\n📥 Downloading LibreOffice Portable...', colors.blue);
  log(`   Version: ${LIBREOFFICE_VERSION}`, colors.cyan);
  log(`   Size: ~400 MB (this may take a while)`, colors.cyan);

  try {
    // Ensure temp directory exists
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }

    // Ensure packages directory exists
    if (!fs.existsSync(PACKAGES_DIR)) {
      fs.mkdirSync(PACKAGES_DIR, { recursive: true });
    }

    await downloadFile(LIBREOFFICE_PORTABLE_URL, INSTALLER_FILE);
    log('✅ Download complete', colors.green);

    log('\n📦 Extracting LibreOffice Portable...', colors.blue);
    const extracted = await extractLibreOffice();

    if (!extracted) {
      log('\n⚠️  Automatic extraction failed', colors.yellow);
      log('   Please manually extract the installer:', colors.yellow);
      log(`   File: ${INSTALLER_FILE}`, colors.yellow);
      log(`   Target: ${LIBREOFFICE_DIR}`, colors.yellow);
      return false;
    }

    // Verify installation
    if (fs.existsSync(LIBREOFFICE_EXE)) {
      log('✅ LibreOffice Portable installed successfully!', colors.green);
      log(`   Location: ${LIBREOFFICE_EXE}`, colors.cyan);
      const version = await getLibreOfficeVersion(LIBREOFFICE_EXE);
      log(`   Version: ${version}`, colors.cyan);
      return true;
    } else {
      // Check if extraction created a different structure
      const possiblePaths = [
        path.join(LIBREOFFICE_DIR, 'App', 'libreoffice', 'program', 'soffice.exe'),
        path.join(LIBREOFFICE_DIR, 'LibreOfficePortable', 'App', 'libreoffice', 'program', 'soffice.exe'),
        path.join(LIBREOFFICE_DIR, '$INSTDIR', 'App', 'libreoffice', 'program', 'soffice.exe'),
        path.join(LIBREOFFICE_DIR, 'program', 'soffice.exe'),
      ];

      for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          log('✅ LibreOffice Portable installed successfully!', colors.green);
          log(`   Location: ${possiblePath}`, colors.cyan);
          const version = await getLibreOfficeVersion(possiblePath);
          log(`   Version: ${version}`, colors.cyan);
          return true;
        }
      }

      log('\n⚠️  Installation completed but soffice.exe not found', colors.yellow);
      log('   Expected location: ' + LIBREOFFICE_EXE, colors.yellow);
      log('   Please check the extracted files and update the path in docx-mcp-server.ts', colors.yellow);
      return false;
    }
  } catch (error) {
    log(`\n❌ Failed to install LibreOffice: ${error.message}`, colors.red);
    log('   You can manually download from:', colors.yellow);
    log(`   https://www.libreoffice.org/download/portable-versions/`, colors.yellow);
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

  // Clean up
  log('\n🧹 Cleaning up...', colors.blue);
  cleanup();

  log('\n' + '='.repeat(55), colors.blue);
  log('✨ LibreOffice setup complete!\n', colors.green);
}

// Run setup
main().catch((error) => {
  log(`\n❌ Setup failed with error: ${error.message}`, colors.red);
  process.exit(0); // Don't fail npm install if setup fails
});
