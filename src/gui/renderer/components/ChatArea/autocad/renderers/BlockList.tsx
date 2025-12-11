/**
 * Block definition list display component
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import type { BlockDefinition } from '../types';
import { styles, combineStyles } from '../styles';

interface BlockDefListProps {
  /** Blocks can be an array (from get_block_def_list) or a record (from extraction) */
  blocks: BlockDefinition[] | Record<string, BlockDefinition>;
  /** External thumbnails extracted from image content blocks */
  thumbnails?: Record<string, string>;
}

const ITEMS_PER_PAGE = 20;

/**
 * Normalize blocks to array format with name
 */
function normalizeBlocks(blocks: BlockDefinition[] | Record<string, BlockDefinition>): Array<{ name: string; def: BlockDefinition }> {
  if (Array.isArray(blocks)) {
    return blocks.map(def => ({
      name: def.name || def.Name || 'Unknown',
      def,
    }));
  }
  return Object.entries(blocks).map(([name, def]) => ({ name, def }));
}

export function BlockDefList({ blocks, thumbnails }: BlockDefListProps): ReactNode {
  const [showAll, setShowAll] = useState(false);
  const [expandedBlock, setExpandedBlock] = useState<string | null>(null);

  if (!blocks || (Array.isArray(blocks) ? blocks.length === 0 : Object.keys(blocks).length === 0)) return null;

  const normalizedBlocks = normalizeBlocks(blocks);
  const displayBlocks = showAll ? normalizedBlocks : normalizedBlocks.slice(0, ITEMS_PER_PAGE);
  const hasMore = normalizedBlocks.length > ITEMS_PER_PAGE;

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>
        Block Definitions ({normalizedBlocks.length}):
      </div>
      <div style={combineStyles(styles.card, styles.scrollContainer)}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ ...styles.tableHeader, width: '60px' }}>Preview</th>
              <th style={styles.tableHeader}>Name</th>
              <th style={styles.tableHeader}>Attributes</th>
              <th style={styles.tableHeader}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {displayBlocks.map(({ name, def }) => {
              // Get thumbnail from external thumbnails or from definition
              const thumbnail = thumbnails?.[name] || def.thumbnail || def.Thumbnail;
              const attrCount = def.attributeCount ?? 0;
              const attrTags = def.attributeTags;
              const hasAttrs = def.hasAttributes || attrCount > 0;
              const isExpanded = expandedBlock === name;

              return (
                <>
                  <tr key={name}>
                    <td style={{ ...styles.tableCell, padding: '0.25rem' }}>
                      {thumbnail ? (
                        <img
                          src={`data:image/png;base64,${thumbnail}`}
                          alt={name}
                          style={{
                            width: '50px',
                            height: '50px',
                            objectFit: 'contain',
                            border: '1px solid var(--border)',
                            borderRadius: '3px',
                            backgroundColor: '#ffffff',
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '50px',
                          height: '50px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid var(--border)',
                          borderRadius: '3px',
                          backgroundColor: 'var(--bg-secondary)',
                          color: 'var(--text-muted)',
                          fontSize: '0.5rem',
                        }}>
                          No preview
                        </div>
                      )}
                    </td>
                    <td style={styles.tableCell}>
                      <span style={{ color: styles.valueColors.string, fontWeight: '500' }}>
                        {name}
                      </span>
                    </td>
                    <td style={styles.tableCell}>
                      {hasAttrs ? (
                        <button
                          onClick={() => setExpandedBlock(isExpanded ? null : name)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            color: styles.valueColors.number,
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.25rem',
                          }}
                        >
                          <span style={{ fontWeight: 500 }}>{attrCount}</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                    <td style={styles.tableCell}>
                      <BlockDefFlags definition={def} />
                    </td>
                  </tr>
                  {isExpanded && attrTags && attrTags.length > 0 && (
                    <tr key={`${name}-attrs`}>
                      <td colSpan={4} style={{ padding: '0.25rem 0.5rem', backgroundColor: 'var(--bg-tertiary)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                          Attribute Tags:
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                          {attrTags.map(tag => (
                            <span
                              key={tag}
                              style={{
                                padding: '0.125rem 0.375rem',
                                backgroundColor: 'var(--bg-secondary)',
                                border: '1px solid var(--border)',
                                borderRadius: '3px',
                                fontSize: '0.65rem',
                                fontFamily: 'var(--font-mono)',
                                color: styles.valueColors.keyword,
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
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
              Show all {normalizedBlocks.length} blocks
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Display flags for block definition
 */
function BlockDefFlags({ definition }: { definition: BlockDefinition }): ReactNode {
  const flags: ReactNode[] = [];

  if (definition.IsAnonymous) {
    flags.push(
      <span key="anon" style={combineStyles(styles.badge, styles.badgeInfo, { marginRight: '0.25rem' })}>
        Anonymous
      </span>
    );
  }

  // Handle both casing
  const isFromXRef = definition.IsFromExternalRef || definition.isFromExternalReference;
  if (isFromXRef) {
    flags.push(
      <span key="xref" style={combineStyles(styles.badge, styles.badgeWarning, { marginRight: '0.25rem' })}>
        XRef
      </span>
    );
  }

  if (flags.length === 0) {
    return <span style={{ color: 'var(--text-muted)' }}>-</span>;
  }

  return <>{flags}</>;
}
