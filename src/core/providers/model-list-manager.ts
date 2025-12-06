/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Model List Manager - Unified model management for Claude models
 * Handles model definitions, fetching from API, and extended thinking support
 */

import { tokenStore } from '../auth/token-store.js';

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
  supportsExtendedThinking?: boolean;
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
 */
export const ClaudeModel = {
  SONNET_4_5: 'claude-sonnet-4-5-20250929',
  OPUS_4_5: 'claude-opus-4-5-20251101',
  OPUS_4_1: 'claude-opus-4-1-20250805',
  OPUS_4: 'claude-opus-4-20250514',
  SONNET_4: 'claude-sonnet-4-20250514',
  HAIKU_4_5: 'claude-haiku-4-5-20251001',
  HAIKU_3_5: 'claude-3-5-haiku-20241022',
  SONNET_3_7: 'claude-3-7-sonnet-20250219',
  HAIKU_3: 'claude-3-haiku-20240307',
} as const;

export type ClaudeModel = (typeof ClaudeModel)[keyof typeof ClaudeModel];

/**
 * Model display names
 */
export const MODEL_DISPLAY_NAMES: Record<ClaudeModel, string> = {
  [ClaudeModel.SONNET_4_5]: 'Claude Sonnet 4.5',
  [ClaudeModel.OPUS_4_5]: 'Claude Opus 4.5',
  [ClaudeModel.OPUS_4_1]: 'Claude Opus 4.1',
  [ClaudeModel.OPUS_4]: 'Claude Opus 4',
  [ClaudeModel.SONNET_4]: 'Claude Sonnet 4',
  [ClaudeModel.HAIKU_4_5]: 'Claude Haiku 4.5',
  [ClaudeModel.HAIKU_3_5]: 'Claude Haiku 3.5',
  [ClaudeModel.SONNET_3_7]: 'Claude Sonnet 3.7',
  [ClaudeModel.HAIKU_3]: 'Claude Haiku 3',
};

/**
 * Models that support extended thinking
 * Based on: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking
 */
const EXTENDED_THINKING_MODELS = [
  'claude-sonnet-4-5',    // Claude Sonnet 4.5
  'claude-opus-4-5',      // Claude Opus 4.5
  'claude-opus-4-1',      // Claude Opus 4.1
  'claude-opus-4',        // Claude Opus 4
  'claude-sonnet-4',      // Claude Sonnet 4
  'claude-haiku-4-5',     // Claude Haiku 4.5
  'claude-3-7-sonnet',    // Claude Sonnet 3.7
];

/**
 * Check if a model supports extended thinking
 */
export function supportsExtendedThinking(modelName: string): boolean {
  return EXTENDED_THINKING_MODELS.some(prefix => modelName.startsWith(prefix));
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
export const DEFAULT_MODEL: ClaudeModel = ClaudeModel.SONNET_4_5;

/**
 * Get default model
 */
export function getDefaultModel(): ClaudeModel {
  return DEFAULT_MODEL;
}

/**
 * Model configuration
 */
export interface ModelConfig {
  model: ClaudeModel | string;
  maxThinkingTokens?: number;
}

/**
 * Hardcoded fallback models if API fetch fails
 * Based on: https://docs.anthropic.com/claude/docs/models-overview
 * Ordered by release date (newest first)
 */
const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: ClaudeModel.OPUS_4_5,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.OPUS_4_5],
    description: 'Most powerful and intelligent Claude model',
    contextWindow: 200000,
    supportsExtendedThinking: true,
  },
  {
    id: ClaudeModel.HAIKU_4_5,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.HAIKU_4_5],
    description: 'Fast and efficient with extended thinking',
    contextWindow: 200000,
    supportsExtendedThinking: true,
  },
  {
    id: ClaudeModel.SONNET_4_5,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.SONNET_4_5],
    description: 'Most intelligent model with best performance',
    contextWindow: 200000,
    supportsExtendedThinking: true,
  },
  {
    id: ClaudeModel.OPUS_4_1,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.OPUS_4_1],
    description: 'Advanced reasoning and complex tasks',
    contextWindow: 200000,
    supportsExtendedThinking: true,
  },
  {
    id: ClaudeModel.OPUS_4,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.OPUS_4],
    description: 'Powerful model for complex tasks',
    contextWindow: 200000,
    supportsExtendedThinking: true,
  },
  {
    id: ClaudeModel.SONNET_4,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.SONNET_4],
    description: 'Balanced model for most tasks',
    contextWindow: 200000,
    supportsExtendedThinking: true,
  },
  {
    id: ClaudeModel.SONNET_3_7,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.SONNET_3_7],
    description: 'Enhanced Sonnet 3.5 with extended thinking',
    contextWindow: 200000,
    supportsExtendedThinking: true,
  },
  {
    id: ClaudeModel.HAIKU_3_5,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.HAIKU_3_5],
    description: 'Fast model for quick responses',
    contextWindow: 200000,
    supportsExtendedThinking: false,
  },
  {
    id: ClaudeModel.HAIKU_3,
    name: MODEL_DISPLAY_NAMES[ClaudeModel.HAIKU_3],
    description: 'Legacy fast model',
    contextWindow: 200000,
    supportsExtendedThinking: false,
    deprecated: true,
  },
];

/**
 * Fetch available models from Anthropic API
 */
async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  const endpoint = 'https://api.anthropic.com/v1/models';

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
      supportsExtendedThinking: supportsExtendedThinking(model.id),
    }))
    .sort((a, b) => {
      // Sort by priority: Opus 4.5, Haiku 4.5, Sonnet 4.5, Opus 4.1, Opus 4, Sonnet 4, Sonnet 3.7, Haiku 3.5, others
      const getOrder = (id: string): number => {
        if (id.includes('claude-opus-4-5')) return 0;
        if (id.includes('claude-haiku-4-5')) return 1;
        if (id.includes('claude-sonnet-4-5')) return 2;
        if (id.includes('claude-opus-4-1')) return 3;
        if (id.includes('claude-opus-4')) return 4;
        if (id.includes('claude-sonnet-4')) return 5;
        if (id.includes('claude-3-7-sonnet')) return 6;
        if (id.includes('claude-3-5-haiku')) return 7;
        if (id.includes('claude-3-haiku')) return 8;
        return 9;
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
    return 'claude-sonnet-4-5-20250929';
  }
}

/**
 * Singleton instance for easy access
 */
export const modelListManager = ModelListManager.getInstance();
