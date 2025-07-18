import { Command } from 'commander'

import type { CacheCleanerConstructorParams } from './types'

declare const __VERSION__: string

/**
 * Parses an optional numeric value from a string or unknown input.
 * Returns a finite number if the input is a non-empty string representing a valid number.
 * Returns undefined if the input is undefined, an empty string, or not a valid finite number.
 *
 * @param {unknown} val - The value to parse (can be string, number, or undefined).
 * @returns {number | undefined} The parsed number, or undefined if invalid or empty.
 */
function parseOptionalNumber(val: unknown): number | undefined {
  if (typeof val !== 'string' || val.trim() === '') return undefined
  const num = Number(val)
  return Number.isFinite(num) ? num : undefined
}

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

    const sizeEnv = parseOptionalNumber(process.env.NICC_MAX_CAPACITY)
    const percentEnv = parseOptionalNumber(process.env.NICC_FULLNESS_PERCENT)

    config = {
      cronString: process.env.NICC_CRON_CONFIG,
      directoryPath: process.env.NICC_IMAGE_CACHE_DIRECTORY,
      directorySize: sizeEnv,
      fullnessPercent: percentEnv,
    }
  } else {
    if (!inputs.dir) {
      throw new Error('--dir is required')
    }
    const sizeCli = parseOptionalNumber(inputs.size)
    const percentCli = parseOptionalNumber(inputs.percent)
    config = {
      cronString: inputs.cron,
      directoryPath: inputs.dir,
      directorySize: sizeCli,
      fullnessPercent: percentCli,
    }
  }

  return config
}
