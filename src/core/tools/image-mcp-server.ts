/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Image MCP Server - Custom tool for image processing operations
 * Uses Claude Agent SDK's MCP server pattern for tool integration
 * Features: extract from documents, compress, resize, convert, optimize for LLM
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { existsSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import AdmZip from 'adm-zip';

/**
 * Supported image formats
 */
const SUPPORTED_IMAGE_FORMATS = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'avif'] as const;
type ImageFormat = (typeof SUPPORTED_IMAGE_FORMATS)[number];

/**
 * Image info result
 */
interface ImageInfo {
  width: number;
  height: number;
  format: string;
  channels: number;
  hasAlpha: boolean;
  size: number;
  space?: string;
  density?: number;
}

/**
 * Extracted image info
 */
interface ExtractedImage {
  name: string;
  outputPath: string;
  format: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Image operation result
 */
interface ImageOperationResult {
  success: boolean;
  operation: string;
  inputFile?: string;
  outputFile?: string;

  // Info result
  info?: ImageInfo;

  // Extract result
  extractedImages?: ExtractedImage[];
  totalCount?: number;

  // Compression/resize result
  originalSize?: number;
  newSize?: number;
  compressionRatio?: string;

  // Base64 result
  base64Data?: string;
  mimeType?: string;

  // Download result
  url?: string;
  contentType?: string;

  error?: string;
  executionTime: number;
}

/**
 * Get image info using sharp
 */
async function getImageInfo(inputFile: string): Promise<ImageOperationResult> {
  const startTime = Date.now();

  if (!existsSync(inputFile)) {
    return {
      success: false,
      operation: 'get-info',
      inputFile,
      error: `File not found: ${inputFile}`,
      executionTime: Date.now() - startTime,
    };
  }

  try {
    const metadata = await sharp(inputFile).metadata();
    const stats = await fs.stat(inputFile);

    return {
      success: true,
      operation: 'get-info',
      inputFile,
      info: {
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        format: metadata.format ?? 'unknown',
        channels: metadata.channels ?? 0,
        hasAlpha: metadata.hasAlpha ?? false,
        size: stats.size,
        space: metadata.space,
        density: metadata.density,
      },
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'get-info',
      inputFile,
      error: `Failed to read image: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Extract images from Office documents (PPTX, DOCX, XLSX)
 */
async function extractFromDocument(
  inputFile: string,
  outputDir: string
): Promise<ImageOperationResult> {
  const startTime = Date.now();

  if (!existsSync(inputFile)) {
    return {
      success: false,
      operation: 'extract-from-document',
      inputFile,
      error: `File not found: ${inputFile}`,
      executionTime: Date.now() - startTime,
    };
  }

  try {
    // Create output directory if it doesn't exist
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const zip = new AdmZip(inputFile);
    const entries = zip.getEntries();
    const extractedImages: ExtractedImage[] = [];

    // Media directories in Office documents
    // PPTX: ppt/media/
    // DOCX: word/media/
    // XLSX: xl/media/
    const mediaPattern = /(ppt|word|xl)\/media\//;
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp', '.emf', '.wmf'];

    for (const entry of entries) {
      if (mediaPattern.test(entry.entryName)) {
        const ext = path.extname(entry.name).toLowerCase();
        if (imageExtensions.includes(ext)) {
          // Extract to output directory
          const outputPath = path.join(outputDir, entry.name);
          zip.extractEntryTo(entry.entryName, outputDir, false, true);

          // Get image info
          try {
            // For EMF/WMF files, we can't get metadata with sharp
            if (ext === '.emf' || ext === '.wmf') {
              const buffer = entry.getData();
              extractedImages.push({
                name: entry.name,
                outputPath,
                format: ext.replace('.', ''),
                width: 0,
                height: 0,
                sizeBytes: buffer.length,
              });
            } else {
              const metadata = await sharp(outputPath).metadata();
              const stats = await fs.stat(outputPath);
              extractedImages.push({
                name: entry.name,
                outputPath,
                format: metadata.format ?? ext.replace('.', ''),
                width: metadata.width ?? 0,
                height: metadata.height ?? 0,
                sizeBytes: stats.size,
              });
            }
          } catch {
            // If we can't get metadata, still include the file
            const buffer = entry.getData();
            extractedImages.push({
              name: entry.name,
              outputPath,
              format: ext.replace('.', ''),
              width: 0,
              height: 0,
              sizeBytes: buffer.length,
            });
          }
        }
      }
    }

    return {
      success: true,
      operation: 'extract-from-document',
      inputFile,
      outputFile: outputDir,
      extractedImages,
      totalCount: extractedImages.length,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'extract-from-document',
      inputFile,
      error: `Failed to extract images: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Compress an image
 */
async function compressImage(
  inputFile: string,
  outputFile: string,
  quality: number = 80
): Promise<ImageOperationResult> {
  const startTime = Date.now();

  if (!existsSync(inputFile)) {
    return {
      success: false,
      operation: 'compress',
      inputFile,
      error: `File not found: ${inputFile}`,
      executionTime: Date.now() - startTime,
    };
  }

  try {
    const originalStats = await fs.stat(inputFile);
    const metadata = await sharp(inputFile).metadata();
    const format = metadata.format;

    let sharpInstance = sharp(inputFile);

    // Apply format-specific compression
    switch (format) {
      case 'jpeg':
        sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ quality, compressionLevel: 9 });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality });
        break;
      default:
        // Default to JPEG for best compression
        sharpInstance = sharpInstance.jpeg({ quality, mozjpeg: true });
    }

    await sharpInstance.toFile(outputFile);
    const newStats = await fs.stat(outputFile);

    const ratio = ((1 - newStats.size / originalStats.size) * 100).toFixed(1);

    return {
      success: true,
      operation: 'compress',
      inputFile,
      outputFile,
      originalSize: originalStats.size,
      newSize: newStats.size,
      compressionRatio: `${ratio}%`,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'compress',
      inputFile,
      error: `Failed to compress image: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Resize an image
 */
async function resizeImage(
  inputFile: string,
  outputFile: string,
  width?: number,
  height?: number,
  fit: 'cover' | 'contain' | 'fill' | 'inside' | 'outside' = 'inside'
): Promise<ImageOperationResult> {
  const startTime = Date.now();

  if (!existsSync(inputFile)) {
    return {
      success: false,
      operation: 'resize',
      inputFile,
      error: `File not found: ${inputFile}`,
      executionTime: Date.now() - startTime,
    };
  }

  if (!width && !height) {
    return {
      success: false,
      operation: 'resize',
      inputFile,
      error: 'At least one of width or height must be specified',
      executionTime: Date.now() - startTime,
    };
  }

  try {
    const originalStats = await fs.stat(inputFile);

    await sharp(inputFile)
      .resize(width, height, { fit, withoutEnlargement: true })
      .toFile(outputFile);

    const newStats = await fs.stat(outputFile);
    const newMetadata = await sharp(outputFile).metadata();

    return {
      success: true,
      operation: 'resize',
      inputFile,
      outputFile,
      originalSize: originalStats.size,
      newSize: newStats.size,
      info: {
        width: newMetadata.width ?? 0,
        height: newMetadata.height ?? 0,
        format: newMetadata.format ?? 'unknown',
        channels: newMetadata.channels ?? 0,
        hasAlpha: newMetadata.hasAlpha ?? false,
        size: newStats.size,
      },
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'resize',
      inputFile,
      error: `Failed to resize image: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Convert image format
 */
async function convertImage(
  inputFile: string,
  outputFile: string,
  format: ImageFormat,
  quality: number = 80
): Promise<ImageOperationResult> {
  const startTime = Date.now();

  if (!existsSync(inputFile)) {
    return {
      success: false,
      operation: 'convert',
      inputFile,
      error: `File not found: ${inputFile}`,
      executionTime: Date.now() - startTime,
    };
  }

  try {
    const originalStats = await fs.stat(inputFile);
    let sharpInstance = sharp(inputFile);

    // Apply format conversion
    switch (format) {
      case 'jpeg':
      case 'jpg':
        sharpInstance = sharpInstance.jpeg({ quality });
        break;
      case 'png':
        sharpInstance = sharpInstance.png({ quality });
        break;
      case 'webp':
        sharpInstance = sharpInstance.webp({ quality });
        break;
      case 'avif':
        sharpInstance = sharpInstance.avif({ quality });
        break;
      case 'gif':
        sharpInstance = sharpInstance.gif();
        break;
      case 'tiff':
        sharpInstance = sharpInstance.tiff({ quality });
        break;
      default:
        return {
          success: false,
          operation: 'convert',
          inputFile,
          error: `Unsupported format: ${format}`,
          executionTime: Date.now() - startTime,
        };
    }

    await sharpInstance.toFile(outputFile);
    const newStats = await fs.stat(outputFile);

    return {
      success: true,
      operation: 'convert',
      inputFile,
      outputFile,
      originalSize: originalStats.size,
      newSize: newStats.size,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'convert',
      inputFile,
      error: `Failed to convert image: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Optimize image for LLM viewing - compress and return as base64
 */
async function optimizeForLLM(
  inputFile: string,
  maxWidth: number = 1024,
  maxHeight: number = 1024,
  quality: number = 70
): Promise<ImageOperationResult> {
  const startTime = Date.now();

  if (!existsSync(inputFile)) {
    return {
      success: false,
      operation: 'optimize-for-llm',
      inputFile,
      error: `File not found: ${inputFile}`,
      executionTime: Date.now() - startTime,
    };
  }

  try {
    const originalStats = await fs.stat(inputFile);

    // Resize and compress to JPEG (best for LLM viewing)
    const buffer = await sharp(inputFile)
      .resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    const base64 = buffer.toString('base64');
    const ratio = ((1 - buffer.length / originalStats.size) * 100).toFixed(1);

    return {
      success: true,
      operation: 'optimize-for-llm',
      inputFile,
      originalSize: originalStats.size,
      newSize: buffer.length,
      compressionRatio: `${ratio}%`,
      base64Data: base64,
      mimeType: 'image/jpeg',
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'optimize-for-llm',
      inputFile,
      error: `Failed to optimize image: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Download image from URL
 */
async function downloadImage(
  url: string,
  outputFile: string
): Promise<ImageOperationResult> {
  const startTime = Date.now();

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return {
        success: false,
        operation: 'download',
        url,
        error: `Invalid URL protocol: ${parsedUrl.protocol}. Only http and https are supported.`,
        executionTime: Date.now() - startTime,
      };
    }

    // Fetch the image
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return {
        success: false,
        operation: 'download',
        url,
        error: `HTTP error: ${response.status} ${response.statusText}`,
        executionTime: Date.now() - startTime,
      };
    }

    const contentType = response.headers.get('content-type') ?? 'application/octet-stream';

    // Verify it's an image
    if (!contentType.startsWith('image/')) {
      return {
        success: false,
        operation: 'download',
        url,
        error: `Not an image. Content-Type: ${contentType}`,
        executionTime: Date.now() - startTime,
      };
    }

    // Get image data as ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Create output directory if needed
    const outputDir = path.dirname(outputFile);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Write to file
    await fs.writeFile(outputFile, buffer);

    // Get image metadata
    const metadata = await sharp(outputFile).metadata();
    const stats = await fs.stat(outputFile);

    return {
      success: true,
      operation: 'download',
      url,
      outputFile,
      contentType,
      newSize: stats.size,
      info: {
        width: metadata.width ?? 0,
        height: metadata.height ?? 0,
        format: metadata.format ?? 'unknown',
        channels: metadata.channels ?? 0,
        hasAlpha: metadata.hasAlpha ?? false,
        size: stats.size,
        space: metadata.space,
        density: metadata.density,
      },
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'download',
      url,
      error: `Failed to download image: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Format result for LLM consumption
 */
function formatResultForLLM(result: ImageOperationResult): string {
  const lines: string[] = [];

  lines.push(`# Image ${result.operation} Result\n`);
  lines.push(`**Status**: ${result.success ? 'Success' : 'Failed'}`);
  lines.push(`**Execution Time**: ${result.executionTime}ms`);

  if (result.inputFile) {
    lines.push(`**Input File**: ${result.inputFile}`);
  }

  if (result.outputFile) {
    lines.push(`**Output File**: ${result.outputFile}`);
  }

  // Image info
  if (result.info) {
    lines.push('\n## Image Information\n');
    lines.push(`- **Dimensions**: ${result.info.width} x ${result.info.height}`);
    lines.push(`- **Format**: ${result.info.format}`);
    lines.push(`- **Channels**: ${result.info.channels}`);
    lines.push(`- **Has Alpha**: ${result.info.hasAlpha}`);
    lines.push(`- **Size**: ${Math.round(result.info.size / 1024)}KB`);
    if (result.info.space) {
      lines.push(`- **Color Space**: ${result.info.space}`);
    }
    if (result.info.density) {
      lines.push(`- **DPI**: ${result.info.density}`);
    }
  }

  // Extracted images
  if (result.extractedImages && result.extractedImages.length > 0) {
    lines.push('\n## Extracted Images\n');
    lines.push(`**Total Count**: ${result.totalCount}\n`);
    lines.push('| Name | Format | Dimensions | Size |');
    lines.push('|------|--------|------------|------|');
    for (const img of result.extractedImages) {
      const dims = img.width > 0 ? `${img.width}x${img.height}` : 'N/A';
      lines.push(`| ${img.name} | ${img.format} | ${dims} | ${Math.round(img.sizeBytes / 1024)}KB |`);
    }
  }

  // Compression info
  if (result.originalSize && result.newSize) {
    lines.push('\n## Size Information\n');
    lines.push(`- **Original Size**: ${Math.round(result.originalSize / 1024)}KB`);
    lines.push(`- **New Size**: ${Math.round(result.newSize / 1024)}KB`);
    if (result.compressionRatio) {
      lines.push(`- **Compression Ratio**: ${result.compressionRatio}`);
    }
  }

  // Base64 data (truncated for display)
  if (result.base64Data) {
    lines.push('\n## Base64 Data\n');
    lines.push(`**MIME Type**: ${result.mimeType}`);
    lines.push(`**Data Length**: ${result.base64Data.length} characters`);
    lines.push('\n```');
    lines.push(`data:${result.mimeType};base64,${result.base64Data.substring(0, 100)}...`);
    lines.push('```');
    lines.push('\n*Note: Full base64 data is available in the result for embedding in messages.*');
  }

  // Download info
  if (result.url) {
    lines.push(`**URL**: ${result.url}`);
  }
  if (result.contentType) {
    lines.push(`**Content-Type**: ${result.contentType}`);
  }

  // Error
  if (result.error) {
    lines.push('\n## Error\n');
    lines.push(result.error);
  }

  return lines.join('\n');
}

/**
 * Create the Image MCP Server
 */
function createImageMcpServer() {
  return createSdkMcpServer({
    name: 'image',
    version: '1.0.0',
    tools: [
      tool(
        'process',
        `Process images with various operations.

Operations:
- **get-info**: Get image metadata (dimensions, format, size, etc.)
- **download**: Download image from URL and save to file
- **extract-from-document**: Extract images from Office documents (PPTX, DOCX, XLSX)
- **compress**: Compress image to reduce file size
- **resize**: Resize image to specified dimensions
- **convert**: Convert image to different format
- **optimize-for-llm**: Optimize image for LLM viewing (compress + resize + return base64)

Examples:
1. Get image info:
   operation: "get-info", inputFile: "photo.jpg"

2. Download image from URL:
   operation: "download", url: "https://example.com/image.jpg", outputFile: "downloaded.jpg"

3. Extract images from PowerPoint:
   operation: "extract-from-document", inputFile: "presentation.pptx", outputDirectory: "./extracted"

4. Compress an image:
   operation: "compress", inputFile: "large.jpg", outputFile: "small.jpg", quality: 75

5. Resize an image:
   operation: "resize", inputFile: "photo.jpg", outputFile: "thumb.jpg", width: 300, height: 200

6. Convert PNG to WebP:
   operation: "convert", inputFile: "image.png", outputFile: "image.webp", format: "webp"

7. Optimize for LLM viewing:
   operation: "optimize-for-llm", inputFile: "large-photo.jpg", maxWidth: 800, maxHeight: 600

Supported formats: JPEG, PNG, WebP, GIF, TIFF, AVIF`,
        {
          operation: z.enum([
            'get-info',
            'download',
            'extract-from-document',
            'compress',
            'resize',
            'convert',
            'optimize-for-llm',
          ]).describe('The operation to perform'),
          inputFile: z.string().optional().describe('Input file path (image or document, not needed for download)'),
          url: z.string().optional().describe('URL to download image from (for download operation)'),
          outputFile: z.string().optional().describe('Output file path (for compress, resize, convert)'),
          outputDirectory: z.string().optional().describe('Output directory (for extract-from-document)'),
          width: z.number().optional().describe('Target width in pixels (for resize)'),
          height: z.number().optional().describe('Target height in pixels (for resize)'),
          fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional()
            .describe('Resize fit mode (default: inside)'),
          format: z.enum(['jpeg', 'jpg', 'png', 'webp', 'gif', 'tiff', 'avif']).optional()
            .describe('Target format (for convert)'),
          quality: z.number().min(1).max(100).optional()
            .describe('Quality 1-100 (for compress, convert, optimize-for-llm, default: 80)'),
          maxWidth: z.number().optional()
            .describe('Max width for optimize-for-llm (default: 1024)'),
          maxHeight: z.number().optional()
            .describe('Max height for optimize-for-llm (default: 1024)'),
          workingDirectory: z.string().optional().describe('Working directory for relative paths'),
        },
        async (args) => {
          const {
            operation,
            inputFile,
            url,
            outputFile,
            outputDirectory,
            width,
            height,
            fit,
            format,
            quality,
            maxWidth,
            maxHeight,
            workingDirectory,
          } = args;

          // Resolve file paths
          const resolveFilePath = (filePath: string): string => {
            if (path.isAbsolute(filePath)) return filePath;
            return workingDirectory ? path.join(workingDirectory, filePath) : filePath;
          };

          const resolvedInputFile = inputFile ? resolveFilePath(inputFile) : undefined;
          const resolvedOutputFile = outputFile ? resolveFilePath(outputFile) : undefined;
          const resolvedOutputDir = outputDirectory ? resolveFilePath(outputDirectory) : undefined;

          let result: ImageOperationResult;

          switch (operation) {
            case 'get-info':
              if (!resolvedInputFile) {
                result = {
                  success: false,
                  operation: 'get-info',
                  error: 'inputFile is required for get-info operation',
                  executionTime: 0,
                };
              } else {
                result = await getImageInfo(resolvedInputFile);
              }
              break;

            case 'download':
              if (!url) {
                result = {
                  success: false,
                  operation: 'download',
                  error: 'url is required for download operation',
                  executionTime: 0,
                };
              } else if (!resolvedOutputFile) {
                result = {
                  success: false,
                  operation: 'download',
                  error: 'outputFile is required for download operation',
                  executionTime: 0,
                };
              } else {
                result = await downloadImage(url, resolvedOutputFile);
              }
              break;

            case 'extract-from-document':
              if (!resolvedInputFile) {
                result = {
                  success: false,
                  operation: 'extract-from-document',
                  error: 'inputFile is required for extract-from-document operation',
                  executionTime: 0,
                };
              } else if (!resolvedOutputDir) {
                result = {
                  success: false,
                  operation: 'extract-from-document',
                  inputFile: resolvedInputFile,
                  error: 'outputDirectory is required for extract-from-document operation',
                  executionTime: 0,
                };
              } else {
                result = await extractFromDocument(resolvedInputFile, resolvedOutputDir);
              }
              break;

            case 'compress':
              if (!resolvedInputFile) {
                result = {
                  success: false,
                  operation: 'compress',
                  error: 'inputFile is required for compress operation',
                  executionTime: 0,
                };
              } else if (!resolvedOutputFile) {
                result = {
                  success: false,
                  operation: 'compress',
                  inputFile: resolvedInputFile,
                  error: 'outputFile is required for compress operation',
                  executionTime: 0,
                };
              } else {
                result = await compressImage(resolvedInputFile, resolvedOutputFile, quality ?? 80);
              }
              break;

            case 'resize':
              if (!resolvedInputFile) {
                result = {
                  success: false,
                  operation: 'resize',
                  error: 'inputFile is required for resize operation',
                  executionTime: 0,
                };
              } else if (!resolvedOutputFile) {
                result = {
                  success: false,
                  operation: 'resize',
                  inputFile: resolvedInputFile,
                  error: 'outputFile is required for resize operation',
                  executionTime: 0,
                };
              } else {
                result = await resizeImage(resolvedInputFile, resolvedOutputFile, width, height, fit ?? 'inside');
              }
              break;

            case 'convert':
              if (!resolvedInputFile) {
                result = {
                  success: false,
                  operation: 'convert',
                  error: 'inputFile is required for convert operation',
                  executionTime: 0,
                };
              } else if (!resolvedOutputFile) {
                result = {
                  success: false,
                  operation: 'convert',
                  inputFile: resolvedInputFile,
                  error: 'outputFile is required for convert operation',
                  executionTime: 0,
                };
              } else if (!format) {
                result = {
                  success: false,
                  operation: 'convert',
                  inputFile: resolvedInputFile,
                  error: 'format is required for convert operation',
                  executionTime: 0,
                };
              } else {
                result = await convertImage(resolvedInputFile, resolvedOutputFile, format, quality ?? 80);
              }
              break;

            case 'optimize-for-llm':
              if (!resolvedInputFile) {
                result = {
                  success: false,
                  operation: 'optimize-for-llm',
                  error: 'inputFile is required for optimize-for-llm operation',
                  executionTime: 0,
                };
              } else {
                result = await optimizeForLLM(
                  resolvedInputFile,
                  maxWidth ?? 1024,
                  maxHeight ?? 1024,
                  quality ?? 70
                );
              }
              break;

            default:
              result = {
                success: false,
                operation: 'unknown',
                error: `Unknown operation: ${operation}`,
                executionTime: 0,
              };
          }

          const resultText = formatResultForLLM(result);

          // For optimize-for-llm, include full base64 data in a structured way
          if (result.success && result.base64Data) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: resultText,
                },
                {
                  type: 'text' as const,
                  text: `\n\n<!-- IMAGE_BASE64_START -->\n${result.base64Data}\n<!-- IMAGE_BASE64_END -->`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: resultText,
              },
            ],
          };
        }
      ),
    ],
  });
}

/**
 * Export the Image MCP server instance
 */
export const imageMcpServer = createImageMcpServer();
