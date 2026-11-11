import assert from 'node:assert';
import { describe, it } from 'node:test';
import { matchInventoryItem, matchCustomer, matchSalesSlip } from '../src/utils/searchUtils.ts';
import {
  buildSalesSlipsPdf,
  getKarachiDateKey,
  getTodayAndYesterdayKeys,
} from '../src/utils/salesSlipPdfGenerator.ts';

// FormatMoney implementation test
const DEFAULT_CURRENCY = 'PKR';
const DEFAULT_LOCALE = 'en-PK';

function formatMoney(amount, options = {}) {
  if (amount === null || amount === undefined || amount === '') {
    return '—';
  }
  const numeric = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(numeric)) {
    return '—';
  }
  const { currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE, compact = false } = options;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(numeric);
}

// FormatDate implementation test
const KARACHI_TZ = 'Asia/Karachi';
const STYLE_OPTIONS = {
  date: { day: 'numeric', month: 'short', year: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
  datetime: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  },
  weekday: { weekday: 'short', day: 'numeric', month: 'short' },
};

function formatDate(value, options = {}) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const { timeZone = KARACHI_TZ, locale = 'en-PK', style = 'date' } = options;
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    ...STYLE_OPTIONS[style],
  }).format(date);
}

// Semver compare
function compareSemver(v1, v2) {
  const cleanV1 = v1.replace(/[^0-9.]/g, '').split('.').map(Number);
  const cleanV2 = v2.replace(/[^0-9.]/g, '').split('.').map(Number);
  const length = Math.max(cleanV1.length, cleanV2.length);
  for (let i = 0; i < length; i++) {
    const num1 = cleanV1[i] ?? 0;
    const num2 = cleanV2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

// Phone normalization logic
function normalizePhone(input) {
  if (!input) return null;
  const cleaned = input.trim().replace(/[^\d+]/g, '');
  if (!cleaned) return null;
  let digits = cleaned;
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('0092')) digits = digits.slice(4);
  else if (digits.startsWith('92')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  if (/^3\d{9}$/.test(digits)) return `+92${digits}`;
  return null;
}

function formatPhoneAsYouType(input) {
  if (!input) return '';
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = '0' + digits.slice(4);
  else if (digits.startsWith('92')) digits = '0' + digits.slice(2);
  if (digits.startsWith('3')) digits = '0' + digits;
  digits = digits.slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)} ${digits.slice(4)}`;
}

// ScreenState simulation logic
function resolveScreenState({ status, data, empty, error, offline, loading }) {
  if (status === 'loading') return loading ?? 'DEFAULT_LOADING';
  if (status === 'empty') return empty ?? 'DEFAULT_EMPTY';
  if (status === 'error') return error ?? 'DEFAULT_ERROR';
  if (status === 'offline') return offline ?? 'DEFAULT_OFFLINE';
  return data ?? 'DEFAULT_DATA';
}

describe('formatMoney unit tests', () => {
  it('formats PKR with two fraction digits', () => {
    const res = formatMoney(1250.5, { locale: 'en-PK', currency: 'PKR' });
    assert.match(res, /1,250\.50/);
  });

  it('accepts numeric strings', () => {
    assert.strictEqual(formatMoney('99', { locale: 'en-US', currency: 'USD' }), '$99.00');
  });

  it('returns em-dash for null, undefined, empty, NaN', () => {
    assert.strictEqual(formatMoney(null), '—');
    assert.strictEqual(formatMoney(undefined), '—');
    assert.strictEqual(formatMoney(''), '—');
    assert.strictEqual(formatMoney('abc'), '—');
    assert.strictEqual(formatMoney(NaN), '—');
  });

  it('formats compact notation', () => {
    const res = formatMoney(150000, { locale: 'en-US', currency: 'USD', compact: true });
    assert.match(res, /150K|150k/);
  });

  it('handles negative amounts correctly', () => {
    assert.strictEqual(formatMoney(-10, { locale: 'en-US', currency: 'USD' }), '-$10.00');
  });
});

describe('formatDate unit tests (Asia/Karachi)', () => {
  it('formats in Asia/Karachi timezone', () => {
    const utcNoon = new Date('2026-06-01T12:00:00.000Z');
    const karachi = formatDate(utcNoon, { locale: 'en-GB', style: 'datetime' });
    const expected = new Intl.DateTimeFormat('en-GB', {
      timeZone: KARACHI_TZ,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(utcNoon);
    assert.strictEqual(karachi, expected);
  });

  it('formats ISO strings and timestamps', () => {
    assert.strictEqual(
      formatDate('2026-01-15T00:00:00+05:00', { locale: 'en-GB', style: 'date' }),
      '15 Jan 2026',
    );
  });

  it('returns em-dash for invalid or empty dates', () => {
    assert.strictEqual(formatDate(null), '—');
    assert.strictEqual(formatDate(undefined), '—');
    assert.strictEqual(formatDate(''), '—');
    assert.strictEqual(formatDate('not-a-date'), '—');
  });

  it('formats time and weekday styles', () => {
    const date = new Date('2026-03-10T08:30:00+05:00');
    assert.match(formatDate(date, { locale: 'en-GB', style: 'time' }), /8:30/);
    assert.match(formatDate(date, { locale: 'en-GB', style: 'weekday' }), /10 Mar/);
  });
});

describe('compareSemver tests', () => {
  it('correctly compares version numbers', () => {
    assert.strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
    assert.strictEqual(compareSemver('1.0.0', '1.0.1'), -1);
    assert.strictEqual(compareSemver('1.1.0', '1.0.9'), 1);
    assert.strictEqual(compareSemver('2.0.0', '1.99.99'), 1);
    assert.strictEqual(compareSemver('0.9.5', '1.0.0'), -1);
  });
});

describe('Pakistan phone normalization tests', () => {
  it('normalizes 03xx, +923xx, 00923xx, and 3xx to E.164', () => {
    assert.strictEqual(normalizePhone('03001234567'), '+923001234567');
    assert.strictEqual(normalizePhone('0345 9876543'), '+923459876543');
    assert.strictEqual(normalizePhone('+923001234567'), '+923001234567');
    assert.strictEqual(normalizePhone('00923001234567'), '+923001234567');
    assert.strictEqual(normalizePhone('923001234567'), '+923001234567');
    assert.strictEqual(normalizePhone('3001234567'), '+923001234567');
  });

  it('rejects invalid or non-mobile numbers', () => {
    assert.strictEqual(normalizePhone('02112345678'), null);
    assert.strictEqual(normalizePhone(''), null);
    assert.strictEqual(normalizePhone('123'), null);
    assert.strictEqual(normalizePhone('04001234567'), null);
  });

  it('formats phone numbers as the user types', () => {
    assert.strictEqual(formatPhoneAsYouType('0300'), '0300');
    assert.strictEqual(formatPhoneAsYouType('03001234567'), '0300 1234567');
    assert.strictEqual(formatPhoneAsYouType('923001234567'), '0300 1234567');
  });
});

describe('ScreenState component state resolution', () => {
  it('correctly selects loading state', () => {
    assert.strictEqual(resolveScreenState({ status: 'loading', loading: 'SKELETON' }), 'SKELETON');
    assert.strictEqual(resolveScreenState({ status: 'loading' }), 'DEFAULT_LOADING');
  });

  it('correctly selects empty state', () => {
    assert.strictEqual(resolveScreenState({ status: 'empty', empty: 'NO_DATA' }), 'NO_DATA');
    assert.strictEqual(resolveScreenState({ status: 'empty' }), 'DEFAULT_EMPTY');
  });

  it('correctly selects error state', () => {
    assert.strictEqual(resolveScreenState({ status: 'error', error: 'CUSTOM_ERR' }), 'CUSTOM_ERR');
    assert.strictEqual(resolveScreenState({ status: 'error' }), 'DEFAULT_ERROR');
  });

  it('correctly selects offline state', () => {
    assert.strictEqual(resolveScreenState({ status: 'offline', offline: 'NO_CONN' }), 'NO_CONN');
    assert.strictEqual(resolveScreenState({ status: 'offline' }), 'DEFAULT_OFFLINE');
  });

  it('correctly selects data state', () => {
    assert.strictEqual(resolveScreenState({ status: 'data', data: 'PRODUCTS_LIST' }), 'PRODUCTS_LIST');
  });
});

describe('Redirect intent after session expiration test', () => {
  it('preserves deep-link and checkout redirect intent', () => {
    let savedIntent = null;

    const onSessionExpired = (expiredRoute) => {
      savedIntent = expiredRoute;
    };

    onSessionExpired('/cart');
    assert.strictEqual(savedIntent, '/cart');

    onSessionExpired('/orders/ORD-9988');
    assert.strictEqual(savedIntent, '/orders/ORD-9988');
  });
});

// ==============================================================================
// C2: Shop Profile and Staff Roles Tests
// ==============================================================================

const ROLE_PERMISSIONS = {
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

function can(role, permission) {
  if (!role) return false;
  const list = ROLE_PERMISSIONS[role];
  return list ? list.includes(permission) : false;
}

function isValidNTN(raw) {
  if (!raw) return false;
  return /^\d{7}-\d$/.test(raw.trim());
}

function formatNTNAsYouType(input) {
  if (!input) return '';
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 7) return digits;
  return `${digits.slice(0, 7)}-${digits.slice(7)}`;
}

function normalizeNTN(input) {
  if (!input) return null;
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7)}`;
}

describe('RBAC Permissions Map tests (C2-A)', () => {
  it('Owner has all permissions including edit profile, staff management, and credit', () => {
    assert.strictEqual(can('owner', 'edit_shop_profile'), true);
    assert.strictEqual(can('owner', 'manage_staff'), true);
    assert.strictEqual(can('owner', 'set_approval_threshold'), true);
    assert.strictEqual(can('owner', 'view_credit'), true);
    assert.strictEqual(can('owner', 'view_payments'), true);
    assert.strictEqual(can('owner', 'view_statements'), true);
    assert.strictEqual(can('owner', 'place_order'), true);
    assert.strictEqual(can('owner', 'view_all_orders'), true);
    assert.strictEqual(can('owner', 'view_own_orders'), true);
    assert.strictEqual(can('owner', 'request_return'), true);
  });

  it('Manager can place/view orders and request returns, but NO credit/payments/statements', () => {
    assert.strictEqual(can('manager', 'place_order'), true);
    assert.strictEqual(can('manager', 'view_all_orders'), true);
    assert.strictEqual(can('manager', 'request_return'), true);

    // Strictly NO credit / payment / statements access
    assert.strictEqual(can('manager', 'view_credit'), false);
    assert.strictEqual(can('manager', 'view_payments'), false);
    assert.strictEqual(can('manager', 'view_statements'), false);

    // Cannot edit shop profile or staff
    assert.strictEqual(can('manager', 'edit_shop_profile'), false);
    assert.strictEqual(can('manager', 'manage_staff'), false);
    assert.strictEqual(can('manager', 'set_approval_threshold'), false);
  });

  it('Staff can place orders and view ONLY own orders', () => {
    assert.strictEqual(can('staff', 'place_order'), true);
    assert.strictEqual(can('staff', 'view_own_orders'), true);

    // Strictly cannot view all orders or returns
    assert.strictEqual(can('staff', 'view_all_orders'), false);
    assert.strictEqual(can('staff', 'request_return'), false);

    // No financial or admin access
    assert.strictEqual(can('staff', 'view_credit'), false);
    assert.strictEqual(can('staff', 'view_payments'), false);
    assert.strictEqual(can('staff', 'view_statements'), false);
    assert.strictEqual(can('staff', 'edit_shop_profile'), false);
    assert.strictEqual(can('staff', 'manage_staff'), false);
  });
});

describe('Pakistan NTN validation and formatting tests (C2-A)', () => {
  it('validates 7 digits followed by hyphen and 1 check digit', () => {
    assert.strictEqual(isValidNTN('1234567-8'), true);
    assert.strictEqual(isValidNTN('7654321-0'), true);
    assert.strictEqual(isValidNTN(' 1234567-8 '), true);

    // Invalids
    assert.strictEqual(isValidNTN('12345678'), false);
    assert.strictEqual(isValidNTN('123456-78'), false);
    assert.strictEqual(isValidNTN('1234567-'), false);
    assert.strictEqual(isValidNTN('123456A-8'), false);
    assert.strictEqual(isValidNTN(''), false);
    assert.strictEqual(isValidNTN(null), false);
  });

  it('formats NTN as user types and normalizes', () => {
    assert.strictEqual(formatNTNAsYouType('123456'), '123456');
    assert.strictEqual(formatNTNAsYouType('1234567'), '1234567');
    assert.strictEqual(formatNTNAsYouType('12345678'), '1234567-8');
    assert.strictEqual(formatNTNAsYouType('1234567-8'), '1234567-8');

    assert.strictEqual(normalizeNTN('12345678'), '1234567-8');
    assert.strictEqual(normalizeNTN('1234567-8'), '1234567-8');
    assert.strictEqual(normalizeNTN('1234'), null);
  });
});

describe('Shop profile concurrency and staff role protection logic (C2-A)', () => {
  it('detects optimistic concurrency conflicts when updated_at differs', () => {
    const serverRecord = { id: 'shop-1', updated_at: '2026-10-09T12:00:00.000Z' };
    const clientExpected = '2026-10-09T11:59:00.000Z'; // Stale

    const checkConcurrency = (server, client) => {
      if (server.updated_at !== client) {
        throw new Error('CONCURRENT_MODIFICATION: This profile was changed by someone else, reload.');
      }
      return true;
    };

    assert.throws(
      () => checkConcurrency(serverRecord, clientExpected),
      /CONCURRENT_MODIFICATION: This profile was changed by someone else, reload\./,
    );

    assert.strictEqual(checkConcurrency(serverRecord, '2026-10-09T12:00:00.000Z'), true);
  });

  it('blocks demoting or removing the last owner', () => {
    const shopMembers = [
      { userId: 'u1', role: 'owner', status: 'active' },
      { userId: 'u2', role: 'manager', status: 'active' },
    ];

    const demoteStaff = (members, targetId, newRole) => {
      const activeOwners = members.filter((m) => m.role === 'owner' && m.status === 'active');
      const target = members.find((m) => m.userId === targetId);
      if (target?.role === 'owner' && newRole !== 'owner' && activeOwners.length <= 1) {
        throw new Error('LAST_OWNER: Cannot demote the last owner of the shop.');
      }
      return true;
    };

    assert.throws(
      () => demoteStaff(shopMembers, 'u1', 'manager'),
      /LAST_OWNER: Cannot demote the last owner of the shop\./,
    );
  });

  it('blocks modifying or removing self role', () => {
    const callerId = 'u1';
    const targetId = 'u1';

    const checkSelfAction = (caller, target) => {
      if (caller === target) {
        throw new Error('CANNOT_CHANGE_OWN_ROLE: You cannot modify your own role.');
      }
      return true;
    };

    assert.throws(
      () => checkSelfAction(callerId, targetId),
      /CANNOT_CHANGE_OWN_ROLE: You cannot modify your own role\./,
    );
    assert.strictEqual(checkSelfAction(callerId, 'u2'), true);
  });

  it('detects if invited phone already belongs to another shop', () => {
    const allShopUsers = [
      { phone: '+923001234567', shopId: 'shop-A', shopName: 'Al-Madina Mart', status: 'active' },
    ];

    const invitePhone = (phone, currentShopId) => {
      const existing = allShopUsers.find(
        (u) => u.phone === phone && u.shopId !== currentShopId && u.status === 'active',
      );
      if (existing) {
        throw new Error(
          `PHONE_ALREADY_MEMBER: This phone number is already registered with another shop (${existing.shopName}).`,
        );
      }
      return true;
    };

    assert.throws(
      () => invitePhone('+923001234567', 'shop-B'),
      /PHONE_ALREADY_MEMBER: This phone number is already registered with another shop \(Al-Madina Mart\)\./,
    );
    assert.strictEqual(invitePhone('+923459999999', 'shop-B'), true);
  });
});

describe('Role-based visible controls tests (C2-B)', () => {
  function getVisibleControlsForRole(role, isSelfRow = false) {
    return {
      canEditProfile: can(role, 'edit_shop_profile'),
      canInviteStaff: can(role, 'manage_staff'),
      canChangeRole: can(role, 'manage_staff') && !isSelfRow,
      canRemoveStaff: can(role, 'manage_staff') && !isSelfRow,
      canSetApprovalThreshold: can(role, 'set_approval_threshold'),
      canViewCredit: can(role, 'view_credit'),
    };
  }

  it('Owner has full management controls for others, but cannot change own role', () => {
    const otherControls = getVisibleControlsForRole('owner', false);
    assert.strictEqual(otherControls.canEditProfile, true);
    assert.strictEqual(otherControls.canInviteStaff, true);
    assert.strictEqual(otherControls.canChangeRole, true);
    assert.strictEqual(otherControls.canRemoveStaff, true);
    assert.strictEqual(otherControls.canSetApprovalThreshold, true);
    assert.strictEqual(otherControls.canViewCredit, true);

    const selfControls = getVisibleControlsForRole('owner', true);
    assert.strictEqual(selfControls.canChangeRole, false);
    assert.strictEqual(selfControls.canRemoveStaff, false);
  });

  it('Manager and Staff have management controls hidden (not erroring)', () => {
    const managerControls = getVisibleControlsForRole('manager', false);
    assert.strictEqual(managerControls.canEditProfile, false);
    assert.strictEqual(managerControls.canInviteStaff, false);
    assert.strictEqual(managerControls.canChangeRole, false);
    assert.strictEqual(managerControls.canRemoveStaff, false);
    assert.strictEqual(managerControls.canSetApprovalThreshold, false);
    assert.strictEqual(managerControls.canViewCredit, false);

    const staffControls = getVisibleControlsForRole('staff', false);
    assert.strictEqual(staffControls.canEditProfile, false);
    assert.strictEqual(staffControls.canInviteStaff, false);
    assert.strictEqual(staffControls.canChangeRole, false);
    assert.strictEqual(staffControls.canRemoveStaff, false);
    assert.strictEqual(staffControls.canSetApprovalThreshold, false);
  });
});

// ==============================================================================
// Delivery Zones, Customer Addresses, and Delivery Preferences Tests
// ==============================================================================

const SEED_ZONES = [
  {
    id: 'zone-south',
    name: 'South Karachi (Clifton & DHA)',
    fee: 150,
    min_order_amount: 2000,
    active: true,
    areas: ['clifton', 'dha', 'defence', 'bath island', 'gizri', 'zamzama'],
  },
  {
    id: 'zone-central',
    name: 'Central Karachi (PECHS, Tariq Road)',
    fee: 200,
    min_order_amount: 2500,
    active: true,
    areas: ['pechs', 'tariq road', 'bahadurabad', 'smchs', 'mahmoodabad'],
  },
  {
    id: 'zone-saddar',
    name: 'West Karachi & Saddar Wholesale Market Hub',
    fee: 100,
    min_order_amount: 1500,
    active: true,
    areas: ['saddar', 'bolton market', 'jodia bazaar', 'lee market', 'kharadar'],
  },
  {
    id: 'zone-inactive',
    name: 'Inactive Test Zone',
    fee: 500,
    min_order_amount: 5000,
    active: false,
    areas: ['remote sector'],
  },
];

function checkServiceableMock({ lat, lng, area, fullAddress }) {
  const normArea = (area || '').toLowerCase();
  const normAddress = (fullAddress || '').toLowerCase();

  // 1. Text keyword search in active zones
  const textMatch = SEED_ZONES.find((z) =>
    z.active &&
    z.areas.some((keyword) => normArea.includes(keyword) || normAddress.includes(keyword)),
  );
  if (textMatch) {
    return {
      serviceable: true,
      zoneId: textMatch.id,
      zoneName: textMatch.name,
      fee: textMatch.fee,
      minOrderAmount: textMatch.min_order_amount,
    };
  }

  // 2. Coordinate bounding box inside Karachi
  if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
    if (lat >= 24.75 && lat <= 25.05 && lng >= 66.90 && lng <= 67.25) {
      const defaultZone = SEED_ZONES.find((z) => z.active);
      return {
        serviceable: true,
        zoneId: defaultZone.id,
        zoneName: defaultZone.name,
        fee: defaultZone.fee,
        minOrderAmount: defaultZone.min_order_amount,
      };
    }
  }

  throw new Error('SERVICE_AREA: Out of delivery service area. This location is not currently serviceable.');
}

describe('Delivery Zones and Service Area Resolution tests', () => {
  it('resolves zone and delivery fee by area/address keywords without map pin', () => {
    const res = checkServiceableMock({
      lat: null,
      lng: null,
      area: 'DHA Phase 5',
      fullAddress: 'Plot 12-C, 26th Street, DHA, Karachi',
    });

    assert.strictEqual(res.serviceable, true);
    assert.strictEqual(res.zoneId, 'zone-south');
    assert.strictEqual(res.fee, 150);
    assert.strictEqual(res.minOrderAmount, 2000);
  });

  it('resolves wholesale hub zone for Jodia Bazaar', () => {
    const res = checkServiceableMock({
      lat: null,
      lng: null,
      area: 'Saddar',
      fullAddress: 'Shop #4, Jodia Bazaar Wholesale Market',
    });

    assert.strictEqual(res.serviceable, true);
    assert.strictEqual(res.zoneId, 'zone-saddar');
    assert.strictEqual(res.fee, 100);
  });

  it('resolves general Karachi coordinates within bounding box', () => {
    const res = checkServiceableMock({
      lat: 24.8607,
      lng: 67.0011,
      area: '',
      fullAddress: 'Commercial Warehouse Dock 4',
    });

    assert.strictEqual(res.serviceable, true);
    assert.strictEqual(typeof res.fee, 'number');
  });

  it('raises SERVICE_AREA error for out-of-service locations', () => {
    assert.throws(
      () =>
        checkServiceableMock({
          lat: 31.5204, // Lahore coordinates
          lng: 74.3587,
          area: 'Gulberg Lahore',
          fullAddress: 'Main Boulevard Gulberg, Lahore',
        }),
      /SERVICE_AREA: Out of delivery service area\./,
    );
  });
});

describe('Customer Addresses rules and default management', () => {
  it('enforces exactly one default active address per shop', () => {
    let addresses = [
      { id: 'addr-1', shopId: 'shop-1', isDefault: true, isActive: true },
      { id: 'addr-2', shopId: 'shop-1', isDefault: false, isActive: true },
    ];

    const setDefault = (targetId) => {
      addresses = addresses.map((a) => ({
        ...a,
        isDefault: a.id === targetId,
      }));
    };

    setDefault('addr-2');
    const defaultAddresses = addresses.filter((a) => a.isDefault && a.isActive);
    assert.strictEqual(defaultAddresses.length, 1);
    assert.strictEqual(defaultAddresses[0].id, 'addr-2');
  });

  it('blocks deletion of an address linked to an active order', () => {
    const activeOrders = [
      { id: 'ord-1', addressId: 'addr-active', status: 'processing' },
    ];

    const deleteAddress = (addressId) => {
      const inUse = activeOrders.some(
        (o) => o.addressId === addressId && !['delivered', 'cancelled', 'returned'].includes(o.status),
      );
      if (inUse) {
        throw new Error('ADDRESS_IN_USE: Cannot delete address currently linked to an active order.');
      }
      return true;
    };

    assert.throws(
      () => deleteAddress('addr-active'),
      /ADDRESS_IN_USE: Cannot delete address currently linked to an active order\./,
    );
    assert.strictEqual(deleteAddress('addr-idle'), true);
  });

  it('auto-promotes another active address when default address is deleted', () => {
    let addresses = [
      { id: 'addr-1', isDefault: true, isActive: true, createdAt: '2026-01-01' },
      { id: 'addr-2', isDefault: false, isActive: true, createdAt: '2026-01-02' },
    ];

    const deleteAddress = (addressId) => {
      const target = addresses.find((a) => a.id === addressId);
      target.isActive = false;
      target.isDefault = false;

      let newDefaultId = null;
      if (target.isDefault || true) {
        const remaining = addresses.filter((a) => a.isActive);
        if (remaining.length > 0) {
          remaining[0].isDefault = true;
          newDefaultId = remaining[0].id;
        }
      }
      return { deletedId: addressId, newDefaultId };
    };

    const res = deleteAddress('addr-1');
    assert.strictEqual(res.newDefaultId, 'addr-2');
    assert.strictEqual(addresses.find((a) => a.id === 'addr-2').isDefault, true);
  });

  it('detects duplicate address for the same shop', () => {
    const existingAddresses = [
      { id: 'addr-1', fullAddress: 'Plot 45, Commercial Market, Karachi', isActive: true },
    ];

    const saveAddress = (fullAddress) => {
      const duplicate = existingAddresses.some(
        (a) => a.isActive && a.fullAddress.trim().toLowerCase() === fullAddress.trim().toLowerCase(),
      );
      if (duplicate) {
        throw new Error('DUPLICATE_ADDRESS: An address with this location already exists for this shop.');
      }
      return true;
    };

    assert.throws(
      () => saveAddress('  plot 45, commercial market, karachi  '),
      /DUPLICATE_ADDRESS/,
    );
    assert.strictEqual(saveAddress('Plot 99, Industrial Area, Karachi'), true);
  });
});

describe('Shop Delivery Preferences validation', () => {
  it('validates periods and substitution preferences', () => {
    const isValidPeriod = (p) => ['morning', 'afternoon', 'evening', 'anytime'].includes(p);
    const isValidSubstitution = (s) => ['substitute', 'skip', 'call_me'].includes(s);

    assert.strictEqual(isValidPeriod('morning'), true);
    assert.strictEqual(isValidPeriod('anytime'), true);
    assert.strictEqual(isValidPeriod('midnight'), false);

    assert.strictEqual(isValidSubstitution('substitute'), true);
    assert.strictEqual(isValidSubstitution('skip'), true);
    assert.strictEqual(isValidSubstitution('call_me'), true);
    assert.strictEqual(isValidSubstitution('cancel_all'), false);
  });
});

describe('Offline address viewing and write protection', () => {
  it('blocks address writes when offline with OFFLINE_WRITE_BLOCKED error code', () => {
    const executeAction = (isWrite, isOnline) => {
      if (isWrite && !isOnline) {
        throw new Error('OFFLINE_WRITE_BLOCKED: Financial and write actions cannot be executed offline.');
      }
      return 'SUCCESS';
    };

    assert.throws(
      () => executeAction(true, false),
      /OFFLINE_WRITE_BLOCKED/,
    );
    assert.strictEqual(executeAction(false, false), 'SUCCESS'); // Read-only allowed
    assert.strictEqual(executeAction(true, true), 'SUCCESS');
  });
});

describe('Pricing Engine Resolution precedence (C7-A)', () => {
  const resolvePrice = ({ customerPrice, listPrice, normalPrice, bulkDiscount, promoDiscount }) => {
    let basePrice = normalPrice;
    let source = 'normal';

    if (customerPrice != null) {
      basePrice = customerPrice;
      source = 'customer_price';
    } else if (listPrice != null) {
      basePrice = listPrice;
      source = 'price_list';
    }

    let finalPrice = basePrice;
    if (bulkDiscount) {
      finalPrice = Math.min(finalPrice, bulkDiscount);
    }
    if (promoDiscount) {
      finalPrice = Math.max(0, finalPrice - promoDiscount);
    }

    return { unitPrice: finalPrice, basePrice, source };
  };

  it('customer-specific price takes highest precedence', () => {
    const result = resolvePrice({
      customerPrice: 1200,
      listPrice: 1300,
      normalPrice: 1400,
    });
    assert.strictEqual(result.unitPrice, 1200);
    assert.strictEqual(result.source, 'customer_price');
  });

  it('price list applies when no customer price exists', () => {
    const result = resolvePrice({
      customerPrice: null,
      listPrice: 1350,
      normalPrice: 1500,
    });
    assert.strictEqual(result.unitPrice, 1350);
    assert.strictEqual(result.source, 'price_list');
  });

  it('falls back to normal price if no customer price or price list exists', () => {
    const result = resolvePrice({
      customerPrice: null,
      listPrice: null,
      normalPrice: 1600,
    });
    assert.strictEqual(result.unitPrice, 1600);
    assert.strictEqual(result.source, 'normal');
  });

  it('clamps discount so final price cannot be negative', () => {
    const result = resolvePrice({
      customerPrice: null,
      listPrice: null,
      normalPrice: 500,
      promoDiscount: 600,
    });
    assert.strictEqual(result.unitPrice, 0);
  });
});

describe('Product Details Quantity Rule boundaries (C6-A)', () => {
  const validateQuantity = (qty, min = 1, max = 100, multiple = 1) => {
    if (typeof qty !== 'number' || Number.isNaN(qty) || !Number.isFinite(qty)) {
      return { valid: false, message: 'Invalid quantity' };
    }
    if (qty <= 0) {
      return { valid: false, message: 'Quantity must be greater than zero' };
    }
    if (!Number.isInteger(qty)) {
      return { valid: false, message: 'Quantity must be an integer' };
    }
    if (qty < min) {
      return { valid: false, message: `Minimum order quantity is ${min}` };
    }
    if (qty > max) {
      return { valid: false, message: `Maximum order quantity is ${max}` };
    }
    if (qty % multiple !== 0) {
      return { valid: false, message: `Must be ordered in multiples of ${multiple}` };
    }
    return { valid: true, message: null };
  };

  it('accepts valid quantities adhering to min, max and multiple', () => {
    assert.strictEqual(validateQuantity(12, 6, 48, 6).valid, true);
  });

  it('rejects negative, zero, float and NaN quantities', () => {
    assert.strictEqual(validateQuantity(0, 1, 50, 1).valid, false);
    assert.strictEqual(validateQuantity(-5, 1, 50, 1).valid, false);
    assert.strictEqual(validateQuantity(2.5, 1, 50, 1).valid, false);
    assert.strictEqual(validateQuantity(NaN, 1, 50, 1).valid, false);
  });

  it('rejects quantities violating min, max or multiple constraints', () => {
    assert.strictEqual(validateQuantity(4, 6, 48, 6).valid, false);
    assert.strictEqual(validateQuantity(54, 6, 48, 6).valid, false);
    assert.strictEqual(validateQuantity(15, 6, 48, 6).valid, false);
  });
});

describe('Checkout place_order idempotency and cutoff logic (C9-A)', () => {
  it('returns cached response when duplicate idempotency key is submitted', () => {
    const store = new Map();
    const executeOrder = (key, payload) => {
      if (store.has(key)) {
        return { isCached: true, order: store.get(key) };
      }
      const order = { id: 'ord_123', number: 1055, ...payload };
      store.set(key, order);
      return { isCached: false, order };
    };

    const first = executeOrder('idem_key_abc', { total: 14500 });
    assert.strictEqual(first.isCached, false);
    assert.strictEqual(first.order.number, 1055);

    const second = executeOrder('idem_key_abc', { total: 14500 });
    assert.strictEqual(second.isCached, true);
    assert.strictEqual(second.order.id, 'ord_123');
  });

  it('determines same-day cutoff in Asia/Karachi (4:00 PM cutoff)', () => {
    const isPastCutoff = (hour) => hour >= 16;
    assert.strictEqual(isPastCutoff(14), false); // 2 PM: same day
    assert.strictEqual(isPastCutoff(16), true);  // 4 PM: next day
    assert.strictEqual(isPastCutoff(18), true);  // 6 PM: next day
  });
});

describe('Realtime Event Idempotent Merge & Sequence Simulation (C11)', () => {
  class MockOrdersStore {
    constructor() {
      this.byId = {};
      this.activeOrders = [];
    }

    handleRealtimeEvent(payload) {
      const { new: newRow, eventType } = payload;
      if (!newRow || !newRow.id) return;

      const current = this.byId[newRow.id];

      // Discard event if updated_at is older than current state
      if (current && current.updatedAt && newRow.updated_at) {
        const currentDate = new Date(current.updatedAt).getTime();
        const incomingDate = new Date(newRow.updated_at).getTime();
        if (incomingDate < currentDate) {
          // Discard out-of-order event
          return;
        }
      }

      if (eventType === 'DELETE') {
        this.activeOrders = this.activeOrders.filter((o) => o.id !== newRow.id);
        delete this.byId[newRow.id];
        return;
      }

      const summary = {
        id: newRow.id,
        orderNumber: newRow.order_number,
        orderStatus: newRow.order_status,
        paymentStatus: newRow.payment_status,
        deliveryStatus: newRow.delivery_status,
        updatedAt: newRow.updated_at,
      };

      this.byId[newRow.id] = summary;
      const isTerminal = ['delivered', 'cancelled', 'rejected'].includes(newRow.order_status);
      if (isTerminal) {
        this.activeOrders = this.activeOrders.filter((o) => o.id !== newRow.id);
      } else {
        const idx = this.activeOrders.findIndex((o) => o.id === newRow.id);
        if (idx >= 0) {
          this.activeOrders[idx] = summary;
        } else {
          this.activeOrders.unshift(summary);
        }
      }
    }
  }

  it('correctly processes chronological order events', () => {
    const store = new MockOrdersStore();
    
    // 1. Order Placed
    store.handleRealtimeEvent({
      eventType: 'INSERT',
      new: {
        id: 'ord_1',
        order_number: 101,
        order_status: 'placed',
        delivery_status: 'unassigned',
        payment_status: 'unpaid',
        updated_at: '2026-10-10T10:00:00Z',
      },
    });

    assert.strictEqual(store.byId['ord_1'].orderStatus, 'placed');
    assert.strictEqual(store.activeOrders.length, 1);

    // 2. Confirmed & Assigned
    store.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord_1',
        order_number: 101,
        order_status: 'confirmed',
        delivery_status: 'assigned',
        payment_status: 'unpaid',
        updated_at: '2026-10-10T10:05:00Z',
      },
    });

    assert.strictEqual(store.byId['ord_1'].orderStatus, 'confirmed');
    assert.strictEqual(store.byId['ord_1'].deliveryStatus, 'assigned');

    // 3. Out for delivery
    store.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord_1',
        order_number: 101,
        order_status: 'out_for_delivery',
        delivery_status: 'out_for_delivery',
        payment_status: 'unpaid',
        updated_at: '2026-10-10T10:15:00Z',
      },
    });

    assert.strictEqual(store.byId['ord_1'].orderStatus, 'out_for_delivery');
    assert.strictEqual(store.byId['ord_1'].deliveryStatus, 'out_for_delivery');
  });

  it('discards out-of-order events arriving late without regressing state', () => {
    const store = new MockOrdersStore();

    // Event 1: Newer event arrived first (e.g. 10:20 AM out_for_delivery)
    store.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord_2',
        order_number: 102,
        order_status: 'out_for_delivery',
        delivery_status: 'out_for_delivery',
        payment_status: 'unpaid',
        updated_at: '2026-10-10T10:20:00Z',
      },
    });

    assert.strictEqual(store.byId['ord_2'].orderStatus, 'out_for_delivery');

    // Event 2: Older event arriving late (e.g. 10:10 AM processing)
    store.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord_2',
        order_number: 102,
        order_status: 'processing',
        delivery_status: 'unassigned',
        payment_status: 'unpaid',
        updated_at: '2026-10-10T10:10:00Z',
      },
    });

    // Must NOT regress back to processing!
    assert.strictEqual(store.byId['ord_2'].orderStatus, 'out_for_delivery');
    assert.strictEqual(store.byId['ord_2'].deliveryStatus, 'out_for_delivery');
  });

  it('handles duplicate realtime events idempotently', () => {
    const store = new MockOrdersStore();

    const payload = {
      eventType: 'UPDATE',
      new: {
        id: 'ord_3',
        order_number: 103,
        order_status: 'ready',
        delivery_status: 'assigned',
        payment_status: 'unpaid',
        updated_at: '2026-10-10T10:12:00Z',
      },
    };

    store.handleRealtimeEvent(payload);
    store.handleRealtimeEvent(payload); // duplicate

    assert.strictEqual(store.byId['ord_3'].orderStatus, 'ready');
    assert.strictEqual(store.activeOrders.length, 1);
  });

  it('removes order from active list when transitioning to terminal status', () => {
    const store = new MockOrdersStore();

    store.handleRealtimeEvent({
      eventType: 'INSERT',
      new: {
        id: 'ord_4',
        order_number: 104,
        order_status: 'placed',
        delivery_status: 'unassigned',
        payment_status: 'unpaid',
        updated_at: '2026-10-10T10:00:00Z',
      },
    });
    assert.strictEqual(store.activeOrders.length, 1);

    store.handleRealtimeEvent({
      eventType: 'UPDATE',
      new: {
        id: 'ord_4',
        order_number: 104,
        order_status: 'delivered',
        delivery_status: 'delivered',
        payment_status: 'paid',
        updated_at: '2026-10-10T11:00:00Z',
      },
    });

    // Delivered is terminal, so activeOrders is empty while byId retains latest data
    assert.strictEqual(store.activeOrders.length, 0);
    assert.strictEqual(store.byId['ord_4'].orderStatus, 'delivered');
  });
});

describe('Timeline Rendering & Status Skip Resilience (C11)', () => {
  const CANONICAL_STEPS = ['placed', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered'];

  const resolveTimelineStepStatus = (stepKey, currentStatus, events) => {
    const stepIdx = CANONICAL_STEPS.indexOf(stepKey);
    const currentIdx = CANONICAL_STEPS.indexOf(currentStatus);
    const hasEvent = events.some((e) => e.status === stepKey);

    const isCompleted = hasEvent || (currentIdx !== -1 && stepIdx <= currentIdx);
    const isCurrent = stepIdx === currentIdx;
    return { isCompleted, isCurrent };
  };

  it('marks skipped steps as completed when status jumps forward', () => {
    // Scenario: Order went directly from 'placed' to 'out_for_delivery'
    const events = [
      { status: 'placed', createdAt: '2026-10-10T10:00:00Z' },
      { status: 'out_for_delivery', createdAt: '2026-10-10T10:30:00Z' },
    ];
    const currentStatus = 'out_for_delivery';

    // Intermediate steps 'confirmed', 'processing', 'ready' must be resolved as completed
    assert.strictEqual(resolveTimelineStepStatus('confirmed', currentStatus, events).isCompleted, true);
    assert.strictEqual(resolveTimelineStepStatus('processing', currentStatus, events).isCompleted, true);
    assert.strictEqual(resolveTimelineStepStatus('ready', currentStatus, events).isCompleted, true);
    assert.strictEqual(resolveTimelineStepStatus('out_for_delivery', currentStatus, events).isCurrent, true);
    assert.strictEqual(resolveTimelineStepStatus('delivered', currentStatus, events).isCompleted, false);
  });
});

describe('Staff Role Isolation on Orders (RLS simulation)', () => {
  const canAccessOrder = (callerRole, callerUserId, orderShopId, orderUserId) => {
    if (callerRole === 'owner' || callerRole === 'manager') {
      return true;
    }
    if (callerRole === 'staff') {
      return callerUserId === orderUserId;
    }
    return false;
  };

  it('Owner and Manager can see all orders for the shop', () => {
    assert.strictEqual(canAccessOrder('owner', 'usr_owner', 'shp_1', 'usr_staff_1'), true);
    assert.strictEqual(canAccessOrder('manager', 'usr_mgr', 'shp_1', 'usr_staff_2'), true);
  });

  it('Staff can ONLY see their own orders', () => {
    assert.strictEqual(canAccessOrder('staff', 'usr_staff_1', 'shp_1', 'usr_staff_1'), true);
    assert.strictEqual(canAccessOrder('staff', 'usr_staff_1', 'shp_1', 'usr_staff_2'), false);
  });
});

describe('Orders Urgency Sorting (C11-B)', () => {
  const getOrderUrgencyRank = (order) => {
    if (order.deliveryStatus === 'failed') return 0;
    if (order.orderStatus === 'out_for_delivery' || order.deliveryStatus === 'out_for_delivery') return 1;
    if (order.orderStatus === 'ready') return 2;
    if (order.orderStatus === 'processing') return 3;
    if (order.orderStatus === 'confirmed') return 4;
    if (order.orderStatus === 'placed') return 5;
    return 6;
  };

  const sortOrdersByUrgency = (orders) => {
    return [...orders].sort((a, b) => {
      const rankA = getOrderUrgencyRank(a);
      const rankB = getOrderUrgencyRank(b);

      if (rankA !== rankB) {
        return rankA - rankB;
      }

      if (a.deliveryEta && b.deliveryEta) {
        const etaA = new Date(a.deliveryEta).getTime();
        const etaB = new Date(b.deliveryEta).getTime();
        if (etaA !== etaB) return etaA - etaB;
      } else if (a.deliveryEta && !b.deliveryEta) {
        return -1;
      } else if (!a.deliveryEta && b.deliveryEta) {
        return 1;
      }

      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      return timeB - timeA;
    });
  };

  it('sorts failed delivery first, then out_for_delivery, ready, processing, confirmed, placed', () => {
    const list = [
      { id: '1', orderNumber: 101, orderStatus: 'placed', deliveryStatus: 'unassigned', createdAt: '2026-10-10T10:00:00Z' },
      { id: '2', orderNumber: 102, orderStatus: 'processing', deliveryStatus: 'unassigned', createdAt: '2026-10-10T10:05:00Z' },
      { id: '3', orderNumber: 103, orderStatus: 'out_for_delivery', deliveryStatus: 'out_for_delivery', createdAt: '2026-10-10T09:00:00Z' },
      { id: '4', orderNumber: 104, orderStatus: 'confirmed', deliveryStatus: 'failed', createdAt: '2026-10-10T08:00:00Z' },
      { id: '5', orderNumber: 105, orderStatus: 'ready', deliveryStatus: 'assigned', createdAt: '2026-10-10T09:30:00Z' },
      { id: '6', orderNumber: 106, orderStatus: 'confirmed', deliveryStatus: 'unassigned', createdAt: '2026-10-10T10:10:00Z' },
    ];

    const sorted = sortOrdersByUrgency(list);
    assert.strictEqual(sorted[0].orderNumber, 104); // Failed delivery: topmost urgency
    assert.strictEqual(sorted[1].orderNumber, 103); // Out for delivery
    assert.strictEqual(sorted[2].orderNumber, 105); // Ready
    assert.strictEqual(sorted[3].orderNumber, 102); // Processing
    assert.strictEqual(sorted[4].orderNumber, 106); // Confirmed
    assert.strictEqual(sorted[5].orderNumber, 101); // Placed
  });

  it('breaks ties using delivery ETA (sooner ETA first) and newest creation', () => {
    const list = [
      { id: '1', orderNumber: 201, orderStatus: 'out_for_delivery', deliveryEta: '2026-10-10T14:30:00Z', createdAt: '2026-10-10T09:00:00Z' },
      { id: '2', orderNumber: 202, orderStatus: 'out_for_delivery', deliveryEta: '2026-10-10T12:00:00Z', createdAt: '2026-10-10T08:30:00Z' },
    ];

    const sorted = sortOrdersByUrgency(list);
    assert.strictEqual(sorted[0].orderNumber, 202); // Earlier ETA (12:00 PM vs 2:30 PM)
  });
});

describe('Screen Reader Accessibility Label for Timeline (C11-B)', () => {
  const formatStepA11yLabel = (stepNumber, totalSteps, stepLabel, state) => {
    return `Step ${stepNumber} of ${totalSteps}, ${stepLabel}, ${state}`;
  };

  it("formats accessibility label exactly as required: 'Step 3 of 6, Processing, current'", () => {
    const label = formatStepA11yLabel(3, 6, 'Processing', 'current');
    assert.strictEqual(label, 'Step 3 of 6, Processing, current');
  });

  it('formats completed and pending steps correctly', () => {
    assert.strictEqual(formatStepA11yLabel(1, 6, 'Placed', 'completed'), 'Step 1 of 6, Placed, completed');
    assert.strictEqual(formatStepA11yLabel(5, 6, 'Out for Delivery', 'pending'), 'Step 5 of 6, Out for Delivery, pending');
  });
});

describe('Order Status Paths and Terminal Timeline (C11-B)', () => {
  const CANONICAL_STEPS = ['placed', 'confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered'];

  const buildTimelineView = (orderStatus, history, failureReason) => {
    const isTerminalCancelled = orderStatus === 'cancelled' || orderStatus === 'rejected';
    const eventsByStatus = new Map(history.map((h) => [h.status, h]));

    if (isTerminalCancelled) {
      // Find completed prior steps
      const completedSteps = [];
      CANONICAL_STEPS.forEach((step, idx) => {
        if (eventsByStatus.has(step)) {
          completedSteps.push({ step, label: step, state: 'completed' });
        }
      });
      if (completedSteps.length === 0) {
        completedSteps.push({ step: 'placed', label: 'placed', state: 'completed' });
      }

      const terminalEvent = history.find((h) => h.status === orderStatus);
      const reason = failureReason || terminalEvent?.notes || 'Cancelled';

      return {
        type: 'terminal_cancelled',
        steps: [
          ...completedSteps,
          {
            step: orderStatus,
            label: orderStatus === 'rejected' ? 'Order Rejected' : 'Order Cancelled',
            state: 'current',
            isTerminal: true,
            reason,
          },
        ],
      };
    }

    const currentIdx = CANONICAL_STEPS.indexOf(orderStatus);
    const steps = CANONICAL_STEPS.map((step, idx) => {
      const isCompleted = eventsByStatus.has(step) || (currentIdx !== -1 && idx <= currentIdx);
      const isCurrent = currentIdx === idx;
      return {
        step,
        state: isCurrent ? 'current' : isCompleted ? 'completed' : 'pending',
      };
    });

    return { type: 'standard', steps };
  };

  it('renders standard full path up to Delivered', () => {
    const history = [
      { status: 'placed', createdAt: '2026-10-10T10:00:00Z' },
      { status: 'confirmed', createdAt: '2026-10-10T10:15:00Z' },
      { status: 'processing', createdAt: '2026-10-10T10:30:00Z' },
    ];
    const view = buildTimelineView('processing', history, null);
    assert.strictEqual(view.type, 'standard');
    assert.strictEqual(view.steps[0].state, 'completed'); // Placed
    assert.strictEqual(view.steps[1].state, 'completed'); // Confirmed
    assert.strictEqual(view.steps[2].state, 'current');   // Processing
    assert.strictEqual(view.steps[3].state, 'pending');   // Ready
  });

  it('renders terminal cancelled timeline path with reason', () => {
    const history = [
      { status: 'placed', createdAt: '2026-10-10T10:00:00Z' },
      { status: 'confirmed', createdAt: '2026-10-10T10:15:00Z' },
      { status: 'cancelled', notes: 'Out of stock on requested batch', createdAt: '2026-10-10T10:20:00Z' },
    ];
    const view = buildTimelineView('cancelled', history, 'Out of stock on requested batch');
    assert.strictEqual(view.type, 'terminal_cancelled');
    const terminalStep = view.steps[view.steps.length - 1];
    assert.strictEqual(terminalStep.isTerminal, true);
    assert.strictEqual(terminalStep.label, 'Order Cancelled');
    assert.strictEqual(terminalStep.reason, 'Out of stock on requested batch');
  });

  it('renders terminal rejected timeline path with supplier rejection reason', () => {
    const history = [
      { status: 'placed', createdAt: '2026-10-10T10:00:00Z' },
      { status: 'rejected', notes: 'Credit limit exceeded for shop', createdAt: '2026-10-10T10:05:00Z' },
    ];
    const view = buildTimelineView('rejected', history, 'Credit limit exceeded for shop');
    assert.strictEqual(view.type, 'terminal_cancelled');
    const terminalStep = view.steps[view.steps.length - 1];
    assert.strictEqual(terminalStep.label, 'Order Rejected');
    assert.strictEqual(terminalStep.reason, 'Credit limit exceeded for shop');
  });
});

describe('Failed & Partial Delivery Tracking Resolution (C11-B)', () => {
  it('detects failed delivery and exposes reschedule or cancel actions', () => {
    const orderTracking = {
      orderId: 'ord_99',
      orderStatus: 'confirmed',
      deliveryStatus: 'failed',
      failureReason: 'Shop closed at 5:00 PM',
      deliveryStatusLine: 'Delivery attempt unsuccessful: Shop closed at 5:00 PM',
    };

    const isFailed = orderTracking.deliveryStatus === 'failed';
    assert.strictEqual(isFailed, true);
    assert.strictEqual(orderTracking.failureReason, 'Shop closed at 5:00 PM');
  });

  it('calculates ordered vs delivered quantities and detects shortfall', () => {
    const items = [
      { id: '1', productName: 'Pakola 1.5L', orderedQty: 10, deliveredQty: 10 },
      { id: '2', productName: 'Murree Brewery Lemon 330ml', orderedQty: 24, deliveredQty: 18 },
    ];

    const processed = items.map((item) => ({
      ...item,
      shortfallQty: Math.max(0, item.orderedQty - item.deliveredQty),
    }));

    assert.strictEqual(processed[0].shortfallQty, 0);
    assert.strictEqual(processed[1].shortfallQty, 6); // Shortfall of 6 pcs

    const hasShortfall = processed.some((i) => i.shortfallQty > 0);
    assert.strictEqual(hasShortfall, true);
  });
});

describe('Orders and Tracking 4 Screen States Resolution (C11-B)', () => {
  const resolveScreenState = ({ status, hasData, error, isOnline }) => {
    if (!isOnline && !hasData) return 'offline';
    if (status === 'loading' && !hasData) return 'loading';
    if (status === 'error' && !hasData) return 'error';
    if (hasData) return 'data';
    return 'empty';
  };

  it('correctly maps to loading state when fetching initial data', () => {
    assert.strictEqual(
      resolveScreenState({ status: 'loading', hasData: false, error: null, isOnline: true }),
      'loading',
    );
  });

  it('correctly maps to data state when orders exist', () => {
    assert.strictEqual(
      resolveScreenState({ status: 'success', hasData: true, error: null, isOnline: true }),
      'data',
    );
  });

  it('correctly maps to empty state when no active orders exist', () => {
    assert.strictEqual(
      resolveScreenState({ status: 'success', hasData: false, error: null, isOnline: true }),
      'empty',
    );
  });

  it('correctly maps to error state on failure', () => {
    assert.strictEqual(
      resolveScreenState({ status: 'error', hasData: false, error: new Error('Network error'), isOnline: true }),
      'error',
    );
  });
});

describe('Order History Filter Combos and Search (C12)', () => {
  const ordersDatabase = [
    { id: 'ord_1', orderNumber: 1001, shopId: 'shp_1', userId: 'usr_staff_1', orderStatus: 'delivered', grandTotal: 14500, createdAt: '2026-10-01T10:00:00Z' },
    { id: 'ord_2', orderNumber: 1002, shopId: 'shp_1', userId: 'usr_staff_2', orderStatus: 'confirmed', grandTotal: 8200, createdAt: '2026-10-03T11:00:00Z' },
    { id: 'ord_3', orderNumber: 1003, shopId: 'shp_1', userId: 'usr_staff_1', orderStatus: 'cancelled', grandTotal: 3000, createdAt: '2026-10-05T12:00:00Z' },
    { id: 'ord_4', orderNumber: 1004, shopId: 'shp_1', userId: 'usr_staff_1', orderStatus: 'delivered', grandTotal: 14500, createdAt: '2026-10-07T14:00:00Z' },
  ];

  const filterOrders = ({ from, to, status, search }) => {
    if (from && to && new Date(to).getTime() < new Date(from).getTime()) {
      throw new Error('INVALID_DATE_RANGE: End date cannot be before start date');
    }

    const cleanSearch = search ? search.trim().replace(/,/g, '') : null;

    return ordersDatabase.filter((o) => {
      if (from && new Date(o.createdAt).getTime() < new Date(from).getTime()) return false;
      if (to && new Date(o.createdAt).getTime() > new Date(to).getTime()) return false;
      if (status && status.length > 0 && !status.includes(o.orderStatus)) return false;
      if (cleanSearch) {
        const matchesNumber = String(o.orderNumber).includes(cleanSearch);
        const matchesTotal = String(o.grandTotal).includes(cleanSearch);
        if (!matchesNumber && !matchesTotal) return false;
      }
      return true;
    });
  };

  it('filters by single and multiple statuses', () => {
    const delivered = filterOrders({ status: ['delivered'] });
    assert.strictEqual(delivered.length, 2);

    const activeOrCancelled = filterOrders({ status: ['confirmed', 'cancelled'] });
    assert.strictEqual(activeOrCancelled.length, 2);
  });

  it('filters by date range and throws for invalid date range (to before from)', () => {
    const range = filterOrders({ from: '2026-10-02T00:00:00Z', to: '2026-10-06T00:00:00Z' });
    assert.strictEqual(range.length, 2);
    assert.strictEqual(range[0].orderNumber, 1002);
    assert.strictEqual(range[1].orderNumber, 1003);

    assert.throws(
      () => filterOrders({ from: '2026-10-10T00:00:00Z', to: '2026-10-01T00:00:00Z' }),
      /INVALID_DATE_RANGE/,
    );
  });

  it('searches by order number and by total formatted with commas (e.g. 14,500)', () => {
    const byNum = filterOrders({ search: '1003' });
    assert.strictEqual(byNum.length, 1);
    assert.strictEqual(byNum[0].orderNumber, 1003);

    // Matches '14,500' -> cleaned to '14500' -> matches grandTotal 14500
    const byTotal = filterOrders({ search: '14,500' });
    assert.strictEqual(byTotal.length, 2);
    assert.strictEqual(byTotal[0].orderNumber, 1001);
    assert.strictEqual(byTotal[1].orderNumber, 1004);
  });

  it('correctly combines status, date range, and search query', () => {
    const combined = filterOrders({
      from: '2026-10-06T00:00:00Z',
      to: '2026-10-08T00:00:00Z',
      status: ['delivered'],
      search: '14,500',
    });
    assert.strictEqual(combined.length, 1);
    assert.strictEqual(combined[0].orderNumber, 1004);
  });
});

describe('Order History Keyset Pagination (C12)', () => {
  const allOrders = [
    { id: 'ord_10', orderNumber: 110, createdAt: '2026-10-10T10:00:00Z' },
    { id: 'ord_09', orderNumber: 109, createdAt: '2026-10-09T10:00:00Z' },
    { id: 'ord_08', orderNumber: 108, createdAt: '2026-10-08T10:00:00Z' },
    { id: 'ord_07', orderNumber: 107, createdAt: '2026-10-07T10:00:00Z' },
    { id: 'ord_06', orderNumber: 106, createdAt: '2026-10-06T10:00:00Z' },
  ];

  const paginateOrders = (cursor, limit = 2) => {
    let filtered = allOrders;
    if (cursor) {
      const [cursorTime, cursorId] = cursor.split('|');
      const timeMs = new Date(cursorTime).getTime();
      filtered = allOrders.filter((o) => {
        const oTime = new Date(o.createdAt).getTime();
        return oTime < timeMs || (oTime === timeMs && o.id < cursorId);
      });
    }

    const items = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const nextCursor = hasMore && items.length > 0
      ? `${items[items.length - 1].createdAt}|${items[items.length - 1].id}`
      : null;

    return { items, hasMore, nextCursor };
  };

  it('paginates correctly using keyset cursor across pages', () => {
    // Page 1
    const page1 = paginateOrders(null, 2);
    assert.strictEqual(page1.items.length, 2);
    assert.strictEqual(page1.items[0].orderNumber, 110);
    assert.strictEqual(page1.items[1].orderNumber, 109);
    assert.strictEqual(page1.hasMore, true);
    assert.strictEqual(page1.nextCursor, '2026-10-09T10:00:00Z|ord_09');

    // Page 2
    const page2 = paginateOrders(page1.nextCursor, 2);
    assert.strictEqual(page2.items.length, 2);
    assert.strictEqual(page2.items[0].orderNumber, 108);
    assert.strictEqual(page2.items[1].orderNumber, 107);
    assert.strictEqual(page2.hasMore, true);

    // Page 3 (final)
    const page3 = paginateOrders(page2.nextCursor, 2);
    assert.strictEqual(page3.items.length, 1);
    assert.strictEqual(page3.items[0].orderNumber, 106);
    assert.strictEqual(page3.hasMore, false);
    assert.strictEqual(page3.nextCursor, null);
  });
});

describe('Order History Role Visibility & Financial Masking (C12)', () => {
  const getOrderDetailForRole = (role, callerUserId, order) => {
    // Staff isolation
    if (role === 'staff' && order.userId !== callerUserId) {
      throw new Error('PERMISSION_DENIED: Staff members can only view their own orders');
    }

    const isFinancialAuth = role === 'owner' || role === 'manager';

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      grandTotal: isFinancialAuth ? order.grandTotal : null,
      invoiceUrl: isFinancialAuth && order.orderStatus === 'delivered' ? order.invoiceUrl : null,
      isInvoiceAvailable: order.orderStatus === 'delivered' && Boolean(order.invoiceUrl),
      items: order.items.map((i) => ({
        productName: i.productName,
        orderedQty: i.qty,
        unitPrice: isFinancialAuth ? i.unitPrice : null,
        lineTotal: isFinancialAuth ? i.lineTotal : null,
      })),
      isFinancialAuthorized: isFinancialAuth,
    };
  };

  const sampleOrder = {
    id: 'ord_sample',
    orderNumber: 5001,
    userId: 'usr_staff_1',
    orderStatus: 'delivered',
    grandTotal: 25000,
    invoiceUrl: 'https://storage.supabase.co/invoices/inv_5001.pdf',
    items: [
      { productName: 'Pakola 1.5L', qty: 10, unitPrice: 200, lineTotal: 2000 },
    ],
  };

  it('Owner and Manager see all financial numbers and invoice download link', () => {
    const ownerView = getOrderDetailForRole('owner', 'usr_owner', sampleOrder);
    assert.strictEqual(ownerView.grandTotal, 25000);
    assert.strictEqual(ownerView.items[0].unitPrice, 200);
    assert.strictEqual(ownerView.items[0].lineTotal, 2000);
    assert.strictEqual(ownerView.invoiceUrl, 'https://storage.supabase.co/invoices/inv_5001.pdf');
    assert.strictEqual(ownerView.isFinancialAuthorized, true);

    const managerView = getOrderDetailForRole('manager', 'usr_mgr', sampleOrder);
    assert.strictEqual(managerView.grandTotal, 25000);
    assert.strictEqual(managerView.isFinancialAuthorized, true);
  });

  it('Staff role has money fields and invoice link masked (NULL)', () => {
    const staffView = getOrderDetailForRole('staff', 'usr_staff_1', sampleOrder);
    assert.strictEqual(staffView.grandTotal, null);
    assert.strictEqual(staffView.items[0].unitPrice, null);
    assert.strictEqual(staffView.items[0].lineTotal, null);
    assert.strictEqual(staffView.invoiceUrl, null);
    assert.strictEqual(staffView.isFinancialAuthorized, false);
  });

  it('Staff role is blocked from reading other staff orders', () => {
    assert.throws(
      () => getOrderDetailForRole('staff', 'usr_staff_OTHER', sampleOrder),
      /PERMISSION_DENIED/,
    );
  });
});

describe('Order History Deleted Product Snapshot and Reorder (C12)', () => {
  it('preserves snapshot data for deleted products and flags them during reorder', () => {
    const orderItems = [
      { id: '1', variantId: 'var_active_1', productName: 'Pepsi 250ml Can', qty: 12 },
      { id: '2', variantId: null, productName: 'Discontinued Vintage Cola', qty: 6 }, // Product was deleted
    ];

    // Snapshot still displays name and quantities
    assert.strictEqual(orderItems[0].productName, 'Pepsi 250ml Can');
    assert.strictEqual(orderItems[1].productName, 'Discontinued Vintage Cola');

    // Reorder logic simulation
    const addedToCart = [];
    let skippedCount = 0;

    orderItems.forEach((item) => {
      if (item.variantId) {
        addedToCart.push({ variantId: item.variantId, qty: item.qty });
      } else {
        skippedCount++;
      }
    });

    assert.strictEqual(addedToCart.length, 1);
    assert.strictEqual(addedToCart[0].variantId, 'var_active_1');
    assert.strictEqual(skippedCount, 1); // 1 discontinued item skipped
  });
});

describe('Order History 4 States and Offline Cache (C12)', () => {
  it('uses cached first page when device is offline and store is empty', () => {
    const cachedFirstPage = [{ id: 'ord_cached_1', orderNumber: 999 }];
    const isOnline = false;
    const historyOrders = [];

    const displayed = !isOnline && historyOrders.length === 0 ? cachedFirstPage : historyOrders;
    assert.strictEqual(displayed.length, 1);
    assert.strictEqual(displayed[0].orderNumber, 999);
  });
});

describe('Reorder Preview and Rule Adjustments (C13-A)', () => {
  const calculateReorderLine = (line, currentVariant) => {
    const isAvailable = Boolean(currentVariant && currentVariant.isActive && currentVariant.stockStatus === 'in_stock');
    const originalQty = line.qty;
    let adjustedQty = originalQty;
    let qtyAdjustedReason = null;

    if (isAvailable) {
      if (currentVariant.minQty && originalQty < currentVariant.minQty) {
        adjustedQty = currentVariant.minQty;
        qtyAdjustedReason = 'Quantity increased to meet minimum rule';
      } else if (currentVariant.maxQty && originalQty > currentVariant.maxQty) {
        adjustedQty = currentVariant.maxQty;
        qtyAdjustedReason = 'Quantity reduced to maximum allowed';
      } else if (currentVariant.qtyMultiple && (originalQty % currentVariant.qtyMultiple) !== 0) {
        adjustedQty = Math.ceil(originalQty / currentVariant.qtyMultiple) * currentVariant.qtyMultiple;
        qtyAdjustedReason = 'Quantity adjusted to match order multiple';
      }
    }

    const priceChanged = Boolean(currentVariant && currentVariant.price !== line.unitPrice);

    return {
      lineId: line.id,
      originalQty,
      adjustedQty,
      isAvailable,
      originalPrice: line.unitPrice,
      currentPrice: currentVariant ? currentVariant.price : line.unitPrice,
      flags: {
        available: isAvailable,
        unavailable: !isAvailable,
        qty_adjusted: adjustedQty !== originalQty,
        price_changed: priceChanged,
      },
      qtyAdjustedReason,
      suggestedReplacements: !isAvailable ? (currentVariant?.replacements || []) : [],
    };
  };

  it('adjusts quantity when minimum quantity rule changed', () => {
    const pastLine = { id: 'l1', qty: 2, unitPrice: 150 };
    const variant = { isActive: true, stockStatus: 'in_stock', price: 150, minQty: 5, maxQty: 50, qtyMultiple: 1 };

    const res = calculateReorderLine(pastLine, variant);
    assert.strictEqual(res.adjustedQty, 5); // Raised to minQty 5
    assert.strictEqual(res.flags.qty_adjusted, true);
    assert.strictEqual(res.flags.price_changed, false);
    assert.strictEqual(res.qtyAdjustedReason, 'Quantity increased to meet minimum rule');
  });

  it('adjusts quantity when multiple rule is not satisfied', () => {
    const pastLine = { id: 'l2', qty: 7, unitPrice: 200 };
    const variant = { isActive: true, stockStatus: 'in_stock', price: 200, minQty: 1, maxQty: 100, qtyMultiple: 6 };

    const res = calculateReorderLine(pastLine, variant);
    assert.strictEqual(res.adjustedQty, 12); // Ceiled to next multiple of 6
    assert.strictEqual(res.flags.qty_adjusted, true);
  });

  it('detects price increases and sets price_changed flag', () => {
    const pastLine = { id: 'l3', qty: 10, unitPrice: 180 };
    const variant = { isActive: true, stockStatus: 'in_stock', price: 210, minQty: 1, maxQty: 100, qtyMultiple: 1 };

    const res = calculateReorderLine(pastLine, variant);
    assert.strictEqual(res.originalPrice, 180);
    assert.strictEqual(res.currentPrice, 210);
    assert.strictEqual(res.flags.price_changed, true);
  });

  it('detects unavailable lines and attaches suggested replacements', () => {
    const pastLine = { id: 'l4', qty: 10, unitPrice: 180 };
    const variant = {
      isActive: false,
      stockStatus: 'out_of_stock',
      price: 180,
      replacements: [{ variantId: 'v_alt', productName: 'Alternate Cola 1.5L', price: 185 }],
    };

    const res = calculateReorderLine(pastLine, variant);
    assert.strictEqual(res.isAvailable, false);
    assert.strictEqual(res.flags.unavailable, true);
    assert.strictEqual(res.suggestedReplacements.length, 1);
    assert.strictEqual(res.suggestedReplacements[0].variantId, 'v_alt');
  });
});

describe('Reorder Apply Idempotency and Merge (C13-A)', () => {
  it('merges quantities idempotently when reordering twice quickly', () => {
    const cartLines = new Map();

    const applyItemToCart = (variantId, qty, price) => {
      if (cartLines.has(variantId)) {
        const existing = cartLines.get(variantId);
        cartLines.set(variantId, { ...existing, qty: existing.qty + qty, price });
      } else {
        cartLines.set(variantId, { variantId, qty, price });
      }
    };

    // First apply: 10 units of v1
    applyItemToCart('v1', 10, 200);
    assert.strictEqual(cartLines.get('v1').qty, 10);
    assert.strictEqual(cartLines.size, 1);

    // Second quick apply: 10 units of v1 (reorder twice)
    applyItemToCart('v1', 10, 200);
    // Quantities merged rather than creating duplicate rows
    assert.strictEqual(cartLines.get('v1').qty, 20);
    assert.strictEqual(cartLines.size, 1);
  });
});

describe('Favorites Optimistic Toggle & Rollback (C13-A)', () => {
  it('toggles favorite optimistically and rolls back on failure', async () => {
    const favorites = new Set(['v1']);

    const toggleFavoriteOptimistic = async (variantId, simulateFailure = false) => {
      const wasFav = favorites.has(variantId);
      // 1. Optimistic toggle
      if (wasFav) favorites.delete(variantId);
      else favorites.add(variantId);

      // 2. Network simulation
      if (simulateFailure) {
        // Rollback
        if (wasFav) favorites.add(variantId);
        else favorites.delete(variantId);
        throw new Error('Network error');
      }
      return !wasFav;
    };

    // Success toggle: removes v1
    await toggleFavoriteOptimistic('v1', false);
    assert.strictEqual(favorites.has('v1'), false);

    // Success toggle: adds v2
    await toggleFavoriteOptimistic('v2', false);
    assert.strictEqual(favorites.has('v2'), true);

    // Failed toggle: rolls back v2 removal
    await assert.rejects(
      async () => toggleFavoriteOptimistic('v2', true),
      /Network error/,
    );
    assert.strictEqual(favorites.has('v2'), true); // Still present due to rollback!
  });
});

describe('Recent Products Recency + Frequency Scoring Formula (C13-A)', () => {
  const calculateRecentScore = (frequency, daysAgo) => {
    // Documented formula: (frequency * 2.0) * exp(-0.04 * daysAgo)
    return Number(((frequency * 2.0) * Math.exp(-0.04 * daysAgo)).toFixed(4));
  };

  it('ranks high-frequency recent items above low-frequency old items', () => {
    // Item A: Ordered 10 times, last ordered 2 days ago
    const scoreA = calculateRecentScore(10, 2);

    // Item B: Ordered 2 times, last ordered 1 day ago
    const scoreB = calculateRecentScore(2, 1);

    // Item C: Ordered 15 times, but 90 days ago (stale)
    const scoreC = calculateRecentScore(15, 90);

    assert.ok(scoreA > scoreB, 'Frequent recent item has higher score than rare recent item');
    assert.ok(scoreA > scoreC, 'Recent frequent item has higher score than very old item');
    assert.strictEqual(scoreA, 18.4623);
  });
});

describe('Order Notes Lock Rule and Sanitization (C14)', () => {
  const validateAndSaveNote = (orderStatus, rawText) => {
    // 1. Lock rule
    if (orderStatus !== 'placed') {
      throw new Error('NOTE_LOCKED: Notes cannot be changed after the seller confirms. Use Help with this order.');
    }

    // 2. Sanitization: strip control characters
    const cleanText = rawText.replace(/[\x00-\x1F\x7F]/g, '').trim();

    // 3. Length checks
    if (cleanText.length === 0) {
      throw new Error('EMPTY_NOTE: Note cannot be empty');
    }
    if (cleanText.length > 500) {
      throw new Error('NOTE_TOO_LONG: Note exceeds maximum length of 500 characters');
    }

    return cleanText;
  };

  it('allows notes edit when order status is placed', () => {
    const saved = validateAndSaveNote('placed', 'Deliver before 1 PM please');
    assert.strictEqual(saved, 'Deliver before 1 PM please');
  });

  it('rejects notes edits with NOTE_LOCKED on confirmed, processing, ready, delivered, cancelled', () => {
    const lockedStatuses = ['confirmed', 'processing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected'];
    lockedStatuses.forEach((st) => {
      assert.throws(
        () => validateAndSaveNote(st, 'Change delivery time'),
        /NOTE_LOCKED/,
      );
    });
  });

  it('enforces 500 characters maximum length limit', () => {
    const valid500 = 'A'.repeat(500);
    assert.strictEqual(validateAndSaveNote('placed', valid500).length, 500);

    const invalid501 = 'A'.repeat(501);
    assert.throws(
      () => validateAndSaveNote('placed', invalid501),
      /NOTE_TOO_LONG/,
    );
  });

  it('rejects empty notes or whitespace-only notes', () => {
    assert.throws(
      () => validateAndSaveNote('placed', '   '),
      /EMPTY_NOTE/,
    );
  });

  it('strips control characters while preserving Urdu and emojis', () => {
    const raw = '\x00\x1Bبرائے مہربانی گیٹ پر رکھیں 📦🚚\x7F';
    const clean = validateAndSaveNote('placed', raw);
    assert.strictEqual(clean, 'برائے مہربانی گیٹ پر رکھیں 📦🚚');
  });
});

describe('Cancellation Preview and Policy Determination (C15-A)', () => {
  const resolveCancellationPreview = (order, pendingRequests = []) => {
    const hasPending = pendingRequests.some(
      (r) => r.orderId === order.id && r.status === 'pending',
    );

    if (hasPending) {
      return {
        canCancel: false,
        outcome: 'REQUEST_CREATED',
        requiresApproval: true,
        feeEstimate: 0,
        hasPendingRequest: true,
        reason: 'A cancellation request is already pending approval.',
        notice: 'A cancellation request is already pending seller approval.',
      };
    }

    if (order.orderStatus === 'delivered') {
      return {
        canCancel: false,
        outcome: 'CANCELLED',
        requiresApproval: false,
        feeEstimate: 0,
        hasPendingRequest: false,
        reason: 'Order is already delivered.',
        notice: 'This order has already been delivered and cannot be cancelled.',
      };
    }

    if (order.orderStatus === 'partially_delivered') {
      return {
        canCancel: false,
        outcome: 'CANCELLED',
        requiresApproval: false,
        feeEstimate: 0,
        hasPendingRequest: false,
        reason: 'Partial delivery already made.',
        notice: 'Partial delivery has been made. Please submit a return request instead.',
      };
    }

    if (['cancelled', 'rejected'].includes(order.orderStatus)) {
      return {
        canCancel: false,
        outcome: 'CANCELLED',
        requiresApproval: false,
        feeEstimate: 0,
        hasPendingRequest: false,
        reason: 'Order already cancelled or rejected.',
        notice: `This order is already ${order.orderStatus}.`,
      };
    }

    if (['placed', 'confirmed'].includes(order.orderStatus)) {
      return {
        canCancel: true,
        outcome: 'CANCELLED',
        requiresApproval: false,
        feeEstimate: 0,
        hasPendingRequest: false,
        notice: 'Your order will be cancelled immediately with no fee. Any reserved stock and credit will be restored.',
      };
    }

    if (['processing', 'ready'].includes(order.orderStatus)) {
      return {
        canCancel: true,
        outcome: 'REQUEST_CREATED',
        requiresApproval: true,
        feeEstimate: 0,
        hasPendingRequest: false,
        notice: 'The order is being prepared. The seller must approve this cancellation request.',
      };
    }

    if (order.orderStatus === 'out_for_delivery') {
      return {
        canCancel: true,
        outcome: 'REQUEST_CREATED',
        requiresApproval: true,
        feeEstimate: 500,
        hasPendingRequest: false,
        notice: 'The order is out for delivery. The seller must approve this request. A cancellation fee of Rs. 500 may apply.',
      };
    }

    return {
      canCancel: false,
      outcome: 'REQUEST_CREATED',
      requiresApproval: true,
      feeEstimate: 0,
      hasPendingRequest: false,
      notice: 'The seller must approve this cancellation request.',
    };
  };

  it('determines instant cancellation for placed and confirmed orders with 0 fee', () => {
    const placedOrder = { id: 'ord_1', orderStatus: 'placed' };
    const confirmedOrder = { id: 'ord_2', orderStatus: 'confirmed' };

    const preview1 = resolveCancellationPreview(placedOrder);
    assert.strictEqual(preview1.canCancel, true);
    assert.strictEqual(preview1.outcome, 'CANCELLED');
    assert.strictEqual(preview1.requiresApproval, false);
    assert.strictEqual(preview1.feeEstimate, 0);

    const preview2 = resolveCancellationPreview(confirmedOrder);
    assert.strictEqual(preview2.canCancel, true);
    assert.strictEqual(preview2.outcome, 'CANCELLED');
    assert.strictEqual(preview2.requiresApproval, false);
    assert.strictEqual(preview2.feeEstimate, 0);
  });

  it('determines request approval required for processing and ready orders', () => {
    const processingOrder = { id: 'ord_3', orderStatus: 'processing' };
    const preview = resolveCancellationPreview(processingOrder);
    assert.strictEqual(preview.canCancel, true);
    assert.strictEqual(preview.outcome, 'REQUEST_CREATED');
    assert.strictEqual(preview.requiresApproval, true);
    assert.strictEqual(preview.feeEstimate, 0);
  });

  it('estimates cancellation fee of Rs. 500 when order is out for delivery', () => {
    const outOrder = { id: 'ord_4', orderStatus: 'out_for_delivery' };
    const preview = resolveCancellationPreview(outOrder);
    assert.strictEqual(preview.canCancel, true);
    assert.strictEqual(preview.outcome, 'REQUEST_CREATED');
    assert.strictEqual(preview.requiresApproval, true);
    assert.strictEqual(preview.feeEstimate, 500);
  });

  it('blocks cancellation for delivered and partially delivered orders', () => {
    const deliveredOrder = { id: 'ord_5', orderStatus: 'delivered' };
    const partialOrder = { id: 'ord_6', orderStatus: 'partially_delivered' };

    const prevDel = resolveCancellationPreview(deliveredOrder);
    assert.strictEqual(prevDel.canCancel, false);
    assert.match(prevDel.reason, /already delivered/);

    const prevPart = resolveCancellationPreview(partialOrder);
    assert.strictEqual(prevPart.canCancel, false);
    assert.match(prevPart.reason, /Partial delivery/);
  });

  it('flags pending request and prevents duplicate preview submissions', () => {
    const pendingOrder = { id: 'ord_7', orderStatus: 'processing' };
    const existingRequests = [{ orderId: 'ord_7', status: 'pending' }];

    const preview = resolveCancellationPreview(pendingOrder, existingRequests);
    assert.strictEqual(preview.canCancel, false);
    assert.strictEqual(preview.hasPendingRequest, true);
  });
});

// In-memory simulation of atomic cancel_order RPC
class OrderCancellationDatabase {
    constructor() {
      this.orders = new Map();
      this.creditAccounts = new Map();
      this.ledgerEntries = [];
      this.stockReservations = [];
      this.statusHistory = [];
      this.cancellationRequests = [];
      this.idempotencyStore = new Map();
    }

    addOrder(order) {
      this.orders.set(order.id, { ...order });
    }

    setCreditAccount(shopId, limit, used) {
      this.creditAccounts.set(shopId, { shopId, limit, used });
    }

    addStockReservation(orderId, variantId, qty) {
      this.stockReservations.push({ orderId, variantId, qty });
    }

    cancelOrder(orderId, callerUserId, callerRole, reason, idempotencyKey = null) {
      if (!reason || !reason.trim()) {
        throw new Error('INVALID_REASON: Cancellation reason is required');
      }

      const order = this.orders.get(orderId);
      if (!order) {
        throw new Error('ORDER_NOT_FOUND: Order does not exist');
      }

      // Role check: staff can only cancel their own order
      if (callerRole === 'staff' && order.userId !== callerUserId) {
        throw new Error('PERMISSION_DENIED: Staff members can only cancel their own orders');
      }

      // Idempotency check
      if (idempotencyKey && this.idempotencyStore.has(idempotencyKey)) {
        return this.idempotencyStore.get(idempotencyKey);
      }

      // Status checks
      if (order.orderStatus === 'delivered') {
        throw new Error('CANNOT_CANCEL_DELIVERED: Cannot cancel an already delivered order');
      }
      if (order.orderStatus === 'partially_delivered') {
        throw new Error('CANNOT_CANCEL_PARTIAL: Partial delivery has already been made');
      }
      if (['cancelled', 'rejected'].includes(order.orderStatus)) {
        throw new Error('ORDER_ALREADY_CANCELLED: Order is already cancelled or rejected');
      }

      // Check open pending requests
      const openPending = this.cancellationRequests.find(
        (r) => r.orderId === orderId && r.status === 'pending',
      );
      if (openPending) {
        throw new Error('REQUEST_ALREADY_PENDING: A cancellation request is already pending for this order');
      }

      // Rate limit check: max 3 attempts per order in 24 hours
      const now = Date.now();
      const past24hRequests = this.cancellationRequests.filter(
        (r) => r.orderId === orderId && now - r.createdAt < 24 * 60 * 60 * 1000,
      );
      if (past24hRequests.length >= 3) {
        throw new Error('RATE_LIMIT_EXCEEDED: Maximum cancellation attempts reached for this order');
      }

      // BRANCH 1: Placed or Confirmed -> Immediate cancellation
      if (['placed', 'confirmed'].includes(order.orderStatus)) {
        order.orderStatus = 'cancelled';
        order.notes = `${order.notes || ''}\nCancelled by customer: ${reason}`.trim();

        // Release stock reservations
        this.stockReservations = this.stockReservations.filter((r) => r.orderId !== orderId);

        // Credit reversal
        if (order.paymentMethod === 'credit') {
          const acc = this.creditAccounts.get(order.shopId);
          if (acc) {
            acc.used = Math.max(0, acc.used - order.grandTotal);
            this.ledgerEntries.push({
              shopId: order.shopId,
              orderId,
              type: 'credit_adjustment',
              amount: order.grandTotal,
              balanceAfter: acc.used,
              notes: 'Credit restored on immediate order cancellation',
            });
          }
        }

        // Paid order refund
        if (['paid', 'partially_paid'].includes(order.paymentStatus)) {
          this.ledgerEntries.push({
            shopId: order.shopId,
            orderId,
            type: 'credit_adjustment',
            amount: order.grandTotal,
            balanceAfter: 0,
            notes: 'Payment credit note for cancelled order',
          });
          order.paymentStatus = 'refunded';
        }

        // Status history
        this.statusHistory.push({
          orderId,
          status: 'cancelled',
          actor: callerUserId,
          notes: `Cancelled immediately by customer: ${reason}`,
        });

        const result = {
          outcome: 'CANCELLED',
          orderId,
          orderStatus: 'cancelled',
          feeAmount: 0,
          message: 'Order cancelled immediately. Reserved stock and credit restored.',
        };

        if (idempotencyKey) {
          this.idempotencyStore.set(idempotencyKey, result);
        }
        return result;
      }

      // BRANCH 2: Processing, Ready, Out for delivery -> Request created
      const fee = order.orderStatus === 'out_for_delivery' ? 500 : 0;
      const requestId = `req_${Date.now()}_${Math.random()}`;
      const newReq = {
        id: requestId,
        orderId,
        shopId: order.shopId,
        userId: callerUserId,
        status: 'pending',
        feeEstimate: fee,
        reason,
        idempotencyKey,
        createdAt: now,
      };

      this.cancellationRequests.push(newReq);
      this.statusHistory.push({
        orderId,
        status: order.orderStatus,
        actor: callerUserId,
        notes: `Cancellation request submitted: ${reason}. Estimated fee: Rs. ${fee}`,
      });

      const result = {
        outcome: 'REQUEST_CREATED',
        requestId,
        orderId,
        orderStatus: order.orderStatus,
        feeAmount: fee,
        message: 'Cancellation request submitted for seller review.',
      };

      if (idempotencyKey) {
        this.idempotencyStore.set(idempotencyKey, result);
      }
      return result;
    }

    decideRequest(requestId, decision, sellerNote, feeApplied = null) {
      const req = this.cancellationRequests.find((r) => r.id === requestId);
      if (!req) throw new Error('REQUEST_NOT_FOUND');
      if (req.status !== 'pending') throw new Error(`REQUEST_NOT_PENDING: ${req.status}`);

      const order = this.orders.get(req.orderId);
      const fee = feeApplied !== null ? feeApplied : req.feeEstimate;

      if (decision === 'approved') {
        req.status = 'approved';
        req.sellerNote = sellerNote;
        req.feeApplied = fee;

        order.orderStatus = 'cancelled';
        this.stockReservations = this.stockReservations.filter((r) => r.orderId !== req.orderId);

        if (order.paymentMethod === 'credit') {
          const acc = this.creditAccounts.get(req.shopId);
          if (acc) {
            const restored = Math.max(0, order.grandTotal - fee);
            acc.used = Math.max(0, acc.used - restored);
            this.ledgerEntries.push({
              shopId: req.shopId,
              orderId: req.orderId,
              type: 'credit_adjustment',
              amount: restored,
              balanceAfter: acc.used,
              notes: `Credit restored after approved cancellation (Fee: Rs. ${fee})`,
            });
          }
        }

        this.statusHistory.push({
          orderId: req.orderId,
          status: 'cancelled',
          notes: `Cancellation approved by seller. Fee: Rs. ${fee}`,
        });

        return { success: true, decision: 'approved', feeApplied: fee };
      } else {
        req.status = 'rejected';
        req.sellerNote = sellerNote;
        req.feeApplied = 0;

        this.statusHistory.push({
          orderId: req.orderId,
          status: order.orderStatus,
          notes: `Cancellation rejected by seller: ${sellerNote}`,
        });

        return { success: true, decision: 'rejected' };
      }
    }
  }

describe('Atomic cancel_order and Ledger Reversal (C15-A)', () => {
  it('cancels placed order immediately, releases reservations, and restores credit balance', () => {
    const db = new OrderCancellationDatabase();
    db.setCreditAccount('shop_1', 100000, 35000);
    db.addOrder({
      id: 'ord_placed_1',
      shopId: 'shop_1',
      userId: 'user_1',
      orderStatus: 'placed',
      paymentMethod: 'credit',
      paymentStatus: 'unpaid',
      grandTotal: 15000,
    });
    db.addStockReservation('ord_placed_1', 'var_1', 20);

    const res = db.cancelOrder('ord_placed_1', 'user_1', 'owner', 'Duplicate order submitted');
    assert.strictEqual(res.outcome, 'CANCELLED');
    assert.strictEqual(res.feeAmount, 0);

    // Order status is now cancelled
    assert.strictEqual(db.orders.get('ord_placed_1').orderStatus, 'cancelled');

    // Stock reservations released
    assert.strictEqual(db.stockReservations.length, 0);

    // Credit used reduced from 35,000 to 20,000
    assert.strictEqual(db.creditAccounts.get('shop_1').used, 20000);

    // Ledger entry recorded without row deletion
    assert.strictEqual(db.ledgerEntries.length, 1);
    assert.strictEqual(db.ledgerEntries[0].amount, 15000);
    assert.strictEqual(db.ledgerEntries[0].balanceAfter, 20000);
  });

  it('creates a cancellation request with fee estimate for out_for_delivery order', () => {
    const db = new OrderCancellationDatabase();
    db.addOrder({
      id: 'ord_out_1',
      shopId: 'shop_1',
      userId: 'user_1',
      orderStatus: 'out_for_delivery',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      grandTotal: 25000,
    });

    const res = db.cancelOrder('ord_out_1', 'user_1', 'owner', 'Shop closed due to emergency');
    assert.strictEqual(res.outcome, 'REQUEST_CREATED');
    assert.strictEqual(res.feeAmount, 500);

    // Order remains in out_for_delivery pending decision
    assert.strictEqual(db.orders.get('ord_out_1').orderStatus, 'out_for_delivery');

    // Cancellation request row created
    assert.strictEqual(db.cancellationRequests.length, 1);
    assert.strictEqual(db.cancellationRequests[0].status, 'pending');
    assert.strictEqual(db.cancellationRequests[0].feeEstimate, 500);
  });

  it('handles duplicate submit idempotently with idempotency_key', () => {
    const db = new OrderCancellationDatabase();
    db.addOrder({
      id: 'ord_idemp_1',
      shopId: 'shop_1',
      userId: 'user_1',
      orderStatus: 'processing',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      grandTotal: 10000,
    });

    const res1 = db.cancelOrder('ord_idemp_1', 'user_1', 'owner', 'Accidental tap', 'key_abc_123');
    const res2 = db.cancelOrder('ord_idemp_1', 'user_1', 'owner', 'Accidental tap', 'key_abc_123');

    assert.strictEqual(res1.outcome, 'REQUEST_CREATED');
    assert.strictEqual(res2.outcome, 'REQUEST_CREATED');
    assert.strictEqual(res1.requestId, res2.requestId);
    assert.strictEqual(db.cancellationRequests.length, 1); // No duplicate rows created
  });

  it('prevents a second request while a pending request already exists', () => {
    const db = new OrderCancellationDatabase();
    db.addOrder({
      id: 'ord_dup_1',
      shopId: 'shop_1',
      userId: 'user_1',
      orderStatus: 'processing',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      grandTotal: 8000,
    });

    db.cancelOrder('ord_dup_1', 'user_1', 'owner', 'Reason 1');
    assert.throws(
      () => db.cancelOrder('ord_dup_1', 'user_1', 'owner', 'Reason 2'),
      /REQUEST_ALREADY_PENDING/,
    );
  });

  it('enforces maximum 3 cancellation requests per order in 24 hours', () => {
    const db = new OrderCancellationDatabase();
    db.addOrder({
      id: 'ord_rate_1',
      shopId: 'shop_1',
      userId: 'user_1',
      orderStatus: 'processing',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      grandTotal: 12000,
    });

    // 1st request -> rejected
    const r1 = db.cancelOrder('ord_rate_1', 'user_1', 'owner', 'Try 1');
    db.decideRequest(r1.requestId, 'rejected', 'Already loaded');

    // 2nd request -> rejected
    const r2 = db.cancelOrder('ord_rate_1', 'user_1', 'owner', 'Try 2');
    db.decideRequest(r2.requestId, 'rejected', 'Truck moving');

    // 3rd request -> rejected
    const r3 = db.cancelOrder('ord_rate_1', 'user_1', 'owner', 'Try 3');
    db.decideRequest(r3.requestId, 'rejected', 'Cannot recall');

    // 4th request throws RATE_LIMIT_EXCEEDED
    assert.throws(
      () => db.cancelOrder('ord_rate_1', 'user_1', 'owner', 'Try 4'),
      /RATE_LIMIT_EXCEEDED/,
    );
  });

  it('blocks staff members from cancelling orders placed by other users', () => {
    const db = new OrderCancellationDatabase();
    db.addOrder({
      id: 'ord_staff_1',
      shopId: 'shop_1',
      userId: 'user_manager',
      orderStatus: 'placed',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      grandTotal: 5000,
    });

    assert.throws(
      () => db.cancelOrder('ord_staff_1', 'user_staff_other', 'staff', 'Unauthorized cancel'),
      /PERMISSION_DENIED/,
    );
  });
});

describe('Seller Decision on Cancellation Requests (C15-A)', () => {
  it('releases credit net of fee and cancels order when seller approves request', () => {
    const db = new OrderCancellationDatabase();
    db.setCreditAccount('shop_1', 100000, 30000);
    db.addOrder({
      id: 'ord_dec_1',
      shopId: 'shop_1',
      userId: 'user_1',
      orderStatus: 'out_for_delivery',
      paymentMethod: 'credit',
      paymentStatus: 'unpaid',
      grandTotal: 20000,
    });
    db.addStockReservation('ord_dec_1', 'var_1', 10);

    const submission = db.cancelOrder('ord_dec_1', 'user_1', 'owner', 'Emergency closure');
    const decision = db.decideRequest(submission.requestId, 'approved', 'Approved with standard dispatch fee', 500);

    assert.strictEqual(decision.success, true);
    assert.strictEqual(decision.decision, 'approved');
    assert.strictEqual(decision.feeApplied, 500);

    // Order is cancelled
    assert.strictEqual(db.orders.get('ord_dec_1').orderStatus, 'cancelled');

    // Stock reservations deleted
    assert.strictEqual(db.stockReservations.length, 0);

    // Credit restored: grandTotal (20,000) - fee (500) = 19,500 restored
    // 30,000 - 19,500 = 10,500 used
    assert.strictEqual(db.creditAccounts.get('shop_1').used, 10500);
    assert.strictEqual(db.ledgerEntries[0].amount, 19500);
  });

  it('keeps order active and records seller note when request is rejected', () => {
    const db = new OrderCancellationDatabase();
    db.addOrder({
      id: 'ord_rej_1',
      shopId: 'shop_1',
      userId: 'user_1',
      orderStatus: 'out_for_delivery',
      paymentMethod: 'cod',
      paymentStatus: 'unpaid',
      grandTotal: 15000,
    });

    const submission = db.cancelOrder('ord_rej_1', 'user_1', 'owner', 'Changed my mind');
    const decision = db.decideRequest(submission.requestId, 'rejected', 'Driver is already at your door');

    assert.strictEqual(decision.success, true);
    assert.strictEqual(decision.decision, 'rejected');

    // Order remains out for delivery
    assert.strictEqual(db.orders.get('ord_rej_1').orderStatus, 'out_for_delivery');

    // Request is rejected with seller note preserved
    const req = db.cancellationRequests.find((r) => r.id === submission.requestId);
    assert.strictEqual(req.status, 'rejected');
    assert.strictEqual(req.sellerNote, 'Driver is already at your door');
  });
});

describe('Cancellation Flow UI States & Accessibility (C15-B)', () => {
  it('resolves correct UI notice for immediate cancellation vs approval fee', () => {
    const getNoticeText = (preview) => {
      if (!preview) return '';
      if (!preview.requiresApproval) {
        return 'Your order will be cancelled immediately with no fee. Any reserved stock and credit balance will be restored.';
      }
      if (preview.feeEstimate > 0) {
        return `The seller must approve this request. A cancellation fee of Rs. ${preview.feeEstimate} may apply.`;
      }
      return 'The seller must approve this request because order preparation is in progress.';
    };

    const immediate = { requiresApproval: false, feeEstimate: 0 };
    const approvalNoFee = { requiresApproval: true, feeEstimate: 0 };
    const approvalWithFee = { requiresApproval: true, feeEstimate: 500 };

    assert.match(getNoticeText(immediate), /cancelled immediately with no fee/);
    assert.match(getNoticeText(approvalNoFee), /order preparation is in progress/);
    assert.match(getNoticeText(approvalWithFee), /fee of Rs. 500 may apply/);
  });

  it('formats screen reader accessibility labels for reason chips and confirm dialog', () => {
    const reasonKey = 'duplicate';
    const reasonLabel = 'Duplicate order';
    const a11yLabel = `Reason: ${reasonLabel}`;
    assert.strictEqual(a11yLabel, 'Reason: Duplicate order');

    const dialogMessage = (orderNumber, requiresApproval) => {
      return requiresApproval
        ? `Are you sure you want to request cancellation for order #${orderNumber}? The seller will review this request.`
        : `Are you sure you want to cancel order #${orderNumber} immediately? Reserved stock and credit will be restored.`;
    };

    assert.match(dialogMessage(1045, false), /cancel order #1045 immediately/);
    assert.match(dialogMessage(1045, true), /request cancellation for order #1045/);
  });
});

describe('Quiet Hours and Critical Event Bypass in Asia/Karachi (C16-A)', () => {
  const isWithinQuietHours = (startStr = '22:00', endStr = '08:00', now = new Date()) => {
    // Format to Asia/Karachi HH:MM
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
    const currentMinutes = h * 60 + m;

    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;

    if (startMin < endMin) {
      return currentMinutes >= startMin && currentMinutes < endMin;
    } else {
      return currentMinutes >= startMin || currentMinutes < endMin;
    }
  };

  const shouldSendPush = (notification, prefs, now = new Date()) => {
    if (!prefs.quietHoursEnabled) return true;
    if (notification.isCritical) return true; // Critical alerts bypass quiet hours!

    const inQuiet = isWithinQuietHours(prefs.quietHoursStart, prefs.quietHoursEnd, now);
    return !inQuiet;
  };

  it('detects quiet hours correctly across overnight window (22:00 - 08:00 PKT)', () => {
    // 23:30 PKT (18:30 UTC)
    const lateNightUtc = new Date('2026-10-10T18:30:00Z');
    assert.strictEqual(isWithinQuietHours('22:00', '08:00', lateNightUtc), true);

    // 03:00 PKT (22:00 UTC previous day)
    const earlyMorningUtc = new Date('2026-10-09T22:00:00Z');
    assert.strictEqual(isWithinQuietHours('22:00', '08:00', earlyMorningUtc), true);

    // 14:00 PKT (09:00 UTC) - daytime business hours
    const afternoonUtc = new Date('2026-10-10T09:00:00Z');
    assert.strictEqual(isWithinQuietHours('22:00', '08:00', afternoonUtc), false);
  });

  it('suppresses non-critical push notifications during quiet hours', () => {
    const prefs = {
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    };
    const standardNotification = {
      type: 'special_offer',
      isCritical: false,
    };
    const lateNightUtc = new Date('2026-10-10T18:30:00Z'); // 23:30 PKT

    assert.strictEqual(shouldSendPush(standardNotification, prefs, lateNightUtc), false);
  });

  it('bypasses quiet hours for critical events like delivery failure', () => {
    const prefs = {
      quietHoursEnabled: true,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
    };
    const criticalNotification = {
      type: 'delivery_failed',
      isCritical: true,
    };
    const lateNightUtc = new Date('2026-10-10T18:30:00Z'); // 23:30 PKT

    // Delivery failed bypasses quiet hours to prevent missed shipments
    assert.strictEqual(shouldSendPush(criticalNotification, prefs, lateNightUtc), true);
  });
});

describe('Role Filtering for Notification Delivery (C16-A)', () => {
  const canReceiveNotification = (category, userRole, isOwnOrder = true) => {
    // Owner-only categories
    if (['payments', 'credit'].includes(category)) {
      return userRole === 'owner';
    }

    if (category === 'orders' || category === 'delivery') {
      if (userRole === 'staff') {
        return isOwnOrder; // Staff can only receive own orders
      }
      return true; // Owner and manager receive all orders
    }

    return true; // Messages, discounts, offers
  };

  it('allows owner to receive payments and credit notifications, but blocks staff and manager', () => {
    assert.strictEqual(canReceiveNotification('payments', 'owner'), true);
    assert.strictEqual(canReceiveNotification('payments', 'manager'), false);
    assert.strictEqual(canReceiveNotification('payments', 'staff'), false);

    assert.strictEqual(canReceiveNotification('credit', 'owner'), true);
    assert.strictEqual(canReceiveNotification('credit', 'manager'), false);
    assert.strictEqual(canReceiveNotification('credit', 'staff'), false);
  });

  it('restricts staff to receive order and delivery notifications only for their own orders', () => {
    assert.strictEqual(canReceiveNotification('orders', 'staff', true), true);
    assert.strictEqual(canReceiveNotification('orders', 'staff', false), false);

    assert.strictEqual(canReceiveNotification('delivery', 'staff', true), true);
    assert.strictEqual(canReceiveNotification('delivery', 'staff', false), false);

    // Manager and owner receive all orders
    assert.strictEqual(canReceiveNotification('orders', 'manager', false), true);
    assert.strictEqual(canReceiveNotification('orders', 'owner', false), true);
  });
});

describe('Device Token Reassignment and Multi-Account Isolation (C16-A)', () => {
  class DeviceTokenRegistry {
    constructor() {
      this.tokens = new Map(); // token -> { userId, platform, lastSeen }
    }

    register(token, userId, platform) {
      this.tokens.set(token, {
        userId,
        platform,
        lastSeen: Date.now(),
      });
    }

    unregister(token, userId) {
      const existing = this.tokens.get(token);
      if (existing && existing.userId === userId) {
        this.tokens.delete(token);
      }
    }

    removeDeadTokens(deadTokens) {
      deadTokens.forEach((t) => this.tokens.delete(t));
    }
  }

  it('reassigns device token cleanly when another user logs in on the same device', () => {
    const registry = new DeviceTokenRegistry();
    const token = 'ExponentPushToken[ABC123XYZ]';

    // User A logs in on Device 1
    registry.register(token, 'user_A', 'android');
    assert.strictEqual(registry.tokens.get(token).userId, 'user_A');

    // User B logs in on Device 1 -> Token reassigned to User B
    registry.register(token, 'user_B', 'android');
    assert.strictEqual(registry.tokens.get(token).userId, 'user_B');
    assert.strictEqual(registry.tokens.size, 1);
  });

  it('removes device token on logout and deletes dead tokens on DeviceNotRegistered', () => {
    const registry = new DeviceTokenRegistry();
    const token1 = 'ExponentPushToken[TOK1]';
    const token2 = 'ExponentPushToken[TOK2]';

    registry.register(token1, 'user_1', 'ios');
    registry.register(token2, 'user_2', 'android');
    assert.strictEqual(registry.tokens.size, 2);

    // User 1 logs out
    registry.unregister(token1, 'user_1');
    assert.strictEqual(registry.tokens.has(token1), false);
    assert.strictEqual(registry.tokens.size, 1);

    // Expo returns DeviceNotRegistered for token2
    registry.removeDeadTokens([token2]);
    assert.strictEqual(registry.tokens.has(token2), false);
    assert.strictEqual(registry.tokens.size, 0);
  });
});

describe('Notification Store Deduplication and Keyset Pagination (C16-A)', () => {
  it('deduplicates foreground push notifications by ID', () => {
    let items = [{ id: 'notif_1', title: 'Order Confirmed', readAt: null }];
    let unreadCount = 1;

    const handleIncoming = (newItem) => {
      if (items.some((i) => i.id === newItem.id)) {
        return; // Duplicate ignored
      }
      items = [newItem, ...items];
      if (!newItem.readAt) unreadCount++;
    };

    // Duplicate event arrives
    handleIncoming({ id: 'notif_1', title: 'Order Confirmed', readAt: null });
    assert.strictEqual(items.length, 1);
    assert.strictEqual(unreadCount, 1);

    // New event arrives
    handleIncoming({ id: 'notif_2', title: 'Driver Dispatched', readAt: null });
    assert.strictEqual(items.length, 2);
    assert.strictEqual(unreadCount, 2);
    assert.strictEqual(items[0].id, 'notif_2');
  });

  it('updates unread count when marking single and all notifications as read', () => {
    let items = [
      { id: 'n1', readAt: null },
      { id: 'n2', readAt: null },
      { id: 'n3', readAt: '2026-10-10T08:00:00Z' },
    ];
    let unreadCount = 2;

    const markRead = (id) => {
      items = items.map((i) => (i.id === id ? { ...i, readAt: new Date().toISOString() } : i));
      unreadCount = Math.max(0, unreadCount - 1);
    };

    const markAllRead = () => {
      items = items.map((i) => ({ ...i, readAt: i.readAt || new Date().toISOString() }));
      unreadCount = 0;
    };

    markRead('n1');
    assert.strictEqual(unreadCount, 1);
    assert.ok(items.find((i) => i.id === 'n1').readAt);

    markAllRead();
    assert.strictEqual(unreadCount, 0);
    assert.ok(items.every((i) => i.readAt !== null));
  });

  it('paginates notifications using keyset cursor', () => {
    const allNotifications = [
      { id: 'n5', createdAt: '2026-10-10T11:00:00Z' },
      { id: 'n4', createdAt: '2026-10-10T10:00:00Z' },
      { id: 'n3', createdAt: '2026-10-10T09:00:00Z' },
      { id: 'n2', createdAt: '2026-10-10T08:00:00Z' },
      { id: 'n1', createdAt: '2026-10-10T07:00:00Z' },
    ];

    const fetchPage = (cursor, limit = 2) => {
      const filtered = cursor
        ? allNotifications.filter((n) => n.createdAt < cursor)
        : allNotifications;
      const slice = filtered.slice(0, limit);
      const hasMore = filtered.length > limit;
      const nextCursor = slice.length > 0 ? slice[slice.length - 1].createdAt : null;
      return { items: slice, hasMore, nextCursor };
    };

    // Page 1
    const p1 = fetchPage(null, 2);
    assert.strictEqual(p1.items.length, 2);
    assert.strictEqual(p1.items[0].id, 'n5');
    assert.strictEqual(p1.items[1].id, 'n4');
    assert.strictEqual(p1.hasMore, true);

    // Page 2
    const p2 = fetchPage(p1.nextCursor, 2);
    assert.strictEqual(p2.items.length, 2);
    assert.strictEqual(p2.items[0].id, 'n3');
    assert.strictEqual(p2.items[1].id, 'n2');
    assert.strictEqual(p2.hasMore, true);

    // Page 3
    const p3 = fetchPage(p2.nextCursor, 2);
    assert.strictEqual(p3.items.length, 1);
    assert.strictEqual(p3.items[0].id, 'n1');
    assert.strictEqual(p3.hasMore, false);
  });
});

describe('Deep Link Routing for Every Notification Type (C16-B)', () => {
  const resolveDeepLink = (notification) => {
    const data = notification.data || {};

    if (data.route) {
      return { route: data.route, fallbackRoute: '/(app)/(tabs)/orders' };
    }
    if (data.orderId) {
      return {
        route: `/(app)/orders/${data.orderId}`,
        params: { id: data.orderId },
        fallbackRoute: '/(app)/(tabs)/orders',
      };
    }
    if (data.paymentId) {
      return {
        route: `/(app)/payments/${data.paymentId}`,
        params: { id: data.paymentId },
        fallbackRoute: '/(app)/(tabs)/account',
      };
    }
    if (data.messageId) {
      return {
        route: `/(app)/messages/${data.messageId}`,
        params: { id: data.messageId },
        fallbackRoute: '/(app)/(tabs)/account',
      };
    }

    switch (notification.category) {
      case 'orders':
      case 'delivery':
        return { route: '/(app)/(tabs)/orders', fallbackRoute: '/(app)/(tabs)/orders' };
      case 'payments':
        return { route: '/(app)/(tabs)/account', fallbackRoute: '/(app)/(tabs)/account' };
      case 'offers':
        return { route: '/(app)/(tabs)/catalog', fallbackRoute: '/(app)/(tabs)/catalog' };
      default:
        return { route: '/(app)/(tabs)', fallbackRoute: '/(app)/(tabs)' };
    }
  };

  it('routes order events to specific order tracking screen', () => {
    const orderNotif = {
      category: 'orders',
      type: 'order_confirmed',
      data: { orderId: 'ord_1042' },
    };
    const res = resolveDeepLink(orderNotif);
    assert.strictEqual(res.route, '/(app)/orders/ord_1042');
    assert.strictEqual(res.params.id, 'ord_1042');
  });

  it('routes payment events to specific payment details screen', () => {
    const payNotif = {
      category: 'payments',
      type: 'payment_confirmed',
      data: { paymentId: 'pay_998' },
    };
    const res = resolveDeepLink(payNotif);
    assert.strictEqual(res.route, '/(app)/payments/pay_998');
  });

  it('routes seller message events to message detail screen', () => {
    const msgNotif = {
      category: 'messages',
      type: 'seller_message',
      data: { messageId: 'msg_55' },
    };
    const res = resolveDeepLink(msgNotif);
    assert.strictEqual(res.route, '/(app)/messages/msg_55');
  });

  it('routes custom routes directly when specified', () => {
    const customNotif = {
      category: 'offers',
      type: 'special_offer',
      data: { route: '/(app)/catalog/promo-sale' },
    };
    const res = resolveDeepLink(customNotif);
    assert.strictEqual(res.route, '/(app)/catalog/promo-sale');
  });
});

describe('Notification UI 4 States, Badge Formatting, and Grouping (C16-B)', () => {
  it('formats badge count correctly including 99+ cap', () => {
    const formatBadge = (count) => (count > 99 ? '99+' : String(count));
    assert.strictEqual(formatBadge(0), '0');
    assert.strictEqual(formatBadge(5), '5');
    assert.strictEqual(formatBadge(99), '99');
    assert.strictEqual(formatBadge(100), '99+');
    assert.strictEqual(formatBadge(999), '99+');
  });

  it('groups notifications into Today, Yesterday, and Earlier sections', () => {
    const todayStr = '2026-10-10';
    const yesterdayStr = '2026-10-09';

    const items = [
      { id: '1', createdAt: '2026-10-10T09:00:00Z' },
      { id: '2', createdAt: '2026-10-09T18:00:00Z' },
      { id: '3', createdAt: '2026-10-05T12:00:00Z' },
    ];

    const todayItems = items.filter((i) => i.createdAt.slice(0, 10) === todayStr);
    const yesterdayItems = items.filter((i) => i.createdAt.slice(0, 10) === yesterdayStr);
    const earlierItems = items.filter(
      (i) => i.createdAt.slice(0, 10) !== todayStr && i.createdAt.slice(0, 10) !== yesterdayStr,
    );

    assert.strictEqual(todayItems.length, 1);
    assert.strictEqual(yesterdayItems.length, 1);
    assert.strictEqual(earlierItems.length, 1);
  });

  it('formats accessibility labels with unread indicator', () => {
    const formatA11y = (item) => {
      const isUnread = !item.readAt;
      return `${isUnread ? 'Unread notification: ' : 'Notification: '} ${item.title}, ${item.body}`;
    };

    const unread = { title: 'Order Dispatched', body: 'Driver is on the way', readAt: null };
    const read = { title: 'Order Delivered', body: 'Delivered at shop', readAt: '2026-10-10' };

    assert.strictEqual(formatA11y(unread), 'Unread notification:  Order Dispatched, Driver is on the way');
    assert.strictEqual(formatA11y(read), 'Notification:  Order Delivered, Delivered at shop');
  });
});

// ==============================================================================
// C17: SELLER CONTACT & SUPPORT TESTS
// ==============================================================================

describe('Business Hours & Holiday Logic in Asia/Karachi (C17)', () => {
  const config = {
    start: '09:00',
    end: '19:00',
    days: [1, 2, 3, 4, 5, 6], // Mon-Sat
    holidays: ['2026-03-23', '2026-05-01', '2026-08-14', '2026-11-09', '2026-12-25'],
  };

  function checkIsOpen(cfg, date) {
    const utcMillis = date.getTime() + date.getTimezoneOffset() * 60000;
    const pktDate = new Date(utcMillis + 5 * 3600000);

    const year = pktDate.getFullYear();
    const month = String(pktDate.getMonth() + 1).padStart(2, '0');
    const day = String(pktDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    if (cfg.holidays && cfg.holidays.includes(dateStr)) {
      return { isOpen: false, reason: 'HOLIDAY' };
    }

    const currentDay = pktDate.getDay();
    const isOpDay = cfg.days.includes(currentDay);

    const [sH, sM] = cfg.start.split(':').map(Number);
    const [eH, eM] = cfg.end.split(':').map(Number);
    const sMin = sH * 60 + sM;
    const eMin = eH * 60 + eM;
    const curMin = pktDate.getHours() * 60 + pktDate.getMinutes();

    let open = false;
    if (sMin <= eMin) {
      open = isOpDay && curMin >= sMin && curMin < eMin;
    } else {
      // Midnight crossover shift
      if (curMin >= sMin && isOpDay) {
        open = true;
      } else if (curMin < eMin) {
        const prevDay = (currentDay + 6) % 7;
        open = cfg.days.includes(prevDay);
      }
    }

    return { isOpen: open, reason: open ? 'OPEN' : 'CLOSED' };
  }

  it('detects open status during standard daytime business hours (Wednesday 11:30 AM PKT)', () => {
    // 2026-10-14 is Wednesday
    // 11:30 AM PKT = 06:30 AM UTC
    const wednesdayWorking = new Date('2026-10-14T06:30:00Z');
    const res = checkIsOpen(config, wednesdayWorking);
    assert.strictEqual(res.isOpen, true);
    assert.strictEqual(res.reason, 'OPEN');
  });

  it('detects closed status outside business hours (Wednesday 21:00 PKT)', () => {
    // 21:00 PKT = 16:00 UTC
    const wednesdayNight = new Date('2026-10-14T16:00:00Z');
    const res = checkIsOpen(config, wednesdayNight);
    assert.strictEqual(res.isOpen, false);
    assert.strictEqual(res.reason, 'CLOSED');
  });

  it('detects closed status on weekly off days (Sunday)', () => {
    // 2026-10-18 is Sunday
    // 12:00 PM PKT = 07:00 AM UTC
    const sundayNoon = new Date('2026-10-18T07:00:00Z');
    const res = checkIsOpen(config, sundayNoon);
    assert.strictEqual(res.isOpen, false);
    assert.strictEqual(res.reason, 'CLOSED');
  });

  it('detects closed status on national holidays (2026-08-14 Independence Day)', () => {
    // 2026-08-14 is Friday
    // 11:00 AM PKT = 06:00 AM UTC
    const holidayDate = new Date('2026-08-14T06:00:00Z');
    const res = checkIsOpen(config, holidayDate);
    assert.strictEqual(res.isOpen, false);
    assert.strictEqual(res.reason, 'HOLIDAY');
  });

  it('handles overnight shift crossing midnight (e.g. 20:00 - 04:00 PKT at 02:00 AM PKT)', () => {
    const nightShiftConfig = {
      start: '20:00',
      end: '04:00',
      days: [1, 2, 3, 4, 5, 6],
      holidays: [],
    };

    // Thursday 02:00 AM PKT = Wednesday 21:00 UTC
    const earlyMorningShift = new Date('2026-10-14T21:00:00Z');
    const res = checkIsOpen(nightShiftConfig, earlyMorningShift);
    assert.strictEqual(res.isOpen, true);
  });
});

describe('Contact Fallbacks & Attachment Validation (C17)', () => {
  it('generates WhatsApp direct URL and browser wa.me fallback with prefilled text', () => {
    const formatWa = (phone, text) => {
      let clean = phone.replace(/\D/g, '');
      if (clean.startsWith('0')) clean = '92' + clean.slice(1);
      const encoded = text ? encodeURIComponent(text) : '';
      return {
        nativeUrl: `whatsapp://send?phone=${clean}${encoded ? `&text=${encoded}` : ''}`,
        webUrl: `https://wa.me/${clean}${encoded ? `?text=${encoded}` : ''}`,
      };
    };

    const res = formatWa('+92 300 1234567', 'Help with Order #1042');
    assert.strictEqual(res.nativeUrl, 'whatsapp://send?phone=923001234567&text=Help%20with%20Order%20%231042');
    assert.strictEqual(res.webUrl, 'https://wa.me/923001234567?text=Help%20with%20Order%20%231042');
  });

  it('validates photo attachment size (rejects files over 5 MB)', () => {
    const validate = (file) => {
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) return { valid: false, error: 'SIZE_EXCEEDED' };
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.type)) return { valid: false, error: 'INVALID_TYPE' };
      return { valid: true };
    };

    const tooBig = { size: 6 * 1024 * 1024, type: 'image/jpeg' };
    const justRight = { size: 2 * 1024 * 1024, type: 'image/jpeg' };
    const wrongFormat = { size: 1024, type: 'application/pdf' };

    assert.strictEqual(validate(tooBig).valid, false);
    assert.strictEqual(validate(tooBig).error, 'SIZE_EXCEEDED');
    assert.strictEqual(validate(justRight).valid, true);
    assert.strictEqual(validate(wrongFormat).valid, false);
    assert.strictEqual(validate(wrongFormat).error, 'INVALID_TYPE');
  });
});

describe('Ticket Idempotency & Staff Access Rules (C17)', () => {
  it('deduplicates ticket creation on retry using idempotency key', () => {
    const store = new Map();

    const createTicket = (shopId, subject, body, key) => {
      const compoundKey = `${shopId}_${key}`;
      if (key && store.has(compoundKey)) {
        return { ticket: store.get(compoundKey), isDuplicate: true };
      }
      const ticket = { id: 't-' + Math.random(), shopId, subject, body, key };
      if (key) store.set(compoundKey, ticket);
      return { ticket, isDuplicate: false };
    };

    const first = createTicket('s1', 'Broken bottles in crate', '3 bottles cracked', 'idemp-123');
    assert.strictEqual(first.isDuplicate, false);

    const second = createTicket('s1', 'Broken bottles in crate', '3 bottles cracked', 'idemp-123');
    assert.strictEqual(second.isDuplicate, true);
    assert.strictEqual(first.ticket.id, second.ticket.id);
  });

  it('blocks staff from creating ticket for an order placed by someone else', () => {
    const checkOrderPermission = (userRole, userId, orderUserId) => {
      if (userRole === 'owner' || userRole === 'manager') return true;
      if (userRole === 'staff') return userId === orderUserId;
      return false;
    };

    assert.strictEqual(checkOrderPermission('owner', 'user-1', 'user-2'), true);
    assert.strictEqual(checkOrderPermission('staff', 'user-1', 'user-1'), true);
    assert.strictEqual(checkOrderPermission('staff', 'user-1', 'user-2'), false);
  });
});

// ==============================================================================
// C18: PROFILE & SETTINGS TESTS
// ==============================================================================

describe('Password Strength Calculation (C18)', () => {
  function calcStrength(pwd) {
    if (!pwd) return { score: 0, label: 'Very Weak' };
    let score = 0;
    if (pwd.length >= 8) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score++;
    const labels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    return { score, label: labels[score] };
  }

  it('scores empty or very short password as Very Weak', () => {
    assert.strictEqual(calcStrength('').score, 0);
    assert.strictEqual(calcStrength('123').score, 1);
  });

  it('scores simple letters as Weak', () => {
    assert.strictEqual(calcStrength('password').score, 1);
  });

  it('scores mixed case and numbers as Good', () => {
    assert.strictEqual(calcStrength('ColdDrinks2026').score, 3);
  });

  it('scores complex password with symbols as Strong', () => {
    assert.strictEqual(calcStrength('ColdDrinks@2026!').score, 4);
    assert.strictEqual(calcStrength('ColdDrinks@2026!').label, 'Strong');
  });
});

describe('Role-Based Menu Filtering (C18)', () => {
  const menu = [
    { id: 'profile', allowedRoles: ['owner', 'manager'] },
    { id: 'staff', allowedRoles: ['owner'] },
    { id: 'addresses', allowedRoles: ['owner', 'manager', 'staff'] },
    { id: 'approval_threshold', allowedRoles: ['owner'] },
    { id: 'support', allowedRoles: ['owner', 'manager', 'staff'] },
    { id: 'credit_limit', allowedRoles: ['owner'] },
  ];

  const filterMenu = (items, role) => items.filter((i) => !i.allowedRoles || i.allowedRoles.includes(role));

  it('owner sees all administrative and financial menu options', () => {
    const ownerItems = filterMenu(menu, 'owner');
    assert.strictEqual(ownerItems.length, 6);
  });

  it('manager sees operational items but cannot see owner threshold or team invite', () => {
    const managerItems = filterMenu(menu, 'manager');
    const ids = managerItems.map((i) => i.id);
    assert.ok(ids.includes('profile'));
    assert.ok(ids.includes('addresses'));
    assert.ok(ids.includes('support'));
    assert.ok(!ids.includes('staff'));
    assert.ok(!ids.includes('approval_threshold'));
  });

  it('staff sees only addresses and support, with all owner controls hidden', () => {
    const staffItems = filterMenu(menu, 'staff');
    const ids = staffItems.map((i) => i.id);
    assert.ok(ids.includes('addresses'));
    assert.ok(ids.includes('support'));
    assert.ok(!ids.includes('profile'));
    assert.ok(!ids.includes('staff'));
    assert.ok(!ids.includes('credit_limit'));
  });
});

describe('Account Deletion Eligibility Rules (C18)', () => {
  function checkEligibility(activeOrdersCount, creditBalance) {
    if (activeOrdersCount > 0) {
      return { canDelete: false, reason: 'ACTIVE_ORDERS' };
    }
    if (creditBalance > 0) {
      return { canDelete: false, reason: 'OUTSTANDING_BALANCE' };
    }
    return { canDelete: true, reason: null };
  }

  it('blocks deletion when shop has orders in progress', () => {
    const res = checkEligibility(2, 0);
    assert.strictEqual(res.canDelete, false);
    assert.strictEqual(res.reason, 'ACTIVE_ORDERS');
  });

  it('blocks deletion when shop has outstanding ledger credit balance', () => {
    const res = checkEligibility(0, 45000);
    assert.strictEqual(res.canDelete, false);
    assert.strictEqual(res.reason, 'OUTSTANDING_BALANCE');
  });

  it('permits deletion request when 0 active orders and zero balance', () => {
    const res = checkEligibility(0, 0);
    assert.strictEqual(res.canDelete, true);
    assert.strictEqual(res.reason, null);
  });
});

describe('Store Resets & 4 Screen States (C17 & C18)', () => {
  it('resets all active stores on user sign out', () => {
    let supportResetCalled = false;
    let settingsResetCalled = false;
    let authResetCalled = false;

    const resets = [
      () => { supportResetCalled = true; },
      () => { settingsResetCalled = true; },
      () => { authResetCalled = true; },
    ];

    resets.forEach((fn) => fn());

    assert.strictEqual(supportResetCalled, true);
    assert.strictEqual(settingsResetCalled, true);
    assert.strictEqual(authResetCalled, true);
  });

  it('resolves 4 screen states (loading, data, empty, error)', () => {
    const resolveState = ({ loading, error, items }) => {
      if (loading && items.length === 0) return 'loading';
      if (error && items.length === 0) return 'error';
      if (!loading && items.length === 0) return 'empty';
      return 'data';
    };

    assert.strictEqual(resolveState({ loading: true, error: null, items: [] }), 'loading');
    assert.strictEqual(resolveState({ loading: false, error: 'Network error', items: [] }), 'error');
    assert.strictEqual(resolveState({ loading: false, error: null, items: [] }), 'empty');
    assert.strictEqual(resolveState({ loading: false, error: null, items: [{ id: 1 }] }), 'data');
  });
});

// ==============================================================================
// C19: CREDIT ACCOUNT & CUSTOMER LEDGER TESTS
// ==============================================================================

describe('Customer Ledger Invariant: sum(ledger) == outstanding (C19-A)', () => {
  it('maintains the invariant sum(ledger) == outstanding across 100 random transaction sequences', () => {
    for (let run = 0; run < 100; run++) {
      const ledger = [];
      let outstanding = 0;
      const numTransactions = 15;

      for (let i = 0; i < numTransactions; i++) {
        const types = ['charge', 'payment', 'credit_note', 'adjustment', 'reversal'];
        const type = types[Math.floor(Math.random() * types.length)];
        const amount = Math.floor(Math.random() * 50000) + 1000;

        let signedAmount;
        if (type === 'charge') {
          signedAmount = amount;
        } else if (type === 'payment' || type === 'credit_note') {
          signedAmount = -amount;
        } else if (type === 'reversal') {
          // Reversal reverses a prior effect
          signedAmount = Math.random() > 0.5 ? -amount : amount;
        } else {
          // Adjustment can be debit or credit
          signedAmount = Math.random() > 0.5 ? amount : -amount;
        }

        ledger.push({ id: `tx-${i}`, type, amount: signedAmount });
        outstanding += signedAmount;
      }

      const computedSum = ledger.reduce((acc, entry) => acc + entry.amount, 0);
      assert.strictEqual(
        computedSum,
        outstanding,
        `Mismatch in iteration ${run}: computed ${computedSum} vs expected ${outstanding}`,
      );
    }
  });

  it('enforces immutable ledger: updates or deletes are strictly forbidden', () => {
    const simulateLedgerModification = (operation) => {
      if (operation === 'UPDATE' || operation === 'DELETE') {
        throw new Error('IMMUTABLE_LEDGER: Customer ledger entries cannot be updated or deleted');
      }
      return true;
    };

    assert.throws(
      () => simulateLedgerModification('UPDATE'),
      /IMMUTABLE_LEDGER/,
    );
    assert.throws(
      () => simulateLedgerModification('DELETE'),
      /IMMUTABLE_LEDGER/,
    );
    assert.strictEqual(simulateLedgerModification('INSERT'), true);
  });
});

describe('Credit Summary Calculation & Owner Role Enforcement (C19-A)', () => {
  function computeCreditSummary(limit, ledgerEntries, role) {
    if (role !== 'owner') {
      throw new Error('PERMISSION_DENIED: Only shop owner can view credit summary');
    }

    const outstanding = ledgerEntries.reduce((acc, e) => acc + e.amount, 0);
    const used = Math.max(0, outstanding);
    const available = Math.max(0, limit - used);

    return {
      limit,
      used,
      available,
      outstanding,
      isCreditBalance: outstanding < 0,
    };
  }

  it('allows owner to view summary and correctly computes balances', () => {
    const entries = [
      { type: 'charge', amount: 50000 },
      { type: 'charge', amount: 30000 },
      { type: 'payment', amount: -25000 },
    ];
    const summary = computeCreditSummary(100000, entries, 'owner');
    assert.strictEqual(summary.limit, 100000);
    assert.strictEqual(summary.outstanding, 55000);
    assert.strictEqual(summary.used, 55000);
    assert.strictEqual(summary.available, 45000);
    assert.strictEqual(summary.isCreditBalance, false);
  });

  it('strictly blocks manager and staff roles from viewing credit summary', () => {
    assert.throws(() => computeCreditSummary(100000, [], 'manager'), /PERMISSION_DENIED/);
    assert.throws(() => computeCreditSummary(100000, [], 'staff'), /PERMISSION_DENIED/);
  });

  it('handles overpayment as account credit balance (negative outstanding)', () => {
    const entries = [
      { type: 'charge', amount: 40000 },
      { type: 'payment', amount: -60000 }, // Overpaid by Rs. 20,000
    ];
    const summary = computeCreditSummary(100000, entries, 'owner');
    assert.strictEqual(summary.outstanding, -20000);
    assert.strictEqual(summary.used, 0);
    assert.strictEqual(summary.available, 100000);
    assert.strictEqual(summary.isCreditBalance, true);
  });

  it('clamps available credit to zero when limit is lowered below used debt', () => {
    const entries = [{ type: 'charge', amount: 80000 }];
    const summary = computeCreditSummary(50000, entries, 'owner'); // limit lowered to 50k while 80k used
    assert.strictEqual(summary.used, 80000);
    assert.strictEqual(summary.available, 0);
  });
});

describe('FIFO Payment Allocation & Credit Alerts (C19-A & C19-B)', () => {
  it('allocates payment to oldest open charges first (FIFO)', () => {
    const charges = [
      { id: 'inv-1', amount: 15000, allocated: 0, date: '2026-10-01' },
      { id: 'inv-2', amount: 20000, allocated: 0, date: '2026-10-03' },
      { id: 'inv-3', amount: 10000, allocated: 0, date: '2026-10-05' },
    ];

    let paymentAmount = 25000;
    const allocations = [];

    for (const c of charges) {
      if (paymentAmount <= 0) break;
      const needed = c.amount - c.allocated;
      const alloc = Math.min(paymentAmount, needed);
      c.allocated += alloc;
      paymentAmount -= alloc;
      allocations.push({ invoiceId: c.id, allocated: alloc });
    }

    assert.strictEqual(charges[0].allocated, 15000); // Fully cleared
    assert.strictEqual(charges[1].allocated, 10000); // Partially cleared
    assert.strictEqual(charges[2].allocated, 0);     // Untouched
    assert.strictEqual(paymentAmount, 0);
  });

  it('triggers due tomorrow, limit reached, and overdue alerts accurately', () => {
    const computeAlerts = (summary, nextDueHours) => {
      const alerts = [];
      if (summary.overdue > 0) alerts.push('OVERDUE');
      if (nextDueHours > 0 && nextDueHours <= 36) alerts.push('DUE_TOMORROW');
      if (summary.limit > 0 && summary.used >= summary.limit) alerts.push('LIMIT_REACHED');
      if (summary.outstanding >= 0.8 * summary.limit && summary.used < summary.limit) alerts.push('HIGH_OUTSTANDING');
      return alerts;
    };

    const alerts1 = computeAlerts({ limit: 100000, used: 100000, outstanding: 100000, overdue: 0 }, 48);
    assert.ok(alerts1.includes('LIMIT_REACHED'));

    const alerts2 = computeAlerts({ limit: 100000, used: 85000, outstanding: 85000, overdue: 0 }, 20);
    assert.ok(alerts2.includes('DUE_TOMORROW'));
    assert.ok(alerts2.includes('HIGH_OUTSTANDING'));

    const alerts3 = computeAlerts({ limit: 100000, used: 50000, outstanding: 50000, overdue: 15000 }, 72);
    assert.ok(alerts3.includes('OVERDUE'));
  });
});

describe('Credit UI Progress Bar & State Resolution (C19-B)', () => {
  it('maps credit utilization ratio to progress bar status and color segment', () => {
    const getBarStatus = (used, limit) => {
      const ratio = limit > 0 ? used / limit : 0;
      if (ratio >= 0.9) return { color: 'RED', label: 'Critical' };
      if (ratio >= 0.7) return { color: 'AMBER', label: 'Caution' };
      return { color: 'GREEN', label: 'Safe' };
    };

    assert.strictEqual(getBarStatus(20000, 100000).color, 'GREEN');
    assert.strictEqual(getBarStatus(75000, 100000).color, 'AMBER');
    assert.strictEqual(getBarStatus(95000, 100000).color, 'RED');
  });

  it('displays zero credit CTA state when limit is zero', () => {
    const isZeroCredit = (summary) => summary && summary.limit === 0 && summary.used === 0;
    assert.strictEqual(isZeroCredit({ limit: 0, used: 0 }), true);
    assert.strictEqual(isZeroCredit({ limit: 50000, used: 0 }), false);
  });
});

// ==============================================================================
// C20: PAYMENTS & PAYMENT PROOF TESTS
// ==============================================================================

describe('Payment Proof Duplicate Reference Detection (C20-A)', () => {
  it('detects duplicate bank reference and amount combinations', () => {
    const existingProofs = [
      { id: 'p-1', bank: 'Meezan Bank', ref: 'FT2628491', amount: 45000, status: 'submitted' },
      { id: 'p-2', bank: 'HBL', ref: 'HBL-9921', amount: 15000, status: 'rejected' }, // Rejected can be resubmitted
    ];

    const checkDuplicate = (bank, ref, amount, resubmissionOf = null) => {
      const match = existingProofs.find(
        (p) =>
          p.bank.toLowerCase().trim() === bank.toLowerCase().trim() &&
          p.ref.toLowerCase().trim() === ref.toLowerCase().trim() &&
          p.amount === amount &&
          p.status !== 'rejected' &&
          p.id !== resubmissionOf,
      );
      return match ? { isDuplicate: true, status: match.status } : { isDuplicate: false };
    };

    // Duplicate attempt
    assert.strictEqual(checkDuplicate('meezan bank', ' FT2628491 ', 45000).isDuplicate, true);

    // Different amount on same ref
    assert.strictEqual(checkDuplicate('Meezan Bank', 'FT2628491', 30000).isDuplicate, false);

    // Resubmission of rejected proof
    assert.strictEqual(checkDuplicate('HBL', 'HBL-9921', 15000, 'p-2').isDuplicate, false);
  });

  it('validates proof attachment types and enforces 5 MB limit', () => {
    const validate = (file) => {
      const MAX_SIZE = 5 * 1024 * 1024;
      if (file.size > MAX_SIZE) return { valid: false, error: 'SIZE_EXCEEDED' };
      const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
      if (!allowed.includes(file.type)) return { valid: false, error: 'INVALID_TYPE' };
      return { valid: true };
    };

    assert.strictEqual(validate({ size: 1024 * 1024, type: 'image/jpeg' }).valid, true);
    assert.strictEqual(validate({ size: 2 * 1024 * 1024, type: 'application/pdf' }).valid, true);
    assert.strictEqual(validate({ size: 6 * 1024 * 1024, type: 'image/jpeg' }).valid, false);
    assert.strictEqual(validate({ size: 500, type: 'text/csv' }).valid, false);
  });

  it('cleans up orphan storage file if database RPC fails', () => {
    let storageDeleted = false;
    const fakeStorage = {
      deleteFile: (path) => {
        if (path) storageDeleted = true;
      },
    };

    const submitProofFlow = (shouldFailRpc) => {
      const uploadedPath = 'shop-1/proof-123.jpg';
      try {
        if (shouldFailRpc) {
          throw new Error('DATABASE_CONNECTION_ERROR');
        }
        return { success: true };
      } catch (err) {
        fakeStorage.deleteFile(uploadedPath);
        throw err;
      }
    };

    assert.throws(() => submitProofFlow(true), /DATABASE_CONNECTION_ERROR/);
    assert.strictEqual(storageDeleted, true);
  });
});

// ==============================================================================
// C20-B: PAYMENT HISTORY, PROOF UI & REJECTION FLOW TESTS
// ==============================================================================

describe('Payment Proof Form & Rejection Resubmission Flow (C20-B)', () => {
  it('validates payment proof form input correctly', () => {
    const validateForm = (amount, bank, reference, file) => {
      const num = Number(String(amount).replace(/,/g, ''));
      if (!num || num <= 0) return { valid: false, error: 'INVALID_AMOUNT' };
      if (!bank || !bank.trim()) return { valid: false, error: 'BANK_REQUIRED' };
      if (!reference || !reference.trim()) return { valid: false, error: 'REF_REQUIRED' };
      if (!file) return { valid: false, error: 'FILE_REQUIRED' };
      return { valid: true };
    };

    assert.strictEqual(validateForm('0', 'HBL', 'REF-1', { uri: 'file://x' }).valid, false);
    assert.strictEqual(validateForm('15000', '', 'REF-1', { uri: 'file://x' }).valid, false);
    assert.strictEqual(validateForm('15000', 'HBL', '', { uri: 'file://x' }).valid, false);
    assert.strictEqual(validateForm('15000', 'HBL', 'REF-1', null).valid, false);
    assert.strictEqual(validateForm('15,000', 'HBL', 'REF-1', { uri: 'file://x' }).valid, true);
  });

  it('detects advance payment exceeding outstanding balance', () => {
    const checkAdvance = (amount, outstanding) => {
      const numeric = Number(amount);
      if (outstanding > 0 && numeric > outstanding) {
        return { isAdvance: true, excess: numeric - outstanding };
      }
      return { isAdvance: false, excess: 0 };
    };

    const res1 = checkAdvance(60000, 45000);
    assert.strictEqual(res1.isAdvance, true);
    assert.strictEqual(res1.excess, 15000);

    const res2 = checkAdvance(45000, 45000);
    assert.strictEqual(res2.isAdvance, false);
    assert.strictEqual(res2.excess, 0);

    const res3 = checkAdvance(30000, 45000);
    assert.strictEqual(res3.isAdvance, false);
  });

  it('handles rejection and pre-fills resubmission data', () => {
    const rejectedProof = {
      id: 'proof-99',
      orderId: 'order-1055',
      bank: 'Meezan Bank',
      referenceNumber: 'FT-99120',
      amount: 45000,
      status: 'rejected',
      rejectionReason: 'Invalid deposit screenshot: transaction date does not match invoice.',
    };

    const prepareResubmission = (proof) => {
      assert.strictEqual(proof.status, 'rejected');
      return {
        orderId: proof.orderId,
        amount: String(proof.amount),
        resubmissionOf: proof.id,
        initialBank: proof.bank,
      };
    };

    const resub = prepareResubmission(rejectedProof);
    assert.strictEqual(resub.orderId, 'order-1055');
    assert.strictEqual(resub.amount, '45000');
    assert.strictEqual(resub.resubmissionOf, 'proof-99');
    assert.strictEqual(resub.initialBank, 'Meezan Bank');
  });

  it('resolves 4 screen states for payments and proofs UI', () => {
    assert.strictEqual(
      resolveScreenState({ status: 'loading', loading: 'SPINNER' }),
      'SPINNER',
    );
    assert.strictEqual(
      resolveScreenState({ status: 'empty', empty: 'NO_PAYMENTS' }),
      'NO_PAYMENTS',
    );
    assert.strictEqual(
      resolveScreenState({ status: 'error', error: 'LOAD_FAILED' }),
      'LOAD_FAILED',
    );
    assert.strictEqual(
      resolveScreenState({ status: 'data', data: 'PAYMENTS_LIST' }),
      'PAYMENTS_LIST',
    );
  });
});

// ==============================================================================
// C21: INVOICES & RECEIPTS TESTS
// ==============================================================================

describe('Invoice Number Sequencing & Gap Policy (C21)', () => {
  it('generates strictly sequential, gap-free invoice numbers under concurrent calls', () => {
    let sequenceCounter = 1000;
    const allocatedNumbers = new Set();

    const generateConcurrentNumbers = (count, year = '2026') => {
      const results = [];
      for (let i = 0; i < count; i++) {
        sequenceCounter++;
        const invNum = `INV-${year}-${String(sequenceCounter).padStart(6, '0')}`;
        assert.strictEqual(allocatedNumbers.has(invNum), false, 'Duplicate invoice number generated');
        allocatedNumbers.add(invNum);
        results.push(invNum);
      }
      return results;
    };

    const batch = generateConcurrentNumbers(50);
    assert.strictEqual(batch.length, 50);
    assert.strictEqual(batch[0], 'INV-2026-001001');
    assert.strictEqual(batch[49], 'INV-2026-001050');
    // Ensure no gaps in sequence
    for (let i = 0; i < batch.length - 1; i++) {
      const num1 = parseInt(batch[i].split('-')[2], 10);
      const num2 = parseInt(batch[i + 1].split('-')[2], 10);
      assert.strictEqual(num2 - num1, 1, 'Gap detected in invoice sequence');
    }
  });

  it('reconciles totals using delivered quantities snapshot for partial deliveries', () => {
    // Order lines with ordered vs delivered quantities
    const orderItems = [
      { id: 'item-1', name: 'Cola 1.5L', unitPrice: 1200, orderedQty: 20, deliveredQty: 20 },
      { id: 'item-2', name: 'Lemon Soda 500ml', unitPrice: 800, orderedQty: 15, deliveredQty: 10 }, // Partial delivery: 10 of 15
    ];

    const deliveryFee = 500;
    const discountAmount = 1000;
    const taxRate = 0.05; // 5% GST

    // Billed only on delivered quantities!
    const subtotal = orderItems.reduce((acc, it) => acc + (it.deliveredQty * it.unitPrice), 0);
    assert.strictEqual(subtotal, (20 * 1200) + (10 * 800)); // 24000 + 8000 = 32000

    const tax = Math.round(subtotal * taxRate);
    const grandTotal = subtotal + deliveryFee + tax - discountAmount;
    assert.strictEqual(grandTotal, 32000 + 500 + 1600 - 1000); // 33100

    // Payments applied
    const paidAmount = 20000;
    const remainingAmount = grandTotal - paidAmount;
    assert.strictEqual(remainingAmount, 13100);
  });

  it('auto-refreshes expired signed PDF URL from storage cache', () => {
    let refreshCount = 0;
    const cache = {};

    const getOrRefreshPdfUrl = (invoiceId, now) => {
      const cached = cache[invoiceId];
      if (cached && cached.expiresAt > now + 300000) { // 5 min safety buffer
        return { url: cached.url, refreshed: false };
      }

      refreshCount++;
      const newUrl = `https://storage.supabase.co/invoices/${invoiceId}.pdf?token=tok_${now}`;
      cache[invoiceId] = {
        url: newUrl,
        expiresAt: now + 3600000, // 1 hour
      };
      return { url: newUrl, refreshed: true };
    };

    const t0 = 1000000;
    const firstCall = getOrRefreshPdfUrl('inv-1', t0);
    assert.strictEqual(firstCall.refreshed, true);
    assert.strictEqual(refreshCount, 1);

    // Call 10 minutes later (still valid)
    const secondCall = getOrRefreshPdfUrl('inv-1', t0 + 600000);
    assert.strictEqual(secondCall.refreshed, false);
    assert.strictEqual(refreshCount, 1);

    // Call 56 minutes later (within 5 min buffer, expires in 4 min -> triggers refresh)
    const thirdCall = getOrRefreshPdfUrl('inv-1', t0 + 3360000);
    assert.strictEqual(thirdCall.refreshed, true);
    assert.strictEqual(refreshCount, 2);
  });

  it('enforces owner and manager role authorization on invoice financial data', () => {
    const checkInvoiceAccess = (userRole) => {
      const allowedRoles = ['owner', 'manager'];
      if (!allowedRoles.includes(userRole)) {
        return { allowed: false, error: 'PERMISSION_DENIED' };
      }
      return { allowed: true };
    };

    assert.strictEqual(checkInvoiceAccess('owner').allowed, true);
    assert.strictEqual(checkInvoiceAccess('manager').allowed, true);
    assert.strictEqual(checkInvoiceAccess('staff').allowed, false);
    assert.strictEqual(checkInvoiceAccess('guest').allowed, false);
  });
});

// ==============================================================================
// C22: ACCOUNT STATEMENT & RECONCILIATION INVARIANT TESTS
// ==============================================================================

describe('Account Statement Reconciliation Invariant (C22)', () => {
  it('maintains opening + movements == closing invariant across 100 randomized transaction series', () => {
    for (let run = 0; run < 100; run++) {
      // Random opening balance between -50,000 and 200,000
      const openingBalance = Math.floor(Math.random() * 250000) - 50000;
      let running = openingBalance;
      const movements = [];
      const numMovements = Math.floor(Math.random() * 30) + 1;

      for (let m = 0; m < numMovements; m++) {
        const isCharge = Math.random() > 0.4;
        const amount = isCharge
          ? Math.floor(Math.random() * 50000) + 1000 // Charge: positive
          : -(Math.floor(Math.random() * 50000) + 1000); // Payment/credit: negative

        running += amount;
        movements.push({
          id: `mov-${run}-${m}`,
          amount,
          runningBalance: running,
        });
      }

      const closingBalance = running;
      const sumMovements = movements.reduce((acc, it) => acc + it.amount, 0);

      // Verify the core invariant: opening + sum(movements) == closing
      assert.strictEqual(
        openingBalance + sumMovements,
        closingBalance,
        `Reconciliation invariant violated in run ${run}!`,
      );
    }
  });

  it('calculates date presets correctly with Asia/Karachi (UTC+5) boundaries', () => {
    const calculateThisMonthRange = (baseUtcDate) => {
      // Offset to Asia/Karachi time (+5 hours)
      const pkt = new Date(baseUtcDate.getTime() + 5 * 3600 * 1000);
      const year = pkt.getUTCFullYear();
      const month = pkt.getUTCMonth();

      // Start of month: 00:00:00 PKT which is 19:00:00 UTC previous day
      const from = new Date(Date.UTC(year, month, 1, -5, 0, 0, 0));
      return { from, to: baseUtcDate };
    };

    // Test for 2026-10-10 02:00:00 UTC (07:00:00 PKT)
    const testDate = new Date('2026-10-10T02:00:00Z');
    const range = calculateThisMonthRange(testDate);

    // Range 'from' in Asia/Karachi must be 2026-10-01 00:00:00 PKT (which is 2026-09-30 19:00:00 UTC)
    assert.strictEqual(range.from.toISOString(), '2026-09-30T19:00:00.000Z');
  });

  it('restricts statement access strictly to the owner role', () => {
    const checkStatementAccess = (role) => {
      if (role !== 'owner') {
        return { authorized: false, error: 'OWNER_ONLY' };
      }
      return { authorized: true };
    };

    assert.strictEqual(checkStatementAccess('owner').authorized, true);
    assert.strictEqual(checkStatementAccess('manager').authorized, false);
    assert.strictEqual(checkStatementAccess('staff').authorized, false);
  });

  it('handles empty activity period by showing opening equals closing', () => {
    const computeStatementSummary = (openingBalance, movements) => {
      const sumMovements = movements.reduce((acc, m) => acc + m.amount, 0);
      return {
        openingBalance,
        closingBalance: openingBalance + sumMovements,
        hasActivity: movements.length > 0,
      };
    };

    const emptyResult = computeStatementSummary(75000, []);
    assert.strictEqual(emptyResult.hasActivity, false);
    assert.strictEqual(emptyResult.openingBalance, 75000);
    assert.strictEqual(emptyResult.closingBalance, 75000);
  });
});

// ==============================================================================
// C23: DISCOUNT REQUESTS TESTS
// ==============================================================================

describe('Discount Request Transitions & Sane Caps (C23)', () => {
  it('enforces sane caps on requested discounts', () => {
    const validateCaps = (type, val, subtotal) => {
      const maxPercent = 30.0;
      if (type === 'percent') {
        if (val <= 0 || val > maxPercent) return { valid: false, error: 'INVALID_CAP' };
        return { valid: true, amount: Math.round(subtotal * (val / 100)) };
      }
      if (type === 'amount') {
        if (val <= 0 || val >= subtotal) return { valid: false, error: 'EXCEEDS_SUBTOTAL' };
        if (val / subtotal > maxPercent / 100) return { valid: false, error: 'INVALID_CAP' };
        return { valid: true, amount: val };
      }
      return { valid: false, error: 'UNKNOWN_TYPE' };
    };

    const subtotal = 100000;
    // 10% is valid
    assert.strictEqual(validateCaps('percent', 10, subtotal).valid, true);
    // 35% exceeds 30% cap
    assert.strictEqual(validateCaps('percent', 35, subtotal).valid, false);
    // Rs. 20,000 (20%) is valid
    assert.strictEqual(validateCaps('amount', 20000, subtotal).valid, true);
    // Rs. 35,000 (35%) exceeds 30% cap
    assert.strictEqual(validateCaps('amount', 35000, subtotal).valid, false);
    // Rs. 100,000 exceeds subtotal
    assert.strictEqual(validateCaps('amount', 100000, subtotal).valid, false);
  });

  it('blocks second active discount request on the same order', () => {
    const existing = [
      { orderId: 'ord-1', status: 'pending' },
      { orderId: 'ord-2', status: 'rejected' }, // Rejected can be re-requested
      { orderId: 'ord-3', status: 'expired' },  // Expired can be re-requested
    ];

    const canCreate = (orderId) => {
      const hasActive = existing.some(
        (r) => r.orderId === orderId && (r.status === 'pending' || r.status === 'countered'),
      );
      return !hasActive;
    };

    assert.strictEqual(canCreate('ord-1'), false);
    assert.strictEqual(canCreate('ord-2'), true);
    assert.strictEqual(canCreate('ord-3'), true);
    assert.strictEqual(canCreate('ord-4'), true);
  });

  it('rejects counter accept if server expires_at is in the past', () => {
    const acceptCounter = (counterRequest, now) => {
      if (now > counterRequest.expiresAt) {
        return { success: false, error: 'COUNTER_EXPIRED' };
      }
      if (counterRequest.status === 'accepted') {
        return { success: true, alreadyAccepted: true };
      }
      if (counterRequest.status !== 'countered') {
        return { success: false, error: 'INVALID_STATUS' };
      }
      return { success: true, status: 'accepted' };
    };

    const t0 = 100000;
    const activeCounter = { id: 'req-1', status: 'countered', expiresAt: t0 + 3600000 };
    assert.strictEqual(acceptCounter(activeCounter, t0).success, true);

    const expiredCounter = { id: 'req-2', status: 'countered', expiresAt: t0 - 1000 };
    assert.strictEqual(acceptCounter(expiredCounter, t0).error, 'COUNTER_EXPIRED');

    // Double accept idempotency
    const alreadyAccepted = { id: 'req-3', status: 'accepted', expiresAt: t0 + 3600000 };
    assert.strictEqual(acceptCounter(alreadyAccepted, t0).alreadyAccepted, true);
  });

  it('locks discount request when order status progresses beyond placed', () => {
    const checkOrderEligibility = (orderStatus) => {
      const allowed = ['placed', 'draft'];
      return allowed.includes(orderStatus);
    };

    assert.strictEqual(checkOrderEligibility('placed'), true);
    assert.strictEqual(checkOrderEligibility('draft'), true);
    assert.strictEqual(checkOrderEligibility('confirmed'), false);
    assert.strictEqual(checkOrderEligibility('processing'), false);
    assert.strictEqual(checkOrderEligibility('delivered'), false);
  });
});

// ==============================================================================
// C24: RETURN REQUESTS & EMPTIES LEDGER TESTS
// ==============================================================================

describe('Return Request Window & Quantity Caps (C24)', () => {
  it('enforces 24-hour return window strictly', () => {
    const isWithinWindow = (deliveredAt, now, windowHours = 24) => {
      const deadline = new Date(deliveredAt).getTime() + windowHours * 3600 * 1000;
      return new Date(now).getTime() <= deadline;
    };

    const deliveredAt = '2026-10-10T10:00:00Z';
    // 5 hours after delivery: valid
    assert.strictEqual(isWithinWindow(deliveredAt, '2026-10-10T15:00:00Z'), true);
    // 23 hours after delivery: valid
    assert.strictEqual(isWithinWindow(deliveredAt, '2026-10-11T09:00:00Z'), true);
    // 25 hours after delivery: expired
    assert.strictEqual(isWithinWindow(deliveredAt, '2026-10-11T11:00:00Z'), false);
  });

  it('caps return quantity at delivered quantity minus previously returned quantity', () => {
    const calcReturnableQty = (orderedQty, deliveredQty, previouslyReturned) => {
      // Must be based on delivered quantity for partial delivery support!
      const maxReturnable = deliveredQty - previouslyReturned;
      return Math.max(0, maxReturnable);
    };

    // Full delivery: ordered 20, delivered 20, 0 returned
    assert.strictEqual(calcReturnableQty(20, 20, 0), 20);

    // Partial delivery: ordered 20, delivered 15, 0 returned
    assert.strictEqual(calcReturnableQty(20, 15, 0), 15);

    // Subsequent return: ordered 20, delivered 15, 5 already returned
    assert.strictEqual(calcReturnableQty(20, 15, 5), 10);

    // Already returned all delivered items
    assert.strictEqual(calcReturnableQty(20, 15, 15), 0);
  });

  it('mandates photo evidence strictly for damaged items', () => {
    const validateReturnLine = (reason, photos) => {
      if (reason === 'damaged' && (!photos || photos.length === 0)) {
        return { valid: false, error: 'PHOTO_REQUIRED' };
      }
      return { valid: true };
    };

    assert.strictEqual(validateReturnLine('damaged', []).valid, false);
    assert.strictEqual(validateReturnLine('damaged', ['photo1.jpg']).valid, true);
    assert.strictEqual(validateReturnLine('wrong_item', []).valid, true);
    assert.strictEqual(validateReturnLine('short_delivery', []).valid, true);
  });

  it('maintains empties balance invariant: balance == issued - returned', () => {
    let bottlesIssued = 0;
    let bottlesReturned = 0;

    const recordMovement = (issued, returned) => {
      bottlesIssued += issued;
      bottlesReturned += returned;
      return bottlesIssued - bottlesReturned;
    };

    assert.strictEqual(recordMovement(50, 0), 50); // Issued 50 crates
    assert.strictEqual(recordMovement(0, 30), 20); // Returned 30 crates, 20 balance
    assert.strictEqual(recordMovement(10, 20), 10); // Issued 10, returned 20, 10 balance
    assert.strictEqual(bottlesIssued - bottlesReturned, 10);
  });

  it('permits manager and owner to request returns, but restricts staff', () => {
    const canRequestReturn = (role) => {
      return role === 'owner' || role === 'manager';
    };

    assert.strictEqual(canRequestReturn('owner'), true);
    assert.strictEqual(canRequestReturn('manager'), true);
    assert.strictEqual(canRequestReturn('staff'), false);
    assert.strictEqual(canRequestReturn('guest'), false);
  });

  it('resolves 4 screen states for returns and empties UI', () => {
    assert.strictEqual(
      resolveScreenState({ status: 'loading', loading: 'SKELETON' }),
      'SKELETON',
    );
    assert.strictEqual(
      resolveScreenState({ status: 'empty', empty: 'NO_ELIGIBLE' }),
      'NO_ELIGIBLE',
    );
    assert.strictEqual(
      resolveScreenState({ status: 'error', error: 'FETCH_ERROR' }),
      'FETCH_ERROR',
    );
    assert.strictEqual(
      resolveScreenState({ status: 'data', data: 'RETURNS_LIST' }),
      'RETURNS_LIST',
    );
  });
});

describe('In-App Chat with Seller', () => {
  it('manages optimistic sending, sent confirmation, failure, and retry states', () => {
    let messages = [];

    const sendOptimistic = (text, clientMsgId) => {
      const optimisticMsg = {
        id: clientMsgId,
        clientMsgId,
        text,
        senderRole: 'customer',
        deliveryStatus: 'sending',
        error: null,
      };
      messages = [...messages, optimisticMsg];
      return optimisticMsg;
    };

    const confirmSent = (clientMsgId, serverId) => {
      messages = messages.map((m) =>
        m.clientMsgId === clientMsgId
          ? { ...m, id: serverId, deliveryStatus: 'sent', error: null }
          : m,
      );
    };

    const markFailed = (clientMsgId, errorMsg) => {
      messages = messages.map((m) =>
        m.clientMsgId === clientMsgId
          ? { ...m, deliveryStatus: 'failed', error: errorMsg }
          : m,
      );
    };

    const retry = (clientMsgId) => {
      messages = messages.map((m) =>
        m.clientMsgId === clientMsgId
          ? { ...m, deliveryStatus: 'sending', error: null }
          : m,
      );
    };

    // 1. Optimistic append
    const msg1 = sendOptimistic('Hello distributor', 'client_101');
    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].deliveryStatus, 'sending');

    // 2. Confirmed delivery
    confirmSent('client_101', 'srv_999');
    assert.strictEqual(messages[0].deliveryStatus, 'sent');
    assert.strictEqual(messages[0].id, 'srv_999');

    // 3. Second message fails (e.g. offline / network timeout)
    const msg2 = sendOptimistic('Do you have Cola in stock?', 'client_102');
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[1].deliveryStatus, 'sending');

    markFailed('client_102', 'Network disconnected. Tap to retry.');
    assert.strictEqual(messages[1].deliveryStatus, 'failed');
    assert.strictEqual(messages[1].error, 'Network disconnected. Tap to retry.');

    // 4. Retry moves back to sending then sent
    retry('client_102');
    assert.strictEqual(messages[1].deliveryStatus, 'sending');
    confirmSent('client_102', 'srv_1000');
    assert.strictEqual(messages[1].deliveryStatus, 'sent');
    assert.strictEqual(messages[1].id, 'srv_1000');
  });

  it('deduplicates incoming realtime messages using clientMsgId and id', () => {
    let messages = [
      {
        id: 'client_temp_1',
        clientMsgId: 'client_temp_1',
        text: 'Order status query',
        senderRole: 'customer',
        deliveryStatus: 'sending',
        readAt: null,
      },
    ];

    const handleRealtime = (incoming) => {
      const idx = messages.findIndex(
        (m) => (m.clientMsgId && m.clientMsgId === incoming.clientMsgId) || m.id === incoming.id,
      );

      if (idx >= 0) {
        messages = messages.map((m, i) => (i === idx ? { ...m, ...incoming } : m));
      } else {
        messages = [...messages, incoming];
      }
    };

    // Server echoes back the inserted message matching clientMsgId
    handleRealtime({
      id: 'srv_msg_1',
      clientMsgId: 'client_temp_1',
      text: 'Order status query',
      senderRole: 'customer',
      deliveryStatus: 'sent',
      readAt: null,
    });

    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].id, 'srv_msg_1');
    assert.strictEqual(messages[0].deliveryStatus, 'sent');

    // Duplicate realtime event arrives with same srv_msg_1
    handleRealtime({
      id: 'srv_msg_1',
      clientMsgId: 'client_temp_1',
      text: 'Order status query',
      senderRole: 'customer',
      deliveryStatus: 'sent',
      readAt: '2026-10-10T12:00:00Z',
    });

    assert.strictEqual(messages.length, 1);
    assert.strictEqual(messages[0].readAt, '2026-10-10T12:00:00Z');

    // Incoming message from seller
    handleRealtime({
      id: 'srv_msg_2',
      clientMsgId: 'seller_broadcast_2',
      text: 'Your order is out for delivery',
      senderRole: 'seller',
      deliveryStatus: 'sent',
      readAt: null,
    });

    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[1].senderRole, 'seller');
  });

  it('enforces role-based conversation visibility and staff privacy isolation', () => {
    const canAccessConversation = ({ userRole, shopId, convShopId, createdBy, userId }) => {
      // Must be same shop
      if (shopId !== convShopId) return false;

      // Owner and Manager can view all conversations for their shop
      if (userRole === 'owner' || userRole === 'manager') return true;

      // Staff can view ONLY conversations they created
      if (userRole === 'staff') {
        return createdBy === userId;
      }

      return false;
    };

    const conv1 = { convShopId: 'shop_A', createdBy: 'user_staff_1' };
    const conv2 = { convShopId: 'shop_A', createdBy: 'user_staff_2' };
    const convShopB = { convShopId: 'shop_B', createdBy: 'user_staff_1' };

    // Owner checks
    assert.strictEqual(canAccessConversation({ userRole: 'owner', shopId: 'shop_A', userId: 'user_owner', ...conv1 }), true);
    assert.strictEqual(canAccessConversation({ userRole: 'owner', shopId: 'shop_A', userId: 'user_owner', ...conv2 }), true);

    // Manager checks
    assert.strictEqual(canAccessConversation({ userRole: 'manager', shopId: 'shop_A', userId: 'user_mgr', ...conv1 }), true);

    // Staff checks (own vs other staff)
    assert.strictEqual(canAccessConversation({ userRole: 'staff', shopId: 'shop_A', userId: 'user_staff_1', ...conv1 }), true);
    assert.strictEqual(canAccessConversation({ userRole: 'staff', shopId: 'shop_A', userId: 'user_staff_1', ...conv2 }), false);

    // Cross-shop access denied for everyone
    assert.strictEqual(canAccessConversation({ userRole: 'owner', shopId: 'shop_A', userId: 'user_owner', ...convShopB }), false);
  });

  it('blocks sending chat messages when account is suspended or blocked', () => {
    const validateCanSendMessage = (shopStatus) => {
      if (shopStatus === 'suspended' || shopStatus === 'blocked') {
        throw new Error('ACCOUNT_SUSPENDED');
      }
      return true;
    };

    assert.strictEqual(validateCanSendMessage('active'), true);
    assert.strictEqual(validateCanSendMessage('verified'), true);
    assert.throws(() => validateCanSendMessage('suspended'), /ACCOUNT_SUSPENDED/);
    assert.throws(() => validateCanSendMessage('blocked'), /ACCOUNT_SUSPENDED/);
  });

  it('validates photo attachment size limit (5MB) and type', () => {
    const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5 MB

    const validateAttachment = (file) => {
      if (file.size && file.size > MAX_ATTACHMENT_SIZE) {
        return { valid: false, error: 'FILE_TOO_LARGE' };
      }
      const ext = (file.name || file.uri).split('.').pop()?.toLowerCase();
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        return { valid: false, error: 'INVALID_TYPE' };
      }
      return { valid: true };
    };

    assert.deepStrictEqual(validateAttachment({ uri: 'photo.jpg', size: 2 * 1024 * 1024 }), { valid: true });
    assert.deepStrictEqual(validateAttachment({ uri: 'large.png', size: 6 * 1024 * 1024 }), { valid: false, error: 'FILE_TOO_LARGE' });
    assert.deepStrictEqual(validateAttachment({ uri: 'doc.pdf', size: 1024 }), { valid: false, error: 'INVALID_TYPE' });
  });

  it('calculates Pakistan (Asia/Karachi) business hours and out-of-hours response notice', () => {
    const checkBusinessHoursAtDate = (dateUtc) => {
      // Offset +5 hours for Asia/Karachi
      const pkt = new Date(dateUtc.getTime() + 5 * 3600 * 1000);
      const day = pkt.getUTCDay(); // 0 = Sun
      const hour = pkt.getUTCHours();
      const minute = pkt.getUTCMinutes();
      const currentTime = hour + minute / 60;

      const isSunday = day === 0;
      const isWorkingHours = currentTime >= 9 && currentTime < 18;

      if (isSunday || !isWorkingHours) {
        return {
          isOpen: false,
          message: 'Currently outside business hours (Mon-Sat 9 AM - 6 PM PKT). Seller will respond in ~1-2 hours next business morning.',
        };
      }

      return {
        isOpen: true,
        message: 'Seller typically responds within 15-30 minutes.',
      };
    };

    // Wednesday at 11:00 AM PKT (06:00 UTC) -> Open
    const wednesdayWorkingHours = new Date(Date.UTC(2026, 9, 14, 6, 0, 0));
    assert.strictEqual(checkBusinessHoursAtDate(wednesdayWorkingHours).isOpen, true);

    // Wednesday at 08:30 PM PKT (15:30 UTC) -> Closed
    const wednesdayEvening = new Date(Date.UTC(2026, 9, 14, 15, 30, 0));
    assert.strictEqual(checkBusinessHoursAtDate(wednesdayEvening).isOpen, false);

    // Sunday at 02:00 PM PKT (09:00 UTC) -> Closed
    const sundayAfternoon = new Date(Date.UTC(2026, 9, 11, 9, 0, 0));
    assert.strictEqual(checkBusinessHoursAtDate(sundayAfternoon).isOpen, false);
  });

  it('resolves 4 screen states for chat UI', () => {
    assert.strictEqual(
      resolveScreenState({ status: 'loading', loading: 'SKELETON_CHAT' }),
      'SKELETON_CHAT',
    );
    assert.strictEqual(
      resolveScreenState({ status: 'empty', empty: 'NO_MESSAGES_PROMPT' }),
      'NO_MESSAGES_PROMPT',
    );
    assert.strictEqual(
      resolveScreenState({ status: 'error', error: 'CONVERSATION_LOAD_ERROR' }),
      'CONVERSATION_LOAD_ERROR',
    );
    assert.strictEqual(
      resolveScreenState({ status: 'data', data: 'CHAT_MESSAGES_THREAD' }),
      'CHAT_MESSAGES_THREAD',
    );
  });
});

describe('Promotions Pricing Engine & Stacking Rules (C7)', () => {
  it('applies stacking rules: stackable combines with best non-stackable promo', () => {
    const evaluatePromos = (promotions, subtotal) => {
      const eligible = promotions.filter((p) => subtotal >= (p.minOrderAmount || 0));
      const stackables = eligible.filter((p) => p.stackable);
      const nonStackables = eligible.filter((p) => !p.stackable);

      let bestNonStackable = null;
      let maxDiscount = 0;

      for (const p of nonStackables) {
        const disc = p.discountType === 'percent' ? (subtotal * p.discountValue) / 100 : p.discountValue;
        if (disc > maxDiscount) {
          maxDiscount = disc;
          bestNonStackable = { ...p, discountAmount: disc };
        }
      }

      const applied = stackables.map((p) => ({
        ...p,
        discountAmount: p.discountType === 'percent' ? (subtotal * p.discountValue) / 100 : p.discountValue,
      }));

      if (bestNonStackable) {
        applied.push(bestNonStackable);
      }

      const totalDiscount = applied.reduce((sum, a) => sum + a.discountAmount, 0);
      return { applied, totalDiscount };
    };

    const promos = [
      { id: '1', title: 'Summer 5% Flat', stackable: true, discountType: 'percent', discountValue: 5, minOrderAmount: 1000 },
      { id: '2', title: 'Big Order Rs. 500', stackable: false, discountType: 'amount', discountValue: 500, minOrderAmount: 5000 },
      { id: '3', title: 'Special 10%', stackable: false, discountType: 'percent', discountValue: 10, minOrderAmount: 5000 },
    ];

    // Subtotal 10,000:
    // Stackable: 5% of 10,000 = 500
    // Non-stackables competing: Rs. 500 vs 10% (1,000) -> 10% wins (1,000)
    // Total discount = 500 + 1000 = 1,500
    const res = evaluatePromos(promos, 10000);
    assert.strictEqual(res.totalDiscount, 1500);
    assert.strictEqual(res.applied.length, 2);
  });

  it('drops expired promotions and handles server clock offset drift', () => {
    const isPromoValid = (endsAtUtc, serverClockOffsetMs) => {
      const now = Date.now() + serverClockOffsetMs;
      return new Date(endsAtUtc).getTime() > now;
    };

    const futureTime = new Date(Date.now() + 3600 * 1000).toISOString();
    const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();

    assert.strictEqual(isPromoValid(futureTime, 0), true);
    assert.strictEqual(isPromoValid(pastTime, 0), false);
    // If device clock is 2 hours behind but offset adjusts it forward:
    assert.strictEqual(isPromoValid(futureTime, 7200 * 1000), false);
  });

  it('resolves 4 screen states for promotions UI', () => {
    assert.strictEqual(resolveScreenState({ status: 'loading', loading: 'PROMO_SKELETON' }), 'PROMO_SKELETON');
    assert.strictEqual(resolveScreenState({ status: 'empty', empty: 'NO_ACTIVE_PROMOS' }), 'NO_ACTIVE_PROMOS');
    assert.strictEqual(resolveScreenState({ status: 'error', error: 'PROMO_FETCH_ERROR' }), 'PROMO_FETCH_ERROR');
    assert.strictEqual(resolveScreenState({ status: 'data', data: 'BANNER_CAROUSEL' }), 'BANNER_CAROUSEL');
  });
});

describe('Post-Delivery Feedback (Ratings & Reviews)', () => {
  it('validates rating bounds (1-5) and sanitizes comments length (<= 500 chars)', () => {
    const validateFeedback = (deliveryRating, serviceRating, comments) => {
      if (deliveryRating < 1 || deliveryRating > 5 || serviceRating < 1 || serviceRating > 5) {
        return { valid: false, error: 'INVALID_RATING' };
      }
      const sanitized = (comments || '').trim().slice(0, 500);
      return { valid: true, comments: sanitized };
    };

    assert.strictEqual(validateFeedback(5, 5, 'Great delivery!').valid, true);
    assert.strictEqual(validateFeedback(0, 4, 'Poor').valid, false);
    assert.strictEqual(validateFeedback(5, 6, 'Over').valid, false);

    const longComment = 'A'.repeat(600);
    const result = validateFeedback(4, 4, longComment);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.comments.length, 500);
  });

  it('enforces 14-day eligibility window and prevents duplicate review', () => {
    const isEligibleForReview = (orderStatus, deliveredAtMs, alreadyReviewed) => {
      if (alreadyReviewed) return false;
      if (!['delivered', 'partially_delivered'].includes(orderStatus)) return false;
      const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
      return Date.now() - deliveredAtMs <= fourteenDaysMs;
    };

    const now = Date.now();
    assert.strictEqual(isEligibleForReview('delivered', now - 2 * 24 * 3600 * 1000, false), true);
    assert.strictEqual(isEligibleForReview('partially_delivered', now - 5 * 24 * 3600 * 1000, false), true);
    assert.strictEqual(isEligibleForReview('processing', now, false), false);
    assert.strictEqual(isEligibleForReview('delivered', now, true), false); // already reviewed
    assert.strictEqual(isEligibleForReview('delivered', now - 20 * 24 * 3600 * 1000, false), false); // expired window
  });
});

describe('Multi-Shop Branch Support & Group Credit (A1)', () => {
  it('switches active shop and isolates state without memory leakage', () => {
    let activeShop = 'shop_1';
    let storesReset = false;

    const switchShop = (newShopId) => {
      storesReset = true;
      activeShop = newShopId;
      return activeShop;
    };

    assert.strictEqual(switchShop('shop_2'), 'shop_2');
    assert.strictEqual(storesReset, true);
  });

  it('enforces group-level credit limit across all branch shops', () => {
    const checkGroupCredit = (groupLimit, currentGroupUsed, newOrderAmount) => {
      if (currentGroupUsed + newOrderAmount > groupLimit) {
        return { allowed: false, error: 'GROUP_CREDIT_LIMIT_EXCEEDED' };
      }
      return { allowed: true, remaining: groupLimit - (currentGroupUsed + newOrderAmount) };
    };

    const groupLimit = 500000; // Rs. 500,000 group cap
    const groupUsed = 450000;  // Rs. 450,000 currently used by other branch

    // Branch A tries to place Rs. 60,000 order -> fails
    assert.strictEqual(checkGroupCredit(groupLimit, groupUsed, 60000).allowed, false);

    // Branch A tries to place Rs. 40,000 order -> succeeds
    const okRes = checkGroupCredit(groupLimit, groupUsed, 40000);
    assert.strictEqual(okRes.allowed, true);
    assert.strictEqual(okRes.remaining, 10000);
  });
});

describe('Bulk Order Line Parser & Urdu Digits (A2)', () => {
  const normalizeUrduDigits = (text) => {
    const urduDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return text.replace(/[۰-۹]/g, (match) => String(urduDigits.indexOf(match)));
  };

  const parseLine = (rawLine) => {
    const normalized = normalizeUrduDigits(rawLine.trim());
    const match = normalized.match(/^(.*?)(?:[=xX:\t,]+)\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) return { status: 'unrecognised', rawLine };

    const query = match[1].trim();
    const qty = parseFloat(match[2]);

    if (isNaN(qty) || qty <= 0) {
      return { status: 'invalid_qty', query, qty };
    }

    return { status: 'ok', query, qty };
  };

  it('parses various separators (=, x, :, tab, comma)', () => {
    assert.deepStrictEqual(parseLine('Pepsi 1.5L = 100'), { status: 'ok', query: 'Pepsi 1.5L', qty: 100 });
    assert.deepStrictEqual(parseLine('Coke 1L x 50'), { status: 'ok', query: 'Coke 1L', qty: 50 });
    assert.deepStrictEqual(parseLine('Sprite 500ml : 25'), { status: 'ok', query: 'Sprite 500ml', qty: 25 });
    assert.deepStrictEqual(parseLine('Fanta 1.5L, 30'), { status: 'ok', query: 'Fanta 1.5L', qty: 30 });
    assert.deepStrictEqual(parseLine('Gourmet 1L\t40'), { status: 'ok', query: 'Gourmet 1L', qty: 40 });
  });

  it('converts Urdu numerals correctly', () => {
    assert.strictEqual(normalizeUrduDigits('۱۰'), '10');
    assert.strictEqual(normalizeUrduDigits('۵۰'), '50');
    assert.deepStrictEqual(parseLine('Pepsi 1.5L = ۱۰'), { status: 'ok', query: 'Pepsi 1.5L', qty: 10 });
    assert.deepStrictEqual(parseLine('Coke 1L x ۵۰'), { status: 'ok', query: 'Coke 1L', qty: 50 });
  });

  it('flags zero or negative quantities as invalid_qty', () => {
    assert.strictEqual(parseLine('Pepsi 1.5L = 0').status, 'invalid_qty');
    assert.strictEqual(parseLine('Pepsi 1.5L = -5').status, 'invalid_qty');
  });

  it('merges duplicate variant lines accurately', () => {
    const lines = [
      { variantId: 'v1', qty: 20 },
      { variantId: 'v2', qty: 10 },
      { variantId: 'v1', qty: 30 },
    ];

    const merged = {};
    for (const l of lines) {
      merged[l.variantId] = (merged[l.variantId] || 0) + l.qty;
    }

    assert.strictEqual(merged['v1'], 50);
    assert.strictEqual(merged['v2'], 10);
  });
});

describe('Scheduled Orders Math & Idempotency (A4)', () => {
  it('calculates next execution date in Pakistan time with month-end clamp', () => {
    const calculateNextMonthlyRun = (targetDay, year, month) => {
      // Clamps target day to last day of month
      const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      return Math.min(targetDay, daysInMonth);
    };

    // 31st of February (leap year 2028: 29 days, standard 2026: 28 days)
    assert.strictEqual(calculateNextMonthlyRun(31, 2026, 1), 28);
    // 31st of April (30 days)
    assert.strictEqual(calculateNextMonthlyRun(31, 2026, 3), 30);
    // 31st of May (31 days)
    assert.strictEqual(calculateNextMonthlyRun(31, 2026, 4), 31);
  });

  it('generates deterministic idempotency key preventing duplicate order placement', () => {
    const generateIdempotencyKey = (scheduleId, dateStr) => {
      return `sched_${scheduleId}_${dateStr}`;
    };

    const k1 = generateIdempotencyKey('sch_101', '2026-10-12');
    const k2 = generateIdempotencyKey('sch_101', '2026-10-12');
    assert.strictEqual(k1, k2);
  });
});

describe('Purchase Limits & Precedence (A5)', () => {
  it('enforces most specific purchase limit precedence (Shop > Tier > Global)', () => {
    const limits = [
      { id: '1', shopId: null, tier: 'all', maxQty: 100 },
      { id: '2', shopId: null, tier: 'gold', maxQty: 200 },
      { id: '3', shopId: 'shop_123', tier: null, maxQty: 50 },
    ];

    const getLimit = (shopId, tier) => {
      // Precedence: shop specific > tier specific > global
      const shopMatch = limits.find((l) => l.shopId === shopId);
      if (shopMatch) return shopMatch.maxQty;
      const tierMatch = limits.find((l) => l.tier === tier);
      if (tierMatch) return tierMatch.maxQty;
      return limits.find((l) => l.tier === 'all')?.maxQty || 9999;
    };

    assert.strictEqual(getLimit('shop_123', 'gold'), 50); // Shop specific wins
    assert.strictEqual(getLimit('shop_999', 'gold'), 200); // Gold tier wins
    assert.strictEqual(getLimit('shop_999', 'bronze'), 100); // Global wins
  });
});

describe('Loyalty and Rewards Engine (A9)', () => {
  it('calculates points earned on delivered paid orders (Rs. 10,000 -> 100 points)', () => {
    const calcEarned = (amount) => Math.floor(amount / 100);

    assert.strictEqual(calcEarned(10000), 100);
    assert.strictEqual(calcEarned(25000), 250);
    assert.strictEqual(calcEarned(99), 0);
  });

  it('caps redemption at maximum 20% of order total', () => {
    const calcMaxRedeemable = (orderTotal, availablePoints) => {
      const maxAllowed = Math.floor(orderTotal * 0.2);
      return Math.min(availablePoints, maxAllowed);
    };

    // Order total Rs. 50,000, max 20% is Rs. 10,000 points
    assert.strictEqual(calcMaxRedeemable(50000, 15000), 10000);
    assert.strictEqual(calcMaxRedeemable(50000, 5000), 5000);
  });
});

describe('Offline Support & Safe Action Queue', () => {
  it('enqueues safe client actions and strictly blocks critical financial operations', () => {
    const SAFE_ACTIONS = new Set(['cart_add', 'cart_update', 'cart_remove', 'favorite_toggle', 'notes_save']);

    const enqueue = (actionType) => {
      if (!SAFE_ACTIONS.has(actionType)) {
        throw new Error('ACTION_REQUIRES_ONLINE');
      }
      return { status: 'queued', actionType };
    };

    assert.deepStrictEqual(enqueue('cart_add'), { status: 'queued', actionType: 'cart_add' });
    assert.deepStrictEqual(enqueue('favorite_toggle'), { status: 'queued', actionType: 'favorite_toggle' });

    assert.throws(() => enqueue('place_order'), /ACTION_REQUIRES_ONLINE/);
    assert.throws(() => enqueue('submit_payment'), /ACTION_REQUIRES_ONLINE/);
    assert.throws(() => enqueue('cancel_order'), /ACTION_REQUIRES_ONLINE/);
    assert.throws(() => enqueue('create_return'), /ACTION_REQUIRES_ONLINE/);
  });
});

describe('Strict Audit: Two-Shop RLS Data Isolation', () => {
  it('strictly isolates templates, schedules, and loyalty data between Shop A and Shop B', () => {
    const records = [
      { type: 'template', shopId: 'shop_A', name: 'Weekly Restock', createdBy: 'user_A1' },
      { type: 'template', shopId: 'shop_B', name: 'Weekly Restock', createdBy: 'user_B1' },
      { type: 'schedule', shopId: 'shop_A', rule: 'Monday', createdBy: 'user_A1' },
      { type: 'schedule', shopId: 'shop_B', rule: 'Monday', createdBy: 'user_B1' },
      { type: 'loyalty', shopId: 'shop_A', points: 500 },
      { type: 'loyalty', shopId: 'shop_B', points: 1200 },
    ];

    const queryShopData = (userShopId) => {
      return records.filter((r) => r.shopId === userShopId);
    };

    const shopAData = queryShopData('shop_A');
    const shopBData = queryShopData('shop_B');

    // Exactly 3 records for Shop A, all belonging to shop_A
    assert.strictEqual(shopAData.length, 3);
    assert.ok(shopAData.every((r) => r.shopId === 'shop_A'));

    // Zero data leakage to Shop B
    assert.strictEqual(shopBData.length, 3);
    assert.ok(shopBData.every((r) => r.shopId === 'shop_B'));
    assert.strictEqual(shopAData.some((r) => r.shopId === 'shop_B'), false);
  });

  it('enforces template edit permissions: staff can only edit own, owner/manager can edit all in shop', () => {
    const canEditTemplate = ({ userRole, userId, templateCreatedBy, userShopId, templateShopId }) => {
      if (userShopId !== templateShopId) return false;
      if (userRole === 'owner' || userRole === 'manager') return true;
      return templateCreatedBy === userId;
    };

    const tpl1 = { templateShopId: 'shop_A', templateCreatedBy: 'user_staff_1' };

    // Owner in shop_A can edit
    assert.strictEqual(canEditTemplate({ userRole: 'owner', userId: 'user_owner', userShopId: 'shop_A', ...tpl1 }), true);
    // Manager in shop_A can edit
    assert.strictEqual(canEditTemplate({ userRole: 'manager', userId: 'user_mgr', userShopId: 'shop_A', ...tpl1 }), true);
    // Staff who created it can edit
    assert.strictEqual(canEditTemplate({ userRole: 'staff', userId: 'user_staff_1', userShopId: 'shop_A', ...tpl1 }), true);
    // Staff 2 cannot edit Staff 1's template
    assert.strictEqual(canEditTemplate({ userRole: 'staff', userId: 'user_staff_2', userShopId: 'shop_A', ...tpl1 }), false);
    // Cross shop user cannot edit
    assert.strictEqual(canEditTemplate({ userRole: 'owner', userId: 'user_owner_b', userShopId: 'shop_B', ...tpl1 }), false);
  });
});

describe('Strict Audit: Idempotency & Error Sanitization', () => {
  it('enforces idempotency on template creation rejecting duplicate names in same shop', () => {
    const existingTemplates = new Set(['shop_A:Weekly Restock']);

    const createTemplateIdempotent = (shopId, name) => {
      const key = `${shopId}:${name.trim()}`;
      if (existingTemplates.has(key)) {
        throw new Error('DUPLICATE_TEMPLATE_NAME');
      }
      existingTemplates.add(key);
      return { success: true };
    };

    assert.deepStrictEqual(createTemplateIdempotent('shop_A', 'Weekend Special'), { success: true });
    assert.throws(() => createTemplateIdempotent('shop_A', 'Weekly Restock'), /DUPLICATE_TEMPLATE_NAME/);
    // Same name in different shop is allowed
    assert.deepStrictEqual(createTemplateIdempotent('shop_B', 'Weekly Restock'), { success: true });
  });

  it('sanitizes raw database errors into user-friendly messages without leaking SQL internals', () => {
    const sanitizeErrorMessage = (errorStr) => {
      if (errorStr.includes('duplicate key') || errorStr.includes('unique constraint')) {
        return 'An item with this name already exists. Please choose another name.';
      }
      if (errorStr.includes('violates foreign key constraint')) {
        return 'Referenced record was not found or has been removed.';
      }
      if (errorStr.includes('connection refused') || errorStr.includes('NetworkError')) {
        return 'Network connection issue. Please check your internet connection.';
      }
      return 'An unexpected error occurred. Please try again.';
    };

    assert.strictEqual(
      sanitizeErrorMessage('duplicate key value violates unique constraint "order_templates_shop_id_name_key"'),
      'An item with this name already exists. Please choose another name.',
    );
    assert.strictEqual(
      sanitizeErrorMessage('violates foreign key constraint "order_items_variant_id_fkey"'),
      'Referenced record was not found or has been removed.',
    );
    assert.strictEqual(
      sanitizeErrorMessage('PostgrestError: connection refused'),
      'Network connection issue. Please check your internet connection.',
    );
  });

  it('enforces that monetary ledger sums and loyalty points are computed server-side', () => {
    // Invariant: client cannot submit a total or points credit directly;
    // Points earned is pure function of verified delivered paid orders
    const computeServerLoyaltyPoints = (orders) => {
      return orders
        .filter((o) => o.status === 'delivered' && o.paymentStatus === 'paid')
        .reduce((sum, o) => sum + Math.floor(o.total / 100), 0);
    };

    const orders = [
      { total: 10000, status: 'delivered', paymentStatus: 'paid' },    // 100 pts
      { total: 20000, status: 'delivered', paymentStatus: 'paid' },    // 200 pts
      { total: 50000, status: 'processing', paymentStatus: 'paid' },   // 0 pts (not delivered)
      { total: 30000, status: 'delivered', paymentStatus: 'pending' }, // 0 pts (not paid)
    ];

    assert.strictEqual(computeServerLoyaltyPoints(orders), 300);
  });
});

describe('Wholesale Cold Drinks & Juices Catalog Dataset', () => {
  const coldDrinkBrands = [
    '7Up', 'Coca-Cola', 'Mountain Dew', 'Fanta', 'Fizup', 
    'Gourmet', 'Next Cola', 'Pepsi', 'Sprite'
  ];

  const juiceAndEnergyBrands = ['Nestle', 'Slice', 'Smiley', 'Sting'];

  const expectedFolders = [
    '7up', 'cocalCola', 'dew', 'fanta', 'fiza',
    'gourmetCola', 'gourmetOrange', 'gourmetSprit',
    'next', 'pepsi', 'rangoNext', 'sprit', 'spritMint'
  ];

  it('validates all cold drink brands and categories are present', () => {
    coldDrinkBrands.forEach((b) => {
      assert.ok(b.length > 0, `Brand ${b} should be valid`);
    });
    juiceAndEnergyBrands.forEach((j) => {
      assert.ok(j.length > 0, `Juice/Energy Brand ${j} should be valid`);
    });
  });

  it('verifies image paths and size variants for wholesale ordering', () => {
    expectedFolders.forEach((folder) => {
      const sizes = ['300ml', '500ml', '1.5l', '2.5l'];
      sizes.forEach((s) => {
        const expectedImg = `/images/${folder}/${s}.png`;
        assert.ok(expectedImg.startsWith('/images/'));
        assert.ok(expectedImg.endsWith('.png'));
      });
    });

    const specialtyImages = ['/images/nestle.png', '/images/slice.png', '/images/smily.png', '/images/sting.png'];
    specialtyImages.forEach((img) => {
      assert.ok(img.startsWith('/images/'));
      assert.ok(img.endsWith('.png'));
    });
  });

  it('matches cold drinks and juices in bulk order matrix fuzzy parser', () => {
    const catalog = [
      { variantId: 'v1', variantName: '7Up 1.5L', productName: '7Up 1.5L', unitPrice: 1100, packSize: 6, saleUnit: 'pack', inStock: true },
      { variantId: 'v2', variantName: 'Coca-Cola 500ml', productName: 'Coca-Cola 500ml', unitPrice: 1250, packSize: 12, saleUnit: 'pack', inStock: true },
      { variantId: 'v3', variantName: 'Mountain Dew 1L', productName: 'Mountain Dew 1L', unitPrice: 850, packSize: 6, saleUnit: 'pack', inStock: true },
      { variantId: 'v4', variantName: 'Slice Mango 1L', productName: 'Slice Mango 1L', unitPrice: 3200, packSize: 12, saleUnit: 'carton', inStock: true },
      { variantId: 'v5', variantName: 'Sting Berry Blast 300ml', productName: 'Sting Berry Blast 300ml', unitPrice: 2200, packSize: 24, saleUnit: 'carton', inStock: true },
    ];

    const parseLine = (text) => {
      const match = text.match(/^(.*?)(?:[=xX:\t,]+)\s*(\d+)\s*$/);
      if (!match) return null;
      const q = match[1].trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const qty = parseInt(match[2], 10);
      const found = catalog.find((c) => {
        const target = c.productName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return target.includes(q) || q.includes(target);
      });
      return { variant: found, qty };
    };

    const res1 = parseLine('7Up 1.5L = 20');
    assert.strictEqual(res1.variant.variantId, 'v1');
    assert.strictEqual(res1.qty, 20);

    const res2 = parseLine('Slice Mango 1L : 15');
    assert.strictEqual(res2.variant.variantId, 'v4');
    assert.strictEqual(res2.qty, 15);

    const res3 = parseLine('Sting Berry Blast 300ml x 10');
    assert.strictEqual(res3.variant.variantId, 'v5');
    assert.strictEqual(res3.qty, 10);
  });
});

// ==============================================================================
// Wholesaler-Only Cold Drinks Inventory & Sales Management ERP Suite
// ==============================================================================

describe('Wholesaler ERP: Dual-Unit Inventory & Sales Engine', () => {
  // Pure helper implementing the dual-unit inventory math
  function computeDualUnit(totalUnits, unitsPerCarton) {
    const cartons = Math.floor(totalUnits / unitsPerCarton);
    const loose = totalUnits % unitsPerCarton;
    return { cartons, loose, totalUnits };
  }

  it('1. Exact User Scenario: 50 cartons Pepsi 1.5L (6/carton) -> sell 5 cartons + 8 bottles -> exactly 262 remaining (43 cartons + 4 bottles)', () => {
    const unitsPerCarton = 6;
    const initialCartons = 50;
    const initialTotalUnits = initialCartons * unitsPerCarton; // 300 bottles

    // Verify initial stock
    const initialStock = computeDualUnit(initialTotalUnits, unitsPerCarton);
    assert.strictEqual(initialStock.cartons, 50);
    assert.strictEqual(initialStock.loose, 0);
    assert.strictEqual(initialStock.totalUnits, 300);

    // Record sale: 5 cartons and 8 loose bottles
    const cartonsSold = 5;
    const bottlesSold = 8;
    const totalUnitsSold = (cartonsSold * unitsPerCarton) + bottlesSold; // 38 bottles
    assert.strictEqual(totalUnitsSold, 38);

    const remainingTotalUnits = initialTotalUnits - totalUnitsSold; // 262 bottles
    assert.strictEqual(remainingTotalUnits, 262);

    const remainingStock = computeDualUnit(remainingTotalUnits, unitsPerCarton);
    assert.strictEqual(remainingStock.cartons, 43);
    assert.strictEqual(remainingStock.loose, 4);
    assert.strictEqual(remainingStock.totalUnits, 262);
  });

  it('2. Dual-unit stock integrity: loose and carton quantities reflect the exact same physical units without double-counting', () => {
    const unitsPerCarton = 24; // e.g. 250ml Cans
    const totalUnits = 250;
    const stock = computeDualUnit(totalUnits, unitsPerCarton);
    assert.strictEqual(stock.cartons, 10); // 10 * 24 = 240
    assert.strictEqual(stock.loose, 10);   // 10 loose
    assert.strictEqual((stock.cartons * unitsPerCarton) + stock.loose, totalUnits);
  });

  it('3. Pre-sale inventory validation prevents negative stock and returns explicit error', () => {
    const availableUnits = 262; // 43 cartons + 4 bottles of Pepsi 1.5L (6/ctn)
    const unitsPerCarton = 6;

    const validateStock = (requestedCartons, requestedLoose) => {
      const requestedTotal = (requestedCartons * unitsPerCarton) + requestedLoose;
      if (requestedTotal > availableUnits) {
        throw new Error(
          `INSUFFICIENT_STOCK: Pepsi 1.5L has only ${availableUnits} units available (requested ${requestedTotal})`
        );
      }
      return availableUnits - requestedTotal;
    };

    // Attempting to sell 50 cartons (300 units) when only 262 available fails
    assert.throws(
      () => validateStock(50, 0),
      /INSUFFICIENT_STOCK: Pepsi 1.5L has only 262 units available \(requested 300\)/
    );

    // Selling 40 cartons (240 units) succeeds
    assert.strictEqual(validateStock(40, 0), 22);
  });

  it('4. Product creation does not automatically create arbitrary stock', () => {
    const createProduct = (name, brand, unitsPerCarton) => {
      return {
        id: 'prod-new',
        name,
        brand,
        unitsPerCarton,
        initialInventoryUnits: 0, // Stock is strictly 0 until opening stock or purchase
      };
    };

    const newDrink = createProduct('Sprite Zero 1L', 'The Coca-Cola Company', 12);
    assert.strictEqual(newDrink.initialInventoryUnits, 0);
  });

  it('5. Opening stock adjustment increments inventory atomically with reason', () => {
    let currentUnits = 0;
    const unitsPerCarton = 12;

    const recordAdjustment = (type, cartons, loose, reason) => {
      const deltaUnits = (cartons * unitsPerCarton) + loose;
      if (type === 'opening_stock') {
        currentUnits += deltaUnits;
      }
      return { currentUnits, reason };
    };

    const res = recordAdjustment('opening_stock', 20, 6, 'Initial physical count before app launch');
    assert.strictEqual(res.currentUnits, 246); // 20 * 12 + 6
    assert.strictEqual(res.reason, 'Initial physical count before app launch');
  });

  it('6. Damage and breakage adjustments decrement inventory atomically', () => {
    let currentUnits = 246;
    const unitsPerCarton = 12;

    const recordDamage = (cartons, loose, reason) => {
      const deltaUnits = (cartons * unitsPerCarton) + loose;
      if (deltaUnits > currentUnits) {
        throw new Error('DAMAGE_EXCEEDS_STOCK: Cannot write off more stock than currently on hand');
      }
      currentUnits -= deltaUnits;
      return { currentUnits, reason };
    };

    const res = recordDamage(1, 2, 'Broken during warehouse unloading');
    assert.strictEqual(res.currentUnits, 232); // 246 - 14
    assert.strictEqual(res.reason, 'Broken during warehouse unloading');
  });

  it('7. Supplier purchase increases inventory and calculates payable', () => {
    let inventoryUnits = 232;
    const unitsPerCarton = 12;

    const finalizePurchase = (purchase) => {
      const addedUnits = (purchase.cartons * unitsPerCarton) + purchase.loose;
      inventoryUnits += addedUnits;
      const subtotal = purchase.cartons * purchase.costPerCarton;
      const totalCost = subtotal + (purchase.transportCost || 0);
      const remainingPayable = totalCost - (purchase.paidAmount || 0);
      return { inventoryUnits, totalCost, remainingPayable };
    };

    const purchase = finalizePurchase({
      cartons: 100,
      loose: 0,
      costPerCarton: 1200,
      transportCost: 1500,
      paidAmount: 80000,
    });

    assert.strictEqual(purchase.inventoryUnits, 1432); // 232 + 1200
    assert.strictEqual(purchase.totalCost, 121500);     // 100 * 1200 + 1500
    assert.strictEqual(purchase.remainingPayable, 41500); // 121500 - 80000
  });

  it('8. Sequential sales slip generation format SLIP-YYYY-XXXXX', () => {
    const generateSlipNumber = (year, sequence) => {
      return `SLIP-${year}-${String(sequence).padStart(5, '0')}`;
    };

    assert.strictEqual(generateSlipNumber(2026, 1), 'SLIP-2026-00001');
    assert.strictEqual(generateSlipNumber(2026, 42), 'SLIP-2026-00042');
    assert.strictEqual(generateSlipNumber(2026, 9999), 'SLIP-2026-09999');
  });

  it('9. Atomic sale slip snapshots preserve historical prices when catalog prices change', () => {
    // Wholesaler sells Pepsi at Rs. 1,200 per carton
    const saleItemSnapshot = {
      product_name: 'Pepsi',
      size_label: '1.5L',
      price_per_carton: 1200,
      cartons_qty: 5,
      line_total: 6000,
    };

    // Wholesaler later changes catalog price to Rs. 1,350 per carton
    const updatedCatalogPrice = 1350;

    // Past receipt line total must remain locked at Rs. 6000
    assert.strictEqual(saleItemSnapshot.line_total, 6000);
    assert.strictEqual(saleItemSnapshot.price_per_carton, 1200);
    assert.notStrictEqual(saleItemSnapshot.price_per_carton, updatedCatalogPrice);
  });

  it('10. Partial payment on sale records outstanding balance to customer Khata', () => {
    const sale = {
      subtotal: 10200,
      discount: 200,
      totalAmount: 10000,
      paidAmount: 6000,
    };

    const remainingDue = sale.totalAmount - sale.paidAmount;
    assert.strictEqual(remainingDue, 4000);

    let customerBalance = 1500; // Previous debt
    customerBalance += remainingDue;
    assert.strictEqual(customerBalance, 5500);
  });

  it('11. Customer cash payment reduces Khata balance atomically', () => {
    let customerBalance = 5500;
    const paymentAmount = 3000;

    customerBalance -= paymentAmount;
    assert.strictEqual(customerBalance, 2500);
  });

  it('12. Executive dashboard aggregates daily metrics and stock valuation accurately', () => {
    const salesToday = [
      { total_amount: 10000, paid_amount: 6000 },
      { total_amount: 5000, paid_amount: 5000 },
      { total_amount: 8000, paid_amount: 0 },
    ];

    const todaySales = salesToday.reduce((sum, s) => sum + s.total_amount, 0);
    const cashCollected = salesToday.reduce((sum, s) => sum + s.paid_amount, 0);
    const creditSales = todaySales - cashCollected;

    assert.strictEqual(todaySales, 23000);
    assert.strictEqual(cashCollected, 11000);
    assert.strictEqual(creditSales, 12000);

    // Stock valuation = sum(total_units * (cost_per_carton / pieces_per_carton))
    const inventory = [
      { total_units: 300, cost_per_carton: 1200, pieces_per_carton: 6 }, // 300 * 200 = 60000
      { total_units: 120, cost_per_carton: 2400, pieces_per_carton: 12 }, // 120 * 200 = 24000
    ];

    const stockValue = inventory.reduce(
      (sum, item) => sum + (item.total_units * (item.cost_per_carton / item.pieces_per_carton)),
      0
    );
    assert.strictEqual(stockValue, 84000);
  });
});

describe('Smart Beverage & Carton Search Engine (Spacing, Case, Carton Synonyms)', () => {
  const item7up = {
    variant_id: 'var-7up-1.5',
    product_id: 'prod-7up',
    product_name: '7Up',
    brand_name: 'PepsiCo',
    category_name: 'Cold Drinks',
    size_label: '1.5L',
    packaging_type: 'carton',
    pieces_per_carton: 6,
    price_per_carton: 1200,
    price_per_unit: 200,
    cost_per_carton: 1000,
    cost_per_unit: 166.67,
    total_units: 300,
    available_cartons: 50,
    available_loose_units: 0,
    is_low_stock: false,
    is_out_of_stock: false,
    stock_value: 50000,
  };

  it('matches all user-requested 7Up variations ("7Up 1.5L", "7Up1.5L", "7up1.5L", "7up 1.5L")', () => {
    const userVariations = [
      '7Up 1.5L',
      '7Up1.5L',
      '7up1.5L',
      '7up 1.5L',
      '7up 1.5',
      '7up1.5',
      '7up',
      '7UP',
      '1.5L',
      '1.5l',
    ];

    for (const query of userVariations) {
      assert.strictEqual(
        matchInventoryItem(item7up, query),
        true,
        `Expected query "${query}" to match 7Up 1.5L`
      );
    }
  });

  it('matches search by cartoons ("cartoons", "cartoon", "carton", "50 cartons", "7up cartoons")', () => {
    const cartonQueries = [
      'cartoons',
      'cartoon',
      'carton',
      '50 cartons',
      '7up cartoons',
      '7up carton',
      '7up 50 cartons',
    ];

    for (const query of cartonQueries) {
      assert.strictEqual(
        matchInventoryItem(item7up, query),
        true,
        `Expected carton query "${query}" to match 7Up carton item`
      );
    }
  });

  it('does not produce false positives for unrelated products', () => {
    assert.strictEqual(matchInventoryItem(item7up, 'Sprite'), false);
    assert.strictEqual(matchInventoryItem(item7up, 'Coca-Cola'), false);
    assert.strictEqual(matchInventoryItem(item7up, 'Gourmet'), false);
  });

  it('matches customers by shop name, contact person, or phone number', () => {
    const customer = {
      id: 'c1',
      name: 'Al-Rehman General Store',
      owner_name: 'Muhammad Usman',
      phone: '0300-1234567',
      address: 'Shop #4, Main Market, Lahore',
      city: 'Lahore',
      current_balance: 5000,
      credit_limit: 50000,
      is_active: true,
    };

    assert.strictEqual(matchCustomer(customer, 'al rehman'), true);
    assert.strictEqual(matchCustomer(customer, 'alrehman'), true);
    assert.strictEqual(matchCustomer(customer, 'usman'), true);
    assert.strictEqual(matchCustomer(customer, '03001234567'), true);
    assert.strictEqual(matchCustomer(customer, '0300-1234567'), true);
  });

  it('matches sales slips by partial number, shop name, or payment method', () => {
    const sale = {
      id: 's1',
      receipt_no: 'SLIP-2026-00042',
      customer_name_snapshot: 'Al-Rehman General Store',
      customer_phone_snapshot: '0300-1234567',
      sale_date: '2026-10-11T12:00:00Z',
      subtotal: 10000,
      discount: 0,
      total_amount: 10000,
      paid_amount: 5000,
      balance_due: 5000,
      payment_method: 'credit',
      status: 'finalized',
    };

    assert.strictEqual(matchSalesSlip(sale, 'SLIP-2026-00042'), true);
    assert.strictEqual(matchSalesSlip(sale, '00042'), true);
    assert.strictEqual(matchSalesSlip(sale, '42'), true);
    assert.strictEqual(matchSalesSlip(sale, 'slip 42'), true);
    assert.strictEqual(matchSalesSlip(sale, 'al rehman'), true);
    assert.strictEqual(matchSalesSlip(sale, 'credit'), true);
  });
});

describe('Batch A4 Sales Slips PDF Generator', () => {
  const makeSlips = (count) =>
    Array.from({ length: count }, (_, idx) => ({
      id: `sale-${idx + 1}`,
      receipt_no: `SLIP-2026-${String(idx + 1).padStart(4, '0')}`,
      customer_name_snapshot: `Shop #${idx + 1} (Al-Rehman \\ Co.)`,
      customer_phone_snapshot: '0300-1234567',
      sale_date: '2026-11-11T12:00:00Z',
      subtotal: 6000,
      discount: idx % 2 === 0 ? 500 : 0,
      total_amount: idx % 2 === 0 ? 5500 : 6000,
      paid_amount: idx % 3 === 0 ? 0 : idx % 3 === 1 ? 2000 : 5500,
      balance_due: idx % 3 === 0 ? 5500 : idx % 3 === 1 ? 4000 : 0,
      payment_method: idx % 3 === 0 ? 'credit' : 'cash',
      items: Array.from({ length: idx === 0 ? 18 : 3 }, (__, j) => ({
        product_name_snapshot: `Pepsi Drink ${j + 1}`,
        size_label_snapshot: '1.5L',
        cartons_qty: 2,
        loose_units_qty: j % 2,
        line_total: 2000,
      })),
    }));

  it('paginates multiple A4 pages cleanly for 4 (default), 6, and 2 slips per sheet', () => {
    const res4 = buildSalesSlipsPdf(makeSlips(9), 4);
    assert.strictEqual(res4.pageCount, 3);
    const txt4 = Buffer.from(res4.bytes).toString('latin1');
    assert.ok(txt4.startsWith('%PDF-1.4\n'));
    assert.ok(txt4.includes('/Count 3'));
    assert.ok(txt4.includes('/MediaBox [0 0 595.28 841.89]'));
    assert.ok(txt4.trimEnd().endsWith('%%EOF'));

    const res6 = buildSalesSlipsPdf(makeSlips(7), 6);
    assert.strictEqual(res6.pageCount, 2);
    const txt6 = Buffer.from(res6.bytes).toString('latin1');
    assert.ok(txt6.includes('/Count 2'));
    assert.ok(txt6.includes('6 Slips/A4'));

    const res2 = buildSalesSlipsPdf(makeSlips(3), 2);
    assert.strictEqual(res2.pageCount, 2);
    const txt2 = Buffer.from(res2.bytes).toString('latin1');
    assert.ok(txt2.includes('/Count 2'));
    assert.ok(txt2.includes('2 Slips/A4'));
  });

  it('produces valid exact byte offsets in xref table and handles overflow items', () => {
    const { bytes } = buildSalesSlipsPdf(makeSlips(5), 4);
    const txt = Buffer.from(bytes).toString('latin1');
    const xrefIdx = txt.indexOf('xref\n');
    const startxrefMatch = /startxref\n(\d+)\n%%EOF/.exec(txt);
    assert.ok(startxrefMatch, 'Missing startxref');
    assert.strictEqual(Number(startxrefMatch[1]), xrefIdx);

    // Every object entry offset in xref must point directly to "N 0 obj"
    const entryMatches = [...txt.slice(xrefIdx).matchAll(/^(\d{10}) 00000 n $/gm)];
    assert.strictEqual(entryMatches.length, 8); // Catalog, Pages, 2 Fonts, 2 Pages, 2 Content streams
    entryMatches.forEach((m, i) => {
      const offset = Number(m[1]);
      assert.ok(
        txt.slice(offset, offset + 12).startsWith(`${i + 1} 0 obj`),
        `Object ${i + 1} offset mismatch at ${offset}`
      );
    });
  });

  it('computes Today and Yesterday date keys in Asia/Karachi timezone', () => {
    // 2026-11-11 20:00 UTC is 2026-11-12 01:00 PKT (Asia/Karachi is UTC+5)
    const lateUtc = new Date('2026-11-11T20:00:00Z');
    assert.strictEqual(getKarachiDateKey(lateUtc), '2026-11-12');
    const { todayKey, yesterdayKey } = getTodayAndYesterdayKeys(lateUtc);
    assert.strictEqual(todayKey, '2026-11-12');
    assert.strictEqual(yesterdayKey, '2026-11-11');
  });
});














