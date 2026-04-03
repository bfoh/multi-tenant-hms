import { supabaseAdmin } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method === 'GET') {
        // Get request history for a guest token
        const token = req.query?.token
        if (!token) return res.status(400).json({ error: 'token is required' })

        const { data, error } = await supabaseAdmin
            .from('service_requests')
            .select('id, request_type, description, status, created_at')
            .eq('guest_token', token)
            .order('created_at', { ascending: false })

        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ success: true, requests: data || [] })
    }

    if (req.method === 'POST') {
        // Submit a new guest request
        const { token, type, details } = req.body
        if (!token || !type) return res.status(400).json({ error: 'token and type are required' })

        const { data: booking, error: bookingError } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('guest_token', token)
            .single()

        if (bookingError || !booking) return res.status(404).json({ error: 'Invalid or expired token' })

        const { error } = await supabaseAdmin
            .from('service_requests')
            .insert({
                booking_id: booking.id,
                guest_token: token,
                request_type: type,
                description: details || '',
                status: 'pending',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })

        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
