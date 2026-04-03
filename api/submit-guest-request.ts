import { supabaseAdmin } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const { token, type, details } = req.body

        if (!token || !type) {
            return res.status(400).json({ error: 'token and type are required' })
        }

        // Find the booking by guest token
        const { data: booking, error: bookingError } = await supabaseAdmin
            .from('bookings')
            .select('id')
            .eq('guest_token', token)
            .single()

        if (bookingError || !booking) {
            return res.status(404).json({ error: 'Invalid or expired token' })
        }

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

        if (error) {
            console.error('[submit-guest-request] Insert error:', error)
            return res.status(500).json({ error: error.message })
        }

        return res.status(200).json({ success: true })

    } catch (err: any) {
        console.error('[submit-guest-request] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
