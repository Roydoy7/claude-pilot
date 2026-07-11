/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * SkillsTab Component - Browse, install, and manage skills from marketplaces
 * Skills are installed to {cwd}/.claude/skills/{skill-name}/
 * Claude Agent SDK automatically discovers and loads these skills
 */

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { SkillMarketplace, AvailableSkill, InstalledSkillInfo } from '../../../../core/skills/skill-types';

/**
 * Skill card component for displaying a single skill
 */
interface SkillCardProps {
  skill: AvailableSkill | InstalledSkillInfo;
  isInstalled: boolean;
  onInstall?: () => void;
  onUninstall?: () => void;
  loading?: boolean;
  t: {
    install: string;
    installing: string;
    uninstall: string;
  };
}

function SkillCard({ skill, isInstalled, onInstall, onUninstall, loading, t }: SkillCardProps) {
  const metadata = skill.metadata;

  return (
    <div className="skill-item">
      <div className="skill-item-layout">
        <div className="skill-item-copy">
          <div className="skill-item-name">
            {metadata.name}
          </div>
          <div className="skill-item-description">
            {metadata.description}
          </div>
          {metadata.tags && metadata.tags.length > 0 && (
            <div className="skill-item-tags">
              {metadata.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="skill-item-action">
          {isInstalled ? (
            <button className="btn btn-danger-ghost btn-sm" onClick={onUninstall} disabled={loading}>
              {loading ? '...' : t.uninstall}
            </button>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={onInstall} disabled={loading}>
              {loading ? t.installing : t.install}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * SkillsTab props
 */
interface SkillsTabProps {
  sessionId: string | null;
}

/**
 * SkillsTab main component
 */
export function SkillsTab({ sessionId }: SkillsTabProps) {
  const { t } = useLanguage();
  const [view, setView] = useState<'installed' | 'marketplace'>('installed');
  const [marketplaces, setMarketplaces] = useState<SkillMarketplace[]>([]);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkillInfo[]>([]);
  const [availableSkills, setAvailableSkills] = useState<AvailableSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSkill, setLoadingSkill] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [selectedMarketplace, setSelectedMarketplace] = useState<string>('anthropics/skills');

  // Load initial data when sessionId changes
  useEffect(() => {
    if (sessionId) {
      loadData();
    }
  }, [sessionId]);

  const loadData = useCallback(async () => {
    if (!sessionId) return;

    try {
      const data = await window.electronAPI?.invoke('skills:getData', sessionId) as {
        marketplaces: SkillMarketplace[];
        installedSkills: InstalledSkillInfo[];
        enabled: boolean;
      };
      if (data) {
        setMarketplaces(data.marketplaces || []);
        setInstalledSkills(data.installedSkills || []);
        setGlobalEnabled(data.enabled ?? true);
      }
    } catch (err) {
      console.error('Failed to load skills data:', err);
    }
  }, [sessionId]);

  const fetchMarketplace = useCallback(async () => {
    if (!sessionId) return;

    setLoading(true);
    setError(null);
    try {
      const skills = await window.electronAPI?.invoke('skills:fetchMarketplace', selectedMarketplace, sessionId) as AvailableSkill[];
      setAvailableSkills(skills || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch marketplace');
    } finally {
      setLoading(false);
    }
  }, [selectedMarketplace, sessionId]);

  // Fetch marketplace when switching to marketplace view or changing marketplace
  useEffect(() => {
    if (view === 'marketplace' && sessionId) {
      fetchMarketplace();
    }
  }, [view, selectedMarketplace, sessionId]);
  // Note: fetchMarketplace intentionally excluded to avoid stale closure issues

  const handleInstall = useCallback(async (skill: AvailableSkill) => {
    if (!sessionId) return;

    setLoadingSkill(skill.metadata.name);
    try {
      await window.electronAPI?.invoke('skills:install', skill.marketplace, skill.path, sessionId);
      await loadData();
      // Update available skills to show installed status
      setAvailableSkills((prev) =>
        prev.map((s) =>
          s.metadata.name === skill.metadata.name ? { ...s, installed: true } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to install skill');
    } finally {
      setLoadingSkill(null);
    }
  }, [loadData, sessionId]);

  const handleUninstall = useCallback(async (skillName: string) => {
    if (!sessionId) return;

    setLoadingSkill(skillName);
    try {
      await window.electronAPI?.invoke('skills:uninstall', skillName, sessionId);
      await loadData();
      // Update available skills to show uninstalled status
      setAvailableSkills((prev) =>
        prev.map((s) =>
          s.metadata.name === skillName ? { ...s, installed: false } : s
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to uninstall skill');
    } finally {
      setLoadingSkill(null);
    }
  }, [loadData, sessionId]);

  const handleGlobalToggle = useCallback(async (enabled: boolean) => {
    try {
      await window.electronAPI?.invoke('skills:setGlobalEnabled', enabled);
      setGlobalEnabled(enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle skills');
    }
  }, []);

  // Show message if no session selected
  if (!sessionId) {
    return (
      <div className="skills-tab">
        <h3 className="tab-title">
          {t.rightPanel.skillsTab.title}
        </h3>
        <div className="skills-empty">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" /></svg>
          <div>{t.rightPanel.skillsTab.selectSession}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="skills-tab">
      {/* Header */}
      <div className="skills-header">
        <div className="skills-title-row">
          <h3 className="tab-title">
            {t.rightPanel.skillsTab.title}
          </h3>
          <label className="skills-global-toggle">
            <input
              type="checkbox"
              checked={globalEnabled}
              onChange={(e) => handleGlobalToggle(e.target.checked)}
            />
            {t.rightPanel.skillsTab.enableSkills}
          </label>
        </div>

        {/* View Toggle */}
        <div className="segmented">
          <button
            className="segmented-btn"
            data-active={view === 'installed'}
            onClick={() => setView('installed')}
          >
            {t.rightPanel.skillsTab.installed} ({installedSkills.length})
          </button>
          <button
            className="segmented-btn"
            data-active={view === 'marketplace'}
            onClick={() => setView('marketplace')}
          >
            {t.rightPanel.skillsTab.marketplace}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="alert-error skills-error">
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: '0.5rem',
              background: 'none',
              border: 'none',
              color: 'var(--error)',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Content */}
      <div className="skills-content">
        {view === 'installed' ? (
          // Installed Skills View
          <>
            {installedSkills.length === 0 ? (
              <div className="skills-empty">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 3H5a2 2 0 0 0-2 2v3.5a2.5 2.5 0 1 1 0 5V19a2 2 0 0 0 2 2h5.5a2.5 2.5 0 1 1 5 0H19a2 2 0 0 0 2-2v-5.5a2.5 2.5 0 1 1 0-5V5a2 2 0 0 0-2-2h-5.5a2.5 2.5 0 1 1-5 0Z" /></svg>
                <div>{t.rightPanel.skillsTab.noSkillsInstalled}</div>
                <div style={{ marginTop: '0.25rem' }}>
                  {t.rightPanel.skillsTab.browseMarketplace}
                </div>
              </div>
            ) : (
              installedSkills.map((skill) => (
                <SkillCard
                  key={skill.metadata.name}
                  skill={skill}
                  isInstalled={true}
                  onUninstall={() => handleUninstall(skill.metadata.name)}
                  loading={loadingSkill === skill.metadata.name}
                  t={t.rightPanel.skillsTab}
                />
              ))
            )}
          </>
        ) : (
          // Marketplace View
          <>
            {/* Marketplace Selector */}
            <div style={{ marginBottom: '0.75rem' }}>
              <select
                className="form-input"
                value={selectedMarketplace}
                onChange={(e) => {
                  setSelectedMarketplace(e.target.value);
                }}
                style={{ width: '100%' }}
              >
                {marketplaces.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Refresh Button */}
            <div style={{ marginBottom: '0.75rem' }}>
              <button
                className="btn btn-secondary"
                onClick={fetchMarketplace}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? t.rightPanel.skillsTab.loading : t.rightPanel.skillsTab.refreshMarketplace}
              </button>
            </div>

            {/* Available Skills */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                {t.rightPanel.skillsTab.loading}
              </div>
            ) : availableSkills.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2rem 1rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                }}
              >
                <div>{t.rightPanel.skillsTab.clickRefresh}</div>
              </div>
            ) : (
              availableSkills.map((skill) => (
                <SkillCard
                  key={skill.metadata.name}
                  skill={skill}
                  isInstalled={skill.installed}
                  onInstall={() => handleInstall(skill)}
                  onUninstall={() => handleUninstall(skill.metadata.name)}
                  loading={loadingSkill === skill.metadata.name}
                  t={t.rightPanel.skillsTab}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
