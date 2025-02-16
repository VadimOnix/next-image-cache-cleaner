import 'dotenv/config'

import { CacheCleaner } from './CacheCleaner'
import { createLoggerInstance } from './logger'

const logger = createLoggerInstance(process.env.NICC_LOG_LEVEL ?? 'info')

const defaults = {
  fullnessPercent: 0.8,
  directorySize: 102400,
  cronString: '30 * * * * *',
}

const main = async () => {
  const cacheCleaner = new CacheCleaner({
    logger: logger,
    cronString: process.env.NICC_CRON_CONFIG ?? defaults.cronString,
    fullnessPercent:
      Number(process.env.NICC_FULLNESS_PERCENT) || defaults.fullnessPercent,
    directorySize:
      Number(process.env.NICC_MAX_CAPACITY) || defaults.directorySize,
    directoryPath: process.env.NICC_IMAGE_CACHE_DIRECTORY as string,
  })

  await cacheCleaner.start()
}

main().catch((error) => logger.error(error))
