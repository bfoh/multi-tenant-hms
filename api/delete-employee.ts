import { supabaseAdmin } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const { userId } = req.body

        if (!userId) return res.status(400).json({ error: 'userId is required' })

        // Resolve tenant to ensure we log under the correct tenant_id
        const { data: { user: adminUser } } = await supabaseAdmin.auth.getUser(req.headers['authorization']?.replace('Bearer ', '') || '')
        const tenantId = adminUser?.app_metadata?.tenant_id

        // Log activity
        if (tenantId) {
            await supabaseAdmin.from('activity_logs').insert({
                id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                action: 'deleted',
                entity_type: 'employee',
                entity_id: userId,
                details: JSON.stringify({
                    userId,
                    message: `Deleted employee with ID: ${userId}`
                }),
                user_id: adminUser?.id || 'system',
                tenant_id: tenantId,
                created_at: new Date().toISOString()
            })
        }

        return res.status(200).json({ success: true })

    } catch (err: any) {
        console.error('[delete-employee] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
