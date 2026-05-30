import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function generateApiKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let suffix = ''
  const bytes = crypto.randomBytes(32)
  for (let i = 0; i < 32; i++) {
    suffix += chars[bytes[i] % chars.length]
  }
  return `mk_live_${suffix}`
}

function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

const PLAN_KEY_LIMITS: Record<string, number> = {
  free: 1, pro: 5, team: 20,
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name } = await request.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Key name required' }, { status: 400 })

    // Check plan limits
    const { data: profile } = await serviceSupabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single()

    const planId = profile?.plan_id ?? 'free'
    const keyLimit = PLAN_KEY_LIMITS[planId] ?? 1

    const { count } = await serviceSupabase
      .from('api_keys')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)

    if ((count ?? 0) >= keyLimit) {
      return NextResponse.json(
        { error: `Your ${planId} plan allows max ${keyLimit} active key(s). Upgrade to create more.` },
        { status: 403 }
      )
    }

    // Generate key
    const rawKey = generateApiKey()
    const keyHash = hashKey(rawKey)
    const keyPrefix = rawKey.slice(0, 16) + '…'

    const { data: newKey, error } = await serviceSupabase
      .from('api_keys')
      .insert({
        user_id: user.id,
        name: name.trim(),
        key_prefix: keyPrefix,
        key_hash: keyHash,
        is_active: true,
      })
      .select('id, name, key_prefix, created_at')
      .single()

    if (error) throw error

    // Audit log
    await serviceSupabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'api_key_created',
      metadata: { key_name: name, key_id: newKey.id },
    })

    return NextResponse.json({
      id: newKey.id,
      name: newKey.name,
      key_prefix: newKey.key_prefix,
      raw_key: rawKey,    // shown ONCE
      created_at: newKey.created_at,
    }, { status: 201 })

  } catch (err: any) {
    console.error('Create key error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
