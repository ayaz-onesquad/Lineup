import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/navigation/Sidebar'
import { TopNav } from '@/components/navigation/TopNav'
import { DetailPanel } from '@/components/shared/DetailPanel'
import { CreateModal } from '@/components/shared/CreateModal'
import { useUIStore } from '@/stores'

export function MainLayout() {
  const { sidebarCollapsed, detailPanel, closeDetailPanel } = useUIStore()
  const location = useLocation()

  // Close detail panel when navigating to a detail page
  useEffect(() => {
    // Close sidebar when navigating to any detail page (e.g., /clients/:id, /projects/:id)
    if (detailPanel.isOpen) {
      closeDetailPanel()
    }
  }, [location.pathname])

  return (
    <div className="min-h-screen bg-background">
      {/* Skip to main content link for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Skip to main content
      </a>

      {/* Top Navigation */}
      <TopNav />

      <div className="flex">
        {/* Sidebar - hidden on mobile, shown on md+ */}
        <div className="hidden md:block">
          <Sidebar />
        </div>

        {/* Main Content */}
        {/*
          `min-w-0` is load-bearing: without it a flex child refuses to shrink
          below its content width, so one wide table pushed the entire page
          sideways. `overflow-x-clip` then contains anything that still
          overflows, while leaving a table's own scroll container free to
          scroll. See docs/DESIGN-SYSTEM.md section 2.2.

          The responsive gutters live here rather than in each page, so every
          page gets 16px on a phone / 24px from `sm` / 32px from `lg` without
          being individually migrated. PageShell adds the header pattern on
          top and does not re-pad.
        */}
        <main
          id="main-content"
          className={`min-w-0 flex-1 overflow-x-clip pt-16 transition-all duration-200 ${
            sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'
          } ${detailPanel.isOpen ? 'lg:mr-96' : ''}`}
          tabIndex={-1}
        >
          <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
            <Outlet />
          </div>
        </main>

        {/* Detail Panel - handles its own responsive rendering */}
        <DetailPanel />
      </div>

      {/* Create Modal */}
      <CreateModal />
    </div>
  )
}
