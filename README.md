# Grimoire UI

React + Vite management interface for [Grimoire](https://github.com/guibranco/grimoire-api) — manage applications, environments, encrypted secrets, and configurations from a single developer dashboard.

## Features

- **Application Management**: Create and configure workspaces for different services.
- **Environment Isolation**: Support for multiple stages (Production, Staging, Development).
- **Secrets Vault**: AES-256 encrypted storage for sensitive credentials.
- **Configuration Store**: Centralized key-value management for non-sensitive settings.
- **Admin Setup**: Easy connection to self-hosted Grimoire instances.
- **Unit Tested**: Robust test suite using Vitest with V8 coverage.

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test

# Check coverage
npm run test:coverage
```

## Setup

When first launching the UI, you will be prompted for:
1. **Instance URL**: The base URL of your hosted Grimoire API (e.g., `https://grimoire.example.com`).
2. **Admin API Key**: Your administrative key for managing the cluster.

These credentials are stored securely in your browser's `localStorage`.
