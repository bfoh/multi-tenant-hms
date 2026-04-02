import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

export async function resolveTenant(req: any) {
    const host = req.headers['host'] || ''
    const origin = req.headers['origin'] || ''
    const referer = req.headers['referer'] || ''

    // Derive domain from origin first, then referer, then host
    let domain = host
    if (origin) {
        domain = new URL(origin).hostname
    } else if (referer) {
        domain = new URL(referer).hostname
    }

    // Special case for local development
    if (domain === 'localhost' || domain === '127.0.0.1') {
        const tenantId = req.headers['x-tenant-id'] || req.query?.tenant_id
        if (tenantId) {
            const { data } = await supabaseAdmin
                .from('tenants')
                .select('*')
                .eq('id', tenantId)
                .single()
            return data
        }
    }

    const { data, error } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('domain', domain)
        .single()

    if (error || !data) {
        console.error(`[resolveTenant] Could not resolve tenant for domain: ${domain}`, error)
        return null
    }

    return data
}
