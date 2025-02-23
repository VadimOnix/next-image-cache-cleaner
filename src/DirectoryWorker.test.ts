import { Dir, Stats } from 'node:fs'
import path from 'node:path'

import fs from 'fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DirectoryWorker } from './DirectoryWorker'

const mockDirectory = '/mock/dir'

describe('DirectoryWorker', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.clearAllTimers()
  })

  describe('getDirectorySize', () => {
    it('should calculate the total size of files in the directory', async () => {
      // Arrange: Create a fake directory handle using fs.opendir with recursive option.
      const fakeDirHandle = {
        async *[Symbol.asyncIterator]() {
          yield {
            name: 'file1.txt',
            isFile: () => true,
            isDirectory: () => false,
            parentPath: mockDirectory,
          }
          yield {
            name: 'file2.txt',
            isFile: () => true,
            isDirectory: () => false,
            parentPath: mockDirectory,
          }
        },
        close: async () => {},
      }
      const opendirSpy = vi
        .spyOn(fs, 'opendir')
        .mockResolvedValue(fakeDirHandle as Dir)

      // Spy on fs.stat to return fake file sizes.
      const statMockFile1 = { isFile: () => true, size: 100 } as Stats
      const statMockFile2 = { isFile: () => true, size: 200 } as Stats

      const statSpy = vi
        .spyOn(fs, 'stat')
        .mockImplementation(async (filePath): Promise<Stats> => {
          if (filePath === path.join(mockDirectory, 'file1.txt')) {
            return statMockFile1
          } else if (filePath === path.join(mockDirectory, 'file2.txt')) {
            return statMockFile2
          }
          return { isFile: () => false, size: 0 } as Stats
        })

      const worker = vi.mocked(
        new DirectoryWorker({ directoryPath: mockDirectory }),
      )

      // Act
      const totalSize = await worker.getDirectorySize()

      // Assert
      expect(totalSize).toBe(300)
      expect(opendirSpy).toHaveBeenCalledWith(mockDirectory, {
        recursive: true,
      })
      expect(statSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('updateAllFiles', () => {
    it('should return a list of all files with their Dirent and Stats', async () => {
      // Arrange: Simulate a directory with one file in the root and one in a subdirectory.
      const fakeDirHandle = {
        async *[Symbol.asyncIterator]() {
          yield {
            name: 'file1.txt',
            isFile: () => true,
            isDirectory: () => false,
            parentPath: mockDirectory,
          }
          yield {
            name: 'subdir',
            isFile: () => false,
            isDirectory: () => true,
            parentPath: mockDirectory,
          }
          yield {
            name: 'file2.txt',
            isFile: () => true,
            isDirectory: () => false,
            parentPath: path.join(mockDirectory, 'subdir'),
          }
        },
        close: async () => {},
      } as Dir
      const opendirSpy = vi
        .spyOn(fs, 'opendir')
        .mockResolvedValue(fakeDirHandle)

      const statMockFile1 = { isFile: () => true, size: 100 } as Stats
      const statMockFile2 = { isFile: () => true, size: 200 } as Stats
      const statSpy = vi
        .spyOn(fs, 'stat')
        .mockImplementation(async (filePath) => {
          if (filePath === path.join(mockDirectory, 'file1.txt')) {
            return statMockFile1
          } else if (
            filePath === path.join(mockDirectory, 'subdir', 'file2.txt')
          ) {
            return statMockFile2
          }
          return { isFile: () => false, size: 0 } as Stats
        })

      const worker = new DirectoryWorker({ directoryPath: mockDirectory })

      // Act
      const files = await worker.updateAllFiles()

      // Assert: We expect file1.txt and file2.txt to be returned.
      expect(files).toMatchObject([
        { fullPath: path.join(mockDirectory, 'file1.txt') },
        { fullPath: path.join(mockDirectory, 'subdir', 'file2.txt') },
      ])
      expect(opendirSpy).toHaveBeenCalledWith(mockDirectory, {
        recursive: true,
      })
      expect(statSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('concurrency limit', () => {
    it('should get and set the concurrency limit correctly', () => {
      // Arrange
      const worker = new DirectoryWorker({
        directoryPath: mockDirectory,
        concurrencyLimit: 100,
      })

      // Act & Assert
      expect(worker.concurrencyLimit).toBe(100)

      // Act: Update the concurrency limit.
      worker.concurrencyLimit = 50

      // Assert
      expect(worker.concurrencyLimit).toBe(50)
    })
  })

  describe('deleteOutdatedFiles', () => {
    it('should delete dir of outdated file based on expiration timestamp', async () => {
      // Arrange: Create a fake directory handle with one outdated and one valid file.
      const outdatedFileName = '1.1000.jpg' // expiration timestamp 1000
      const validFileName = '2.3000.jpg' // far future
      vi.setSystemTime(2000)
      const fakeDirHandle = {
        async *[Symbol.asyncIterator]() {
          yield {
            name: outdatedFileName,
            isFile: () => true,
            isDirectory: () => false,
            parentPath: '/mock/dir/1',
          }
          yield {
            name: validFileName,
            isFile: () => true,
            isDirectory: () => false,
            parentPath: '/mock/dir/2',
          }
        },
        close: async () => {},
      } as Dir

      vi.spyOn(fs, 'opendir').mockResolvedValue(fakeDirHandle)

      // Fake fs.stat for both files.
      vi.spyOn(fs, 'stat').mockResolvedValue({
        isFile: () => true,
        size: 100,
      } as Stats)

      // Spy on fs.rm for deletion.
      const rmSpy = vi.spyOn(fs, 'rm').mockResolvedValue()

      const worker = vi.mocked(
        new DirectoryWorker({ directoryPath: mockDirectory }),
      )

      // Act
      const deletedCount = await worker.deleteOutdatedFiles()

      // Assert: Outdated file should be deleted.
      expect(deletedCount).toBe(1)
      expect(rmSpy).toHaveBeenCalled()
    })
  })

  describe('deleteFilesOverLimit', () => {
    it('should delete files until the freed size meets or exceeds the excess size', async () => {
      // Arrange: Create a fake directory handle with two files.
      const fakeDirHandle = {
        async *[Symbol.asyncIterator]() {
          yield {
            name: 'file1.txt',
            isFile: () => true,
            isDirectory: () => false,
            parentPath: mockDirectory,
          }
          yield {
            name: 'file2.txt',
            isFile: () => true,
            isDirectory: () => false,
            parentPath: mockDirectory,
          }
        },
        close: async () => {},
      } as Dir
      vi.spyOn(fs, 'opendir').mockResolvedValue(fakeDirHandle)

      // For fs.stat: file1 has 100 bytes and file2 has 200 bytes, with different creation times.
      vi.spyOn(fs, 'stat').mockImplementation(async (filePath) => {
        if (filePath === path.join(mockDirectory, 'file1.txt')) {
          return { isFile: () => true, size: 100, birthtimeMs: 100 } as Stats
        } else if (filePath === path.join(mockDirectory, 'file2.txt')) {
          return { isFile: () => true, size: 200, birthtimeMs: 200 } as Stats
        }
        return { isFile: () => false, size: 0, birthtimeMs: 0 } as Stats
      })

      // Spy on fs.rm for deletion.
      const rmSpy = vi.spyOn(fs, 'rm').mockResolvedValue()

      const worker = vi.mocked(
        new DirectoryWorker({ directoryPath: mockDirectory }),
      )

      // Act: First update files and compute the total size.
      await worker.updateAllFiles()
      await worker.getDirectorySize()
      // Set limit such that excessSize = totalSize - limit = 300 - 150 = 150
      const deletedSize = await worker.deleteFilesOverLimit(150)

      // Assert: At least one file (the oldest) should be deleted.
      expect(deletedSize).toBeGreaterThanOrEqual(100)
      expect(rmSpy).toHaveBeenCalled()
    })
  })
})
