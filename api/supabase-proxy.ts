const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''

const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
const ALLOWED_HEADERS = 'authorization, x-client-info, apikey, content-type, prefer, x-upsert'

export default async function handler(req: any, res: any) {
    try {
        const origin = req.headers['origin'] || ''

        // CORS preflight
        if (req.method === 'OPTIONS') {
            if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
            res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS)
            res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS)
            res.setHeader('Vary', 'Origin')
            return res.status(204).end()
        }

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
        const forwardHeaders: Record<string, string> = {}
        const passthroughHeaders = ['content-type', 'apikey', 'authorization', 'x-client-info', 'prefer', 'x-upsert']
        for (const name of passthroughHeaders) {
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

        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin)
            res.setHeader('Vary', 'Origin')
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
