/**
 * Reusable image viewer with modal overlay
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ImageViewerProps {
  /** Base64 encoded image data */
  imageData: string;
  /** MIME type of the image (e.g., 'image/png') */
  mimeType?: string;
  /** Alt text for accessibility */
  alt?: string;
  /** Thumbnail style overrides */
  thumbnailStyle?: React.CSSProperties;
  /** Optional children to render below the image */
  children?: ReactNode;
}

/**
 * Image component with click-to-enlarge modal functionality
 * Uses portal to render modal at document body level
 */
export function ImageViewer({
  imageData,
  mimeType = 'image/png',
  alt = 'Image',
  thumbnailStyle,
  children,
}: ImageViewerProps): ReactNode {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen, closeModal]);

  const imageSrc = `data:${mimeType};base64,${imageData}`;

  const defaultThumbnailStyle: React.CSSProperties = {
    maxWidth: '100%',
    maxHeight: '300px',
    borderRadius: '4px',
    cursor: 'pointer',
    objectFit: 'contain',
  };

  return (
    <>
      <img
        src={imageSrc}
        alt={alt}
        style={{ ...defaultThumbnailStyle, ...thumbnailStyle }}
        onClick={openModal}
        title="Click to enlarge"
      />
      {children}

      {/* Modal overlay */}
      {isModalOpen && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer',
          }}
          onClick={closeModal}
        >
          <img
            src={imageSrc}
            alt={alt}
            style={{
              maxWidth: '95%',
              maxHeight: '95%',
              objectFit: 'contain',
              cursor: 'default',
              borderRadius: '4px',
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {/* Close hint */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.85rem',
            }}
          >
            Press ESC or click outside to close
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
