import { supabase } from '@/lib/supabase'
import type { Booking, Room, HousekeepingTask } from '@/types'
import { activityLogService } from '@/services/activity-log-service'

class HousekeepingService {
    /**
     * Creates a housekeeping task for a room after checkout.
     */
    async createCheckoutTask(
        booking: Booking,
        room: Room,
        guestName: string,
        currentUser: { id: string } | null
    ): Promise<HousekeepingTask | null> {
        const taskPayload: any = {
            room_id: room.id || null,
            room_number: room.roomNumber,
            task_type: 'clean',
            status: 'pending',
            notes: `Checkout cleaning for ${guestName}`,
            priority: 'normal',
            assigned_to: null,
            tenant_id: (room as any).tenantId || (room as any).tenant_id || null,
        }

        console.log('🧹 [HousekeepingService] Creating task with payload:', taskPayload)

        try {
            const { data, error } = await supabase
                .from('housekeeping_tasks')
                .insert(taskPayload)
                .select()
                .single()

            if (error) {
                console.error('❌ [HousekeepingService] Failed to create task:', error)
                return null
            }

            console.log('✅ [HousekeepingService] Task created successfully:', data.id)

            try {
                await activityLogService.log({
                    action: 'created',
                    entityType: 'task',
                    entityId: data.id,
                    details: {
                        title: 'Checkout Cleaning',
                        roomNumber: room.roomNumber,
                        guestName,
                        status: 'pending',
                        reason: 'guest_check_out',
                        bookingId: booking.id
                    },
                    userId: currentUser?.id || 'system'
                })
            } catch (logError) {
                console.error('[HousekeepingService] Failed to log task creation:', logError)
            }

            // Convert snake_case response to camelCase for the UI
            return {
                id: data.id,
                roomId: data.room_id,
                roomNumber: data.room_number,
                taskType: data.task_type,
                status: data.status,
                assignedTo: data.assigned_to,
                notes: data.notes,
                priority: data.priority,
                createdAt: data.created_at,
                updatedAt: data.updated_at,
                completedAt: data.completed_at || null,
            } as any
        } catch (error: any) {
            console.error('❌ [HousekeepingService] Failed to create task:', error?.message || error)
            return null
        }
    }

    /**
     * Completes a housekeeping task and updates the room status to available.
     */
    async completeTask(
        taskId: string,
        roomNumber: string,
        notes: string,
        userId?: string
    ): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`🧹 [HousekeepingService] Completing task ${taskId} for room ${roomNumber}`)

            // 1. Update task status
            const { error: taskError } = await supabase
                .from('housekeeping_tasks')
                .update({
                    status: 'completed',
                    notes: notes || null,
                    updated_at: new Date().toISOString()
                })
                .eq('id', taskId)

            if (taskError) {
                console.error('[HousekeepingService] Failed to update task:', taskError)
                return { success: false, error: taskError.message }
            }

            // 2. Update room status to available
            const { error: roomError } = await supabase
                .from('rooms')
                .update({ status: 'available', updated_at: new Date().toISOString() })
                .eq('room_number', roomNumber)
                .eq('status', 'cleaning')

            if (roomError) {
                console.warn('[HousekeepingService] Failed to update room status:', roomError)
                // Non-fatal — task is still completed
            }

            return { success: true }
        } catch (error: any) {
            console.error('[HousekeepingService] Failed to complete task:', error)
            return { success: false, error: error.message }
        }
    }
}

export const housekeepingService = new HousekeepingService()
