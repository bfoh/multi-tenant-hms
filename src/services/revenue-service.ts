/**
 * Weekly Revenue Service
 * Handles per-staff weekly revenue tracking based on bookings they created.
 * Week boundaries: Monday 00:00 → Sunday 23:59 (ISO week, weekStartsOn: 1)
 *
 * Grand revenue = room prices + booking charges + standalone sales.
 */

import { supabase } from '@/lib/supabase'
import { startOfWeek, endOfWeek, format, subWeeks } from 'date-fns'

function _ccRevenue(r: any): WeeklyRevenueReport {
  return {
    id: r.id,
    staffId: r.staff_id ?? r.staffId ?? '',
    staffName: r.staff_name ?? r.staffName ?? '',
    weekStart: r.week_start ?? r.weekStart ?? '',
    weekEnd: r.week_end ?? r.weekEnd ?? '',
    totalRevenue: r.total_revenue ?? r.totalRevenue ?? 0,
    bookingCount: r.booking_count ?? r.bookingCount ?? 0,
    bookingIds: r.booking_ids ?? r.bookingIds ?? '[]',
    status: r.status ?? 'draft',
    notes: r.notes ?? '',
    adminNotes: r.admin_notes ?? r.adminNotes ?? '',
    reviewedBy: r.reviewed_by ?? r.reviewedBy ?? '',
    reviewedAt: r.reviewed_at ?? r.reviewedAt ?? '',
    submittedAt: r.submitted_at ?? r.submittedAt ?? '',
    createdAt: r.created_at ?? r.createdAt ?? '',
    updatedAt: r.updated_at ?? r.updatedAt ?? '',
  }
}

const _revenueDb = {
  bookings: {
    list: async (opts?: { limit?: number }) => {
      const { data } = await supabase.from('bookings').select('*').limit(opts?.limit || 2000)
      return (data || []).map((b: any) => ({
        ...b,
        // camelCase aliases so callers don't need to handle both forms
        checkIn: b.check_in,
        checkOut: b.check_out,
        roomId: b.room_id,
        guestId: b.guest_id,
        // total_price is the canonical column; fall back to amount (legacy col name)
        totalPrice: b.total_price || b.amount || 0,
        finalAmount: b.final_amount,
        discountAmount: b.discount_amount,
        paymentMethod: b.payment_method,
        specialRequests: b.special_requests,
        createdBy: b.created_by,
        createdAt: b.created_at,
        userId: b.user_id,
        roomTypeId: b.room_type_id,
      }))
    },
  },
  rooms: {
    list: async (opts?: { limit?: number }) => {
      // Join room_types so we always have base_price available alongside rooms.price
      const { data } = await supabase
        .from('rooms')
        .select('*, room_types(id, name, base_price)')
        .limit(opts?.limit || 500)
      return (data || []).map((r: any) => {
        const rt = Array.isArray(r.room_types) ? r.room_types[0] : (r.room_types || {})
        const resolvedPrice = Number(rt?.base_price || 0) || Number(r.price || 0)
        return {
          ...r,
          roomNumber: r.room_number,
          roomTypeId: r.room_type_id,
          price: resolvedPrice,          // best available price per night
          roomTypeName: rt?.name || '',
        }
      })
    },
  },
  guests: {
    list: async (opts?: { limit?: number }) => {
      const { data } = await supabase.from('guests').select('*').limit(opts?.limit || 1000)
      return data || []
    },
  },
  bookingCharges: {
    list: async (opts?: { limit?: number }) => {
      const { data } = await supabase.from('booking_charges').select('*').limit(opts?.limit || 5000)
      return (data || []).map((c: any) => ({
        ...c,
        bookingId: c.booking_id,
        unitPrice: c.unit_price,
        paymentMethod: c.payment_method,
        createdAt: c.created_at,
      }))
    },
  },
  hr_weekly_revenue: {
    list: async (opts?: { limit?: number }) => {
      const { data } = await supabase.from('hr_weekly_revenue').select('*').limit(opts?.limit || 500)
      return (data || []).map(_ccRevenue)
    },
    create: async (record: WeeklyRevenueReport) => {
      const { error } = await supabase.from('hr_weekly_revenue').insert({
        id: record.id,
        staff_id: record.staffId,
        staff_name: record.staffName,
        week_start: record.weekStart,
        week_end: record.weekEnd,
        total_revenue: record.totalRevenue,
        booking_count: record.bookingCount,
        booking_ids: record.bookingIds,
        status: record.status,
        notes: record.notes,
        admin_notes: record.adminNotes,
        reviewed_by: record.reviewedBy,
        reviewed_at: record.reviewedAt || null,
        submitted_at: record.submittedAt || null,
        created_at: record.createdAt || null,
        updated_at: record.updatedAt || null,
      })
      if (error) console.warn('[hr_weekly_revenue] create failed:', error)
    },
    update: async (id: string, payload: Record<string, any>) => {
      const snake: Record<string, any> = {}
      if (payload.staffName !== undefined) snake.staff_name = payload.staffName
      if (payload.totalRevenue !== undefined) snake.total_revenue = payload.totalRevenue
      if (payload.bookingCount !== undefined) snake.booking_count = payload.bookingCount
      if (payload.bookingIds !== undefined) snake.booking_ids = payload.bookingIds
      if (payload.status !== undefined) snake.status = payload.status
      if (payload.notes !== undefined) snake.notes = payload.notes
      if (payload.adminNotes !== undefined) snake.admin_notes = payload.adminNotes
      if (payload.reviewedBy !== undefined) snake.reviewed_by = payload.reviewedBy
      if (payload.reviewedAt !== undefined) snake.reviewed_at = payload.reviewedAt || null
      if (payload.submittedAt !== undefined) snake.submitted_at = payload.submittedAt || null
      if (payload.updatedAt !== undefined) snake.updated_at = payload.updatedAt || null
      const { error } = await supabase.from('hr_weekly_revenue').update(snake).eq('id', id)
      if (error) console.warn('[hr_weekly_revenue] update failed:', error)
    },
  },
}
import { standaloneSalesService, type StandaloneSale } from './standalone-sales-service'
import { CHARGE_CATEGORIES } from './booking-charges-service'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyRevenueReport {
  id: string
  staffId: string       // Supabase auth user ID (matches booking.createdBy)
  staffName: string
  weekStart: string     // YYYY-MM-DD  (always a Monday)
  weekEnd: string       // YYYY-MM-DD  (always a Sunday)
  totalRevenue: number
  bookingCount: number
  bookingIds: string    // JSON-encoded string array of booking IDs
  status: 'draft' | 'submitted' | 'reviewed' | 'init'

  notes: string         // Staff's own notes on the week
  adminNotes: string    // Admin feedback
  reviewedBy: string    // Admin user ID
  reviewedAt: string
  submittedAt: string
  createdAt: string
  updatedAt: string
}

export interface WeekBounds {
  weekStart: string   // YYYY-MM-DD
  weekEnd: string     // YYYY-MM-DD
  label: string       // e.g. "Mar 17 – Mar 23, 2026"
}

export interface ChargeLineSummary {
  id: string
  description: string
  category: string
  quantity: number
  unitPrice: number
  amount: number
  paymentMethod: string   // 'cash' | 'mobile_money' | 'card' | ''
  createdAt: string
}

export interface BookingSummary {
  id: string
  guestName: string
  roomNumber: string
  checkIn: string
  checkOut: string
  totalPrice: number       // Original room price before any discount
  discountAmount: number   // Discount applied at check-in (0 if none)
  effectivePrice: number   // totalPrice - discountAmount (actual room revenue)
  status: string
  createdAt: string
  paymentMethod: string   // 'cash' | 'mobile_money' | 'card' | 'not_paid'
  paymentSplits?: Array<{ method: string; amount: number }>
  additionalChargesTotal: number
  additionalCharges: ChargeLineSummary[]
  grandTotal: number       // effectivePrice + additionalChargesTotal
}

export interface StaffWeekResult {
  bookings: BookingSummary[]
  totalRevenue: number          // room prices only
  additionalRevenue: number     // booking charges total (in-week bookings + orphan charges)
  standaloneSalesRevenue: number
  grandRevenue: number          // all three combined
  bookingCount: number
  standaloneSales: StandaloneSale[]
  chargesByCategory: Record<string, number>  // category key → total amount
  /**
   * Charges created THIS WEEK but attached to bookings whose check-in date
   * falls in a different/earlier week. These are shown separately so they
   * are not double-counted with any booking row, but ARE included in
   * additionalRevenue and grandRevenue totals.
   */
  orphanCharges: ChargeLineSummary[]
  orphanChargesTotal: number
}

// ─── Week Utilities ───────────────────────────────────────────────────────────

export function getWeekBounds(date: Date = new Date()): WeekBounds {
  const start = startOfWeek(date, { weekStartsOn: 1 })
  const end = endOfWeek(date, { weekStartsOn: 1 })
  return {
    weekStart: format(start, 'yyyy-MM-dd'),
    weekEnd: format(end, 'yyyy-MM-dd'),
    label: `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`,
  }
}

/** Returns the last `count` week bounds, newest first (index 0 = current week). */
export function getPastWeeksBounds(count: number): WeekBounds[] {
  return Array.from({ length: count }, (_, i) => getWeekBounds(subWeeks(new Date(), i)))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Decode payment method stored in charge notes as <!-- CHARGE_PAY:method -->.
 * No separate DB column is used (schema-cache-safe pattern).
 */
function decodeChargePaymentMethod(rawNotes: string | undefined | null): string {
  if (!rawNotes) return ''
  const match = rawNotes.match(/<!-- CHARGE_PAY:(.*?) -->/)
  return match?.[1] || ''
}

/**
 * Extract paymentSplits from a raw DB booking's specialRequests field.
 * Splits are stored as <!-- PAYMENT_SPLITS:[...] --> since there is no DB column.
 */
function parsePaymentSplits(rawBooking: any): Array<{ method: string; amount: number }> | undefined {
  const specialReq = rawBooking.special_requests || rawBooking.specialRequests || ''
  if (!specialReq) return undefined
  const match = (specialReq as string).match(/<!-- PAYMENT_SPLITS:(.*?) -->/)
  if (!match?.[1]) return undefined
  try {
    const splits = JSON.parse(match[1])
    return Array.isArray(splits) && splits.length > 1 ? splits : undefined
  } catch {
    return undefined
  }
}

/**
 * Normalise payment method to canonical lowercase/underscore format.
 * Returns '' when no data is stored (so UI can show a dash instead of "Not Paid").
 * Only returns 'not_paid' when explicitly set to that value.
 */
function normalizePaymentMethod(raw: string): string {
  if (!raw || !raw.trim()) return ''           // no data stored → blank
  const s = raw.trim().toLowerCase()
  if (s === 'cash') return 'cash'
  if (s === 'mobile_money' || s === 'mobile money' || s.includes('mobile') || s.includes('momo')) return 'mobile_money'
  if (s === 'card' || s.includes('card') || s.includes('credit') || s.includes('debit')) return 'card'
  if (s === 'not_paid' || s === 'not paid') return 'not_paid'
  return ''                                    // unrecognised format → treat as no data
}

// ─── Booking Data ─────────────────────────────────────────────────────────────

/**
 * Fetch all confirmed/checked-in/checked-out bookings created by a specific staff member
 * within a given week. Also fetches booking charges and standalone sales.
 */
export async function fetchBookingsForStaffWeek(
  staffId: string,
  weekStart: string,
  weekEnd: string
): Promise<StaffWeekResult> {
  const db = _revenueDb

  // Fetch bookings with rooms+room_types embedded in one query (avoids separate roomMap join)
  let rawBookings: any[] = []
  let allGuests: any[] = []
  let allChargesRaw: any[] = []
  try {
    const [bResult, gResult, cResult] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, rooms(id, room_number, price, room_type_id, room_types(id, name, base_price))')
        .limit(2000),
      db.guests.list({ limit: 1000 }),
      db.bookingCharges.list({ limit: 5000 }).catch(() => []),
    ])
    if (bResult.error) console.warn('[fetchBookingsForStaffWeek] bookings query error:', bResult.error)
    rawBookings = bResult.data || []
    allGuests = gResult
    allChargesRaw = cResult
  } catch (e) {
    console.warn('[fetchBookingsForStaffWeek] DB error:', e)
    return {
      bookings: [], totalRevenue: 0, additionalRevenue: 0,
      standaloneSalesRevenue: 0, grandRevenue: 0, bookingCount: 0,
      standaloneSales: [], chargesByCategory: {},
      orphanCharges: [], orphanChargesTotal: 0,
    }
  }

  // Normalise each raw booking — embed the joined room data as camelCase fields
  const allBookings = rawBookings.map((b: any) => {
    const rm = b.rooms || {}
    const rt = Array.isArray(rm.room_types) ? rm.room_types[0] : (rm.room_types || {})
    const resolvedPrice = Number(rt?.base_price || 0) || Number(rm.price || 0)
    return {
      ...b,
      checkIn: b.check_in,
      checkOut: b.check_out,
      roomId: b.room_id,
      guestId: b.guest_id,
      totalPrice: b.total_price || b.amount || 0,
      discountAmount: b.discount || b.discount_amount || 0,
      paymentMethod: b.payment_method,
      specialRequests: b.special_requests,
      createdBy: b.created_by,
      userId: b.user_id,
      createdAt: b.created_at,
      // Staff attribution fields
      checkInBy: b.check_in_by || null,
      checkInByName: b.check_in_by_name || null,
      checkOutBy: b.check_out_by || null,
      checkOutByName: b.check_out_by_name || null,
      checkInAmountPaid: Number(b.check_in_amount_paid || 0),
      checkOutAmountPaid: Number(b.check_out_amount_paid || 0),
      // Embedded room data
      _roomNumber: rm.room_number || null,
      _roomPrice: resolvedPrice,
      _roomTypeName: rt?.name || '',
    }
  })

  const guestMap = new Map(((allGuests || []) as any[]).map((g: any) => [g.id, g]))

  // Group booking charges by booking ID
  const chargesByBookingId = new Map<string, any[]>()
  for (const c of (allChargesRaw || [])) {
    const key = c.bookingId || c.booking_id || ''
    if (!key) continue
    if (!chargesByBookingId.has(key)) chargesByBookingId.set(key, [])
    chargesByBookingId.get(key)!.push(c)
  }

  const from = new Date(weekStart + 'T00:00:00')
  const to = new Date(weekEnd + 'T23:59:59')

  /**
   * Parse the amount that was paid at booking time from the PAYMENT_DATA
   * comment embedded in special_requests.
   *
   * hasPaymentData = true  → explicit tracking exists (full / part / pay-later)
   * hasPaymentData = false → old booking with no payment tracking; fall back to full price
   */
  function _parseBookingPayment(b: any): { amountPaid: number; paymentStatus: string; hasPaymentData: boolean } {
    const sr = b.special_requests || b.specialRequests || ''
    if (sr) {
      const m = (sr as string).match(/<!-- PAYMENT_DATA:(.*?) -->/)
      if (m?.[1]) {
        try {
          const pd = JSON.parse(m[1])
          return { amountPaid: pd.amountPaid || 0, paymentStatus: pd.paymentStatus || 'pending', hasPaymentData: true }
        } catch { /* ignore */ }
      }
    }
    const amountPaid = Number(b.amountPaid || b.amount_paid || 0)
    const paymentStatus = b.paymentStatus || b.payment_status || ''
    // hasPaymentData is true only when a direct column has explicit data
    return { amountPaid, paymentStatus, hasPaymentData: amountPaid > 0 || !!paymentStatus }
  }

  const STATIC_RATES: Record<string, number> = {
    executive: 450, deluxe: 550, standard: 350,
    economy: 200, vip: 500, family: 700, presidential: 1200, double: 350, single: 200,
  }

  /** Resolve full booking room price (before discount). */
  function _resolveRawPrice(b: any): number {
    let rawPrice = Number(b.total_price || 0)
    if (rawPrice === 0) {
      const nights = Math.max(1, Math.round(
        (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
      ))
      let pricePerNight = Number(b._roomPrice || 0)
      if (pricePerNight === 0 && b._roomTypeName) {
        const typeName = (b._roomTypeName as string).toLowerCase()
        for (const [key, rate] of Object.entries(STATIC_RATES)) {
          if (typeName.includes(key)) { pricePerNight = rate; break }
        }
      }
      if (pricePerNight > 0) rawPrice = pricePerNight * nights
    }
    return rawPrice
  }

  const matched: BookingSummary[] = ((allBookings || []) as any[])
    .filter((b: any) => {
      // Only bookings in a revenue-generating status
      if (!['confirmed', 'checked-in', 'checked-out'].includes(b.status)) return false

      const creator  = b.createdBy || b.created_by || b.userId || b.user_id || ''
      const checkInBy  = b.checkInBy  || ''
      const checkOutBy = b.checkOutBy || ''

      // Must involve this staff member in at least one role
      if (creator !== staffId && checkInBy !== staffId && checkOutBy !== staffId) return false

      const { amountPaid: amtAtBooking, paymentStatus, hasPaymentData } = _parseBookingPayment(b)

      // ── Per-stage date anchors ──────────────────────────────────────────
      // Booking-creation stage: anchor to created_at (revenue collected at reservation)
      if (creator === staffId) {
        const createdAt = b.createdAt || b.created_at || ''
        const dCreated = createdAt ? new Date(createdAt) : null

        if (dCreated && dCreated >= from && dCreated <= to) {
          // Old bookings with no payment data: include (full price credited to creator)
          if (!hasPaymentData) return true
          // Full payment collected at booking time
          if (paymentStatus === 'full') return true
          // Partial payment collected at booking time
          if (amtAtBooking > 0) return true
          // Pay-later confirmed booking: no revenue yet at booking stage — do NOT include
          // (it will be picked up for check-in/check-out staff in their respective weeks)
        }
      }

      // Check-in stage: anchor to check-in date
      if (checkInBy === staffId) {
        const checkIn = b.checkIn || b.check_in || ''
        if (checkIn) {
          const d = new Date(checkIn)
          if (d >= from && d <= to) return true
        }
      }

      // Check-out stage: anchor to actual check-out date
      if (checkOutBy === staffId) {
        const actualOut = b.actual_check_out || b.actualCheckOut || b.checkOut || b.check_out || ''
        if (actualOut) {
          const d = new Date(actualOut)
          if (d >= from && d <= to) return true
        }
      }

      // Backward-compat: old bookings (no check_in_by tracking) that are
      // checked-in/checked-out and this staff is the creator — use check-in date
      if (creator === staffId && !checkInBy && !checkOutBy &&
          (b.status === 'checked-in' || b.status === 'checked-out')) {
        const checkIn = b.checkIn || b.check_in || ''
        if (checkIn) {
          const d = new Date(checkIn)
          if (d >= from && d <= to) return true
        }
      }

      return false
    })
    .map((b: any) => {
      const guest = guestMap.get(b.guestId) as any
      const specialReq = b.specialRequests || b.special_requests || ''
      const snapshotMatch = (specialReq as string).match(/<!-- GUEST_SNAPSHOT:(.*?) -->/)
      let guestName = guest?.name || 'Guest'
      if (snapshotMatch?.[1]) {
        try { guestName = JSON.parse(snapshotMatch[1]).name || guestName } catch { /* ignore */ }
      }
      const rawMethod = b.paymentMethod || b.payment_method || b.payment?.method || ''
      const paymentSplits = parsePaymentSplits(b)
      const primaryMethod = paymentSplits
        ? paymentSplits.reduce((a, s) => s.amount > a.amount ? s : a, paymentSplits[0]).method
        : rawMethod

      const rawPrice = _resolveRawPrice(b)
      const discountAmt = Number(b.discountAmount || b.discount || 0)
      const effectivePrice = discountAmt > 0 ? Math.max(0, rawPrice - discountAmt) : rawPrice

      // ── Stage-aware revenue attribution ───────────────────────────────────
      // Each payment stage is anchored to its own date, so each week only
      // counts the revenue that was actually collected IN THAT WEEK.
      //
      // Stage 1 – booking creation: credit to creator, anchored to created_at
      // Stage 2 – check-in:         credit to checkInBy, anchored to check-in date
      // Stage 3 – check-out:        credit to checkOutBy, anchored to actual check-out date
      //
      // Backward-compat: if no PAYMENT_DATA exists (old booking), credit full
      // price to creator using check-in date (legacy behaviour unchanged).
      const creator  = b.createdBy || b.created_by || b.userId || b.user_id || ''
      const checkInBy  = b.checkInBy  || ''
      const checkOutBy = b.checkOutBy || ''

      const { amountPaid: amtAtBooking, paymentStatus, hasPaymentData } = _parseBookingPayment(b)
      const amtAtCheckIn  = Number(b.checkInAmountPaid  || 0)
      const amtAtCheckOut = Number(b.checkOutAmountPaid || 0)

      const createdAtStr  = b.createdAt || b.created_at || ''
      const checkInStr    = b.checkIn   || b.check_in   || ''
      const actualOutStr  = b.actual_check_out || b.actualCheckOut || b.checkOut || b.check_out || ''

      const dCreated  = createdAtStr ? new Date(createdAtStr) : null
      const dCheckIn  = checkInStr   ? new Date(checkInStr)   : null
      const dActualOut = actualOutStr ? new Date(actualOutStr)  : null

      let staffRevenue = 0

      // Stage 1: booking-creation payment (creator, anchored to created_at)
      if (creator === staffId) {
        const inCreationWeek = dCreated && dCreated >= from && dCreated <= to
        const noCheckInTracking = !checkInBy && !checkOutBy
        const isAlreadyActive  = b.status === 'checked-in' || b.status === 'checked-out'

        if (!hasPaymentData) {
          // Old booking — backward-compat: credit full price using check-in date anchor
          if (noCheckInTracking && dCheckIn && dCheckIn >= from && dCheckIn <= to) {
            staffRevenue = effectivePrice
          }
        } else if (paymentStatus === 'full' && inCreationWeek) {
          staffRevenue = effectivePrice
        } else if (amtAtBooking > 0 && inCreationWeek) {
          staffRevenue = Math.min(amtAtBooking, effectivePrice)
        } else if (isAlreadyActive && noCheckInTracking && dCheckIn && dCheckIn >= from && dCheckIn <= to) {
          // Pay-later checked in before tracking existed — credit full to creator via check-in date
          staffRevenue = effectivePrice
        }
      }

      // Stage 2: check-in payment (checkInBy, anchored to check-in date)
      if (checkInBy === staffId && dCheckIn && dCheckIn >= from && dCheckIn <= to) {
        if (amtAtCheckIn > 0) {
          staffRevenue += amtAtCheckIn
        } else {
          // checkInAmountPaid not captured (transition period) — credit the remainder
          const alreadyCredited = paymentStatus === 'full'
            ? effectivePrice
            : Math.min(amtAtBooking, effectivePrice)
          staffRevenue += Math.max(0, effectivePrice - alreadyCredited)
        }
      }

      // Stage 3: check-out payment (checkOutBy, anchored to actual check-out date)
      if (checkOutBy === staffId && dActualOut && dActualOut >= from && dActualOut <= to) {
        staffRevenue += amtAtCheckOut
      }

      // Never exceed the full room price
      staffRevenue = Math.min(staffRevenue, effectivePrice)

      // Additional charges attribution:
      // • Booking creator sees ALL charges on their booking.
      // • Other staff (check-in, check-out) see only charges THEY personally created
      //   (e.g. stay extensions done by a different staff member).
      // Negative charges are payment-offset records (e.g. "Payment - Stay Extension")
      // and must NOT be counted as revenue — only positive amounts are revenue.
      const isCreator = creator === staffId
      const allBookingCharges = chargesByBookingId.get(b.id) || []
      const rawCharges = allBookingCharges.filter((c: any) => {
        if (isCreator) return true
        const chargeCreator = c.createdBy || c.created_by || ''
        return chargeCreator === staffId
      })
      // Only positive charges count as revenue. Negative charges are internal
      // payment-offset records (e.g. "Payment - Stay Extension") and must not
      // appear in any breakdown or total.
      const additionalCharges: ChargeLineSummary[] = rawCharges
        .filter((c: any) => Number(c.amount || 0) > 0)
        .map((c: any) => ({
          id: c.id,
          description: c.description || '',
          category: c.category || 'other',
          quantity: Number(c.quantity || 1),
          unitPrice: Number(c.unitPrice || c.unit_price || 0),
          amount: Number(c.amount || 0),
          paymentMethod: normalizePaymentMethod(c.paymentMethod || c.payment_method || decodeChargePaymentMethod(c.notes)),
          createdAt: c.createdAt || c.created_at || '',
        }))
      const additionalChargesTotal = additionalCharges.reduce((s, c) => s + c.amount, 0)

      return {
        id: b.id,
        guestName,
        roomNumber: b._roomNumber || '—',
        checkIn: b.check_in,
        checkOut: b.check_out,
        totalPrice: rawPrice,
        discountAmount: discountAmt,
        effectivePrice: staffRevenue,   // this staff member's attributed room revenue share
        status: b.status,
        createdAt: b.createdAt || b.created_at || '',
        paymentMethod: normalizePaymentMethod(primaryMethod),
        paymentSplits,
        additionalCharges,
        additionalChargesTotal,
        grandTotal: staffRevenue + additionalChargesTotal,
      }
    })

  // ── Orphan charges ────────────────────────────────────────────────────────
  // Positive charges created THIS WEEK that belong to this staff member but
  // whose booking check-in falls outside this week (not already in `matched`).
  // Attribution: booking creator sees all charges on their bookings; any staff
  // sees charges they personally created (e.g. stay extensions on other bookings).
  // Negative charges (payment records) are excluded from revenue totals.
  const matchedIds = new Set(matched.map((b) => b.id))
  // All booking IDs CREATED by this staff member (any date)
  const allStaffBookingIds = new Set(
    (allBookings as any[])
      .filter((b: any) => (b.created_by || b.user_id || '') === staffId)
      .map((b: any) => b.id)
  )

  const orphanCharges: ChargeLineSummary[] = []
  for (const [bookingId, charges] of chargesByBookingId.entries()) {
    if (matchedIds.has(bookingId)) continue  // already counted in matched
    for (const c of charges) {
      const chargeCreator = c.createdBy || c.created_by || ''
      const isBookingOwner = allStaffBookingIds.has(bookingId)
      const isChargeCreator = chargeCreator === staffId
      // Only include if staff owns the booking or created this specific charge
      if (!isBookingOwner && !isChargeCreator) continue
      // Only positive amounts are revenue (skip payment offset records)
      if (Number(c.amount || 0) <= 0) continue
      const createdAt = c.createdAt || c.created_at || ''
      if (!createdAt) continue
      const d = new Date(createdAt)
      if (d >= from && d <= to) {
        orphanCharges.push({
          id: c.id,
          description: c.description || '',
          category: c.category || 'other',
          quantity: Number(c.quantity || 1),
          unitPrice: Number(c.unitPrice || c.unit_price || 0),
          amount: Number(c.amount || 0),
          paymentMethod: normalizePaymentMethod(
            c.paymentMethod || c.payment_method || decodeChargePaymentMethod(c.notes)
          ),
          createdAt,
        })
      }
    }
  }
  const orphanChargesTotal = orphanCharges.reduce((s, c) => s + c.amount, 0)

  // Standalone sales for this staff member this week
  const standaloneSales = await standaloneSalesService.getSalesForStaff(staffId, weekStart, weekEnd)
  const standaloneSalesRevenue = standaloneSales.reduce((s, sale) => s + sale.amount, 0)

  const totalRevenue = matched.reduce((s, b) => s + b.effectivePrice, 0)  // after-discount room revenue
  const additionalRevenue = matched.reduce((s, b) => s + b.additionalChargesTotal, 0) + orphanChargesTotal
  const grandRevenue = totalRevenue + additionalRevenue + standaloneSalesRevenue

  // Build charges-by-category summary (includes orphan charges)
  const chargesByCategory: Record<string, number> = {}
  for (const b of matched) {
    for (const c of b.additionalCharges) {
      chargesByCategory[c.category] = (chargesByCategory[c.category] || 0) + c.amount
    }
  }
  for (const c of orphanCharges) {
    chargesByCategory[c.category] = (chargesByCategory[c.category] || 0) + c.amount
  }

  return {
    bookings: matched,
    totalRevenue,
    additionalRevenue,
    standaloneSalesRevenue,
    grandRevenue,
    bookingCount: matched.length,
    standaloneSales,
    chargesByCategory,
    orphanCharges,
    orphanChargesTotal,
  }
}

// ─── Report CRUD ──────────────────────────────────────────────────────────────

/**
 * Get or create a weekly revenue report for a staff member.
 * For draft reports (including the current week), always recalculates from
 * live bookings so the numbers stay up-to-date in real time.
 */
export async function getOrCreateWeekReport(
  staffId: string,
  staffName: string,
  week: WeekBounds
): Promise<WeeklyRevenueReport> {
  const db = _revenueDb

  // Fetch all and filter client-side — blink SDK where-filter is unreliable for custom tables
  let allRows: WeeklyRevenueReport[] = []
  try {
    const rows = await db.hr_weekly_revenue.list({ limit: 500 })
    allRows = (rows || []) as WeeklyRevenueReport[]
  } catch (e) {
    console.warn('[getOrCreateWeekReport] list failed (table may not exist yet):', e)
  }
  const existing = allRows.find(
    (r) => {
      const sid = (r as any).staffId || (r as any).staff_id || ''
      const ws  = (r as any).weekStart || (r as any).week_start || ''
      return sid === staffId && ws === week.weekStart && r.status !== 'init'
    }
  )

  // Always recalculate from live bookings so counts/revenue stay accurate
  const weekResult = await fetchBookingsForStaffWeek(
    staffId,
    week.weekStart,
    week.weekEnd
  )
  const { bookings, bookingCount } = weekResult
  // Persist grandRevenue (room + charges + standalone sales) so HR totals are accurate
  const totalRevenue = weekResult.grandRevenue
  const bookingIds = JSON.stringify(bookings.map((b) => b.id))
  const now = new Date().toISOString()

  if (existing) {
    const updated: WeeklyRevenueReport = {
      ...existing,
      staffName, // keep name fresh
      totalRevenue,
      bookingCount,
      bookingIds,
      updatedAt: now,
    }
    try {
      await db.hr_weekly_revenue.update(existing.id, updated)
    } catch (e) {
      console.warn('[getOrCreateWeekReport] update failed:', e)
    }
    return updated
  }

  const record: WeeklyRevenueReport = {
    id: `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    staffId,
    staffName,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    totalRevenue,
    bookingCount,
    bookingIds,
    status: 'draft',
    notes: '',
    adminNotes: '',
    reviewedBy: '',
    reviewedAt: '',
    submittedAt: '',
    createdAt: now,
    updatedAt: now,
  }
  try {
    await db.hr_weekly_revenue.create(record)
  } catch (e) {
    console.warn('[getOrCreateWeekReport] create failed (table may not exist yet):', e)
  }
  return record
}

/**
 * Staff submits their weekly report (locks it from further auto-recalculation).
 */
export async function submitWeekReport(reportId: string, notes: string): Promise<void> {
  const db = _revenueDb
  await db.hr_weekly_revenue.update(reportId, {
    status: 'submitted',
    notes,
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Admin marks a report as reviewed with optional feedback notes.
 */
export async function reviewWeekReport(
  reportId: string,
  adminNotes: string,
  reviewedByName: string
): Promise<void> {
  const db = _revenueDb
  await db.hr_weekly_revenue.update(reportId, {
    status: 'reviewed',
    adminNotes,
    reviewedBy: reviewedByName,
    reviewedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

/** Get all staff reports for a specific week (admin view). */
export async function getAllStaffReportsForWeek(weekStart: string): Promise<WeeklyRevenueReport[]> {
  const db = _revenueDb
  try {
    const rows = await db.hr_weekly_revenue.list({ limit: 500 })
    return ((rows || []) as WeeklyRevenueReport[])
      .filter((r) => {
        const ws = (r as any).weekStart || (r as any).week_start || ''
        return ws === weekStart && r.status !== 'init'
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
  } catch (e) {
    console.warn('[getAllStaffReportsForWeek] failed:', e)
    return []
  }
}

/** Get a staff member's own report history, newest first. */
export async function getStaffAllReports(staffId: string): Promise<WeeklyRevenueReport[]> {
  const db = _revenueDb
  try {
    const rows = await db.hr_weekly_revenue.list({ limit: 500 })
    return ((rows || []) as WeeklyRevenueReport[])
      .filter((r) => {
        const sid = (r as any).staffId || (r as any).staff_id || ''
        return sid === staffId && r.status !== 'init'
      })
      .sort((a, b) => {
        const wsA = (a as any).weekStart || (a as any).week_start || ''
        const wsB = (b as any).weekStart || (b as any).week_start || ''
        return wsB > wsA ? 1 : -1
      })
  } catch (e) {
    console.warn('[getStaffAllReports] failed:', e)
    return []
  }
}

// Re-export CHARGE_CATEGORIES for page-level convenience
export { CHARGE_CATEGORIES }
