import fs from 'fs'
import path from 'path'

const NETLIFY_DIR = './netlify/functions'
const VERCEL_DIR = './api'

if (!fs.existsSync(VERCEL_DIR)) fs.mkdirSync(VERCEL_DIR)

const files = fs.readdirSync(NETLIFY_DIR).filter(f => f.endsWith('.js') && !['send-email.js', 'send-sms.js', 'create-booking.js', 'supabase-proxy.js', 'guest-login.js'].includes(f))

files.forEach(file => {
    const filePath = path.join(NETLIFY_DIR, file)
    let content = fs.readFileSync(filePath, 'utf8')

    // 1. Convert to ES Modules if needed (though project is already type: module)
    // 2. Change handler signature
    content = content.replace(/export const handler = async \(event, context\) => {/g, 'export default async function handler(req, res) {')
    content = content.replace(/exports.handler = async \(event\) => {/g, 'export default async function handler(req, res) {')

    // 3. Inject Tenant Resolution
    const injection = `
import { supabaseAdmin, resolveTenant } from './_utils'

export default async function handler(req, res) {
    const tenant = await resolveTenant(req)
    if (!tenant) return res.status(401).json({ error: 'Unauthorized' })
`
    // This is a naive replacement, manual check is still required
    if (!content.includes('import { resolveTenant }')) {
        content = content.replace(/export default async function handler\(req, res\) {/, injection)
    }

    // 4. Update Netlify-style responses to Vercel/Express-style
    content = content.replace(/return {[\s\S]*?statusCode: (\d+),[\s\S]*?body: JSON.stringify\(([\s\S]*?)\)[\s\S]*?};/g, (match, code, body) => {
        return `return res.status(${code}).json(${body})`
    })

    const newPath = path.join(VERCEL_DIR, file.replace('.js', '.ts'))
    fs.writeFileSync(newPath, content)
    console.log(`Converted: ${file} -> ${newPath}`)
})
