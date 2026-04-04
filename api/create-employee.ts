import { supabaseAdmin, resolveTenant } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        // Try domain-based tenant lookup first, then fall back to JWT
        let tenant = await resolveTenant(req)

        if (!tenant) {
            // Extract tenant_id from caller's Authorization JWT
            const authHeader = req.headers['authorization'] || ''
            const token = authHeader.replace('Bearer ', '')
            if (token) {
                const { data: { user } } = await supabaseAdmin.auth.getUser(token)
                const tenantId = user?.app_metadata?.tenant_id
                if (tenantId) {
                    const { data } = await supabaseAdmin
                        .from('tenants')
                        .select('*')
                        .eq('id', tenantId)
                        .single()
                    tenant = data
                }
            }
        }

        if (!tenant) return res.status(400).json({ error: 'Could not resolve tenant' })

        const { email, password, name, role, phone } = req.body

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'email, password, and name are required' })
        }

        // Create auth user with tenant_id in app_metadata
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            app_metadata: {
                tenant_id: tenant.id,
                role: role || 'staff'
            },
            user_metadata: { name, role: role || 'staff' }
        })

        if (error) {
            const alreadyExists = error.message.toLowerCase().includes('already') ||
                error.message.toLowerCase().includes('duplicate') ||
                (error as any).status === 422
            if (alreadyExists) {
                return res.status(409).json({ error: 'A user with this email already exists' })
            }
            console.error('[create-employee] Auth error:', error)
            return res.status(400).json({ error: error.message })
        }

        const userId = data.user.id

        // Create user profile record
        await supabaseAdmin.from('users').insert({
            id: userId,
            email,
            first_login: 1,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })

        // Create staff record directly (bypasses RLS using service role)
        const staffId = `staff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
        await supabaseAdmin.from('staff').insert({
            id: staffId,
            user_id: userId,
            name,
            email,
            phone: phone || null,
            role: role || 'staff',
            tenant_id: tenant.id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        
        // Log activity
        await supabaseAdmin.from('activity_logs').insert({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            action: 'created',
            entity_type: 'employee',
            entity_id: userId,
            details: JSON.stringify({
                name,
                email,
                role: role || 'staff',
                message: `Created employee: ${name} (${email})`
            }),
            user_id: 'system', // API routes act as system or we could derive from JWT if available
            tenant_id: tenant.id,
            created_at: new Date().toISOString()
        })

        return res.status(200).json({
            success: true,
            user: { id: userId, email },
            staffId
        })

    } catch (err: any) {
        console.error('[create-employee] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
