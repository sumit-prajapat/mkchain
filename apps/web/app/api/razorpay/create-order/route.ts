import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function POST(request: Request) {
  try {
    const { planId, amount } = await request.json()

    if (!planId || !amount) {
      return NextResponse.json({ error: 'Missing planId or amount' }, { status: 400 })
    }

    const order = await razorpay.orders.create({
      amount,           // in paise
      currency: 'INR',
      receipt: `mkchain_${planId}_${Date.now()}`,
      notes: { planId },
    })

    return NextResponse.json(order)
  } catch (err: any) {
    console.error('Razorpay order error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
