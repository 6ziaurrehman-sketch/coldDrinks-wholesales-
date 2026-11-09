import type { OrderSummaryItem, OrderStatus, DeliveryStatus, PaymentStatus } from '@/types/orders.types';

export const ORDER_LIFECYCLE_STEPS: OrderStatus[] = [
  'placed',
  'confirmed',
  'processing',
  'ready',
  'out_for_delivery',
  'delivered',
];

export const STEP_LABELS: Record<string, string> = {
  placed: 'Placed',
  confirmed: 'Confirmed',
  processing: 'Processing',
  ready: 'Ready for Delivery',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  partially_delivered: 'Partially Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

/**
 * Calculates urgency rank for ordering active orders.
 * Lower number = higher urgency.
 */
export function getOrderUrgencyRank(order: OrderSummaryItem): number {
  // 0: Delivery failed - requires urgent resolution (reschedule or cancel)
  if (order.deliveryStatus === 'failed') return 0;
  // 1: Out for delivery - en route to shop right now
  if (order.orderStatus === 'out_for_delivery' || order.deliveryStatus === 'out_for_delivery') return 1;
  // 2: Ready for delivery - staged for dispatch
  if (order.orderStatus === 'ready') return 2;
  // 3: Processing - warehouse picking / packing
  if (order.orderStatus === 'processing') return 3;
  // 4: Confirmed - accepted by wholesale supplier
  if (order.orderStatus === 'confirmed') return 4;
  // 5: Placed - freshly submitted
  if (order.orderStatus === 'placed') return 5;
  // 6: Other states
  return 6;
}

/**
 * Sorts active orders by urgency:
 * 1. Urgency rank (failed > out_for_delivery > ready > processing > confirmed > placed)
 * 2. Sooner delivery ETA
 * 3. Newest order created
 */
export function sortOrdersByUrgency(orders: OrderSummaryItem[]): OrderSummaryItem[] {
  return [...orders].sort((a, b) => {
    const rankA = getOrderUrgencyRank(a);
    const rankB = getOrderUrgencyRank(b);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // Tie breaker 1: delivery ETA
    if (a.deliveryEta && b.deliveryEta) {
      const etaA = new Date(a.deliveryEta).getTime();
      const etaB = new Date(b.deliveryEta).getTime();
      if (etaA !== etaB) return etaA - etaB;
    } else if (a.deliveryEta && !b.deliveryEta) {
      return -1;
    } else if (!a.deliveryEta && b.deliveryEta) {
      return 1;
    }

    // Tie breaker 2: newest created order first
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeB - timeA;
  });
}

/**
 * Formats screen reader accessibility label for timeline steps.
 * e.g., 'Step 3 of 6, Processing, current'
 */
export function formatStepA11yLabel(
  stepNumber: number,
  totalSteps: number,
  stepLabel: string,
  state: 'current' | 'completed' | 'pending',
): string {
  return `Step ${stepNumber} of ${totalSteps}, ${stepLabel}, ${state}`;
}

export function getOrderStatusTone(status: OrderStatus): 'primary' | 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'confirmed':
    case 'ready':
    case 'out_for_delivery':
      return 'primary';
    case 'delivered':
      return 'success';
    case 'cancelled':
    case 'rejected':
      return 'error';
    case 'partially_delivered':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function getPaymentStatusTone(status: PaymentStatus): 'primary' | 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'proof_submitted':
      return 'primary';
    case 'partially_paid':
      return 'warning';
    case 'refunded':
      return 'neutral';
    default:
      return 'warning';
  }
}

export function getDeliveryStatusTone(status: DeliveryStatus): 'primary' | 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'out_for_delivery':
      return 'primary';
    case 'delivered':
      return 'success';
    case 'failed':
      return 'error';
    case 'rescheduled':
      return 'warning';
    default:
      return 'neutral';
  }
}
