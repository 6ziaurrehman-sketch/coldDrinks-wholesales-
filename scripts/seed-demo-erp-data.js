const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const sUrl = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const sKey = env.match(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/)?.[1]?.trim();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(sUrl, sKey);

async function runSeed() {
  console.log('--- SEEDING REALISTIC DEMO ERP DATA ---');

  // Authenticate as owner
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'ziaurrehman666666@gmail.com',
    password: 'ZiaKhan1234*#',
  });
  if (authErr) {
    console.error('Auth error:', authErr);
    process.exit(1);
  }
  console.log('Authenticated as owner:', authData.user.email);

  // 1. SEED SUPPLIERS
  console.log('\n1. Seeding Beverage Suppliers...');
  const suppliersData = [
    {
      name: 'PepsiCo Pakistan Distributorship',
      contact_person: 'Tariq Mehmood (Area Manager)',
      phone: '+92 300 1122334',
      balance_payable: 15000.00,
    },
    {
      name: 'Coca-Cola Bottlers Ltd (Central Depot)',
      contact_person: 'Asif Javed (Sales Officer)',
      phone: '+92 321 5566778',
      balance_payable: 0.00,
    },
    {
      name: 'Gourmet Beverages Factory Outlet',
      contact_person: 'Imran Qureshi (Logistics)',
      phone: '+92 333 9988776',
      balance_payable: 8500.00,
    },
  ];

  for (const s of suppliersData) {
    const { data: existing } = await supabase.from('suppliers').select('id').eq('name', s.name).maybeSingle();
    if (!existing) {
      const { error } = await supabase.from('suppliers').insert(s);
      if (error) console.error('Error inserting supplier:', s.name, error);
      else console.log('  + Added supplier:', s.name);
    } else {
      await supabase.from('suppliers').update({ balance_payable: s.balance_payable }).eq('id', existing.id);
      console.log('  * Updated supplier:', s.name);
    }
  }

  // 2. SEED CUSTOMERS (RETAIL SHOPS)
  console.log('\n2. Seeding Retail Shop Customers...');
  const customersData = [
    {
      name: 'Al-Rehman General Store',
      owner_name: 'Haji Abdul Rehman',
      phone: '+92 301 4455667',
      address: 'Main Bazaar, Sector B',
      opening_balance: 0.00,
      current_balance: 4500.00,
      is_active: true,
    },
    {
      name: 'Madina Cash & Carry',
      owner_name: 'Muhammad Bilal',
      phone: '+92 322 8899001',
      address: 'Shop #14, Commercial Market',
      opening_balance: 5000.00,
      current_balance: 12000.00,
      is_active: true,
    },
    {
      name: 'Bismillah Cold Corner & Mart',
      owner_name: 'Shahid Khan',
      phone: '+92 345 1234567',
      address: 'Circular Road, Near Bus Stand',
      opening_balance: 0.00,
      current_balance: 0.00,
      is_active: true,
    },
    {
      name: 'New Khan Super Store',
      owner_name: 'Farooq Ahmad',
      phone: '+92 313 7788990',
      address: 'Block 4, Model Town',
      opening_balance: 1000.00,
      current_balance: 3200.00,
      is_active: true,
    },
  ];

  const customerMap = {};
  for (const c of customersData) {
    const { data: existing } = await supabase.from('customers').select('id').eq('name', c.name).maybeSingle();
    if (!existing) {
      const { data: inserted, error } = await supabase.from('customers').insert(c).select().single();
      if (error) console.error('Error inserting customer:', c.name, error);
      else {
        customerMap[c.name] = inserted.id;
        console.log('  + Added customer:', c.name);
      }
    } else {
      customerMap[c.name] = existing.id;
      await supabase.from('customers').update({ current_balance: c.current_balance }).eq('id', existing.id);
      console.log('  * Updated customer:', c.name);
    }
  }

  // 3. SEED INVENTORY (POPULATING CARTONS AND UNITS FOR COLD DRINKS)
  console.log('\n3. Seeding Realistic Warehouse Stock for Cold Drinks...');
  const { data: allVariants } = await supabase.from('product_variants').select(`
    id,
    size_label,
    pieces_per_unit,
    price,
    cost_price,
    products (
      id,
      name
    )
  `);

  if (!allVariants || allVariants.length === 0) {
    console.error('No variants found!');
    process.exit(1);
  }

  // Popular stock levels:
  // e.g. 50 cartons for 1.5L (6 pcs/ctn) -> 300 units
  // 30 cartons for 500ml/300ml (12-24 pcs/ctn) -> 360-720 units
  let stockedCount = 0;
  for (const v of allVariants) {
    const prodName = v.products?.name || '';
    const pieces = v.pieces_per_unit || 6;
    let targetCartons = 20;

    if (prodName.includes('Pepsi') || prodName.includes('Coca-Cola') || prodName.includes('7Up')) {
      targetCartons = 40;
    } else if (prodName.includes('Sting') || prodName.includes('Sprite') || prodName.includes('Dew')) {
      targetCartons = 30;
    } else if (prodName.includes('Water') || prodName.includes('Aquafina')) {
      targetCartons = 50;
    } else {
      targetCartons = 15;
    }

    const totalUnits = targetCartons * pieces;

    // Upsert into inventory
    const { error: invErr } = await supabase.from('inventory').upsert({
      variant_id: v.id,
      total_units: totalUnits,
      low_stock_threshold: pieces * 5, // low stock if less than 5 cartons
      last_restocked_at: new Date().toISOString(),
    }, { onConflict: 'variant_id' });

    if (!invErr) stockedCount++;
  }
  console.log(`  ✓ Stocked ${stockedCount} beverage product variants with physical inventory.`);

  // 4. SEED SAMPLE CUSTOMER KHATA LEDGER
  console.log('\n4. Seeding Customer Khata Ledger Transactions...');
  const alRehmanId = customerMap['Al-Rehman General Store'];
  if (alRehmanId) {
    const ledgerEntries = [
      {
        customer_id: alRehmanId,
        entry_type: 'opening_balance',
        reference_id: 'OB-2026',
        debit: 0.00,
        credit: 0.00,
        running_balance: 0.00,
        description: 'Account opened with 0 initial debt',
        created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
      },
      {
        customer_id: alRehmanId,
        entry_type: 'sale',
        reference_id: 'SLIP-2026-00001',
        debit: 6500.00,
        credit: 0.00,
        running_balance: 6500.00,
        description: 'Sale SLIP-2026-00001: 5 cartons Pepsi 1.5L + 12 cans Sprite',
        created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
      {
        customer_id: alRehmanId,
        entry_type: 'payment',
        reference_id: 'PAY-1001',
        debit: 0.00,
        credit: 2000.00,
        running_balance: 4500.00,
        description: 'Cash received on delivery by Haji Abdul Rehman',
        created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
      },
    ];

    for (const le of ledgerEntries) {
      await supabase.from('wholesaler_customer_ledger').insert(le);
    }
    console.log('  ✓ Seeded Al-Rehman General Store Khata ledger (Current balance: Rs. 4,500).');
  }

  // 5. SEED COMPLETED SALES SLIPS & SALE ITEMS
  console.log('\n5. Seeding Real Sales Slips...');
  const pepsiv = allVariants.find(v => v.products?.name?.includes('Pepsi') && v.size_label?.includes('1.5L')) || allVariants[0];
  const spritev = allVariants.find(v => v.products?.name?.includes('Sprite') || v.products?.name?.includes('7Up')) || allVariants[1];

  const sampleSale = {
    slip_number: 'SLIP-2026-00001',
    customer_id: alRehmanId,
    customer_name: 'Al-Rehman General Store',
    subtotal: 6700.00,
    discount: 200.00,
    final_total: 6500.00,
    paid_amount: 2000.00,
    balance_amount: 4500.00,
    payment_method: 'cash',
    status: 'completed',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  };

  const { data: saleData } = await supabase.from('sales').insert(sampleSale).select().single();
  if (saleData) {
    const saleItems = [
      {
        sale_id: saleData.id,
        variant_id: pepsiv.id,
        product_name: pepsiv.products?.name || 'Pepsi 1.5L',
        size_label: pepsiv.size_label || '1.5L',
        packaging_type: 'carton',
        pieces_per_carton: pepsiv.pieces_per_unit || 6,
        cartons: 4,
        loose_units: 0,
        total_units: 4 * (pepsiv.pieces_per_unit || 6),
        unit_price: pepsiv.price || 1200,
        line_total: 4 * (pepsiv.price || 1200),
      },
      {
        sale_id: saleData.id,
        variant_id: spritev.id,
        product_name: spritev.products?.name || 'Sprite 500ml',
        size_label: spritev.size_label || '500ml',
        packaging_type: 'carton',
        pieces_per_carton: spritev.pieces_per_unit || 12,
        cartons: 1,
        loose_units: 6,
        total_units: (spritev.pieces_per_unit || 12) + 6,
        unit_price: spritev.price || 1100,
        line_total: 1900,
      },
    ];
    await supabase.from('sale_items').insert(saleItems);
    console.log('  ✓ Seeded Sales Slip:', sampleSale.slip_number);
  }

  console.log('\n--- VERIFYING RPC INTEGRATION & DATA PIPELINE ---');

  // Verify Dashboard Metrics RPC
  const { data: metrics, error: mErr } = await supabase.rpc('wholesaler_get_dashboard_metrics');
  console.log('Dashboard Metrics:', metrics, mErr ? `Error: ${mErr.message}` : 'SUCCESS');

  // Verify Inventory RPC
  const { data: inv, error: iErr } = await supabase.rpc('wholesaler_get_inventory');
  console.log(`Inventory Items Loaded: ${inv?.length} items`, iErr ? `Error: ${iErr.message}` : 'SUCCESS');
  if (inv && inv.length > 0) {
    console.log('Sample in-stock item:', {
      name: inv[0].product_name,
      size: inv[0].size_label,
      cartons: inv[0].available_cartons,
      loose: inv[0].available_loose_units,
      stockValue: inv[0].stock_value,
      image: inv[0].image_url ? 'Connected (Has Image)' : 'No image'
    });
  }

  // Verify Top Selling Drinks RPC
  const { data: topSelling, error: tErr } = await supabase.rpc('wholesaler_get_top_selling_products');
  console.log(`Top Selling Products Loaded: ${topSelling?.length} items`, tErr ? `Error: ${tErr.message}` : 'SUCCESS');

  console.log('\nDEMO SEED COMPLETED SUCCESSFULLY!');
}

runSeed().catch(err => {
  console.error('Fatal seed failure:', err);
  process.exit(1);
});
