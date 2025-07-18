/* v8 ignore next 34 */
import pino, { LevelOrString } from 'pino'

/**
 * Creates a pino logger instance with optional pretty formatting.
 *
 * This function attempts to create a logger with pino-pretty transport for formatted output.
 * If pino-pretty is not available (e.g., when installed via npx), it gracefully falls back
 * to a basic pino logger that outputs JSON format suitable for production environments.
 *
 * @param {LevelOrString} logLevel - The log level (debug, info, warn, error, etc.)
 * @returns {pino.Logger} A configured pino logger instance
 */
export const createLoggerInstance = (logLevel: LevelOrString) => {
  try {
    // Try to create logger with pino-pretty transport for formatted output
    return pino({
      level: logLevel,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    })
  } catch (error) {
    console.error('Error creating logger instance:', error)
    // Fallback to basic pino logger if pino-pretty is not available
    return pino({
      level: logLevel,
    })
  }
}
