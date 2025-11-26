import { Fragment } from 'react'
import { Database, Server, Thermometer } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  type LoggerType,
  type LoggerOption,
  LOGGER_CONFIG,
  LOGGER_GROUPS,
} from '@/types/logger'

interface LoggerInfo {
  id: string
  type: LoggerType
}

interface LoggerContextBarProps {
  loggers: LoggerInfo[]
  selectedLogger: string | null
  onSelectLogger: (loggerId: string) => void
  dataCount: number
}

export function LoggerContextBar({
  loggers,
  selectedLogger,
  onSelectLogger,
  dataCount,
}: Readonly<LoggerContextBarProps>) {
  const selectedLoggerInfo = loggers.find((l) => l.id === selectedLogger)
  const loggerConfig = selectedLoggerInfo
    ? LOGGER_CONFIG[selectedLoggerInfo.type]
    : null

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-card p-3">
      {/* Logger Selector */}
      <div className="flex items-center gap-2">
        <Database className="size-4 text-muted-foreground" />
        <Select
          value={selectedLogger ?? ''}
          onValueChange={(value) => onSelectLogger(value)}
        >
          <SelectTrigger className="h-8 w-[200px]">
            <SelectValue placeholder="Select Logger" />
          </SelectTrigger>
          <SelectContent>
            {loggers.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No loggers found
              </div>
            ) : (
              <>
                {LOGGER_GROUPS.map((group) => {
                  const groupLoggers = loggers.filter((l) =>
                    group.options.some((opt) => opt.value === l.type)
                  )
                  if (groupLoggers.length === 0) return null

                  const loggersByType = group.options.reduce(
                    (acc, opt) => {
                      const loggersOfType = groupLoggers.filter(
                        (l) => l.type === opt.value
                      )
                      if (loggersOfType.length > 0) {
                        acc.push({ type: opt, loggers: loggersOfType })
                      }
                      return acc
                    },
                    [] as Array<{ type: LoggerOption; loggers: LoggerInfo[] }>
                  )

                  const GroupIcon =
                    group.label === 'Inverters' ? Server : Thermometer

                  return (
                    <SelectGroup key={group.label}>
                      <SelectLabel className="flex items-center gap-1.5 bg-muted/50">
                        <GroupIcon className="size-3" />
                        {group.label}
                      </SelectLabel>
                      {loggersByType.map(({ type, loggers: typeLoggers }) => (
                        <Fragment key={type.value}>
                          <div className="px-2 py-1 text-xs text-muted-foreground flex items-center gap-1.5">
                            <span
                              className={`size-1.5 rounded-full ${LOGGER_CONFIG[type.value].color}`}
                            />
                            {type.label}
                          </div>
                          {typeLoggers
                            .sort((a, b) => a.id.localeCompare(b.id))
                            .map((logger) => (
                              <SelectItem key={logger.id} value={logger.id}>
                                <span className="pl-2">{logger.id}</span>
                              </SelectItem>
                            ))}
                        </Fragment>
                      ))}
                    </SelectGroup>
                  )
                })}
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Logger Type Badge */}
      {loggerConfig && (
        <Badge variant="secondary" className="gap-1.5">
          <span className={`size-2 rounded-full ${loggerConfig.color}`} />
          {loggerConfig.label}
        </Badge>
      )}

      {/* Record Count */}
      <Badge variant="outline" className="gap-1.5">
        {dataCount.toLocaleString()} records
      </Badge>
    </div>
  )
}
