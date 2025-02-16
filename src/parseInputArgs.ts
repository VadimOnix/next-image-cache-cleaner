import { Command } from 'commander'

declare const __VERSION__: string

import type { CacheCleanerConstructorParams } from './CacheCleaner'

export const parseInputArgs = (): CacheCleanerConstructorParams => {
  const program = new Command()

  program
    .name('Next Image Cache Cleaner')
    .description('CLI options description')
    .version(__VERSION__ ?? 'debug')

  program
    .option('--dir <string>', 'absolute path to image cache directory')
    .option('--cron <sting>', 'cron configuration string')
    .option('--size <number>', 'size folder in kilobytes')
    .option('--percent <number>', 'fullness percent of cache directory')
    .option('-e, --fromEnv', 'extract configuration from process.env')

  program.parse()

  const inputs = program.opts()

  let config = {}
  if (Object.keys(inputs).length === 0 || inputs?.fromEnv) {
    config = {
      cronString: process.env.NICC_CRON_CONFIG,
      directoryPath: process.env.NICC_IMAGE_CACHE_DIRECTORY,
      directorySize: Number(process.env.NICC_MAX_CAPACITY),
      fullnessPercent: Number(process.env.NICC_FULLNESS_PERCENT),
    }
  } else {
    config = {
      cronString: inputs.cron,
      directoryPath: inputs.dir,
      directorySize: inputs.size,
      fullnessPercent: inputs.percent,
    }
  }

  return config as CacheCleanerConstructorParams
}

parseInputArgs()
