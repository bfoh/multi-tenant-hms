import { supabase } from '@/lib/supabase'
import { ChannelConnection, ChannelRoomMapping, ExternalBooking } from '@/types'

function _ccConn(r: any): ChannelConnection {
    return {
        id: r.id,
        channelId: r.channel_id ?? r.channelId,
        name: r.name,
        isActive: r.is_active ?? r.isActive ?? false,
        createdAt: r.created_at ?? r.createdAt,
        updatedAt: r.updated_at ?? r.updatedAt,
    }
}

function _ccMap(r: any): ChannelRoomMapping {
    return {
        id: r.id,
        channelConnectionId: r.channel_connection_id ?? r.channelConnectionId,
        localRoomTypeId: r.local_room_type_id ?? r.localRoomTypeId,
        importUrl: r.import_url ?? r.importUrl,
        exportToken: r.export_token ?? r.exportToken,
        lastSyncedAt: r.last_synced_at ?? r.lastSyncedAt,
        syncStatus: r.sync_status ?? r.syncStatus ?? 'pending',
        syncMessage: r.sync_message ?? r.syncMessage,
        createdAt: r.created_at ?? r.createdAt,
        updatedAt: r.updated_at ?? r.updatedAt,
    }
}

export class ChannelService {
    private static instance: ChannelService

    static getInstance(): ChannelService {
        if (!ChannelService.instance) {
            ChannelService.instance = new ChannelService()
        }
        return ChannelService.instance
    }

    // --- Channel Connections ---

    async getConnections(): Promise<ChannelConnection[]> {
        try {
            const { data } = await supabase.from('channel_connections').select('*').limit(50)
            return (data || []).map(_ccConn)
        } catch (error) {
            console.error('Failed to fetch channel connections:', error)
            return []
        }
    }

    async getConnection(channelId: string): Promise<ChannelConnection | null> {
        try {
            const connections = await this.getConnections()
            return connections.find(c => c.channelId === channelId) || null
        } catch (error) {
            console.error(`Failed to fetch connection for ${channelId}:`, error)
            return null
        }
    }

    async createConnection(data: Partial<ChannelConnection>): Promise<ChannelConnection> {
        try {
            const now = new Date().toISOString()
            const { data: row, error } = await supabase
                .from('channel_connections')
                .insert({
                    id: `chan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    channel_id: data.channelId,
                    name: data.name,
                    is_active: data.isActive ?? false,
                    created_at: now,
                    updated_at: now,
                })
                .select()
                .single()
            if (error) throw error
            return _ccConn(row)
        } catch (error) {
            console.error('Failed to create channel connection:', error)
            throw error
        }
    }

    async updateConnection(id: string, updates: Partial<ChannelConnection>): Promise<ChannelConnection> {
        try {
            const payload: Record<string, any> = { updated_at: new Date().toISOString() }
            if (updates.isActive !== undefined) payload.is_active = updates.isActive
            if (updates.name !== undefined) payload.name = updates.name
            const { data: row, error } = await supabase
                .from('channel_connections')
                .update(payload)
                .eq('id', id)
                .select()
                .single()
            if (error) throw error
            return _ccConn(row)
        } catch (error) {
            console.error(`Failed to update connection ${id}:`, error)
            throw error
        }
    }

    async toggleConnection(channelId: string, isActive: boolean): Promise<ChannelConnection> {
        const connection = await this.getConnection(channelId)

        if (connection) {
            return this.updateConnection(connection.id, { isActive })
        } else {
            const channelNames: Record<string, string> = {
                airbnb: 'Airbnb',
                booking: 'Booking.com',
                expedia: 'Expedia',
                vrbo: 'VRBO',
                tripadvisor: 'TripAdvisor',
                hotels: 'Hotels.com'
            }

            return this.createConnection({
                channelId: channelId as any,
                name: channelNames[channelId] || channelId,
                isActive
            })
        }
    }

    // --- Room Mappings ---

    async getMappings(connectionId?: string): Promise<ChannelRoomMapping[]> {
        try {
            let query = supabase.from('channel_room_mappings').select('*').limit(100)
            if (connectionId) query = query.eq('channel_connection_id', connectionId)
            const { data } = await query
            return (data || []).map(_ccMap)
        } catch (error) {
            console.error('Failed to fetch room mappings:', error)
            return []
        }
    }

    async createMapping(data: Partial<ChannelRoomMapping>): Promise<ChannelRoomMapping> {
        try {
            const exportToken = data.exportToken || Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
            const now = new Date().toISOString()
            const { data: row, error } = await supabase
                .from('channel_room_mappings')
                .insert({
                    id: `map_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    channel_connection_id: data.channelConnectionId,
                    local_room_type_id: data.localRoomTypeId,
                    import_url: data.importUrl,
                    export_token: exportToken,
                    sync_status: 'pending',
                    created_at: now,
                    updated_at: now,
                })
                .select()
                .single()
            if (error) throw error
            return _ccMap(row)
        } catch (error) {
            console.error('Failed to create room mapping:', error)
            throw error
        }
    }

    async updateMapping(id: string, updates: Partial<ChannelRoomMapping>): Promise<ChannelRoomMapping> {
        try {
            const payload: Record<string, any> = { updated_at: new Date().toISOString() }
            if (updates.syncStatus !== undefined) payload.sync_status = updates.syncStatus
            if (updates.importUrl !== undefined) payload.import_url = updates.importUrl
            if (updates.lastSyncedAt !== undefined) payload.last_synced_at = updates.lastSyncedAt
            const { data: row, error } = await supabase
                .from('channel_room_mappings')
                .update(payload)
                .eq('id', id)
                .select()
                .single()
            if (error) throw error
            return _ccMap(row)
        } catch (error) {
            console.error(`Failed to update mapping ${id}:`, error)
            throw error
        }
    }

    async deleteMapping(id: string): Promise<void> {
        try {
            await supabase.from('channel_room_mappings').delete().eq('id', id)
        } catch (error) {
            console.error(`Failed to delete mapping ${id}:`, error)
            throw error
        }
    }

    // --- External Bookings ---

    async getExternalBookings(mappingId: string): Promise<ExternalBooking[]> {
        try {
            const { data } = await supabase
                .from('external_bookings')
                .select('*')
                .eq('mapping_id', mappingId)
                .limit(500)
            return (data || []).map((r: any) => ({
                id: r.id,
                mappingId: r.mapping_id,
                externalId: r.external_id,
                startDate: r.start_date,
                endDate: r.end_date,
                summary: r.summary,
                rawData: r.raw_data,
                createdAt: r.created_at,
                updatedAt: r.updated_at,
            }))
        } catch (error) {
            console.error(`Failed to fetch external bookings for mapping ${mappingId}:`, error)
            return []
        }
    }
}

export const channelService = ChannelService.getInstance()
