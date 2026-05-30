'use client'

import { useState } from 'react'
import {
  Sidebar,
  DashboardHeader,
  StatCard,
  ThreatFeed,
  TransactionChart,
  NetworkGraph,
  RecentInvestigations,
  GlobalCoverage,
} from '@/components/dashboard/dashboard-components'
import { AlertTriangle, Wallet, Activity, Shield } from 'lucide-react'

export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  planId: string
  callsUsed: number
  callsLimit: number
  callsPct: number
  subscriptionStatus: string
}

interface Props {
  user: UserProfile
}

const PLAN_COLORS: Record<string, string> = {
  free: 'text-accent',
  pro: 'text-primary',
  team: 'text-chart-4',
}

export default function DashboardClient({ user }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const planLabel = user.planId.charAt(0).toUpperCase() + user.planId.slice(1)
  const planColor = PLAN_COLORS[user.planId] ?? 'text-primary'
  const initials = user.fullName
    ? user.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : user.email.slice(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        user={{
          email: user.email,
          fullName: user.fullName,
          planId: user.planId,
          planLabel,
          planColor,
          initials,
        }}
      />

      <div className="lg:pl-64">
        <DashboardHeader onMenuClick={() => setSidebarOpen(true)} />

        <main className="p-4 lg:p-6 space-y-6">
          {/* Page Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {user.fullName ? `Welcome back, ${user.fullName.split(' ')[0]}` : 'Threat Intelligence Overview'}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Real-time blockchain forensics and threat monitoring
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Usage pill */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-secondary/40 text-xs">
                <span className="text-muted-foreground">Usage:</span>
                <span className={user.callsPct > 80 ? 'text-destructive font-medium' : 'text-foreground'}>
                  {user.callsUsed}/{user.callsLimit}
                </span>
              </div>
              {/* Plan badge */}
              <span className={`px-3 py-1.5 rounded-full border border-border bg-secondary/40 text-xs font-medium ${planColor}`}>
                {planLabel} plan
              </span>
            </div>
          </div>

          {/* Usage bar — shown when over 50% */}
          {user.callsPct >= 50 && (
            <div className="rounded-lg border border-border bg-card/50 p-4 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>API usage this billing cycle</span>
                  <span className={user.callsPct > 80 ? 'text-destructive' : ''}>
                    {user.callsUsed} / {user.callsLimit} ({user.callsPct}%)
                  </span>
                </div>
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      user.callsPct > 80 ? 'bg-destructive' : user.callsPct > 60 ? 'bg-chart-4' : 'bg-primary'
                    }`}
                    style={{ width: `${user.callsPct}%` }}
                  />
                </div>
              </div>
              {user.callsPct > 80 && (
                <a
                  href="/dashboard/billing"
                  className="shrink-0 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Upgrade →
                </a>
              )}
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Active Threats"
              value="47"
              change="+12"
              changeType="up"
              icon={AlertTriangle}
              status="critical"
            />
            <StatCard
              title="Monitored Wallets"
              value="2,847"
              change="+156"
              changeType="up"
              icon={Wallet}
              status="normal"
            />
            <StatCard
              title="Risk Score"
              value="73/100"
              change="+5"
              changeType="up"
              icon={Shield}
              status="warning"
            />
            <StatCard
              title="Transactions/sec"
              value="12,453"
              change="-2%"
              changeType="down"
              icon={Activity}
              status="normal"
            />
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <TransactionChart />
              <NetworkGraph />
            </div>
            <div className="space-y-6">
              <ThreatFeed />
            </div>
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <RecentInvestigations />
            <GlobalCoverage />
          </div>
        </main>
      </div>
    </div>
  )
}
