import type { NextConfig } from 'next';

const config: NextConfig = {
  // The knowledge repository is read from disk at request time, so the app
  // needs the monorepo root in its file-tracing scope.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  experimental: {
    // Workspace packages ship compiled ESM; nothing else needs transpiling.
  },
};

export default config;
