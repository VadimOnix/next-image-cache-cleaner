import type { Dirent, Stats } from 'node:fs'

import fs from 'fs/promises'
import PQueue from 'p-queue'
import path from 'path'
import type { Logger } from 'pino'

import { DirectoryAnalyzerConstructorParams } from './types'

/**
 * Class to analyze directories, providing functionalities such as calculating total size and listing all files.
 */
export class DirectoryWorker {
  #concurrencyLimit: number
  #files: { entry: Dirent; stats: Stats }[]
  #queue: PQueue
  #totalSize: number
  #logger: Logger | Console

  readonly #directoryPath: string

  /**
   * Creates an instance of DirectoryAnalyzer.
   * @param {DirectoryAnalyzerConstructorParams} params - The parameters for the analyzer.
   */
  constructor(params: DirectoryAnalyzerConstructorParams) {
    this.#concurrencyLimit = params?.queue
      ? params.queue.concurrency
      : (params?.concurrencyLimit ?? 100)
    this.#directoryPath = params.directoryPath
    this.#queue =
      params?.queue ??
      new PQueue({ concurrency: params?.concurrencyLimit ?? 100 })
    this.#totalSize = 0
    this.#files = []
    this.#logger = params.logger ?? console
  }

  /**
   * Gets the concurrency limit.
   * @returns {number} The current concurrency limit.
   */
  get concurrencyLimit(): number {
    return this.#concurrencyLimit
  }

  /**
   * Gets the last directory size.
   * @returns {number} The current directory size.
   */
  get totalSize(): number {
    return this.#totalSize
  }

  /**
   * Sets a new concurrency limit and updates the queue's concurrency.
   * @param {number} concurrencyLimit - The new concurrency limit.
   */
  set concurrencyLimit(concurrencyLimit: number) {
    this.#concurrencyLimit = concurrencyLimit
    this.#queue.concurrency = concurrencyLimit
  }

  /**
   * Processes a file item to accumulate its size.
   * @private
   * @param {string} filePath - The path to the file.
   * @returns {Promise<void>}
   */
  async #processItem(filePath: string): Promise<void> {
    const stats = await fs.stat(filePath)
    if (stats.isFile()) {
      this.#totalSize += stats.size
    }
  }

  /**
   * Recursively processes a directory to accumulate file sizes.
   * @private
   * @param {string} directory - The path to the directory.
   * @returns {Promise<void>}
   */
  async #processDirectory(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, {
      withFileTypes: true,
      recursive: true,
    })

    entries
      .filter((entry) => entry.isFile())
      .map((fileEntry) => path.join(fileEntry.parentPath, fileEntry.name))
      .forEach((filePath) => {
        this.#queue.add(() => this.#processItem(filePath))
      })
  }

  /**
   * Calculates the total size of files in the directory.
   * @param {string} [pathToDirectory] - Optional path to a directory; defaults to the instance's directory path.
   * @returns {Promise<number>} The total size of files in bytes.
   */
  async getDirectorySize(pathToDirectory?: string): Promise<number> {
    const _dir = pathToDirectory || this.#directoryPath
    this.#totalSize = 0

    await this.#processDirectory(_dir)
    await this.#queue.onIdle() // Ожидание завершения всех задач в очереди

    return this.#totalSize
  }

  /**
   * Retrieves a list of all files in the directory and its subdirectories.
   * @param {string} [pathToDirectory] - Optional path to a directory; defaults to the instance's directory path.
   * @returns {Promise<{entry: Dirent, stats: Stats}[]>} An array of files.
   */
  async updateAllFiles(
    pathToDirectory?: string,
  ): Promise<{ entry: Dirent; stats: Stats }[]> {
    const _dir = pathToDirectory || this.#directoryPath

    const entries = await fs.readdir(_dir, {
      withFileTypes: true,
      recursive: true,
    })

    this.#files = []

    for (const entry of entries) {
      if (entry.isFile()) {
        const filePath = path.join(entry.parentPath, entry.name)
        const stats = await fs.stat(filePath)
        this.#files.push({
          entry,
          stats,
        })
      }
    }

    return this.#files
  }

  async deleteOutdatedFiles() {
    try {
      const files = await this.updateAllFiles()
      const promisesRmOperations: Promise<void>[] = []
      for (const file of files) {
        const expireAt = this.#parseFile(file.entry.name)
        if (expireAt && expireAt < Date.now()) {
          promisesRmOperations.push(
            fs.rm(file.entry.parentPath, { recursive: true, force: true }),
          )
          this.#files = this.#files.filter((f) => f !== file)
          this.#logger.debug(
            `Directory "${file.entry.parentPath}" has been deleted.`,
          )
        }
      }
      await Promise.all(promisesRmOperations)

      return promisesRmOperations.length
    } catch (error) {
      this.#logger.error(error)

      return null
    }
  }

  async deleteFilesOverLimit(limit: number) {
    const excessSize = this.totalSize - limit

    if (excessSize <= 0) {
      this.#logger.debug(`No excess, return 0 bytes`)

      return 0
    }

    // Sort files by creation date (oldest first)
    const sortedFiles = this.#files
      .slice()
      .sort((a, b) => a.stats.birthtimeMs - b.stats.birthtimeMs)

    // Accumulate files until the freed space meets or exceeds the excess size.
    let accumulatedSize = 0
    const promisesRmOperations: Promise<void>[] = []

    try {
      for (const file of sortedFiles) {
        promisesRmOperations.push(
          fs.rm(file.entry.parentPath, { recursive: true, force: true }),
        )
        this.#files = this.#files.filter((f) => f !== file)
        this.#logger.debug(
          `Directory "${file.entry.parentPath}" has been deleted.`,
        )
        accumulatedSize += file.stats.size
        if (accumulatedSize >= excessSize) {
          break
        }
      }
      await Promise.all(promisesRmOperations)
    } catch (error) {
      this.#logger.error(error)
    }

    return accumulatedSize
  }

  #parseFile(fileName: string): number | null {
    try {
      // @link https://github.com/vercel/next.js/blob/canary/packages/next/src/server/image-optimizer.ts#L137
      const expireAt = fileName.split('.')[1]
      return parseInt(expireAt)
    } catch (error) {
      this.#logger.warn(
        error,
        `Could not parse expiration from fileName: ${fileName}`,
      )
      return null
    }
  }
}
