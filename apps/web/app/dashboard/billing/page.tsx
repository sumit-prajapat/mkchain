import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Shield, Zap, Building2, ArrowRight, CreditCard, Calendar, BarChart3 } from 'lucide-react'

const PLAN_CONFIG: Record<string, {
  label: string; color: string; bgColor: string;
  limit: number; keyLimit: number; icon: any
}> = {
  free:  { label: 'Free',  color: 'text-accent',   bgColor: 'bg-accent/10',   limit: 100,   keyLimit: 1,  icon: Shield },
  pro:   { label: 'Pro',   color: 'text-primary',  bgColor: 'bg-primary/10',  limit: 1000,  keyLimit: 5,  icon: Zap },
  team:  { label: 'Team',  color: 'text-chart-4',  bgColor: 'bg-chart-4/10',  limit: 10000, keyLimit: 20, icon: Building2 },
}

export default async function BillingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, plans(*)')
    .eq('id', user.id)
    .single()

  const planId = profile?.plan_id ?? 'free'
  const plan = PLAN_CONFIG[planId]
  const used = profile?.api_calls_used ?? 0
  const limit = plan.limit
  const pct = Math.min(100, Math.round((used / limit) * 100))
  const cycleStart = profile?.billing_cycle_start
    ? new Date(profile.billing_cycle_start).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'N/A'

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing & Plan</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your subscription and usage</p>
      </div>

      {/* Current plan card */}
      <div className="rounded-xl border border-border bg-card/50 p-6">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-lg ${plan.bgColor}`}>
              <plan.icon className={`h-5 w-5 ${plan.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground">{plan.label} Plan</h2>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${plan.bgColor} ${plan.color}`}>
                  {profile?.subscription_status === 'active' ? 'Active' : 'Free'}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {planId === 'free' ? 'Free forever' : `Billed monthly`}
              </p>
            </div>
          </div>
          {planId === 'free' && (
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Upgrade <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg bg-secondary/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <BarChart3 className="h-3.5 w-3.5" />
              Analyses used
            </div>
            <div className="text-xl font-bold text-foreground">{used.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">of {limit.toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-secondary/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <CreditCard className="h-3.5 w-3.5" />
              API keys
            </div>
            <div className="text-xl font-bold text-foreground">{plan.keyLimit}</div>
            <div className="text-xs text-muted-foreground">max allowed</div>
          </div>
          <div className="rounded-lg bg-secondary/40 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <Calendar className="h-3.5 w-3.5" />
              Cycle started
            </div>
            <div className="text-sm font-bold text-foreground">{cycleStart}</div>
            <div className="text-xs text-muted-foreground">resets monthly</div>
          </div>
        </div>

        {/* Usage bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>API usage this cycle</span>
            <span className={pct > 80 ? 'text-destructive font-medium' : ''}>
              {used} / {limit} ({pct}%)
            </span>
          </div>
          <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pct > 80 ? 'bg-destructive' : pct > 60 ? 'bg-chart-4' : 'bg-primary'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {pct > 80 && (
            <p className="text-xs text-destructive mt-1.5">
              You&apos;re running low.{' '}
              <Link href="/pricing" className="font-medium underline">Upgrade your plan →</Link>
            </p>
          )}
        </div>
      </div>

      {/* Upgrade options — only shown on free/pro */}
      {planId !== 'team' && (
        <div className="rounded-xl border border-border bg-card/50 p-6">
          <h3 className="font-semibold text-foreground mb-4">Available upgrades</h3>
          <div className="space-y-3">
            {planId === 'free' && (
              <div className="flex items-center justify-between p-4 rounded-lg border border-primary/30 bg-primary/5">
                <div className="flex items-center gap-3">
                  <Zap className="h-5 w-5 text-primary" />
                  <div>
                    <div className="text-sm font-medium text-foreground">Pro Plan</div>
                    <div className="text-xs text-muted-foreground">1,000 analyses, PDF reports, alerts</div>
                  </div>
                </div>
                <Link
                  href="/pricing"
                  className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  ₹999/mo
                </Link>
              </div>
            )}
            <div className="flex items-center justify-between p-4 rounded-lg border border-chart-4/30 bg-chart-4/5">
              <div className="flex items-center gap-3">
                <Building2 className="h-5 w-5 text-chart-4" />
                <div>
                  <div className="text-sm font-medium text-foreground">Team Plan</div>
                  <div className="text-xs text-muted-foreground">10,000 analyses, team seats, advanced OSINT</div>
                </div>
              </div>
              <Link
                href="/pricing"
                className="px-3 py-1.5 border border-chart-4/50 text-chart-4 rounded-md text-xs font-medium hover:bg-chart-4/10 transition-colors"
              >
                ₹2,999/mo
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Billing history placeholder */}
      <div className="rounded-xl border border-border bg-card/50 p-6">
        <h3 className="font-semibold text-foreground mb-4">Payment history</h3>
        {planId === 'free' ? (
          <p className="text-sm text-muted-foreground">No payments yet. Upgrade to a paid plan to see your billing history.</p>
        ) : (
          <div className="text-sm text-muted-foreground">
            <p>Payment history will appear here after your first billing cycle.</p>
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6">
        <h3 className="font-semibold text-foreground mb-1">Cancel subscription</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Your plan will remain active until the end of the current billing cycle, then revert to Free.
        </p>
        <button className="px-4 py-2 border border-destructive/40 text-destructive rounded-md text-sm hover:bg-destructive/10 transition-colors">
          Cancel subscription
        </button>
      </div>
    </div>
  )
}
