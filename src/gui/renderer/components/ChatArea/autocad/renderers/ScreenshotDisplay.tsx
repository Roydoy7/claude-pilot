/**
 * Screenshot display component
 */

import type { ReactNode } from 'react';
import type { ScreenshotData } from '../types';
import { styles } from '../styles';
import { ImageViewer } from '../../../common/ImageViewer';

interface ScreenshotDisplayProps {
  screenshot: ScreenshotData;
  title?: string;
}

export function ScreenshotDisplay({ screenshot, title = 'Screenshot' }: ScreenshotDisplayProps): ReactNode {
  // Support both camelCase (from JsonConfig) and PascalCase (legacy/MCP extraction)
  const imageData = screenshot.imageBase64 || screenshot.ImageBase64;
  if (!imageData) return null;

  const format = screenshot.format || screenshot.Format || 'png';
  const width = screenshot.width ?? screenshot.Width;
  const height = screenshot.height ?? screenshot.Height;
  const scale = screenshot.scale ?? screenshot.Scale;
  const mimeType = `image/${format}`;

  return (
    <div style={styles.section}>
      <div style={styles.sectionHeader}>{title}:</div>
      <ImageViewer
        imageData={imageData}
        mimeType={mimeType}
        alt={title}
        thumbnailStyle={styles.screenshot}
      >
        {(width !== undefined && height !== undefined) && (
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {width} × {height} px
            {scale !== undefined && ` • Scale: ${scale.toFixed(4)} units/px`}
          </div>
        )}
      </ImageViewer>
    </div>
  );
}
