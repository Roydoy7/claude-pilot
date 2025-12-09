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
    <div
      style={{
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--bg-secondary)',
        marginBottom: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            {metadata.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {metadata.description}
          </div>
          {metadata.tags && metadata.tags.length > 0 && (
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
              {metadata.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: '0.65rem',
                    padding: '0.125rem 0.375rem',
                    borderRadius: '4px',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '0.5rem' }}>
          {isInstalled ? (
            <button
              onClick={onUninstall}
              disabled={loading}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.7rem',
                borderRadius: '4px',
                border: '1px solid #ef4444',
                backgroundColor: 'transparent',
                color: '#ef4444',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
              {loading ? '...' : t.uninstall}
            </button>
          ) : (
            <button
              onClick={onInstall}
              disabled={loading}
              style={{
                padding: '0.25rem 0.75rem',
                fontSize: '0.7rem',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: 'var(--accent)',
                color: '#fff',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.5 : 1,
              }}
            >
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

  // Fetch marketplace when switching to marketplace view
  useEffect(() => {
    if (view === 'marketplace' && availableSkills.length === 0 && sessionId) {
      fetchMarketplace();
    }
  }, [view, fetchMarketplace, availableSkills.length, sessionId]);

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
        <div style={{ display: 'flex', gap: '0.25rem' }}>
          <button
            onClick={() => setView('installed')}
            style={{
              flex: 1,
              padding: '0.375rem',
              fontSize: '0.75rem',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              backgroundColor: view === 'installed' ? 'var(--accent)' : 'transparent',
              color: view === 'installed' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {t.rightPanel.skillsTab.installed} ({installedSkills.length})
          </button>
          <button
            onClick={() => setView('marketplace')}
            style={{
              flex: 1,
              padding: '0.375rem',
              fontSize: '0.75rem',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              backgroundColor: view === 'marketplace' ? 'var(--accent)' : 'transparent',
              color: view === 'marketplace' ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {t.rightPanel.skillsTab.marketplace}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            padding: '0.5rem',
            marginBottom: '0.5rem',
            borderRadius: '4px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            fontSize: '0.75rem',
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: '0.5rem',
              background: 'none',
              border: 'none',
              color: '#ef4444',
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
                value={selectedMarketplace}
                onChange={(e) => {
                  setSelectedMarketplace(e.target.value);
                  setAvailableSkills([]);
                }}
                style={{
                  width: '100%',
                  padding: '0.375rem',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                }}
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
                onClick={fetchMarketplace}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '0.375rem',
                  fontSize: '0.75rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.7 : 1,
                }}
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
