import { supabase } from '@/lib/supabase';
import { AppError, ErrorCode, mapSupabaseError } from '@/lib/errors';
import { HomeFeed, HomeFeedSection } from '@/types/home.types';

export const getHomeFeed = async (shopId: string): Promise<HomeFeed> => {
  const { data, error } = await (supabase.rpc as any)('get_home_feed', { p_shop_id: shopId });
  
  if (error) {
    throw mapSupabaseError(error, { actionName: 'get_home_feed' });
  }

  if (!data) {
    throw new AppError({ code: ErrorCode.SERVER_ERROR, message: 'No data returned from get_home_feed' });
  }

  const raw = data as any;
  
  const mapSection = <T>(section: any, mapper: (item: any) => any): HomeFeedSection<T> => {
    if (!section) return { data: null, error: null };
    if (section.error) return { data: null, error: section.error };
    if (!section.data) return { data: null, error: null };
    
    const mappedData = Array.isArray(section.data) 
      ? section.data.map(mapper) 
      : mapper(section.data);
      
    return { data: mappedData, error: null };
  };

  return {
    activeOrders: mapSection(raw.active_orders, (o: any) => ({
      id: o.id,
      orderNumber: o.order_number,
      status: o.status,
      total: o.total,
      expectedDelivery: o.expected_delivery,
      itemCount: o.item_count,
    })),
    lastOrder: mapSection(raw.last_order_summary, (o: any) => ({
      id: o.id,
      orderNumber: o.order_number,
      total: o.total,
      itemCount: o.item_count,
      createdAt: o.created_at,
    })),
    creditAlert: mapSection(raw.credit_alert, (c: any) => ({
      creditLimit: c.credit_limit,
      used: c.used,
      available: c.available,
      overdue: c.overdue,
    })),
    banners: mapSection(raw.banners, (b: any) => ({
      id: b.id,
      title: b.title,
      body: b.body,
      imageUrl: b.image_url,
      linkType: b.link_type,
      linkTarget: b.link_target,
    })),
    recentAndFavorites: mapSection(raw.recent_and_favorites, (p: any) => ({
      variantId: p.variant_id,
      productId: p.product_id,
      brand: p.brand,
      name: p.name,
      imageUrl: p.image_url,
      saleUnit: p.sale_unit,
      piecesPerUnit: p.pieces_per_unit,
      normalPrice: p.normal_price,
      shopPrice: p.shop_price,
      availability: p.availability,
      minQty: p.min_qty,
      maxQty: p.max_qty,
      qtyMultiple: p.qty_multiple,
    })),
    popularProducts: mapSection(raw.popular_products, (p: any) => ({
      variantId: p.variant_id,
      productId: p.product_id,
      brand: p.brand,
      name: p.name,
      imageUrl: p.image_url,
      saleUnit: p.sale_unit,
      piecesPerUnit: p.pieces_per_unit,
      normalPrice: p.normal_price,
      shopPrice: p.shop_price,
      availability: p.availability,
      minQty: p.min_qty,
      maxQty: p.max_qty,
      qtyMultiple: p.qty_multiple,
    })),
    brands: mapSection(raw.brands, (b: any) => ({
      id: b.id,
      name: b.name,
      logoUrl: b.logo_url,
    })),
    categories: mapSection(raw.categories, (c: any) => ({
      id: c.id,
      name: c.name,
      iconName: c.icon_name,
    })),
  };
};
