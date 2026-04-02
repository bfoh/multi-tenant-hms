import { supabaseAdmin, resolveTenant } from './_utils'
import { sendEmailForTenant, sendSmsForTenant } from './_send-helpers'
import PDFDocument from 'pdfkit'
import { Buffer } from 'node:buffer'

const EMAIL_STYLES = {
    body: 'margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #2C2416; background-color: #f4f4f4;',
    container: 'max-width: 600px; margin: 0 auto; background-color: #ffffff;',
    header: 'background-color: #8B4513; padding: 40px 20px; text-align: center;',
    logo: 'height: 60px; width: auto; max-width: 200px; margin-bottom: 20px;',
    headerTitle: 'color: #ffffff; font-size: 28px; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 1px; font-family: Arial, sans-serif;',
    headerSubtitle: 'color: rgba(255,255,255,0.9); font-size: 16px; margin: 10px 0 0 0; font-weight: 400;',
    content: 'padding: 40px 30px;',
    contentTitle: 'color: #2C2416; font-size: 24px; margin-bottom: 25px; text-align: center; border-bottom: 2px solid #F5F1E8; padding-bottom: 15px;',
    footer: 'background-color: #F5F1E8; padding: 30px 20px; text-align: center; font-size: 12px; color: #666666; border-top: 1px solid #E5E1D8;',
    infoBox: 'background-color: #F5F1E8; border-left: 4px solid #8B4513; padding: 20px; margin: 20px 0; border-radius: 4px;',
    infoRow: 'margin-bottom: 8px;',
    infoLabel: 'font-weight: 600; color: #2C2416; display: inline-block; width: 120px;'
};

function generateEmailHtml({ tenant, title, content }: any) {
    const year = new Date().getFullYear();
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="${EMAIL_STYLES.body}">
  <div style="${EMAIL_STYLES.container}">
    <div style="${EMAIL_STYLES.header}">
      <img src="${tenant.logo_url || 'https://tenantdomain.com/logo.png'}" alt="${tenant.name}" style="${EMAIL_STYLES.logo}" />
      <h1 style="${EMAIL_STYLES.headerTitle}">${tenant.name}</h1>
      <p style="${EMAIL_STYLES.headerSubtitle}">Premium Hospitality Experience</p>
    </div>
    <div style="${EMAIL_STYLES.content}">
      <h2 style="${EMAIL_STYLES.contentTitle}">${title}</h2>
      <div style="font-size: 16px; line-height: 1.6; color: #2C2416;">
        ${content}
      </div>
    </div>
    <div style="${EMAIL_STYLES.footer}">
      <p style="margin: 0 0 10px 0;">&copy; ${year} ${tenant.name} Management System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

async function generatePreInvoicePdfBuffer(tenant: any, bookingContext: any) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers: any[] = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers).toString('base64')));
            doc.on('error', reject);

            doc.fontSize(20).font('Helvetica-Bold').fillColor('#8B4513').text(tenant.name, { align: 'left' });
            doc.fontSize(10).font('Helvetica').fillColor('#666666').text(tenant.address || '', { align: 'left' });
            doc.text(`Phone: ${tenant.phone || ''}`, { align: 'left' });
            doc.text(`Email: ${tenant.email || ''}`, { align: 'left' });
            doc.moveDown();

            doc.fontSize(24).font('Helvetica-Bold').fillColor('#f59e0b').text('PRE-INVOICE', { align: 'right', valign: 'top' });
            doc.fontSize(10).font('Helvetica').fillColor('#666666').text(`Date: ${new Date().toLocaleDateString()}`, { align: 'right' });
            doc.text('Status: UNPAID', { align: 'right' });
            doc.moveDown(2);

            doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#8B4513').lineWidth(1).stroke();
            doc.moveDown();

            doc.fontSize(12).font('Helvetica-Bold').fillColor('#8B4513').text('Bill To:', { align: 'left' });
            doc.fontSize(10).font('Helvetica').fillColor('#333333');
            doc.text(bookingContext.guestName);
            if (bookingContext.guestPhone) doc.text(bookingContext.guestPhone);
            if (bookingContext.guestEmail) doc.text(bookingContext.guestEmail);
            doc.moveDown();

            doc.fontSize(12).font('Helvetica-Bold').fillColor('#8B4513').text('Booking Details:', { align: 'left' });
            doc.fontSize(10).font('Helvetica').fillColor('#333333');
            doc.text(`Room: ${bookingContext.roomNumber}`);
            doc.text(`Check-in: ${bookingContext.checkIn}`);
            doc.text(`Check-out: ${bookingContext.checkOut}`);
            doc.text(`Nights: ${bookingContext.nights}`);
            doc.moveDown(2);

            const tableTop = doc.y;
            doc.rect(50, tableTop, 500, 20).fillColor('#8B4513').fill();
            doc.fillColor('white').font('Helvetica-Bold').text('Description', 60, tableTop + 5);
            doc.text('Amount', 450, tableTop + 5, { align: 'right', width: 90 });

            const rowTop = tableTop + 25;
            doc.fillColor('black').font('Helvetica').text(`Room Charges (${bookingContext.nights} nights)`, 60, rowTop);
            doc.text(`${tenant.currency || 'GHS'} ${bookingContext.totalPrice}`, 450, rowTop, { align: 'right', width: 90 });

            const totalTop = rowTop + 40;
            doc.moveTo(350, totalTop).lineTo(550, totalTop).strokeColor('#e5e7eb').stroke();
            doc.fontSize(12).font('Helvetica-Bold').fillColor('#8B4513').text('Total Due:', 350, totalTop + 10);
            doc.text(`${tenant.currency || 'GHS'} ${bookingContext.totalPrice}`, 450, totalTop + 10, { align: 'right', width: 90 });

            doc.moveDown(4);
            doc.rect(50, doc.y, 500, 60).fillColor('#fef3c7').strokeColor('#f59e0b').fillAndStroke();
            doc.fillColor('#92400e').font('Helvetica-Bold').text('Payment Information', 60, doc.y - 45);
            doc.font('Helvetica').text('Full payment is due upon check-in. We accept Cash, Mobile Money, and Bank Transfers.', 60, doc.y + 5, { width: 480 });

            doc.end();
        } catch (e) { reject(e); }
    });
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const tenant = await resolveTenant(req);
        if (!tenant) return res.status(401).json({ error: 'Unauthorized' });

        const { checkIn, checkOut, roomTypeId, guestName, guestEmail, guestPhone } = req.body;
        if (!checkIn || !checkOut || !roomTypeId || !guestName || !guestEmail) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const checkInDate = new Date(checkIn);
        const checkOutDate = new Date(checkOut);
        if (checkInDate < today || checkOutDate <= checkInDate) {
            return res.status(400).json({ error: 'Invalid dates' });
        }

        // 1. Find or Create Guest (Tenant Scoped)
        let { data: existingGuest } = await supabaseAdmin
            .from('guests')
            .select('id')
            .eq('email', guestEmail)
            .eq('tenant_id', tenant.id)
            .single();

        let guestId = existingGuest?.id;
        if (!guestId) {
            const { data: newGuest, error: gErr } = await supabaseAdmin
                .from('guests')
                .insert({ name: guestName, email: guestEmail, phone: guestPhone, tenant_id: tenant.id })
                .select('id').single();
            if (gErr) throw gErr;
            guestId = newGuest.id;
        }

        // 2. Find Available Room (Tenant Scoped)
        const { data: roomsOfType, error: rErr } = await supabaseAdmin
            .from('rooms')
            .select('id, room_number, price, room_types(base_price)')
            .eq('room_type_id', roomTypeId)
            .eq('tenant_id', tenant.id)
            .in('status', ['clean', 'available']);

        if (rErr) throw rErr;
        if (!roomsOfType || roomsOfType.length === 0) return res.status(404).json({ error: 'No rooms available' });

        const candidateIds = roomsOfType.map(r => r.id);
        const { data: busy } = await supabaseAdmin
            .from('bookings')
            .select('room_id')
            .in('room_id', candidateIds)
            .neq('status', 'cancelled')
            .lt('check_in', checkOut)
            .gt('check_out', checkIn);

        const busyIds = new Set(busy?.map(b => b.room_id) || []);
        const availableRoom = roomsOfType.find(r => !busyIds.has(r.id));
        if (!availableRoom) return res.status(409).json({ error: 'No availability' });

        // 3. Create Booking
        const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));
        const pricePerNight = (availableRoom.room_types as any)?.base_price || 0;
        const totalPrice = pricePerNight * nights;

        const { data: booking, error: bErr } = await supabaseAdmin
            .from('bookings')
            .insert({
                guest_id: guestId,
                room_id: availableRoom.id,
                tenant_id: tenant.id,
                check_in: checkIn,
                check_out: checkOut,
                status: 'confirmed',
                total_price: totalPrice,
                source: 'voice_agent',
                created_at: new Date().toISOString()
            })
            .select().single();

        if (bErr) throw bErr;

        // 4. Notifications — call helpers directly to avoid losing tenant context across HTTP
        const promises = [];

        if (guestPhone) {
            promises.push(
                sendSmsForTenant(tenant, guestPhone, `Confirmed: ${tenant.name} Room ${availableRoom.room_number}`)
                    .catch((e: any) => console.error('[create-booking] SMS failed:', e.message))
            );
        }

        if (guestEmail) {
            const pdf = await generatePreInvoicePdfBuffer(tenant, { guestName, guestPhone, guestEmail, roomNumber: availableRoom.room_number, checkIn, checkOut, nights, totalPrice });
            const html = generateEmailHtml({ tenant, title: 'Booking Confirmed', content: `<p>Reservation for Room ${availableRoom.room_number} is confirmed.</p>` });
            promises.push(
                sendEmailForTenant(tenant, {
                    to: guestEmail,
                    subject: 'Booking Confirmation',
                    html,
                    attachments: [{ filename: 'Invoice.pdf', content: pdf as string, contentType: 'application/pdf' }]
                }).catch((e: any) => console.error('[create-booking] Email failed:', e.message))
            );
        }

        await Promise.all(promises);

        return res.status(200).json({ success: true, data: { bookingId: booking.id, roomNumber: availableRoom.room_number, totalPrice } });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
}
