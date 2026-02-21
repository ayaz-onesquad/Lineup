import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type EntityType = 'client' | 'project' | 'phase' | 'set' | 'requirement' | 'contact' | 'lead' | 'pitch'
export type LeadsViewMode = 'pipeline' | 'list' | 'table'

interface DetailPanelState {
  isOpen: boolean
  entityType: EntityType | null
  entityId: string | null
  entityData: unknown
}

interface UIState {
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  settingsExpanded: boolean
  detailPanel: DetailPanelState
  createModalOpen: boolean
  createModalType: EntityType | null
  createModalContext: Record<string, unknown>

  // View mode preferences
  leadsViewMode: LeadsViewMode

  // Sidebar actions
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setSettingsExpanded: (expanded: boolean) => void

  // Detail panel actions
  openDetailPanel: (entityType: EntityType, entityId: string, entityData?: unknown) => void
  closeDetailPanel: () => void
  updateDetailPanelData: (data: unknown) => void

  // Create modal actions
  openCreateModal: (type: EntityType, context?: Record<string, unknown>) => void
  closeCreateModal: () => void

  // View mode actions
  setLeadsViewMode: (mode: LeadsViewMode) => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      sidebarCollapsed: false,
      settingsExpanded: true,
      detailPanel: {
        isOpen: false,
        entityType: null,
        entityId: null,
        entityData: null,
      },
      createModalOpen: false,
      createModalType: null,
      createModalContext: {},

      // View mode preferences
      leadsViewMode: 'pipeline' as LeadsViewMode,

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  setSettingsExpanded: (expanded) => set({ settingsExpanded: expanded }),

  openDetailPanel: (entityType, entityId, entityData = null) =>
    set({
      detailPanel: {
        isOpen: true,
        entityType,
        entityId,
        entityData,
      },
    }),

  closeDetailPanel: () =>
    set({
      detailPanel: {
        isOpen: false,
        entityType: null,
        entityId: null,
        entityData: null,
      },
    }),

  updateDetailPanelData: (data) =>
    set((state) => ({
      detailPanel: {
        ...state.detailPanel,
        entityData: data,
      },
    })),

  openCreateModal: (type, context = {}) =>
    set({
      createModalOpen: true,
      createModalType: type,
      createModalContext: context,
    }),

  closeCreateModal: () =>
    set({
      createModalOpen: false,
      createModalType: null,
      createModalContext: {},
    }),

      setLeadsViewMode: (mode) => set({ leadsViewMode: mode }),
    }),
    {
      name: 'lineup-ui-preferences',
      partialize: (state) => ({
        leadsViewMode: state.leadsViewMode,
        settingsExpanded: state.settingsExpanded,
      }),
    }
  )
)
