/**
 * Type definitions for AutoCAD tool display
 */

/**
 * Base AutoCAD command result
 */
export interface AutoCADCommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

/**
 * Screenshot data from AutoCAD
 * Note: Field names are camelCase due to JsonConfig.CamelCaseNamingStrategy
 */
export interface ScreenshotData {
  imageBase64?: string;
  width?: number;
  height?: number;
  format?: string;
  scale?: number;
  minPoint?: [number, number];
  maxPoint?: [number, number];
  // Legacy PascalCase support (from MCP image content extraction)
  ImageBase64?: string;
  Width?: number;
  Height?: number;
  Format?: string;
  Scale?: number;
}

/**
 * Block definition data
 */
export interface BlockDefinition {
  // From get_block_def_list (lowercase keys from C# anonymous objects)
  name?: string;
  hasAttributes?: boolean;
  isFromExternalReference?: boolean;
  attributeCount?: number;
  attributeTags?: string[];
  thumbnail?: string;
  // From extraction results (PascalCase keys)
  Name?: string;
  Thumbnail?: string;
  EntityCount?: number;
  IsAnonymous?: boolean;
  IsFromExternalRef?: boolean;
  Origin?: [number, number, number];
}

/**
 * Drawing item (entity or block reference)
 * Note: Supports both camelCase (from JsonConfig) and PascalCase (legacy)
 */
export interface DrawingItem {
  // camelCase (from JsonConfig)
  type?: 'block' | 'entity';
  handle?: string;
  layer?: string;
  position?: [number, number];
  boundingBox?: [[number, number], [number, number]];
  typeData?: DrawingItemTypeData;
  // PascalCase (legacy)
  Type?: 'block' | 'entity';
  Handle?: string;
  Layer?: string;
  Position?: [number, number];
  BoundingBox?: [[number, number], [number, number]];
  TypeData?: DrawingItemTypeData;
}

/**
 * Combined type data for drawing items
 * This is a union of block and entity fields to avoid TypeScript discriminated union issues
 * Note: Supports both camelCase (from JsonConfig) and PascalCase (legacy)
 */
export interface DrawingItemTypeData {
  // Block-specific fields (camelCase)
  name?: string;
  parentBlockName?: string;
  rotation?: number;
  scale?: [number, number, number];
  attributes?: Record<string, string>;
  // Entity-specific fields (camelCase)
  entityType?: string;
  color?: string;
  lineType?: string;
  geometryData?: unknown;
  // Block-specific fields (PascalCase legacy)
  Name?: string;
  ParentBlockName?: string;
  Rotation?: number;
  Scale?: [number, number, number];
  Attributes?: Record<string, string>;
  // Entity-specific fields (PascalCase legacy)
  EntityType?: string;
  Color?: string;
  LineType?: string;
  GeometryData?: unknown;
}

/**
 * Block reference data (for documentation, actual usage via DrawingItemTypeData)
 */
export interface BlockData {
  Name?: string;
  ParentBlockName?: string;
  Rotation?: number;
  Scale?: [number, number, number];
  Attributes?: Record<string, string>;
}

/**
 * Entity data (for documentation, actual usage via DrawingItemTypeData)
 */
export interface EntityData {
  EntityType?: string;
  Color?: string;
  LineType?: string;
  GeometryData?: unknown;
}

/**
 * Drawing data extraction result
 */
export interface DrawingData {
  Items?: DrawingItem[];
  BlockDefinitions?: Record<string, BlockDefinition>;
  Screenshot?: ScreenshotData;
  Metadata?: Record<string, unknown>;
}

/**
 * Extract region/selection result
 * Structure is flattened: screenshot, items, blockDefinitions at top level
 * Note: Field names are camelCase due to JsonConfig.CamelCaseNamingStrategy
 */
export interface ExtractionResult extends AutoCADCommandResult {
  data?: {
    selectionCount?: number;
    extractedCount?: number;
    bounds?: {
      minPoint: [number, number];
      maxPoint: [number, number];
      width: number;
      height: number;
    };
    // Flattened structure - camelCase field names
    screenshot?: ScreenshotData;
    items?: DrawingItem[];
    blockDefinitions?: Record<string, BlockDefinition>;
  };
}

/**
 * Drawing overview result
 */
export interface DrawingOverviewResult extends AutoCADCommandResult {
  data?: {
    fileName?: string;
    spaces?: Array<{
      name: string;
      entityCount: number;
      blockRefCount: number;
      entityTypes: Record<string, number>;
      extents?: {
        minPoint: [number, number, number];
        maxPoint: [number, number, number];
        width: number;
        height: number;
      };
    }>;
    totalLayers?: number;
    totalBlockDefinitions?: number;
    layerUsage?: Record<string, number>;
    blockUsage?: Record<string, number>;
    units?: string;
  };
}

/**
 * Document list result
 */
export interface DocumentListResult extends AutoCADCommandResult {
  data?: {
    autocadVersion?: string;
    isNetCore?: boolean;
    count?: number;
    documents?: Array<{
      FileName: string;
      FilePath: string;
      IsActive: boolean;
      IsModified: boolean;
      IsReadOnly: boolean;
      DatabaseVersion: string;
      EntityCount: number;
      LayerCount: number;
      BlockDefinitionCount: number;
      Error?: string;
    }>;
  };
}

/**
 * Script execution result
 */
export interface ScriptExecutionResult extends AutoCADCommandResult {
  data?: unknown;
}

/**
 * Command type categories (10 core operations)
 */
export type CommandCategory =
  | 'extraction'      // extract
  | 'overview'        // get_drawing_overview, get_document_list, set_active_document
  | 'view'            // zoom_extents, zoom_window, zoom_center, pan_to_point
  | 'index'           // get_index_path
  | 'script'          // execute_script
  | 'unknown';

/**
 * Get command category from operation type
 */
export function getCommandCategory(operation: string): CommandCategory {
  switch (operation) {
    case 'extract':
      return 'extraction';

    case 'get_document_list':
    case 'set_active_document':
    case 'get_drawing_overview':
      return 'overview';

    case 'get_view':
    case 'zoom_extents':
    case 'zoom_window':
    case 'zoom_center':
    case 'pan_to_point':
      return 'view';

    case 'get_index_path':
      return 'index';

    case 'execute_script':
      return 'script';

    default:
      return 'unknown';
  }
}
