import { describe, it, expect } from 'vitest'
import { cn } from './cn'

describe('cn (classname utility)', () => {
  it('merges multiple class strings', () => {
    const result = cn('px-4', 'py-2', 'bg-blue-500')
    expect(result).toBe('px-4 py-2 bg-blue-500')
  })

  it('handles conditional classes', () => {
    const isActive = true
    const isDisabled = false
    const result = cn('base', isActive && 'active', isDisabled && 'disabled')
    expect(result).toBe('base active')
  })

  it('merges conflicting Tailwind classes (last wins)', () => {
    const result = cn('px-2', 'px-4')
    expect(result).toBe('px-4')
  })

  it('handles arrays of classes', () => {
    const result = cn(['flex', 'items-center'], 'gap-2')
    expect(result).toBe('flex items-center gap-2')
  })

  it('handles objects with boolean values', () => {
    const result = cn({
      'bg-red-500': true,
      'bg-blue-500': false,
      'text-white': true
    })
    expect(result).toBe('bg-red-500 text-white')
  })

  it('returns empty string for no inputs', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('handles undefined and null values', () => {
    const result = cn('base', undefined, null, 'end')
    expect(result).toBe('base end')
  })

  it('merges responsive Tailwind variants correctly', () => {
    const result = cn('text-sm', 'md:text-base', 'lg:text-lg')
    expect(result).toBe('text-sm md:text-base lg:text-lg')
  })
})
