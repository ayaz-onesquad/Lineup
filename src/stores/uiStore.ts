import { create } from 'zustand'

export type EntityType = 'client' | 'project' | 'phase' | 'set' | 'requirement' | 'contact'

interface DetailPanelState {
  isOpen: boolean
  entityType: EntityType | null
  entityId: string | null
  entityData: unknown
}

interface UIState {
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  detailPanel: DetailPanelState
  createModalOpen: boolean
  createModalType: EntityType | null
  createModalContext: Record<string, unknown>

  // Sidebar actions
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
  setSidebarCollapsed: (collapsed: boolean) => void

  // Detail panel actions
  openDetailPanel: (entityType: EntityType, entityId: string, entityData?: unknown) => void
  closeDetailPanel: () => void
  updateDetailPanelData: (data: unknown) => void

  // Create modal actions
  openCreateModal: (type: EntityType, context?: Record<string, unknown>) => void
  closeCreateModal: () => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  detailPanel: {
    isOpen: false,
    entityType: null,
    entityId: null,
    entityData: null,
  },
  createModalOpen: false,
  createModalType: null,
  createModalContext: {},

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

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
}))
