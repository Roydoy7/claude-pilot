/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * WorkspaceBrowser Component - Tree view for session directories (cwd + additionalDirectories)
 */

import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { FileTreeNode } from '../../../preload/preload-types';

// Use FileTreeNode from preload-types for consistency
type FileNode = FileTreeNode;

interface DirectoryTree {
  directoryType: 'cwd' | 'additional';
  directoryPath: string;
  directoryLabel: string;
  tree: FileNode | null;
}

interface WorkspaceBrowserProps {
  sessionId?: string;
  cwd?: string; // Alternative: use cwd directly when sessionId is not available
  onSelect: (paths: string[]) => void;
  onClose: () => void;
}

interface TreeNodeProps {
  node: FileNode;
  level: number;
  selectedPaths: Set<string>;
  onToggle: (path: string) => void;
  onLoadChildren: (path: string) => Promise<FileNode[]>;
}

// Get file icon based on file extension
function getFileIcon(fileName: string, isDirectory: boolean) {
  if (isDirectory) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      </svg>
    );
  }

  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  // Code files
  if (['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'php', 'rb', 'swift'].includes(ext)) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
      </svg>
    );
  }

  // JSON/Config files
  if (['json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config'].includes(ext)) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <path d="M10 12h4"></path>
        <path d="M10 16h4"></path>
      </svg>
    );
  }

  // Markdown/Text files
  if (['md', 'txt', 'rst', 'adoc'].includes(ext)) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
        <polyline points="14 2 14 8 20 8"></polyline>
        <line x1="16" y1="13" x2="8" y2="13"></line>
        <line x1="16" y1="17" x2="8" y2="17"></line>
        <polyline points="10 9 9 9 8 9"></polyline>
      </svg>
    );
  }

  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <circle cx="8.5" cy="8.5" r="1.5"></circle>
        <polyline points="21 15 16 10 5 21"></polyline>
      </svg>
    );
  }

  // Default file icon
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
    </svg>
  );
}

function TreeNode({ node, level, selectedPaths, onToggle, onLoadChildren }: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | undefined>(node.children);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const loadingRef = useRef(false);
  const isSelected = selectedPaths.has(node.path);
  const isDirectory = node.type === 'directory';
  const hasChildren = isDirectory && children !== undefined && children.length > 0;
  const mayHaveChildren = isDirectory && (children === undefined || children.length > 0);

  const handleClick = async () => {
    if (!isDirectory) return;

    const nextExpanded = !isExpanded;
    setIsExpanded(nextExpanded);

    if (nextExpanded && children === undefined && !loadingRef.current) {
      loadingRef.current = true;
      setIsLoading(true);
      setLoadFailed(false);
      try {
        setChildren(await onLoadChildren(node.path));
      } catch (error) {
        console.error(`Failed to load directory ${node.path}:`, error);
        setLoadFailed(true);
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onToggle(node.path);
  };

  return (
    <div className="tree-node">
      <div
        className="tree-node-content"
        style={{ paddingLeft: `${level * 20}px` }}
        onClick={handleClick}
      >
        <span className="tree-node-checkbox" onClick={handleCheckboxClick}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={handleCheckboxChange}
          />
        </span>
        {mayHaveChildren && (
          <span className="tree-node-arrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isLoading ? (
                <circle className="tree-node-loading-circle" cx="12" cy="12" r="9"></circle>
              ) : isExpanded ? (
                <polyline points="6 9 12 15 18 9"></polyline>
              ) : (
                <polyline points="9 18 15 12 9 6"></polyline>
              )}
            </svg>
          </span>
        )}
        {!mayHaveChildren && isDirectory && (
          <span className="tree-node-arrow empty">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" opacity="0.3"></circle>
            </svg>
          </span>
        )}
        <span className="tree-node-icon">
          {getFileIcon(node.name, node.type === 'directory')}
        </span>
        <span className="tree-node-name" title={loadFailed ? `${node.path} (failed to read)` : node.path}>
          {node.name}
        </span>
        {loadFailed && <span className="tree-node-load-error">!</span>}
      </div>
      {hasChildren && isExpanded && (
        <div className="tree-node-children">
          {children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              level={level + 1}
              selectedPaths={selectedPaths}
              onToggle={onToggle}
              onLoadChildren={onLoadChildren}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function WorkspaceBrowser({ sessionId, cwd, onSelect, onClose }: WorkspaceBrowserProps) {
  const { t } = useLanguage();
  const [trees, setTrees] = useState<DirectoryTree[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDirectories();
  }, [sessionId, cwd]);

  const loadDirectories = async () => {
    try {
      setLoading(true);

      if (sessionId) {
        // Get file trees for session directories from backend
        const directoryTrees = await window.electronAPI.session.getFileTree(sessionId);
        setTrees(directoryTrees);
      } else if (cwd) {
        // Get file tree for specified cwd directly
        const directoryTrees = await window.electronAPI.workspace.getFileTreeForDirectory(cwd);
        setTrees(directoryTrees);
      } else {
        setTrees([]);
      }
    } catch (error) {
      console.error('Failed to load directories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (path: string) => {
    const newSelected = new Set(selectedPaths);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedPaths(newSelected);
  };

  const handleConfirm = () => {
    const paths = Array.from(selectedPaths);
    onSelect(paths);
    onClose();
  };

  const handleClear = () => {
    setSelectedPaths(new Set());
  };

  const loadDirectoryChildren = (path: string) => {
    return window.electronAPI.workspace.getDirectoryChildren(path);
  };

  return (
    <div className="workspace-browser-overlay" onClick={onClose}>
      <div className="workspace-browser-modal" onClick={(e) => e.stopPropagation()}>
        <div className="workspace-browser-header">
          <div className="workspace-browser-header-content">
            <h3>{t.workspaceBrowser.title}</h3>
            <p className="workspace-browser-description">
              {t.workspaceBrowser.description}
            </p>
          </div>
          <button className="close-btn" onClick={onClose} title={t.workspaceBrowser.close}>
            ×
          </button>
        </div>

        <div className="workspace-browser-content">
          {loading ? (
            <div className="workspace-browser-loading">{t.workspaceBrowser.loading}</div>
          ) : trees.length === 0 ? (
            <div className="workspace-browser-empty">
              <div className="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <div className="empty-title">{t.workspaceBrowser.noWorkspacesTitle}</div>
              <div className="empty-description">
                No directories configured for this session
              </div>
            </div>
          ) : (
            trees.map((directory, index) => (
              <div key={`${directory.directoryType}-${index}`} className="workspace-tree">
                <div className="workspace-tree-header">
                  <span className="workspace-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </span>
                  <span className="workspace-label">{directory.directoryLabel}</span>
                  <span className="workspace-path" title={directory.directoryPath}>
                    {directory.directoryPath}
                  </span>
                </div>
                {directory.tree ? (
                  <div className="workspace-tree-content">
                    <TreeNode
                      node={directory.tree}
                      level={0}
                      selectedPaths={selectedPaths}
                      onToggle={handleToggle}
                      onLoadChildren={loadDirectoryChildren}
                    />
                  </div>
                ) : (
                  <div className="workspace-tree-error">
                    {t.workspaceBrowser.failedToRead}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="workspace-browser-footer">
          <div className="workspace-browser-selection-count">
            {t.workspaceBrowser.selectedCount(selectedPaths.size)}
          </div>
          <div className="workspace-browser-actions">
            <button
              className="workspace-browser-btn secondary"
              onClick={handleClear}
              disabled={selectedPaths.size === 0}
            >
              {t.workspaceBrowser.clearSelection}
            </button>
            <button
              className="workspace-browser-btn primary"
              onClick={handleConfirm}
              disabled={selectedPaths.size === 0}
            >
              {t.workspaceBrowser.insertPaths}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
