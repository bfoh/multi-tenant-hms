import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { activityLogService } from '@/services/activity-log-service'
import { Booking, Room, Guest, PaymentSplit } from '@/types'

// Define a standardized CheckInOptions interface
export interface CheckInOptions {
    booking: Booking | any // Support both strict Booking and loose objects from Calendar
    room: Room | any
    guest: Guest | any
    paymentMethod: string
    paymentSplits?: PaymentSplit[] // Multiple payment methods when guest splits payment
    discountAmount?: number      // Discount applied at check-in
    discountReason?: string      // Reason for discount
    user?: any // Current user for logging
}

export function useCheckIn() {
    const [isProcessing, setIsProcessing] = useState(false)

    const checkIn = async ({ booking, room, guest, paymentMethod, paymentSplits, discountAmount, discountReason, user }: CheckInOptions) => {
        setIsProcessing(true)

        try {
            // 1. Validation
            if (room && room.status !== 'available' && booking.status !== 'checked-in') {
                if (room.status === 'occupied') throw new Error(`Cannot check in: Room ${room.roomNumber} is currently occupied.`)
                if (room.status === 'cleaning') throw new Error(`Cannot check in: Room ${room.roomNumber} is currently being cleaned.`)
                if (room.status === 'maintenance') throw new Error(`Cannot check in: Room ${room.roomNumber} is under maintenance.`)
            }

            const bookingId = booking.id || booking.remoteId || booking._id
            const roomId = room?.id

            console.log('[useCheckIn] Starting check-in:', { bookingId, roomId })

            // 2. Fetch actual booking from DB
            const { data: actualBooking } = await supabase
                .from('bookings')
                .select('*')
                .eq('id', bookingId)
                .single()

            if (!actualBooking) throw new Error(`Booking not found: ${bookingId}`)

            // 3. Calculate final amount
            const totalPrice = Number(actualBooking.total_price) || booking.totalPrice || booking.amount || 0
            const finalAmount = discountAmount && discountAmount > 0 ? Math.max(0, totalPrice - discountAmount) : totalPrice

            // 4. Build update payload (all snake_case for Supabase)
            const updateData: any = {
                status: 'checked-in',
                actual_check_in: new Date().toISOString(),
                payment_method: paymentMethod,
                updated_at: new Date().toISOString()
            }

            if (paymentSplits && paymentSplits.length > 1) {
                const existingReq = actualBooking.special_requests || ''
                const cleanedReq = existingReq.replace(/\s*<!-- PAYMENT_SPLITS:.*? -->/g, '')
                updateData.special_requests = cleanedReq + `\n\n<!-- PAYMENT_SPLITS:${JSON.stringify(paymentSplits)} -->`
            }

            if (discountAmount && discountAmount > 0) {
                updateData.discount_amount = discountAmount
                updateData.final_amount = finalAmount
            }

            const { error: bookingUpdateError } = await supabase
                .from('bookings')
                .update(updateData)
                .eq('id', bookingId)

            if (bookingUpdateError) {
                console.error('[useCheckIn] Booking update failed:', bookingUpdateError)
                throw new Error(bookingUpdateError.message)
            }
            console.log('[useCheckIn] Booking updated successfully')

            // 5. Update room status
            if (roomId) {
                const { error: roomError } = await supabase
                    .from('rooms')
                    .update({ status: 'occupied', updated_at: new Date().toISOString() })
                    .eq('id', roomId)

                if (roomError) {
                    console.warn('[useCheckIn] Room update failed (continuing anyway):', roomError)
                } else {
                    console.log('[useCheckIn] Room updated to occupied')
                    await activityLogService.log({
                        action: 'updated',
                        entityType: 'room',
                        entityId: roomId,
                        details: {
                            roomNumber: room.roomNumber,
                            previousStatus: 'available',
                            newStatus: 'occupied',
                            reason: 'guest_check_in',
                            guestName: guest.name || 'Unknown Guest',
                            bookingId
                        },
                        userId: user?.id || 'system'
                    }).catch(logError => console.error('[useCheckIn] Failed to log room status change:', logError))
                }
            }

            // 5. Send Notifications
            try {
                const { sendCheckInNotification, sendManagerCheckInNotification } = await import('@/services/notifications')

                const bookingForNotification = {
                    id: bookingId,
                    checkIn: booking.checkIn || booking.dates?.checkIn,
                    checkOut: booking.checkOut || booking.dates?.checkOut,
                    actualCheckIn: new Date().toISOString(),
                    totalPrice: booking.totalPrice || booking.amount,
                    discountAmount: discountAmount || 0,
                    finalAmount: finalAmount
                }

                // Send notification to guest - use final amount (after discount)
                // Extract prior payment info from booking
                const priorAmountPaid = booking.amountPaid || 0
                const priorPaymentStatus = booking.paymentStatus || 'pending'
                const priorPayment = priorAmountPaid > 0 ? {
                    amountPaid: priorAmountPaid,
                    paymentStatus: priorPaymentStatus as 'full' | 'part' | 'pending'
                } : undefined

                await sendCheckInNotification(guest, room, bookingForNotification, {
                    method: paymentMethod,
                    amount: finalAmount
                }, priorPayment)
                console.log('✅ [useCheckIn] Guest notification sent')

                // Send notification to manager - include discount info in method field if applicable
                const paymentInfo = discountAmount && discountAmount > 0
                    ? `${paymentMethod} (Discount: ${discountAmount})`
                    : paymentMethod

                sendManagerCheckInNotification(
                    guest,
                    room,
                    bookingForNotification,
                    user?.email || user?.name || 'Staff',
                    {
                        method: paymentInfo,
                        amount: finalAmount
                    }
                ).catch(err => console.error('❌ [useCheckIn] Manager notification failed:', err))
                console.log('✅ [useCheckIn] Manager notification triggered')
            } catch (notificationError) {
                console.error('❌ [useCheckIn] Notification failed:', notificationError)
            }

            // 6. Log Activity
            try {
                await activityLogService.log({
                    action: 'checked_in',
                    entityType: 'booking',
                    entityId: bookingId,
                    details: {
                        guestName: guest.name || 'Unknown Guest',
                        roomNumber: room?.roomNumber || 'Unknown Room',
                        checkInDate: booking.checkIn || booking.dates?.checkIn,
                        actualCheckIn: new Date().toISOString(),
                        bookingId: bookingId,
                        paymentMethod,
                        paymentSplits: paymentSplits || null,
                        originalAmount: totalPrice,
                        discountAmount: discountAmount || 0,
                        discountReason: discountReason || null,
                        finalAmount: finalAmount
                    },
                    userId: user?.id || 'system'
                })
            } catch (logError) {
                console.error('[useCheckIn] Activity log failed:', logError)
            }

            toast.success(`Guest ${guest.name || 'Guest'} checked in successfully!`)
            return true

        } catch (error: any) {
            console.error('[useCheckIn] Failed:', error)
            toast.error(error.message || 'Failed to check in guest')
            return false
        } finally {
            setIsProcessing(false)
        }
    }

    return { checkIn, isProcessing }
}
