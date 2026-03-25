import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['server/__tests__/**/*.test.ts', 'tests/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    environmentMatchGlobs: [['src/**', 'jsdom']],
  },
})
