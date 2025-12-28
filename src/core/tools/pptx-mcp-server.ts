/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * PPTX MCP Server - PowerPoint analysis, template creation, and editing tool
 *
 * Four core operations:
 * 1. get-info: Analyze PPTX file structure and return detailed template information
 * 2. create-template: Create empty template from existing file (preserve styling, clear text content)
 * 3. unpack: Extract PPTX to directory for direct XML editing with Read/Edit tools
 * 4. pack: Reassemble directory back into PPTX file
 *
 * Workflow for editing existing PPTX:
 *   unpack → Read/Edit XML files → pack
 *
 * Workflow for creating new from template:
 *   create-template → TypeScript + AdmZip to add content
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

/**
 * Text element info extracted from slide
 */
interface TextElementInfo {
  /** Text content */
  text: string;
  /** Position in the slide (if detectable) */
  position?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  };
  /** Font size if available */
  fontSize?: number;
  /** Whether this appears to be a title/header */
  isTitle?: boolean;
  /** Whether this is part of a bullet list */
  isBullet?: boolean;
}

/**
 * Detailed slide info for template usage
 */
interface SlideTemplateInfo {
  /** Slide index (1-based) */
  index: number;
  /** All text elements with details */
  textElements: TextElementInfo[];
  /** Whether slide has background image */
  hasBackgroundImage: boolean;
  /** Whether slide has background color */
  hasBackgroundColor: boolean;
  /** Background color if solid color */
  backgroundColor?: string;
  /** Number of images in the slide */
  imageCount: number;
  /** Number of shapes in the slide */
  shapeCount: number;
  /** Slide layout type from master if detectable */
  layoutType?: string;
}

/**
 * Layout info with placeholders
 */
interface LayoutInfo {
  /** Layout file name */
  file: string;
  /** Layout display name */
  name: string;
  /** Layout type (title, obj, twoObj, etc.) */
  type: string;
  /** Placeholder types in this layout */
  placeholders: string[];
}

/**
 * Complete PPTX file analysis result
 */
interface PPTXAnalysisResult {
  success: boolean;
  operation: string;
  filePath?: string;
  outputFile?: string;
  /** Total slide count */
  slideCount?: number;
  /** Presentation dimensions */
  dimensions?: {
    width: number;
    height: number;
    unit: string;
  };
  /** Theme colors if available */
  themeColors?: Record<string, string>;
  /** Detailed slide information */
  slides?: SlideTemplateInfo[];
  /** Files in the PPTX structure (for advanced editing) */
  structure?: {
    slides: string[];
    masters: string[];
    layouts: LayoutInfo[];
    media: string[];
  };
  /** XML output directory (for create-template) */
  xmlOutputDir?: string;
  error?: string;
  executionTime: number;
}

/**
 * Resolve file path - handle relative paths
 */
function resolveFilePath(filePath: string): string {
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  return path.resolve(process.cwd(), filePath);
}

/**
 * Parse EMU (English Metric Units) to inches
 * 914400 EMU = 1 inch
 */
function emuToInches(emu: number): number {
  return Math.round((emu / 914400) * 100) / 100;
}

/**
 * Extract position from XML element
 */
function extractPosition(xml: string, elementStart: number): TextElementInfo['position'] | undefined {
  // Look backwards for the containing shape's position
  const beforeElement = xml.substring(Math.max(0, elementStart - 2000), elementStart);

  const offMatch = beforeElement.match(/<a:off[^>]*x="(\d+)"[^>]*y="(\d+)"/);
  const extMatch = beforeElement.match(/<a:ext[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);

  if (offMatch || extMatch) {
    return {
      x: offMatch ? emuToInches(parseInt(offMatch[1], 10)) : undefined,
      y: offMatch ? emuToInches(parseInt(offMatch[2], 10)) : undefined,
      width: extMatch ? emuToInches(parseInt(extMatch[1], 10)) : undefined,
      height: extMatch ? emuToInches(parseInt(extMatch[2], 10)) : undefined,
    };
  }
  return undefined;
}

/**
 * Analyze a PPTX file and return detailed template information
 */
function getInfo(pptxFile: string): PPTXAnalysisResult {
  const startTime = Date.now();
  const resolvedPath = resolveFilePath(pptxFile);

  try {
    if (!existsSync(resolvedPath)) {
      return {
        success: false,
        operation: 'get-info',
        error: `File not found: ${resolvedPath}`,
        executionTime: Date.now() - startTime,
      };
    }

    const zip = new AdmZip(resolvedPath);
    const entries = zip.getEntries();
    const slides: SlideTemplateInfo[] = [];

    // Collect file structure
    const structure: {
      slides: string[];
      masters: string[];
      layouts: LayoutInfo[];
      media: string[];
    } = {
      slides: [],
      masters: [],
      layouts: [],
      media: [],
    };

    // Get presentation dimensions from presentation.xml
    let dimensions: PPTXAnalysisResult['dimensions'];
    const presEntry = entries.find((e) => e.entryName === 'ppt/presentation.xml');
    if (presEntry) {
      const presContent = presEntry.getData().toString('utf-8');
      const sldSzMatch = presContent.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
      if (sldSzMatch) {
        dimensions = {
          width: emuToInches(parseInt(sldSzMatch[1], 10)),
          height: emuToInches(parseInt(sldSzMatch[2], 10)),
          unit: 'inches',
        };
      }
    }

    // Extract theme colors
    let themeColors: Record<string, string> | undefined;
    const themeEntry = entries.find((e) => e.entryName.includes('ppt/theme/theme1.xml'));
    if (themeEntry) {
      const themeContent = themeEntry.getData().toString('utf-8');
      themeColors = {};

      // Extract color scheme colors
      const colorPatterns = [
        { name: 'dk1', pattern: /<a:dk1>.*?<a:srgbClr val="([A-Fa-f0-9]{6})"/s },
        { name: 'lt1', pattern: /<a:lt1>.*?<a:srgbClr val="([A-Fa-f0-9]{6})"/s },
        { name: 'dk2', pattern: /<a:dk2>.*?<a:srgbClr val="([A-Fa-f0-9]{6})"/s },
        { name: 'lt2', pattern: /<a:lt2>.*?<a:srgbClr val="([A-Fa-f0-9]{6})"/s },
        { name: 'accent1', pattern: /<a:accent1>.*?<a:srgbClr val="([A-Fa-f0-9]{6})"/s },
        { name: 'accent2', pattern: /<a:accent2>.*?<a:srgbClr val="([A-Fa-f0-9]{6})"/s },
      ];

      for (const { name, pattern } of colorPatterns) {
        const match = themeContent.match(pattern);
        if (match) {
          themeColors[name] = `#${match[1]}`;
        }
      }
    }

    // Categorize all entries
    for (const entry of entries) {
      const name = entry.entryName;
      if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) {
        structure.slides.push(name);
      } else if (name.includes('ppt/slideMasters/')) {
        structure.masters.push(name);
      } else if (/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(name)) {
        // Parse layout file for detailed info
        const layoutContent = entry.getData().toString('utf-8');
        const fileName = name.split('/').pop() || name;

        // Extract layout type from p:cSld name or type attribute
        let layoutType = 'unknown';
        let layoutName = fileName;
        const typeMatch = layoutContent.match(/type="([^"]+)"/);
        if (typeMatch) {
          layoutType = typeMatch[1];
        }
        const nameMatch = layoutContent.match(/<p:cSld[^>]*name="([^"]+)"/);
        if (nameMatch) {
          layoutName = nameMatch[1];
        }

        // Extract placeholders
        const placeholders: string[] = [];
        const phRegex = /<p:ph[^>]*type="([^"]+)"[^>]*(?:idx="(\d+)")?[^>]*\/?>/g;
        const phRegex2 = /<p:ph[^>]*(?:idx="(\d+)")?[^>]*type="([^"]+)"[^>]*\/?>/g;
        let phMatch;
        while ((phMatch = phRegex.exec(layoutContent)) !== null) {
          const phType = phMatch[1];
          const idx = phMatch[2];
          placeholders.push(idx ? `${phType}(idx=${idx})` : phType);
        }
        // Also check for idx-first pattern
        while ((phMatch = phRegex2.exec(layoutContent)) !== null) {
          const phType = phMatch[2];
          const idx = phMatch[1];
          const phStr = idx ? `${phType}(idx=${idx})` : phType;
          if (!placeholders.includes(phStr)) {
            placeholders.push(phStr);
          }
        }
        // Check for body placeholder without explicit type
        if (layoutContent.includes('<p:ph idx="1"') && !placeholders.some(p => p.includes('idx=1'))) {
          placeholders.push('body(idx=1)');
        }

        structure.layouts.push({
          file: fileName,
          name: layoutName,
          type: layoutType,
          placeholders,
        });
      } else if (name.includes('ppt/media/')) {
        structure.media.push(name);
      }
    }

    // Sort layouts by number
    structure.layouts.sort((a, b) => {
      const numA = parseInt(a.file.match(/slideLayout(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.file.match(/slideLayout(\d+)/)?.[1] || '0', 10);
      return numA - numB;
    });

    // Sort slides by number
    structure.slides.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.match(/slide(\d+)/)?.[1] || '0', 10);
      return numA - numB;
    });

    // Analyze each slide
    for (const slidePath of structure.slides) {
      const slideNum = parseInt(slidePath.match(/slide(\d+)/)?.[1] || '0', 10);
      const entry = entries.find((e) => e.entryName === slidePath);
      if (!entry) continue;

      const content = entry.getData().toString('utf-8');
      const textElements: TextElementInfo[] = [];

      // Extract text with context
      const textRegex = /<a:t>([^<]*)<\/a:t>/g;
      let match;
      while ((match = textRegex.exec(content)) !== null) {
        const text = match[1].trim();
        if (!text) continue;

        // Get context around this text element
        const contextStart = Math.max(0, match.index - 500);
        const context = content.substring(contextStart, match.index + match[0].length + 200);

        // Check if this is a title (usually in <p:ph type="title"> or <p:ph type="ctrTitle">)
        const isTitle = context.includes('type="title"') ||
                       context.includes('type="ctrTitle"') ||
                       context.includes('type="subTitle"');

        // Check for bullet
        const isBullet = context.includes('<a:buChar') || context.includes('<a:buAutoNum');

        // Extract font size
        let fontSize: number | undefined;
        const szMatch = context.match(/<a:sz val="(\d+)"/);
        if (szMatch) {
          fontSize = parseInt(szMatch[1], 10) / 100; // Convert from hundredths of a point
        }

        textElements.push({
          text,
          position: extractPosition(content, match.index),
          fontSize,
          isTitle,
          isBullet,
        });
      }

      // Check background
      let hasBackgroundImage = false;
      let hasBackgroundColor = false;
      let backgroundColor: string | undefined;

      if (content.includes('<p:bgPr>') || content.includes('<p:bg>')) {
        if (content.includes('<a:blip')) {
          hasBackgroundImage = true;
        }
        const bgColorMatch = content.match(/<a:srgbClr val="([A-Fa-f0-9]{6})"/);
        if (bgColorMatch) {
          hasBackgroundColor = true;
          backgroundColor = `#${bgColorMatch[1]}`;
        }
      }

      // Count images and shapes
      const imageCount = (content.match(/<p:pic>/g) || []).length;
      const shapeCount = (content.match(/<p:sp>/g) || []).length;

      // Try to get layout type from rels
      let layoutType: string | undefined;
      const relsPath = slidePath.replace('slides/', 'slides/_rels/').replace('.xml', '.xml.rels');
      const relsEntry = entries.find((e) => e.entryName === relsPath);
      if (relsEntry) {
        const relsContent = relsEntry.getData().toString('utf-8');
        const layoutMatch = relsContent.match(/slideLayouts\/slideLayout(\d+)\.xml/);
        if (layoutMatch) {
          layoutType = `layout${layoutMatch[1]}`;
        }
      }

      slides.push({
        index: slideNum,
        textElements,
        hasBackgroundImage,
        hasBackgroundColor,
        backgroundColor,
        imageCount,
        shapeCount,
        layoutType,
      });
    }

    return {
      success: true,
      operation: 'get-info',
      filePath: resolvedPath,
      slideCount: slides.length,
      dimensions,
      themeColors,
      slides,
      structure,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'get-info',
      error: `Failed to analyze: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Create a template from existing PPTX by clearing text content
 * Also extracts key XML files for LLM to read directly
 *
 * Output:
 * - template.pptx: Empty template file
 * - template_xml/: Extracted XML files for reference
 *   - slides/slide1.xml, slide2.xml, ...
 *   - slideLayouts/slideLayout1.xml, ...
 *   - presentation.xml
 *   - [Content_Types].xml
 */
function createTemplate(
  sourceFile: string,
  outputFile: string,
  options?: {
    /** Which slides to include (1-based indices). If not specified, includes all */
    slidesToInclude?: number[];
    /** Whether to also clear images (default: false) */
    clearImages?: boolean;
  }
): PPTXAnalysisResult {
  const startTime = Date.now();
  const resolvedSource = resolveFilePath(sourceFile);
  const resolvedOutput = resolveFilePath(outputFile);

  try {
    if (!existsSync(resolvedSource)) {
      return {
        success: false,
        operation: 'create-template',
        error: `Source file not found: ${resolvedSource}`,
        executionTime: Date.now() - startTime,
      };
    }

    // Ensure output directory exists
    const outputDir = path.dirname(resolvedOutput);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Create XML output directory
    const outputBaseName = path.basename(resolvedOutput, '.pptx');
    const xmlOutputDir = path.join(outputDir, `${outputBaseName}_xml`);
    if (!existsSync(xmlOutputDir)) {
      mkdirSync(xmlOutputDir, { recursive: true });
    }

    // Copy source to output first
    copyFileSync(resolvedSource, resolvedOutput);

    // Open and modify
    const zip = new AdmZip(resolvedOutput);
    const entries = zip.getEntries();

    const slidesToInclude = options?.slidesToInclude;
    const clearImages = options?.clearImages ?? false;
    let processedSlides = 0;

    // Files to extract for LLM reference
    const filesToExtract = [
      '[Content_Types].xml',
      'ppt/presentation.xml',
      'ppt/_rels/presentation.xml.rels',
    ];

    for (const entry of entries) {
      const entryName = entry.entryName;

      // Extract key XML files for LLM to read
      if (filesToExtract.includes(entryName) ||
          /^ppt\/slides\/slide\d+\.xml$/.test(entryName) ||
          /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/.test(entryName) ||
          /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(entryName)) {
        const content = entry.getData().toString('utf-8');
        const xmlFilePath = path.join(xmlOutputDir, entryName.replace(/\//g, path.sep));
        const xmlFileDir = path.dirname(xmlFilePath);
        if (!existsSync(xmlFileDir)) {
          mkdirSync(xmlFileDir, { recursive: true });
        }
        require('fs').writeFileSync(xmlFilePath, content, 'utf-8');
      }

      // Process slide XML files for template
      if (!entryName.startsWith('ppt/slides/slide') || !entryName.endsWith('.xml')) {
        continue;
      }

      const slideNum = parseInt(entryName.match(/slide(\d+)/)?.[1] || '0', 10);

      // Skip if not in the list (when list is provided)
      if (slidesToInclude && !slidesToInclude.includes(slideNum)) {
        continue;
      }

      let content = entry.getData().toString('utf-8');

      // Clear all text content but preserve the XML structure
      content = content.replace(/<a:t>([^<]*)<\/a:t>/g, '<a:t></a:t>');

      // Optionally clear images
      if (clearImages) {
        content = content.replace(/<p:pic>[\s\S]*?<\/p:pic>/g, '');
      }

      zip.updateFile(entryName, Buffer.from(content, 'utf-8'));
      processedSlides++;
    }

    zip.writeZip(resolvedOutput);

    return {
      success: true,
      operation: 'create-template',
      filePath: resolvedSource,
      outputFile: resolvedOutput,
      xmlOutputDir,
      slideCount: processedSlides,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'create-template',
      error: `Failed to create template: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Format get-info result for LLM consumption
 */
function formatGetInfoResult(result: PPTXAnalysisResult): string {
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  const lines: string[] = [
    `PPTX Analysis: ${result.filePath}`,
    `Slides: ${result.slideCount}`,
  ];

  if (result.dimensions) {
    lines.push(`Dimensions: ${result.dimensions.width}" x ${result.dimensions.height}" (${result.dimensions.unit})`);
  }

  if (result.themeColors && Object.keys(result.themeColors).length > 0) {
    lines.push('', 'Theme Colors:');
    for (const [name, color] of Object.entries(result.themeColors)) {
      lines.push(`  ${name}: ${color}`);
    }
  }

  if (result.structure) {
    lines.push('', 'File Structure:');
    lines.push(`  Slides: ${result.structure.slides.length}`);
    lines.push(`  Masters: ${result.structure.masters.length}`);
    lines.push(`  Layouts: ${result.structure.layouts.length}`);
    lines.push(`  Media files: ${result.structure.media.length}`);

    // Show detailed layout info
    if (result.structure.layouts.length > 0) {
      lines.push('', 'Available Layouts:');
      for (const layout of result.structure.layouts) {
        const phStr = layout.placeholders.length > 0
          ? ` [${layout.placeholders.join(', ')}]`
          : '';
        lines.push(`  ${layout.file}: "${layout.name}" (type=${layout.type})${phStr}`);
      }
    }
  }

  if (result.slides && result.slides.length > 0) {
    lines.push('', 'Slide Details:');
    for (const slide of result.slides) {
      lines.push(``, `--- Slide ${slide.index} ---`);
      if (slide.layoutType) {
        lines.push(`Layout: ${slide.layoutType}`);
      }
      if (slide.hasBackgroundImage) {
        lines.push(`Background: Image`);
      } else if (slide.hasBackgroundColor && slide.backgroundColor) {
        lines.push(`Background: ${slide.backgroundColor}`);
      }
      lines.push(`Images: ${slide.imageCount}, Shapes: ${slide.shapeCount}`);

      if (slide.textElements.length > 0) {
        lines.push(`Text elements (${slide.textElements.length}):`);
        for (const elem of slide.textElements.slice(0, 10)) {
          const tags: string[] = [];
          if (elem.isTitle) tags.push('TITLE');
          if (elem.isBullet) tags.push('BULLET');
          if (elem.fontSize) tags.push(`${elem.fontSize}pt`);

          const tagStr = tags.length > 0 ? ` [${tags.join(', ')}]` : '';
          const posStr = elem.position
            ? ` @(${elem.position.x ?? '?'}", ${elem.position.y ?? '?'}")`
            : '';

          // Truncate long text
          const displayText = elem.text.length > 50
            ? elem.text.substring(0, 47) + '...'
            : elem.text;

          lines.push(`  - "${displayText}"${tagStr}${posStr}`);
        }
        if (slide.textElements.length > 10) {
          lines.push(`  ... and ${slide.textElements.length - 10} more`);
        }
      }
    }
  }

  lines.push('', `Analysis time: ${result.executionTime}ms`);

  // Add editing guidance
  lines.push('', '--- Editing Guide ---');
  lines.push('To edit this PPTX, use TypeScript tool with AdmZip:');
  lines.push('```typescript');
  lines.push('import AdmZip from "adm-zip";');
  lines.push(`const zip = new AdmZip("${result.filePath}");`);
  lines.push('const slide1 = zip.getEntry("ppt/slides/slide1.xml");');
  lines.push('let content = slide1.getData().toString("utf-8");');
  lines.push('// Replace text: content = content.replace(/<a:t>old<\\/a:t>/g, "<a:t>new</a:t>");');
  lines.push('zip.updateFile("ppt/slides/slide1.xml", Buffer.from(content));');
  lines.push('zip.writeZip("output.pptx");');
  lines.push('```');

  return lines.join('\n');
}

/**
 * Unpack a PPTX file to a directory for direct XML editing
 */
function unpackPptx(pptxFile: string, outputDir: string): PPTXAnalysisResult {
  const startTime = Date.now();
  const resolvedPptx = resolveFilePath(pptxFile);
  const resolvedOutput = resolveFilePath(outputDir);

  try {
    if (!existsSync(resolvedPptx)) {
      return {
        success: false,
        operation: 'unpack',
        error: `File not found: ${resolvedPptx}`,
        executionTime: Date.now() - startTime,
      };
    }

    // Create output directory
    if (!existsSync(resolvedOutput)) {
      mkdirSync(resolvedOutput, { recursive: true });
    }

    const zip = new AdmZip(resolvedPptx);
    const entries = zip.getEntries();
    let extractedCount = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const entryPath = path.join(resolvedOutput, entry.entryName.replace(/\//g, path.sep));
      const entryDir = path.dirname(entryPath);

      if (!existsSync(entryDir)) {
        mkdirSync(entryDir, { recursive: true });
      }

      writeFileSync(entryPath, entry.getData());
      extractedCount++;
    }

    return {
      success: true,
      operation: 'unpack',
      filePath: resolvedPptx,
      xmlOutputDir: resolvedOutput,
      slideCount: extractedCount,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'unpack',
      error: `Failed to unpack: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Recursively collect all files in a directory
 */
function collectFiles(dir: string, baseDir: string): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, baseDir));
    } else {
      // Get relative path from base directory
      const relativePath = path.relative(baseDir, fullPath);
      files.push(relativePath);
    }
  }

  return files;
}

/**
 * Pack a directory back into a PPTX file
 */
function packPptx(sourceDir: string, outputFile: string): PPTXAnalysisResult {
  const startTime = Date.now();
  const resolvedSource = resolveFilePath(sourceDir);
  const resolvedOutput = resolveFilePath(outputFile);

  try {
    if (!existsSync(resolvedSource)) {
      return {
        success: false,
        operation: 'pack',
        error: `Directory not found: ${resolvedSource}`,
        executionTime: Date.now() - startTime,
      };
    }

    // Ensure output directory exists
    const outputDir = path.dirname(resolvedOutput);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const zip = new AdmZip();
    const files = collectFiles(resolvedSource, resolvedSource);
    let addedCount = 0;

    for (const relativePath of files) {
      const fullPath = path.join(resolvedSource, relativePath);
      const content = readFileSync(fullPath);
      // Use forward slashes for ZIP entries (OOXML standard)
      const zipEntryName = relativePath.replace(/\\/g, '/');
      zip.addFile(zipEntryName, content);
      addedCount++;
    }

    zip.writeZip(resolvedOutput);

    return {
      success: true,
      operation: 'pack',
      filePath: resolvedSource,
      outputFile: resolvedOutput,
      slideCount: addedCount,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      operation: 'pack',
      error: `Failed to pack: ${error instanceof Error ? error.message : String(error)}`,
      executionTime: Date.now() - startTime,
    };
  }
}

/**
 * Create the PPTX MCP server
 */
function createPptxMcpServer() {
  return createSdkMcpServer({
    name: 'pptx',
    version: '2.0.0',
    tools: [
      tool(
        'pptx',
        `PowerPoint analysis, template creation, and editing tool.

## Operations

### get-info
Quick analysis of PPTX structure: dimensions, slide count, theme colors, layouts.

### create-template
Creates empty template from existing PPTX and extracts XML files:
- Output: template.pptx (cleared text) + template_xml/ (extracted XML)
- Use for creating new presentations from scratch

### unpack (Recommended for editing existing PPTX)
Extracts ALL files from PPTX to a directory for direct editing:
- Preserves complete file structure including media, themes, etc.
- Use Read/Edit tools to modify XML files directly
- Then use "pack" to reassemble

### pack
Reassembles a directory back into a PPTX file:
- Use after editing unpacked XML files
- Creates valid PPTX from the modified directory

## Workflows

### Creating new presentation from template:
1. create-template → get empty template + XML reference
2. Read XML to understand structure
3. TypeScript + AdmZip to add content

### Editing existing presentation:
1. unpack → extract to folder
2. Read/Grep → find content to modify
3. Edit → directly edit XML files
4. pack → reassemble to PPTX

## Example Usage

1. Unpack for editing (recommended for modifications):
   operation: "unpack"
   pptxFile: "existing.pptx"
   outputDir: "C:/tmp/pptx_edit/"

2. Pack after editing:
   operation: "pack"
   sourceDir: "C:/tmp/pptx_edit/"
   outputFile: "modified.pptx"

3. Create template:
   operation: "create-template"
   sourceFile: "presentation.pptx"
   outputFile: "template.pptx"

4. Quick info:
   operation: "get-info"
   pptxFile: "presentation.pptx"`,
        {
          operation: z.enum(['get-info', 'create-template', 'unpack', 'pack'])
            .describe('Operation type'),
          pptxFile: z.string().optional()
            .describe('Input PPTX file path (for get-info, unpack)'),
          sourceFile: z.string().optional()
            .describe('Source PPTX file path (for create-template)'),
          sourceDir: z.string().optional()
            .describe('Source directory path (for pack)'),
          outputFile: z.string().optional()
            .describe('Output file path (for create-template, pack)'),
          outputDir: z.string().optional()
            .describe('Output directory path (for unpack)'),
          slidesToInclude: z.array(z.number()).optional()
            .describe('Which slides to include (1-based indices, for create-template)'),
          clearImages: z.boolean().optional()
            .describe('Whether to clear images (for create-template, default: false)'),
        },
        async ({ operation, pptxFile, sourceFile, sourceDir, outputFile, outputDir, slidesToInclude, clearImages }) => {
          let result: PPTXAnalysisResult;

          switch (operation) {
            case 'get-info':
              if (!pptxFile) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: pptxFile is required for get-info operation' }],
                };
              }
              result = getInfo(pptxFile);
              return {
                content: [{ type: 'text' as const, text: formatGetInfoResult(result) }],
              };

            case 'create-template':
              if (!sourceFile || !outputFile) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: sourceFile and outputFile are required for create-template operation' }],
                };
              }
              result = createTemplate(sourceFile, outputFile, { slidesToInclude, clearImages });
              if (result.success) {
                return {
                  content: [{
                    type: 'text' as const,
                    text: `Template created successfully!\n` +
                          `Source: ${result.filePath}\n` +
                          `Output: ${result.outputFile}\n` +
                          `XML files: ${result.xmlOutputDir}\n` +
                          `Slides: ${result.slideCount}\n\n` +
                          `You can now:\n` +
                          `1. Read XML files to understand the structure:\n` +
                          `   - ${result.xmlOutputDir}/ppt/slideLayouts/ (available layouts)\n` +
                          `   - ${result.xmlOutputDir}/ppt/slides/ (slide content)\n` +
                          `   - ${result.xmlOutputDir}/ppt/presentation.xml (slide references)\n` +
                          `2. Use TypeScript + AdmZip to edit the template.pptx`,
                  }],
                };
              } else {
                return {
                  content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
                };
              }

            case 'unpack':
              if (!pptxFile || !outputDir) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: pptxFile and outputDir are required for unpack operation' }],
                };
              }
              result = unpackPptx(pptxFile, outputDir);
              if (result.success) {
                return {
                  content: [{
                    type: 'text' as const,
                    text: `PPTX unpacked successfully!\n` +
                          `Source: ${result.filePath}\n` +
                          `Output directory: ${result.xmlOutputDir}\n` +
                          `Files extracted: ${result.slideCount}\n\n` +
                          `You can now:\n` +
                          `1. Use Read to view XML files\n` +
                          `2. Use Edit to modify content\n` +
                          `3. Use pack operation to reassemble the PPTX`,
                  }],
                };
              } else {
                return {
                  content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
                };
              }

            case 'pack':
              if (!sourceDir || !outputFile) {
                return {
                  content: [{ type: 'text' as const, text: 'Error: sourceDir and outputFile are required for pack operation' }],
                };
              }
              result = packPptx(sourceDir, outputFile);
              if (result.success) {
                return {
                  content: [{
                    type: 'text' as const,
                    text: `PPTX packed successfully!\n` +
                          `Source directory: ${result.filePath}\n` +
                          `Output: ${result.outputFile}\n` +
                          `Files included: ${result.slideCount}`,
                  }],
                };
              } else {
                return {
                  content: [{ type: 'text' as const, text: `Error: ${result.error}` }],
                };
              }

            default:
              return {
                content: [{ type: 'text' as const, text: `Unknown operation: ${operation}` }],
              };
          }
        }
      ),
    ],
  });
}

/**
 * Export the PPTX MCP server instance
 */
export const pptxMcpServer = createPptxMcpServer();
