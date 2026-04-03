import { supabaseAdmin } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method === 'GET') {
        // Get booking details for review page
        const bookingId = req.query?.bookingId
        if (!bookingId) return res.status(400).json({ error: 'bookingId is required' })

        const { data: booking, error } = await supabaseAdmin
            .from('bookings')
            .select('id, check_in, check_out, guests(name), rooms(room_number, room_types(name))')
            .eq('id', bookingId)
            .single()

        if (error || !booking) return res.status(404).json({ error: 'Booking not found' })

        const { data: existingReview } = await supabaseAdmin
            .from('reviews')
            .select('id')
            .eq('booking_id', bookingId)
            .single()

        const guest = booking.guests as any
        const room = booking.rooms as any
        const roomType = room?.room_types as any

        return res.status(200).json({
            guestName: guest?.name || 'Guest',
            roomType: roomType?.name || room?.room_number || 'Room',
            checkIn: booking.check_in,
            checkOut: booking.check_out,
            alreadyReviewed: !!existingReview
        })
    }

    if (req.method === 'POST') {
        // Submit a review
        const { bookingId, rating, comment } = req.body
        if (!bookingId || !rating) return res.status(400).json({ error: 'bookingId and rating are required' })
        if (rating < 1 || rating > 5) return res.status(400).json({ error: 'rating must be between 1 and 5' })

        const { data: booking, error: bookingError } = await supabaseAdmin
            .from('bookings')
            .select('id, guests(name)')
            .eq('id', bookingId)
            .single()

        if (bookingError || !booking) return res.status(404).json({ error: 'Booking not found' })

        const { data: existing } = await supabaseAdmin
            .from('reviews')
            .select('id')
            .eq('booking_id', bookingId)
            .single()

        if (existing) return res.status(409).json({ error: 'This booking has already been reviewed' })

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

        if (error) return res.status(500).json({ error: error.message })
        return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
