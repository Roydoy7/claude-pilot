/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * Vite configuration for Electron + React
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        // Main process entry
        entry: path.resolve(__dirname, 'src/gui/main/main.ts'),
        onstart(args) {
          // Only start Electron after Vite dev server is ready
          // This prevents the blank window issue
          if (process.env.VSCODE_DEBUG === '1') {
            console.log('Starting Electron in debug mode...');
          }
          args.startup();
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist/main'),
            sourcemap: true,
            minify: false,
            rollupOptions: {
              external: [
                'electron',
                'google-auth-library',
                'open',
                'langchain',
                '@langchain/anthropic',
                '@langchain/core',
                '@langchain/google-genai',
                '@langchain/langgraph-checkpoint-sqlite',
                '@langchain/openai',
                'deepagents',
                'adm-zip',
                'chokidar',
                'diff',
                'xml2js',
                'jsdom', // Used by markitdown-ts (has worker files that don't bundle well)
                'canvas', // Optional dependency of jsdom
                'bufferutil', // Optional dependency of ws (WebSocket)
                'utf-8-validate', // Optional dependency of ws (WebSocket)
                'sharp', // Native image processing module
                '@napi-rs/canvas', // Native canvas module (skia .node binary)
              ],
            },
          },
        },
      },
      {
        // Preload script
        entry: path.resolve(__dirname, 'src/gui/preload/preload.ts'),
        onstart(options) {
          // Notify the Renderer-Process to reload the page when the Preload-Scripts build is complete,
          // instead of restarting the entire Electron App.
          options.reload();
        },
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist/preload'),
            sourcemap: true,
            minify: false,
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@gui': path.resolve(__dirname, './src/gui'),
    },
  },
  root: path.resolve(__dirname, 'src/gui/renderer'),
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
