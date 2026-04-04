import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { StaffRole } from '@/lib/rbac'

// Cache helper functions
const CACHE_KEY_PREFIX = 'staff_role_cache_'
const CACHE_EXPIRY = 5 * 60 * 1000 // 5 minutes

function saveToCache(userId: string, staffRecord: StaffRecord, role: StaffRole) {
  try {
    const cacheData = {
      staffRecord,
      role,
      timestamp: Date.now()
    }
    localStorage.setItem(`${CACHE_KEY_PREFIX}${userId}`, JSON.stringify(cacheData))
  } catch (error) {
    console.warn('Failed to save staff role to cache:', error)
  }
}

function loadFromCache(userId: string): { staffRecord: StaffRecord; role: StaffRole } | null {
  try {
    const cached = localStorage.getItem(`${CACHE_KEY_PREFIX}${userId}`)
    if (!cached) return null

    const cacheData = JSON.parse(cached)
    const isExpired = Date.now() - cacheData.timestamp > CACHE_EXPIRY

    if (isExpired) {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`)
      return null
    }

    return {
      staffRecord: cacheData.staffRecord,
      role: cacheData.role
    }
  } catch (error) {
    console.warn('Failed to load staff role from cache:', error)
    return null
  }
}

function clearCache(userId: string) {
  try {
    localStorage.removeItem(`${CACHE_KEY_PREFIX}${userId}`)
  } catch (error) {
    console.warn('Failed to clear staff role cache:', error)
  }
}

interface StaffRecord {
  id: string
  userId: string  // SDK converts to/from user_id automatically
  name: string
  email: string
  role: string
  createdAt: string
}

export function useStaffRole() {
  const [role, setRole] = useState<StaffRole | null>(null)
  const [staffRecord, setStaffRecord] = useState<StaffRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const isLoadingRef = useRef(false)
  const loadedUserIdRef = useRef<string | null>(null)

  // Computed properties for backward compatibility
  const isOwner = role === 'owner'
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isStaff = role === 'staff'
  const canManageEmployees = role === 'owner' || role === 'admin'

  const loadStaffRole = useCallback(async (uid: string) => {
    // Prevent duplicate loads for the same user
    if (isLoadingRef.current || loadedUserIdRef.current === uid) {
      console.log('⏭️ [useStaffRole] Skipping duplicate load for userId:', uid)
      return
    }

    try {
      isLoadingRef.current = true
      setLoading(true)
      console.log('🔍 [useStaffRole] Loading staff role for userId:', uid)

      // Try to load from cache first
      const cached = loadFromCache(uid)
      if (cached) {
        setStaffRecord(cached.staffRecord)
        setRole(cached.role)
        loadedUserIdRef.current = uid
        setLoading(false)
        isLoadingRef.current = false
        console.log('✅ [useStaffRole] Loaded from cache:', {
          userId: uid,
          role: cached.role,
          name: cached.staffRecord.name
        })
        return
      }

      // Look up staff record by user_id
      let { data: staffRaw } = await supabase.from('staff').select('*').eq('user_id', uid).limit(1)
      let staff = (staffRaw || []).map((s: any) => ({ ...s, userId: s.user_id }))

      // Fallback: try by email
      if (staff.length === 0) {
        console.log('🔍 [useStaffRole] userId lookup failed, trying email lookup...')
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser()
          if (currentUser?.email) {
            const { data: byEmail } = await supabase.from('staff').select('*').eq('email', currentUser.email).limit(1)
            staff = (byEmail || []).map((s: any) => ({ ...s, userId: s.user_id }))

            if (staff.length > 0 && staff[0].userId !== uid) {
              console.log('🔧 [useStaffRole] Updating staff record with correct userId...')
              try {
                await supabase.from('staff').update({ user_id: uid }).eq('id', staff[0].id)
                staff[0].userId = uid
              } catch (updateError) {
                console.warn('⚠️ [useStaffRole] Could not update staff userId:', updateError)
              }
            }
          }
        } catch (emailLookupError) {
          console.warn('⚠️ [useStaffRole] Email lookup failed:', emailLookupError)
        }
      }

      if (staff.length > 0) {
        const staffRecord = staff[0] as unknown as StaffRecord
        const staffRole = staffRecord.role as StaffRole
        setStaffRecord(staffRecord)
        setRole(staffRole)
        loadedUserIdRef.current = uid

        // Save to cache
        saveToCache(uid, staffRecord, staffRole)

        console.log('✅ [useStaffRole] Staff role loaded successfully:', {
          userId: uid,
          role: staffRole,
          name: staffRecord.name,
          email: staffRecord.email
        })
      } else {
        setRole(null)
        setStaffRecord(null)
        loadedUserIdRef.current = null
        console.warn('❌ [useStaffRole] No staff record found for userId:', uid)
      }
    } catch (error) {
      console.error('❌ [useStaffRole] Failed to load staff role:', error)
      setRole(null)
      setStaffRecord(null)
      loadedUserIdRef.current = null
    } finally {
      setLoading(false)
      isLoadingRef.current = false
    }
  }, [])

  useEffect(() => {
    // Use a sentinel value so the first auth resolution (null user) is always processed
    const UNSET = '__unset__'
    let currentUserId: string | null = UNSET as any

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newUserId = session?.user?.id || null

      // Process whenever userId changes OR on the very first resolution
      if (newUserId !== currentUserId) {
        const prevUserId = currentUserId === UNSET ? null : currentUserId as string | null
        currentUserId = newUserId

        if (newUserId) {
          setUserId(newUserId)
          loadStaffRole(newUserId)
        } else {
          setUserId(null)
          setRole(null)
          setStaffRecord(null)
          setLoading(false)
          loadedUserIdRef.current = null
          // Clear cache on logout
          if (prevUserId) {
            clearCache(prevUserId)
          }
        }
      }
    })

    // Listen for manual refresh events
    const handleRefresh = () => {
      if (currentUserId) {
        console.log('🔄 [useStaffRole] Manual refresh triggered')
        loadedUserIdRef.current = null // Force reload
        loadStaffRole(currentUserId)
      }
    }

    window.addEventListener('refreshStaffRole', handleRefresh)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('refreshStaffRole', handleRefresh)
    }
  }, [loadStaffRole])

  return {
    role,
    staffRecord,
    loading,
    userId,
    isOwner,
    isAdmin,
    isManager,
    isStaff,
    canManageEmployees,
    refreshRole: () => {
      if (userId) {
        loadStaffRole(userId)
      }
    }
  }
}
