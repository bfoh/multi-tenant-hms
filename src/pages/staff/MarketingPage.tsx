import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Send, Users, CheckCircle, AlertCircle, Sparkles, Wand2, Megaphone, Search, Filter, Mail, MessageSquare, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { QRCodeGenerator } from "@/components/marketing/QRCodeGenerator"
import { cn } from "@/lib/utils"

type Template = {
    id: string
    name: string
    channel: 'sms' | 'email'
    subject?: string
    content: string
}

const DEFAULT_TEMPLATES: Template[] = [
    {
        id: '1',
        name: 'Holiday Special (Email)',
        channel: 'email',
        subject: '🎁 Special Holiday Offer from AMP Lodge',
        content: `Dear {{name}},\n\nCelebrate the holidays at AMP Lodge! We're offering a special 20% discount on all bookings made before December 25th.\n\nUse code HOLIDAY20 at checkout.\n\nBook here: {{guest_link}}\n\nWarm regards,\nAMP Lodge Team`
    },
    {
        id: '2',
        name: 'Holiday Special (SMS)',
        channel: 'sms',
        content: `Celebrate the holidays at AMP Lodge! Use code HOLIDAY20 for 20% off your next stay. Book now: {{guest_link}}`
    },
    {
        id: '3',
        name: 'Seasonal Discount (Email)',
        channel: 'email',
        subject: '🍂 Fall escapes at AMP Lodge',
        content: `Hi {{name}},\n\nThe leaves are changing and so are our rates! Enjoy a peaceful fall getaway with 15% off regular prices.\n\nNo code needed. Your link: {{guest_link}}`
    },
    {
        id: '4',
        name: 'Seasonal Discount (SMS)',
        channel: 'sms',
        content: `Special Offer from AMP Lodge! Use code SEASON15 for 15% off your fall stay. See more: {{guest_link}}`
    },
    {
        id: '5',
        name: 'Weekend Getaway (SMS)',
        channel: 'sms',
        content: `Need a break this weekend? Escaping to AMP Lodge is easier than ever with our last-minute weekend rates. Book your restful stay here: {{guest_link}}`
    },
    {
        id: '6',
        name: 'Welcome Back (Email)',
        channel: 'email',
        subject: 'We miss you at AMP Lodge!',
        content: `<div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; line-height: 1.6;">\n  <h1 style="color: #8B5E3C;">Welcome Back to Serenity</h1>\n  <p>Hi {{name}},</p>\n  <p>Long time no see! We miss having you at AMP Lodge. We noticed it's been a while since your last visit, and we'd love to welcome you back.</p>\n  <div style="background-color: #FDFDFD; padding: 20px; border-radius: 10px; border: 1px solid #E5E5E5; margin: 20px 0;">\n    <p style="margin: 0;">Special loyalty discount: <strong>10% OFF</strong> your next stay when you book through this link.</p>\n  </div>\n  <p><a href="{{guest_link}}" style="background-color: #8B5E3C; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Book Your Return Stay</a></p>\n  <p>Warm regards,<br>The AMP Lodge Team</p>\n</div>`
    },
    {
        id: '7',
        name: 'Welcome Back (SMS)',
        channel: 'sms',
        content: `Long time no see! We miss having you at AMP Lodge. Treat yourself to a well-deserved break in our serene environment. Welcome back with 10% off: {{guest_link}}`
    }
]

export default function MarketingPage() {
    const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES)
    const [loading, setLoading] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null)
    const [activeFilter, setActiveFilter] = useState<'all' | 'sms' | 'email'>('all')

    // AI State
    const [aiPrompt, setAiPrompt] = useState("")
    const [generating, setGenerating] = useState(false)

    // Editor State
    const [editContent, setEditContent] = useState("")
    const [editSubject, setEditSubject] = useState("")

    // Sending State
    const [sending, setSending] = useState(false)
    const [recipientCount, setRecipientCount] = useState<number | null>(null)

    useEffect(() => {
        fetchTemplates()
    }, [])

    const fetchTemplates = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('marketing_templates')
                .select('*')
                .order('name')

            if (error) {
                console.warn('Database table missing or error, using defaults', error.message)
                return // Stay with defaults
            }
            if (data && data.length > 0) {
                setTemplates(data)
            }
        } catch (err) {
            console.error('Error loading templates:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleSelectTemplate = (template: Template) => {
        setSelectedTemplate(template)
        setEditContent(template.content)
        setEditSubject(template.subject || "")
        setRecipientCount(null)
    }

    const handleDryRun = async () => {
        if (!selectedTemplate) return
        setSending(true)
        try {
            const response = await fetch('/api/trigger-campaign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: selectedTemplate.channel,
                    content: editContent,
                    subject: editSubject,
                    dryRun: true
                })
            })
            const data = await response.json()
            if (response.ok) {
                setRecipientCount(data.recipientCount)
            } else {
                throw new Error(data.error)
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to estimate recipients")
        } finally {
            setSending(false)
        }
    }

    const handleSendCampaign = async () => {
        if (!selectedTemplate) return
        setSending(true)
        try {
            const response = await fetch('/api/trigger-campaign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: selectedTemplate.channel,
                    content: editContent,
                    subject: editSubject,
                    dryRun: false
                })
            })
            const data = await response.json()
            if (response.ok) {
                toast.success("Campaign sent successfully!")
                setSelectedTemplate(null)
            } else {
                throw new Error(data.error)
            }
        } catch (err: any) {
            toast.error(err.message || "Failed to send campaign")
        } finally {
            setSending(false)
        }
    }

    const handleGenerateAI = async () => {
        if (!selectedTemplate || !aiPrompt.trim()) return
        setGenerating(true)
        try {
            const response = await fetch('/api/generate-marketing-copy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentContent: editContent,
                    userPrompt: aiPrompt,
                    channel: selectedTemplate.channel
                })
            })
            const data = await response.json()
            if (response.ok) {
                setEditContent(data.generatedText)
                setAiPrompt("")
                toast.success("AI updated your message!")
            } else {
                throw new Error(data.error)
            }
        } catch (err: any) {
            toast.error("AI Assistant: " + err.message)
        } finally {
            setGenerating(false)
        }
    }

    const filteredTemplates = templates.filter(t => 
        activeFilter === 'all' || t.channel === activeFilter
    )

    return (
        <div className="min-h-full space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-[#8B5E3C]/10 text-[#8B5E3C]">
                        <Megaphone className="w-6 h-6" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#2D2D2D]">Marketing Center</h1>
                </div>
                <p className="text-[#666] ml-11">Manage your marketing campaigns and tools.</p>
            </div>

            <Tabs defaultValue="campaigns" className="w-full">
                <TabsList className="bg-transparent h-auto p-0 border-b w-full justify-start rounded-none space-x-8 mb-8">
                    <TabsTrigger 
                        value="campaigns" 
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#8B5E3C] data-[state=active]:text-[#8B5E3C] rounded-none px-0 py-3 text-base font-medium transition-all"
                    >
                        Campaigns & Templates
                    </TabsTrigger>
                    <TabsTrigger 
                        value="qrcode" 
                        className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-[#8B5E3C] data-[state=active]:text-[#8B5E3C] rounded-none px-0 py-3 text-base font-medium transition-all"
                    >
                        QR Code Generator
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="campaigns" className="mt-0 outline-none">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                        {/* Sidebar */}
                        <div className="lg:col-span-4 space-y-6">
                            <div className="space-y-4">
                                <h3 className="text-xl font-semibold text-[#2D2D2D]">Templates</h3>
                                
                                {/* Pill Filters */}
                                <div className="flex gap-2 p-1.5 bg-[#F5F5F5] rounded-xl w-fit">
                                    {(['all', 'sms', 'email'] as const).map((filter) => (
                                        <button
                                            key={filter}
                                            onClick={() => setActiveFilter(filter)}
                                            className={cn(
                                                "px-6 py-2 rounded-lg text-sm font-medium transition-all capitalize",
                                                activeFilter === filter 
                                                    ? "bg-white text-[#2D2D2D] shadow-sm" 
                                                    : "text-[#666] hover:text-[#2D2D2D]"
                                            )}
                                        >
                                            {filter}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3">
                                {filteredTemplates.length > 0 ? (
                                    filteredTemplates.map(t => (
                                        <div
                                            key={t.id}
                                            onClick={() => handleSelectTemplate(t)}
                                            className={cn(
                                                "group relative p-5 rounded-2xl border transition-all cursor-pointer",
                                                selectedTemplate?.id === t.id
                                                    ? "border-[#8B5E3C] bg-white shadow-md ring-1 ring-[#8B5E3C]/20"
                                                    : "border-[#E5E5E5] bg-white hover:border-[#8B5E3C]/30 hover:shadow-sm"
                                            )}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-semibold text-[#2D2D2D] group-hover:text-[#8B5E3C] transition-colors">{t.name}</h4>
                                                <span className={cn(
                                                    "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider",
                                                    t.channel === 'email' ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                                                )}>
                                                    {t.channel}
                                                </span>
                                            </div>
                                            <p className="text-sm text-[#666] line-clamp-2 leading-relaxed italic">
                                                {t.content.length > 80 ? t.content.slice(0, 80) + '...' : t.content}
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <div className="p-8 text-center border-2 border-dashed rounded-2xl border-slate-200">
                                        <p className="text-slate-400">No templates found.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Editor/Preview */}
                        <div className="lg:col-span-8 bg-white rounded-3xl border border-[#E5E5E5] min-h-[600px] flex flex-col shadow-sm">
                            {selectedTemplate ? (
                                <>
                                    <div className="p-8 border-b border-[#F0F0F0]">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="text-2xl font-bold text-[#2D2D2D]">Edit Campaign</h3>
                                            <div className="flex items-center gap-2 px-3 py-1 bg-[#F5F5F5] rounded-full">
                                                {selectedTemplate.channel === 'email' ? <Mail className="w-4 h-4 text-purple-600" /> : <MessageSquare className="w-4 h-4 text-blue-600" />}
                                                <span className="text-xs font-bold uppercase tracking-widest text-[#666]">{selectedTemplate.channel}</span>
                                            </div>
                                        </div>
                                        
                                        <p className="text-sm text-[#888] mb-8 leading-relaxed">
                                            Personalize your message before dispatching. Use placeholders 
                                            <code className="mx-1 px-1.5 py-0.5 bg-[#F5F5F5] rounded text-[#8B5E3C] font-mono">{`{{name}}`}</code> 
                                            and 
                                            <code className="mx-1 px-1.5 py-0.5 bg-[#F5F5F5] rounded text-[#8B5E3C] font-mono">{`{{guest_link}}`}</code> 
                                            for dynamic content.
                                        </p>

                                        <div className="space-y-6">
                                            {selectedTemplate.channel === 'email' && (
                                                <div className="space-y-2">
                                                    <Label className="text-[#2D2D2D] font-semibold">Email Subject</Label>
                                                    <Input 
                                                        value={editSubject}
                                                        onChange={e => setEditSubject(e.target.value)}
                                                        className="h-12 rounded-xl border-[#E5E5E5] focus-visible:ring-[#8B5E3C]"
                                                        placeholder="Write a compelling subject..."
                                                    />
                                                </div>
                                            )}

                                            <div className="space-y-2">
                                                <Label className="text-[#2D2D2D] font-semibold">Message Body</Label>
                                                <Textarea 
                                                    value={editContent}
                                                    onChange={e => setEditContent(e.target.value)}
                                                    className={cn(
                                                        "rounded-2xl border-[#E5E5E5] focus-visible:ring-[#8B5E3C] resize-none leading-relaxed",
                                                        selectedTemplate.channel === 'email' ? "min-h-[300px]" : "min-h-[180px]"
                                                    )}
                                                    placeholder="Type your campaign message here..."
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* AI Section */}
                                    <div className="p-8 bg-slate-50 border-b border-[#F0F0F0]">
                                        <div className="max-w-2xl mx-auto space-y-4">
                                            <div className="flex items-center gap-2 text-[#8B5E3C]">
                                                <Wand2 className="w-5 h-5" />
                                                <span className="font-bold tracking-tight">AI Content Assistant</span>
                                            </div>
                                            <div className="flex gap-3">
                                                <Input 
                                                    value={aiPrompt}
                                                    onChange={e => setAiPrompt(e.target.value)}
                                                    placeholder="e.g., 'Make it sound more urgent' or 'Professional tone'"
                                                    className="h-12 rounded-xl bg-white border-[#E5E5E5] focus-visible:ring-[#8B5E3C]"
                                                    onKeyDown={e => e.key === 'Enter' && handleGenerateAI()}
                                                />
                                                <Button 
                                                    onClick={handleGenerateAI}
                                                    disabled={generating || !aiPrompt.trim()}
                                                    className="h-12 px-6 rounded-xl bg-[#8B5E3C] hover:bg-[#704930] shadow-lg shadow-[#8B5E3C]/20 transition-all font-semibold"
                                                >
                                                    {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Generate"}
                                                </Button>
                                            </div>
                                            <p className="text-[11px] text-[#999] italic">
                                                Gemini will rewrite your message based on your prompt above.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-auto p-8 flex justify-between items-center bg-[#FDFDFD] rounded-b-3xl">
                                        <Button 
                                            variant="ghost" 
                                            onClick={() => setSelectedTemplate(null)}
                                            className="text-[#666] hover:bg-[#F5F5F5]"
                                        >
                                            Discard Changes
                                        </Button>

                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button 
                                                    onClick={handleDryRun}
                                                    disabled={sending}
                                                    className="bg-zinc-900 hover:bg-black text-white px-8 py-6 rounded-2xl h-auto font-bold text-lg shadow-xl shadow-zinc-200 transition-all hover:-translate-y-0.5 active:translate-y-0"
                                                >
                                                    Review & Send
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="max-w-2xl sm:rounded-[32px] p-8 border-none shadow-2xl">
                                                <DialogHeader className="mb-6">
                                                    <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                                                        <CheckCircle className="w-6 h-6 text-green-500" />
                                                        Campaign Summary
                                                    </DialogTitle>
                                                    <DialogDescription className="text-base pt-2">
                                                        This campaign will be delivered to 
                                                        <span className="font-bold text-[#2D2D2D] bg-[#F5F5F5] px-2 py-0.5 rounded mx-1">
                                                            {recipientCount ?? '...'} guests
                                                        </span> 
                                                        on the {selectedTemplate.channel.toUpperCase()} channel.
                                                    </DialogDescription>
                                                </DialogHeader>

                                                <div className="space-y-6">
                                                    <div className="p-6 rounded-2xl bg-slate-50 border border-slate-100 relative overflow-hidden">
                                                        <div className="absolute top-0 left-0 w-1 h-full bg-[#8B5E3C]" />
                                                        <p className="text-xs font-bold uppercase tracking-widest text-[#999] mb-3">Live Preview</p>
                                                        {selectedTemplate.channel === 'email' && (
                                                            <div className="mb-4">
                                                                <p className="text-sm font-bold text-[#2D2D2D]">Subject: {editSubject}</p>
                                                            </div>
                                                        )}
                                                        <div className="whitespace-pre-wrap text-[#2D2D2D] leading-relaxed font-serif text-lg">
                                                            {editContent.replace("{{name}}", "John Doe").replace("{{guest_link}}", "https://amplodge.org/...")}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 p-4 rounded-xl bg-orange-50 text-orange-800 text-sm">
                                                        <AlertCircle className="w-5 h-5 flex-shrink-0" />
                                                        <p>Once you click send, messages will be queued for immediate delivery.</p>
                                                    </div>
                                                </div>

                                                <DialogFooter className="mt-8 gap-3 sm:justify-end">
                                                    <Button variant="outline" className="rounded-xl h-12" onClick={() => setRecipientCount(null)}>
                                                        Back to Edit
                                                    </Button>
                                                    <Button 
                                                        onClick={handleSendCampaign} 
                                                        disabled={sending || recipientCount === 0} 
                                                        className="bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 px-8 font-bold"
                                                    >
                                                        {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm & Launch"}
                                                    </Button>
                                                </DialogFooter>
                                            </DialogContent>
                                        </Dialog>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center group">
                                    <div className="w-24 h-24 rounded-full bg-[#F9F9F9] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                                        <Sparkles className="w-10 h-10 text-slate-200" />
                                    </div>
                                    <h3 className="text-xl font-bold text-[#2D2D2D] mb-2">Select a template</h3>
                                    <p className="text-[#999] max-w-xs">
                                        Choose a template from the left to start building your marketing campaign.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </TabsContent>

                <TabsContent value="qrcode" className="mt-0 outline-none">
                    <QRCodeGenerator />
                </TabsContent>
            </Tabs>
        </div >
    )
}
