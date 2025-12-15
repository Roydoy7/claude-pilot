/**
 * AutoCAD MCP Server - Integration with AutoCAD plugin for LLM-based CAD operations
 * Provides commands for drawing manipulation, data extraction, and view control
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { getAutoCADHttpServer } from '../services/autocad-http-server.js';

/**
 * Command execution result
 */
interface CommandResult {
  success: boolean;
  commandId?: string;
  commandType?: string;
  message?: string;
  data?: unknown;
  executionTime?: number;
}

/**
 * AutoCAD MCP Server class
 */
class AutoCADMcpServerManager {
  private httpServer = getAutoCADHttpServer();

  /**
   * Generate unique command ID
   */
  private generateCommandId(): string {
    return `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Send command to AutoCAD plugin via HTTP server queue
   */
  async sendCommand(type: string, data: Record<string, unknown>): Promise<CommandResult> {
    const startTime = Date.now();
    const commandId = this.generateCommandId();

    try {
      // Ensure HTTP server is running
      if (!this.httpServer.getStatus().isRunning) {
        await this.httpServer.start();
      }

      // Add command to HTTP server queue
      this.httpServer.addCommand(commandId, type, data);

      // Wait for AutoCAD plugin to execute the command
      const result = await this.httpServer.waitForCommand(commandId, 30000);

      const executionTime = Date.now() - startTime;

      return {
        success: result.status === 'completed',
        commandId,
        commandType: type,
        message: result.error || 'Command executed successfully',
        data: result.result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      return {
        success: false,
        commandId,
        commandType: type,
        message: error instanceof Error ? error.message : 'Unknown error',
        executionTime,
      };
    }
  }

  /**
   * Get list of all open documents in AutoCAD
   */
  async getDocumentList(): Promise<CommandResult> {
    return await this.sendCommand('get_document_list', {});
  }

  /**
   * Get drawing overview from AutoCAD
   */
  async getDrawingOverview(): Promise<CommandResult> {
    return await this.sendCommand('get_drawing_overview', {});
  }

  /**
   * Extract data from AutoCAD drawing
   * mode='region': extract from rectangular region (requires minPoint/maxPoint)
   * mode='selection': extract from current user selection
   */
  async extract(
    mode: 'region' | 'selection',
    options: {
      minPoint?: [number, number];
      maxPoint?: [number, number];
      includeScreenshot?: boolean;
      entityTypes?: string[];
      fields?: string[];
    } = {}
  ): Promise<CommandResult> {
    return await this.sendCommand('extract', {
      mode,
      minPoint: options.minPoint,
      maxPoint: options.maxPoint,
      includeScreenshot: options.includeScreenshot ?? false,
      entityTypes: options.entityTypes,
      fields: options.fields,
    });
  }
  
  /**
   * Execute C# script in AutoCAD context using Roslyn
   * This provides maximum flexibility for complex operations
   */
  async executeScript(code: string): Promise<CommandResult> {
    return await this.sendCommand('execute_script', {
      code,
    });
  }

  /**
   * Synchronize the JSON index for a DWG file
   * Creates/updates JSONL index files for grep-compatible searching
   */
  async syncIndex(options: {
    filePath?: string;
    forceRebuild?: boolean;
  } = {}): Promise<CommandResult> {
    return await this.sendCommand('sync_index', {
      filePath: options.filePath,
      forceRebuild: options.forceRebuild ?? false,
    });
  }

  /**
   * Get the index directory path for a DWG file
   */
  async getIndexPath(filePath?: string): Promise<CommandResult> {
    return await this.sendCommand('get_index_path', {
      filePath,
    });
  }
  
}

/**
 * Global AutoCAD MCP Server instance
 */
const autocadManager = new AutoCADMcpServerManager();

/**
 * Clean result data for JSON output
 * Removes screenshot, thumbnail, imageBase64 (base64 data), and indexInfo (shown separately)
 * Supports both camelCase (from JsonConfig) and PascalCase (legacy)
 */
function cleanResultForJson(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => cleanResultForJson(item));
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      // Skip fields that are shown separately (both camelCase and PascalCase)
      const lowerKey = key.toLowerCase();
      if (lowerKey === 'screenshot' || lowerKey === 'thumbnail' || lowerKey === 'imagebase64' || lowerKey === 'indexinfo') {
        continue;
      }
      result[key] = cleanResultForJson(value);
    }
    return result;
  }

  return obj;
}

/**
 * Extract index info from result data
 * New stable structure: result.data (HTTP CommandResultPayload) -> indexInfo (at top level)
 */
function extractIndexInfo(result: CommandResult): { path: string; entitiesFile: string; hint: string } | null {
  if (!result.data || typeof result.data !== 'object') return null;

  const httpResult = result.data as Record<string, unknown>;

  // New structure: indexInfo is at top level of CommandResultPayload
  const indexInfo = httpResult.indexInfo as Record<string, unknown> | undefined;
  if (indexInfo && typeof indexInfo === 'object' && indexInfo.path && indexInfo.entitiesFile) {
    return {
      path: String(indexInfo.path),
      entitiesFile: String(indexInfo.entitiesFile),
      hint: String(indexInfo.hint || ''),
    };
  }

  return null;
}

/**
 * Image data extracted from result
 */
interface ExtractedImages {
  screenshot?: { data: string; format: string };
  blockThumbnails?: Array<{ blockName: string; data: string }>;
}

/**
 * Extract screenshot and thumbnail images from result data
 * New stable structure: result.data (HTTP CommandResultPayload) -> data (ExtractionResultData) -> screenshot/blockDefinitions
 */
function extractImages(result: CommandResult): ExtractedImages {
  const images: ExtractedImages = {};

  if (!result.data || typeof result.data !== 'object') return images;

  const httpResult = result.data as Record<string, unknown>;
  const responseData = httpResult.data as Record<string, unknown> | undefined;

  if (!responseData || typeof responseData !== 'object') return images;

  // Extract Screenshot (camelCase from JsonConfig, stable path: data.screenshot)
  const screenshot = responseData.screenshot as Record<string, unknown> | undefined;
  if (screenshot && typeof screenshot === 'object' && screenshot.imageBase64) {
    const base64Data = screenshot.imageBase64 as string;
    images.screenshot = {
      data: base64Data,
      format: (screenshot.format as string) || 'png',
    };
  }

  // Extract BlockDefinitions thumbnails (camelCase from JsonConfig, stable path: data.blockDefinitions)
  const blockDefs = responseData.blockDefinitions as Record<string, unknown> | undefined;
  if (blockDefs && typeof blockDefs === 'object') {
    const thumbnails: Array<{ blockName: string; data: string }> = [];

    for (const [blockName, blockDef] of Object.entries(blockDefs)) {
      if (blockDef && typeof blockDef === 'object') {
        const def = blockDef as Record<string, unknown>;
        if (def.thumbnail && typeof def.thumbnail === 'string') {
          thumbnails.push({ blockName, data: def.thumbnail });
        }
      }
    }

    if (thumbnails.length > 0) {
      images.blockThumbnails = thumbnails;
    }
  }

  return images;
}

/**
 * MCP content block types
 */
type MCPTextContent = {
  type: 'text';
  text: string;
};

type MCPImageContent = {
  type: 'image';
  data: string;      // base64 encoded image data
  mimeType: string;  // MIME type like 'image/png'
};

type MCPContentBlock = MCPTextContent | MCPImageContent;

/**
 * Build content blocks for MCP response
 */
function buildContentBlocks(result: CommandResult): MCPContentBlock[] {
  const contentBlocks: MCPContentBlock[] = [];

  // 1. Main result as clean JSON
  const cleanedResult = cleanResultForJson(result);
  contentBlocks.push({
    type: 'text' as const,
    text: '```json\n' + JSON.stringify(cleanedResult, null, 2) + '\n```',
  });

  // 2. Index info as separate text block (if available)
  const indexInfo = extractIndexInfo(result);
  if (indexInfo) {
    contentBlocks.push({
      type: 'text' as const,
      text: `📁 **DWG Index:** \`${indexInfo.entitiesFile}\`\nUse \`grep\` to search: h=handle, t=type, l=layer, txt=text, bn=blockName, attr=attributes`,
    });
  }

  // 3. Screenshot and thumbnails as image blocks
  const images = extractImages(result);

  if (images.screenshot) {
    contentBlocks.push({
      type: 'text' as const,
      text: '📷 **Screenshot:**',
    });
    contentBlocks.push({
      type: 'image' as const,
      data: images.screenshot.data,
      mimeType: `image/${images.screenshot.format}`,
    });
  }

  if (images.blockThumbnails && images.blockThumbnails.length > 0) {
    contentBlocks.push({
      type: 'text' as const,
      text: `🧱 **Block Thumbnails** (${images.blockThumbnails.length}):`,
    });

    for (const thumb of images.blockThumbnails) {
      contentBlocks.push({
        type: 'text' as const,
        text: `Block: "${thumb.blockName}"`,
      });
      contentBlocks.push({
        type: 'image' as const,
        data: thumb.data,
        mimeType: 'image/png',
      });
    }
  }

  return contentBlocks;
}

/**
 * Create the AutoCAD MCP Server
 */
function createAutoCADMcpServer() {
  return createSdkMcpServer({
    name: 'autocad',
    version: '1.0.0',
    tools: [
      tool(
        'autocad',
        `AutoCAD integration tool with 12 core operations. Use execute_script for complex tasks.

**Core Operations:**

1. **extract** - Extract entities from drawing
   - mode='region': Extract from rectangular area (requires minPoint/maxPoint)
   - mode='selection': Extract from current user selection
   - Use entityTypes and fields to reduce response size

2. **get_document_list** - List all open documents with basic info

3. **get_drawing_overview** - Get drawing structure overview (layers, blocks, extents)

4. **set_active_document** - Switch active document by path or index (from get_document_list)

5. **get_index_path** - Get DWG index directory for grep searching
   - Returns path to entities.jsonl for grep-based entity lookup
   - Index auto-syncs on each command

6. **sync_index** - Build/rebuild DWG index (supports external files)
   - filePath: optional, can index ANY DWG file without opening it
   - forceRebuild: true to rebuild even if up-to-date
   - Indexes: entities, layers, blocks, text styles, dim styles, linetypes
   - Use to index reference drawings for style/convention analysis

**View Operations (returns view bounds: centerPoint, minPoint, maxPoint, width, height):**

7. **get_view** - Get current view bounds AND drawing extents
   - Returns: currentView (current viewport) + drawingExtents (all objects bounding box)
   - includeScreenshot: optional, capture current view screenshot

8. **zoom_extents** - Zoom to show all objects in current space

9. **zoom_window** - Zoom to specific region (requires minPoint/maxPoint)
   - margin: optional margin around region (default: 0.1 = 10%)

10. **zoom_center** - Zoom with center point
    - centerPoint: required [x, y]
    - height: optional view height in world units
    - scale: optional zoom multiplier (2.0 = zoom in 2x)

11. **pan_to_point** - Pan view to center on point (keeps zoom level)
    - centerPoint: required [x, y]

12. **execute_script** - Execute C# code in AutoCAD (for ALL other operations)
    - Drawing, modifying, deleting entities
    - Block operations, layer management

**Available Globals in execute_script:**
- DocumentManager, Document, Database, Editor
- StartTransaction(), GetModelSpaceForWrite(tr), GetModelSpaceForRead(tr)
- Point(x, y), Point(x, y, z)

**Pre-imported Namespaces:**
- System, System.Collections.Generic, System.Linq, System.IO
- Autodesk.AutoCAD: ApplicationServices, ApplicationServices.Core, DatabaseServices, EditorInput, Geometry, Colors, Runtime
- ClaudePilot.AutoCAD.Extensions
- Newtonsoft.Json, Newtonsoft.Json.Linq

**Extension Methods (ClaudePilot.AutoCAD.Extensions):**
- blockRef.GetBlockName(): Get effective name (handles dynamic/anonymous blocks)
- blockRef.GetBlockAttributes(): Get attributes as IDictionary<string, string>
- blockRef.SetBlockAttributes(attDict): Set attributes from dictionary
- blockRef.AddBlockAttributeAndValue(blockDef, attDict): Add attributes to new block
- blockRef.GetDynamicBlockAttributes(): Get dynamic properties
- blockRef.SetDynamicBlockAttributes(attDict): Set dynamic properties
- blockRef.GetDynamicBlockAttributeAllowedValues(): Get allowed values
- blockRef.SynchronizeAttributes(): Sync definition to references
- db.GetBlockTable(OpenMode): Get BlockTable
- **db.CopyBlocksFrom(sourceDb, blockNames, overwrite)**: Copy blocks between databases

**IMPORTANT - Ambiguous Types:**
- Use \`System.Exception\` not \`Exception\`
- Use \`Autodesk.AutoCAD.ApplicationServices.Core.Application\` not \`Application\`

**Example - Copy blocks from another document:**
\`\`\`
// DocumentManager is available as a global variable
var sourceDoc = DocumentManager.Cast<Document>().FirstOrDefault(d => d.Name.Contains("source.dwg"));
if (sourceDoc != null) {
    Database.CopyBlocksFrom(sourceDoc.Database, new[] { "Block1", "Block2" });
}
\`\`\`

**Example - Insert block with attributes:**
\`\`\`
using (var tr = StartTransaction()) {
    var bt = Database.GetBlockTable(OpenMode.ForRead);
    var btr = GetModelSpaceForWrite(tr);
    var blockDef = tr.GetObject(bt["MyBlock"], OpenMode.ForRead) as BlockTableRecord;
    var br = new BlockReference(Point(100, 200), bt["MyBlock"]);
    btr.AppendEntity(br);
    tr.AddNewlyCreatedDBObject(br, true);
    br.AddBlockAttributeAndValue(blockDef, new Dictionary<string, string> { ["TAG1"] = "Value1" });
    tr.Commit();
    return br.Handle.ToString();
}
\`\`\`

**Example frequently error-prone code snippets:**
\`\`\`csharp
// This causes error:
attRef.Position = newPos;  // eNotApplicable!
// This is ok:
attRef.TransformBy(Matrix3d.Displacement(moveVector));
\`\`\`
`,
        {
          operation: z.enum([
            'extract',
            'get_document_list',
            'get_drawing_overview',
            'set_active_document',
            'get_index_path',
            'sync_index',
            'get_view',
            'zoom_extents',
            'zoom_window',
            'zoom_center',
            'pan_to_point',
            'execute_script',
          ]).describe('The AutoCAD operation to perform'),

          // Extract mode parameter
          mode: z.enum(['region', 'selection']).optional()
            .describe('Extract mode: region (requires minPoint/maxPoint) or selection (current selection)'),

          // Region parameters (for extract with mode=region, zoom_window)
          minPoint: z.tuple([z.number(), z.number()]).optional()
            .describe('Minimum point [x, y] for extract mode=region or zoom_window'),
          maxPoint: z.tuple([z.number(), z.number()]).optional()
            .describe('Maximum point [x, y] for extract mode=region or zoom_window'),

          // View parameters
          centerPoint: z.tuple([z.number(), z.number()]).optional()
            .describe('Center point [x, y] for zoom_center or pan_to_point'),
          height: z.number().optional()
            .describe('View height in world units for zoom_center'),
          scale: z.number().optional()
            .describe('Zoom multiplier for zoom_center (2.0 = zoom in 2x)'),
          margin: z.number().optional()
            .describe('Margin ratio for zoom_window (default: 0.1 = 10%)'),

          // Extract parameters
          entityTypes: z.array(z.enum([
            'Line', 'Circle', 'Arc', 'Polyline', 'Polyline2d', 'Polyline3d',
            'Spline', 'Ellipse', 'Point', 'Solid', 'Solid3d', 'Region',
            'DBText', 'MText', 'MLeader', 'Leader',
            'Dimension', 'AlignedDimension', 'RotatedDimension', 'ArcDimension', 'RadialDimension', 'DiametricDimension',
            'BlockReference', 'Hatch', 'Viewport', 'Table', 'Image', 'Wipeout',
          ])).optional()
            .describe('Filter by entity types'),
          fields: z.array(z.enum([
            'handle', 'type', 'layer', 'position', 'boundingBox',
            'name', 'rotation', 'scale', 'attributes',
            'typeData', 'parentBlock',
          ])).optional()
            .describe('Fields to include in each item (default: all). Use to reduce response size'),
          includeScreenshot: z.boolean().optional()
            .describe('Include screenshot for extract or get_view (default: false)'),

          // Index parameters
          filePath: z.string().optional()
            .describe('DWG file path for sync_index. Can be ANY DWG file - will read it without opening. Defaults to current document'),
          forceRebuild: z.boolean().optional()
            .describe('Force rebuild index even if up-to-date (for sync_index)'),

          // Document switching parameter
          document: z.union([z.string(), z.number()]).optional()
            .describe('Document path or index for set_active_document'),

          // Script execution
          code: z.string().optional()
            .describe('C# code to execute in AutoCAD context (for execute_script operation)'),
        },
        async (params) => {
          const { operation } = params;

          let result: CommandResult;

          try {
            switch (operation) {
              case 'extract':
                if (!params.mode) {
                  return {
                    content: [{
                      type: 'text' as const,
                      text: 'Error: extract requires mode parameter (region or selection)',
                    }],
                  };
                }
                if (params.mode === 'region' && (!params.minPoint || !params.maxPoint)) {
                  return {
                    content: [{
                      type: 'text' as const,
                      text: 'Error: extract with mode=region requires minPoint and maxPoint parameters',
                    }],
                  };
                }
                result = await autocadManager.extract(
                  params.mode as 'region' | 'selection',
                  {
                    minPoint: params.minPoint as [number, number] | undefined,
                    maxPoint: params.maxPoint as [number, number] | undefined,
                    includeScreenshot: params.includeScreenshot,
                    entityTypes: params.entityTypes,
                    fields: params.fields,
                  }
                );
                break;

              case 'get_document_list':
                result = await autocadManager.getDocumentList();
                break;

              case 'get_drawing_overview':
                result = await autocadManager.getDrawingOverview();
                break;

              case 'set_active_document':
                if (params.document === undefined) {
                  return {
                    content: [{
                      type: 'text' as const,
                      text: 'Error: set_active_document requires document parameter (file path or index)',
                    }],
                  };
                }
                result = await autocadManager.sendCommand('set_active_document', { document: params.document });
                break;

              case 'get_index_path':
                result = await autocadManager.getIndexPath(params.filePath);
                break;

              case 'sync_index':
                result = await autocadManager.syncIndex({
                  filePath: params.filePath,
                  forceRebuild: params.forceRebuild,
                });
                break;

              case 'get_view':
                result = await autocadManager.sendCommand('get_view', {
                  includeScreenshot: params.includeScreenshot ?? false,
                });
                break;

              case 'zoom_extents':
                result = await autocadManager.sendCommand('zoom_extents', {});
                break;

              case 'zoom_window':
                if (!params.minPoint || !params.maxPoint) {
                  return {
                    content: [{
                      type: 'text' as const,
                      text: 'Error: zoom_window requires minPoint and maxPoint parameters',
                    }],
                  };
                }
                result = await autocadManager.sendCommand('zoom_window', {
                  minPoint: params.minPoint,
                  maxPoint: params.maxPoint,
                  margin: params.margin,
                });
                break;

              case 'zoom_center':
                if (!params.centerPoint) {
                  return {
                    content: [{
                      type: 'text' as const,
                      text: 'Error: zoom_center requires centerPoint parameter',
                    }],
                  };
                }
                result = await autocadManager.sendCommand('zoom_center', {
                  centerPoint: params.centerPoint,
                  height: params.height,
                  scale: params.scale,
                });
                break;

              case 'pan_to_point':
                if (!params.centerPoint) {
                  return {
                    content: [{
                      type: 'text' as const,
                      text: 'Error: pan_to_point requires centerPoint parameter',
                    }],
                  };
                }
                result = await autocadManager.sendCommand('pan_to_point', {
                  centerPoint: params.centerPoint,
                });
                break;

              case 'execute_script':
                if (!params.code) {
                  return {
                    content: [{
                      type: 'text' as const,
                      text: 'Error: execute_script requires code parameter',
                    }],
                  };
                }
                result = await autocadManager.executeScript(params.code);
                break;

              default:
                return {
                  content: [{
                    type: 'text' as const,
                    text: `Error: Unsupported operation: ${operation}`,
                  }],
                };
            }

            return {
              content: buildContentBlocks(result),
            };
          } catch (error) {
            return {
              content: [{
                type: 'text' as const,
                text: `Error executing AutoCAD command: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }],
            };
          }
        }
      ),
    ],
  });
}

/**
 * Export the AutoCAD MCP server instance
 */
export const autocadMcpServer = createAutoCADMcpServer();

/**
 * Export the manager for direct access if needed
 */
export { autocadManager };
