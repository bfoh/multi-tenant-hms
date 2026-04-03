import { supabaseAdmin } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const { bookingId, rating, comment } = req.body

        if (!bookingId || !rating) {
            return res.status(400).json({ error: 'bookingId and rating are required' })
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'rating must be between 1 and 5' })
        }

        // Check booking exists and get guest info
        const { data: booking, error: bookingError } = await supabaseAdmin
            .from('bookings')
            .select('id, guest_id, guests(name)')
            .eq('id', bookingId)
            .single()

        if (bookingError || !booking) {
            return res.status(404).json({ error: 'Booking not found' })
        }

        // Check if already reviewed
        const { data: existing } = await supabaseAdmin
            .from('reviews')
            .select('id')
            .eq('booking_id', bookingId)
            .single()

        if (existing) {
            return res.status(409).json({ error: 'This booking has already been reviewed' })
        }

        const guestName = (booking.guests as any)?.name || 'Guest'

        const { error } = await supabaseAdmin
            .from('reviews')
            .insert({
                booking_id: bookingId,
                rating,
                comment: comment || '',
                guest_name: guestName,
                submitted_at: new Date().toISOString(),
                created_at: new Date().toISOString()
            })

        if (error) {
            console.error('[submit-review] Insert error:', error)
            return res.status(500).json({ error: error.message })
        }

        return res.status(200).json({ success: true })

    } catch (err: any) {
        console.error('[submit-review] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
