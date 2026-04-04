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
        console.log('🛡️ [AuthLogger] Auditing SIGNED_IN...')
        await activityLogService.logUserLogin(currentUserId, {
          email: user?.email || '',
          source: 'authenticated_session'
        }).catch(err => console.error('[AuthLogger] Login log failed:', err))
        lastUserId.current = currentUserId
      } 
      
      else if (event === 'SIGNED_OUT') {
        // User logged out
        if (lastUserId.current) {
          console.log('🛡️ [AuthLogger] Auditing SIGNED_OUT for:', lastUserId.current)
          await activityLogService.logUserLogout(lastUserId.current).catch(err => 
            console.error('[AuthLogger] Logout log failed:', err)
          )
        }
        lastUserId.current = null
      }

      // If ID changed without an event (rare but possible), update ref
      if (currentUserId !== lastUserId.current && event !== 'INITIAL_SESSION') {
         lastUserId.current = currentUserId
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return null // Non-rendering component
}
