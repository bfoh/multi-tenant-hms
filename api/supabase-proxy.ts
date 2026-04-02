const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || ''

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer, x-upsert',
}

export default async function handler(req: any, res: any) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type, prefer, x-upsert')
        return res.status(204).end()
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

        const fetchOptions: any = {
            method: req.method,
            headers: forwardHeaders
        }

        if (req.body && req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
        }

        const response = await fetch(targetUrl, fetchOptions)
        const responseBody = await response.text()

        // Set response headers
        Object.entries(CORS_HEADERS).forEach(([k, v]) => res.setHeader(k, v))

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
