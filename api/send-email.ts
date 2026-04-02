import { resolveTenant } from './_utils'
import { sendEmailForTenant } from './_send-helpers'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const tenant = await resolveTenant(req)
        if (!tenant) {
            return res.status(401).json({ error: 'Unauthorized: Could not resolve tenant' })
        }

        const payload = req.body
        if (!payload.to || !payload.subject || !payload.html) {
            return res.status(400).json({ error: 'Missing required fields: to, subject, html' })
        }

        console.log(`[send-email] Tenant: ${tenant.name}, Sending to: ${payload.to}`)

        const data = await sendEmailForTenant(tenant, payload)

        return res.status(200).json({ success: true, id: data?.id, message: 'Email sent successfully' })

    } catch (error: any) {
        console.error('[send-email] Error:', error)
        const isConfig = error.message?.includes('not configured')
        return res.status(isConfig ? 500 : 400).json({ success: false, error: error.message || 'Failed to send email' })
    }
}
