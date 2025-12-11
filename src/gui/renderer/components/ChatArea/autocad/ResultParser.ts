/**
 * Parse AutoCAD MCP response into typed result
 */

import type { AutoCADCommandResult } from './types';

/**
 * Parsed result with extracted images
 */
export interface ParsedAutoCADResult extends AutoCADCommandResult {
  /** Main screenshot image (base64) */
  screenshotImage?: string;
  /** Block thumbnails keyed by block name */
  blockThumbnails?: Record<string, string>;
}

/**
 * Parse MCP response output to extract AutoCAD result and images
 */
export function parseAutoCADResponse(output: unknown): ParsedAutoCADResult | null {
  try {
    let data = output;

    // If output is a string, try to parse it as JSON
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        return null;
      }
    }

    // If data is an array (MCP response format), extract from content blocks
    // MCP returns: [{ type: 'text', text: '...' }, { type: 'image', source: {...} }, ...]
    if (Array.isArray(data) && data.length > 0) {
      return parseContentBlocks(data);
    }

    // Direct object format
    if (data && typeof data === 'object' && 'success' in data) {
      return normalizeResult(data as AutoCADCommandResult);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Parse MCP content blocks array to extract data and images
 *
 * New format from MCP server:
 * 1. First text block: JSON with result data (success, message, data, etc.)
 * 2. Optional: Index info text block (📁 marker)
 * 3. Optional: Screenshot label (📷 marker) + image block
 * 4. Optional: Thumbnail labels (🧱 marker) + image blocks
 */
function parseContentBlocks(blocks: unknown[]): ParsedAutoCADResult | null {
  let result: ParsedAutoCADResult | null = null;
  let screenshotImage: string | undefined;
  const blockThumbnails: Record<string, string> = {};

  // Track current block name for associating with next image
  let currentBlockName: string | null = null;
  let isInScreenshotSection = false;
  let isInBlockThumbnailSection = false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as { type?: string; text?: string; source?: { data?: string } };

    if (block.type === 'text') {
      const text = block.text as string;

      // Try to parse JSON from code block (new format: first block is pure JSON)
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && !result) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          // The JSON contains the full result structure
          result = {
            success: parsed.success ?? false,
            message: parsed.message,
            data: parsed.data,
          };
        } catch {
          // JSON parse failed
        }
      }

      // Check for screenshot section marker
      if (text.includes('📷') || text.includes('Screenshot')) {
        isInScreenshotSection = true;
        isInBlockThumbnailSection = false;
        currentBlockName = null;
      }

      // Check for block thumbnails section marker
      if (text.includes('🧱') || text.includes('Block Thumbnail')) {
        isInBlockThumbnailSection = true;
        isInScreenshotSection = false;
        currentBlockName = null;
      }

      // Check for block name label: Block: "BlockName"
      const blockNameMatch = text.match(/Block:\s*"([^"]+)"/);
      if (blockNameMatch && isInBlockThumbnailSection) {
        currentBlockName = blockNameMatch[1];
      }
    }

    if (block.type === 'image' && block.source?.data) {
      const imageData = block.source.data as string;

      if (isInScreenshotSection && !screenshotImage) {
        // This is the main screenshot (marked by 📷)
        screenshotImage = imageData;
        isInScreenshotSection = false;
      } else if (isInBlockThumbnailSection && currentBlockName) {
        // This is a block thumbnail
        blockThumbnails[currentBlockName] = imageData;
        currentBlockName = null; // Reset for next block
      } else if (!screenshotImage && !isInBlockThumbnailSection) {
        // Fallback: first image without explicit marker is treated as screenshot
        screenshotImage = imageData;
      }
    }
  }

  if (result) {
    result.screenshotImage = screenshotImage;
    if (Object.keys(blockThumbnails).length > 0) {
      result.blockThumbnails = blockThumbnails;
    }
  }

  return result;
}

/**
 * Normalize result to consistent format
 */
function normalizeResult(raw: any): ParsedAutoCADResult {
  return {
    success: raw.success === true || raw.success === 'true',
    message: raw.message,
    data: raw.data,
  };
}

/**
 * Check if the result is successful
 */
export function isSuccessResult(result: AutoCADCommandResult | null): boolean {
  return result?.success === true;
}

/**
 * Get summary text for a result
 */
export function getResultSummary(result: AutoCADCommandResult | null, operation: string): string {
  if (!result) return 'Parsing failed';
  if (!result.success) return result.message || 'Command failed';

  const data = result.data as any;
  if (!data) return result.message || 'Success';

  // Generate summary based on operation type
  switch (operation) {
    case 'extract': {
      const itemCount = data.extractedCount ?? data.data?.Items?.length ?? 0;
      return `Extracted ${itemCount} items`;
    }

    case 'get_document_list': {
      const docCount = data.count ?? data.documents?.length ?? 0;
      return `Found ${docCount} open document(s)`;
    }

    case 'get_drawing_overview': {
      const spaces = data.spaces?.length ?? 0;
      return `Drawing overview: ${spaces} space(s)`;
    }

    case 'set_active_document': {
      return 'Document switched';
    }

    case 'get_index_path': {
      return data.exists ? 'Index path found' : 'Index not found';
    }

    case 'get_view': {
      // get_view returns ViewInfoData with currentView and drawingExtents
      const currentView = data.currentView;
      const width = currentView?.width?.toFixed(1) ?? '?';
      const height = currentView?.height?.toFixed(1) ?? '?';
      return `View: ${width} × ${height}`;
    }

    case 'zoom_extents':
    case 'zoom_window':
    case 'zoom_center':
    case 'pan_to_point': {
      // Zoom/pan operations return ViewBoundsData directly
      const width = data.width?.toFixed(1) ?? '?';
      const height = data.height?.toFixed(1) ?? '?';
      return `View: ${width} × ${height}`;
    }

    case 'execute_script': {
      return 'Script executed';
    }

    default:
      return result.message || 'Success';
  }
}
