import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { phone, password, fullName, shopName, address } = await req.json();

    if (!phone || !password || !fullName || !shopName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build virtual email from phone number (same logic as phoneUtils.ts)
    const digits = phone.replace(/\D/g, '');
    const email = `user${digits}@colddrinks.pk`;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check if phone already exists in profiles
    const { data: existing } = await admin
      .from('profiles')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'An account is already registered with this phone number.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Create auth user with admin API — NO email confirmation, NO rate limit
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email confirmation entirely
      user_metadata: {
        full_name: fullName,
        phone,
        shop_name: shopName,
      },
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Failed to create user account' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try the complete_signup RPC first
    const { data: rpcRes, error: rpcErr } = await admin.rpc('complete_signup', {
      p_user_id: userId,
      p_email: email,
      p_phone: phone,
      p_full_name: fullName,
      p_business_name: shopName,
      p_shop_name: shopName,
      p_shop_address: address || '',
    });

    let shopId: string | null = rpcRes?.shop_id || null;

    if (rpcErr || !shopId) {
      console.warn('complete_signup RPC failed, using fallback:', rpcErr?.message);

      // Fallback: create shop manually
      const { data: shopCreated } = await admin
        .from('shops')
        .insert({ name: shopName, address: address || '', phone, is_active: true })
        .select('id')
        .single();

      shopId = shopCreated?.id || null;

      if (shopId) {
        await admin.from('profiles').upsert({
          id: userId,
          email,
          phone,
          full_name: fullName,
          account_status: 'active',
          active_shop_id: shopId,
          role: 'owner',
        });

        await admin.from('shop_users').upsert({
          shop_id: shopId,
          user_id: userId,
          role: 'owner',
          status: 'active',
        });
      }
    }

    // Save default address
    if (shopId && address) {
      await admin.from('customer_addresses').insert({
        shop_id: shopId,
        label: 'Shop',
        full_address: address,
        contact_name: fullName,
        contact_phone: phone,
        is_default: true,
        is_active: true,
      });
    }

    return new Response(
      JSON.stringify({ success: true, userId, shopId }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
