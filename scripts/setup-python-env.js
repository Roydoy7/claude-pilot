/**
 * Setup Python environment script
 * Automatically installs Python packages from python-requirements.txt
 * Runs during npm install (postinstall hook)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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

function getPythonPath() {
  const pythonDir = path.join(
    __dirname,
    '..',
    'packages',
    'python-3.13.9-embed-amd64'
  );

  const pythonExe = path.join(pythonDir, 'python.exe');

  return {
    pythonDir,
    pythonExe,
    exists: fs.existsSync(pythonExe),
  };
}

function getRequirementsPath() {
  return path.join(__dirname, '..', 'python-requirements.txt');
}

async function checkPythonAvailable() {
  const { pythonExe, exists } = getPythonPath();

  if (!exists) {
    log('❌ Embedded Python not found!', colors.red);
    log(`Expected location: ${pythonExe}`, colors.yellow);
    log('Please download Python embedded version first.', colors.yellow);
    return false;
  }

  log('✅ Embedded Python found', colors.green);
  return true;
}

async function installPip() {
  const { pythonExe, pythonDir } = getPythonPath();
  const getPipPath = path.join(__dirname, '..', 'packages', 'get-pip.py');

  if (!fs.existsSync(getPipPath)) {
    log('❌ get-pip.py not found!', colors.red);
    log(`   Expected location: ${getPipPath}`, colors.yellow);
    return false;
  }

  log('\n📦 Installing pip...', colors.blue);
  log(`   Using: ${getPipPath}`, colors.cyan);

  return new Promise((resolve) => {
    const process = spawn(pythonExe, [getPipPath]);

    process.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    process.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    process.on('close', (code) => {
      if (code === 0) {
        log('✅ pip installed successfully', colors.green);
        resolve(true);
      } else {
        log('❌ Failed to install pip', colors.red);
        log(`   Exit code: ${code}`, colors.yellow);
        resolve(false);
      }
    });

    process.on('error', (error) => {
      log('❌ Error installing pip', colors.red);
      log(`   ${error.message}`, colors.yellow);
      resolve(false);
    });
  });
}

async function checkPipAvailable() {
  const { pythonExe } = getPythonPath();

  return new Promise((resolve) => {
    const process = spawn(pythonExe, ['-m', 'pip', '--version']);

    let output = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.stderr.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', (code) => {
      if (code === 0) {
        log('✅ pip is available', colors.green);
        log(`   ${output.trim()}`, colors.cyan);
        resolve(true);
      } else {
        log('⚠️  pip is not installed', colors.yellow);
        resolve(false);
      }
    });

    process.on('error', () => {
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

    const process = spawn(pythonExe, args, {
      cwd: pythonDir,
      stdio: 'inherit',
    });

    process.on('close', async (code) => {
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

    process.on('error', (error) => {
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

    const process = spawn(pythonExe, args, {
      cwd: pythonDir,
      stdio: 'inherit', // Show pip output in real-time
    });

    process.on('close', (code) => {
      if (code === 0) {
        log('\n✅ Python packages installed successfully', colors.green);
        resolve(true);
      } else {
        log('\n❌ Failed to install Python packages', colors.red);
        log(`   Exit code: ${code}`, colors.yellow);
        resolve(false);
      }
    });

    process.on('error', (error) => {
      log('\n❌ Error installing Python packages', colors.red);
      log(`   ${error.message}`, colors.yellow);
      resolve(false);
    });
  });
}

async function listInstalledPackages() {
  const { pythonExe, pythonDir } = getPythonPath();

  return new Promise((resolve) => {
    const process = spawn(pythonExe, ['-m', 'pip', 'list', '--format=json'], {
      cwd: pythonDir,
    });

    let output = '';

    process.stdout.on('data', (data) => {
      output += data.toString();
    });

    process.on('close', (code) => {
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

    process.on('error', () => {
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
    let content = fs.readFileSync(pthFile, 'utf8');

    // Check if site-packages is already in the path
    if (content.includes('site-packages')) {
      log('✅ site-packages already configured in python313._pth', colors.green);
      return true;
    }

    // Add site-packages to the path
    const lines = content.split('\n');
    const newLines = [];

    for (const line of lines) {
      newLines.push(line);
      // Add site-packages after the current directory (.)
      if (line.trim() === '.') {
        newLines.push('site-packages');
      }
    }

    fs.writeFileSync(pthFile, newLines.join('\n'), 'utf8');
    log('✅ Added site-packages to python313._pth', colors.green);
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

  // Check if Python exists
  const pythonAvailable = await checkPythonAvailable();
  if (!pythonAvailable) {
    log('\n⚠️  Skipping Python setup (Python not found)', colors.yellow);
    log(
      '   This is normal if you haven\'t set up Python yet.',
      colors.yellow
    );
    log(
      '   The application will still work without Python tools.',
      colors.yellow
    );
    return;
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
