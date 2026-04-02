import { Resend } from 'resend'
import { Buffer } from 'node:buffer'

export interface EmailPayload {
    to: string | string[]
    subject: string
    html: string
    text?: string
    from?: string
    replyTo?: string
    attachments?: Array<{
        filename: string
        content: string // Base64 or data-URL
        contentType?: string
    }>
}

/**
 * Send an email using the tenant's configured Resend API key.
 * Call this directly from other server-side functions instead of
 * making an HTTP request to /api/send-email, which would lose the
 * calling domain context and break tenant resolution.
 */
export async function sendEmailForTenant(tenant: any, payload: EmailPayload) {
    const resendApiKey = tenant.resend_api_key || process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY
    if (!resendApiKey) {
        throw new Error(`Email service not configured for tenant: ${tenant.name}`)
    }

    const resend = new Resend(resendApiKey)

    const emailPayload: any = {
        from: payload.from || `${tenant.name} <noreply@${tenant.domain}>`,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text || undefined,
        replyTo: payload.replyTo || undefined,
    }

    if (payload.attachments && Array.isArray(payload.attachments)) {
        emailPayload.attachments = payload.attachments.map((att) => {
            let content = att.content
            if (typeof content === 'string' && content.includes(',')) {
                content = content.split(',')[1]
            }
            return {
                filename: att.filename,
                content: Buffer.from(content, 'base64'),
                contentType: att.contentType || 'application/octet-stream'
            }
        })
    }

    const { data, error } = await resend.emails.send(emailPayload)
    if (error) throw new Error(error.message)
    return data
}

/**
 * Send an SMS using the tenant's configured Arkesel API key.
 * Call this directly from other server-side functions instead of
 * making an HTTP request to /api/send-sms.
 */
export async function sendSmsForTenant(tenant: any, to: string, message: string) {
    const apiKey = tenant.arkesel_api_key || process.env.ARKESEL_API_KEY
    const senderId = tenant.arkesel_sender_id || process.env.ARKESEL_SENDER_ID || 'Hotel'

    if (!apiKey) {
        throw new Error(`SMS service not configured for tenant: ${tenant.name}`)
    }

    // Normalize to Ghanaian E.164 format
    let recipient = to.replace(/[^\d]/g, '')
    if (recipient.startsWith('0')) {
        recipient = '233' + recipient.substring(1)
    }
    if (!recipient.startsWith('233') && recipient.length === 9) {
        recipient = '233' + recipient
    }

    const params = new URLSearchParams({
        action: 'send-sms',
        api_key: apiKey,
        to: recipient,
        from: senderId,
        sms: message
    })

    const response = await fetch(`https://sms.arkesel.com/sms/api?${params.toString()}`)
    const responseText = await response.text()

    const isSuccess = response.ok &&
        !responseText.toLowerCase().includes('error') &&
        !responseText.toLowerCase().includes('invalid')

    if (!isSuccess) {
        throw new Error(responseText || 'Failed to send SMS')
    }

    return responseText
}
