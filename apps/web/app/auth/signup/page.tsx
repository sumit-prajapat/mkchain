'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Shield, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const supabase = createClient()
  const pwStrong = password.length >= 8

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!pwStrong) { setError('Password must be at least 8 characters.'); return }
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
      },
    })

    if (error) { setError(error.message); setLoading(false); return }
    setSuccess(true)
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="absolute inset-0 grid-pattern opacity-30 pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-xl border border-border bg-card/80 backdrop-blur-sm p-8 text-center"
        >
          <div className="h-16 w-16 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="h-8 w-8 text-accent" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Check your email</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            We sent a confirmation link to{' '}
            <span className="text-foreground font-medium">{email}</span>.
            Click it to activate your account.
          </p>
          <Link
            href="/auth/login"
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            ← Back to login
          </Link>
        </motion.div>
      </div>
    )
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
          <div className="flex flex-col items-center mb-6">
            <div className="h-12 w-12 rounded-lg bg-primary/20 flex items-center justify-center glow-border mb-4">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              MK<span className="text-primary">Chain</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1 uppercase tracking-widest">
              Forensics Intelligence
            </p>
          </div>

          {/* Free plan pill */}
          <div className="flex justify-center mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-accent/30 bg-accent/10 text-xs text-accent font-medium">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accent" />
              </span>
              Free plan — 100 analyses/month
            </span>
          </div>

          <h2 className="text-lg font-semibold text-foreground text-center mb-6">
            Create your account
          </h2>

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

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-sm text-muted-foreground">Full name</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Sumit Prajapat"
                required
                autoComplete="name"
                className="w-full h-10 px-3 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm text-muted-foreground">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full h-10 px-3 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm text-muted-foreground">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  autoComplete="new-password"
                  className="w-full h-10 px-3 pr-10 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div className={`h-1 flex-1 rounded-full ${pwStrong ? 'bg-accent' : 'bg-destructive/60'}`} />
                  <span className={`text-xs ${pwStrong ? 'text-accent' : 'text-muted-foreground'}`}>
                    {pwStrong ? 'Strong' : 'Too short'}
                  </span>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed glow-border mt-2"
            >
              {loading ? 'Creating account…' : 'Create free account'}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-4">
            By signing up you agree to our{' '}
            <Link href="/terms" className="text-primary hover:text-primary/80">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" className="text-primary hover:text-primary/80">Privacy Policy</Link>
          </p>

          <p className="text-center text-sm text-muted-foreground mt-5">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-primary hover:text-primary/80 transition-colors font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  )
}
