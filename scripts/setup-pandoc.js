/**
 * Setup Pandoc and wkhtmltopdf script
 * Downloads and extracts Pandoc and wkhtmltopdf for document conversion
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

// Configuration - Pandoc
const PANDOC_VERSION = '3.8.3';
const PANDOC_URL = `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-windows-x86_64.zip`;
const PACKAGES_DIR = path.join(__dirname, '..', 'packages');
const PANDOC_DIR = path.join(PACKAGES_DIR, `pandoc-${PANDOC_VERSION}`);
const PANDOC_EXE = path.join(PANDOC_DIR, 'pandoc.exe');
const PANDOC_TEMP_ZIP = path.join(PACKAGES_DIR, 'pandoc-temp.zip');

// Configuration - 7-Zip (for extracting .7z files)
const SEVENZIP_URL = 'https://www.7-zip.org/a/7za920.zip';
const SEVENZIP_DIR = path.join(PACKAGES_DIR, '7za');
const SEVENZIP_EXE = path.join(SEVENZIP_DIR, '7za.exe');
const SEVENZIP_TEMP_ZIP = path.join(PACKAGES_DIR, '7za-temp.zip');

// Configuration - wkhtmltopdf
const WKHTMLTOPDF_VERSION = '0.12.6-1';
const WKHTMLTOPDF_URL = `https://github.com/wkhtmltopdf/packaging/releases/download/${WKHTMLTOPDF_VERSION}/wkhtmltox-${WKHTMLTOPDF_VERSION}.mxe-cross-win64.7z`;
const WKHTMLTOPDF_DIR = path.join(PACKAGES_DIR, `wkhtmltopdf-${WKHTMLTOPDF_VERSION}`);
const WKHTMLTOPDF_EXE = path.join(WKHTMLTOPDF_DIR, 'bin', 'wkhtmltopdf.exe');
const WKHTMLTOPDF_TEMP_7Z = path.join(PACKAGES_DIR, 'wkhtmltopdf-temp.7z');

/**
 * Check if Pandoc is already installed
 */
function isPandocInstalled() {
  return fs.existsSync(PANDOC_EXE);
}

/**
 * Check if wkhtmltopdf is already installed
 */
function isWkhtmltopdfInstalled() {
  return fs.existsSync(WKHTMLTOPDF_EXE);
}

/**
 * Check if 7za is available
 */
function is7zaAvailable() {
  return fs.existsSync(SEVENZIP_EXE);
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
 * Extract ZIP file using PowerShell (Windows built-in)
 */
async function extractZip(zipPath, destDir) {
  log(`   Extracting to: ${destDir}`, colors.cyan);

  // Ensure destination directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Use PowerShell to extract (available on all Windows versions)
  const psCommand = `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`;

  try {
    await execAsync(`powershell -Command "${psCommand}"`);
    log('   Extraction complete', colors.green);
  } catch (error) {
    throw new Error(`Failed to extract ZIP: ${error.message}`);
  }
}

/**
 * Extract 7z file using 7za.exe
 */
async function extract7z(sevenZPath, destDir) {
  log(`   Extracting to: ${destDir}`, colors.cyan);

  // Ensure destination directory exists
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    // Use 7za to extract: 7za x archive.7z -oDestDir -y
    await execAsync(`"${SEVENZIP_EXE}" x "${sevenZPath}" -o"${destDir}" -y`);
    log('   Extraction complete', colors.green);
  } catch (error) {
    throw new Error(`Failed to extract 7z: ${error.message}`);
  }
}

/**
 * Move files from nested directory to target directory
 * Pandoc ZIP extracts to pandoc-x.x.x/pandoc-x.x.x-windows-x86_64/
 */
async function flattenPandocDirectory(pandocDir) {
  const entries = fs.readdirSync(pandocDir);

  // Find the nested directory (pandoc-x.x.x-windows-x86_64)
  for (const entry of entries) {
    const entryPath = path.join(pandocDir, entry);
    if (fs.statSync(entryPath).isDirectory() && entry.includes('pandoc')) {
      log(`   Flattening directory structure...`, colors.cyan);

      // Move all files from nested dir to parent
      const nestedFiles = fs.readdirSync(entryPath);
      for (const file of nestedFiles) {
        const srcPath = path.join(entryPath, file);
        const destPath = path.join(pandocDir, file);
        fs.renameSync(srcPath, destPath);
      }

      // Remove empty nested directory
      fs.rmdirSync(entryPath);
      break;
    }
  }
}

/**
 * Flatten wkhtmltopdf directory structure
 * The 7z extracts to wkhtmltox/bin/, wkhtmltox/lib/, etc.
 */
async function flattenWkhtmltopdfDirectory(wkhtmlDir) {
  const entries = fs.readdirSync(wkhtmlDir);

  // Find the wkhtmltox directory
  for (const entry of entries) {
    const entryPath = path.join(wkhtmlDir, entry);
    if (fs.statSync(entryPath).isDirectory() && entry.includes('wkhtmltox')) {
      log(`   Flattening directory structure...`, colors.cyan);

      // Move all files from nested dir to parent
      const nestedFiles = fs.readdirSync(entryPath);
      for (const file of nestedFiles) {
        const srcPath = path.join(entryPath, file);
        const destPath = path.join(wkhtmlDir, file);
        fs.renameSync(srcPath, destPath);
      }

      // Remove empty nested directory
      fs.rmdirSync(entryPath);
      break;
    }
  }
}

/**
 * Clean up temporary files
 */
function cleanup() {
  const tempFiles = [PANDOC_TEMP_ZIP, SEVENZIP_TEMP_ZIP, WKHTMLTOPDF_TEMP_7Z];

  for (const tempFile of tempFiles) {
    if (fs.existsSync(tempFile)) {
      log(`   Removing temporary file: ${path.basename(tempFile)}`, colors.cyan);
      fs.unlinkSync(tempFile);
    }
  }
}

/**
 * Setup 7za (needed for extracting .7z files)
 */
async function setup7za() {
  if (is7zaAvailable()) {
    log('✅ 7za is already available', colors.green);
    return true;
  }

  log('\n📥 Downloading 7-Zip command line tool...', colors.blue);

  try {
    await downloadFile(SEVENZIP_URL, SEVENZIP_TEMP_ZIP);
    log('✅ Download complete', colors.green);

    log('\n📦 Extracting 7za...', colors.blue);
    await extractZip(SEVENZIP_TEMP_ZIP, SEVENZIP_DIR);

    if (fs.existsSync(SEVENZIP_EXE)) {
      log('✅ 7za installed successfully!', colors.green);
      return true;
    } else {
      throw new Error('7za.exe not found after extraction');
    }
  } catch (error) {
    log(`❌ Failed to install 7za: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Setup Pandoc
 */
async function setupPandoc() {
  if (isPandocInstalled()) {
    log(`✅ Pandoc ${PANDOC_VERSION} is already installed`, colors.green);
    log(`   Location: ${PANDOC_EXE}`, colors.cyan);
    return true;
  }

  log('\n📥 Downloading Pandoc...', colors.blue);

  try {
    await downloadFile(PANDOC_URL, PANDOC_TEMP_ZIP);
    log('✅ Download complete', colors.green);

    log('\n📦 Extracting Pandoc...', colors.blue);
    await extractZip(PANDOC_TEMP_ZIP, PANDOC_DIR);

    // Flatten directory structure if needed
    await flattenPandocDirectory(PANDOC_DIR);

    if (fs.existsSync(PANDOC_EXE)) {
      log('✅ Pandoc installed successfully!', colors.green);
      log(`   Location: ${PANDOC_EXE}`, colors.cyan);

      // Get version info
      try {
        const { stdout } = await execAsync(`"${PANDOC_EXE}" --version`);
        const versionLine = stdout.split('\n')[0];
        log(`   ${versionLine}`, colors.cyan);
      } catch {
        // Version check failed, but installation succeeded
      }
      return true;
    } else {
      throw new Error('pandoc.exe not found after extraction');
    }
  } catch (error) {
    log(`❌ Failed to install Pandoc: ${error.message}`, colors.red);
    log('   You can manually download from:', colors.yellow);
    log(`   ${PANDOC_URL}`, colors.yellow);
    return false;
  }
}

/**
 * Setup wkhtmltopdf
 */
async function setupWkhtmltopdf() {
  if (isWkhtmltopdfInstalled()) {
    log(`✅ wkhtmltopdf ${WKHTMLTOPDF_VERSION} is already installed`, colors.green);
    log(`   Location: ${WKHTMLTOPDF_EXE}`, colors.cyan);
    return true;
  }

  // Need 7za to extract .7z file
  if (!is7zaAvailable()) {
    log('⚠️  7za is required to extract wkhtmltopdf', colors.yellow);
    const sevenZaInstalled = await setup7za();
    if (!sevenZaInstalled) {
      log('❌ Cannot install wkhtmltopdf without 7za', colors.red);
      return false;
    }
  }

  log('\n📥 Downloading wkhtmltopdf...', colors.blue);

  try {
    await downloadFile(WKHTMLTOPDF_URL, WKHTMLTOPDF_TEMP_7Z);
    log('✅ Download complete', colors.green);

    log('\n📦 Extracting wkhtmltopdf...', colors.blue);
    await extract7z(WKHTMLTOPDF_TEMP_7Z, WKHTMLTOPDF_DIR);

    // Flatten directory structure
    await flattenWkhtmltopdfDirectory(WKHTMLTOPDF_DIR);

    if (fs.existsSync(WKHTMLTOPDF_EXE)) {
      log('✅ wkhtmltopdf installed successfully!', colors.green);
      log(`   Location: ${WKHTMLTOPDF_EXE}`, colors.cyan);

      // Get version info
      try {
        const { stdout } = await execAsync(`"${WKHTMLTOPDF_EXE}" --version`);
        const versionLine = stdout.split('\n')[0];
        log(`   ${versionLine}`, colors.cyan);
      } catch {
        // Version check failed, but installation succeeded
      }
      return true;
    } else {
      throw new Error('wkhtmltopdf.exe not found after extraction');
    }
  } catch (error) {
    log(`❌ Failed to install wkhtmltopdf: ${error.message}`, colors.red);
    log('   You can manually download from:', colors.yellow);
    log(`   ${WKHTMLTOPDF_URL}`, colors.yellow);
    return false;
  }
}

/**
 * Main setup function
 */
async function main() {
  log('\n📄 Setting up Document Conversion Tools...', colors.blue);
  log('='.repeat(50), colors.blue);

  // Ensure packages directory exists
  if (!fs.existsSync(PACKAGES_DIR)) {
    fs.mkdirSync(PACKAGES_DIR, { recursive: true });
  }

  // Setup Pandoc
  log('\n[1/2] Pandoc', colors.blue);
  await setupPandoc();

  // Setup wkhtmltopdf (for PDF generation)
  log('\n[2/2] wkhtmltopdf (PDF engine)', colors.blue);
  await setupWkhtmltopdf();

  // Clean up all temporary files
  log('\n🧹 Cleaning up...', colors.blue);
  cleanup();

  log('\n' + '='.repeat(50), colors.blue);
  log('✨ Document conversion tools setup complete!\n', colors.green);
}

// Run setup
main().catch((error) => {
  log(`\n❌ Setup failed with error: ${error.message}`, colors.red);
  process.exit(0); // Don't fail npm install if setup fails
});
