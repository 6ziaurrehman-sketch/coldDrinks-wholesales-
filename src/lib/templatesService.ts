import { supabase } from '@/lib/supabase';
import type { OrderTemplate } from '@/types/advancedModules.types';

export const templatesService = {
  /**
   * Fetch templates for a shop
   */
  async fetchTemplates(shopId: string): Promise<OrderTemplate[]> {
    const { data, error } = await (supabase as any)
      .from('order_templates')
      .select('id, shop_id, name, created_by, is_shared, created_at, updated_at, order_template_items(count)')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[TemplatesService] fetchTemplates error:', error);
      return [];
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      shopId: row.shop_id,
      name: row.name,
      createdBy: row.created_by,
      isShared: row.is_shared,
      itemCount: row.order_template_items?.[0]?.count || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  /**
   * Fetch template items and variant details
   */
  async fetchTemplateDetail(templateId: string): Promise<OrderTemplate | null> {
    const { data: tpl, error: tplError } = await (supabase as any)
      .from('order_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (tplError || !tpl) return null;

    const { data: items } = await (supabase as any)
      .from('order_template_items')
      .select(`
        id,
        variant_id,
        quantity,
        product_variants (
          id,
          name,
          price,
          products (
            title,
            image_url
          )
        )
      `)
      .eq('template_id', templateId);

    return {
      id: tpl.id,
      shopId: tpl.shop_id,
      name: tpl.name,
      createdBy: tpl.created_by,
      isShared: tpl.is_shared,
      itemCount: items?.length || 0,
      createdAt: tpl.created_at,
      updatedAt: tpl.updated_at,
      items: (items || []).map((i: any) => ({
        id: i.id,
        variantId: i.variant_id,
        quantity: i.quantity,
        variantName: i.product_variants?.name,
        productName: i.product_variants?.products?.title,
        unitPrice: Number(i.product_variants?.price || 0),
        imageUrl: i.product_variants?.products?.image_url,
      })),
    };
  },

  /**
   * Save new order template
   */
  async createTemplate(
    shopId: string,
    name: string,
    items: { variantId: string; quantity: number }[],
    isShared: boolean = true,
  ): Promise<string> {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) throw new Error('NOT_AUTHENTICATED');

    const { data: tpl, error: tplError } = await (supabase as any)
      .from('order_templates')
      .insert({
        shop_id: shopId,
        name: name.trim(),
        created_by: user.user.id,
        is_shared: isShared,
      })
      .select('id')
      .single();

    if (tplError || !tpl) {
      throw new Error(tplError?.message || 'Failed to create template');
    }

    if (items.length > 0) {
      const rows = items.map((i) => ({
        template_id: tpl.id,
        variant_id: i.variantId,
        quantity: i.quantity,
      }));

      await (supabase as any).from('order_template_items').insert(rows);
    }

    return tpl.id;
  },

  /**
   * Delete template
   */
  async deleteTemplate(templateId: string): Promise<void> {
    const { error } = await (supabase as any)
      .from('order_templates')
      .delete()
      .eq('id', templateId);

    if (error) {
      throw new Error(error.message || 'Failed to delete template');
    }
  },
};
