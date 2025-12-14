/**
 * AutoCAD Plugin Deployer
 * Handles automatic deployment of the AutoCAD plugin bundle to user's ApplicationPlugins directory
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';

const BUNDLE_NAME = 'ClaudePilot.bundle';
const PLUGIN_DLL = 'ClaudePilot.AutoCAD.dll';

/**
 * Get the target path for AutoCAD plugin bundle
 * Uses user-level ApplicationPlugins (no admin required)
 */
function getBundleTargetPath(): string {
  const appData = process.env.APPDATA;
  if (!appData) {
    throw new Error('APPDATA environment variable not set');
  }
  return path.join(appData, 'Autodesk', 'ApplicationPlugins', BUNDLE_NAME);
}

/**
 * Get the source path for plugin files
 * In development: autocad-plugin/bin/Release/net47/
 * In production: resources/autocad-plugin/
 */
function getPluginSourcePath(): string {
  const isDev = !app.isPackaged;

  if (isDev) {
    // Development: use the build output directory
    return path.join(app.getAppPath(), 'autocad-plugin', 'bin', 'Release', 'net47');
  } else {
    // Production: bundled in resources
    return path.join(process.resourcesPath, 'autocad-plugin');
  }
}

/**
 * Get the source path for PackageContents.xml
 */
function getPackageContentsSourcePath(): string {
  const isDev = !app.isPackaged;

  if (isDev) {
    return path.join(app.getAppPath(), 'autocad-plugin', 'PackageContents.xml');
  } else {
    return path.join(process.resourcesPath, 'autocad-plugin', 'PackageContents.xml');
  }
}

/**
 * Check if the plugin is already deployed and up to date
 */
function isPluginDeployed(): boolean {
  const targetPath = getBundleTargetPath();
  const dllPath = path.join(targetPath, 'Contents', PLUGIN_DLL);
  const packagePath = path.join(targetPath, 'PackageContents.xml');

  return fs.existsSync(dllPath) && fs.existsSync(packagePath);
}

/**
 * Check if source plugin files exist
 */
function sourceFilesExist(): boolean {
  const sourcePath = getPluginSourcePath();
  const dllPath = path.join(sourcePath, PLUGIN_DLL);
  const packagePath = getPackageContentsSourcePath();

  return fs.existsSync(dllPath) && fs.existsSync(packagePath);
}

/**
 * Get plugin version from deployed bundle
 */
function getDeployedVersion(): string | null {
  const packagePath = path.join(getBundleTargetPath(), 'PackageContents.xml');
  if (!fs.existsSync(packagePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(packagePath, 'utf-8');
    const match = content.match(/AppVersion="([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get plugin version from source
 */
function getSourceVersion(): string | null {
  const packagePath = getPackageContentsSourcePath();
  if (!fs.existsSync(packagePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(packagePath, 'utf-8');
    const match = content.match(/AppVersion="([^"]+)"/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check if an update is needed
 */
function needsUpdate(): boolean {
  if (!isPluginDeployed()) {
    return true;
  }

  const deployedVersion = getDeployedVersion();
  const sourceVersion = getSourceVersion();

  if (!deployedVersion || !sourceVersion) {
    return true;
  }

  return deployedVersion !== sourceVersion;
}

/**
 * Copy a file with directory creation
 */
function copyFile(src: string, dest: string): void {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

/**
 * Copy directory recursively
 */
function copyDirectory(src: string, dest: string): void {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

/**
 * Deploy the AutoCAD plugin bundle
 */
export function deployAutoCADPlugin(): { success: boolean; message: string; path?: string } {
  try {
    // Check if source files exist
    if (!sourceFilesExist()) {
      return {
        success: false,
        message: 'AutoCAD plugin source files not found. Please build the plugin first.',
      };
    }

    // Check if update is needed
    if (!needsUpdate()) {
      return {
        success: true,
        message: 'AutoCAD plugin is already deployed and up to date.',
        path: getBundleTargetPath(),
      };
    }

    const targetPath = getBundleTargetPath();
    const contentsPath = path.join(targetPath, 'Contents');

    // Create bundle directory structure
    if (!fs.existsSync(contentsPath)) {
      fs.mkdirSync(contentsPath, { recursive: true });
    }

    // Copy PackageContents.xml to bundle root
    const packageSource = getPackageContentsSourcePath();
    const packageDest = path.join(targetPath, 'PackageContents.xml');
    copyFile(packageSource, packageDest);

    // Copy all files from plugin source to Contents folder
    const sourcePath = getPluginSourcePath();
    const sourceFiles = fs.readdirSync(sourcePath);

    for (const file of sourceFiles) {
      const srcFile = path.join(sourcePath, file);
      const destFile = path.join(contentsPath, file);

      if (fs.statSync(srcFile).isFile()) {
        copyFile(srcFile, destFile);
      }
    }

    return {
      success: true,
      message: `AutoCAD plugin deployed successfully. Restart AutoCAD to load the plugin.`,
      path: targetPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to deploy AutoCAD plugin: ${message}`,
    };
  }
}

/**
 * Remove the deployed AutoCAD plugin
 */
export function removeAutoCADPlugin(): { success: boolean; message: string } {
  try {
    const targetPath = getBundleTargetPath();

    if (!fs.existsSync(targetPath)) {
      return {
        success: true,
        message: 'AutoCAD plugin is not deployed.',
      };
    }

    fs.rmSync(targetPath, { recursive: true, force: true });

    return {
      success: true,
      message: 'AutoCAD plugin removed successfully.',
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to remove AutoCAD plugin: ${message}`,
    };
  }
}

/**
 * Get deployment status
 */
export function getAutoCADPluginStatus(): {
  deployed: boolean;
  version: string | null;
  path: string;
  sourceAvailable: boolean;
  sourceVersion: string | null;
  needsUpdate: boolean;
} {
  return {
    deployed: isPluginDeployed(),
    version: getDeployedVersion(),
    path: getBundleTargetPath(),
    sourceAvailable: sourceFilesExist(),
    sourceVersion: getSourceVersion(),
    needsUpdate: needsUpdate(),
  };
}
