/**
 * Main result renderer - routes to appropriate component based on command type
 */

import type { ReactNode } from 'react';
import type { ExtractionResult } from './types';
import type { ParsedAutoCADResult } from './ResultParser';
import { getCommandCategory } from './types';
import { styles } from './styles';
import {
  StatusBadge,
  ScreenshotDisplay,
  ItemsTable,
  ItemsSummary,
  BlockDefList,
  OverviewDisplay,
} from './renderers';

interface ResultRendererProps {
  result: ParsedAutoCADResult;
  operation: string;
}

/**
 * Main result renderer component
 */
export function ResultRenderer({ result, operation }: ResultRendererProps): ReactNode {
  const category = getCommandCategory(operation);
  const hasData = result.success && result.data !== undefined && result.data !== null;

  return (
    <div style={styles.container}>
      <StatusBadge success={result.success} message={result.message} />

      {hasData && (
        <div style={{ marginTop: '0.5rem' }}>
          {renderDataByCategory(category, operation, result)}
        </div>
      )}
    </div>
  );
}

/**
 * Render data based on command category
 */
function renderDataByCategory(category: string, operation: string, result: ParsedAutoCADResult): ReactNode {
  // result.data is HTTP CommandResult which has .data field containing actual response data
  const httpResult = result.data as { data?: unknown } | undefined;
  const data = httpResult?.data;

  switch (category) {
    case 'extraction':
      return renderExtractionResult(data as ExtractionResult['data'], result.screenshotImage);

    case 'overview':
      return <OverviewDisplay data={data as Record<string, unknown>} />;

    case 'view':
      return renderViewResult(data as Record<string, unknown>, result.screenshotImage);

    case 'index':
      return renderIndexResult(operation, data);

    case 'script':
      return renderScriptResult(data);

    default:
      return renderFallback(data);
  }
}

/**
 * View bounds data structure
 */
interface ViewBoundsData {
  centerPoint?: number[];
  minPoint?: number[];
  maxPoint?: number[];
  width?: number;
  height?: number;
}

/**
 * View info data structure (for get_view)
 */
interface ViewInfoData {
  currentView?: ViewBoundsData;
  drawingExtents?: ViewBoundsData;
  screenshot?: { imageBase64?: string };
}

/**
 * Render view result (get_view, zoom_*, pan_to_point)
 */
function renderViewResult(data: Record<string, unknown>, screenshotImage?: string): ReactNode {
  if (!data) return null;

  // get_view returns ViewInfoData with currentView and drawingExtents
  // zoom/pan operations return ViewBoundsData directly
  const viewInfo = data as ViewInfoData;
  const isGetView = viewInfo.currentView !== undefined;

  if (isGetView) {
    const currentView = viewInfo.currentView;
    const drawingExtents = viewInfo.drawingExtents;

    return (
      <>
        {/* Current View info */}
        {currentView && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Current View:</div>
            <div style={{ ...styles.summaryRow, marginBottom: '0.25rem' }}>
              <span style={styles.summaryItem}>
                <span>Size:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  {currentView.width?.toFixed(1) ?? '?'} × {currentView.height?.toFixed(1) ?? '?'}
                </span>
              </span>
              {currentView.centerPoint && (
                <span style={styles.summaryItem}>
                  <span>Center:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    ({currentView.centerPoint[0]?.toFixed(1)}, {currentView.centerPoint[1]?.toFixed(1)})
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Drawing Extents info */}
        {drawingExtents && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>Drawing Extents:</div>
            <div style={styles.summaryRow}>
              <span style={styles.summaryItem}>
                <span>Size:</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                  {drawingExtents.width?.toFixed(1) ?? '?'} × {drawingExtents.height?.toFixed(1) ?? '?'}
                </span>
              </span>
              {drawingExtents.centerPoint && (
                <span style={styles.summaryItem}>
                  <span>Center:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                    ({drawingExtents.centerPoint[0]?.toFixed(1)}, {drawingExtents.centerPoint[1]?.toFixed(1)})
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Screenshot from image content blocks */}
        {screenshotImage && (
          <ScreenshotDisplay
            screenshot={{ ImageBase64: screenshotImage }}
            title="View Screenshot"
          />
        )}
      </>
    );
  }

  // Zoom/pan operations return ViewBoundsData directly
  const viewBounds = data as ViewBoundsData;
  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>New View:</div>
      <div style={styles.summaryRow}>
        <span style={styles.summaryItem}>
          <span>Size:</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
            {viewBounds.width?.toFixed(1) ?? '?'} × {viewBounds.height?.toFixed(1) ?? '?'}
          </span>
        </span>
        {viewBounds.centerPoint && (
          <span style={styles.summaryItem}>
            <span>Center:</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
              ({viewBounds.centerPoint[0]?.toFixed(1)}, {viewBounds.centerPoint[1]?.toFixed(1)})
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Render extraction result (extract)
 * Data structure is now flattened: items, blockDefinitions are at top level (camelCase)
 */
function renderExtractionResult(data: ExtractionResult['data'], screenshotImage?: string): ReactNode {
  if (!data) return null;

  // items and blockDefinitions are at top level (camelCase from JsonConfig)
  const items = data.items;
  const blockDefs = data.blockDefinitions;

  return (
    <>
      {/* Bounds summary */}
      {data.bounds && (
        <div style={{ ...styles.summaryRow, marginBottom: '0.5rem' }}>
          <span style={styles.summaryItem}>
            <span style={styles.summaryValue}>{data.extractedCount ?? items?.length ?? 0}</span>
            <span>items extracted</span>
          </span>
          {typeof data.bounds.width === 'number' && typeof data.bounds.height === 'number' && (
            <span style={styles.summaryItem}>
              <span>Region:</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
                {data.bounds.width.toFixed(1)} × {data.bounds.height.toFixed(1)}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Screenshot from image content blocks */}
      {screenshotImage && (
        <ScreenshotDisplay
          screenshot={{ ImageBase64: screenshotImage }}
          title="Region Screenshot"
        />
      )}

      {/* Items summary then table */}
      {items && items.length > 0 && (
        <>
          <ItemsSummary items={items} />
          <ItemsTable items={items} />
        </>
      )}

      {/* Block definitions */}
      {blockDefs && Object.keys(blockDefs).length > 0 && (
        <BlockDefList blocks={blockDefs} />
      )}
    </>
  );
}

/**
 * Render index operation result (get_index_path)
 */
function renderIndexResult(_operation: string, data: unknown): ReactNode {
  if (!data) return null;

  const d = data as Record<string, unknown>;
  const exists = Boolean(d.exists);
  const isUpToDate = Boolean(d.isUpToDate);
  const indexPath = d.indexPath as string | undefined;

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>Index Path:</div>
      <div style={styles.card}>
        <div style={styles.summaryRow}>
          <span style={styles.summaryItem}>
            <span style={{
              color: exists ? '#22c55e' : '#ef4444',
              fontWeight: 600
            }}>
              {exists ? 'Exists' : 'Not found'}
            </span>
          </span>
          {d.isUpToDate !== undefined && exists && (
            <span style={styles.summaryItem}>
              <span style={{
                color: isUpToDate ? '#22c55e' : '#f59e0b',
                fontWeight: 600
              }}>
                {isUpToDate ? 'Up to date' : 'Outdated'}
              </span>
            </span>
          )}
        </div>
        {indexPath && (
          <div style={{ ...styles.monoText, marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
            {indexPath}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render script execution result
 */
function renderScriptResult(data: unknown): ReactNode {
  if (!data) return null;

  // Script can return various types of data
  const isSimpleValue = typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean';

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>Script Result:</div>
      <div style={styles.card}>
        {isSimpleValue ? (
          <div style={{ ...styles.monoText, color: styles.valueColors.string }}>
            {String(data)}
          </div>
        ) : (
          <pre style={{
            ...styles.monoText,
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '200px',
            overflow: 'auto',
          }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * Fallback renderer for unknown data structures
 */
function renderFallback(data: unknown): ReactNode {
  if (!data) return null;

  // Only show a compact summary, not full JSON
  const keys = typeof data === 'object' && data !== null ? Object.keys(data) : [];

  return (
    <div style={{ ...styles.card, ...styles.monoText }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
        Data keys: {keys.length > 0 ? keys.join(', ') : '(empty)'}
      </div>
    </div>
  );
}
