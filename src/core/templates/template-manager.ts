/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Template Manager - Manages prompt templates
 */

import fs from 'fs';
import path from 'path';
import { getConfigDir } from '../storage/storage';

/**
 * Prompt template interface
 */
export interface PromptTemplate {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Template Manager - Singleton for managing prompt templates
 */
export class TemplateManager {
  private static instance: TemplateManager;
  private templatesFile: string;
  private templates: Map<string, PromptTemplate>;

  private constructor() {
    this.templatesFile = path.join(getConfigDir(), 'templates.json');
    this.templates = new Map();
    this.loadTemplates();
  }

  static getInstance(): TemplateManager {
    if (!TemplateManager.instance) {
      TemplateManager.instance = new TemplateManager();
    }
    return TemplateManager.instance;
  }

  /**
   * Load templates from disk
   */
  private loadTemplates(): void {
    try {
      if (fs.existsSync(this.templatesFile)) {
        const data = fs.readFileSync(this.templatesFile, 'utf-8');
        const templates: PromptTemplate[] = JSON.parse(data);

        this.templates.clear();
        templates.forEach((template) => {
          this.templates.set(template.id, template);
        });
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
      this.templates = new Map();
    }
  }

  /**
   * Save templates to disk
   */
  private saveTemplates(): void {
    try {
      const templates = Array.from(this.templates.values());
      fs.writeFileSync(this.templatesFile, JSON.stringify(templates, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save templates:', error);
      throw new Error('Failed to save templates');
    }
  }

  /**
   * Get all templates
   */
  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): PromptTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Create new template
   */
  createTemplate(name: string, content: string): PromptTemplate {
    const now = Date.now();
    const id = `template-${now}-${Math.random().toString(36).substr(2, 9)}`;

    const template: PromptTemplate = {
      id,
      name,
      content,
      createdAt: now,
      updatedAt: now,
    };

    this.templates.set(id, template);
    this.saveTemplates();

    return template;
  }

  /**
   * Update existing template
   */
  updateTemplate(id: string, updates: { name?: string; content?: string }): PromptTemplate {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error(`Template not found: ${id}`);
    }

    const updated: PromptTemplate = {
      ...template,
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.content !== undefined && { content: updates.content }),
      updatedAt: Date.now(),
    };

    this.templates.set(id, updated);
    this.saveTemplates();

    return updated;
  }

  /**
   * Delete template
   */
  deleteTemplate(id: string): boolean {
    const existed = this.templates.delete(id);
    if (existed) {
      this.saveTemplates();
    }
    return existed;
  }

  /**
   * Check if template exists
   */
  hasTemplate(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Get template count
   */
  getTemplateCount(): number {
    return this.templates.size;
  }
}

// Export singleton instance
export const templateManager = TemplateManager.getInstance();
