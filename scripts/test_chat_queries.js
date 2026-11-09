const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let envFile = '';
if (fs.existsSync('.env.local')) {
  envFile = fs.readFileSync('.env.local', 'utf8');
} else if (fs.existsSync('.env')) {
  envFile = fs.readFileSync('.env', 'utf8');
}

const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    value = value.trim().replace(/^['"]|['"]$/g, '');
    env[match[1]] = value;
  }
});

const supabase = createClient(
  env.EXPO_PUBLIC_SUPABASE_URL || 'https://qtzkuonkcfgdhxuvazha.supabase.co',
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_4z58y86_ox2WNFfgHrjJWw_CaMYk7F9'
);

async function test() {
  const { data: convs, error: err1 } = await supabase
    .from('conversations')
    .select('id, shop_id, last_message_at, shop:shops(id, name, phone)')
    .order('last_message_at', { ascending: false });

  console.log('Conversations count:', convs ? convs.length : 0, 'Error:', err1?.message);
  if (convs && convs.length > 0) {
    console.log('Sample conversation:', convs[0]);
  }

  const { data: msgs, error: err2 } = await supabase
    .from('messages')
    .select('id, conversation_id, text, created_at, read_at, sender_role')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Sample messages:', msgs ? msgs.length : 0, 'Error:', err2?.message);
  if (msgs && msgs.length > 0) {
    console.log('Latest message:', msgs[0]);
  }
}

test();
