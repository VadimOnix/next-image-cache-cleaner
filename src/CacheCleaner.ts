import type { Logger } from 'pino'

import { Watcher } from './Watcher'

export interface CacheCleanerConstructorParams {
  fullnessPercent?: number
  directorySize?: number
  cronString?: string
  logger?: Logger
  directoryPath: string
}

export class CacheCleaner {
  #directoryPath: string
  #watcher: Watcher
  #logger: Logger | Console
  #mods: { byCron: boolean; byFullnessPercent: boolean }
  #processes: Promise<unknown>[] = []

  constructor(params: CacheCleanerConstructorParams) {
    this.#validateParams(params)

    this.#logger = params.logger ?? console
    this.#directoryPath = params.directoryPath
    this.#mods = {
      byCron: !!params.cronString,
      byFullnessPercent: !!params.fullnessPercent,
    }

    this.#watcher = new Watcher({
      cronString: params.cronString!,
      directoryPath: params.directoryPath,
      directoryKbSize: params.directorySize!,
      fullnessPercent: params.fullnessPercent!,
      logger: params.logger,
    })
  }

  #init() {
    if (this.#mods.byCron) {
      this.#processes.push(this.#watcher.watchByCron())
    }
    if (this.#mods.byFullnessPercent) {
      this.#processes.push(this.#watcher.watchByLimit())
    }
  }

  #validateParams(params: CacheCleanerConstructorParams) {
    const { directorySize, cronString, fullnessPercent, directoryPath } = params
    if (
      (typeof directorySize === 'number' &&
        typeof fullnessPercent !== 'number') ||
      (typeof fullnessPercent === 'number' && typeof directorySize !== 'number')
    ) {
      throw new Error(
        'Env variables NICC_FULLNESS_PERCENT and NICC_MAX_CAPACITY cannot be define separately!',
      )
    }
    if (typeof directorySize === 'number' && directorySize <= 0) {
      throw new RangeError(
        'Env variable NICC_MAX_CAPACITY must be greater than 0!',
      )
    }
    if (cronString && !Watcher.validateCronString(cronString)) {
      throw new SyntaxError(
        'Incorrect cron string syntax! See https://github.com/node-cron/node-cron?tab=readme-ov-file#cron-syntax.',
      )
    }
    if (
      typeof fullnessPercent === 'number' &&
      (fullnessPercent > 1 || fullnessPercent < 0)
    ) {
      throw new RangeError(
        'Env NICC_FULLNESS_PERCENT must be fractional value in range (0,1) !',
      )
    }
    if (directoryPath === '') {
      throw new Error('Env NICC_IMAGE_CACHE_DIRECTORY cannot be empty!')
    }
  }

  get #modsInfo() {
    const mods: string[] = []
    for (const [key, value] of Object.entries(this.#mods)) {
      if (value) {
        mods.push(key)
      }
    }
    return mods.join(' & ')
  }

  async start() {
    this.#logger.info('🚀 Starting nextJs cache cleaner!')
    this.#logger.info(`⚙️ Activated mods: ${this.#modsInfo}.`)
    this.#logger.info(`👀 Watching directory: "${this.#directoryPath}"`)
    try {
      this.#init()
      await Promise.all(this.#processes)
    } catch (error) {
      this.#logger.error(error)
    }
  }
}
