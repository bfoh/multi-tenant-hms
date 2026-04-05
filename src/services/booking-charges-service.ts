import { supabase } from '@/lib/supabase'
import { BookingCharge, ChargeCategory } from '@/types'
import { activityLogService } from './activity-log-service'

// Category display names for UI
export const CHARGE_CATEGORIES: Record<ChargeCategory, string> = {
    food_beverage: 'Food & Beverage',
    room_service: 'Room Service',
    minibar: 'Minibar',
    laundry: 'Laundry',
    phone_internet: 'Phone/Internet',
    parking: 'Parking',
    room_extension: 'Room Extension',
    other: 'Other'
}

export interface CreateChargeData {
    bookingId: string
    description: string
    category: ChargeCategory
    quantity: number
    unitPrice: number
    notes?: string
    paymentMethod?: string  // 'cash' | 'mobile_money' | 'card'
    createdBy?: string
}

export interface UpdateChargeData {
    description?: string
    category?: ChargeCategory
    quantity?: number
    unitPrice?: number
    notes?: string
    paymentMethod?: string
}

// ─── Payment method helpers ────────────────────────────────────────────────────
// payment_method is stored as a dedicated column in the DB.
// Legacy: some old charges may have <!-- CHARGE_PAY:xxx --> encoded in notes.

function decodePaymentMethodFromNotes(rawNotes: string | undefined | null): { notes: string; paymentMethod: string } {
    if (!rawNotes) return { notes: '', paymentMethod: '' }
    const match = rawNotes.match(/<!-- CHARGE_PAY:(.*?) -->/)
    const paymentMethod = match?.[1] || ''
    const notes = rawNotes.replace(/\s*<!-- CHARGE_PAY:.*? -->\s*/, '').trim()
    return { notes, paymentMethod }
}

/** Enrich a raw DB charge row — reads paymentMethod from dedicated column, falls back to legacy notes encoding */
function enrichCharge(raw: any): BookingCharge {
    // Direct column takes priority (new charges)
    if (raw.paymentMethod) {
        const cleanNotes = raw.notes ? raw.notes.replace(/\s*<!-- CHARGE_PAY:.*? -->\s*/, '').trim() : undefined
        return { ...raw, notes: cleanNotes || undefined }
    }
    // Legacy fallback: decode from notes field
    const { notes, paymentMethod } = decodePaymentMethodFromNotes(raw.notes)
    return { ...raw, notes: notes || undefined, paymentMethod: paymentMethod || undefined }
}

class BookingChargesService {

    /**
     * Get all charges for a booking
     */
    async getChargesForBooking(bookingId: string): Promise<BookingCharge[]> {
        try {
            const { data, error } = await supabase
                .from('booking_charges')
                .select('*')
                .eq('booking_id', bookingId)
                .order('created_at', { ascending: false })
                .limit(100)
            if (error) throw error
            return (data || []).map((r: any) => enrichCharge({
                id: r.id, bookingId: r.booking_id, description: r.description,
                category: r.category, quantity: r.quantity, unitPrice: r.unit_price,
                amount: r.amount, notes: r.notes, paymentMethod: r.payment_method,
                createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
            }))
        } catch (error) {
            console.error('[BookingChargesService] Error fetching charges:', error)
            return []
        }
    }

    /**
     * Get total amount of all charges for a booking
     */
    async getChargesTotal(bookingId: string): Promise<number> {
        const charges = await this.getChargesForBooking(bookingId)
        return charges.reduce((sum, charge) => sum + (charge.amount || 0), 0)
    }

    /**
     * Add a new charge to a booking
     */
    async addCharge(data: CreateChargeData): Promise<BookingCharge | null> {
        try {
            const amount = data.quantity * data.unitPrice

            const { data: inserted, error } = await supabase
                .from('booking_charges')
                .insert({
                    booking_id: data.bookingId,
                    description: data.description,
                    category: data.category,
                    quantity: data.quantity,
                    unit_price: data.unitPrice,
                    amount,
                    notes: data.notes || null,
                    payment_method: data.paymentMethod || 'cash',
                    created_by: data.createdBy || null,
                    created_at: new Date().toISOString()
                })
                .select()
                .single()

            if (error) throw error
            
            // Log the activity
            activityLogService.log({
                action: 'added_charge',
                entityType: 'booking',
                entityId: data.bookingId,
                details: {
                    chargeId: inserted.id,
                    description: data.description,
                    category: data.category,
                    amount,
                    quantity: data.quantity,
                    unitPrice: data.unitPrice,
                    bookingId: data.bookingId
                },
                userId: data.createdBy || 'system'
            }).catch(err => console.error('[BookingChargesService] Failed to log activity:', err))

            console.log('[BookingChargesService] Charge added:', inserted.id)
            return enrichCharge({
                id: inserted.id, bookingId: inserted.booking_id, description: inserted.description,
                category: inserted.category, quantity: inserted.quantity, unitPrice: inserted.unit_price,
                amount: inserted.amount, notes: inserted.notes, paymentMethod: inserted.payment_method,
                createdBy: inserted.created_by, createdAt: inserted.created_at, updatedAt: inserted.updated_at,
            })
        } catch (error) {
            console.error('[BookingChargesService] Error adding charge:', error)
            throw error
        }
    }

    /**
     * Update an existing charge (only if booking is not checked-out)
     */
    async updateCharge(chargeId: string, data: UpdateChargeData): Promise<BookingCharge | null> {
        try {
            const { data: existing, error: fetchError } = await supabase
                .from('booking_charges')
                .select('*')
                .eq('id', chargeId)
                .single()
            if (fetchError || !existing) throw new Error('Charge not found')

            const { data: booking } = await supabase
                .from('bookings')
                .select('status')
                .eq('id', existing.booking_id)
                .single()
            if (booking?.status === 'checked-out') {
                throw new Error('Cannot edit charges for a checked-out booking')
            }

            const quantity = data.quantity ?? existing.quantity
            const unitPrice = data.unitPrice ?? existing.unit_price
            const amount = quantity * unitPrice

            const { data: updated, error: updateError } = await supabase
                .from('booking_charges')
                .update({
                    description: data.description !== undefined ? data.description : existing.description,
                    category: data.category !== undefined ? data.category : existing.category,
                    quantity,
                    unit_price: unitPrice,
                    amount,
                    notes: data.notes !== undefined ? (data.notes || null) : existing.notes,
                    payment_method: data.paymentMethod || existing.payment_method || 'cash',
                    updated_at: new Date().toISOString()
                })
                .eq('id', chargeId)
                .select()
                .single()

            if (updateError) throw updateError

            // Log the activity
            activityLogService.log({
                action: 'updated_charge',
                entityType: 'booking',
                entityId: updated.booking_id,
                details: {
                    chargeId,
                    description: updated.description,
                    category: updated.category,
                    amount,
                    previousAmount: existing.amount,
                    bookingId: updated.booking_id
                },
                userId: 'system' // Could be improved if we pass userId to updateCharge
            }).catch(err => console.error('[BookingChargesService] Failed to log activity:', err))

            console.log('[BookingChargesService] Charge updated:', chargeId)
            return enrichCharge({
                id: updated.id, bookingId: updated.booking_id, description: updated.description,
                category: updated.category, quantity: updated.quantity, unitPrice: updated.unit_price,
                amount: updated.amount, notes: updated.notes, paymentMethod: updated.payment_method,
                createdBy: updated.created_by, createdAt: updated.created_at, updatedAt: updated.updated_at,
            })
        } catch (error) {
            console.error('[BookingChargesService] Error updating charge:', error)
            throw error
        }
    }

    /**
     * Delete a charge (only if booking is not checked-out)
     */
    async deleteCharge(chargeId: string): Promise<boolean> {
        try {
            const { data: existing, error: fetchError } = await supabase
                .from('booking_charges')
                .select('booking_id')
                .eq('id', chargeId)
                .single()
            if (fetchError || !existing) throw new Error('Charge not found')

            const { data: booking } = await supabase
                .from('bookings')
                .select('status')
                .eq('id', existing.booking_id)
                .single()
            if (booking?.status === 'checked-out') {
                throw new Error('Cannot delete charges for a checked-out booking')
            }

            const { error: deleteError } = await supabase
                .from('booking_charges')
                .delete()
                .eq('id', chargeId)
            if (deleteError) throw deleteError

            // Log the activity
            activityLogService.log({
                action: 'deleted_charge',
                entityType: 'booking',
                entityId: existing.booking_id,
                details: {
                    chargeId,
                    bookingId: existing.booking_id
                },
                userId: 'system'
            }).catch(err => console.error('[BookingChargesService] Failed to log activity:', err))

            console.log('[BookingChargesService] Charge deleted:', chargeId)
            return true
        } catch (error) {
            console.error('[BookingChargesService] Error deleting charge:', error)
            throw error
        }
    }

    /**
     * Get a summary of charges for checkout
     */
    async getCheckoutSummary(bookingId: string): Promise<{
        charges: BookingCharge[]
        totalCharges: number
        roomCost: number
        grandTotal: number
    }> {
        const charges = await this.getChargesForBooking(bookingId)
        const totalCharges = charges.reduce((sum, c) => sum + (c.amount || 0), 0)

        const { data: booking } = await supabase
            .from('bookings')
            .select('total_price, final_amount')
            .eq('id', bookingId)
            .single()
        const roomCost = Number(booking?.final_amount) || Number(booking?.total_price) || 0

        return {
            charges,
            totalCharges,
            roomCost,
            grandTotal: roomCost + totalCharges
        }
    }
}

export const bookingChargesService = new BookingChargesService()
