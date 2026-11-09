export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved';

export interface BusinessHoursConfig {
  start: string; // e.g. "09:00"
  end: string;   // e.g. "19:00"
  days: number[]; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  holidays: string[]; // YYYY-MM-DD strings in Asia/Karachi
}

export interface SellerContactInfo {
  phone: string;
  whatsapp: string;
  businessHours: BusinessHoursConfig;
  expectedResponseTime: string;
}

export interface SupportTicket {
  id: string;
  shopId: string;
  orderId?: string | null;
  orderNumber?: string | null;
  subject: string;
  body: string;
  status: SupportTicketStatus;
  attachments: string[];
  messageCount?: number;
  lastMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId?: string | null;
  senderRole: 'customer' | 'seller';
  message: string;
  attachments: string[];
  createdAt: string;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: TicketMessage[];
}

export interface SupportFaq {
  id: string;
  category: 'ordering' | 'delivery' | 'payments' | 'account' | 'returns';
  question: string;
  answer: string;
  sortOrder: number;
}

export interface BusinessHoursStatus {
  isOpen: boolean;
  statusText: string;
  nextOpenNotice?: string;
  expectedResponseTime: string;
}

export interface DraftTicket {
  shopId: string;
  orderId?: string | null;
  orderNumber?: string | null;
  subject: string;
  body: string;
  attachments: string[];
  isDraft: boolean;
  savedAt: string;
}

export interface CreateTicketResult {
  ticketId: string;
  subject: string;
  status: SupportTicketStatus;
  isDuplicate: boolean;
}
