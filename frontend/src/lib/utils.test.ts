import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges multiple class strings', () => {
    const result = cn('foo', 'bar', 'baz')
    expect(result).toBe('foo bar baz')
  })

  it('handles conditional classes with clsx syntax', () => {
    const isActive = true
    const isDisabled = false
    const result = cn('base', isActive && 'active', isDisabled && 'disabled')
    expect(result).toBe('base active')
  })

  it('handles Tailwind class conflicts by keeping last value', () => {
    // tailwind-merge resolves conflicts by keeping the last conflicting class
    const result = cn('px-4', 'px-6')
    expect(result).toBe('px-6')
  })

  it('handles Tailwind color conflicts', () => {
    const result = cn('bg-red-500', 'bg-blue-500')
    expect(result).toBe('bg-blue-500')
  })

  it('preserves non-conflicting Tailwind classes', () => {
    const result = cn('px-4 py-2', 'text-white bg-blue-500')
    expect(result).toBe('px-4 py-2 text-white bg-blue-500')
  })

  it('handles empty inputs', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('handles null and undefined inputs', () => {
    const result = cn('foo', null, undefined, 'bar')
    expect(result).toBe('foo bar')
  })

  it('handles false values', () => {
    const result = cn('foo', false, 'bar')
    expect(result).toBe('foo bar')
  })

  it('handles array of classes', () => {
    const result = cn(['foo', 'bar'], 'baz')
    expect(result).toBe('foo bar baz')
  })

  it('handles object syntax for conditional classes', () => {
    const result = cn({
      'base-class': true,
      'active-class': true,
      'disabled-class': false
    })
    expect(result).toBe('base-class active-class')
  })

  it('handles mixed inputs', () => {
    const isActive = true
    const isSkipped = false
    const result = cn(
      'base',
      ['array-class'],
      { 'object-class': true },
      isActive && 'conditional',
      isSkipped && 'skipped'
    )
    expect(result).toBe('base array-class object-class conditional')
  })
})
