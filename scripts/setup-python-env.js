/**
 * Setup Python environment script
 * Downloads Python embedded version and installs packages from python-requirements.txt
 * Runs during npm install (postinstall hook)
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');
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

// Configuration
const PYTHON_VERSION = '3.13.11';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PACKAGES_DIR = path.join(__dirname, '..', 'packages');
const PYTHON_DIR = path.join(PACKAGES_DIR, `python-${PYTHON_VERSION}-embed-amd64`);
const PYTHON_EXE = path.join(PYTHON_DIR, 'python.exe');
const TEMP_ZIP = path.join(PACKAGES_DIR, 'python-temp.zip');
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';
const GET_PIP_PATH = path.join(PACKAGES_DIR, 'get-pip.py');

function getPythonPath() {
  return {
    pythonDir: PYTHON_DIR,
    pythonExe: PYTHON_EXE,
    exists: fs.existsSync(PYTHON_EXE),
  };
}

function getRequirementsPath() {
  return path.join(__dirname, '..', 'python-requirements.txt');
}

/**
 * Download file from URL
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
 * Download and setup Python
 */
async function downloadPython() {
  log('\n📥 Downloading Python...', colors.blue);

  // Ensure packages directory exists
  if (!fs.existsSync(PACKAGES_DIR)) {
    fs.mkdirSync(PACKAGES_DIR, { recursive: true });
  }

  try {
    // Download Python ZIP
    await downloadFile(PYTHON_URL, TEMP_ZIP);
    log('✅ Python download complete', colors.green);

    // Extract ZIP
    log('\n📦 Extracting Python...', colors.blue);
    await extractZip(TEMP_ZIP, PYTHON_DIR);

    // Verify installation
    if (fs.existsSync(PYTHON_EXE)) {
      log('✅ Python extracted successfully!', colors.green);
      log(`   Location: ${PYTHON_EXE}`, colors.cyan);
      return true;
    } else {
      throw new Error('python.exe not found after extraction');
    }
  } catch (error) {
    log(`\n❌ Failed to download Python: ${error.message}`, colors.red);
    log('   You can manually download from:', colors.yellow);
    log(`   ${PYTHON_URL}`, colors.yellow);
    return false;
  } finally {
    // Clean up temp ZIP
    if (fs.existsSync(TEMP_ZIP)) {
      fs.unlinkSync(TEMP_ZIP);
    }
  }
}

/**
 * Download get-pip.py if not exists
 */
async function downloadGetPip() {
  if (fs.existsSync(GET_PIP_PATH)) {
    log('✅ get-pip.py already exists', colors.green);
    return true;
  }

  log('\n📥 Downloading get-pip.py...', colors.blue);

  try {
    await downloadFile(GET_PIP_URL, GET_PIP_PATH);
    log('✅ get-pip.py downloaded', colors.green);
    return true;
  } catch (error) {
    log(`❌ Failed to download get-pip.py: ${error.message}`, colors.red);
    return false;
  }
}

async function checkPythonAvailable() {
  const { pythonExe, exists } = getPythonPath();

  if (!exists) {
    log('⚠️  Embedded Python not found, will download...', colors.yellow);
    return false;
  }

  log('✅ Embedded Python found', colors.green);
  return true;
}

async function installPip() {
  const { pythonExe, pythonDir } = getPythonPath();

  // Download get-pip.py if needed
  const getPipAvailable = await downloadGetPip();
  if (!getPipAvailable) {
    return false;
  }

  log('\n📦 Installing pip...', colors.blue);
  log(`   Using: ${GET_PIP_PATH}`, colors.cyan);

  return new Promise((resolve) => {
    const proc = spawn(pythonExe, [GET_PIP_PATH]);

    proc.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log('✅ pip installed successfully', colors.green);
        resolve(true);
      } else {
        log('❌ Failed to install pip', colors.red);
        log(`   Exit code: ${code}`, colors.yellow);
        resolve(false);
      }
    });

    proc.on('error', (error) => {
      log('❌ Error installing pip', colors.red);
      log(`   ${error.message}`, colors.yellow);
      resolve(false);
    });
  });
}

async function checkPipAvailable() {
  const { pythonExe } = getPythonPath();

  return new Promise((resolve) => {
    const proc = spawn(pythonExe, ['-m', 'pip', '--version']);

    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log('✅ pip is available', colors.green);
        log(`   ${output.trim()}`, colors.cyan);
        resolve(true);
      } else {
        log('⚠️  pip is not installed', colors.yellow);
        resolve(false);
      }
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

async function installPywin32() {
  const { pythonExe, pythonDir } = getPythonPath();
  // Install to Lib\site-packages (standard Python location) instead of root site-packages
  // This ensures .pth files are processed correctly by the site module
  const sitePackagesDir = path.join(pythonDir, 'Lib', 'site-packages');

  log('\n📦 Installing pywin32 for xlwings support...', colors.blue);
  log('   Installing pywin32 with all dependencies', colors.cyan);

  return new Promise((resolve) => {
    // Install pywin32 normally WITHOUT --no-deps
    // The --no-deps flag was causing Python modules (win32api, etc.) not to be installed
    // Only DLL files were installed, which caused xlwings to fail
    const args = [
      '-m',
      'pip',
      'install',
      'pywin32>=305',
      '--target',
      sitePackagesDir,
      '--no-warn-script-location',
    ];

    log(`   Command: python ${args.join(' ')}`, colors.cyan);

    const proc = spawn(pythonExe, args, {
      cwd: pythonDir,
      stdio: 'inherit',
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        log('✅ pywin32 installed successfully', colors.green);
        log('   pywin32 is ready for xlwings use', colors.cyan);
        // Note: We skip the post-install script for embeddable Python
        // It's not needed for xlwings to work, and it may fail due to embeddable Python limitations
        // xlwings can use pywin32 directly without the post-install setup
        resolve(true);
      } else {
        log('❌ Failed to install pywin32', colors.red);
        log(`   Exit code: ${code}`, colors.yellow);
        log('   xlwings will not be available', colors.yellow);
        resolve(false);
      }
    });

    proc.on('error', (error) => {
      log('❌ Error installing pywin32', colors.red);
      log(`   ${error.message}`, colors.yellow);
      resolve(false);
    });
  });
}

async function installRequirements() {
  const { pythonExe, pythonDir } = getPythonPath();
  const requirementsPath = getRequirementsPath();

  if (!fs.existsSync(requirementsPath)) {
    log('⚠️  python-requirements.txt not found', colors.yellow);
    log('   Skipping Python package installation', colors.yellow);
    return true;
  }

  // Create Lib\site-packages directory (standard Python location)
  // This ensures .pth files are processed correctly by the site module
  const sitePackagesDir = path.join(pythonDir, 'Lib', 'site-packages');
  if (!fs.existsSync(sitePackagesDir)) {
    fs.mkdirSync(sitePackagesDir, { recursive: true });
    log(`   Created directory: ${sitePackagesDir}`, colors.cyan);
  }

  log('\n📦 Installing Python packages...', colors.blue);
  log(`   Reading requirements from: ${requirementsPath}`, colors.cyan);
  log(`   Installing to: ${sitePackagesDir}`, colors.cyan);

  return new Promise((resolve) => {
    const args = [
      '-m',
      'pip',
      'install',
      '-r',
      requirementsPath,
      '--target',
      sitePackagesDir,
      '--no-warn-script-location',
      '--ignore-installed', // Force reinstall to site-packages
    ];

    log(`   Command: python ${args.join(' ')}`, colors.cyan);

    const proc = spawn(pythonExe, args, {
      cwd: pythonDir,
      stdio: 'inherit', // Show pip output in real-time
    });

    proc.on('close', (code) => {
      if (code === 0) {
        log('\n✅ Python packages installed successfully', colors.green);
        resolve(true);
      } else {
        log('\n❌ Failed to install Python packages', colors.red);
        log(`   Exit code: ${code}`, colors.yellow);
        resolve(false);
      }
    });

    proc.on('error', (error) => {
      log('\n❌ Error installing Python packages', colors.red);
      log(`   ${error.message}`, colors.yellow);
      resolve(false);
    });
  });
}

async function listInstalledPackages() {
  const { pythonExe, pythonDir } = getPythonPath();

  return new Promise((resolve) => {
    const proc = spawn(pythonExe, ['-m', 'pip', 'list', '--format=json'], {
      cwd: pythonDir,
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        try {
          const packages = JSON.parse(output);
          log('\n📋 Installed Python packages:', colors.blue);
          packages.forEach((pkg) => {
            log(`   ${pkg.name} (${pkg.version})`, colors.cyan);
          });
          resolve(true);
        } catch {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

async function ensureSitePackagesInPath() {
  const { pythonDir } = getPythonPath();
  const pthFile = path.join(pythonDir, 'python313._pth');

  if (!fs.existsSync(pthFile)) {
    log('⚠️  python313._pth not found, skipping path configuration', colors.yellow);
    return false;
  }

  try {
    const content = fs.readFileSync(pthFile, 'utf8');

    // Check if site module is enabled and Lib/site-packages is configured
    // Enabling 'import site' is crucial for:
    // 1. pip to work correctly
    // 2. .pth files to be processed (e.g., pywin32.pth adds win32 paths)
    const hasSiteImport = content.includes('import site') && !content.match(/^#\s*import site/m);
    const hasSitePackages = content.includes('Lib/site-packages') || content.includes('Lib\\site-packages');

    if (!hasSiteImport || !hasSitePackages) {
      // Rewrite with correct configuration
      const newContent = [
        'python313.zip',
        '.',
        'Lib/site-packages',
        '',
        '# Enable site module for pip and pywin32 to work',
        'import site',
        '',
      ].join('\n');
      fs.writeFileSync(pthFile, newContent, 'utf8');
      log('✅ Configured python313._pth with site module enabled', colors.green);
      log('   This allows pip and pywin32 to work correctly', colors.cyan);
    } else {
      log('✅ python313._pth already configured correctly', colors.green);
    }

    return true;
  } catch (error) {
    log('❌ Failed to modify python313._pth', colors.red);
    log(`   ${error.message}`, colors.yellow);
    return false;
  }
}

async function main() {
  log('\n🐍 Setting up Python environment...', colors.blue);
  log('='.repeat(50), colors.blue);

  // Check if Python exists, download if not
  let pythonAvailable = await checkPythonAvailable();
  if (!pythonAvailable) {
    const downloaded = await downloadPython();
    if (!downloaded) {
      log('\n⚠️  Skipping Python setup (download failed)', colors.yellow);
      log(
        '   The application will still work without Python tools.',
        colors.yellow
      );
      return;
    }
    pythonAvailable = true;
  }

  // Ensure site-packages is in Python path
  log('\n🔧 Configuring Python path...', colors.blue);
  await ensureSitePackagesInPath();

  // Check if pip exists, install if not
  let pipAvailable = await checkPipAvailable();
  if (!pipAvailable) {
    log('\n⚠️  pip not found, installing...', colors.yellow);
    const pipInstalled = await installPip();
    if (!pipInstalled) {
      log('\n❌ Failed to install pip, skipping package installation', colors.red);
      return;
    }
    pipAvailable = true;
  }

  // Install pywin32 first (required for xlwings)
  log('\n📋 Step 1: Installing pywin32...', colors.blue);
  await installPywin32();

  // Install packages from requirements.txt
  log('\n📋 Step 2: Installing other packages...', colors.blue);
  const installSuccess = await installRequirements();

  if (installSuccess) {
    // List installed packages
    await listInstalledPackages();
  }

  log('\n' + '='.repeat(50), colors.blue);
  log('✨ Python environment setup complete!\n', colors.green);
}

// Run setup
main().catch((error) => {
  log('\n❌ Setup failed with error:', colors.red);
  log(`   ${error.message}`, colors.yellow);
  process.exit(0); // Don't fail npm install if Python setup fails
});
