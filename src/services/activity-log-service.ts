import { supabase } from '@/lib/supabase'

/**
 * Activity types that can be logged
 */
export type ActivityAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'checked_in'
  | 'checked_out'
  | 'payment_received'
  | 'payment_refunded'
  | 'status_changed'
  | 'assigned'
  | 'completed'
  | 'cancelled'
  | 'exported'
  | 'imported'
  | 'login'
  | 'logout'

export type EntityType =
  | 'booking'
  | 'guest'
  | 'invoice'
  | 'staff'
  | 'room'
  | 'room_type'
  | 'property'
  | 'task'
  | 'contact_message'
  | 'payment'
  | 'report'
  | 'settings'
  | 'user'

export interface ActivityLogData {
  action: ActivityAction
  entityType: EntityType
  entityId: string
  details: Record<string, any>
  userId?: string
  metadata?: {
    ipAddress?: string
    userAgent?: string
    source?: string
    [key: string]: any
  }
}

export interface ActivityLog extends ActivityLogData {
  id: string
  createdAt: string
}

/**
 * Generate unique, descriptive heading for activity logs
 */
function generateUniqueActivityHeading(action: string, entityType: string, details: Record<string, any>): string {
  const actionText = action.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())

  // Handle different entity types and actions
  switch (entityType) {
    case 'booking':
      if (details.guestName && details.roomNumber) {
        return `${actionText} Booking - ${details.guestName} (Room ${details.roomNumber})`
      }
      if (details.roomNumber) {
        return `${actionText} Booking - Room ${details.roomNumber}`
      }
      return `${actionText} Booking`

    case 'guest':
      if (details.name) {
        return `${actionText} Guest - ${details.name}`
      }
      if (details.email) {
        return `${actionText} Guest - ${details.email}`
      }
      return `${actionText} Guest`

    case 'payment':
      if (details.amount && details.method) {
        return `${actionText} Payment - $${details.amount} via ${details.method}`
      }
      if (details.amount) {
        return `${actionText} Payment - $${details.amount}`
      }
      return `${actionText} Payment`

    case 'invoice':
      if (details.invoiceNumber) {
        return `${actionText} Invoice - ${details.invoiceNumber}`
      }
      if (details.guestName) {
        return `${actionText} Invoice - ${details.guestName}`
      }
      return `${actionText} Invoice`

    case 'room':
      if (details.roomNumber) {
        return `${actionText} Room - ${details.roomNumber}`
      }
      return `${actionText} Room`

    case 'staff':
    case 'user':
      if (details.name) {
        return `${actionText} User - ${details.name}`
      }
      if (details.email) {
        return `${actionText} User - ${details.email}`
      }
      if (details.role) {
        return `${actionText} ${details.role}`
      }
      return `${actionText} User`

    case 'task':
      if (details.title) {
        return `${actionText} Task - ${details.title}`
      }
      if (details.roomNumber) {
        return `${actionText} Task - Room ${details.roomNumber}`
      }
      return `${actionText} Task`

    case 'contact_message':
      if (details.name) {
        return `${actionText} Contact Message - ${details.name}`
      }
      if (details.email) {
        return `${actionText} Contact Message - ${details.email}`
      }
      return `${actionText} Contact Message`

    default:
      // Generic fallback with entity ID for uniqueness
      if (details.entityId) {
        return `${actionText} ${entityType} - ${details.entityId.slice(-6)}`
      }
      return `${actionText} ${entityType}`
  }
}

/**
 * Centralized service for logging all user activities across the application
 * This service ensures every significant action is tracked for audit purposes
 */
class ActivityLogService {
  private currentUserId: string | null = null
  private pendingLogs: ActivityLogData[] = []
  private isOnline = true

  constructor() {
    // Monitor online status
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine
      window.addEventListener('online', () => {
        this.isOnline = true
        this.flushPendingLogs()
      })
      window.addEventListener('offline', () => {
        this.isOnline = false
      })
    }
  }

  /**
   * Set the current user ID for logging purposes
   * Should be called when user logs in
   */
  public setCurrentUser(userId: string | null) {
    this.currentUserId = userId
    console.log('[ActivityLog] Current user set:', userId)
  }

  /**
   * Get the current user ID
   */
  public getCurrentUser(): string | null {
    return this.currentUserId
  }

  /**
   * Log an activity to the database
   * NOTE: This method is designed to be non-blocking - failures will not propagate
   * to the caller so that main operations (like booking deletion) are not affected
   */
  public async log(data: ActivityLogData): Promise<void> {
    // Wrap entire function in try-catch to ensure logging never blocks operations
    try {
      // Use provided userId or fall back to current user
      const userId = data.userId || this.currentUserId || 'system'

      // Get current user and tenant details
      const { data: { user } } = await supabase.auth.getUser()
      const tenantId = user?.app_metadata?.tenant_id
      const userEmail = user?.email || userId

      const logEntry = {
        id: crypto.randomUUID(),
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        details: JSON.stringify(data.details),
        userId,
        tenantId, // Include tenantId
        metadata: JSON.stringify({
          ...(data.metadata || {}),
          userEmail: userEmail !== userId ? userEmail : undefined
        }),
        createdAt: new Date().toISOString(),
      }

      console.log('[ActivityLog] Logging activity:', logEntry)

      // If offline, queue the log
      if (!this.isOnline) {
        this.pendingLogs.push(data)
        console.log('[ActivityLog] Offline - queued for later sync')
        return
      }

      // Insert directly into activity_logs via Supabase
      const { error: logError } = await supabase.from('activity_logs').insert({
        id: logEntry.id,
        action: logEntry.action,
        entity_type: logEntry.entityType,
        entity_id: logEntry.entityId,
        details: logEntry.details,
        user_id: userId,
        tenant_id: logEntry.tenantId, // Ensure tenant_id is persisted
        metadata: logEntry.metadata,
        created_at: logEntry.createdAt,
      })

      if (logError) {
        console.warn('[ActivityLog] Failed to insert activity log:', logError.message)
        this.pendingLogs.push(data)
      } else {
        console.log('[ActivityLog] Activity logged successfully')
      }
    } catch (error) {
      // Catch-all to ensure we never throw from this method
      console.error('[ActivityLog] Failed to log activity (non-blocking):', error)
      // Silently queue for potential future retry - don't throw
      try {
        this.pendingLogs.push(data)
      } catch (queueError) {
        console.error('[ActivityLog] Failed to queue activity log:', queueError)
      }
    }
  }

  /**
   * Flush pending logs when coming back online
   */
  private async flushPendingLogs() {
    if (this.pendingLogs.length === 0) return

    console.log(`[ActivityLog] Flushing ${this.pendingLogs.length} pending logs`)

    const logsToFlush = [...this.pendingLogs]
    this.pendingLogs = []

    for (const log of logsToFlush) {
      try {
        await this.log(log)
      } catch (error) {
        console.error('[ActivityLog] Failed to flush log:', error)
        // Re-queue if still failing
        this.pendingLogs.push(log)
      }
    }
  }

  /**
   * Convenience methods for common activities
   */

  public async logBookingCreated(bookingId: string, details: any, userId?: string) {
    await this.log({
      action: 'created',
      entityType: 'booking',
      entityId: bookingId,
      details: {
        guestName: details.guestName,
        guestEmail: details.guestEmail,
        roomNumber: details.roomNumber,
        roomType: details.roomType,
        checkIn: details.checkIn,
        checkOut: details.checkOut,
        amount: details.amount,
        status: details.status,
        source: details.source,
      },
      userId,
    })
  }

  public async logBookingUpdated(bookingId: string, changes: any, userId?: string) {
    await this.log({
      action: 'updated',
      entityType: 'booking',
      entityId: bookingId,
      details: {
        changes,
        timestamp: new Date().toISOString(),
      },
      userId,
    })
  }

  public async logBookingCancelled(bookingId: string, reason: string, userId?: string) {
    await this.log({
      action: 'cancelled',
      entityType: 'booking',
      entityId: bookingId,
      details: {
        reason,
        cancelledAt: new Date().toISOString(),
      },
      userId,
    })
  }

  public async logCheckIn(bookingId: string, details: any, userId?: string) {
    await this.log({
      action: 'checked_in',
      entityType: 'booking',
      entityId: bookingId,
      details: {
        guestName: details.guestName,
        roomNumber: details.roomNumber,
        actualCheckIn: details.actualCheckIn,
        scheduledCheckIn: details.scheduledCheckIn,
      },
      userId,
    })
  }

  public async logCheckOut(bookingId: string, details: any, userId?: string) {
    await this.log({
      action: 'checked_out',
      entityType: 'booking',
      entityId: bookingId,
      details: {
        guestName: details.guestName,
        roomNumber: details.roomNumber,
        actualCheckOut: details.actualCheckOut,
        scheduledCheckOut: details.scheduledCheckOut,
      },
      userId,
    })
  }

  public async logGuestCreated(guestId: string, details: any, userId?: string) {
    await this.log({
      action: 'created',
      entityType: 'guest',
      entityId: guestId,
      details: {
        name: details.name,
        email: details.email,
        phone: details.phone,
        address: details.address,
      },
      userId,
    })
  }

  public async logGuestUpdated(guestId: string, changes: any, userId?: string) {
    await this.log({
      action: 'updated',
      entityType: 'guest',
      entityId: guestId,
      details: {
        changes,
      },
      userId,
    })
  }

  public async logGuestDeleted(guestId: string, guestName: string, userId?: string) {
    await this.log({
      action: 'deleted',
      entityType: 'guest',
      entityId: guestId,
      details: {
        name: guestName,
        deletedAt: new Date().toISOString(),
      },
      userId,
    })
  }

  public async logInvoiceCreated(invoiceId: string, details: any, userId?: string) {
    await this.log({
      action: 'created',
      entityType: 'invoice',
      entityId: invoiceId,
      details: {
        invoiceNumber: details.invoiceNumber,
        guestName: details.guestName,
        guestEmail: details.guestEmail,
        totalAmount: details.totalAmount,
        status: details.status,
        itemCount: details.itemCount,
      },
      userId,
    })
  }

  public async logInvoiceUpdated(invoiceId: string, changes: any, userId?: string) {
    await this.log({
      action: 'updated',
      entityType: 'invoice',
      entityId: invoiceId,
      details: {
        changes,
      },
      userId,
    })
  }

  public async logInvoiceDeleted(invoiceId: string, invoiceNumber: string, userId?: string) {
    await this.log({
      action: 'deleted',
      entityType: 'invoice',
      entityId: invoiceId,
      details: {
        invoiceNumber,
        deletedAt: new Date().toISOString(),
      },
      userId,
    })
  }

  public async logPaymentReceived(paymentId: string, details: any, userId?: string) {
    await this.log({
      action: 'payment_received',
      entityType: 'payment',
      entityId: paymentId,
      details: {
        bookingId: details.bookingId,
        amount: details.amount,
        method: details.method,
        reference: details.reference,
        status: details.status,
      },
      userId,
    })
  }

  public async logStaffCreated(staffId: string, details: any, userId?: string) {
    await this.log({
      action: 'created',
      entityType: 'staff',
      entityId: staffId,
      details: {
        name: details.name,
        email: details.email,
        role: details.role,
        department: details.department,
      },
      userId,
    })
  }

  public async logStaffUpdated(staffId: string, changes: any, userId?: string) {
    await this.log({
      action: 'updated',
      entityType: 'staff',
      entityId: staffId,
      details: {
        changes,
      },
      userId,
    })
  }

  public async logStaffDeleted(staffId: string, staffName: string, userId?: string) {
    await this.log({
      action: 'deleted',
      entityType: 'staff',
      entityId: staffId,
      details: {
        name: staffName,
        deletedAt: new Date().toISOString(),
      },
      userId,
    })
  }

  public async logTaskCompleted(taskId: string, details: any, userId?: string) {
    await this.log({
      action: 'completed',
      entityType: 'task',
      entityId: taskId,
      details: {
        title: details.title,
        roomNumber: details.roomNumber,
        completedBy: details.completedBy,
        completedAt: details.completedAt,
      },
      userId,
    })
  }

  public async logRoomCreated(roomId: string, details: any, userId?: string) {
    await this.log({
      action: 'created',
      entityType: 'room',
      entityId: roomId,
      details: {
        roomNumber: details.roomNumber,
        roomType: details.roomType,
        status: details.status,
        price: details.price,
      },
      userId,
    })
  }

  public async logRoomUpdated(roomId: string, changes: any, userId?: string) {
    await this.log({
      action: 'updated',
      entityType: 'room',
      entityId: roomId,
      details: {
        changes,
      },
      userId,
    })
  }

  public async logRoomDeleted(roomId: string, roomNumber: string, userId?: string) {
    await this.log({
      action: 'deleted',
      entityType: 'room',
      entityId: roomId,
      details: {
        roomNumber,
        deletedAt: new Date().toISOString(),
      },
      userId,
    })
  }

  public async logUserLogin(userId: string, userDetails: any) {
    await this.log({
      action: 'login',
      entityType: 'user',
      entityId: userId,
      details: {
        email: userDetails.email,
        role: userDetails.role,
        loginAt: new Date().toISOString(),
      },
      userId,
      metadata: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        source: 'web',
      },
    })
  }

  public async logUserLogout(userId: string, userDetails?: { email?: string }) {
    // Use provided user details or try to get user email
    let userEmail = userDetails?.email || 'Unknown User'

    if (!userDetails?.email) {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        userEmail = user?.email || 'Unknown User'
      } catch (error) {
        console.warn('[ActivityLog] Failed to get user email for logout, using userId:', error)
        userEmail = 'Unknown User'
      }
    }

    await this.log({
      action: 'logout',
      entityType: 'user',
      entityId: userId,
      details: {
        email: userEmail,
        logoutAt: new Date().toISOString(),
      },
      userId,
    })
  }

  public async logSettingsChanged(settingId: string, changes: any, userId?: string) {
    await this.log({
      action: 'updated',
      entityType: 'settings',
      entityId: settingId,
      details: {
        changes,
      },
      userId,
    })
  }

  public async logReportExported(reportType: string, filters: any, userId?: string) {
    await this.log({
      action: 'exported',
      entityType: 'report',
      entityId: `report-${Date.now()}`,
      details: {
        reportType,
        filters,
        exportedAt: new Date().toISOString(),
      },
      userId,
    })
  }

  /**
   * Query activity logs with filters
   */
  public async getActivityLogs(options?: {
    entityType?: EntityType
    entityId?: string
    userId?: string
    action?: ActivityAction
    startDate?: Date
    endDate?: Date
    limit?: number
    offset?: number
  }): Promise<ActivityLog[]> {
    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(options?.limit || 100)

      if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 100) - 1)
      if (options?.entityType) query = query.eq('entity_type', options.entityType)
      if (options?.entityId) query = query.eq('entity_id', options.entityId)
      if (options?.userId) query = query.eq('user_id', options.userId)
      if (options?.action) query = query.eq('action', options.action)
      if (options?.startDate) query = query.gte('created_at', options.startDate.toISOString())
      if (options?.endDate) query = query.lte('created_at', options.endDate.toISOString())

      const { data, error } = await query
      if (error) throw error

      const parsedLogs = (data || []).map((row: any) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
        userId: row.user_id,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        createdAt: row.created_at,
      }))

      console.log('[ActivityLog] Retrieved logs:', parsedLogs.length)
      return parsedLogs
    } catch (error) {
      console.error('[ActivityLog] Failed to fetch activity logs:', error)
      return []
    }
  }

  /**
   * Get activity statistics
   */
  public async getActivityStats(startDate?: Date, endDate?: Date): Promise<{
    totalActivities: number
    byAction: Record<ActivityAction, number>
    byEntityType: Record<EntityType, number>
    byUser: Record<string, number>
    recentActivities: ActivityLog[]
  }> {
    try {
      const logs = await this.getActivityLogs({
        startDate,
        endDate,
        limit: 1000,
      })

      const byAction: any = {}
      const byEntityType: any = {}
      const byUser: any = {}

      logs.forEach((log) => {
        byAction[log.action] = (byAction[log.action] || 0) + 1
        byEntityType[log.entityType] = (byEntityType[log.entityType] || 0) + 1
        byUser[log.userId] = (byUser[log.userId] || 0) + 1
      })

      return {
        totalActivities: logs.length,
        byAction,
        byEntityType,
        byUser,
        recentActivities: logs.slice(0, 10),
      }
    } catch (error) {
      console.error('[ActivityLog] Failed to get activity stats:', error)
      return {
        totalActivities: 0,
        byAction: {} as any,
        byEntityType: {} as any,
        byUser: {},
        recentActivities: [],
      }
    }
  }

  /**
   * Delete old activity logs (for data retention policies)
   */
  public async deleteOldLogs(daysToKeep: number = 365): Promise<number> {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

      const { error, count } = await supabase
        .from('activity_logs')
        .delete({ count: 'exact' })
        .lt('created_at', cutoffDate.toISOString())

      if (error) throw error

      const deletedCount = count || 0
      console.log(`[ActivityLog] Deleted ${deletedCount} old activity logs`)
      return deletedCount
    } catch (error) {
      console.error('[ActivityLog] Failed to delete old logs:', error)
      return 0
    }
  }

  /**
   * Subscribe to real-time activity log changes
   * @param onLog Callback function when a new log is created
   * @returns Cleanup function to unsubscribe
   */
  public subscribeToLogs(onLog: (log: ActivityLog) => void) {
    const channel = supabase
      .channel('public:activity_logs_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_logs',
        },
        (payload) => {
          console.log('[ActivityLog] Real-time log received:', payload)
          const row = payload.new
          const log: ActivityLog = {
            id: row.id,
            action: row.action,
            entityType: row.entity_type,
            entityId: row.entity_id,
            details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
            userId: row.user_id,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
            createdAt: row.created_at,
          }
          onLog(log)
        }
      )
      .subscribe((status) => {
        console.log('[ActivityLog] Subscription status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }
}

// Export singleton instance
export const activityLogService = new ActivityLogService()

