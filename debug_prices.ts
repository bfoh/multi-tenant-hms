import { supabase } from './src/lib/supabase';

async function debugData() {
  console.log('--- DEBUG: Room Types ---');
  const { data: types, error: typesErr } = await supabase.from('room_types').select('*');
  if (typesErr) console.error('Error fetching room_types:', typesErr);
  else console.table(types?.map(t => ({ id: t.id, name: t.name, base_price: t.base_price, tenant_id: t.tenant_id })));

  console.log('\n--- DEBUG: Rooms ---');
  const { data: rooms, error: roomsErr } = await supabase.from('rooms').select('*, room_types(name)');
  if (roomsErr) console.error('Error fetching rooms:', roomsErr);
  else console.table(rooms?.map(r => ({ 
    id: r.id, 
    number: r.room_number, 
    type: r.room_types?.name || 'NULL', 
    price: r.price, 
    tenant_id: r.tenant_id 
  })));

  console.log('\n--- DEBUG: Current User Tenant ---');
  const { data: { user } } = await supabase.auth.getUser();
  console.log('User ID:', user?.id);
  console.log('User Metadata:', user?.app_metadata);
}

debugData();
