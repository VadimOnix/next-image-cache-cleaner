import chokidar, { FSWatcher } from 'chokidar'
import cron from 'node-cron'
import type { Logger } from 'pino'

import { DirectoryWorker } from './DirectoryWorker'
import { WatcherConstructorParams } from './types'

/**
 * Class that monitors a directory and triggers cleanup operations either via cron or based on a size limit.
 */
export class Watcher {
  readonly #cronString: string
  readonly #directoryPath: string
  readonly #directorySize: number
  readonly #fullnessPercent: number
  #directoryWorker: DirectoryWorker
  #logger: Logger | Console
  #watcher: FSWatcher | null
  #cleanupTimer: NodeJS.Timeout | null = null

  /**
   * Creates an instance of Watcher.
   * @param {WatcherConstructorParams} params - The parameters for constructing a Watcher.
   */
  constructor(params: WatcherConstructorParams) {
    this.#cronString = params.cronString
    this.#directoryPath = params.directoryPath
    this.#directorySize = this.#convertKilobytesToBytes(params.directoryKbSize)
    this.#fullnessPercent = params.fullnessPercent

    this.#directoryWorker = new DirectoryWorker({
      directoryPath: params.directoryPath,
      concurrencyLimit: 10,
      logger: params.logger,
    })
    this.#watcher = null
    this.#logger = params.logger ?? console
  }

  /**
   * Calculates the limit size in bytes based on the directory size and fullness percent.
   * @returns {number} The size limit in bytes.
   */
  get #limitSize(): number {
    return Math.round(this.#directorySize * this.#fullnessPercent)
  }

  /**
   * Validates a cron string.
   * @param {string} cronString - The cron string to validate.
   * @returns {boolean} True if the cron string is valid; otherwise, false.
   */
  public static validateCronString(cronString: string): boolean {
    return cron.validate(cronString)
  }

  /**
   * Starts a cron job that periodically checks the directory size and deletes outdated directories.
   * The cron job logs the current folder size and the number of deleted directories.
   * @returns {Promise<void>}
   */
  async watchByCron(): Promise<void> {
    this.#logger.debug(
      `Cron cleaning with "${this.#cronString}" configuration string`,
    )
    cron.schedule(this.#cronString, async () => {
      if ((this.#logger as Logger)?.isLevelEnabled('debug')) {
        const totalSize = await this.#directoryWorker.getDirectorySize()
        const kbSize = this.#convertBytesToKilobytes(totalSize)
        this.#logger.debug(`Current folder size: ${kbSize} Kb.`)
      }

      const deletedDirsCount = await this.#directoryWorker.deleteOutdatedFiles()
      this.#logger.info(
        `🗑️[CRON] Has been deleted ${deletedDirsCount} directories.`,
      )
    })
  }

  /**
   * Starts a file watcher using chokidar that monitors the directory for new files.
   * When a new file is added, it triggers a debounced cleanup check if the directory exceeds the limit.
   * @returns {Promise<void>}
   */
  async watchByLimit(): Promise<void> {
    this.#logger.debug(
      `Cleaning directory with fullness percent: ${this.#fullnessPercent}. Directory limit: ${this.#directorySize} bytes`,
    )

    const watcherConfig = {
      persistent: true,
      awaitWriteFinish: true,
      // optimize watching
      depth: 2,
    }
    this.#watcher = chokidar.watch(this.#directoryPath, watcherConfig)
    this.#logger.debug(
      'File watcher has been created with config',
      watcherConfig,
    )

    // Use arrow function for automatic context binding and debouncing.
    this.#watcher.on('add', (filePath: string) => this.#onAddFile(filePath))
  }

  /**
   * Event handler triggered when a new file is added.
   * This function debounces cleanup checks to avoid frequent executions.
   * @private
   * @param {string} filePath - The path of the added file.
   * @returns {Promise<void>}
   */
  #onAddFile = async (filePath: string): Promise<void> => {
    this.#logger.debug(`File "${filePath}" has been created`)
    // Debounce cleanup: clear any existing timer and set a new one.
    if (this.#cleanupTimer) {
      clearTimeout(this.#cleanupTimer)
    }
    this.#cleanupTimer = setTimeout(async () => {
      const isNeedToErase = await this.#needToEraseFiles()
      if (isNeedToErase) {
        const releasedBytes = await this.#directoryWorker.deleteFilesOverLimit(
          this.#limitSize,
        )
        this.#logger.info(
          `🪽[LIMIT WATCHER] ${this.#convertBytesToKilobytes(releasedBytes)} Kb has been released.`,
        )
      }
    }, 500) // Debounce delay of 500 ms
  }

  /**
   * Determines whether the current directory size exceeds the limit.
   * @private
   * @returns {Promise<boolean>} True if cleanup is needed; otherwise, false.
   */
  async #needToEraseFiles(): Promise<boolean> {
    const currentSize = await this.#directoryWorker.getDirectorySize()
    return currentSize >= this.#limitSize
  }

  /**
   * Converts kilobytes to bytes.
   * @private
   * @param {number} kbytes - The size in kilobytes.
   * @returns {number} The size in bytes.
   */
  #convertKilobytesToBytes(kbytes: number): number {
    return kbytes * 1024
  }

  /**
   * Converts bytes to kilobytes.
   * @private
   * @param {number} bytes - The size in bytes.
   * @returns {number} The size in kilobytes (rounded up).
   */
  #convertBytesToKilobytes(bytes: number): number {
    return Math.ceil(bytes / 1024)
  }
}
