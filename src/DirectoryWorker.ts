/**
 * @file DirectoryWorker.ts
 * @description Provides the DirectoryWorker class to analyze directories, calculate total file sizes,
 * update the file list, and delete outdated or excess files. The class leverages Node.js 22's fs/promises API,
 * fs.opendir for streaming directory entries, and PQueue for controlled concurrency.
 */

import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import PQueue from 'p-queue'
import type { Logger } from 'pino'

import { DirectoryAnalyzerConstructorParams, FileItem } from './types'

/**
 * Class to perform operations on a directory, such as calculating the total size, updating the file list,
 * and deleting files based on expiration or size limit criteria.
 */
export class DirectoryWorker {
  #concurrencyLimit: number
  #files: FileItem[]
  #queue: PQueue
  #totalSize: number
  #logger: Logger | Console
  readonly #directoryPath: string

  /**
   * Creates an instance of DirectoryWorker.
   * @param {DirectoryAnalyzerConstructorParams} params - The parameters for the worker.
   */
  constructor(params: DirectoryAnalyzerConstructorParams) {
    this.#queue =
      params?.queue ??
      new PQueue({ concurrency: params?.concurrencyLimit ?? 100 })
    this.#concurrencyLimit = params?.queue
      ? params.queue.concurrency
      : (params?.concurrencyLimit ?? 100)
    this.#directoryPath = params.directoryPath
    this.#totalSize = 0
    this.#files = []
    this.#logger = params.logger ?? console
  }

  /**
   * Gets the current concurrency limit.
   * @returns {number} The current concurrency limit.
   */
  get concurrencyLimit(): number {
    return this.#concurrencyLimit
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
   * Gets the last calculated total size of the directory.
   * @returns {number} The total size of files in bytes.
   */
  get totalSize(): number {
    return this.#totalSize
  }

  /**
   * Updates the internal list of files by traversing the directory and retrieving file statistics.
   * @param {string} [pathToDirectory] - Optional path to a directory; defaults to the instance's directory path.
   * @returns {Promise<FileItem[]>} An array of file items with their Dirent and Stats.
   */
  async updateAllFiles(pathToDirectory?: string): Promise<FileItem[]> {
    const baseDir = pathToDirectory || this.#directoryPath
    this.#files = []
    const fileTasks: Promise<void>[] = []

    for await (const { fullPath, entry } of this.#traverseDirectory(baseDir)) {
      const task = this.#queue.add(async () => {
        const stats = await fs.stat(fullPath)
        this.#files.push({ fullPath, entry, stats })
      })
      fileTasks.push(task)
    }

    await Promise.all(fileTasks)
    return this.#files
  }

  /**
   * Calculates the total size of files in the directory using a streaming approach.
   * @param {string} [pathToDirectory] - Optional path to a directory; defaults to the instance's directory path.
   * @returns {Promise<number>} The total size of files in bytes.
   */
  async getDirectorySize(pathToDirectory?: string): Promise<number> {
    const baseDir = pathToDirectory || this.#directoryPath
    this.#totalSize = 0
    const sizeTasks: Promise<void>[] = []

    for await (const { fullPath } of this.#traverseDirectory(baseDir)) {
      const task = this.#queue.add(async () => {
        const stats = await fs.stat(fullPath)
        if (stats.isFile()) {
          this.#totalSize += stats.size
        }
      })
      sizeTasks.push(task)
    }

    await Promise.all(sizeTasks)
    return this.#totalSize
  }

  /**
   * Deletes directory of file that are outdated based on expiration data parsed from their file names.
   * Uses Promise.allSettled to handle individual deletion errors.
   * @returns {Promise<number | null>} The number of directories deleted, or null if an error occurred.
   */
  async deleteOutdatedFiles(): Promise<number | null> {
    try {
      await this.updateAllFiles()
      const deletionPromises: Promise<unknown>[] = []

      for (const file of this.#files) {
        const expireAt = this.#parseFile(file.entry.name)
        if (expireAt && expireAt < Date.now()) {
          deletionPromises.push(
            fs.rm(file.entry.parentPath, { recursive: true, force: true }),
          )
          // Remove file from internal list
          this.#files = this.#files.filter((f) => f !== file)
          this.#logger.debug(
            `Directory "${file.entry.parentPath}" has been deleted.`,
          )
        }
      }

      const results = await Promise.allSettled(deletionPromises)
      const deletedCount = results.filter(
        (r) => r.status === 'fulfilled',
      ).length
      return deletedCount
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
      this.#logger.debug(`No excess, returning 0 bytes`)
      return 0
    }

    // Sort files by creation date (oldest first)
    const sortedFiles = this.#files
      .slice()
      .sort((a, b) => a.stats.birthtimeMs - b.stats.birthtimeMs)
    let accumulatedSize = 0
    const deletionPromises: Promise<unknown>[] = []

    try {
      for (const file of sortedFiles) {
        deletionPromises.push(
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
      await Promise.allSettled(deletionPromises)
    } catch (error) {
      this.#logger.error(error)
    }

    return accumulatedSize
  }

  /**
   * Asynchronously traverses the given directory using fs.opendir with the recursive option and yields file entries along with their full path.
   * @private
   * @param {string} dir - The directory to traverse.
   * @returns {AsyncGenerator<{fullPath: string, entry: Dirent}, void, unknown>}
   */
  async *#traverseDirectory(
    dir: string,
  ): AsyncGenerator<{ fullPath: string; entry: Dirent }> {
    const dirHandle = await fs.opendir(dir, { recursive: true })
    for await (const entry of dirHandle) {
      if (entry.isFile()) {
        const fullPath = path.join(entry.parentPath, entry.name)
        yield { fullPath, entry }
      }
    }
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
