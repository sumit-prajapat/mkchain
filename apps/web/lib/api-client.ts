/**
 * lib/api-client.ts
 * Typed fetch wrapper for MKChain FastAPI backend.
 * Automatically attaches the user's API key from Supabase session.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

export interface AnalyzeRequest {
  address: string
  chain: 'eth' | 'btc' | 'polygon'
  hop_depth?: number
}

export interface PatternFlag {
  pattern: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
}

export interface GraphNode {
  id: string
  address: string
  type: string
  risk_score: number
}

export interface GraphEdge {
  from: string
  to: string
  value: number
  tx_hash: string
}

export interface AnalysisResult {
  id: string
  address: string
  chain: string
  risk_score: number
  risk_label: 'critical' | 'high' | 'medium' | 'low' | 'safe'
  // patterns — backend may return as objects or strings
  patterns?: PatternFlag[]
  flags?: string[]
  graph_nodes?: GraphNode[]
  graph_edges?: GraphEdge[]
  graph?: any
  ai_summary?: string
  dark_web_hits?: string[]
  darkweb_hits?: string[]
  // stats — backend field names vary
  total_received?: number
  total_sent?: number
  total_volume?: number
  tx_count?: number
  total_txns?: number
  hop_depth?: number
  hops?: number
  risk_factors?: any[]
  created_at?: string
}

export interface ApiError {
  detail: string
  status: number
}

async function getApiKey(): Promise<string | null> {
  // Use Supabase client session access token for Authorization header.
  // Previously this tried to read API keys table from the browser which
  // would not return the raw secret. Using the user's access token aligns
  // with the apps/api authentication middleware which accepts Supabase JWTs.
  try {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token ?? null
    return token
  } catch {
    return null
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  apiKey?: string
): Promise<T> {
  const key = apiKey ?? await getApiKey()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  }

  if (key) {
    headers['Authorization'] = `Bearer ${key}`
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw { detail: err.detail ?? 'Request failed', status: res.status } as ApiError
  }

  return res.json()
}

// ─── Analysis endpoints ───────────────────────────────────────────────────────

export async function analyzeWallet(req: AnalyzeRequest): Promise<AnalysisResult> {
  return apiFetch<AnalysisResult>('/api/analyze', {
    method: 'POST',
    body: JSON.stringify(req),
  })
}

export async function getAnalysis(id: string): Promise<AnalysisResult> {
  return apiFetch<AnalysisResult>(`/api/analyses/${id}`)
}

export async function listAnalyses(): Promise<AnalysisResult[]> {
  return apiFetch<AnalysisResult[]>('/api/analyses')
}

export async function getAnalysisPdf(id: string): Promise<Blob> {
  const API_URL_VAL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'
  const key = await getApiKey()
  const res = await fetch(`${API_URL_VAL}/api/reports/${id}/pdf`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  })
  if (!res.ok) throw new Error('Failed to download PDF')
  return res.blob()
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}