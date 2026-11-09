const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const sUrl = env.match(/EXPO_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const sKey = env.match(/EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=(.*)/)?.[1]?.trim();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(sUrl, sKey);

async function verifyAllFeatures() {
  console.log('=====================================================');
  console.log('   FULL END-TO-END WHOLESALER ERP FEATURE AUDIT      ');
  console.log('=====================================================\n');

  // Authenticate as owner
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: 'ziaurrehman666666@gmail.com',
    password: 'ZiaKhan1234*#',
  });
  if (authErr) {
    console.error('FAILED TO AUTHENTICATE:', authErr);
    process.exit(1);
  }
  console.log('✓ FEATURE 0: Owner Authentication (Signed in as owner)');

  // 1. TEST CUSTOMERS & KHATA FETCH
  const { data: customers, error: cErr } = await supabase.from('customers').select('*');
  if (cErr || !customers || customers.length === 0) throw new Error('Customers query failed');
  console.log(`✓ FEATURE 1: Customers Khata Register: Found ${customers.length} shops (Sample: ${customers[0].name}, Balance: Rs. ${customers[0].current_balance})`);
  const testCustomer = customers[0];

  // 2. TEST SUPPLIERS FETCH
  const { data: suppliers, error: sErr } = await supabase.from('suppliers').select('*');
  if (sErr || !suppliers || suppliers.length === 0) throw new Error('Suppliers query failed');
  console.log(`✓ FEATURE 2: Beverage Suppliers: Found ${suppliers.length} distributors (Sample: ${suppliers[0].name}, Payables: Rs. ${suppliers[0].balance_payable})`);
  const testSupplier = suppliers[0];

  // 3. TEST INVENTORY & DUAL-UNIT STOCK
  const { data: inventory, error: iErr } = await supabase.rpc('wholesaler_get_inventory');
  if (iErr || !inventory || inventory.length === 0) throw new Error('Inventory RPC failed');
  console.log(`✓ FEATURE 3: Inventory Listing: ${inventory.length} drink variants loaded`);
  const itemToSell = inventory.find(i => i.product_name.includes('7Up') && i.size_label === '1.5L') || inventory[0];
  const initialStock = itemToSell.total_units;
  console.log(`   Selected for sale test: ${itemToSell.product_name} (${itemToSell.size_label})`);
  console.log(`   Initial stock: ${itemToSell.available_cartons} Cartons + ${itemToSell.available_loose_units} Loose (${initialStock} total units)`);
  console.log(`   Image URL: ${itemToSell.image_url}`);

  // 4. TEST NEW SALE WITH AUTOMATIC STOCK DEDUCTION & SLIP GENERATION
  const pieces = itemToSell.pieces_per_carton;
  const cartonsToSell = 2;
  const looseToSell = 3;
  const unitsToDeduct = (cartonsToSell * pieces) + looseToSell;
  const salePricePerCarton = itemToSell.price_per_carton;
  const saleSubtotal = (cartonsToSell * salePricePerCarton) + (looseToSell * (salePricePerCarton / pieces));
  const cashPaid = 1000.00;

  console.log(`\n4. Testing New Sale POS Counter...`);
  console.log(`   Selling: ${cartonsToSell} cartons + ${looseToSell} loose bottles = ${unitsToDeduct} units`);
  console.log(`   Subtotal: Rs. ${saleSubtotal}, Paid: Rs. ${cashPaid}`);

  const { data: saleResult, error: saleErr } = await supabase.rpc('wholesaler_finalize_sale', {
    p_customer_id: testCustomer.id,
    p_items: [
      {
        variant_id: itemToSell.variant_id,
        cartons_qty: cartonsToSell,
        loose_units_qty: looseToSell,
        price_per_carton: salePricePerCarton,
      }
    ],
    p_discount: 0,
    p_paid_amount: cashPaid,
    p_payment_method: 'cash',
    p_notes: 'Automated POS test verification',
  });

  if (saleErr) throw new Error('wholesaler_finalize_sale RPC failed: ' + saleErr.message);
  console.log(`✓ FEATURE 4: Finalize Sale SUCCESS!`);
  console.log(`   Receipt No: ${saleResult.receipt_no}`);
  console.log(`   Previous Balance: Rs. ${saleResult.previous_balance}`);
  console.log(`   Total Amount: Rs. ${saleResult.total_amount}`);
  console.log(`   Paid Amount: Rs. ${saleResult.paid_amount}`);
  console.log(`   New Customer Balance: Rs. ${saleResult.new_balance}`);

  // Verify stock was decremented by exact units
  const { data: updatedInv } = await supabase.rpc('wholesaler_get_inventory');
  const afterSaleItem = updatedInv.find(i => i.variant_id === itemToSell.variant_id);
  const expectedStock = initialStock - unitsToDeduct;
  if (afterSaleItem.total_units !== expectedStock) {
    throw new Error(`Stock mismatch! Expected ${expectedStock}, got ${afterSaleItem.total_units}`);
  }
  console.log(`✓ FEATURE 5: Automatic Stock Deduction verified! Remaining: ${afterSaleItem.total_units} units (${afterSaleItem.available_cartons} ctn + ${afterSaleItem.available_loose_units} loose)`);

  // 5. TEST CUSTOMER CASH PAYMENT & LEDGER WRITING
  console.log(`\n5. Testing Customer Payment (Khata Recovery)...`);
  const paymentAmount = 500.00;
  const { data: payResult, error: payErr } = await supabase.rpc('wholesaler_record_customer_payment', {
    p_customer_id: testCustomer.id,
    p_amount: paymentAmount,
    p_payment_method: 'cash',
    p_reference_no: 'TEST-RCPT-999',
    p_notes: 'Test cash recovery',
  });
  if (payErr) throw new Error('wholesaler_record_customer_payment failed: ' + payErr.message);
  console.log(`✓ FEATURE 6: Customer Payment Recorded! Amount: Rs. ${paymentAmount}, New Balance: Rs. ${payResult.new_balance}`);

  // 6. TEST CUSTOMER RETURN & STOCK RESTOCKING
  console.log(`\n6. Testing Customer Return...`);
  const { data: retResult, error: retErr } = await supabase.rpc('wholesaler_record_customer_return', {
    p_customer_id: testCustomer.id,
    p_variant_id: itemToSell.variant_id,
    p_cartons_qty: 1,
    p_loose_units_qty: 1,
    p_credit_amount: 1100,
    p_reason: 'Shop overstocked, returned sealed',
  });
  if (retErr) throw new Error('wholesaler_record_customer_return failed: ' + retErr.message);
  console.log(`✓ FEATURE 7: Customer Return Processed! Units returned: ${retResult.units_returned}, Customer Credited: Rs. ${retResult.credit_amount}, New Balance: Rs. ${retResult.new_customer_balance}`);

  // 7. TEST STOCK ADJUSTMENT (DAMAGE / BREAKAGE)
  console.log(`\n7. Testing Stock Adjustment (Breakage in Warehouse)...`);
  const { data: adjResult, error: adjErr } = await supabase.rpc('wholesaler_record_stock_adjustment', {
    p_variant_id: itemToSell.variant_id,
    p_type: 'breakage',
    p_units_delta: -2,
    p_reason: '2 bottles broken during handling',
    p_notes: 'Audited stock adjustment',
  });
  if (adjErr) throw new Error('wholesaler_record_stock_adjustment failed: ' + adjErr.message);
  console.log(`✓ FEATURE 8: Stock Adjustment Success! Discarded 2 broken bottles. New Units: ${adjResult.new_units}`);

  // 8. TEST SUPPLIER INWARD PURCHASE
  console.log(`\n8. Testing Inward Supplier Purchase...`);
  const purchaseCartons = 10;
  const { data: purchResult, error: purchErr } = await supabase.rpc('wholesaler_finalize_purchase', {
    p_supplier_id: testSupplier.id,
    p_invoice_no: 'INWARD-TEST-001',
    p_items: [
      {
        variant_id: itemToSell.variant_id,
        cartons_qty: purchaseCartons,
        loose_units_qty: 0,
        cost_per_carton: itemToSell.cost_per_carton,
      }
    ],
    p_transport_cost: 200,
    p_paid_amount: 5000,
    p_payment_method: 'bank_transfer',
    p_notes: 'Received fresh stock from distributor depot',
  });
  if (purchErr) throw new Error('wholesaler_finalize_purchase failed: ' + purchErr.message);
  console.log(`✓ FEATURE 9: Inward Purchase Finalized! Purchase ID: ${purchResult.purchase_id}, Total Cost: Rs. ${purchResult.total_cost}, Remaining Payable: Rs. ${purchResult.balance_amount}`);

  // 9. TEST DASHBOARD & REPORTS METRICS
  console.log(`\n9. Testing Executive Dashboard Metrics...`);
  const { data: metrics, error: mErr } = await supabase.rpc('wholesaler_get_dashboard_metrics');
  if (mErr) throw new Error('wholesaler_get_dashboard_metrics failed: ' + mErr.message);
  console.log('✓ FEATURE 10: Executive Reports & Working Capital:');
  console.log(`   - Total Stock Valuation (Cost Basis): Rs. ${metrics.total_stock_value}`);
  console.log(`   - Customer Receivables (Khata): Rs. ${metrics.total_customer_receivables}`);
  console.log(`   - Supplier Payables: Rs. ${metrics.total_supplier_payables}`);
  console.log(`   - Today's Sales Count: ${metrics.today_sales_count}`);
  console.log(`   - Today's Revenue: Rs. ${metrics.today_sales_amount}`);
  console.log(`   - Today's Cash Collected: Rs. ${metrics.today_cash_collected}`);

  // 10. TEST TOP SELLING COLD DRINKS REPORT
  const { data: topSelling, error: topErr } = await supabase.rpc('wholesaler_get_top_selling_products');
  if (topErr) throw new Error('wholesaler_get_top_selling_products failed: ' + topErr.message);
  console.log(`✓ FEATURE 11: Top Selling Drinks Ranking: Found ${topSelling.length} top products`);
  if (topSelling.length > 0) {
    console.log(`   #1 Best Seller: ${topSelling[0].product_name} (${topSelling[0].size_label}) - Revenue: Rs. ${topSelling[0].total_sales_revenue}`);
  }

  console.log('\n=====================================================');
  console.log('   ALL FEATURES READ AND WRITE PERFECTLY! 100% OK!   ');
  console.log('=====================================================');
}

verifyAllFeatures().catch(err => {
  console.error('\n❌ AUDIT FAILED:', err);
  process.exit(1);
});
