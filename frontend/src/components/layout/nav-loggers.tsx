import { Fragment } from 'react'
import { ChevronRight, Server, Thermometer } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from '@/components/ui/sidebar'
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

interface NavLoggersProps {
  loggers: LoggerInfo[]
  selectedLogger: string | null
  onSelectLogger: (loggerId: string) => void
}

export function NavLoggers({ loggers, selectedLogger, onSelectLogger }: Readonly<NavLoggersProps>) {
  if (loggers.length === 0) {
    return (
      <SidebarGroup>
        <SidebarGroupLabel>Loggers</SidebarGroupLabel>
        <div className="px-4 py-2 text-sm text-muted-foreground">
          No loggers available
        </div>
      </SidebarGroup>
    )
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Loggers</SidebarGroupLabel>
      <SidebarMenu>
        {LOGGER_GROUPS.map((group) => {
          const groupLoggers = loggers.filter((l) =>
            group.options.some((opt) => opt.value === l.type)
          )

          if (groupLoggers.length === 0) return null

          const GroupIcon = group.label === 'Inverters' ? Server : Thermometer

          // Group loggers by type
          const loggersByType = group.options.reduce((acc, opt) => {
            const loggersOfType = groupLoggers.filter((l) => l.type === opt.value)
            if (loggersOfType.length > 0) {
              acc.push({ type: opt, loggers: loggersOfType })
            }
            return acc
          }, [] as Array<{ type: LoggerOption; loggers: LoggerInfo[] }>)

          return (
            <Collapsible
              key={group.label}
              defaultOpen
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={group.label}>
                    <GroupIcon className="size-4" />
                    <span>{group.label}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {loggersByType.map(({ type, loggers: typeLoggers }) => (
                      <Fragment key={type.value}>
                        {/* Type subtitle */}
                        <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
                          <span
                            className={`size-1.5 rounded-full ${LOGGER_CONFIG[type.value].color}`}
                          />
                          <span>{type.label}</span>
                        </div>
                        {/* Logger items */}
                        {typeLoggers
                          .sort((a, b) => a.id.localeCompare(b.id))
                          .map((logger) => (
                            <SidebarMenuSubItem key={logger.id}>
                              <SidebarMenuSubButton
                                isActive={logger.id === selectedLogger}
                                onClick={() => onSelectLogger(logger.id)}
                                className="cursor-pointer"
                              >
                                <span className="truncate">{logger.id}</span>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                      </Fragment>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
