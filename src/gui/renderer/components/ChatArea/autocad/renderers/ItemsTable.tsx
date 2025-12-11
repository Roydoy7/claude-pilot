/**
 * Drawing items table component - displays entities/blocks in a compact table format
 */

import { Fragment, useState } from 'react';
import type { ReactNode } from 'react';
import type { DrawingItem, DrawingItemTypeData } from '../types';
import { styles, combineStyles } from '../styles';

interface ItemsTableProps {
  items: DrawingItem[];
  maxInitialItems?: number;
}

const ITEMS_PER_PAGE = 20;

/**
 * Helper to get item field value (supports both camelCase and PascalCase)
 */
function getItemType(item: DrawingItem): string | undefined {
  return item.type || item.Type;
}

function getItemHandle(item: DrawingItem): string | undefined {
  return item.handle || item.Handle;
}

function getItemLayer(item: DrawingItem): string | undefined {
  return item.layer || item.Layer;
}

function getItemPosition(item: DrawingItem): [number, number] | undefined {
  return item.position || item.Position;
}

function getItemTypeData(item: DrawingItem): DrawingItemTypeData | undefined {
  return item.typeData || item.TypeData;
}

/**
 * Helper to get typeData field value (supports both camelCase and PascalCase)
 */
function getTypeDataEntityType(td: DrawingItemTypeData): string | undefined {
  return td.entityType || td.EntityType;
}

function getTypeDataParentBlockName(td: DrawingItemTypeData): string | undefined {
  return td.parentBlockName || td.ParentBlockName;
}

function getTypeDataRotation(td: DrawingItemTypeData): number | undefined {
  return td.rotation ?? td.Rotation;
}

function getTypeDataScale(td: DrawingItemTypeData): [number, number, number] | undefined {
  return td.scale || td.Scale;
}

function getTypeDataAttributes(td: DrawingItemTypeData): Record<string, string> | undefined {
  return td.attributes || td.Attributes;
}

export function ItemsTable({ items, maxInitialItems = ITEMS_PER_PAGE }: ItemsTableProps): ReactNode {
  const [showAll, setShowAll] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  if (!items || items.length === 0) return null;

  const displayItems = showAll ? items : items.slice(0, maxInitialItems);
  const hasMore = items.length > maxInitialItems;

  const toggleExpand = (handle: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(handle)) {
        next.delete(handle);
      } else {
        next.add(handle);
      }
      return next;
    });
  };

  // Check if item has expandable details
  const hasDetails = (item: DrawingItem): boolean => {
    if (getItemType(item) !== 'block') return false;
    const td = getItemTypeData(item);
    if (!td) return false;
    const attrs = getTypeDataAttributes(td);
    return !!(
      (attrs && Object.keys(attrs).length > 0) ||
      getTypeDataRotation(td) !== undefined ||
      getTypeDataScale(td)
    );
  };

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        Items ({items.length}):
      </div>
      <div style={combineStyles(styles.card, styles.scrollContainer)}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.tableHeader}></th>
              <th style={styles.tableHeader}>Type</th>
              <th style={styles.tableHeader}>Name/Handle</th>
              <th style={styles.tableHeader}>Layer</th>
              <th style={styles.tableHeader}>Position</th>
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, index) => {
              const handle = getItemHandle(item);
              const itemType = getItemType(item);
              const td = getItemTypeData(item);
              const position = getItemPosition(item);
              const layer = getItemLayer(item);
              const isExpanded = handle ? expandedItems.has(handle) : false;
              const canExpand = hasDetails(item);

              return (
                <Fragment key={handle || `item-${index}`}>
                  <tr
                    onClick={() => canExpand && handle && toggleExpand(handle)}
                    style={{ cursor: canExpand ? 'pointer' : 'default' }}
                  >
                    <td style={{ ...styles.tableCell, width: '20px', textAlign: 'center' }}>
                      {canExpand && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.6rem' }}>
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      )}
                    </td>
                    <td style={styles.tableCell}>
                      <span style={{ color: styles.valueColors.type }}>
                        {itemType === 'block' ? 'Block' : (td ? getTypeDataEntityType(td) : undefined) || 'Entity'}
                      </span>
                    </td>
                    <td style={styles.tableCell}>
                      {itemType === 'block' && td && getTypeDataParentBlockName(td) ? (
                        <span style={{ color: styles.valueColors.string }}>
                          {getTypeDataParentBlockName(td)}
                        </span>
                      ) : (
                        <span style={{ color: styles.valueColors.muted, fontFamily: 'var(--font-mono)' }}>
                          {handle}
                        </span>
                      )}
                    </td>
                    <td style={styles.tableCell}>
                      <span style={{ color: styles.valueColors.keyword }}>
                        {layer || '-'}
                      </span>
                    </td>
                    <td style={combineStyles(styles.tableCell, styles.monoText)}>
                      {position ? (
                        <span style={{ color: styles.valueColors.number }}>
                          [{position[0]?.toFixed(1)}, {position[1]?.toFixed(1)}]
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                  {isExpanded && td && (
                    <tr>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <BlockRefDetails item={item} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {hasMore && !showAll && (
          <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
            <button
              onClick={() => setShowAll(true)}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid var(--border)',
                borderRadius: '3px',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-secondary)',
                fontSize: '0.65rem',
                cursor: 'pointer',
              }}
            >
              Show all {items.length} items
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Block reference details - shows attributes, rotation, scale
 */
function BlockRefDetails({ item }: { item: DrawingItem }): ReactNode {
  const td = getItemTypeData(item);
  if (!td) return null;

  const handle = getItemHandle(item);
  const rotation = getTypeDataRotation(td);
  const scale = getTypeDataScale(td);
  const attrs = getTypeDataAttributes(td) || {};
  const hasAttrs = Object.keys(attrs).length > 0;

  return (
    <div style={{
      backgroundColor: 'var(--bg-secondary)',
      padding: '0.5rem 0.75rem',
      marginLeft: '20px',
      borderLeft: '2px solid var(--accent)',
      fontSize: '0.65rem',
    }}>
      {/* Handle */}
      <div style={{ marginBottom: '0.25rem', color: 'var(--text-muted)' }}>
        Handle: <span style={{ fontFamily: 'var(--font-mono)' }}>{handle}</span>
      </div>

      {/* Rotation & Scale in one row */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: hasAttrs ? '0.5rem' : 0 }}>
        {rotation !== undefined && (
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Rotation: </span>
            <span style={{ color: styles.valueColors.number }}>{rotation.toFixed(1)}°</span>
          </div>
        )}
        {scale && (
          <div>
            <span style={{ color: 'var(--text-muted)' }}>Scale: </span>
            <span style={{ color: styles.valueColors.number }}>
              [{scale[0]?.toFixed(2)}, {scale[1]?.toFixed(2)}, {scale[2]?.toFixed(2)}]
            </span>
          </div>
        )}
      </div>

      {/* Attributes */}
      {hasAttrs && (
        <div>
          <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: '600' }}>
            Attributes:
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: '0.25rem 1rem',
          }}>
            {Object.entries(attrs).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', gap: '0.25rem' }}>
                <span style={{ color: styles.valueColors.keyword }}>{key}:</span>
                <span style={{ color: styles.valueColors.string, wordBreak: 'break-word' }}>
                  {value || '(empty)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Compact summary of items by type
 */
export function ItemsSummary({ items }: { items: DrawingItem[] }): ReactNode {
  if (!items || items.length === 0) return null;

  // Group by type
  const typeCount: Record<string, number> = {};
  for (const item of items) {
    const itemType = getItemType(item);
    const td = getItemTypeData(item);
    const type = itemType === 'block'
      ? (td ? getTypeDataParentBlockName(td) : undefined) || 'Block'
      : (td ? getTypeDataEntityType(td) : undefined) || 'Entity';
    typeCount[type] = (typeCount[type] || 0) + 1;
  }

  const entries = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);

  return (
    <div style={styles.summaryRow}>
      {entries.slice(0, 5).map(([type, count]) => (
        <span key={type} style={styles.summaryItem}>
          <span style={styles.summaryValue}>{count}</span>
          <span>{type}</span>
        </span>
      ))}
      {entries.length > 5 && (
        <span style={styles.summaryItem}>
          <span>+{entries.length - 5} more types</span>
        </span>
      )}
    </div>
  );
}
