import type { ShopRole } from '@/types/database.types';

export type AppPermission =
  | 'edit_shop_profile'
  | 'manage_staff'
  | 'set_approval_threshold'
  | 'view_credit'
  | 'view_payments'
  | 'view_statements'
  | 'place_order'
  | 'view_all_orders'
  | 'view_own_orders'
  | 'request_return';

/**
 * Single source of truth for Role-Based Access Control (RBAC)
 * - Owner: full edit, invite/remove staff, set role, approval threshold, credit, payments, orders
 * - Manager: place/view orders, request returns, strictly NO credit/payments/statements
 * - Staff: place orders and view ONLY own orders
 */
export const ROLE_PERMISSIONS: Record<ShopRole, readonly AppPermission[]> = {
  owner: [
    'edit_shop_profile',
    'manage_staff',
    'set_approval_threshold',
    'view_credit',
    'view_payments',
    'view_statements',
    'place_order',
    'view_all_orders',
    'view_own_orders',
    'request_return',
  ],
  manager: [
    'place_order',
    'view_all_orders',
    'view_own_orders',
    'request_return',
  ],
  staff: [
    'place_order',
    'view_own_orders',
  ],
};

/**
 * Core permission check helper shared across UI and state store
 */
export function can(role: ShopRole | null | undefined, permission: AppPermission): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  return permissions.includes(permission);
}
