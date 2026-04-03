import { blink } from './src/blink/client'
async function run() {
  const db = blink.db as any
  const bookings = await db.bookings.list({ limit: 5 })
  console.log('Bookings in DB:', JSON.stringify(bookings, null, 2))
}
run()
