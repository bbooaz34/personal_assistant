// Bundles hero/hero.js (and the parts of Three.js it uses) into ONE classic script, assets/hero.js,
// so index.html works when opened straight from the folder (browsers block ES modules on file://).
import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: { entry: 'hero/hero.js', name: 'DaringHero', formats: ['iife'], fileName: () => 'hero.js' },
    outDir: 'assets', emptyOutDir: false, minify: true,
  },
});
