export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const { currentContent, userPrompt, channel } = req.body

        if (!userPrompt) {
            return res.status(400).json({ error: 'userPrompt is required' })
        }

        const anthropicApiKey = process.env.ANTHROPIC_API_KEY
        if (!anthropicApiKey) {
            return res.status(500).json({ error: 'AI service not configured (missing ANTHROPIC_API_KEY)' })
        }

        const systemPrompt = channel === 'sms'
            ? 'You are a hotel marketing copywriter. Write concise, engaging SMS messages under 160 characters. Return only the message text, no explanation.'
            : 'You are a hotel marketing copywriter. Write engaging email content in plain text. Return only the message body, no subject line, no explanation.'

        const userMessage = currentContent
            ? `Current content:\n${currentContent}\n\nInstruction: ${userPrompt}`
            : `Instruction: ${userPrompt}`

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': anthropicApiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 500,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }]
            })
        })

        if (!response.ok) {
            const err = await response.text()
            console.error('[generate-marketing-copy] Anthropic error:', err)
            return res.status(500).json({ error: 'AI generation failed' })
        }

        const data = await response.json()
        const generatedText = data.content?.[0]?.text || ''

        return res.status(200).json({ generatedText })

    } catch (err: any) {
        console.error('[generate-marketing-copy] Error:', err.message)
        return res.status(500).json({ error: err.message })
    }
}
