// Production build: relative asset paths (works from any folder / static host), three.js in its own
// long-cacheable chunk, modern-browser output (every WebGL2 phone supports ES2020).
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 800, // three alone is ~700 kB minified (~180 kB gzip)
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
});
