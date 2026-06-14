/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Tests for model-list-manager: model IDs, defaults, thinking config, display names
 */

import { describe, it, expect } from 'vitest';
import {
  ClaudeModel,
  MODEL_DISPLAY_NAMES,
  DEFAULT_MODEL,
  DEFAULT_EFFORT_LEVEL,
  getDefaultModel,
  getModelDisplayName,
  getThinkingConfig,
  getModelContextWindow,
  getSupportedEffortLevels,
} from './model-list-manager.js';

describe('ClaudeModel', () => {
  it('uses exact model ID strings with no date suffixes', () => {
    expect(ClaudeModel.FABLE_5).toBe('claude-fable-5');
    expect(ClaudeModel.OPUS_4_8).toBe('claude-opus-4-8');
    expect(ClaudeModel.OPUS_4_7).toBe('claude-opus-4-7');
    expect(ClaudeModel.OPUS_4_6).toBe('claude-opus-4-6');
    expect(ClaudeModel.SONNET_4_6).toBe('claude-sonnet-4-6');
    expect(ClaudeModel.HAIKU_4_5).toBe('claude-haiku-4-5');
  });
});

describe('default model', () => {
  it('defaults to claude-sonnet-4-6', () => {
    expect(DEFAULT_MODEL).toBe('claude-sonnet-4-6');
    expect(getDefaultModel()).toBe('claude-sonnet-4-6');
  });
});

describe('getModelDisplayName', () => {
  it('returns the display name for known models', () => {
    expect(getModelDisplayName(ClaudeModel.SONNET_4_6)).toBe('Claude Sonnet 4.6');
    expect(getModelDisplayName(ClaudeModel.FABLE_5)).toBe('Claude Fable 5');
  });

  it('falls back to the raw model ID for unknown models', () => {
    expect(getModelDisplayName('claude-some-retired-model')).toBe('claude-some-retired-model');
  });

  it('has a display name for every model', () => {
    for (const model of Object.values(ClaudeModel)) {
      expect(MODEL_DISPLAY_NAMES[model]).toBeTruthy();
    }
  });
});

describe('getThinkingConfig', () => {
  it('uses adaptive thinking for Fable 5, Opus 4.6-4.8 and Sonnet 4.6', () => {
    for (const model of [
      ClaudeModel.FABLE_5,
      ClaudeModel.OPUS_4_8,
      ClaudeModel.OPUS_4_7,
      ClaudeModel.OPUS_4_6,
      ClaudeModel.SONNET_4_6,
    ]) {
      expect(getThinkingConfig(model)).toEqual({ type: 'adaptive' });
    }
  });

  it('uses a fixed thinking token budget for Haiku 4.5', () => {
    expect(getThinkingConfig(ClaudeModel.HAIKU_4_5)).toEqual({ type: 'enabled', budgetTokens: 10000 });
  });

  it('throws for a retired model instead of silently substituting a default', () => {
    expect(() => getThinkingConfig('claude-sonnet-4-5-20250929')).toThrow(/no longer supported/);
  });
});

describe('getSupportedEffortLevels', () => {
  it('matches the SDK default effort level', () => {
    expect(DEFAULT_EFFORT_LEVEL).toBe('high');
  });

  it('supports xhigh only on Fable 5 and Opus 4.7+', () => {
    for (const model of [ClaudeModel.FABLE_5, ClaudeModel.OPUS_4_8, ClaudeModel.OPUS_4_7]) {
      expect(getSupportedEffortLevels(model)).toContain('xhigh');
    }
    for (const model of [ClaudeModel.OPUS_4_6, ClaudeModel.SONNET_4_6]) {
      expect(getSupportedEffortLevels(model)).not.toContain('xhigh');
    }
  });

  it('supports max on Fable 5, Opus 4.6+ and Sonnet 4.6', () => {
    for (const model of [
      ClaudeModel.FABLE_5,
      ClaudeModel.OPUS_4_8,
      ClaudeModel.OPUS_4_7,
      ClaudeModel.OPUS_4_6,
      ClaudeModel.SONNET_4_6,
    ]) {
      expect(getSupportedEffortLevels(model)).toContain('max');
    }
  });

  it('returns no effort levels for Haiku 4.5 (fixed thinking budget)', () => {
    expect(getSupportedEffortLevels(ClaudeModel.HAIKU_4_5)).toEqual([]);
  });

  it('throws for a retired model instead of silently substituting a default', () => {
    expect(() => getSupportedEffortLevels('claude-sonnet-4-5-20250929')).toThrow(/no longer supported/);
  });
});

describe('getModelContextWindow', () => {
  it('returns 1M for Fable 5, Opus 4.6-4.8 and Sonnet 4.6', () => {
    for (const model of [
      ClaudeModel.FABLE_5,
      ClaudeModel.OPUS_4_8,
      ClaudeModel.OPUS_4_7,
      ClaudeModel.OPUS_4_6,
      ClaudeModel.SONNET_4_6,
    ]) {
      expect(getModelContextWindow(model)).toBe(1_000_000);
    }
  });

  it('returns 200K for Haiku 4.5', () => {
    expect(getModelContextWindow(ClaudeModel.HAIKU_4_5)).toBe(200_000);
  });

  it('throws for a retired model instead of silently substituting a default', () => {
    expect(() => getModelContextWindow('claude-opus-4-5-20251101')).toThrow(/no longer supported/);
  });
});
