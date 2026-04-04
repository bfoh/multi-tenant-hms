import { supabaseAdmin, resolveTenant } from './_utils'
import { sendEmailForTenant, sendSmsForTenant } from './_send-helpers'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const tenant = await resolveTenant(req)
        if (!tenant) return res.status(400).json({ error: 'Could not resolve tenant' })

        const { channel, content, subject, dryRun } = req.body

        if (!channel || !content) {
            return res.status(400).json({ error: 'channel and content are required' })
        }

        // Get all guests with contact info for this tenant
        const { data: bookings, error } = await supabaseAdmin
            .from('bookings')
            .select('guest_id, guests(id, name, email, phone)')
            .eq('tenant_id', tenant.id)
            .neq('status', 'cancelled')

        if (error) return res.status(500).json({ error: error.message })

        // Deduplicate by guest_id
        const seen = new Set<string>()
        const guests: any[] = []
        for (const b of bookings || []) {
            const g = b.guests as any
            if (!g || seen.has(g.id)) continue
            seen.add(g.id)
            guests.push(g)
        }

        const recipientCount = guests.length

        if (dryRun) {
            return res.status(200).json({ recipientCount })
        }

        const stats = { sent: 0, failed: 0, skipped: 0, total: recipientCount }

        for (const guest of guests) {
            try {
                if (channel === 'sms') {
                    if (!guest.phone) { stats.skipped++; continue }
                    await sendSmsForTenant(tenant, guest.phone, content)
                    stats.sent++
                } else if (channel === 'email') {
                    if (!guest.email) { stats.skipped++; continue }
                    await sendEmailForTenant(tenant, {
                        to: guest.email,
                        subject: subject || `Message from ${tenant.name}`,
                        html: `<p>${content.replace(/\n/g, '<br>')}</p>`,
                        text: content
                    })
                    stats.sent++
                } else {
                    stats.skipped++
                }
            } catch (err: any) {
                console.error(`[trigger-campaign] Failed to send to ${guest.email || guest.phone}:`, err.message)
                stats.failed++
            }
        }

        // Log activity
        await supabaseAdmin.from('activity_logs').insert({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            action: 'created',
            entity_type: 'report', // Using report as a proxy for campaign events in this schema
            entity_id: `campaign-${Date.now()}`,
            details: JSON.stringify({
                channel,
                recipientCount: stats.total,
                sent: stats.sent,
                failed: stats.failed,
                message: `Triggered ${channel} campaign to ${stats.total} guests (${stats.sent} successful).`
            }),
            user_id: 'system',
            tenant_id: tenant.id,
            created_at: new Date().toISOString()
        })

        return res.status(200).json({ success: true, stats })

    } catch (err: any) {
        console.error('[trigger-campaign] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
