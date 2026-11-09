import { create } from 'zustand';
import { templatesService } from '@/lib/templatesService';
import type { OrderTemplate } from '@/types/advancedModules.types';

interface TemplatesState {
  templates: OrderTemplate[];
  activeTemplate: OrderTemplate | null;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;

  // Actions
  loadTemplates: (shopId: string) => Promise<void>;
  loadTemplateDetail: (templateId: string) => Promise<void>;
  createTemplate: (
    shopId: string,
    name: string,
    items: { variantId: string; quantity: number }[],
    isShared?: boolean,
  ) => Promise<string>;
  deleteTemplate: (templateId: string) => Promise<void>;
  reset: () => void;
}

export const useTemplatesStore = create<TemplatesState>((set, get) => ({
  templates: [],
  activeTemplate: null,
  status: 'idle',
  error: null,

  loadTemplates: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });

    try {
      const items = await templatesService.fetchTemplates(shopId);
      set({ templates: items, status: 'success' });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load templates.' });
    }
  },

  loadTemplateDetail: async (templateId: string) => {
    set({ status: 'loading', error: null });

    try {
      const detail = await templatesService.fetchTemplateDetail(templateId);
      set({ activeTemplate: detail, status: 'success' });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load template details.' });
    }
  },

  createTemplate: async (shopId, name, items, isShared = true) => {
    const id = await templatesService.createTemplate(shopId, name, items, isShared);
    await get().loadTemplates(shopId);
    return id;
  },

  deleteTemplate: async (templateId: string) => {
    await templatesService.deleteTemplate(templateId);
    set((state) => ({
      templates: state.templates.filter((t) => t.id !== templateId),
      activeTemplate: state.activeTemplate?.id === templateId ? null : state.activeTemplate,
    }));
  },

  reset: () => {
    set({
      templates: [],
      activeTemplate: null,
      status: 'idle',
      error: null,
    });
  },
}));
