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
        <main
          id="main-content"
          className={`flex-1 transition-all duration-200 pt-16 ${
            sidebarCollapsed ? 'md:ml-16' : 'md:ml-64'
          } ${detailPanel.isOpen ? 'lg:mr-96' : ''}`}
          tabIndex={-1}
        >
          <div className="p-4 md:p-6">
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
