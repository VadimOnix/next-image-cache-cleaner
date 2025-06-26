import { afterEach, describe, expect, it } from 'vitest'

import { parseInputArgs } from './parseInputArgs'

describe('parseInputArgs', () => {
  const originalArgv = process.argv.slice()
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore original process.argv and process.env after each test.
    process.argv = originalArgv.slice()
    process.env = { ...originalEnv }
  })

  it('should return configuration from process.env when no command-line options are provided', () => {
    process.argv = ['node', 'script']
    process.env = {
      NICC_CRON_CONFIG: '*/5 * * * *',
      NICC_IMAGE_CACHE_DIRECTORY: '/env/path/to/cache',
      NICC_MAX_CAPACITY: 2048,
      NICC_FULLNESS_PERCENT: 0.75,
    } as NodeJS.ProcessEnv

    const config = parseInputArgs()

    expect(config).toEqual({
      cronString: '*/5 * * * *',
      directoryPath: '/env/path/to/cache',
      directorySize: 2048,
      fullnessPercent: 0.75,
    })
  })

  it('should return configuration from command-line arguments when provided', () => {
    // Arrange
    process.argv = [
      'node',
      'script',
      '--dir',
      '/cmd/path/to/cache',
      '--cron',
      '0 0 * * *',
      '--size',
      '4096',
      '--percent',
      '0.8',
    ]
    // Ensure environment variables are not used.
    process.env = {} as NodeJS.ProcessEnv

    const config = parseInputArgs()

    expect(config).toEqual({
      cronString: '0 0 * * *',
      directoryPath: '/cmd/path/to/cache',
      // Note: In this branch, values are not converted to numbers.
      directorySize: 4096,
      fullnessPercent: 0.8,
    })
  })

  it('should extract configuration from process.env when the --fromEnv flag is provided', () => {
    // Arrange
    process.argv = ['node', 'script', '--fromEnv']
    process.env = {
      NICC_CRON_CONFIG: '*/10 * * * *',
      NICC_IMAGE_CACHE_DIRECTORY: '/env/alternative/path',
      NICC_MAX_CAPACITY: 1024,
      NICC_FULLNESS_PERCENT: 0.5,
    } as unknown as NodeJS.ProcessEnv

    const config = parseInputArgs()

    expect(config).toEqual({
      cronString: '*/10 * * * *',
      directoryPath: '/env/alternative/path',
      directorySize: 1024,
      fullnessPercent: 0.5,
    })
  })

  it('should treat invalid numeric environment variables as undefined', () => {
    process.argv = ['node', 'script']
    process.env = {
      NICC_IMAGE_CACHE_DIRECTORY: '/env/path/to/cache',
      NICC_MAX_CAPACITY: 'not-a-number',
      NICC_FULLNESS_PERCENT: '',
    } as unknown as NodeJS.ProcessEnv

    const config = parseInputArgs()

    expect(config.directorySize).toBeUndefined()
    expect(config.fullnessPercent).toBeUndefined()
  })
})
