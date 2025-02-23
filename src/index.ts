/* v8 ignore next 22 */
import 'dotenv/config'

import { CacheCleaner } from './CacheCleaner'
import { createLoggerInstance } from './logger'
import { parseInputArgs } from './parseInputArgs'

const logger = createLoggerInstance(process.env.NICC_LOG_LEVEL ?? 'info')

const main = async () => {
  const config = parseInputArgs()

  const cacheCleaner = new CacheCleaner({
    logger: logger,
    ...config,
  })

  await cacheCleaner.start()
}

main().catch((error) => logger.error(error))
