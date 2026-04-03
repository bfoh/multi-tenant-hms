import { supabaseAdmin } from './_utils'

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const { userId } = req.body

        if (!userId) return res.status(400).json({ error: 'userId is required' })

        const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)

        if (error) {
            console.error('[delete-employee] Auth error:', error)
            return res.status(400).json({ error: error.message })
        }

        return res.status(200).json({ success: true })

    } catch (err: any) {
        console.error('[delete-employee] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
