import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export type ToastMessage = {
  id: string;
  title?: string;
  message: string;
  tone: ToastTone;
  onPress?: () => void;
};

export type ToastOptions = {
  title?: string;
  message: string;
  tone?: ToastTone;
  onPress?: () => void;
  duration?: number;
};

type UiState = {
  isOnline: boolean;
  toasts: ToastMessage[];
  setOnline: (isOnline: boolean) => void;
  showToast: (
    messageOrOptions: string | ToastOptions,
    tone?: ToastTone,
  ) => void;
  dismissToast: (id: string) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isOnline: true,
  toasts: [],
  setOnline: (isOnline) => set({ isOnline }),
  showToast: (messageOrOptions, defaultTone = 'info') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let message = '';
    let title: string | undefined;
    let tone: ToastTone = defaultTone;
    let onPress: (() => void) | undefined;
    let duration = 4000;

    if (typeof messageOrOptions === 'string') {
      message = messageOrOptions;
      tone = defaultTone;
    } else {
      message = messageOrOptions.message;
      title = messageOrOptions.title;
      tone = messageOrOptions.tone || defaultTone;
      onPress = messageOrOptions.onPress;
      duration = messageOrOptions.duration || 4000;
    }

    set((state) => ({
      toasts: [...state.toasts, { id, title, message, tone, onPress }],
    }));

    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, duration);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
