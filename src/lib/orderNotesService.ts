import { supabase } from '@/lib/supabase';
import { mapSupabaseError, AppError } from '@/lib/errors';
import type { OrderNote } from '@/types/notes.types';

export class OrderNotesService {
  /**
   * Fetch notes for an order
   */
  async fetchNotes(orderId: string): Promise<OrderNote[]> {
    try {
      const { data, error } = await (supabase as any)
        .from('order_notes')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map((row: any) => ({
        id: row.id,
        orderId: row.order_id,
        userId: row.user_id,
        authorRole: row.author_role || 'staff',
        text: row.text,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'fetchNotes' });
    }
  }

  /**
   * Add or edit order note with length limit and locked-status rejection
   */
  async addOrEditNote(params: {
    orderId: string;
    text: string;
    noteId?: string;
  }): Promise<{ noteId: string; text: string }> {
    const cleanText = params.text.replace(/[\x00-\x1F\x7F]/g, '').trim();

    if (!cleanText) {
      throw new AppError({
        code: 'EMPTY_NOTE',
        message: 'Order note cannot be empty.',
      });
    }

    if (cleanText.length > 500) {
      throw new AppError({
        code: 'NOTE_TOO_LONG',
        message: 'Note exceeds maximum limit of 500 characters.',
      });
    }

    try {
      const { data, error } = await (supabase.rpc as any)('add_or_edit_note', {
        p_order_id: params.orderId,
        p_text: cleanText,
        p_note_id: params.noteId || null,
      });

      if (error) throw error;
      const res = data as any;

      return {
        noteId: res.noteId,
        text: res.text,
      };
    } catch (err) {
      throw mapSupabaseError(err, { actionName: 'addOrEditNote', isWrite: true });
    }
  }
}

export const orderNotesService = new OrderNotesService();
