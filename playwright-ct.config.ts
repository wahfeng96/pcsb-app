import { defineConfig } from '@playwright/experimental-ct-react'

export default defineConfig({
  testDir: './tests',
  snapshotDir: './screenshots',
  use: {
    ctViteConfig: {
      resolve: {
        alias: {
          '@': `${process.cwd()}/src`,
        },
      },
    },
    hasTouch: true,
    launchOptions: {
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
})
