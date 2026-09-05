import axios from "axios";
import { API_URL } from "./config";
import { supabase } from "./supabase";
import type {
  Analysis,
  AlertItem,
  BtcDeep,
  CompareResult,
  DarkwebEntity,
  DarkwebStats,
  WatchedAddress,
  BillingDashboard,
} from "./types";

const api = axios.create({ baseURL: API_URL, timeout: 180_000 });

api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  
  // Add organization context header
  const currentOrgId = localStorage.getItem('currentOrgId');
  if (currentOrgId) {
    config.headers['X-Organization-ID'] = currentOrgId;
  }
  
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      await supabase.auth.signOut();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

/** Human-readable message for any axios/network failure. */
export function apiErrorMessage(error: unknown, fallback = "Request failed."): string {
  const e = error as {
    code?: string;
    message?: string;
    response?: { status?: number; data?: { detail?: unknown; message?: string } };
  };
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0] as { msg?: string };
    if (first?.msg) return first.msg;
  }
  if (e?.response?.data?.message) return e.response.data.message;
  const status = e?.response?.status;
  if (status === 429) return "Upstream blockchain API rate limit reached. Wait a moment and retry.";
  if (status === 404) return "Not found — this record may have been deleted.";
  if (status === 422) return "The backend rejected these inputs. Check the address and chain.";
  if (status && status >= 500) return "The analysis backend returned an error. Try again shortly.";
  if (e?.code === "ECONNABORTED") return "The request timed out. Deep analyses can exceed the limit — try fewer hops.";
  if (e?.message === "Network Error") return "Cannot reach the MKChain API. Check your connection.";
  return e?.message || fallback;
}

export const endpoints = {
  // Analysis endpoints
  analyze: (body: { address: string; chain: string; hops: number }) =>
    api.post<Analysis>("/api/analyze", body).then((r) => r.data),

  listAnalyses: (limit = 50) =>
    api.get<Analysis[] | { analyses: Analysis[] }>("/api/analyses", { params: { limit } }).then((r) => {
      const d = r.data as Analysis[] | { analyses?: Analysis[] };
      return Array.isArray(d) ? d : (d.analyses ?? []);
    }),

  getAnalysis: (id: string) => api.get<Analysis>(`/api/analyses/${id}`).then((r) => r.data),

  deleteAnalysis: (id: string) => api.delete(`/api/analyses/${id}`).then((r) => r.data),

  reportPdf: (id: string) =>
    api.get<Blob>(`/api/reports/${id}/pdf`, { responseType: "blob" }).then((r) => r.data),

  regenerateSummary: (id: string) =>
    api.post<{ ai_summary?: string; summary?: string }>(`/api/reports/${id}/ai-summary`).then((r) => r.data),

  // Dark web endpoints
  darkwebStats: () => api.get<DarkwebStats>("/api/darkweb/stats").then((r) => r.data),

  darkwebCheck: (address: string) => api.get(`/api/darkweb/check/${address}`).then((r) => r.data),

  darkwebSearch: (params: { q?: string; category?: string; chain?: string }) =>
    api
      .get<DarkwebEntity[] | { results?: DarkwebEntity[]; entities?: DarkwebEntity[] }>("/api/darkweb/search", {
        params,
      })
      .then((r) => normalizeEntities(r.data)),

  darkwebEntities: () =>
    api
      .get<DarkwebEntity[] | { entities?: DarkwebEntity[] }>("/api/darkweb/entities")
      .then((r) => normalizeEntities(r.data)),

  darkwebEntity: (id: string | number) =>
    api.get<DarkwebEntity>(`/api/darkweb/entity/${id}`).then((r) => r.data),

  // Compare endpoint
  compare: (body: { address_a: string; chain_a: string; address_b: string; chain_b: string }) =>
    api.post<CompareResult>("/api/compare", body).then((r) => r.data),

  // Alert endpoints
  watchAdd: (body: { address: string; chain: string; label?: string; threshold?: number }) =>
    api.post<WatchedAddress>("/api/alerts/watch", body).then((r) => r.data),

  watchList: () =>
    api
      .get<WatchedAddress[] | { watched?: WatchedAddress[] }>("/api/alerts/watched")
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.watched ?? []))),

  watchRemove: (id: string) => api.delete(`/api/alerts/watch/${id}`).then((r) => r.data),

  alertFeed: () =>
    api
      .get<AlertItem[] | { alerts?: AlertItem[] }>("/api/alerts/feed")
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.alerts ?? []))),

  alertRead: (body: { alert_id?: string; id?: string }) =>
    api.post("/api/alerts/read", body).then((r) => r.data),

  checkNow: (id: string) => api.post(`/api/alerts/check-now/${id}`).then((r) => r.data),

  // Bitcoin endpoint
  btcDeep: (address: string) => api.get<BtcDeep>(`/api/btc/deep/${address}`).then((r) => r.data),

  // ========================================================================
  // ORGANIZATION MANAGEMENT - NEW ENDPOINTS
  // ========================================================================
  
  listOrganizations: () =>
    api.get('/api/organizations').then((r) => r.data),

  createOrganization: (body: { name: string; slug?: string }) =>
    api.post('/api/organizations', body).then((r) => r.data),

  getOrganization: (id: string) =>
    api.get(`/api/organizations/${id}`).then((r) => r.data),

  updateOrganization: (id: string, body: { name?: string }) =>
    api.patch(`/api/organizations/${id}`,   body).then((r) => r.data),

  deleteOrganization: (id: string) =>
    api.delete(`/api/organizations/${id}`).then((r) => r.data),

  // Member Management
  listMembers: (orgId: string) =>
    api.get(`/api/organizations/${orgId}/members`).then((r) => r.data),

  inviteMember: (orgId: string, body: { email: string; role: string }) =>
    api.post(`/api/organizations/${orgId}/members/invite`, body).then((r) => r.data),

  updateMemberRole: (orgId: string, memberId: string, role: string) =>
    api.patch(`/api/organizations/${orgId}/members/${memberId}`,   { role }).then((r) => r.data),

  removeMember: (orgId: string, memberId: string) =>
    api.delete(`/api/organizations/${orgId}/members/${memberId}`).then((r) => r.data),

  // Invite Management
  getInvite: (token: string) =>
    api.get(`/api/invites/${token}`).then((r) => r.data),

  acceptInvite: (token: string) =>
    api.post(`/api/invites/${token}/accept`).then((r) => r.data),

  // ========================================================================
  // BILLING & SUBSCRIPTION ENDPOINTS
  // ========================================================================
  
  // Dashboard and overview - Composite endpoint that fetches all billing data
  getBillingDashboard: async (): Promise<BillingDashboard> => {
    const [subscription, usage, payment_methods, invoices] = await Promise.all([
      api.get('/api/billing/subscriptions').then(r => r.data),
      api.get('/api/billing/usage/current').then(r => r.data),
      api.get('/api/billing/payment-methods').then(r => r.data),
      api.get('/api/billing/invoices', { params: { limit: 5 } }).then(r => r.data?.invoices || r.data || []),
    ]);
    
    return {
      subscription,
      usage,
      payment_methods,
      recent_invoices: Array.isArray(invoices) ? invoices : [],
      plan_limits: subscription.plan_limits || {},
    };
  },

  // Subscription management
  getCurrentSubscription: () =>
    api.get('/api/billing/subscriptions').then((r) => r.data),

  createSubscription: (body: { plan_tier: string; payment_method_id?: string; use_trial?: boolean }) =>
    api.post('/api/billing/subscriptions', body).then((r) => r.data),

  updateSubscription: (body: { new_plan_tier: string }) =>
    api.patch('/api/billing/subscriptions', body).then((r) => r.data),

  cancelSubscription: (immediate = false) =>
    api.delete('/api/billing/subscriptions', { params: { immediate } }).then((r) => r.data),

  previewProration: (new_plan_tier: string) =>
    api.post('/api/billing/subscriptions/preview', { new_plan_tier }).then((r) => r.data),

  // Payment methods
  listPaymentMethods: () =>
    api.get('/api/billing/payment-methods').then((r) => r.data),

  addPaymentMethod: (payment_method_id: string) =>
    api.post('/api/billing/payment-methods', { payment_method_id }).then((r) => r.data),

  setDefaultPaymentMethod: (id: number) =>
    api.patch(`/api/billing/payment-methods/${id}`,   { is_default: true }).then((r) => r.data),

  removePaymentMethod: (id: number) =>
    api.delete(`/api/billing/payment-methods/${id}`).then((r) => r.data),

  // Usage and analytics
  getCurrentUsage: () =>
    api.get('/api/billing/usage/current').then((r) => r.data),

  getUsageHistory: (periods = 12) =>
    api.get('/api/billing/usage/history', { params: { periods } }).then((r) => r.data),

  // Invoices
  listInvoices: (limit?: number) =>
    api.get('/api/billing/invoices', { params: { limit } }).then((r) => r.data?.invoices || r.data || []),

  getInvoice: (id: number) =>
    api.get(`/api/billing/invoices/${id}`).then((r) => r.data),
};

function normalizeEntities(
  data: DarkwebEntity[] | { results?: DarkwebEntity[]; entities?: DarkwebEntity[] },
): DarkwebEntity[] {
  if (Array.isArray(data)) return data;
  return data?.entities ?? data?.results ?? [];
}

export const streamUrl = `/api/alerts/stream`;

export default api;
