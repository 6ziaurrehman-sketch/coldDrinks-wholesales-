import { Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '@/lib/supabase';
import type {
  BusinessHoursConfig,
  BusinessHoursStatus,
  CreateTicketResult,
  SellerContactInfo,
  SupportFaq,
  SupportTicket,
  SupportTicketDetail,
} from '@/types/support.types';

export const DEFAULT_CONTACT_INFO: SellerContactInfo = {
  phone: '+923224644120',
  whatsapp: '+923224644120',
  businessHours: {
    start: '09:00',
    end: '19:00',
    days: [1, 2, 3, 4, 5, 6], // Monday through Saturday
    holidays: ['2026-03-23', '2026-05-01', '2026-08-14', '2026-11-09', '2026-12-25'],
  },
  expectedResponseTime: 'Within 2 business hours',
};

export const STATIC_FAQS: SupportFaq[] = [
  {
    id: 'faq-1',
    category: 'ordering',
    question: 'What is the minimum order quantity for wholesale deliveries?',
    answer: 'The minimum order quantity depends on your delivery zone, typically 10 crates or cartons. Individual variant minimums and case multipliers apply at checkout.',
    sortOrder: 1,
  },
  {
    id: 'faq-2',
    category: 'ordering',
    question: 'How do I reorder items from a past purchase?',
    answer: 'Go to the Orders tab, open any past order or tap the visible "Reorder" button on the order card. Prices and stock will automatically update to current live values.',
    sortOrder: 2,
  },
  {
    id: 'faq-3',
    category: 'delivery',
    question: 'What are your delivery hours and cutoffs?',
    answer: 'Orders placed before 2:00 PM PKT are scheduled for next-morning delivery. You can set your preferred delivery time period (Morning or Afternoon) in Delivery Preferences.',
    sortOrder: 3,
  },
  {
    id: 'faq-4',
    category: 'delivery',
    question: 'Can I change my delivery address after placing an order?',
    answer: 'Addresses cannot be changed once an order is marked Out for Delivery. If your order is in Placed or Confirmed status, please contact seller support immediately.',
    sortOrder: 4,
  },
  {
    id: 'faq-5',
    category: 'payments',
    question: 'What payment methods are supported for wholesale shops?',
    answer: 'We accept Cash on Delivery (COD), Direct Bank Transfer / IBFT with payment slip upload, and 14-day Approved Credit for verified wholesale accounts.',
    sortOrder: 5,
  },
  {
    id: 'faq-6',
    category: 'payments',
    question: 'How does credit limit approval work?',
    answer: 'Shop owners can apply for credit terms. Once approved, your current credit limit and available balance are displayed in the account and checkout screens.',
    sortOrder: 6,
  },
  {
    id: 'faq-7',
    category: 'returns',
    question: 'What is the return policy for damaged or expired bottles?',
    answer: 'Please inspect crates upon arrival. Any broken seals or short-expiry bottles can be reported via a Return Request or Support Ticket within 24 hours of delivery with photo proof.',
    sortOrder: 7,
  },
  {
    id: 'faq-8',
    category: 'account',
    question: 'Can my shop staff place orders without seeing credit or prices?',
    answer: 'Yes! Staff members have restricted access: they can place orders but cannot view credit balances, payment proofs, or shop financial statements.',
    sortOrder: 8,
  },
];

/**
 * Computes live business hours status for Asia/Karachi (UTC+5),
 * accurately handling holidays and overnight shifts across midnight.
 */
export function checkIsOpenNow(
  config: BusinessHoursConfig = DEFAULT_CONTACT_INFO.businessHours,
  overrideNow?: Date,
): BusinessHoursStatus {
  const now = overrideNow || new Date();

  // Convert to Asia/Karachi time components
  // PKT is strictly UTC+5 with no daylight saving time
  const utcMillis = now.getTime() + now.getTimezoneOffset() * 60000;
  const pktDate = new Date(utcMillis + 5 * 3600000);

  const year = pktDate.getFullYear();
  const month = String(pktDate.getMonth() + 1).padStart(2, '0');
  const day = String(pktDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const currentDayOfWeek = pktDate.getDay(); // 0 = Sun, 1 = Mon ...
  const currentMinutes = pktDate.getHours() * 60 + pktDate.getMinutes();

  // Check holiday
  if (config.holidays && config.holidays.includes(dateStr)) {
    return {
      isOpen: false,
      statusText: 'Closed for Public Holiday',
      nextOpenNotice: 'We reopen on the next regular business day at ' + config.start,
      expectedResponseTime: config ? DEFAULT_CONTACT_INFO.expectedResponseTime : 'Within 2 business hours',
    };
  }

  // Check day of week
  const isOperatingDay = config.days.includes(currentDayOfWeek);

  const [startH, startM] = config.start.split(':').map(Number);
  const [endH, endM] = config.end.split(':').map(Number);
  const startMinutes = startH * 60 + (startM || 0);
  const endMinutes = endH * 60 + (endM || 0);

  let inHours = false;

  if (startMinutes <= endMinutes) {
    // Standard daytime shift (e.g. 09:00 - 19:00)
    inHours = isOperatingDay && currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight shift crossing midnight (e.g. 20:00 - 04:00)
    if (currentMinutes >= startMinutes && isOperatingDay) {
      inHours = true;
    } else if (currentMinutes < endMinutes) {
      // Belongs to previous day's shift
      const prevDay = (currentDayOfWeek + 6) % 7;
      inHours = config.days.includes(prevDay);
    }
  }

  if (inHours) {
    return {
      isOpen: true,
      statusText: `Open Now (${config.start} - ${config.end} PKT)`,
      expectedResponseTime: DEFAULT_CONTACT_INFO.expectedResponseTime,
    };
  }

  return {
    isOpen: false,
    statusText: `Currently Closed (Business Hours: ${config.start} - ${config.end} PKT, Mon-Sat)`,
    nextOpenNotice: `Opens at ${config.start} PKT on next business day`,
    expectedResponseTime: DEFAULT_CONTACT_INFO.expectedResponseTime,
  };
}

/**
 * Initiates phone call with clipboard fallback if dialer fails.
 */
export async function initiatePhoneCall(phone: string): Promise<{ success: boolean; copied: boolean }> {
  const clean = phone.replace(/[^+\d]/g, '');
  const url = `tel:${clean}`;
  try {
    const can = await Linking.canOpenURL(url);
    if (can) {
      await Linking.openURL(url);
      return { success: true, copied: false };
    }
  } catch {
    // dialer unavailable
  }

  // Fallback: Copy to clipboard
  try {
    await Clipboard.setStringAsync(phone);
    return { success: false, copied: true };
  } catch {
    return { success: false, copied: false };
  }
}

/**
 * Initiates WhatsApp chat with automatic fallback to wa.me browser link.
 */
export async function initiateWhatsApp(
  whatsapp: string,
  prefillText?: string,
): Promise<{ openedApp: boolean; url: string }> {
  // Strip non-digits (Pakistan country code 92)
  let clean = whatsapp.replace(/\D/g, '');
  if (clean.startsWith('0')) {
    clean = '92' + clean.slice(1);
  }

  const encodedText = prefillText ? encodeURIComponent(prefillText) : '';
  const nativeUrl = `whatsapp://send?phone=${clean}${encodedText ? `&text=${encodedText}` : ''}`;
  const webUrl = `https://wa.me/${clean}${encodedText ? `?text=${encodedText}` : ''}`;

  try {
    const can = await Linking.canOpenURL(nativeUrl);
    if (can) {
      await Linking.openURL(nativeUrl);
      return { openedApp: true, url: nativeUrl };
    }
  } catch {
    // WhatsApp not installed
  }

  // Browser fallback
  await Linking.openURL(webUrl);
  return { openedApp: false, url: webUrl };
}

/**
 * Validates photo attachment (size <= 5MB, jpeg/png/webp only).
 */
export function validateAttachment(file: {
  uri: string;
  name?: string;
  type?: string;
  size?: number;
}): { valid: boolean; error?: string } {
  // 5 MB limit
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size && file.size > MAX_SIZE) {
    return {
      valid: false,
      error: 'Attachment too large. Maximum file size allowed is 5 MB.',
    };
  }

  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const ext = file.uri.split('.').pop()?.toLowerCase();
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];

  const typeValid = file.type ? allowedTypes.includes(file.type.toLowerCase()) : false;
  const extValid = ext ? allowedExtensions.includes(ext) : false;

  if (!typeValid && !extValid) {
    return {
      valid: false,
      error: 'Invalid file type. Only JPEG, PNG, and WebP images are supported.',
    };
  }

  return { valid: true };
}

export const supportService = {
  fetchSellerContact: async (): Promise<SellerContactInfo> => {
    try {
      const { data, error } = await (supabase.rpc as any)('get_seller_contact');
      if (!error && data) {
        const d = data as any;
        return {
          phone: d.phone || DEFAULT_CONTACT_INFO.phone,
          whatsapp: d.whatsapp || DEFAULT_CONTACT_INFO.whatsapp,
          businessHours: {
            start: d.business_hours?.start || DEFAULT_CONTACT_INFO.businessHours.start,
            end: d.business_hours?.end || DEFAULT_CONTACT_INFO.businessHours.end,
            days: d.business_hours?.days || DEFAULT_CONTACT_INFO.businessHours.days,
            holidays: d.business_hours?.holidays || DEFAULT_CONTACT_INFO.businessHours.holidays,
          },
          expectedResponseTime: d.expected_response_time || DEFAULT_CONTACT_INFO.expectedResponseTime,
        };
      }
    } catch {
      // Fallback to default
    }
    return DEFAULT_CONTACT_INFO;
  },

  fetchFaqs: async (category?: string, search?: string): Promise<SupportFaq[]> => {
    try {
      const { data, error } = await (supabase.rpc as any)('list_support_faqs', {
        p_category: category || null,
        p_search: search || null,
      });

      if (!error && data && Array.isArray(data) && data.length > 0) {
        return (data as any[]).map((item: any) => ({
          id: item.id,
          category: item.category,
          question: item.question,
          answer: item.answer,
          sortOrder: item.sort_order,
        }));
      }
    } catch {
      // Fallback to static
    }

    // Static filter fallback
    return STATIC_FAQS.filter((faq) => {
      const matchesCategory = !category || faq.category === category;
      const matchesSearch =
        !search ||
        faq.question.toLowerCase().includes(search.toLowerCase()) ||
        faq.answer.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  },

  createTicket: async (
    shopId: string,
    orderId: string | null | undefined,
    subject: string,
    body: string,
    attachments: string[] = [],
    idempotencyKey?: string,
  ): Promise<CreateTicketResult> => {
    const { data, error } = await (supabase.rpc as any)('create_support_ticket', {
      p_shop_id: shopId,
      p_order_id: orderId || null,
      p_subject: subject,
      p_body: body,
      p_attachments: attachments,
      p_idempotency_key: idempotencyKey || null,
    });

    if (error) {
      throw new Error(error.message);
    }

    const d = data as any;
    return {
      ticketId: d?.ticket_id,
      subject: d?.subject,
      status: d?.status,
      isDuplicate: !!d?.is_duplicate,
    };
  },

  replyTicket: async (
    ticketId: string,
    message: string,
    attachments: string[] = [],
  ): Promise<{ messageId: string; status: string }> => {
    const { data, error } = await (supabase.rpc as any)('reply_support_ticket', {
      p_ticket_id: ticketId,
      p_message: message,
      p_attachments: attachments,
    });

    if (error) {
      throw new Error(error.message);
    }

    const d = data as any;
    return {
      messageId: d?.message_id,
      status: d?.status,
    };
  },

  fetchTickets: async (shopId: string): Promise<SupportTicket[]> => {
    const { data, error } = await (supabase.rpc as any)('list_support_tickets', {
      p_shop_id: shopId,
    });

    if (error) {
      throw new Error(error.message);
    }

    return ((data as any[]) || []).map((t: any) => ({
      id: t.id,
      shopId: t.shop_id,
      orderId: t.order_id,
      orderNumber: t.order_number,
      subject: t.subject,
      body: t.body,
      status: t.status,
      attachments: t.attachments || [],
      messageCount: Number(t.message_count || 1),
      lastMessage: t.last_message,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));
  },

  fetchTicketDetail: async (ticketId: string): Promise<SupportTicketDetail> => {
    const { data, error } = await (supabase.rpc as any)('get_support_ticket_detail', {
      p_ticket_id: ticketId,
    });

    if (error) {
      throw new Error(error.message);
    }

    const d = data as any;
    return {
      id: d.id,
      shopId: d.shop_id,
      orderId: d.order_id,
      orderNumber: d.order_number,
      subject: d.subject,
      body: d.body,
      status: d.status,
      attachments: d.attachments || [],
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      messages: ((d.messages as any[]) || []).map((m: any) => ({
        id: m.id,
        ticketId: m.ticket_id,
        senderId: m.sender_id,
        senderRole: m.sender_role,
        message: m.message,
        attachments: m.attachments || [],
        createdAt: m.created_at,
      })),
    };
  },
};
