import chokidar, { FSWatcher } from 'chokidar'
import cron from 'node-cron'
import type { Logger } from 'pino'

import { DirectoryWorker } from './DirectoryWorker'

export interface WatcherConstructorParams {
  cronString: string
  directoryPath: string
  directoryKbSize: number
  fullnessPercent: number
  logger?: Logger
}

export class Watcher {
  #cronString: string
  #directoryPath: string
  #directorySize: number
  #fullnessPercent: number
  #directoryWorker: DirectoryWorker
  #logger: Logger | Console
  #watcher: FSWatcher | null
  #cleanupTimer: NodeJS.Timeout | null = null

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

  public static validateCronString(cronString: string) {
    return cron.validate(cronString)
  }

  async watchByCron() {
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

  async watchByLimit() {
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

    this.#watcher.on('add', this.#onAddFile.bind(this))
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

  async #needToEraseFiles() {
    const currentSize = await this.#directoryWorker.getDirectorySize()
    return currentSize >= this.#limitSize
  }

  get #limitSize(): number {
    return Math.round(this.#directorySize * this.#fullnessPercent)
  }

  #convertKilobytesToBytes(kbytes: number) {
    return kbytes * 1024
  }

  #convertBytesToKilobytes(bytes: number) {
    return Math.ceil(bytes / 1024)
  }
}
