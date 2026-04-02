import { createClient } from '@supabase/supabase-js'

/**
 * DATA MIGRATION SCRIPT TEMPLATE
 * 
 * Use this to move data from your OLD standalone Supabase instances 
 * into the NEW unified Multi-Tenant Supabase instance.
 */

const OLD_SUPABASE_URL = 'https://old-client.supabase.co'
const OLD_SUPABASE_KEY = 'SERVICE_ROLE_KEY'

const NEW_SUPABASE_URL = 'https://new-unified.supabase.co'
const NEW_SUPABASE_KEY = 'SERVICE_ROLE_KEY'

const TARGET_TENANT_ID = 'INSERT_NEW_TENANT_ID_HERE'

const oldClient = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_KEY)
const newClient = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_KEY)

async function migrateTable(tableName) {
    console.log(`Migrating ${tableName}...`)

    // 1. Fetch from old
    const { data: records, error: fetchErr } = await oldClient.from(tableName).select('*')
    if (fetchErr) return console.error(`Error fetching ${tableName}:`, fetchErr)
    if (!records.length) return console.log(`No records in ${tableName}`)

    // 2. Prepare for new (inject tenant_id)
    const newRecords = records.map(r => ({ ...r, tenant_id: TARGET_TENANT_ID }))

    // 3. Upsert into new
    const { error: insertErr } = await newClient.from(tableName).upsert(newRecords)
    if (insertErr) console.error(`Error inserting into ${tableName}:`, insertErr)
    else console.log(`Successfully migrated ${records.length} records to ${tableName}`)
}

async function run() {
    // Migrate in order of dependency
    await migrateTable('room_types')
    await migrateTable('rooms')
    await migrateTable('guests')
    await migrateTable('bookings')
    await migrateTable('invoices')
    console.log('Migration complete!')
}

run()
