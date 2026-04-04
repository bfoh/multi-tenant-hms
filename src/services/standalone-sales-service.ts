/**
 * Standalone Sales Service
 * Tracks walk-in / non-booking sales (bar, restaurant, etc.)
 * Table: standalone_sales
 */

import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StandaloneSale {
  id: string
  description: string
  category: 'food_beverage' | 'room_service' | 'minibar' | 'other'
  quantity: number
  unitPrice: number
  amount: number
  notes: string
  staffId: string
  staffName: string
  saleDate: string          // YYYY-MM-DD — used for week-range filter
  paymentMethod: 'cash' | 'mobile_money' | 'card'
  createdAt: string
}

export const SALE_CATEGORIES: Record<StandaloneSale['category'], string> = {
  food_beverage: 'Food & Beverage',
  room_service:  'Room Service',
  minibar:       'Minibar',
  other:         'Other',
}

function _toCC(r: any): StandaloneSale {
  return {
    id: r.id,
    description: r.description,
    category: r.category,
    quantity: r.quantity,
    unitPrice: r.unit_price ?? r.unitPrice ?? 0,
    amount: r.amount,
    notes: r.notes || '',
    staffId: r.staff_id ?? r.staffId ?? '',
    staffName: r.staff_name ?? r.staffName ?? '',
    saleDate: r.sale_date ?? r.saleDate ?? '',
    paymentMethod: r.payment_method ?? r.paymentMethod ?? 'cash',
    createdAt: r.created_at ?? r.createdAt ?? '',
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const standaloneSalesService = {
  async addSale(
    data: Omit<StandaloneSale, 'id' | 'createdAt'>
  ): Promise<StandaloneSale> {
    const record = {
      id: `sale_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      description: data.description,
      category: data.category,
      quantity: data.quantity,
      unit_price: data.unitPrice,
      amount: data.amount,
      notes: data.notes,
      staff_id: data.staffId,
      staff_name: data.staffName,
      sale_date: data.saleDate,
      payment_method: data.paymentMethod,
      created_at: new Date().toISOString(),
    }
    const { data: inserted, error } = await supabase.from('standalone_sales').insert(record).select().single()
    if (error) throw error
    return _toCC(inserted)
  },

  /** Fetch sales for a specific staff member within a date range (inclusive). */
  async getSalesForStaff(
    staffId: string,
    weekStart: string,
    weekEnd: string
  ): Promise<StandaloneSale[]> {
    try {
      const { data } = await supabase
        .from('standalone_sales')
        .select('*')
        .eq('staff_id', staffId)
        .gte('sale_date', weekStart)
        .lte('sale_date', weekEnd)
        .limit(2000)
      return (data || []).map(_toCC)
    } catch (e) {
      console.warn('[standaloneSalesService] getSalesForStaff failed:', e)
      return []
    }
  },

  /** Fetch ALL sales for a week (admin view). */
  async getAllSalesForWeek(
    weekStart: string,
    weekEnd: string
  ): Promise<StandaloneSale[]> {
    try {
      const { data } = await supabase
        .from('standalone_sales')
        .select('*')
        .gte('sale_date', weekStart)
        .lte('sale_date', weekEnd)
        .limit(2000)
      return (data || []).map(_toCC)
    } catch (e) {
      console.warn('[standaloneSalesService] getAllSalesForWeek failed:', e)
      return []
    }
  },

  /** Fetch ALL sales ever (for analytics). */
  async getAllSales(): Promise<StandaloneSale[]> {
    try {
      const { data } = await supabase
        .from('standalone_sales')
        .select('*')
        .limit(5000)
      return (data || []).map(_toCC)
    } catch (e) {
      console.warn('[standaloneSalesService] getAllSales failed:', e)
      return []
    }
  },

  async deleteSale(id: string): Promise<void> {
    await supabase.from('standalone_sales').delete().eq('id', id)
  },
}
