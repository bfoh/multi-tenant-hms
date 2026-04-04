import { useState, useRef } from "react"
import { QRCodeCanvas } from "qrcode.react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Printer, Mail, MessageSquare, Download, Share2, Loader2 } from "lucide-react"

export function QRCodeGenerator() {
    console.log('[QRCodeGenerator] BUILD_SIGNATURE: PREMIUM_MARKETING_V1_20260404')
    const [url, setUrl] = useState("https://www.amplodge.org")
    const [size, setSize] = useState(300)
    const qrRef = useRef<HTMLDivElement>(null)

    // Email State
    const [emailOpen, setEmailOpen] = useState(false)
    const [emailTo, setEmailTo] = useState("")
    const [emailSubject, setEmailSubject] = useState("AMP Lodge QR Code")
    const [emailSending, setEmailSending] = useState(false)

    // SMS State
    const [smsOpen, setSmsOpen] = useState(false)
    const [smsTo, setSmsTo] = useState("")
    const [smsSending, setSmsSending] = useState(false)

    const handlePrint = () => {
        const printWindow = window.open('', '', 'height=600,width=800');
        if (!printWindow) return;

        const canvas = qrRef.current?.querySelector('canvas');
        if (!canvas) return;
        const dataUrl = canvas.toDataURL();

        printWindow.document.write('<html><head><title>Print QR Code</title>');
        printWindow.document.write('</head><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;background-color:#FDFDFD;">');
        printWindow.document.write(`<div style="padding:40px; background:white; border-radius:40px; border:1px solid #E5E5E5; box-shadow: 0 20px 40px rgba(0,0,0,0.05); text-align:center;">`);
        printWindow.document.write(`<img src="${dataUrl}" style="width: 400px; max-width: 100%; border-radius: 20px;" />`);
        printWindow.document.write(`<h1 style="font-family:sans-serif;margin-top:30px;font-size:32px;color:#2D2D2D;font-weight:900;letter-spacing:-0.02em;">AMP LODGE</h1>`);
        printWindow.document.write(`<p style="font-family:sans-serif;margin-top:10px;font-size:20px;color:#8B5E3C;font-weight:bold;">${url}</p>`);
        printWindow.document.write(`</div>`);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
        }, 500);
    }

    const handleDownload = () => {
        const canvas = qrRef.current?.querySelector('canvas');
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'amplodge-qr.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    const handleSendEmail = async () => {
        if (!emailTo) return toast.error("Please enter an email address");
        setEmailSending(true);
        try {
            const canvas = qrRef.current?.querySelector('canvas');
            if (!canvas) throw new Error("Could not generate QR code image");
            const dataUrl = canvas.toDataURL('image/png');
            const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: emailTo,
                    subject: emailSubject,
                    html: `
                        <div style="font-family:sans-serif; text-align:center; padding: 40px; background-color: #FDFDFD;">
                            <h2 style="color: #8B5E3C;">Your AMP Lodge QR Code</h2>
                            <p style="color: #666;">Scan this code to visit our digital portal.</p>
                            <div style="margin: 30px auto; display: inline-block; padding: 20px; background: white; border-radius: 20px; border: 1px solid #E5E5E5;">
                                <img src="${dataUrl}" style="width: 250px;" />
                            </div>
                            <p style="margin-top: 20px;">Or visit: <a href="${url}" style="color: #8B5E3C; font-weight: bold;">${url}</a></p>
                        </div>
                    `,
                    attachments: [
                        {
                            filename: 'amplodge-qr.png',
                            content: dataUrl,
                            contentType: 'image/png'
                        }
                    ]
                })
            });

            const data = await response.json();
            if (response.ok && data.success) {
                toast.success("Email sent successfully!");
                setEmailOpen(false);
                setEmailTo("");
            } else {
                throw new Error(data.error || "Failed to send email");
            }
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setEmailSending(false);
        }
    }

    const handleSendSMS = async () => {
        if (!smsTo) return toast.error("Please enter a phone number");
        setSmsSending(true);
        try {
            const response = await fetch('/api/send-sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: smsTo,
                    message: `Visit AMP Lodge website here: ${url}`
                })
            });
            const data = await response.json();
            if (response.ok && data.success) {
                toast.success("SMS sent successfully!");
                setSmsOpen(false);
                setSmsTo("");
            } else {
                throw new Error(data.error || "Failed to send SMS");
            }
        } catch (err: any) {
            toast.error(err.message);
        } finally {
            setSmsSending(false);
        }
    }

    return (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start animate-in zoom-in-95 duration-500">
            <Card className="xl:col-span-5 rounded-[32px] border-[#E5E5E5] shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-100 p-8">
                    <CardTitle className="text-2xl font-bold text-[#2D2D2D]">QR Configuration</CardTitle>
                    <CardDescription className="text-base">Point your guests exactly where they need to go.</CardDescription>
                </CardHeader>
                <CardContent className="p-8 space-y-6">
                    <div className="space-y-2">
                        <Label className="text-[#2D2D2D] font-semibold">Target Redirect URL</Label>
                        <Input
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            className="h-14 rounded-2xl border-[#E5E5E5] focus-visible:ring-[#8B5E3C] text-lg font-medium"
                            placeholder="https://www.amplodge.org/guest/..."
                        />
                    </div>
                </CardContent>
                <CardFooter className="bg-[#FDFDFD] p-8 border-t border-slate-100 flex-col gap-4 items-start">
                    <div className="flex gap-4 p-4 rounded-2xl bg-orange-50 text-orange-800 text-sm">
                        <Share2 className="w-5 h-5 flex-shrink-0" />
                        <p className="leading-relaxed">
                            This QR code is dynamically updated. You can print it for your reception desk 
                            or send it directly to arriving guests.
                        </p>
                    </div>
                </CardFooter>
            </Card>

            <Card className="xl:col-span-7 flex flex-col items-center justify-center p-12 bg-white rounded-[40px] border border-[#E5E5E5] shadow-xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-[radial-gradient(#8B5E3C_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.03]" />
                
                <div ref={qrRef} className="relative z-10 bg-white p-8 rounded-[48px] shadow-2xl border border-slate-100 transition-all duration-500 group-hover:scale-105 group-hover:rotate-1">
                    <QRCodeCanvas
                        value={url}
                        size={size}
                        level={"H"}
                        includeMargin={true}
                    />
                </div>

                <div className="relative z-10 mt-12 flex flex-wrap gap-4 justify-center">
                    <Button onClick={handlePrint} variant="outline" className="h-14 px-8 rounded-2xl border-[#E5E5E5] hover:bg-[#F5F5F5] gap-3 font-semibold transition-all">
                        <Printer className="w-5 h-5 text-[#8B5E3C]" />
                        Print Poster
                    </Button>
                    <Button onClick={handleDownload} variant="outline" className="h-14 px-8 rounded-2xl border-[#E5E5E5] hover:bg-[#F5F5F5] gap-3 font-semibold transition-all">
                        <Download className="w-5 h-5 text-[#8B5E3C]" />
                        Save Image
                    </Button>

                    <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
                        <DialogTrigger asChild>
                            <Button className="h-14 px-8 rounded-2xl bg-[#8B5E3C] hover:bg-[#704930] gap-3 font-bold shadow-lg shadow-[#8B5E3C]/20 transition-all">
                                <Mail className="w-5 h-5" />
                                Send to Guest
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:rounded-[32px] p-8 border-none shadow-2xl">
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                                    <Mail className="w-6 h-6 text-[#8B5E3C]" />
                                    Send via Email
                                </DialogTitle>
                                <DialogDescription className="text-base pt-1">
                                    The QR code will be attached as a high-quality PNG.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-5 py-6">
                                <div className="space-y-2">
                                    <Label className="font-semibold">Recipient Email</Label>
                                    <Input
                                        type="email"
                                        placeholder="guest@example.com"
                                        value={emailTo}
                                        onChange={(e) => setEmailTo(e.target.value)}
                                        className="h-12 rounded-xl focus-visible:ring-[#8B5E3C]"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="font-semibold">Subject</Label>
                                    <Input
                                        value={emailSubject}
                                        onChange={(e) => setEmailSubject(e.target.value)}
                                        className="h-12 rounded-xl focus-visible:ring-[#8B5E3C]"
                                    />
                                </div>
                            </div>
                            <DialogFooter className="gap-3">
                                <Button variant="ghost" onClick={() => setEmailOpen(false)}>Cancel</Button>
                                <Button onClick={handleSendEmail} disabled={emailSending || !emailTo} className="bg-[#8B5E3C] hover:bg-[#704930] h-12 px-8 rounded-xl font-bold text-white">
                                    {emailSending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Dispatch Email"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </Card>
        </div>
    )
}
