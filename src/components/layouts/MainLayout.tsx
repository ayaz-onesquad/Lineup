import { Outlet } from 'react-router-dom'
import { Sidebar } from '@/components/navigation/Sidebar'
import { TopNav } from '@/components/navigation/TopNav'
import { DetailPanel } from '@/components/shared/DetailPanel'
import { CreateModal } from '@/components/shared/CreateModal'
import { useUIStore } from '@/stores'

export function MainLayout() {
  const { sidebarCollapsed, detailPanel } = useUIStore()

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navigation */}
      <TopNav />

      <div className="flex">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <main
          className={`flex-1 transition-all duration-200 ${
            sidebarCollapsed ? 'ml-16' : 'ml-64'
          } ${detailPanel.isOpen ? 'mr-96' : ''} pt-16`}
        >
          <div className="p-6">
            <Outlet />
          </div>
        </main>

        {/* Detail Panel */}
        <DetailPanel />
      </div>

      {/* Create Modal */}
      <CreateModal />
    </div>
  )
}
