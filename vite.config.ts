/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { coverageConfigDefaults } from 'vitest/config'

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['fs', 'path'],
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'node22',
  },
  test: {
    coverage: {
      provider: 'v8',
      enabled: true,
      reporter: ['text', 'json', 'html'],
      exclude: ['./*.js', ...coverageConfigDefaults.exclude],
    },
  },
})
