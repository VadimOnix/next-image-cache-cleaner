declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test'
      /* Acceptable percentage of file directory fullness. In range from 0.001 to 0.999 */
      NICC_FULLNESS_PERCENT: string
      /* Maximum capacity of directory in kilobytes (100Mb by default) */
      NICC_MAX_CAPACITY: string
      /* Cron setup string. See more: https://github.com/node-cron/node-cron?tab=readme-ov-file#cron-syntax */
      NICC_CRON_CONFIG: string
      /* Path to image cache directory */
      NICC_IMAGE_CACHE_DIRECTORY: string
      /* Log level. Available values: "debug" | "info" | "warn" | "error" |	"fatal" |	"silent" */
      NICC_LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent'
    }
  }
}

// Преобразуем файл в модуль, чтобы избежать ошибок компиляции
export {}
