'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Key, Plus, Copy, Trash2, Eye, EyeOff,
  CheckCircle2, AlertTriangle, Shield, Clock, Zap
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface ApiKey {
  id: string
  name: string
  key_prefix: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

interface NewKeyResult {
  id: string
  name: string
  raw_key: string
  key_prefix: string
}

const PLAN_KEY_LIMITS: Record<string, number> = {
  free: 1,
  pro: 5,
  team: 20,
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyResult, setNewKeyResult] = useState<NewKeyResult | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [planId, setPlanId] = useState('free')

  const supabase = createClient()
  const keyLimit = PLAN_KEY_LIMITS[planId] ?? 1
  const activeKeys = keys.filter(k => k.is_active)

  useEffect(() => { fetchKeys() }, [])

  async function fetchKeys() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single()
    if (profile) setPlanId(profile.plan_id)

    // Get keys
    const { data } = await supabase
      .from('api_keys')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    setKeys(data ?? [])
    setLoading(false)
  }

  async function createKey() {
    if (!newKeyName.trim()) return
    if (activeKeys.length >= keyLimit) {
      setError(`Your ${planId} plan allows max ${keyLimit} active key(s). Revoke one or upgrade.`)
      return
    }

    setCreating(true)
    setError(null)

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create key')

      setNewKeyResult(data)
      setNewKeyName('')
      setShowCreate(false)
      await fetchKeys()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function revokeKey(keyId: string) {
    setDeletingId(keyId)
    const res = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' })
    if (res.ok) {
      setKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_active: false } : k))
    }
    setDeletingId(null)
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    })
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage programmatic access to MKChain
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {activeKeys.length} / {keyLimit} keys used
          </span>
          <button
            onClick={() => { setShowCreate(true); setError(null); setNewKeyResult(null) }}
            disabled={activeKeys.length >= keyLimit}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            New key
          </button>
        </div>
      </div>

      {/* Plan limit warning */}
      {activeKeys.length >= keyLimit && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-chart-4/40 bg-chart-4/10 text-chart-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Key limit reached for {planId} plan.{' '}
            <a href="/pricing" className="font-medium underline">Upgrade to create more →</a>
          </span>
        </div>
      )}

      {/* Newly created key — show raw key ONCE */}
      <AnimatePresence>
        {newKeyResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-accent/40 bg-accent/10 p-5"
          >
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <span className="font-medium text-foreground">Key created — copy it now</span>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              This is the only time you&apos;ll see this key. Store it securely — we don&apos;t store the full key.
            </p>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-background border border-border font-mono text-sm text-foreground break-all">
              <span className="flex-1">{newKeyResult.raw_key}</span>
              <button
                onClick={() => copyToClipboard(newKeyResult.raw_key, 'new')}
                className="shrink-0 p-1.5 hover:bg-secondary rounded transition-colors"
              >
                {copiedId === 'new'
                  ? <CheckCircle2 className="h-4 w-4 text-accent" />
                  : <Copy className="h-4 w-4 text-muted-foreground" />
                }
              </button>
            </div>
            <button
              onClick={() => setNewKeyResult(null)}
              className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              I&apos;ve saved my key — dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create key form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-border bg-card/50 p-5"
          >
            <h3 className="font-medium text-foreground mb-4">Create new API key</h3>
            {error && (
              <div className="flex items-center gap-2 p-3 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="flex gap-3">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createKey()}
                placeholder="e.g. Production server, CI/CD pipeline"
                className="flex-1 h-10 px-3 bg-input border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
              <button
                onClick={createKey}
                disabled={creating || !newKeyName.trim()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={() => { setShowCreate(false); setError(null) }}
                className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keys list */}
      <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
        <div className="flex items-center gap-2 p-4 border-b border-border">
          <Key className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground text-sm">Your API keys</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading keys…</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center">
            <Key className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create your first key to start using the MKChain API.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {keys.map((key) => (
              <motion.div
                key={key.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`p-4 flex items-center gap-4 ${!key.is_active ? 'opacity-50' : ''}`}
              >
                {/* Icon */}
                <div className={`p-2 rounded-lg shrink-0 ${key.is_active ? 'bg-primary/10' : 'bg-secondary'}`}>
                  <Key className={`h-4 w-4 ${key.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-foreground truncate">{key.name}</span>
                    {!key.is_active && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-secondary text-muted-foreground">Revoked</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <code className="font-mono">{key.key_prefix}</code>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Created {formatDate(key.created_at)}
                    </span>
                    {key.last_used_at && (
                      <span>Last used {timeAgo(key.last_used_at)}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {key.is_active && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => copyToClipboard(key.key_prefix, key.id)}
                      className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors"
                      title="Copy prefix"
                    >
                      {copiedId === key.id
                        ? <CheckCircle2 className="h-4 w-4 text-accent" />
                        : <Copy className="h-4 w-4" />
                      }
                    </button>
                    <button
                      onClick={() => revokeKey(key.id)}
                      disabled={deletingId === key.id}
                      className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors disabled:opacity-50"
                      title="Revoke key"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Usage guide */}
      <div className="rounded-xl border border-border bg-card/50 p-5">
        <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          How to use your API key
        </h3>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Pass as header in every request:</p>
            <div className="font-mono text-xs bg-secondary/50 border border-border rounded-lg p-3 text-foreground">
              <span className="text-accent">X-API-Key</span>: mk_live_your_key_here
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Example — analyze a wallet:</p>
            <div className="font-mono text-xs bg-secondary/50 border border-border rounded-lg p-3 text-foreground leading-relaxed">
              <span className="text-muted-foreground">curl</span> -X POST {process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/analyze \{'\n'}
              {'  '}-H <span className="text-accent">"X-API-Key: mk_live_..."</span> \{'\n'}
              {'  '}-H <span className="text-accent">"Content-Type: application/json"</span> \{'\n'}
              {'  '}-d <span className="text-accent">'{'{"address":"0x...","chain":"eth"}'}'</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
