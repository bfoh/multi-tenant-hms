import { supabaseAdmin } from './_utils'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, prefer, x-upsert'

/**
 * Resolve the requesting origin against the tenants table.
 * Returns the origin string if allowed, null if not.
 */
async function resolveAllowedOrigin(origin: string): Promise<string | null> {
    // No Origin header = same-origin request from the frontend on the same Vercel domain.
    // Browsers never send Origin for same-origin fetches, so these are safe to allow.
    if (!origin) return 'same-origin'

    let hostname: string
    try {
        hostname = new URL(origin).hostname
    } catch {
        return null
    }

    // Allow Vercel preview deployments for this project
    if (hostname.endsWith('.vercel.app')) return origin

    // Allow requests from registered tenant domains
    const { data } = await supabaseAdmin
        .from('tenants')
        .select('domain')
        .eq('domain', hostname)
        .maybeSingle()

    return data ? origin : null
}

export default async function handler(req: any, res: any) {
    const requestOrigin = req.headers['origin'] || ''
    const allowedOrigin = await resolveAllowedOrigin(requestOrigin)

    if (req.method === 'OPTIONS') {
        if (allowedOrigin) {
            res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
            res.setHeader('Vary', 'Origin')
        }
        res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
        res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
        return res.status(204).end()
    }

    if (!allowedOrigin) {
        return res.status(403).json({ error: 'Forbidden: origin not permitted' })
    }

    try {
        // Extract the supabase path from _sbpath query param
        const query = req.query as any
        const supabasePath = query._sbpath || '/'

        // Rebuild query string excluding _sbpath
        const queryParams = { ...query }
        delete queryParams._sbpath
        const forwardQuery = new URLSearchParams(queryParams).toString()

        const targetUrl = `${SUPABASE_URL}${supabasePath}${forwardQuery ? '?' + forwardQuery : ''}`

        console.log(`[supabase-proxy] ${req.method} ${supabasePath}`)

        // Build forwarded headers
        const forwardHeaders: any = {}
        const headerNames = ['content-type', 'apikey', 'authorization', 'x-client-info', 'prefer', 'x-upsert']
        for (const name of headerNames) {
            if (req.headers[name]) {
                forwardHeaders[name] = req.headers[name]
            }
        }

        const fetchOptions: any = { method: req.method, headers: forwardHeaders }

        if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
        }

        const response = await fetch(targetUrl, fetchOptions)
        const responseBody = await response.text()

        if (allowedOrigin !== 'same-origin') {
            res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
            res.setHeader('Vary', 'Origin')
            res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
            res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
        }

        const ct = response.headers.get('content-type')
        if (ct) res.setHeader('Content-Type', ct)
        const wa = response.headers.get('www-authenticate')
        if (wa) res.setHeader('WWW-Authenticate', wa)

        return res.status(response.status).send(responseBody)

    } catch (error: any) {
        console.error('[supabase-proxy] Error:', error.message)
        return res.status(502).json({ error: 'Proxy error', message: error.message })
    }
}
