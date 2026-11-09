import { supabase } from '@/lib/supabase';
import { appStorage } from '@/lib/storage';

const DISMISSED_ORDERS_KEY = '@cold_drinks_dismissed_feedback_orders';

export const feedbackService = {
  /**
   * Submit post-delivery feedback
   */
  async submitFeedback(
    orderId: string,
    deliveryRating: number,
    serviceRating: number,
    comments?: string,
  ): Promise<void> {
    if (deliveryRating < 1 || deliveryRating > 5 || serviceRating < 1 || serviceRating > 5) {
      throw new Error('INVALID_RATING: Ratings must be between 1 and 5.');
    }

    const sanitizedComments = (comments || '').trim().slice(0, 500);

    const { error } = await (supabase as any).rpc('submit_order_feedback', {
      p_order_id: orderId,
      p_delivery_rating: deliveryRating,
      p_service_rating: serviceRating,
      p_comments: sanitizedComments || null,
    });

    if (error) {
      if (error.message?.includes('ALREADY_REVIEWED')) {
        throw new Error('ALREADY_REVIEWED');
      }
      throw new Error(error.message || 'Failed to submit feedback.');
    }

    // Mark as permanently dismissed locally too
    await feedbackService.dismissPrompt(orderId);
  },

  /**
   * Permanently dismiss feedback prompt for an order
   */
  async dismissPrompt(orderId: string): Promise<void> {
    try {
      const stored = await appStorage.getItem(DISMISSED_ORDERS_KEY);
      const list: string[] = stored ? JSON.parse(stored) : [];
      if (!list.includes(orderId)) {
        list.push(orderId);
        await appStorage.setItem(DISMISSED_ORDERS_KEY, JSON.stringify(list));
      }
    } catch (e) {
      console.warn('[FeedbackService] dismiss error:', e);
    }
  },

  /**
   * Check if order prompt was dismissed
   */
  async isDismissed(orderId: string): Promise<boolean> {
    try {
      const stored = await appStorage.getItem(DISMISSED_ORDERS_KEY);
      if (!stored) return false;
      const list: string[] = JSON.parse(stored);
      return list.includes(orderId);
    } catch {
      return false;
    }
  },

  /**
   * Checks if an order is eligible for feedback:
   * - Must be delivered or partially_delivered
   * - Not delivered more than 14 days ago
   */
  isEligibleForFeedback(order: { id: string; status: string; deliveredAt?: string | null; createdAt?: string }): boolean {
    if (!['delivered', 'partially_delivered'].includes(order.status)) {
      return false;
    }

    const deliveredDate = order.deliveredAt ? new Date(order.deliveredAt) : new Date(order.createdAt || Date.now());
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return deliveredDate.getTime() >= fourteenDaysAgo;
  },
};
