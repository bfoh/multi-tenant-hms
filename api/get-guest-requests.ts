import { supabaseAdmin } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const token = req.query?.token

        if (!token) return res.status(400).json({ error: 'token is required' })

        const { data, error } = await supabaseAdmin
            .from('service_requests')
            .select('id, request_type, description, status, created_at')
            .eq('guest_token', token)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[get-guest-requests] Error:', error)
            return res.status(500).json({ error: error.message })
        }

        return res.status(200).json({ success: true, requests: data || [] })

    } catch (err: any) {
        console.error('[get-guest-requests] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
