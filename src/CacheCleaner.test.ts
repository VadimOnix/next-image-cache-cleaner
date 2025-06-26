import { Logger } from 'pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CacheCleaner } from './CacheCleaner'
import { CacheCleanerConstructorParams } from './types'
import { Watcher } from './Watcher'

describe('CacheCleaner', () => {
  // Valid parameters for tests (cron mode enabled)
  const validParamsCron = {
    directoryPath: '/valid/path',
    directorySize: 1024, // in kilobytes
    fullnessPercent: 0.5,
    cronString: '*/5 * * * *',
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as CacheCleanerConstructorParams

  // Valid parameters for tests (only fullness mode, cronString omitted)
  const validParamsFullness = {
    directoryPath: '/valid/path',
    directorySize: 1024, // in kilobytes
    fullnessPercent: 0.5,
    // cronString omitted: cast as any because our types require it if fullnessPercent is provided
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as CacheCleanerConstructorParams

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // Parameter validation tests

  it('should throw an error if directorySize is provided without fullnessPercent', () => {
    expect(
      () =>
        new CacheCleaner({
          directoryPath: '/valid/path',
          directorySize: 1024,
          // fullnessPercent omitted
          cronString: '*/5 * * * *',
        }),
    ).toThrow(
      'Env variables NICC_FULLNESS_PERCENT and NICC_MAX_CAPACITY cannot be defined separately!',
    )
  })

  it('should throw an error if fullnessPercent is provided without directorySize', () => {
    expect(
      () =>
        new CacheCleaner({
          directoryPath: '/valid/path',
          fullnessPercent: 0.5,
          // directorySize omitted
          cronString: '*/5 * * * *',
        }),
    ).toThrow(
      'Env variables NICC_FULLNESS_PERCENT and NICC_MAX_CAPACITY cannot be defined separately!',
    )
  })

  it('should throw a RangeError if directorySize is less than or equal to 0', () => {
    expect(
      () =>
        new CacheCleaner({
          directoryPath: '/valid/path',
          directorySize: 0,
          fullnessPercent: 0.5,
          cronString: '*/5 * * * *',
        }),
    ).toThrow('Env variable NICC_MAX_CAPACITY must be greater than 0!')
  })

  it('should throw a SyntaxError if cronString is invalid', () => {
    // Stub Watcher.validateCronString to return false.
    vi.spyOn(Watcher, 'validateCronString').mockReturnValue(false)
    expect(
      () =>
        new CacheCleaner({
          directoryPath: '/valid/path',
          directorySize: 1024,
          fullnessPercent: 0.5,
          cronString: 'invalid-cron',
        }),
    ).toThrow('Incorrect cron string syntax!')
  })

  it('should throw a RangeError if fullnessPercent is not in the range (0, 1)', () => {
    expect(
      () =>
        new CacheCleaner({
          directoryPath: '/valid/path',
          directorySize: 1024,
          fullnessPercent: 1.2,
          cronString: '*/5 * * * *',
        }),
    ).toThrow(
      'Env NICC_FULLNESS_PERCENT must be a fractional value in the range (0, 1)!',
    )
    expect(
      () =>
        new CacheCleaner({
          directoryPath: '/valid/path',
          directorySize: 1024,
          fullnessPercent: -0.1,
          cronString: '*/5 * * * *',
        }),
    ).toThrow(
      'Env NICC_FULLNESS_PERCENT must be a fractional value in the range (0, 1)!',
    )
  })

  it('should throw an error if directoryPath is empty', () => {
    expect(
      () =>
        new CacheCleaner({
          directoryPath: '',
          directorySize: 1024,
          fullnessPercent: 0.5,
          cronString: '*/5 * * * *',
        }),
    ).toThrow('Env NICC_IMAGE_CACHE_DIRECTORY cannot be empty!')
  })

  it('should not throw when numeric parameters are invalid', () => {
    expect(
      () =>
        new CacheCleaner({
          directoryPath: '/valid/path',
          directorySize: Number('invalid'),
          fullnessPercent: Number('invalid'),
        } as unknown as CacheCleanerConstructorParams),
    ).not.toThrow()
  })

  // Tests for the start method and cleaning mode initialization

  it('should create an instance and call both watcher methods when both modes are activated', async () => {
    const logger = validParamsCron.logger as unknown as Logger
    const spyWatchByCron = vi
      .spyOn(Watcher.prototype, 'watchByCron')
      .mockResolvedValue()
    const spyWatchByLimit = vi
      .spyOn(Watcher.prototype, 'watchByLimit')
      .mockResolvedValue()

    const cleaner = new CacheCleaner(validParamsCron)

    await cleaner.start()

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('🚀 Starting nextJs cache cleaner!'),
    )
    // Both cron mode and fullness mode are activated because both cronString and fullnessPercent are provided.
    expect(spyWatchByCron).toHaveBeenCalled()
    expect(spyWatchByLimit).toHaveBeenCalled()
  })

  it('should create an instance and call only the fullness watcher method when cron mode is not activated', async () => {
    const logger = validParamsFullness.logger as unknown as Logger
    // Watcher.validateCronString is not relevant because no cronString is provided.
    const spyWatchByCron = vi
      .spyOn(Watcher.prototype, 'watchByCron')
      .mockResolvedValue()
    const spyWatchByLimit = vi
      .spyOn(Watcher.prototype, 'watchByLimit')
      .mockResolvedValue()

    const cleaner = new CacheCleaner(validParamsFullness)

    await cleaner.start()

    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('🚀 Starting nextJs cache cleaner!'),
    )
    expect(spyWatchByCron).not.toHaveBeenCalled()
    expect(spyWatchByLimit).toHaveBeenCalled()
  })
})
