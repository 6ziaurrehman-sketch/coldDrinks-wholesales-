import { create } from 'zustand';
import { createAsyncSlice, type AsyncSlice } from '@/store/createAsyncSlice';
import { orderNotesService } from '@/lib/orderNotesService';
import type { OrderNote } from '@/types/notes.types';

export const QUICK_NOTE_CHIPS = [
  'Deliver before 1 PM',
  'Call when driver reaches shop',
  'Leave at gate',
];

export interface NotesState extends AsyncSlice {
  notesByOrder: Record<string, OrderNote[]>;
  quickChips: string[];

  // Actions
  loadForOrder: (orderId: string) => Promise<OrderNote[]>;
  addNote: (orderId: string, text: string) => Promise<void>;
  editNote: (orderId: string, noteId: string, text: string) => Promise<void>;
  reset: () => void;
}

export const useNotesStore = create<NotesState>((set, get) => {
  const asyncSlice = createAsyncSlice(set as never);

  return {
    ...asyncSlice,
    notesByOrder: {},
    quickChips: [...QUICK_NOTE_CHIPS],

    loadForOrder: async (orderId: string) => {
      set({ status: 'loading', error: null });
      try {
        const notes = await orderNotesService.fetchNotes(orderId);
        set((state) => ({
          notesByOrder: {
            ...state.notesByOrder,
            [orderId]: notes,
          },
          status: 'success',
          error: null,
        }));
        return notes;
      } catch (err: any) {
        set({ status: 'error', error: err });
        throw err;
      }
    },

    addNote: async (orderId: string, text: string) => {
      set({ status: 'loading', error: null });
      try {
        await orderNotesService.addOrEditNote({ orderId, text });
        await get().loadForOrder(orderId);
        set({ status: 'success', error: null });
      } catch (err: any) {
        set({ status: 'error', error: err });
        throw err;
      }
    },

    editNote: async (orderId: string, noteId: string, text: string) => {
      set({ status: 'loading', error: null });
      try {
        await orderNotesService.addOrEditNote({ orderId, text, noteId });
        await get().loadForOrder(orderId);
        set({ status: 'success', error: null });
      } catch (err: any) {
        set({ status: 'error', error: err });
        throw err;
      }
    },

    reset: () => {
      set({
        notesByOrder: {},
        quickChips: [...QUICK_NOTE_CHIPS],
        status: 'idle',
        error: null,
      });
    },
  };
});
