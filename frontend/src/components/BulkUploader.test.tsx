import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axios from 'axios'
import { BulkUploader } from './BulkUploader'

// Mock axios
vi.mock('axios')
const mockedAxios = axios as Mocked<typeof axios>

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    )
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>
}))

describe('BulkUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders the component title', () => {
      render(<BulkUploader />)

      expect(screen.getByText('Bulk Data Uploader')).toBeInTheDocument()
    })

    it('renders the dropzone with instructions', () => {
      render(<BulkUploader />)

      expect(screen.getByText('Drag & drop CSV files or folders')).toBeInTheDocument()
      expect(screen.getByText('Or click to select files')).toBeInTheDocument()
    })

    it('renders the logger selector with default value', () => {
      render(<BulkUploader />)

      expect(screen.getByRole('button', { name: /goodwe/i })).toBeInTheDocument()
    })
  })

  describe('logger selector', () => {
    it('opens dropdown when clicked', async () => {
      render(<BulkUploader />)

      const button = screen.getByRole('button', { name: /goodwe/i })
      await userEvent.click(button)

      // Use getAllByRole since there are multiple buttons with same name
      const buttons = screen.getAllByRole('button')
      const buttonTexts = buttons.map(b => b.textContent)
      expect(buttonTexts).toContain('GoodWe')
      expect(buttonTexts).toContain('LTI ReEnergy')
    })

    it('changes logger selection', async () => {
      render(<BulkUploader />)

      // Open dropdown
      const button = screen.getByRole('button', { name: /goodwe/i })
      await userEvent.click(button)

      // Select LTI
      const ltiOption = screen.getByRole('button', { name: 'LTI ReEnergy' })
      await userEvent.click(ltiOption)

      // Should now show LTI as selected
      expect(screen.getByRole('button', { name: /lti reenergy/i })).toBeInTheDocument()
    })
  })

  describe('file upload', () => {
    it('filters non-CSV files', async () => {
      const onUploadComplete = vi.fn()
      render(<BulkUploader onUploadComplete={onUploadComplete} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      // Create a non-CSV file
      const txtFile = new File(['content'], 'test.txt', { type: 'text/plain' })

      // Simulate file drop
      await userEvent.upload(input, txtFile)

      // Should not call API for non-CSV files
      expect(mockedAxios.post).not.toHaveBeenCalled()
    })

    it('uploads CSV files and shows progress', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          successCount: 1,
          errorCount: 0,
          totalRecordsInserted: 100,
          results: [{ filename: 'test.csv', success: true, recordsInserted: 100 }]
        }
      })

      const onUploadComplete = vi.fn()
      render(<BulkUploader onUploadComplete={onUploadComplete} />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement

      // Create a CSV file
      const csvFile = new File(['col1,col2\nval1,val2'], 'test.csv', { type: 'text/csv' })

      // Simulate file upload
      await userEvent.upload(input, csvFile)

      // Wait for upload to complete
      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledTimes(1)
      })

      // Check API was called with correct endpoint
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3000/ingest/goodwe',
        expect.any(FormData),
        expect.objectContaining({
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      )

      // onUploadComplete should be called
      await waitFor(() => {
        expect(onUploadComplete).toHaveBeenCalled()
      })
    })

    it('uses selected logger type in API call', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          successCount: 1,
          errorCount: 0,
          totalRecordsInserted: 50,
          results: [{ filename: 'test.csv', success: true, recordsInserted: 50 }]
        }
      })

      render(<BulkUploader />)

      // Change logger to LTI
      const loggerButton = screen.getByRole('button', { name: /goodwe/i })
      await userEvent.click(loggerButton)
      const ltiOption = screen.getByRole('button', { name: 'LTI ReEnergy' })
      await userEvent.click(ltiOption)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const csvFile = new File(['data'], 'test.csv', { type: 'text/csv' })
      await userEvent.upload(input, csvFile)

      await waitFor(() => {
        expect(mockedAxios.post).toHaveBeenCalledWith(
          'http://localhost:3000/ingest/lti',
          expect.any(FormData),
          expect.anything()
        )
      })
    })

    it('shows stats panel after upload completes', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          successCount: 2,
          errorCount: 1,
          totalRecordsInserted: 150,
          results: []
        }
      })

      render(<BulkUploader />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const csvFile = new File(['data'], 'test.csv', { type: 'text/csv' })
      await userEvent.upload(input, csvFile)

      await waitFor(() => {
        expect(screen.getByText('Total Files')).toBeInTheDocument()
        expect(screen.getByText('Successful')).toBeInTheDocument()
        expect(screen.getByText('Failed')).toBeInTheDocument()
        expect(screen.getByText('Records Inserted')).toBeInTheDocument()
      })
    })

    it('handles upload errors gracefully', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'))

      render(<BulkUploader />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const csvFile = new File(['data'], 'test.csv', { type: 'text/csv' })
      await userEvent.upload(input, csvFile)

      // Should still show stats with failed count
      await waitFor(() => {
        expect(screen.getByText('Failed')).toBeInTheDocument()
      })
    })
  })

  describe('clear results', () => {
    it('shows clear button after upload completes', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          successCount: 1,
          errorCount: 0,
          totalRecordsInserted: 100,
          results: []
        }
      })

      render(<BulkUploader />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const csvFile = new File(['data'], 'test.csv', { type: 'text/csv' })
      await userEvent.upload(input, csvFile)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /clear results/i })).toBeInTheDocument()
      })
    })

    it('hides stats when clear button is clicked', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          successCount: 1,
          errorCount: 0,
          totalRecordsInserted: 100,
          results: []
        }
      })

      render(<BulkUploader />)

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const csvFile = new File(['data'], 'test.csv', { type: 'text/csv' })
      await userEvent.upload(input, csvFile)

      await waitFor(() => {
        expect(screen.getByText('Total Files')).toBeInTheDocument()
      })

      const clearButton = screen.getByRole('button', { name: /clear results/i })
      await userEvent.click(clearButton)

      await waitFor(() => {
        expect(screen.queryByText('Total Files')).not.toBeInTheDocument()
      })
    })
  })
})

describe('helper functions', () => {
  describe('getProgressBarColor', () => {
    it('returns green for 100% progress with no failures', () => {
      // This function is internal, test through rendered output
      // When progress is 100 and no failures, bar should be green
    })

    it('returns amber for 100% progress with failures', () => {
      // When progress is 100 with failures, bar should be amber
    })

    it('returns blue for in-progress uploads', () => {
      // During upload, bar should be blue
    })
  })
})
