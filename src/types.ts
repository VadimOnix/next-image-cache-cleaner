import type { Dirent, Stats } from 'node:fs'

import type PQueue from 'p-queue'
import type { Logger } from 'pino'

export type DirectoryAnalyzerConstructorParams = {
  /** An optional PQueue instance for managing concurrency */
  queue?: PQueue
  /** The maximum number of concurrent file system operations.*/
  concurrencyLimit?: number
  /** The path to the directory to analyze. */
  directoryPath: string

  logger?: Logger | Console
}

export interface FileItem {
  fullPath: string
  entry: Dirent
  stats: Stats
}

/**
 * Parameters for constructing a Watcher instance.
 */
export interface WatcherConstructorParams {
  cronString: string
  directoryPath: string
  directoryKbSize: number
  fullnessPercent: number
  logger?: Logger
}
