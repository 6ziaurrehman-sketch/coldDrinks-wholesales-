const { createClient } = require('@supabase/supabase-js');
const c = createClient(
  'https://qtzkuonkcfgdhxuvazha.supabase.co',
  'sb_publishable_4z58y86_ox2WNFfgHrjJWw_CaMYk7F9'
);

async function testVisibility() {
  const { data: auth, error: authErr } = await c.auth.signInWithPassword({
    email: 'shahid123@gmail.com',
    password: 'alFajar123*#',
  });
  if (authErr) {
    console.log('Error:', authErr);
    return;
  }
  console.log('=== SIGNED IN AS WHOLESALER ===', auth.user.email);

  // 1. Orders
  const { data: orders, error: oErr } = await c
    .from('orders')
    .select(
      'id, order_number, shop_id, status, grand_total, created_at, shop:shops(id, name), items:order_items(product_name, qty, line_total)'
    )
    .order('created_at', { ascending: false });
  console.log('WHOLESALER VISIBLE ORDERS COUNT:', orders?.length, oErr?.message || '');
  if (orders && orders.length > 0) {
    orders.forEach((o) => {
      console.log(
        `Order #${o.order_number} from Shop: ${o.shop?.name} | Total: Rs.${o.grand_total} | Status: ${o.status} | Items: ${o.items?.length}`
      );
    });
  }

  // 2. Conversations
  const { data: convs, error: cErr } = await c
    .from('conversations')
    .select('id, shop_id, status, last_message_at, shop:shops(id, name)')
    .order('last_message_at', { ascending: false });
  console.log('WHOLESALER VISIBLE CONVERSATIONS COUNT:', convs?.length, cErr?.message || '');
  if (convs && convs.length > 0) {
    convs.forEach((cv) => {
      console.log(
        `Chat ID: ${cv.id} | Shop: ${cv.shop?.name} | Last Msg: ${cv.last_message_at}`
      );
    });
  }

  // 3. Messages
  if (convs && convs.length > 0) {
    const { data: msgs, error: mErr } = await c
      .from('messages')
      .select('id, conversation_id, sender_role, text, created_at')
      .eq('conversation_id', convs[0].id)
      .order('created_at', { ascending: true });
    console.log(
      'WHOLESALER VISIBLE MESSAGES in latest chat:',
      msgs?.length,
      mErr?.message || ''
    );
    if (msgs && msgs.length > 0) {
      msgs.forEach((m) => console.log(`  [${m.sender_role}]: ${m.text}`));
    }
  }

  // 4. Shops
  const { data: shops } = await c.from('shops').select('id, name, phone, address');
  console.log('WHOLESALER VISIBLE SHOPS COUNT:', shops?.length);
  if (shops) {
    shops.forEach((s) => console.log(`Shop: ${s.name} (${s.phone}) - ${s.address}`));
  }
}

testVisibility();
