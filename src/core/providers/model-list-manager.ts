/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Model List Manager - Unified model management for Claude models
 * Handles model definitions, fetching from API, and thinking configuration
 */

import type { ThinkingConfig, EffortLevel } from '@anthropic-ai/claude-agent-sdk';
import { tokenStore } from '../auth/token-store.js';

/**
 * Re-export EffortLevel for consumers that need to reference it
 * without importing directly from the SDK.
 */
export type { EffortLevel };

/**
 * Provider type - only Claude/Anthropic is supported
 */
export const ProviderType = {
  CLAUDE: 'claude',
} as const;

export type ProviderType = (typeof ProviderType)[keyof typeof ProviderType];

/**
 * Model information from Anthropic API
 */
export interface ModelInfo {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  deprecated?: boolean;
}

/**
 * Anthropic API model response structure
 */
interface AnthropicModelResponse {
  data: Array<{
    id: string;
    display_name?: string;
    max_tokens?: number;
    created_at?: string;
  }>;
}

/**
 * Available Claude model constants
 * Exact model ID strings as used by the Anthropic API - no date suffixes
 */
export const ClaudeModel = {
  FABLE_5: 'claude-fable-5',
  OPUS_4_8: 'claude-opus-4-8',
  OPUS_4_7: 'claude-opus-4-7',
  OPUS_4_6: 'claude-opus-4-6',
  SONNET_4_6: 'claude-sonnet-4-6',
  HAIKU_4_5: 'claude-haiku-4-5-20251001',
} as const;

export type ClaudeModel = (typeof ClaudeModel)[keyof typeof ClaudeModel];

/**
 * Model display names
 */
export const MODEL_DISPLAY_NAMES: Record<ClaudeModel, string> = {
  [ClaudeModel.FABLE_5]: 'Claude Fable 5',
  [ClaudeModel.OPUS_4_8]: 'Claude Opus 4.8',
  [ClaudeModel.OPUS_4_7]: 'Claude Opus 4.7',
  [ClaudeModel.OPUS_4_6]: 'Claude Opus 4.6',
  [ClaudeModel.SONNET_4_6]: 'Claude Sonnet 4.6',
  [ClaudeModel.HAIKU_4_5]: 'Claude Haiku 4.5',
};

/**
 * Context window size (tokens) for each model
 */
const MODEL_CONTEXT_WINDOWS: Record<ClaudeModel, number> = {
  [ClaudeModel.FABLE_5]: 1_000_000,
  [ClaudeModel.OPUS_4_8]: 1_000_000,
  [ClaudeModel.OPUS_4_7]: 1_000_000,
  [ClaudeModel.OPUS_4_6]: 1_000_000,
  [ClaudeModel.SONNET_4_6]: 1_000_000,
  [ClaudeModel.HAIKU_4_5]: 200_000,
};

/**
 * Thinking configuration for each model.
 *
 * Fable 5, Opus 4.6-4.8 and Sonnet 4.6 only support adaptive thinking -
 * a fixed token budget (`{ type: 'enabled', budgetTokens }`) is rejected
 * by the API with a 400 error. Haiku 4.5 uses a fixed thinking token budget.
 */
const MODEL_THINKING_CONFIG: Record<ClaudeModel, ThinkingConfig> = {
  [ClaudeModel.FABLE_5]: { type: 'adaptive' },
  [ClaudeModel.OPUS_4_8]: { type: 'adaptive' },
  [ClaudeModel.OPUS_4_7]: { type: 'adaptive' },
  [ClaudeModel.OPUS_4_6]: { type: 'adaptive' },
  [ClaudeModel.SONNET_4_6]: { type: 'adaptive' },
  [ClaudeModel.HAIKU_4_5]: { type: 'enabled', budgetTokens: 10000 },
};

/**
 * Get the thinking configuration for a model.
 *
 * Throws if the model is not in the currently supported set - e.g. a
 * historical session referencing a retired model. Callers must surface
 * this to the user (model retired, please reselect) rather than silently
 * substituting another model's configuration.
 */
export function getThinkingConfig(modelName: string): ThinkingConfig {
  const config = MODEL_THINKING_CONFIG[modelName as ClaudeModel];
  if (!config) {
    throw new Error(`Model "${modelName}" is no longer supported. Please select a different model.`);
  }
  return config;
}

/**
 * Effort levels supported by each model.
 *
 * `effort` works together with adaptive thinking, so it is only available
 * on models whose thinking config is `{ type: 'adaptive' }`. `'xhigh'` is
 * only supported on Fable 5 and Opus 4.7+ (the SDK falls back to `'high'`
 * for other adaptive-thinking models). `'max'` is supported on Fable 5 and
 * Opus 4.6+/Sonnet 4.6. Haiku 4.5 uses a fixed thinking budget and does not
 * support `effort` at all.
 */
const MODEL_EFFORT_LEVELS: Record<ClaudeModel, EffortLevel[]> = {
  [ClaudeModel.FABLE_5]: ['low', 'medium', 'high', 'xhigh', 'max'],
  [ClaudeModel.OPUS_4_8]: ['low', 'medium', 'high', 'xhigh', 'max'],
  [ClaudeModel.OPUS_4_7]: ['low', 'medium', 'high', 'xhigh', 'max'],
  [ClaudeModel.OPUS_4_6]: ['low', 'medium', 'high', 'max'],
  [ClaudeModel.SONNET_4_6]: ['low', 'medium', 'high', 'max'],
  [ClaudeModel.HAIKU_4_5]: [],
};

/**
 * Default effort level - matches the SDK's own default ('high').
 */
export const DEFAULT_EFFORT_LEVEL: EffortLevel = 'high';

/**
 * Get the effort levels supported by a model. Returns an empty array for
 * models that don't support the `effort` option at all (e.g. Haiku 4.5).
 *
 * Throws if the model is not in the currently supported set - e.g. a
 * historical session referencing a retired model.
 */
export function getSupportedEffortLevels(modelName: string): EffortLevel[] {
  const levels = MODEL_EFFORT_LEVELS[modelName as ClaudeModel];
  if (!levels) {
    throw new Error(`Model "${modelName}" is no longer supported. Please select a different model.`);
  }
  return levels;
}

/**
 * Get the context window size (tokens) for a model.
 *
 * Throws if the model is not in the currently supported set.
 */
export function getModelContextWindow(modelName: string): number {
  const contextWindow = MODEL_CONTEXT_WINDOWS[modelName as ClaudeModel];
  if (contextWindow === undefined) {
    throw new Error(`Model "${modelName}" is no longer supported. Please select a different model.`);
  }
  return contextWindow;
}

/**
 * Get display name for a model
 */
export function getModelDisplayName(model: string): string {
  return MODEL_DISPLAY_NAMES[model as ClaudeModel] || model;
}

/**
 * Default model to use
 */
export const DEFAULT_MODEL: ClaudeModel = ClaudeModel.SONNET_4_6;

/**
 * Get default model
 */
export function getDefaultModel(): ClaudeModel {
  return DEFAULT_MODEL;
}

/**
 * Hardcoded fallback models if API fetch fails
 * Ordered by capability (most capable first)
 */
const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: ClaudeModel.FABLE_5,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.FABLE_5],
    description: 'Most capable model for the most demanding reasoning and long-horizon agentic work',
    contextWindow: MODEL_CONTEXT_WINDOWS[ClaudeModel.FABLE_5],
  },
  {
    id: ClaudeModel.OPUS_4_8,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.OPUS_4_8],
    description: 'Most powerful and intelligent Claude model',
    contextWindow: MODEL_CONTEXT_WINDOWS[ClaudeModel.OPUS_4_8],
  },
  {
    id: ClaudeModel.OPUS_4_7,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.OPUS_4_7],
    description: 'Advanced reasoning and complex tasks',
    contextWindow: MODEL_CONTEXT_WINDOWS[ClaudeModel.OPUS_4_7],
  },
  {
    id: ClaudeModel.OPUS_4_6,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.OPUS_4_6],
    description: 'Powerful model for complex tasks',
    contextWindow: MODEL_CONTEXT_WINDOWS[ClaudeModel.OPUS_4_6],
  },
  {
    id: ClaudeModel.SONNET_4_6,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.SONNET_4_6],
    description: 'Balanced model for most tasks',
    contextWindow: MODEL_CONTEXT_WINDOWS[ClaudeModel.SONNET_4_6],
  },
  {
    id: ClaudeModel.HAIKU_4_5,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.HAIKU_4_5],
    description: 'Fast and efficient model for quick responses',
    contextWindow: MODEL_CONTEXT_WINDOWS[ClaudeModel.HAIKU_4_5],
  },
];

/**
 * Fetch available models from Anthropic API
 */
async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const baseUrl = tokenStore.getBaseUrl() ?? 'https://api.anthropic.com';
  const endpoint = `${baseUrl.replace(/\/$/, '')}/v1/models`;

  const response = await fetch(endpoint, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.statusText}`);
  }

  const data: AnthropicModelResponse = await response.json();

  // Format and sort Anthropic models
  return data.data
    .map((model) => ({
      id: model.id,
      name: model.display_name || getModelDisplayName(model.id),
      description: `Anthropic ${model.display_name || model.id}`,
      contextWindow: model.max_tokens,
    }))
    .sort((a, b) => {
      // Sort by priority: Fable 5, Opus 4.8, Opus 4.7, Opus 4.6, Sonnet 4.6, Haiku 4.5, others
      const getOrder = (id: string): number => {
        if (id.includes('claude-fable-5')) return 0;
        if (id.includes('claude-opus-4-8')) return 1;
        if (id.includes('claude-opus-4-7')) return 2;
        if (id.includes('claude-opus-4-6')) return 3;
        if (id.includes('claude-sonnet-4-6')) return 4;
        if (id.includes('claude-haiku-4-5')) return 5;
        return 6;
      };
      return getOrder(a.id) - getOrder(b.id);
    });
}

/**
 * Cache entry structure
 */
interface CacheEntry {
  models: ModelInfo[];
  timestamp: number;
}

/**
 * Model List Manager - handles fetching and caching model lists
 */
export class ModelListManager {
  private static instance: ModelListManager;
  private modelCache: Map<string, CacheEntry> = new Map();
  private readonly cacheDuration = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): ModelListManager {
    if (!ModelListManager.instance) {
      ModelListManager.instance = new ModelListManager();
    }
    return ModelListManager.instance;
  }

  /**
   * Get cache key from API key
   */
  private getCacheKey(apiKey: string): string {
    // Use first 8 chars of API key as cache key
    return apiKey.substring(0, 8);
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(cacheKey: string): boolean {
    const cached = this.modelCache.get(cacheKey);
    if (!cached) return false;

    const now = Date.now();
    return now - cached.timestamp < this.cacheDuration;
  }

  /**
   * Get models from cache
   */
  private getFromCache(cacheKey: string): ModelInfo[] | null {
    if (!this.isCacheValid(cacheKey)) {
      return null;
    }

    const cached = this.modelCache.get(cacheKey);
    return cached ? cached.models : null;
  }

  /**
   * Save models to cache
   */
  private saveToCache(cacheKey: string, models: ModelInfo[]): void {
    this.modelCache.set(cacheKey, {
      models,
      timestamp: Date.now(),
    });
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.modelCache.clear();
  }

  /**
   * Fetch available Claude models
   */
  async fetchModels(options?: { forceRefresh?: boolean }): Promise<ModelInfo[]> {
    const { forceRefresh = false } = options || {};

    // Get access token from tokenStore (global token storage)
    const accessToken = tokenStore.getToken();

    if (!accessToken || !tokenStore.isTokenValid()) {
      console.warn('No valid API key or OAuth token available, returning fallback models');
      return FALLBACK_MODELS;
    }

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cacheKey = this.getCacheKey(accessToken);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Fetch models from API
    try {
      const isOAuth = tokenStore.getTokenSource() === 'oauth';

      // OAuth tokens don't have access to /v1/models endpoint
      // Use fallback models for OAuth authentication
      if (isOAuth) {
        return FALLBACK_MODELS;
      }

      const models = await fetchAnthropicModels(accessToken);

      // Save to cache
      const cacheKey = this.getCacheKey(accessToken);
      this.saveToCache(cacheKey, models);

      return models;
    } catch (error) {
      console.error('Failed to fetch Anthropic models:', error);
      // Return fallback models if fetch fails
      return FALLBACK_MODELS;
    }
  }

  /**
   * Get default model ID
   */
  getDefaultModel(): string {
    return DEFAULT_MODEL;
  }
}

/**
 * Singleton instance for easy access
 */
export const modelListManager = ModelListManager.getInstance();
