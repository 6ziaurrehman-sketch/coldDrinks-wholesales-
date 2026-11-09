import { create } from 'zustand';
import { feedbackService } from '@/lib/feedbackService';

interface FeedbackState {
  isPromptVisible: boolean;
  activeOrder: { id: string; orderNumber: string; total: number } | null;
  status: 'idle' | 'submitting' | 'success' | 'error';
  error: string | null;

  // Actions
  showFeedbackPrompt: (order: { id: string; orderNumber: string; total: number }) => Promise<void>;
  dismissPrompt: () => Promise<void>;
  submitFeedback: (deliveryRating: number, serviceRating: number, comments?: string) => Promise<void>;
  reset: () => void;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  isPromptVisible: false,
  activeOrder: null,
  status: 'idle',
  error: null,

  showFeedbackPrompt: async (order) => {
    const isDismissed = await feedbackService.isDismissed(order.id);
    if (!isDismissed) {
      set({ activeOrder: order, isPromptVisible: true });
    }
  },

  dismissPrompt: async () => {
    const { activeOrder } = get();
    if (activeOrder) {
      await feedbackService.dismissPrompt(activeOrder.id);
    }
    set({ isPromptVisible: false, activeOrder: null });
  },

  submitFeedback: async (deliveryRating, serviceRating, comments) => {
    const { activeOrder } = get();
    if (!activeOrder) return;

    set({ status: 'submitting', error: null });

    try {
      await feedbackService.submitFeedback(
        activeOrder.id,
        deliveryRating,
        serviceRating,
        comments,
      );
      set({ status: 'success', isPromptVisible: false, activeOrder: null });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to submit feedback.' });
    }
  },

  reset: () => {
    set({
      isPromptVisible: false,
      activeOrder: null,
      status: 'idle',
      error: null,
    });
  },
}));
