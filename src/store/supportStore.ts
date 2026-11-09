import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_CONTACT_INFO,
  STATIC_FAQS,
  supportService,
} from '@/lib/supportService';
import type {
  DraftTicket,
  SellerContactInfo,
  SupportFaq,
  SupportTicket,
  SupportTicketDetail,
  TicketMessage,
} from '@/types/support.types';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface SupportState {
  contactInfo: SellerContactInfo;
  tickets: SupportTicket[];
  selectedTicket: SupportTicketDetail | null;
  faqs: SupportFaq[];
  faqCategory: string | null;
  faqSearch: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  error: string | null;
  draftTicket: DraftTicket | null;
  realtimeChannel: RealtimeChannel | null;

  // Actions
  loadContact: () => Promise<void>;
  loadFaqs: (search?: string, category?: string) => Promise<void>;
  setFaqFilter: (category: string | null, search?: string) => void;
  loadTickets: (shopId: string) => Promise<void>;
  loadTicket: (ticketId: string) => Promise<void>;
  createTicket: (
    shopId: string,
    orderId: string | null | undefined,
    subject: string,
    body: string,
    attachments?: string[],
    idempotencyKey?: string,
  ) => Promise<{ ticketId: string; isDuplicate: boolean }>;
  reply: (
    ticketId: string,
    message: string,
    attachments?: string[],
  ) => Promise<void>;
  saveDraft: (draft: DraftTicket) => void;
  clearDraft: () => void;
  subscribe: (shopId: string) => void;
  unsubscribe: () => void;
  reset: () => void;
}

export const useSupportStore = create<SupportState>((set, get) => ({
  contactInfo: DEFAULT_CONTACT_INFO,
  tickets: [],
  selectedTicket: null,
  faqs: STATIC_FAQS,
  faqCategory: null,
  faqSearch: '',
  status: 'idle',
  error: null,
  draftTicket: null,
  realtimeChannel: null,

  loadContact: async () => {
    try {
      const contact = await supportService.fetchSellerContact();
      set({ contactInfo: contact });
    } catch {
      set({ contactInfo: DEFAULT_CONTACT_INFO });
    }
  },

  loadFaqs: async (search?: string, category?: string) => {
    const s = search ?? get().faqSearch;
    const c = category ?? (get().faqCategory || undefined);
    try {
      const faqs = await supportService.fetchFaqs(c, s);
      set({ faqs });
    } catch {
      set({ faqs: STATIC_FAQS });
    }
  },

  setFaqFilter: (category: string | null, search?: string) => {
    const s = search !== undefined ? search : get().faqSearch;
    set({ faqCategory: category, faqSearch: s });
    void get().loadFaqs(s, category || undefined);
  },

  loadTickets: async (shopId: string) => {
    if (!shopId) return;
    set({ status: 'loading', error: null });
    try {
      const tickets = await supportService.fetchTickets(shopId);
      set({ tickets, status: 'success' });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load support tickets' });
    }
  },

  loadTicket: async (ticketId: string) => {
    if (!ticketId) return;
    set({ status: 'loading', error: null });
    try {
      const detail = await supportService.fetchTicketDetail(ticketId);
      set({ selectedTicket: detail, status: 'success' });
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to load ticket detail' });
    }
  },

  createTicket: async (
    shopId: string,
    orderId: string | null | undefined,
    subject: string,
    body: string,
    attachments: string[] = [],
    idempotencyKey?: string,
  ) => {
    set({ status: 'loading', error: null });
    try {
      const result = await supportService.createTicket(
        shopId,
        orderId,
        subject,
        body,
        attachments,
        idempotencyKey,
      );

      // Clear draft on successful ticket creation
      set({ draftTicket: null, status: 'success' });

      // Refresh tickets list
      void get().loadTickets(shopId);

      return { ticketId: result.ticketId, isDuplicate: result.isDuplicate };
    } catch (err: any) {
      set({ status: 'error', error: err.message || 'Failed to submit support ticket' });
      throw err;
    }
  },

  reply: async (ticketId: string, message: string, attachments: string[] = []) => {
    const currentTicket = get().selectedTicket;
    if (!currentTicket) return;

    // Optimistic message append
    const tempMessage: TicketMessage = {
      id: 'temp-' + Date.now(),
      ticketId,
      senderRole: 'customer',
      message,
      attachments,
      createdAt: new Date().toISOString(),
    };

    set({
      selectedTicket: {
        ...currentTicket,
        status: currentTicket.status === 'resolved' ? 'in_progress' : currentTicket.status,
        messages: [...currentTicket.messages, tempMessage],
      },
    });

    try {
      const res = await supportService.replyTicket(ticketId, message, attachments);
      // Replace temp message with server state
      set((state) => {
        if (!state.selectedTicket || state.selectedTicket.id !== ticketId) return {};
        const msgs = state.selectedTicket.messages.map((m) =>
          m.id === tempMessage.id ? { ...m, id: res.messageId } : m,
        );
        return {
          selectedTicket: {
            ...state.selectedTicket,
            status: res.status as any,
            messages: msgs,
          },
        };
      });
    } catch (err: any) {
      // Rollback on failure
      set({ selectedTicket: currentTicket, error: err.message });
      throw err;
    }
  },

  saveDraft: (draft: DraftTicket) => {
    set({ draftTicket: draft });
  },

  clearDraft: () => {
    set({ draftTicket: null });
  },

  subscribe: (shopId: string) => {
    const existing = get().realtimeChannel;
    if (existing) {
      void supabase.removeChannel(existing);
    }

    const channel = supabase
      .channel(`support_shop_${shopId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_tickets',
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          void get().loadTickets(shopId);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_messages',
        },
        (payload: any) => {
          const selected = get().selectedTicket;
          if (selected && payload.new?.ticket_id === selected.id) {
            void get().loadTicket(selected.id);
          }
        },
      )
      .subscribe();

    set({ realtimeChannel: channel });
  },

  unsubscribe: () => {
    const ch = get().realtimeChannel;
    if (ch) {
      void supabase.removeChannel(ch);
      set({ realtimeChannel: null });
    }
  },

  reset: () => {
    get().unsubscribe();
    set({
      tickets: [],
      selectedTicket: null,
      faqs: STATIC_FAQS,
      faqCategory: null,
      faqSearch: '',
      status: 'idle',
      error: null,
      draftTicket: null,
    });
  },
}));
