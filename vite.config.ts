/// <reference types="vitest" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves a project repository at https://<owner>.github.io/<REPOSITORY_NAME>/.
// The base path MUST equal "/<REPOSITORY_NAME>/". It is read from VITE_GITHUB_PAGES_BASE
// (set in .env.local or as a GitHub Actions repository variable) and defaults to
// "/scoreTracker/" for this repository. See docs/DEPLOYMENT.md.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = mode === 'test' ? '/' : env.VITE_GITHUB_PAGES_BASE || '/scoreTracker/';
  return {
    base,
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
