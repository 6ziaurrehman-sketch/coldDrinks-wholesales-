-- ============================================================================
-- Migration 20261016000001: Scalability Indexes for Orders, Chat & Directory
-- Optimizes high-load queries across high-traffic tables
-- ============================================================================

-- Orders Table: Fast ordering queries, timeline sort, status filters, and shop history
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_shop_created
  ON public.orders (shop_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON public.orders (user_id, created_at DESC);

-- Order Items Table: Accelerated joins for order details & carton calculations
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_variant_id
  ON public.order_items (variant_id);

-- Messages & Chat Tables: Instant message retrieval and real-time synchronization
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_conversations_shop_last_msg
  ON public.conversations (shop_id, last_message_at DESC);

-- Profiles & Shops: Fast lookup by phone for customer-to-shop matching
CREATE INDEX IF NOT EXISTS idx_profiles_phone
  ON public.profiles (phone);

CREATE INDEX IF NOT EXISTS idx_shops_phone
  ON public.shops (phone);

CREATE INDEX IF NOT EXISTS idx_customers_phone
  ON public.customers (phone);
