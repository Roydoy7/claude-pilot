/**
 * Drawing overview display component
 * Handles data from get_drawing_overview, get_document_list, set_active_document
 */

import type { ReactNode } from 'react';
import { styles, combineStyles } from '../styles';

interface OverviewDisplayProps {
  data: Record<string, unknown>;
}

export function OverviewDisplay({ data }: OverviewDisplayProps): ReactNode {
  if (!data) return null;

  // Detect data type and render appropriately
  if ('documents' in data) {
    return <DocumentListDisplay data={data} />;
  }

  if ('spaces' in data || 'totalLayers' in data) {
    return <DrawingOverviewDisplay data={data} />;
  }

  // Fallback: show key-value pairs
  return <GenericDataDisplay data={data} />;
}

/**
 * Display document list result
 */
function DocumentListDisplay({ data }: { data: Record<string, unknown> }): ReactNode {
  const documents = data.documents as Array<Record<string, unknown>> | undefined;
  const count = data.count as number | undefined;
  const autocadVersion = data.autocadVersion as string | undefined;
  const isNetCore = data.isNetCore as boolean | undefined;

  return (
    <div style={styles.section}>
      <div style={combineStyles(styles.card, { padding: '0.75rem' })}>
        {/* Header info */}
        <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {autocadVersion && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              AutoCAD: <span style={{ color: styles.valueColors.string }}>{autocadVersion}</span>
              {isNetCore !== undefined && (
                <span style={{ marginLeft: '0.5rem', color: isNetCore ? '#22c55e' : '#f59e0b' }}>
                  ({isNetCore ? '.NET Core' : '.NET Framework'})
                </span>
              )}
            </span>
          )}
          {count !== undefined && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
              Documents: <span style={{ color: styles.valueColors.number }}>{count}</span>
            </span>
          )}
        </div>

        {/* Document list */}
        {documents && documents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {documents.map((doc, index) => {
              const fileName = (doc.FileName || doc.fileName) as string;
              const isActive = (doc.IsActive || doc.isActive) as boolean;
              const isModified = (doc.IsModified || doc.isModified) as boolean;

              return (
                <div
                  key={fileName || index}
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: isActive ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                    borderRadius: '3px',
                    border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ color: styles.valueColors.string, fontWeight: isActive ? 600 : 400 }}>
                    {fileName}
                  </span>
                  {isActive && (
                    <span style={combineStyles(styles.badge, styles.badgeSuccess)}>Active</span>
                  )}
                  {isModified && (
                    <span style={combineStyles(styles.badge, styles.badgeWarning)}>Modified</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Display drawing overview result
 */
function DrawingOverviewDisplay({ data }: { data: Record<string, unknown> }): ReactNode {
  const fileName = data.fileName as string | undefined;
  const spaces = data.spaces as Array<Record<string, unknown>> | undefined;
  const totalLayers = data.totalLayers as number | undefined;
  const totalBlockDefinitions = data.totalBlockDefinitions as number | undefined;
  const units = data.units as string | undefined;
  const layerUsage = data.layerUsage as Record<string, number> | undefined;
  const blockUsage = data.blockUsage as Record<string, number> | undefined;

  return (
    <div style={styles.section}>
      <div style={combineStyles(styles.card, { padding: '0.75rem' })}>
        {/* File info */}
        {fileName && (
          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.65rem' }}>File: </span>
            <span style={{ color: styles.valueColors.string, fontWeight: '500' }}>
              {fileName}
            </span>
          </div>
        )}

        {/* Stats grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}>
          {totalLayers !== undefined && <StatItem label="Layers" value={totalLayers} />}
          {totalBlockDefinitions !== undefined && <StatItem label="Blocks" value={totalBlockDefinitions} />}
          {units && <StatItem label="Units" value={units} />}
        </div>

        {/* Spaces */}
        {spaces && spaces.length > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Spaces:
            </div>
            {spaces.map((space, index) => {
              const name = space.name as string;
              const entityCount = space.entityCount as number;
              const blockRefCount = space.blockRefCount as number;

              return (
                <div
                  key={name || index}
                  style={{
                    padding: '0.25rem 0.5rem',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '3px',
                    marginBottom: '0.25rem',
                    display: 'flex',
                    gap: '1rem',
                    fontSize: '0.65rem',
                  }}
                >
                  <span style={{ color: styles.valueColors.string, fontWeight: 500 }}>{name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Entities: <span style={{ color: styles.valueColors.number }}>{entityCount}</span>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    Blocks: <span style={{ color: styles.valueColors.number }}>{blockRefCount}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Layer usage */}
        {layerUsage && Object.keys(layerUsage).length > 0 && (
          <UsageSummary title="Layer Usage" usage={layerUsage} />
        )}

        {/* Block usage */}
        {blockUsage && Object.keys(blockUsage).length > 0 && (
          <UsageSummary title="Block Usage" usage={blockUsage} />
        )}
      </div>
    </div>
  );
}

/**
 * Generic data display for unknown structures
 */
function GenericDataDisplay({ data }: { data: Record<string, unknown> }): ReactNode {
  const entries = Object.entries(data).filter(([, v]) => v !== undefined && v !== null);

  if (entries.length === 0) return null;

  return (
    <div style={styles.section}>
      <div style={combineStyles(styles.card, { padding: '0.75rem' })}>
        {entries.map(([key, value]) => (
          <div key={key} style={{ marginBottom: '0.25rem', fontSize: '0.65rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>{key}: </span>
            <span style={{ color: typeof value === 'number' ? styles.valueColors.number : styles.valueColors.string }}>
              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value?: string | number }): ReactNode {
  if (value === undefined || value === null) return null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      padding: '0.25rem 0.5rem',
      backgroundColor: 'var(--bg-secondary)',
      borderRadius: '3px',
    }}>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{
        fontSize: '0.75rem',
        fontWeight: '600',
        color: typeof value === 'number' ? styles.valueColors.number : 'var(--text-normal)',
      }}>
        {value}
      </span>
    </div>
  );
}

function UsageSummary({ title, usage }: { title: string; usage: Record<string, number> }): ReactNode {
  const entries = Object.entries(usage).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
        {title}:
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
        {entries.map(([name, count]) => (
          <span
            key={name}
            style={{
              padding: '0.125rem 0.375rem',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '3px',
              fontSize: '0.6rem',
            }}
          >
            <span style={{ color: styles.valueColors.string }}>{name}</span>
            <span style={{ color: styles.valueColors.number, marginLeft: '0.25rem' }}>{count}</span>
          </span>
        ))}
        {Object.keys(usage).length > 5 && (
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
            +{Object.keys(usage).length - 5} more
          </span>
        )}
      </div>
    </div>
  );
}
