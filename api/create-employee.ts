import { supabaseAdmin, resolveTenant } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const tenant = await resolveTenant(req)
        if (!tenant) return res.status(400).json({ error: 'Could not resolve tenant' })

        const { email, password, name, role, phone } = req.body

        if (!email || !password || !name) {
            return res.status(400).json({ error: 'email, password, and name are required' })
        }

        // Check if user already exists
        const { data: existing } = await supabaseAdmin.auth.admin.listUsers()
        const alreadyExists = existing?.users?.some(u => u.email === email)
        if (alreadyExists) {
            return res.status(409).json({ error: 'A user with this email already exists' })
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

        return res.status(200).json({
            success: true,
            user: { id: userId, email }
        })

    } catch (err: any) {
        console.error('[create-employee] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
