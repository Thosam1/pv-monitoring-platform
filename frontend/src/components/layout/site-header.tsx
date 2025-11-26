import { RefreshCw, Calendar, Clock } from 'lucide-react'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'

type ViewMode = 'dashboard' | 'upload' | 'analytics' | 'reports'

interface SiteHeaderProps {
  currentView: ViewMode
  dateLabel: string | null
  onRefresh: () => void
  isLoading?: boolean
}

const VIEW_TITLES: Record<ViewMode, string> = {
  dashboard: 'Dashboard',
  upload: 'Upload Data',
  analytics: 'Analytics',
  reports: 'Reports',
}

export function SiteHeader({
  currentView,
  dateLabel,
  onRefresh,
  isLoading,
}: Readonly<SiteHeaderProps>) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b bg-background px-4">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium">
                {VIEW_TITLES[currentView]}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="flex items-center gap-4">
        {/* Date Display */}
        {dateLabel && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="size-4" />
            <span>{dateLabel}</span>
          </div>
        )}

        {/* Time indicator */}
        <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="size-4" />
          <span>
            {new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isLoading}
          className="gap-2"
        >
          <RefreshCw className={`size-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>
    </header>
  )
}
