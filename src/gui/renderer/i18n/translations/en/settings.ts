/**
 * Copyright (c) 2025 Ray <roydoy7@gmail.com>
 *
 * English translations - Settings Dialog
 */

export const settingsEn = {
  title: 'Settings',
  categories: {
    account: 'Account',
    defaults: 'Defaults',
    appearance: 'Appearance',
  },
  account: {
    title: 'Account Settings',
    authentication: 'Authentication',
    status: 'Authentication Status',
    authenticated: 'Authenticated',
    notAuthenticated: 'Not authenticated',
    plan: 'Plan',
    expires: 'Expires',
    loginWithClaude: 'Login with Claude Account (Pro/Max/Team)',
    loginWithConsole: 'Login with Console Account (API Billing)',
    logout: 'Logout',
    loggingIn: 'Logging in...',
    loginFailed: 'Login failed',
    envHint: 'Or set environment variable',
    welcomeMessage: 'Welcome! Please authenticate to start using Claude Pilot.',
  },
  defaults: {
    title: 'Default Settings',
    description: 'Configure default values for new sessions',
    model: 'Default Model',
    selectModel: 'Select a model',
    modelDescription: 'Model used when creating new sessions',
    authRequired: 'Authentication required to select model',
    role: 'Default Role',
    selectRole: 'Select a role',
    roleDescription: 'Role used when creating new sessions',
    workingDirectory: 'Default Working Directory',
    workingDirectoryDescription: 'Working directory used when creating new sessions',
    browse: 'Browse',
    noDirectory: 'No directory selected',
  },
  appearance: {
    title: 'Appearance Settings',
    theme: 'Theme',
    themeDescription: 'Choose your preferred color theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    language: 'Language',
    languageDescription: 'Choose your preferred language',
    languageEn: 'English',
    languageZh: '中文',
    languageJa: '日本語',
  },
};
