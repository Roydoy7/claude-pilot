/**
 * Shared styles for AutoCAD tool display components
 */
import type { CSSProperties } from 'react';

export const styles = {
  // Status indicators
  successText: {
    color: '#10b981',
    fontWeight: '600',
  } as CSSProperties,

  errorText: {
    color: '#ef4444',
    fontWeight: '600',
  } as CSSProperties,

  // Container styles
  container: {
    fontSize: '0.75rem',
  } as CSSProperties,

  section: {
    marginBottom: '0.75rem',
  } as CSSProperties,

  sectionHeader: {
    fontSize: '0.7rem',
    color: 'var(--text-secondary)',
    marginBottom: '0.5rem',
    fontWeight: '600',
  } as CSSProperties,

  // Card styles
  card: {
    backgroundColor: 'var(--background-modifier-form-field)',
    padding: '0.5rem',
    borderRadius: '4px',
  } as CSSProperties,

  cardWithBorder: {
    backgroundColor: 'var(--background-modifier-form-field)',
    padding: '0.5rem',
    borderRadius: '4px',
    border: '1px solid var(--border)',
  } as CSSProperties,

  // Scrollable container
  scrollContainer: {
    maxHeight: '300px',
    overflow: 'auto',
  } as CSSProperties,

  // List item styles
  listItem: {
    marginBottom: '0.5rem',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,

  listItemLast: {
    marginBottom: '0',
    paddingBottom: '0',
    borderBottom: 'none',
  } as CSSProperties,

  // Data display styles
  monoText: {
    fontFamily: 'var(--font-mono)',
    fontSize: '0.7rem',
  } as CSSProperties,

  // Value colors (VS Code theme inspired)
  valueColors: {
    key: '#9cdcfe',
    string: '#ce9178',
    number: '#b5cea8',
    boolean: '#569cd6',
    type: '#4ec9b0',
    keyword: '#c586c0',
    muted: 'var(--text-muted)',
  },

  // Table styles
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '0.7rem',
  } as CSSProperties,

  tableHeader: {
    textAlign: 'left' as const,
    padding: '0.25rem 0.5rem',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-secondary)',
    fontWeight: '600',
  } as CSSProperties,

  tableCell: {
    padding: '0.25rem 0.5rem',
    borderBottom: '1px solid var(--border)',
  } as CSSProperties,

  // Image styles
  thumbnail: {
    maxWidth: '80px',
    maxHeight: '80px',
    border: '1px solid var(--border)',
    borderRadius: '3px',
    backgroundColor: '#ffffff',
    padding: '2px',
  } as CSSProperties,

  screenshot: {
    maxWidth: '100%',
    height: 'auto',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    backgroundColor: 'var(--bg-secondary)',
    cursor: 'pointer',
  } as CSSProperties,

  // Badge styles
  badge: {
    display: 'inline-block',
    padding: '0.125rem 0.375rem',
    borderRadius: '3px',
    fontSize: '0.65rem',
    fontWeight: '500',
  } as CSSProperties,

  badgeSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
  } as CSSProperties,

  badgeError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
  } as CSSProperties,

  badgeInfo: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    color: '#3b82f6',
  } as CSSProperties,

  badgeWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    color: '#f59e0b',
  } as CSSProperties,

  // Summary row
  summaryRow: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap' as const,
    marginBottom: '0.5rem',
  } as CSSProperties,

  summaryItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
    fontSize: '0.7rem',
    color: 'var(--text-secondary)',
  } as CSSProperties,

  summaryValue: {
    fontWeight: '600',
    color: 'var(--text-normal)',
  } as CSSProperties,
};

/**
 * Combine multiple style objects
 */
export function combineStyles(...styleObjects: (CSSProperties | undefined)[]): CSSProperties {
  return Object.assign({}, ...styleObjects.filter(Boolean));
}
