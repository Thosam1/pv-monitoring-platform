import { useState, useCallback } from 'react'
import { useDropzone, type FileRejection } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import { Upload, FolderOpen, CheckCircle, XCircle, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type LoggerType, LOGGER_GROUPS, LOGGER_CONFIG } from '../types/logger'

const API_BASE = 'http://localhost:3000'

// Stats interface
interface UploadStats {
  success: number
  failed: number
  total: number
  recordsInserted: number
}

// API response types
interface FileIngestionResult {
  filename: string
  success: boolean
  recordsInserted?: number
  error?: string
}

interface BulkIngestionResponse {
  successCount: number
  errorCount: number
  totalRecordsInserted: number
  results: FileIngestionResult[]
}

// Component props
interface BulkUploaderProps {
  onUploadComplete?: () => void
}

/**
 * Recursively get all files from a FileSystemEntry
 */
async function getFilesFromEntry(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return new Promise((resolve) => {
      (entry as FileSystemFileEntry).file((file) => {
        resolve([file])
      })
    })
  } else if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader()
    const entries = await new Promise<FileSystemEntry[]>((resolve) => {
      dirReader.readEntries((entries) => resolve(entries))
    })
    const files: File[] = []
    for (const childEntry of entries) {
      const childFiles = await getFilesFromEntry(childEntry)
      files.push(...childFiles)
    }
    return files
  }
  return []
}

/**
 * Get files from DataTransferItemList (handles folders)
 */
async function getFilesFromDataTransfer(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = []
  const entries: FileSystemEntry[] = []

  // Get all entries first
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.()
    if (entry) {
      entries.push(entry)
    }
  }

  // Process all entries
  for (const entry of entries) {
    const entryFiles = await getFilesFromEntry(entry)
    files.push(...entryFiles)
  }

  return files
}

/**
 * Get the appropriate icon for the dropzone based on state
 */
function getDropzoneIcon(uploading: boolean, isDragActive: boolean) {
  if (uploading) {
    return <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
  }
  if (isDragActive) {
    return <FolderOpen className="w-12 h-12 text-blue-500" />
  }
  return <Upload className="w-12 h-12 text-gray-400 dark:text-gray-500" />
}

/**
 * Get the primary text for the dropzone based on state
 */
function getDropzoneText(uploading: boolean, isDragActive: boolean): string {
  if (uploading) {
    return 'Uploading files...'
  }
  if (isDragActive) {
    return 'Drop files or folders here'
  }
  return 'Drag & drop CSV files or folders'
}

/**
 * Get the progress bar color class based on completion state
 */
function getProgressBarColor(progress: number, failed: number): string {
  if (progress === 100 && failed === 0) {
    return 'bg-green-500'
  }
  if (progress === 100 && failed > 0) {
    return 'bg-amber-500'
  }
  return 'bg-blue-500'
}

export function BulkUploader({ onUploadComplete }: Readonly<BulkUploaderProps>) {
  const [queue, setQueue] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedLogger, setSelectedLogger] = useState<LoggerType>('goodwe')
  const [stats, setStats] = useState<UploadStats>({
    success: 0,
    failed: 0,
    total: 0,
    recordsInserted: 0
  })
  const [showStats, setShowStats] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  /**
   * Process the upload queue in batches
   */
  const processQueue = useCallback(async (files: File[]) => {
    const csvFiles = files.filter((f) => f.name.toLowerCase().endsWith('.csv'))

    if (csvFiles.length === 0) {
      return
    }

    setUploading(true)
    setShowStats(true)
    setProgress(0)
    setStats({ success: 0, failed: 0, total: csvFiles.length, recordsInserted: 0 })

    const batchSize = 5
    let completedFiles = 0
    let totalSuccess = 0
    let totalFailed = 0
    let totalRecords = 0

    // Process files in batches
    for (let i = 0; i < csvFiles.length; i += batchSize) {
      const batch = csvFiles.slice(i, i + batchSize)
      const formData = new FormData()

      batch.forEach((file) => {
        formData.append('files', file)
      })

      try {
        const response = await axios.post<BulkIngestionResponse>(
          `${API_BASE}/ingest/${selectedLogger}`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          }
        )

        totalSuccess += response.data.successCount
        totalFailed += response.data.errorCount
        totalRecords += response.data.totalRecordsInserted
      } catch {
        // If request fails, count all files in batch as failed
        totalFailed += batch.length
      }

      completedFiles += batch.length
      const newProgress = Math.round((completedFiles / csvFiles.length) * 100)
      setProgress(newProgress)
      setStats({
        success: totalSuccess,
        failed: totalFailed,
        total: csvFiles.length,
        recordsInserted: totalRecords
      })
    }

    setUploading(false)
    setQueue([])
    onUploadComplete?.()
  }, [selectedLogger, onUploadComplete])

  /**
   * Handle drop event with folder support
   */
  const onDrop = useCallback(async (acceptedFiles: File[], _fileRejections: FileRejection[], event?: { dataTransfer?: DataTransfer }) => {
    let filesToProcess: File[] = acceptedFiles

    // Check if we have folder entries via dataTransfer
    if (event?.dataTransfer?.items) {
      const hasDirectories = Array.from(event.dataTransfer.items).some((item) => {
        const entry = item.webkitGetAsEntry?.()
        return entry?.isDirectory
      })

      if (hasDirectories) {
        filesToProcess = await getFilesFromDataTransfer(event.dataTransfer.items)
      }
    }

    setQueue(filesToProcess)
    await processQueue(filesToProcess)
  }, [processQueue])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles, fileRejections, event) => {
      onDrop(acceptedFiles, fileRejections, event as { dataTransfer?: DataTransfer }).catch(console.error)
    },
    accept: {
      'text/csv': ['.csv']
    },
    multiple: true,
    noClick: uploading
  })

  const selectedLoggerLabel = LOGGER_CONFIG[selectedLogger]?.label ?? 'Select Logger'

  return (
    <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-xl shadow-lg p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Bulk Data Uploader
        </h2>

        {/* Logger Selector Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={uploading}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors cursor-pointer",
              "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600",
              "hover:border-blue-400 dark:hover:border-blue-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "text-gray-900 dark:text-white text-sm font-medium"
            )}
          >
            {selectedLoggerLabel}
            <ChevronDown className={cn(
              "w-4 h-4 transition-transform",
              dropdownOpen && "rotate-180"
            )} />
          </button>

          <AnimatePresence>
            {dropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-700 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden z-10"
              >
                {LOGGER_GROUPS.map((group, groupIndex) => (
                  <div key={group.label}>
                    {/* Group separator (not for first group) */}
                    {groupIndex > 0 && (
                      <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                    )}
                    {/* Group label */}
                    <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {group.label}
                    </div>
                    {/* Group options */}
                    {group.options.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setSelectedLogger(option.value)
                          setDropdownOpen(false)
                        }}
                        className={cn(
                          "w-full px-4 py-2 text-left text-sm transition-colors cursor-pointer flex items-center gap-2",
                          "hover:bg-gray-100 dark:hover:bg-gray-600",
                          selectedLogger === option.value
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : "text-gray-700 dark:text-gray-200"
                        )}
                      >
                        <span className={cn(
                          "inline-block w-2 h-2 rounded-full",
                          LOGGER_CONFIG[option.value].color
                        )} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Dropzone */}
      <div {...getRootProps()}>
        <input {...getInputProps()} />
        <motion.div
          whileHover={uploading ? {} : { scale: 1.01 }}
          whileTap={uploading ? {} : { scale: 0.98 }}
          animate={{
            borderColor: isDragActive ? '#3b82f6' : '#e5e7eb',
            backgroundColor: isDragActive ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
          }}
          transition={{ duration: 0.2 }}
          className={cn(
            "relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer",
            "transition-colors duration-200",
            uploading && "pointer-events-none opacity-60"
          )}
        >
          <div className="flex flex-col items-center gap-3">
            {getDropzoneIcon(uploading, isDragActive)}

            <div>
              <p className="text-lg font-medium text-gray-700 dark:text-gray-200">
                {getDropzoneText(uploading, isDragActive)}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {uploading ? `Processing ${queue.length} files` : 'Or click to select files'}
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Progress Bar */}
      <AnimatePresence>
        {(uploading || showStats) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-6"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {uploading ? 'Upload Progress' : 'Upload Complete'}
              </span>
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {progress}%
              </span>
            </div>

            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                layout
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={cn(
                  "h-full rounded-full",
                  getProgressBarColor(progress, stats.failed)
                )}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Panel */}
      <AnimatePresence>
        {showStats && progress === 100 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {/* Total Files */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Total Files</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {stats.total}
              </p>
            </div>

            {/* Successful */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <p className="text-sm text-green-600 dark:text-green-400">Successful</p>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.success}
              </p>
            </div>

            {/* Failed */}
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <XCircle className="w-4 h-4 text-red-500" />
                <p className="text-sm text-red-600 dark:text-red-400">Failed</p>
              </div>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                {stats.failed}
              </p>
            </div>

            {/* Records Inserted */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <p className="text-sm text-blue-600 dark:text-blue-400">Records Inserted</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.recordsInserted.toLocaleString()}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Button */}
      <AnimatePresence>
        {showStats && !uploading && progress === 100 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-4 flex justify-end"
          >
            <button
              type="button"
              onClick={() => {
                setShowStats(false)
                setProgress(0)
                setStats({ success: 0, failed: 0, total: 0, recordsInserted: 0 })
              }}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors cursor-pointer"
            >
              Clear Results
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
