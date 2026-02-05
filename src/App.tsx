import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/components/providers/AuthProvider'

// Auth pages
import { LoginPage } from '@/pages/auth/LoginPage'
import { SignUpPage } from '@/pages/auth/SignUpPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { OnboardingPage } from '@/pages/auth/OnboardingPage'

// Main app pages
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { ClientsPage } from '@/pages/clients/ClientsPage'
import { ClientDetailPage } from '@/pages/clients/ClientDetailPage'
import { ProjectsPage } from '@/pages/projects/ProjectsPage'
import { ProjectDetailPage } from '@/pages/projects/ProjectDetailPage'
import { SetsPage } from '@/pages/sets/SetsPage'
import { RequirementsPage } from '@/pages/requirements/RequirementsPage'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { TeamPage } from '@/pages/settings/TeamPage'

// Client Portal
import { PortalLoginPage } from '@/pages/portal/PortalLoginPage'
import { PortalDashboardPage } from '@/pages/portal/PortalDashboardPage'
import { PortalProjectPage } from '@/pages/portal/PortalProjectPage'

// Admin Portal
import { AdminLoginPage } from '@/pages/admin/AdminLoginPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminTenantDetailPage } from '@/pages/admin/AdminTenantDetailPage'

// Layouts
import { MainLayout } from '@/components/layouts/MainLayout'
import { AuthLayout } from '@/components/layouts/AuthLayout'
import { PortalLayout } from '@/components/layouts/PortalLayout'
import { AdminLayout } from '@/components/layouts/AdminLayout'

// Guards
import { AuthGuard } from '@/components/guards/AuthGuard'
import { TenantGuard } from '@/components/guards/TenantGuard'
import { AdminGuard } from '@/components/guards/AdminGuard'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AuthProvider>
          <Routes>
            {/* Public Auth Routes */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            </Route>

            {/* Onboarding (requires auth but no tenant) */}
            <Route
              path="/onboarding"
              element={
                <AuthGuard>
                  <OnboardingPage />
                </AuthGuard>
              }
            />

            {/* Main App Routes (requires auth + tenant) */}
            <Route
              element={
                <AuthGuard>
                  <TenantGuard>
                    <MainLayout />
                  </TenantGuard>
                </AuthGuard>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/clients/:clientId" element={<ClientDetailPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
              <Route path="/sets" element={<SetsPage />} />
              <Route path="/requirements" element={<RequirementsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/team" element={<TeamPage />} />
            </Route>

            {/* Client Portal Routes */}
            <Route path="/portal/login" element={<PortalLoginPage />} />
            <Route
              element={
                <AuthGuard requiredRole="client_user">
                  <PortalLayout />
                </AuthGuard>
              }
            >
              <Route path="/portal" element={<PortalDashboardPage />} />
              <Route path="/portal/projects/:projectId" element={<PortalProjectPage />} />
            </Route>

            {/* Admin Portal Routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route
              element={
                <AdminGuard>
                  <AdminLayout />
                </AdminGuard>
              }
            >
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/tenants/:tenantId" element={<AdminTenantDetailPage />} />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </AuthProvider>
        </BrowserRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
