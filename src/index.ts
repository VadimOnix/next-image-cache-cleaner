import 'dotenv/config'

import chokidar from 'chokidar'
import path from 'path'

import { logger } from './logger'

const watchDir = path.join(process.cwd(), 'samples')
const watcher = chokidar.watch(watchDir, {
  persistent: true,
  awaitWriteFinish: true,
  // optimize watch
  depth: 2,
})

logger.info(`CACHE_DIR: ${watchDir}`)
watcher.on('add', (path) => console.log(`File "${path}" has been added`))
