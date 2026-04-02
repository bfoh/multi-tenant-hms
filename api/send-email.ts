import { Resend } from 'resend'
import { Buffer } from 'node:buffer'
import { resolveTenant } from './_utils'

export default async function handler(req: any, res: any) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const tenant = await resolveTenant(req)
        if (!tenant) {
            return res.status(401).json({ error: 'Unauthorized: Could not resolve tenant' })
        }

        // Get API key from tenant configuration or environment fallback
        const resendApiKey = tenant.resend_api_key || process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY

        if (!resendApiKey) {
            console.error('[send-email] No Resend API key configured for tenant:', tenant.name)
            return res.status(500).json({ error: 'Email service not configured for this tenant' })
        }

        const payload = req.body

        // Validate required fields
        if (!payload.to || !payload.subject || !payload.html) {
            return res.status(400).json({ error: 'Missing required fields: to, subject, html' })
        }

        const resend = new Resend(resendApiKey)

        // Prepare email payload
        const emailPayload: any = {
            from: payload.from || `${tenant.name} <noreply@${tenant.domain}>`,
            to: payload.to,
            subject: payload.subject,
            html: payload.html,
            text: payload.text || undefined,
            replyTo: payload.replyTo || undefined,
        }

        // Handle attachments if present
        if (payload.attachments && Array.isArray(payload.attachments)) {
            emailPayload.attachments = payload.attachments.map((att: any) => {
                // Handle base64 encoded content
                let content = att.content
                if (typeof content === 'string' && content.includes(',')) {
                    // Handle data URL format (e.g., "data:application/pdf;base64,...")
                    content = content.split(',')[1]
                }
                return {
                    filename: att.filename,
                    content: Buffer.from(content, 'base64'),
                    contentType: att.contentType || 'application/octet-stream'
                }
            })
        }

        console.log(`[send-email] Tenant: ${tenant.name}, Sending to: ${payload.to}`)

        const { data, error } = await resend.emails.send(emailPayload)

        if (error) {
            console.error('[send-email] Resend error:', error)
            return res.status(400).json({ success: false, error: error.message })
        }

        return res.status(200).json({
            success: true,
            id: data?.id,
            message: 'Email sent successfully'
        })

    } catch (error: any) {
        console.error('[send-email] Error:', error)
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to send email'
        })
    }
}
