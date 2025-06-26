import { Command } from 'commander'

import type { CacheCleanerConstructorParams } from './types'

declare const __VERSION__: string

/**
 * Parses input arguments and returns the configuration for the cache cleaner.
 *
 * If no command-line options are provided or if the `--fromEnv` flag is used, the configuration
 * is extracted from environment variables. Otherwise, the configuration is taken from the
 * provided command-line options.
 *
 * The returned object conforms to the CacheCleanerConstructorParams interface.
 *
 * @returns {CacheCleanerConstructorParams} The configuration for the cache cleaner.
 */
export const parseInputArgs = (): CacheCleanerConstructorParams => {
  const program = new Command()

  program
    .name('Next Image Cache Cleaner')
    .description('CLI options description')
    .version(typeof __VERSION__ !== 'undefined' ? __VERSION__ : 'debug')

  program
    .option('--dir <string>', 'Absolute path to the image cache directory')
    .option('--cron <string>', 'Cron configuration string')
    .option('--size <number>', 'Directory size in kilobytes')
    .option('--percent <number>', 'Cache directory fullness percentage')
    .option('-e, --fromEnv', 'Extract configuration from process.env')

  program.parse()

  const inputs = program.opts() as {
    cron?: string
    dir?: string
    size?: string | number
    percent?: string | number
    fromEnv?: boolean
  }

  let config: CacheCleanerConstructorParams
  if (Object.keys(inputs).length === 0 || inputs?.fromEnv) {
    if (!process.env.NICC_IMAGE_CACHE_DIRECTORY) {
      throw new Error('NICC_IMAGE_CACHE_DIRECTORY is required')
    }
    config = {
      cronString: process.env.NICC_CRON_CONFIG,
      directoryPath: process.env.NICC_IMAGE_CACHE_DIRECTORY,
      directorySize: !isNaN(Number(process.env.NICC_MAX_CAPACITY))
        ? Number(process.env.NICC_MAX_CAPACITY)
        : undefined,
      fullnessPercent: !isNaN(Number(process.env.NICC_FULLNESS_PERCENT))
        ? Number(process.env.NICC_FULLNESS_PERCENT)
        : undefined,
    }
  } else {
    if (!inputs.dir) {
      throw new Error('--dir is required')
    }
    config = {
      cronString: inputs.cron,
      directoryPath: inputs.dir,
      directorySize:
        inputs.size !== undefined && inputs.size !== ''
          ? Number(inputs.size)
          : undefined,
      fullnessPercent:
        inputs.percent !== undefined && inputs.percent !== ''
          ? Number(inputs.percent)
          : undefined,
    }
  }

  return config
}
