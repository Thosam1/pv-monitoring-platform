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

/** Extracted component to reduce nesting depth */
function LoggerMenuItem({
  loggerId,
  isActive,
  onSelect,
}: Readonly<{
  loggerId: string
  isActive: boolean
  onSelect: (id: string) => void
}>) {
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton
        isActive={isActive}
        onClick={() => onSelect(loggerId)}
        className="cursor-pointer pl-6"
      >
        <span className="truncate">{loggerId}</span>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  )
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
                      <Collapsible
                        key={type.value}
                        defaultOpen={false}
                        className="group/type"
                      >
                        <SidebarMenuSubItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuSubButton className="cursor-pointer">
                              <span
                                className={`size-1.5 rounded-full ${LOGGER_CONFIG[type.value].color}`}
                              />
                              <span>{type.label}</span>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {typeLoggers.length}
                              </span>
                              <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]/type:rotate-90" />
                            </SidebarMenuSubButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {[...typeLoggers].sort((a, b) => a.id.localeCompare(b.id)).map((logger) => (
                                <LoggerMenuItem
                                  key={logger.id}
                                  loggerId={logger.id}
                                  isActive={logger.id === selectedLogger}
                                  onSelect={onSelectLogger}
                                />
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuSubItem>
                      </Collapsible>
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
