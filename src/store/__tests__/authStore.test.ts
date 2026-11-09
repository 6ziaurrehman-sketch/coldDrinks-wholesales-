import { authService } from '@/lib/authService';
import {
  selectCanPlaceOrders,
  selectIsAuthenticated,
  selectRole,
  useAuthStore,
} from '@/store/authStore';

// Mock authService
jest.mock('@/lib/authService', () => ({
  authService: {
    requestOtp: jest.fn(),
    verifyOtp: jest.fn(),
    signInWithPassword: jest.fn(),
    signUp: jest.fn(),
    signOut: jest.fn(),
    requestPasswordReset: jest.fn(),
    updatePassword: jest.fn(),
    requestAccountDeletion: jest.fn(),
    fetchUserProfileAndShops: jest.fn(),
  },
}));

// Mock Supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
      unsubscribe: jest.fn(),
    }),
  },
  ExpoSecureStoreAdapter: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('authStore tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      session: null,
      profile: null,
      activeShopId: null,
      shops: [],
      accountStatus: null,
      otp: {
        phone: null,
        sentAt: null,
        resendAvailableAt: null,
        attempts: 0,
      },
      redirectIntent: null,
      isBootstrapped: false,
    });
  });

  describe('signInWithOtp & verifyOtp', () => {
    it('normalizes phone number and records sentAt & resendAvailableAt', async () => {
      const mockResend = Date.now() + 60000;
      (authService.requestOtp as jest.Mock).mockResolvedValueOnce({
        resendAvailableAt: mockResend,
        attemptsLeft: 4,
      });

      await useAuthStore.getState().signInWithOtp('03001234567');

      const state = useAuthStore.getState();
      expect(state.otp.phone).toBe('+923001234567');
      expect(state.otp.resendAvailableAt).toBe(mockResend);
      expect(authService.requestOtp).toHaveBeenCalledWith('+923001234567');
    });

    it('verifies OTP token, updates session and clears otp state', async () => {
      const mockSession = { user: { id: 'u-123' }, access_token: 'token-abc' };
      (authService.verifyOtp as jest.Mock).mockResolvedValueOnce({ session: mockSession });
      (authService.fetchUserProfileAndShops as jest.Mock).mockResolvedValueOnce({
        profile: {
          id: 'u-123',
          email: 'buyer@test.com',
          account_status: 'active',
          full_name: 'Buyer One',
        },
        shops: [
          {
            shopId: 's-1',
            shopName: 'Super Mart',
            role: 'owner',
            isActive: true,
            businessId: 'b-1',
          },
        ],
      });

      useAuthStore.setState({
        otp: {
          phone: '+923001234567',
          sentAt: Date.now(),
          resendAvailableAt: Date.now() + 60000,
          attempts: 0,
        },
      });

      await useAuthStore.getState().verifyOtp('123456');

      const state = useAuthStore.getState();
      expect(state.session).toEqual(mockSession);
      expect(state.profile?.id).toBe('u-123');
      expect(state.accountStatus).toBe('active');
      expect(state.activeShopId).toBe('s-1');
      expect(state.otp.phone).toBeNull();
    });

    it('increments attempts on verification failure', async () => {
      (authService.verifyOtp as jest.Mock).mockRejectedValueOnce(
        new Error('That code is incorrect. 3 attempts left.'),
      );

      useAuthStore.setState({
        otp: {
          phone: '+923001234567',
          sentAt: Date.now(),
          resendAvailableAt: Date.now() + 60000,
          attempts: 1,
        },
      });

      await expect(useAuthStore.getState().verifyOtp('000000')).rejects.toThrow(
        'That code is incorrect. 3 attempts left.',
      );

      expect(useAuthStore.getState().otp.attempts).toBe(2);
    });
  });

  describe('signInWithPassword', () => {
    it('sets session and loads user profile and shops', async () => {
      const mockSession = { user: { id: 'u-456' }, access_token: 'token-xyz' };
      (authService.signInWithPassword as jest.Mock).mockResolvedValueOnce({
        session: mockSession,
      });
      (authService.fetchUserProfileAndShops as jest.Mock).mockResolvedValueOnce({
        profile: {
          id: 'u-456',
          email: 'shop@test.com',
          account_status: 'active',
          full_name: 'Shop Owner',
        },
        shops: [
          {
            shopId: 's-2',
            shopName: 'City Mart',
            role: 'manager',
            isActive: true,
            businessId: 'b-2',
          },
        ],
      });

      await useAuthStore.getState().signInWithPassword('shop@test.com', 'secret123');

      const state = useAuthStore.getState();
      expect(state.session).toEqual(mockSession);
      expect(state.profile?.id).toBe('u-456');
      expect(state.activeShopId).toBe('s-2');
    });
  });

  describe('signOut', () => {
    it('clears session, profile, shops, and resets store state', async () => {
      useAuthStore.setState({
        session: { user: { id: 'u-123' }, access_token: 'token' } as any,
        profile: { id: 'u-123', email: 'test@test.com', account_status: 'active' } as any,
        activeShopId: 'shop-1',
        shops: [{ shopId: 'shop-1', shopName: 'S1', role: 'owner', isActive: true, businessId: 'b1' }],
      });

      await useAuthStore.getState().signOut();

      const state = useAuthStore.getState();
      expect(state.session).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.activeShopId).toBeNull();
      expect(state.shops).toHaveLength(0);
    });
  });

  describe('redirectIntent', () => {
    it('stores and retrieves saved redirect intent after session expiry or deep link', () => {
      expect(useAuthStore.getState().redirectIntent).toBeNull();

      useAuthStore.getState().setRedirectIntent('/cart');
      expect(useAuthStore.getState().redirectIntent).toBe('/cart');

      useAuthStore.getState().setRedirectIntent(null);
      expect(useAuthStore.getState().redirectIntent).toBeNull();
    });
  });

  describe('Selectors', () => {
    it('evaluates isAuthenticated correctly', () => {
      expect(selectIsAuthenticated(useAuthStore.getState())).toBe(false);

      useAuthStore.setState({
        session: { access_token: '123' } as any,
        profile: { id: 'u-1' } as any,
      });

      expect(selectIsAuthenticated(useAuthStore.getState())).toBe(true);
    });

    it('evaluates canPlaceOrders strictly (must be active with an active shop)', () => {
      useAuthStore.setState({
        accountStatus: 'pending_approval',
        activeShopId: 'shop-1',
      });
      expect(selectCanPlaceOrders(useAuthStore.getState())).toBe(false);

      useAuthStore.setState({
        accountStatus: 'suspended',
        activeShopId: 'shop-1',
      });
      expect(selectCanPlaceOrders(useAuthStore.getState())).toBe(false);

      useAuthStore.setState({
        accountStatus: 'active',
        activeShopId: null,
      });
      expect(selectCanPlaceOrders(useAuthStore.getState())).toBe(false);

      useAuthStore.setState({
        accountStatus: 'active',
        activeShopId: 'shop-1',
      });
      expect(selectCanPlaceOrders(useAuthStore.getState())).toBe(true);
    });

    it('evaluates role selector for activeShopId', () => {
      useAuthStore.setState({
        activeShopId: 'shop-abc',
        shops: [
          { shopId: 'shop-abc', shopName: 'Shop A', role: 'owner', isActive: true, businessId: 'b1' },
          { shopId: 'shop-def', shopName: 'Shop B', role: 'staff', isActive: true, businessId: 'b2' },
        ],
      });

      expect(selectRole(useAuthStore.getState())).toBe('owner');

      useAuthStore.getState().setActiveShopId('shop-def');
      expect(selectRole(useAuthStore.getState())).toBe('staff');
    });
  });
});
