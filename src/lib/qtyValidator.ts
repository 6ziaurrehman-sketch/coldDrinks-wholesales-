import { QtyValidation } from '@/types/productDetail.types';

export function validateQty(
  qty: number,
  min: number,
  max: number,
  multiple: number,
  bulkTiers?: { minQty: number; price: number }[]
): QtyValidation {
  if (qty === 0 || isNaN(qty) || qty < 0) {
    return { valid: false, message: 'Invalid quantity', adjustedQty: min > 0 ? min : 1 };
  }
  if (max > 0 && max < min) {
    return { valid: false, message: 'Invalid constraints', adjustedQty: min };
  }
  if (qty < min) {
    return { valid: false, message: `Minimum quantity is ${min}`, adjustedQty: min };
  }
  if (max > 0 && qty > max) {
    return { valid: false, message: `Maximum quantity is ${max}`, adjustedQty: max };
  }
  if (multiple > 1 && qty % multiple !== 0) {
    const adjusted = Math.round(qty / multiple) * multiple;
    const finalAdjusted = adjusted < min ? min : (max > 0 && adjusted > max ? max - (max % multiple) : adjusted);
    return { valid: false, message: `Must be multiple of ${multiple}`, adjustedQty: finalAdjusted };
  }
  return { valid: true, message: null, adjustedQty: qty };
}
