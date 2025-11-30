import { type ComponentProps } from 'react'
import {
  LayoutDashboard,
  Upload,
  Sparkles,
  FileText,
  Settings,
  HelpCircle,
  Sun,
} from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import { NavMain, type NavItem } from './nav-main'
import { NavLoggers } from './nav-loggers'
import { type LoggerType } from '@/types/logger'
import { type ViewMode } from '@/types/view-mode'
import { type BackendStatus, getBackendStatusConfig } from '@/lib/date-utils'

interface LoggerInfo {
  id: string
  type: LoggerType
}

interface AppSidebarProps extends ComponentProps<typeof Sidebar> {
  loggers: LoggerInfo[]
  selectedLogger: string | null
  onSelectLogger: (loggerId: string) => void
  backendStatus: BackendStatus
  currentView: ViewMode
  onViewChange: (view: ViewMode) => void
}

export function AppSidebar({
  loggers,
  selectedLogger,
  onSelectLogger,
  backendStatus,
  currentView,
  onViewChange,
  ...props
}: Readonly<AppSidebarProps>) {
  const navItems: NavItem[] = [
    {
      title: 'Dashboard',
      icon: LayoutDashboard,
      isActive: currentView === 'dashboard',
      onClick: () => onViewChange('dashboard'),
    },
    {
      title: 'Upload Data',
      icon: Upload,
      isActive: currentView === 'upload',
      onClick: () => onViewChange('upload'),
    },
    {
      title: 'AI Assistant',
      icon: Sparkles,
      isActive: currentView === 'ai-chat',
      onClick: () => onViewChange('ai-chat'),
    },
    {
      title: 'Reports',
      icon: FileText,
      isActive: currentView === 'reports',
      onClick: () => onViewChange('reports'),
    },
  ]

  const statusConfig = getBackendStatusConfig(backendStatus)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="cursor-default">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Sun className="size-4 text-white" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-semibold">PV Monitor</span>
                <span className="text-xs text-muted-foreground">
                  Analytics Dashboard
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <NavMain items={navItems} />
        <SidebarSeparator />
        <NavLoggers
          loggers={loggers}
          selectedLogger={selectedLogger}
          onSelectLogger={onSelectLogger}
        />
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" className="cursor-pointer">
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Help" className="cursor-pointer">
              <HelpCircle />
              <span>Help</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {/* Backend Status Indicator */}
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`Backend: ${statusConfig.text}`}
              className="cursor-default"
            >
              <span
                className={`size-2 rounded-full ${statusConfig.color}`}
              />
              <span className="text-xs">Backend: {statusConfig.text}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
