import type { NextConfig } from 'next';

// Root .env loading happens in `lib/env.ts`, not here — the config is evaluated
// in a different context from the one route handlers run in, so doing it here
// looks correct and silently fails to reach the server runtime.

const config: NextConfig = {
  // The knowledge repository is read from disk at request time, so the app
  // needs the monorepo root in its file-tracing scope.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  // Tracing follows static imports; `/content` is read via readdir at request
  // time, which tracing cannot see. Without this, a serverless deployment
  // boots with an empty knowledge base and no artifacts.
  outputFileTracingIncludes: {
    '/**': ['../../content/**'],
  },
  experimental: {
    // Workspace packages ship compiled ESM; nothing else needs transpiling.
  },
};

export default config;
