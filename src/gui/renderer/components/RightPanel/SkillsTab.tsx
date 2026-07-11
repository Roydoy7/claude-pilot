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
    <div className="panel-card" style={{ marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '600', fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
            {metadata.name}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {metadata.description}
          </div>
          {metadata.tags && metadata.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {metadata.tags.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '0.5rem' }}>
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
      <div style={{ padding: '0.75rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
          {t.rightPanel.skillsTab.title}
        </h3>
        <div
          style={{
            textAlign: 'center',
            padding: '2rem 1rem',
            color: 'var(--text-secondary)',
            fontSize: '0.8rem',
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📂</div>
          <div>{t.rightPanel.skillsTab.selectSession}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0.75rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
            {t.rightPanel.skillsTab.title}
          </h3>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              fontSize: '0.7rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={globalEnabled}
              onChange={(e) => handleGlobalToggle(e.target.checked)}
              style={{ cursor: 'pointer' }}
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
        <div className="alert-error" style={{ marginBottom: '0.5rem' }}>
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
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {view === 'installed' ? (
          // Installed Skills View
          <>
            {installedSkills.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2rem 1rem',
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧩</div>
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
