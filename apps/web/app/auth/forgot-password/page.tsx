'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Shield, AlertCircle, MailCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/auth/update-password`,
    })

    if (error) { setError(error.message); setLoading(false); return }
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 grid-pattern opacity-30 pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <div className="rounded-xl border border-border bg-card/80 backdrop-blur-sm p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center glow-border mb-4">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              MK<span className="text-primary">Chain</span>
            </h1>
          </div>

          {sent ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <div className="h-14 w-14 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
                <MailCheck className="h-7 w-7 text-accent" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-2">Reset link sent</h2>
              <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
                Check <span className="text-foreground font-medium">{email}</span> for a password
                reset link. It expires in 1 hour.
              </p>
              <Link
                href="/auth/login"
                className="text-sm text-primary hover:text-primary/80 transition-colors"
              >
                ← Back to login
              </Link>
            </motion.div>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-foreground text-center mb-2">
                Reset your password
              </h2>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 p-3 mb-4 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </motion.div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm text-muted-foreground">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full h-10 px-3 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-10 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed glow-border"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                <Link href="/auth/login" className="text-primary hover:text-primary/80 transition-colors">
                  ← Back to login
                </Link>
              </p>
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
