import type { Logger } from 'pino'

import type { CacheCleanerConstructorParams } from './types'
import { Watcher } from './Watcher'

/**
 * Class responsible for starting and managing the cache cleaning process.
 * It initializes a Watcher instance based on the provided configuration, validates the parameters,
 * and starts the cleaning processes (either via cron or by monitoring the directory fullness).
 */
export class CacheCleaner {
  #logger: Logger | Console
  #processes: Promise<unknown>[] = []
  #watcher: Watcher
  readonly #directoryPath: string
  readonly #mods: { byCron: boolean; byFullnessPercent: boolean }

  /**
   * Creates an instance of CacheCleaner.
   *
   * @param {CacheCleanerConstructorParams} params - The parameters for constructing the CacheCleaner.
   * @throws {Error|RangeError|SyntaxError} Throws an error if validation of parameters fails.
   */
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

  /**
   * Private getter that returns a string describing which cleaning modes are activated.
   *
   * @returns {string} A string with the names of active modes joined by " & ".
   */
  get #modsInfo(): string {
    const mods: string[] = []
    for (const [key, value] of Object.entries(this.#mods)) {
      if (value) {
        mods.push(key)
      }
    }
    return mods.join(' & ')
  }

  /**
   * Starts the cache cleaner by logging the start-up information,
   * initializing the cleaning processes, and waiting for all processes to complete.
   *
   * @returns {Promise<void>} A promise that resolves when all cleaning processes have completed.
   */
  async start(): Promise<void> {
    this.#logger.info('🚀 Starting nextJs cache cleaner!')
    this.#logger.info(`⚙️ Activated mods: ${this.#modsInfo}.`)
    this.#logger.info(`👀 Watching directory: "${this.#directoryPath}"`)
    try {
      this.#init()
      await Promise.allSettled(this.#processes)
    } catch (error) {
      this.#logger.error(error)
    }
  }

  /**
   * Initializes the cleaning processes based on the activated modes.
   * If cron mode is activated, schedules the cron watcher.
   * If fullness mode is activated, starts the limit-based watcher.
   *
   * @private
   */
  #init(): void {
    if (this.#mods.byCron) {
      this.#processes.push(this.#watcher.watchByCron())
    }
    if (this.#mods.byFullnessPercent) {
      this.#processes.push(this.#watcher.watchByLimit())
    }
  }

  /**
   * Validates the input parameters.
   *
   * @private
   * @param {CacheCleanerConstructorParams} params - The parameters to validate.
   * @throws {Error|RangeError|SyntaxError} If parameters are missing, inconsistent, or invalid.
   */
  #validateParams(params: CacheCleanerConstructorParams): void {
    const { directorySize, cronString, fullnessPercent, directoryPath } = params
    if (
      (typeof directorySize === 'number' &&
        typeof fullnessPercent !== 'number') ||
      (typeof fullnessPercent === 'number' && typeof directorySize !== 'number')
    ) {
      throw new Error(
        'Env variables NICC_FULLNESS_PERCENT and NICC_MAX_CAPACITY cannot be defined separately!',
      )
    }
    if (Number.isNaN(directorySize)) {
      throw new RangeError('Env variable NICC_MAX_CAPACITY must be a valid number!')
    }
    if (Number.isNaN(fullnessPercent)) {
      throw new RangeError('Env variable NICC_FULLNESS_PERCENT must be a valid number!')
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
        'Env NICC_FULLNESS_PERCENT must be a fractional value in the range (0, 1)!',
      )
    }
    if (!directoryPath) {
      throw new Error('Env NICC_IMAGE_CACHE_DIRECTORY cannot be empty!')
    }
  }
}
