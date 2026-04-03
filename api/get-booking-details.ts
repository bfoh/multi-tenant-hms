import { supabaseAdmin } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const bookingId = req.query?.bookingId

        if (!bookingId) return res.status(400).json({ error: 'bookingId is required' })

        const { data: booking, error } = await supabaseAdmin
            .from('bookings')
            .select('id, check_in, check_out, room_id, guest_id, guests(name), rooms(room_number, room_type_id, room_types(name))')
            .eq('id', bookingId)
            .single()

        if (error || !booking) {
            return res.status(404).json({ error: 'Booking not found' })
        }

        // Check if already reviewed
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

    } catch (err: any) {
        console.error('[get-booking-details] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
