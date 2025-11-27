/**
 * Shared logger type definitions for the PV Monitoring Platform
 */

export type LoggerType =
  | 'goodwe'
  | 'lti'
  | 'integra'
  | 'mbmet'
  | 'meier'
  | 'meteocontrol'
  | 'plexlog'
  | 'smartdog'

export interface LoggerOption {
  value: LoggerType
  label: string
}

export interface LoggerGroup {
  label: string
  options: LoggerOption[]
}

export const LOGGER_CONFIG: Record<LoggerType, { label: string; color: string }> = {
  goodwe: { label: 'GoodWe', color: 'bg-blue-500' },
  integra: { label: 'Integra Sun', color: 'bg-green-500' },
  lti: { label: 'LTI ReEnergy', color: 'bg-purple-500' },
  meier: { label: 'Meier-NT', color: 'bg-orange-500' },
  smartdog: { label: 'SmartDog', color: 'bg-cyan-500' },
  mbmet: { label: 'MBMET 501FB', color: 'bg-yellow-500' },
  meteocontrol: { label: 'Meteo Control', color: 'bg-red-500' },
  plexlog: { label: 'Plexlog', color: 'bg-pink-500' },
}

export const LOGGER_GROUPS: LoggerGroup[] = [
  {
    label: 'Inverters',
    options: [
      { value: 'goodwe', label: 'GoodWe' },
      { value: 'integra', label: 'Integra Sun' },
      { value: 'lti', label: 'LTI ReEnergy' },
      { value: 'meier', label: 'Meier-NT' },
      { value: 'smartdog', label: 'SmartDog' },
    ]
  },
  {
    label: 'Meteo Stations',
    options: [
      { value: 'mbmet', label: 'MBMET 501FB' },
      { value: 'meteocontrol', label: 'Meteo Control' },
      { value: 'plexlog', label: 'Plexlog' },
    ]
  }
]

/**
 * Flat list of all logger options (for simple dropdowns)
 */
export const ALL_LOGGER_OPTIONS: LoggerOption[] = LOGGER_GROUPS.flatMap(group => group.options)

/**
 * Get the group label for a given logger type
 */
export function getLoggerGroupLabel(type: LoggerType): string {
  for (const group of LOGGER_GROUPS) {
    if (group.options.some(opt => opt.value === type)) {
      return group.label
    }
  }
  return 'Unknown'
}
