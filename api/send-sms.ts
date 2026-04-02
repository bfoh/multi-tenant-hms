import { resolveTenant } from './_utils'
import { sendSmsForTenant } from './_send-helpers'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const tenant = await resolveTenant(req)
        if (!tenant) {
            return res.status(401).json({ error: 'Unauthorized: Could not resolve tenant' })
        }

        const { to, message } = req.body
        if (!to || !message) {
            return res.status(400).json({ error: 'Missing required fields: to, message' })
        }

        console.log(`[SMS] Tenant: ${tenant.name}, Sending to: ${to}`)

        await sendSmsForTenant(tenant, to, message)

        return res.status(200).json({ success: true, results: { sms: { success: true } } })

    } catch (error: any) {
        console.error('[SMS] Error:', error)
        const msg = error.message || ''
        let statusCode = 500
        if (msg.includes('not configured')) statusCode = 500
        else if (msg.toLowerCase().includes('invalid phone')) statusCode = 400
        else if (msg.toLowerCase().includes('balance')) statusCode = 402
        else statusCode = 502
        return res.status(statusCode).json({ success: false, error: msg })
    }
}
