/**
 * @file DirectoryWorker.ts
 * @description Provides the DirectoryWorker class to analyze directories, calculate total file sizes,
 * update the file list, and delete outdated or excess files. It uses Node.js's fs/promises API with the
 * recursive option and employs PQueue for concurrency control.
 */

import type { Dirent, Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import PQueue from 'p-queue'
import type { Logger } from 'pino'

import { DirectoryAnalyzerConstructorParams } from './types'

/**
 * Class to perform operations on a directory, such as calculating the total size, updating the file list,
 * and deleting files based on expiration or size limit criteria.
 */
export class DirectoryWorker {
  #concurrencyLimit: number
  #files: { entry: Dirent; stats: Stats }[]
  #queue: PQueue
  #totalSize: number
  #logger: Logger | Console

  readonly #directoryPath: string

  /**
   * Creates an instance of DirectoryWorker.
   * @param {DirectoryAnalyzerConstructorParams} params - The parameters for the worker.
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
   * Gets the last calculated total size of the directory.
   * @returns {number} The total size of files in bytes.
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
   * Processes a single file to accumulate its size.
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
   * Uses Node.js 22's fs.readdir with the recursive option.
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
    await this.#queue.onIdle() // Wait for all queued tasks to complete

    return this.#totalSize
  }

  /**
   * Updates the internal list of files by reading the directory and its subdirectories.
   * @param {string} [pathToDirectory] - Optional path to a directory; defaults to the instance's directory path.
   * @returns {Promise<{entry: Dirent, stats: Stats}[]>} An array of file objects with their stats.
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

  /**
   * Deletes files that are considered outdated based on their file name expiration data.
   * @returns {Promise<number|null>} The number of directories deleted, or null if an error occurred.
   */
  async deleteOutdatedFiles(): Promise<number | null> {
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

  /**
   * Deletes files until the total freed size meets or exceeds the excess size over the given limit.
   * @param {number} limit - The size limit in bytes.
   * @returns {Promise<number>} The total size of deleted files in bytes.
   */
  async deleteFilesOverLimit(limit: number): Promise<number> {
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

  /**
   * Parses the file name to extract an expiration timestamp.
   * @private
   * @param {string} fileName - The name of the file.
   * @returns {number | null} The expiration timestamp, or null if parsing fails.
   */
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
