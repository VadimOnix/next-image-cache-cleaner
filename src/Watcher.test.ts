import chokidar, { FSWatcher } from 'chokidar'
import cron from 'node-cron'
import { Logger } from 'pino'

import { DirectoryWorker } from './DirectoryWorker'
import { Watcher } from './Watcher'

// Use fake timers for debounce testing.
vi.useFakeTimers()

describe('Watcher', () => {
  const mockDirectory = '/mock/dir'
  const validCron = '*/5 * * * *'
  const directoryKbSize = 100 // 100KB
  const fullnessPercent = 0.8

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllTimers()
  })

  describe('validateCronString', () => {
    it('should return true for a valid cron string', () => {
      vi.spyOn(cron, 'validate').mockReturnValue(true)
      expect(Watcher.validateCronString(validCron)).toBe(true)
    })

    it('should return false for an invalid cron string', () => {
      vi.spyOn(cron, 'validate').mockReturnValue(false)
      expect(Watcher.validateCronString('invalid')).toBe(false)
    })
  })

  describe('watchByCron', () => {
    it('should schedule a cron job and invoke DirectoryWorker methods', async () => {
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        isLevelEnabled: vi.fn(() => true),
      } as unknown as Logger

      const getDirectorySizeSpy = vi
        .spyOn(DirectoryWorker.prototype, 'getDirectorySize')
        .mockResolvedValue(10240) // e.g. 10 KB total
      const deleteOutdatedSpy = vi
        .spyOn(DirectoryWorker.prototype, 'deleteOutdatedFiles')
        .mockResolvedValue(2)
      const scheduleSpy = vi
        .spyOn(cron, 'schedule')
        // @ts-expect-error need many types for typecast parameters
        .mockImplementation((cronStr, callback) => {
          // Immediately invoke the cron callback to simulate job execution.
          // @ts-expect-error need many types for typecast parameters
          callback()
          return { destroy: vi.fn() }
        })
      const loggerInfoSpy = vi.spyOn(logger, 'info')

      const watcher = vi.mocked(
        new Watcher({
          cronString: validCron,
          directoryPath: mockDirectory,
          directoryKbSize,
          fullnessPercent,
          logger,
        }),
      )

      await watcher.watchByCron()
      // Wait for any pending microtasks (the async cron callback)
      await vi.runAllTimersAsync()

      expect(scheduleSpy).toHaveBeenCalledWith(validCron, expect.any(Function))
      expect(getDirectorySizeSpy).toHaveBeenCalled()
      expect(deleteOutdatedSpy).toHaveBeenCalled()
      expect(loggerInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Has been deleted'),
      )
    })
  })

  describe('watchByLimit', () => {
    it('should create a file watcher with proper configuration', async () => {
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
      } as unknown as Logger
      const fakeWatcher = { on: vi.fn() } as unknown as FSWatcher
      const watchSpy = vi.spyOn(chokidar, 'watch').mockReturnValue(fakeWatcher)
      const watcher = new Watcher({
        cronString: validCron,
        directoryPath: mockDirectory,
        directoryKbSize,
        fullnessPercent,
        logger,
      })

      await watcher.watchByLimit()

      expect(watchSpy).toHaveBeenCalledWith(mockDirectory, {
        persistent: true,
        awaitWriteFinish: true,
        depth: 2,
      })
      expect(fakeWatcher.on).toHaveBeenCalledWith('add', expect.any(Function))
    })

    it('should trigger cleanup when a new file is added and directory exceeds limit', async () => {
      // Arrange
      const logger = {
        debug: vi.fn(),
        info: vi.fn(),
        isLevelEnabled: vi.fn(() => true),
      } as unknown as Logger
      // Set up a fake chokidar watcher that allows us to capture the "add" event callback.
      let addCallback: (filePath: string) => void = () => {}
      const fakeWatcher = {
        on: vi.fn().mockImplementation((event, cb) => {
          if (event === 'add') {
            addCallback = cb
          }
        }),
      } as unknown as FSWatcher
      vi.spyOn(chokidar, 'watch').mockReturnValue(fakeWatcher)

      // Stub DirectoryWorker methods: simulate directory size exceeding limit.
      const getDirectorySizeSpy = vi
        .spyOn(DirectoryWorker.prototype, 'getDirectorySize')
        .mockResolvedValue(10240) // 10 KB total
      // Suppose our limit is computed as:
      // directorySize (100 KB) -> 102400 bytes, limit = 102400 * 0.8 = 81920 bytes.
      // Returning 10240 makes no sense (should be above limit).
      // Adjust test: use a smaller directoryKbSize so that limit is lower.
      // Let's use directoryKbSize = 5 KB so that limit = 5*1024*0.8 = 4096 bytes.
      const adjustedWatcher = new Watcher({
        cronString: validCron,
        directoryPath: mockDirectory,
        directoryKbSize: 5, // 5 KB
        fullnessPercent,
        logger: logger,
      })
      const deleteFilesOverLimitSpy = vi
        .spyOn(DirectoryWorker.prototype, 'deleteFilesOverLimit')
        .mockResolvedValue(2048) // e.g. 2048 bytes released

      // Start the limit watcher.
      await adjustedWatcher.watchByLimit()

      // Act: simulate a file "add" event.
      addCallback('/mock/dir/newfile.txt')
      // Advance timers to trigger debounce.
      vi.advanceTimersByTime(500)

      // Wait for any pending microtasks (the async cron callback)
      await vi.runAllTimersAsync()

      expect(getDirectorySizeSpy).toHaveBeenCalled()
      expect(deleteFilesOverLimitSpy).toHaveBeenCalledWith(4096) // limit computed as 5*1024*0.8
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Kb has been released.'),
      )
    })
  })
})
