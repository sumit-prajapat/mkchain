import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Server-side Supabase with service role key (bypasses RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      planId,
      userId,
    } = await request.json()

    // ── 1. Verify Razorpay signature ─────────────────────────
    const body = razorpay_order_id + '|' + razorpay_payment_id
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest('hex')

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 400 })
    }

    // ── 2. Update plan in Supabase profiles ──────────────────
    const { error } = await supabase
      .from('profiles')
      .update({
        plan_id: planId,
        subscription_status: 'active',
        billing_cycle_start: new Date().toISOString(),
        api_calls_used: 0,   // reset usage on upgrade
      })
      .eq('id', userId)

    if (error) {
      console.error('Supabase update error:', error)
      return NextResponse.json({ success: false, error: 'Failed to update plan' }, { status: 500 })
    }

    // ── 3. Write audit log ───────────────────────────────────
    await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'plan_upgraded',
      metadata: {
        plan_id: planId,
        razorpay_payment_id,
        razorpay_order_id,
      },
    })

    return NextResponse.json({ success: true, planId })
  } catch (err: any) {
    console.error('Payment verify error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
