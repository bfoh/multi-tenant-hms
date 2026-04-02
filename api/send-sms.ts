import { resolveTenant } from './_utils'

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

        // Arkesel API key from tenant or environment
        const apiKey = tenant.arkesel_api_key || process.env.ARKESEL_API_KEY
        const senderId = tenant.arkesel_sender_id || process.env.ARKESEL_SENDER_ID || 'Hotel'

        if (!apiKey) {
            console.error('[SMS] No Arkesel API key configured for tenant:', tenant.name)
            return res.status(500).json({ error: 'SMS service not configured for this tenant' })
        }

        // --- Phone Number Normalization ---
        let recipient = to.replace(/[^\d]/g, '')
        if (recipient.startsWith('0')) {
            recipient = '233' + recipient.substring(1)
        }
        if (!recipient.startsWith('233') && recipient.length === 9) {
            recipient = '233' + recipient
        }

        console.log(`[SMS] Tenant: ${tenant.name}, Sending to: ${recipient}`)

        const baseUrl = 'https://sms.arkesel.com/sms/api'
        const params = new URLSearchParams({
            action: 'send-sms',
            api_key: apiKey,
            to: recipient,
            from: senderId,
            sms: message
        })

        const response = await fetch(`${baseUrl}?${params.toString()}`)
        const responseText = await response.text()

        const isSuccess = response.ok && !responseText.toLowerCase().includes('error') && !responseText.toLowerCase().includes('invalid')

        if (isSuccess) {
            return res.status(200).json({
                success: true,
                results: { sms: { success: true, response: responseText } }
            })
        } else {
            console.error('[SMS] Arkesel Error:', responseText)
            let statusCode = 502
            if (responseText.toLowerCase().includes('invalid phone')) statusCode = 400
            else if (responseText.toLowerCase().includes('balance')) statusCode = 402

            return res.status(statusCode).json({
                success: false,
                error: responseText || 'Failed to send SMS'
            })
        }

    } catch (error: any) {
        console.error('[SMS] Error:', error)
        return res.status(500).json({ error: error.message })
    }
}
