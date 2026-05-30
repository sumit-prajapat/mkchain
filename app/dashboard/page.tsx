// SERVER COMPONENT — fetches real user data, protects route
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from './DashboardClient'

const PLAN_LIMITS: Record<string, number> = {
  free: 100,
  pro: 1000,
  team: 10000,
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const planId = profile?.plan_id ?? 'free'
  const callsUsed = profile?.api_calls_used ?? 0
  const callsLimit = PLAN_LIMITS[planId] ?? 100

  return (
    <DashboardClient
      user={{
        id: user.id,
        email: user.email ?? '',
        fullName: profile?.full_name ?? null,
        planId,
        callsUsed,
        callsLimit,
        callsPct: Math.min(100, Math.round((callsUsed / callsLimit) * 100)),
        subscriptionStatus: profile?.subscription_status ?? 'inactive',
      }}
    />
  )
}
