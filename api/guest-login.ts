import { supabaseAdmin, resolveTenant } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' })
    }

    try {
        const tenant = await resolveTenant(req)
        if (!tenant) return res.status(401).json({ error: 'Unauthorized' })

        const { roomNumber, firstName } = req.body
        if (!roomNumber || !firstName) {
            return res.status(400).json({ error: 'Room number and First Name are required' })
        }

        // 1. Find Room (Tenant Scoped)
        const { data: room, error: roomError } = await supabaseAdmin
            .from('rooms')
            .select('id')
            .eq('room_number', roomNumber)
            .eq('tenant_id', tenant.id)
            .maybeSingle()

        if (roomError) throw roomError
        if (!room) return res.status(401).json({ error: 'Invalid Room Number' })

        // 2. Find Bookings (Tenant Scoped)
        const { data: allBookings, error: bErr } = await supabaseAdmin
            .from('bookings')
            .select('id, status, check_in, check_out, guest_token, guest_id, guests(name)')
            .eq('room_id', room.id)
            .eq('tenant_id', tenant.id)
            .order('check_in', { ascending: false })

        if (bErr) throw bErr
        if (!allBookings || allBookings.length === 0) {
            return res.status(401).json({ error: 'No bookings found for this room.' })
        }

        // 3. Match Logic
        const today = new Date().toISOString().split('T')[0]
        let activeBooking = null

        for (const booking of allBookings) {
            if (!['confirmed', 'checked-in'].includes(booking.status)) continue
            if (booking.check_out && booking.check_out < today) continue
            activeBooking = booking
            break
        }

        if (!activeBooking) return res.status(401).json({ error: 'No active booking found.' })

        // 4. Name Verify
        let guestName = (activeBooking.guests as any)?.name || ''
        if (!guestName && activeBooking.guest_id) {
            const { data: g } = await supabaseAdmin.from('guests').select('name').eq('id', activeBooking.guest_id).single()
            guestName = g?.name || ''
        }

        if (guestName.toLowerCase().startsWith(firstName.toLowerCase())) {
            return res.status(200).json({
                success: true,
                token: activeBooking.guest_token,
                guestName: guestName
            })
        } else {
            return res.status(401).json({ error: 'Name does not match.' })
        }

    } catch (err: any) {
        return res.status(500).json({ error: err.message })
    }
}
