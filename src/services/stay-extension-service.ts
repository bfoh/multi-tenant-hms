import { supabase } from '@/lib/supabase'
import { bookingChargesService } from './booking-charges-service'
import { activityLogService } from './activity-log-service'

function _toCC(obj: Record<string, any>) {
    const m: Record<string, string> = {
        guest_id: 'guestId', room_id: 'roomId', room_type_id: 'roomTypeId',
        check_in: 'checkIn', check_out: 'checkOut', total_price: 'totalPrice',
        base_price: 'basePrice', room_number: 'roomNumber', created_at: 'createdAt',
    }
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(obj)) out[m[k] || k] = v
    return out
}
function _toSnake(obj: Record<string, any>) {
    const m: Record<string, string> = {
        guestId: 'guest_id', roomId: 'room_id', roomTypeId: 'room_type_id',
        checkIn: 'check_in', checkOut: 'check_out', totalPrice: 'total_price',
        basePrice: 'base_price', roomNumber: 'room_number',
    }
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(obj)) out[m[k] || k] = v
    return out
}

const db = {
    bookings: {
        list: async (opts?: { where?: Record<string, any>; limit?: number }) => {
            let q = supabase.from('bookings').select('*').limit(opts?.limit || 500)
            if (opts?.where?.roomId) q = q.eq('room_id', opts.where.roomId)
            const { data } = await q
            return (data || []).map(_toCC)
        },
        get: async (id: string) => {
            const { data } = await supabase.from('bookings').select('*').eq('id', id).maybeSingle()
            return data ? _toCC(data) : null
        },
        update: async (id: string, payload: Record<string, any>) => {
            await supabase.from('bookings').update(_toSnake(payload)).eq('id', id)
        },
    },
    rooms: {
        list: async (opts?: { limit?: number }) => {
            const { data } = await supabase.from('rooms').select('*').limit(opts?.limit || 100)
            return (data || []).map(_toCC)
        },
        get: async (id: string) => {
            const { data } = await supabase.from('rooms').select('*').eq('id', id).maybeSingle()
            return data ? _toCC(data) : null
        },
    },
    roomTypes: {
        get: async (id: string) => {
            const { data } = await supabase.from('room_types').select('*').eq('id', id).maybeSingle()
            return data ? _toCC(data) : null
        },
    },
    guests: {
        list: async (opts?: { where?: Record<string, any>; limit?: number }) => {
            let q = supabase.from('guests').select('*').limit(opts?.limit || 500)
            if (opts?.where?.id?.in) q = q.in('id', opts.where.id.in)
            const { data } = await q
            return data || []
        },
    },
    properties: {
        list: async (opts?: { limit?: number }) => {
            const { data } = await supabase.from('rooms').select('*').limit(opts?.limit || 100)
            return (data || []).map((r: any) => _toCC(r))
        },
    },
}

export interface ExtensionResult {
    success: boolean
    error?: string
    newCheckout?: string
    extensionCost?: number
    chargeId?: string
    roomChanged?: boolean
    newRoomId?: string
}

export interface RoomAvailability {
    available: boolean
    conflictingBookings?: Array<{
        id: string
        guestName: string
        checkIn: string
        checkOut: string
    }>
}

export interface AvailableRoom {
    id: string
    roomNumber: string
    roomType: string
    pricePerNight: number
}

class StayExtensionService {

    /**
     * Check if a room is available for the given date range
     * Excludes the current booking from the check
     */
    async checkRoomAvailability(
        roomId: string,
        startDate: string,
        endDate: string,
        excludeBookingId?: string
    ): Promise<RoomAvailability> {
        try {
            console.log('[StayExtension] Checking room availability:', { roomId, startDate, endDate })

            // Get all bookings for this room
            const allBookings = await db.bookings.list({
                where: { roomId },
                limit: 500
            })

            // Filter for confirmed or checked-in bookings that overlap with our dates
            const conflictingBookings = allBookings.filter((b: any) => {
                // Skip the current booking
                if (excludeBookingId && b.id === excludeBookingId) return false

                // Only consider active bookings
                if (!['confirmed', 'checked-in'].includes(b.status)) return false

                // Check for overlap
                const bookingStart = new Date(b.checkIn)
                const bookingEnd = new Date(b.checkOut)
                const requestStart = new Date(startDate)
                const requestEnd = new Date(endDate)

                // Overlap exists if: requestStart < bookingEnd AND requestEnd > bookingStart
                return requestStart < bookingEnd && requestEnd > bookingStart
            })

            if (conflictingBookings.length > 0) {
                // Get guest names for the conflicts
                const guestIds = conflictingBookings.map((b: any) => b.guestId)
                const guests = await db.guests.list({ where: { id: { in: guestIds } } })
                const guestMap = new Map(guests.map((g: any) => [g.id, g.name]))

                const conflicts = conflictingBookings.map((b: any) => ({
                    id: b.id,
                    guestName: guestMap.get(b.guestId) || 'Unknown Guest',
                    checkIn: b.checkIn,
                    checkOut: b.checkOut
                }))

                console.log('[StayExtension] Room has conflicts:', conflicts.length)
                return { available: false, conflictingBookings: conflicts }
            }

            console.log('[StayExtension] Room is available')
            return { available: true }

        } catch (error) {
            console.error('[StayExtension] Error checking availability:', error)
            return { available: false }
        }
    }

    /**
     * Get available rooms for a date range
     */
    async getAvailableRooms(startDate: string, endDate: string): Promise<AvailableRoom[]> {
        try {
            console.log('[StayExtension] Finding available rooms for:', { startDate, endDate })

            // Get all rooms
            const allRooms = await db.rooms.list({ limit: 100 })

            // Get all bookings that overlap with requested dates
            const allBookings = await db.bookings.list({ limit: 500 })

            const requestStart = new Date(startDate)
            const requestEnd = new Date(endDate)

            // Find rooms with conflicts
            const occupiedRoomIds = new Set<string>()

            for (const booking of allBookings) {
                if (!['confirmed', 'checked-in'].includes(booking.status)) continue

                const bookingStart = new Date(booking.checkIn)
                const bookingEnd = new Date(booking.checkOut)

                // Check for overlap
                if (requestStart < bookingEnd && requestEnd > bookingStart) {
                    occupiedRoomIds.add(booking.roomId)
                }
            }

            // Filter to available rooms
            const availableRooms = allRooms
                .filter((room: any) => !occupiedRoomIds.has(room.id))
                .map((room: any) => ({
                    id: room.id,
                    roomNumber: room.roomNumber,
                    roomType: room.roomType || 'Standard Room',
                    pricePerNight: room.pricePerNight || room.price || 0
                }))

            console.log('[StayExtension] Found available rooms:', availableRooms.length)
            return availableRooms

        } catch (error) {
            console.error('[StayExtension] Error getting available rooms:', error)
            return []
        }
    }

    /**
     * Calculate extension cost based on room rate and nights
     */
    async calculateExtensionCost(roomId: string, additionalNights: number): Promise<number> {
        try {
            const pricePerNight = await this.getRoomRate(roomId)
            return pricePerNight * additionalNights
        } catch (error) {
            console.error('[StayExtension] Error calculating cost:', error)
            return 0
        }
    }

    /**
     * Get room rate per night - looks up from room.price or roomType.basePrice
     */
    async getRoomRate(roomId: string): Promise<number> {
        try {
            console.log('[StayExtension] Getting room rate for roomId:', roomId)

            // First try to get from rooms table
            const room = await db.rooms.get(roomId)
            console.log('[StayExtension] Room data:', room)

            // Priority 1: look up roomType by roomTypeId and use basePrice (Source of Truth)
            if (room?.roomTypeId) {
                const roomType = await db.roomTypes.get(room.roomTypeId)
                console.log('[StayExtension] RoomType data:', roomType)
                if (roomType?.basePrice && roomType.basePrice > 0) {
                    console.log('[StayExtension] Using roomType.basePrice:', roomType.basePrice)
                    return roomType.basePrice
                }
            }

            // Priority 2: If room has a direct price override and it's > 0, use it
            if (room?.price && room.price > 0) {
                console.log('[StayExtension] Using room.price:', room.price)
                return room.price
            }

            // Alternative: try to find in properties table (some setups use this)
            try {
                const properties = await db.properties.list({ limit: 100 })
                const property = properties.find((p: any) =>
                    p.id === roomId ||
                    p.roomNumber === room?.roomNumber
                )
                if (property?.displayPrice && property.displayPrice > 0) {
                    console.log('[StayExtension] Using property.displayPrice:', property.displayPrice)
                    return property.displayPrice
                }
                if (property?.pricePerNight && property.pricePerNight > 0) {
                    console.log('[StayExtension] Using property.pricePerNight:', property.pricePerNight)
                    return property.pricePerNight
                }
            } catch (propError) {
                console.log('[StayExtension] Properties lookup failed:', propError)
            }

            console.warn('[StayExtension] Could not find valid price, returning 0')
            return 0
        } catch (error) {
            console.error('[StayExtension] Error getting room rate:', error)
            return 0
        }
    }

    /**
     * Execute the stay extension
     */
    async extendStay(
        bookingId: string,
        newCheckoutDate: string,
        newRoomId?: string,
        userId?: string,
        discountAmount?: number,
        discountReason?: string,
        paymentSplits?: Array<{ method: string; amount: number }>
    ): Promise<ExtensionResult> {
        try {
            console.log('[StayExtension] Extending stay:', { bookingId, newCheckoutDate, newRoomId })

            // Get current booking
            const booking = await db.bookings.get(bookingId)
            if (!booking) {
                return { success: false, error: 'Booking not found' }
            }

            if (booking.status !== 'checked-in') {
                return { success: false, error: 'Can only extend checked-in bookings' }
            }

            const currentCheckout = new Date(booking.checkOut)
            const newCheckout = new Date(newCheckoutDate)

            if (newCheckout <= currentCheckout) {
                return { success: false, error: 'New checkout must be after current checkout' }
            }

            // Calculate additional nights
            const additionalNights = Math.ceil(
                (newCheckout.getTime() - currentCheckout.getTime()) / (1000 * 60 * 60 * 24)
            )

            // Determine which room to use (current or new)
            const targetRoomId = newRoomId || booking.roomId

            // Check availability for the target room
            const availability = await this.checkRoomAvailability(
                targetRoomId,
                currentCheckout.toISOString(),
                newCheckoutDate,
                bookingId
            )

            if (!availability.available) {
                return {
                    success: false,
                    error: 'Room is not available for the extension period'
                }
            }

            // Calculate extension cost using target room's rate
            const extensionCost = await this.calculateExtensionCost(targetRoomId, additionalNights)

            // Update booking with new checkout date (and room if changed)
            const updateData: any = { checkOut: newCheckoutDate }
            if (newRoomId && newRoomId !== booking.roomId) {
                updateData.roomId = newRoomId
            }

            await db.bookings.update(bookingId, updateData)

            // Add extension charge
            const charge = await bookingChargesService.addCharge({
                bookingId,
                description: `Stay Extension (${additionalNights} night${additionalNights > 1 ? 's' : ''})`,
                category: 'other',
                quantity: additionalNights,
                unitPrice: extensionCost / additionalNights,
                notes: `Extended from ${currentCheckout.toLocaleDateString()} to ${newCheckout.toLocaleDateString()}`,
                createdBy: userId
            })

            // Add extension discount charge if applicable
            let finalCost = extensionCost;
            if (discountAmount && discountAmount > 0) {
                await bookingChargesService.addCharge({
                    bookingId,
                    description: `Stay Extension Discount${discountReason ? ` - ${discountReason}` : ''}`,
                    category: 'other',
                    quantity: 1,
                    unitPrice: -Math.abs(discountAmount),
                    notes: `Discount applied during extension. Reason: ${discountReason || 'None'}`,
                    createdBy: userId
                })
                finalCost = Math.max(0, extensionCost - discountAmount)
            }

            // Process split payments for extension if any
            if (paymentSplits && paymentSplits.length > 0) {
                for (const split of paymentSplits) {
                    if (split.amount > 0) {
                        try {
                            await bookingChargesService.addCharge({
                                bookingId,
                                description: `Payment - Stay Extension`,
                                category: 'other',
                                quantity: 1,
                                unitPrice: -split.amount,
                                notes: `Payment for extension via ${split.method}`,
                                paymentMethod: split.method,
                                createdBy: userId
                            })
                            console.log(`[StayExtension] Recorded payment of ${split.amount} via ${split.method}`)
                        } catch (payErr) {
                            console.error(`[StayExtension] Failed to record payment of ${split.amount} via ${split.method}`, payErr)
                        }
                    }
                }
            }

            // Log the activity
            activityLogService.log({
                action: 'stay_extended',
                entityType: 'booking',
                entityId: bookingId,
                details: {
                    newCheckoutDate,
                    additionalNights,
                    extensionCost,
                    roomChanged: !!newRoomId && newRoomId !== booking.roomId,
                    newRoomId: newRoomId || booking.roomId,
                    bookingId
                },
                userId: userId || 'system'
            }).catch(err => console.error('[StayExtension] Failed to log activity:', err))

            console.log('[StayExtension] Extension completed:', {
                newCheckout: newCheckoutDate,
                additionalNights,
                extensionCost,
                chargeId: charge?.id,
                paymentsProcessed: paymentSplits?.length || 0
            })

            return {
                success: true,
                newCheckout: newCheckoutDate,
                extensionCost: finalCost,
                chargeId: charge?.id,
                roomChanged: !!newRoomId && newRoomId !== booking.roomId,
                newRoomId: newRoomId && newRoomId !== booking.roomId ? newRoomId : undefined
            }

        } catch (error: any) {
            console.error('[StayExtension] Extension failed:', error)
            return { success: false, error: error.message || 'Extension failed' }
        }
    }
}

export const stayExtensionService = new StayExtensionService()
