import pino, { LevelOrString } from 'pino'

export const createLoggerInstance = (logLevel: LevelOrString) =>
  pino({
    level: logLevel,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  })
