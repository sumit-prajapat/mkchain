'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Check, Zap, Building2, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

declare global {
  interface Window {
    Razorpay: any
  }
}

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    priceDisplay: '₹0',
    period: 'forever',
    description: 'For individual researchers and students',
    icon: Shield,
    color: 'text-accent',
    borderColor: 'border-border',
    features: [
      '100 analyses per month',
      '1 API key',
      'ETH, BTC, Polygon support',
      'Basic risk scoring',
      'Community support',
    ],
    missing: ['PDF reports', 'Real-time alerts', 'Team access'],
    cta: 'Get started free',
    highlight: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 99900, // paise (₹999)
    priceDisplay: '₹999',
    period: 'per month',
    description: 'For security professionals and analysts',
    icon: Zap,
    color: 'text-primary',
    borderColor: 'border-primary',
    features: [
      '1,000 analyses per month',
      '5 API keys',
      'All chains supported',
      'ML risk scoring (21 features)',
      'PDF forensics reports',
      'Real-time threat alerts',
      'Priority support',
    ],
    missing: ['Team access', 'Advanced OSINT'],
    cta: 'Upgrade to Pro',
    highlight: true,
  },
  {
    id: 'team',
    name: 'Team',
    price: 299900, // paise (₹2999)
    priceDisplay: '₹2,999',
    period: 'per month',
    description: 'For security teams and enterprises',
    icon: Building2,
    color: 'text-chart-4',
    borderColor: 'border-chart-4',
    features: [
      '10,000 analyses per month',
      '20 API keys',
      'All chains supported',
      'ML risk scoring (21 features)',
      'PDF forensics reports',
      'Real-time threat alerts',
      'Team seats (up to 10)',
      'Advanced OSINT database',
      'Dedicated support',
    ],
    missing: [],
    cta: 'Upgrade to Team',
    highlight: false,
  },
]

export default function PricingPage() {
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()

  async function loadRazorpay(): Promise<boolean> {
    return new Promise((resolve) => {
      if (window.Razorpay) { resolve(true); return }
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  async function handleUpgrade(plan: typeof PLANS[0]) {
    if (plan.id === 'free') return

    setLoading(plan.id)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth/login?redirectTo=/pricing'; return }

      const loaded = await loadRazorpay()
      if (!loaded) { alert('Failed to load payment gateway. Please try again.'); setLoading(null); return }

      // Create order on backend
      const res = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, amount: plan.price }),
      })

      const order = await res.json()
      if (!order.id) throw new Error('Failed to create order')

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: 'INR',
        name: 'MKChain',
        description: `${plan.name} Plan — Blockchain Forensics`,
        order_id: order.id,
        prefill: {
          email: user.email,
        },
        theme: { color: '#7c6aff' },
        handler: async function (response: any) {
          // Verify payment
          const verify = await fetch('/api/razorpay/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planId: plan.id,
              userId: user.id,
            }),
          })

          const result = await verify.json()
          if (result.success) {
            window.location.href = '/dashboard?upgraded=true'
          } else {
            alert('Payment verification failed. Please contact support.')
          }
        },
        modal: {
          ondismiss: () => setLoading(null),
        },
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      console.error(err)
      alert('Something went wrong. Please try again.')
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-primary/20 flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <span className="font-bold text-foreground">MK<span className="text-primary">Chain</span></span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Dashboard
            </Link>
            <Link href="/auth/login" className="text-sm text-primary hover:text-primary/80 transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-14"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary text-xs font-medium mb-4">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary" />
            </span>
            Simple, transparent pricing
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4">
            Choose your <span className="text-primary">intelligence</span> level
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Start free, upgrade when you need more. No hidden fees, cancel anytime.
          </p>
        </motion.div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {PLANS.map((plan, index) => (
            <motion.div
              key={plan.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative rounded-xl border bg-card/50 backdrop-blur-sm p-6 flex flex-col ${
                plan.highlight
                  ? 'border-primary shadow-lg shadow-primary/10'
                  : 'border-border'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                    Most popular
                  </span>
                </div>
              )}

              {/* Plan header */}
              <div className="mb-6">
                <div className={`inline-flex p-2 rounded-lg bg-secondary/50 mb-3`}>
                  <plan.icon className={`h-5 w-5 ${plan.color}`} />
                </div>
                <h2 className="text-xl font-bold text-foreground">{plan.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-foreground">{plan.priceDisplay}</span>
                  {plan.price > 0 && (
                    <span className="text-sm text-muted-foreground">/{plan.period}</span>
                  )}
                </div>
                {plan.price === 0 && (
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                )}
              </div>

              {/* Features */}
              <div className="flex-1 space-y-2.5 mb-6">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-accent mt-0.5 shrink-0" />
                    <span className="text-sm text-foreground">{f}</span>
                  </div>
                ))}
                {plan.missing.map((f) => (
                  <div key={f} className="flex items-start gap-2 opacity-40">
                    <div className="h-4 w-4 mt-0.5 shrink-0 flex items-center justify-center">
                      <div className="h-px w-3 bg-muted-foreground" />
                    </div>
                    <span className="text-sm text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {plan.id === 'free' ? (
                <Link
                  href="/auth/signup"
                  className="w-full flex items-center justify-center gap-2 h-10 border border-border rounded-md text-sm font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 transition-all"
                >
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan)}
                  disabled={loading === plan.id}
                  className={`w-full flex items-center justify-center gap-2 h-10 rounded-md text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    plan.highlight
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'border border-border text-foreground hover:border-primary/50 hover:bg-primary/5'
                  }`}
                >
                  {loading === plan.id ? 'Opening checkout…' : plan.cta}
                  {loading !== plan.id && <ArrowRight className="h-4 w-4" />}
                </button>
              )}
            </motion.div>
          ))}
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto">
          <h2 className="text-xl font-bold text-foreground text-center mb-6">Common questions</h2>
          <div className="space-y-4">
            {[
              { q: 'What counts as one analysis?', a: 'Each wallet address traced counts as one analysis. Multi-hop graph traversals on the same address count as one.' },
              { q: 'Can I upgrade or downgrade anytime?', a: 'Yes. Upgrades apply immediately. Downgrades apply at the end of your billing cycle.' },
              { q: 'Is my payment data secure?', a: 'Yes. All payments are processed by Razorpay. We never store card details on our servers.' },
              { q: 'Do unused analyses roll over?', a: 'No. Analyses reset at the start of each billing cycle.' },
            ].map((item) => (
              <div key={item.q} className="rounded-lg border border-border bg-card/50 p-4">
                <p className="text-sm font-medium text-foreground mb-1">{item.q}</p>
                <p className="text-sm text-muted-foreground">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
