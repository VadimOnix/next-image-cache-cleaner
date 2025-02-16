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
