import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { activityLogService } from '@/services/activity-log-service'

/**
 * Global component that monitors authentication state and handles auditing
 * for login/logout events. This ensures that even if a user is auto-logged in
 * via persistence, the activity is captured exactly once.
 */
export function AuthLogger() {
  const lastUserId = useRef<string | null>(null)
  const isInitialized = useRef(false)

  useEffect(() => {
    // 1. Initial check on mount
    const checkInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        console.log('🛡️ [AuthLogger] Initial session found:', session.user.email)
        activityLogService.setCurrentUser(session.user.id)
        lastUserId.current = session.user.id
      }
      isInitialized.current = true
    }
    checkInitialSession()

    // 2. Listen for state changes (Login, Logout, Token Refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user || null
      const currentUserId = user?.id || null

      console.log(`🛡️ [AuthLogger] Auth Event: ${event}`, { 
        user: user?.email, 
        lastUserId: lastUserId.current,
        currentUserId 
      })

      // Ensure service always has the correct user context
      activityLogService.setCurrentUser(currentUserId)

      // Handle Login/Logout Auditing
      if (event === 'SIGNED_IN' && currentUserId && lastUserId.current !== currentUserId) {
        // User logged in (or session restored)
        console.log('🛡️ [AuthLogger] Handling SIGNED_IN tasks...')
        
        // Execute post-login tasks in parallel, ensuring they don't block each other
        const tasks = [
          activityLogService.logUserLogin(currentUserId, {
            email: user?.email || '',
            source: 'authenticated_session'
          })
        ]

        // Check if this is the admin user that needs a staff record
        const adminEmail = import.meta.env.VITE_ADMIN_EMAIL
        if (user?.email && adminEmail && user.email === adminEmail) {
          console.log('🛡️ [AuthLogger] Admin user detected, ensuring staff record...')
          tasks.push(ensureAdminStaffRecord(currentUserId, user.email))
        }

        Promise.allSettled(tasks).then(results => {
          const failed = results.filter(r => r.status === 'rejected')
          if (failed.length > 0) {
            console.warn('🛡️ [AuthLogger] Some post-login tasks failed:', failed)
          }
        })

        lastUserId.current = currentUserId
      } 
      
      else if (event === 'SIGNED_OUT') {
        const userIdToLog = lastUserId.current
        lastUserId.current = null // Clear immediately to prevent double-logs
        
        if (userIdToLog) {
          console.log('🛡️ [AuthLogger] Auditing SIGNED_OUT for:', userIdToLog)
          activityLogService.logUserLogout(userIdToLog).catch(err => 
            console.error('[AuthLogger] Logout log failed:', err)
          )
        }
      }

      // If ID changed without an event (rare but possible), update ref
      if (currentUserId !== lastUserId.current && event !== 'INITIAL_SESSION') {
         lastUserId.current = currentUserId
      }
    })

    const ensureAdminStaffRecord = async (userId: string, email: string) => {
      try {
        const { data: existingStaff } = await supabase
          .from('staff')
          .select('id')
          .eq('user_id', userId)
          .limit(1)

        if (!existingStaff || existingStaff.length === 0) {
          const { error } = await supabase.from('staff').insert({
            id: `staff_admin_${Date.now()}`,
            user_id: userId,
            name: 'Admin User',
            email,
            role: 'admin',
            created_at: new Date().toISOString()
          })
          if (error) throw error
          console.log('🛡️ [AuthLogger] Successfully created admin staff record')
        }
      } catch (error) {
        console.warn('🛡️ [AuthLogger] ensureAdminStaffRecord error:', error)
      }
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return null // Non-rendering component
}
