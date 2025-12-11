/**
 * Status badge component for AutoCAD results
 */

import type { ReactNode } from 'react';
import { styles, combineStyles } from '../styles';

interface StatusBadgeProps {
  success: boolean;
  message?: string;
}

export function StatusBadge({ success, message }: StatusBadgeProps): ReactNode {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <span style={combineStyles(
        styles.badge,
        success ? styles.badgeSuccess : styles.badgeError
      )}>
        {success ? '✓ Success' : '✗ Failed'}
      </span>
      {message && (
        <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          {message}
        </span>
      )}
    </div>
  );
}
