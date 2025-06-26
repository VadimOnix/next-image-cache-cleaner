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
    .version(__VERSION__ ?? 'debug')

  program
    .option('--dir <string>', 'Absolute path to the image cache directory')
    .option('--cron <string>', 'Cron configuration string')
    .option('--size <number>', 'Directory size in kilobytes')
    .option('--percent <number>', 'Cache directory fullness percentage')
    .option('-e, --fromEnv', 'Extract configuration from process.env')

  program.parse()

  const inputs = program.opts()

  let config
  if (Object.keys(inputs).length === 0 || inputs?.fromEnv) {
    const sizeEnv = Number(process.env.NICC_MAX_CAPACITY)
    const percentEnv = Number(process.env.NICC_FULLNESS_PERCENT)

    config = {
      cronString: process.env.NICC_CRON_CONFIG,
      directoryPath: process.env.NICC_IMAGE_CACHE_DIRECTORY,
      directorySize: Number.isFinite(sizeEnv) ? sizeEnv : undefined,
      fullnessPercent: Number.isFinite(percentEnv) ? percentEnv : undefined,
    }
  } else {
    const sizeCli = Number(inputs.size)
    const percentCli = Number(inputs.percent)
    config = {
      cronString: inputs.cron,
      directoryPath: inputs.dir,
      directorySize: Number.isFinite(sizeCli) ? sizeCli : undefined,
      fullnessPercent: Number.isFinite(percentCli) ? percentCli : undefined,
    }
  }

  return config as CacheCleanerConstructorParams
}
