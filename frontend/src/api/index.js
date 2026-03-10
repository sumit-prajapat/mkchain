import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 90000,
})

// Analysis
export const analyzeWallet  = (address, chain='eth', hops=2) =>
  api.post('/api/analyze', { address, chain, hops }).then(r => r.data)
export const listAnalyses   = (limit=20) =>
  api.get('/api/analyses', { params:{ limit } }).then(r => r.data)
export const getAnalysis    = (id) =>
  api.get(`/api/analyses/${id}`).then(r => r.data)
export const deleteAnalysis = (id) =>
  api.delete(`/api/analyses/${id}`).then(r => r.data)
export const downloadReport = (id) =>
  api.get(`/api/reports/${id}/pdf`, { responseType:'blob' }).then(r => r.data)

// OSINT
export const getOsintStats    = ()              => api.get('/api/darkweb/stats').then(r => r.data)
export const getOsintEntities = ()              => api.get('/api/darkweb/entities').then(r => r.data)
export const getOsintEntity   = (id)            => api.get(`/api/darkweb/entity/${id}`).then(r => r.data)
export const searchOsint      = (q,cat,chain)   =>
  api.get('/api/darkweb/search', { params:{ q, category:cat||undefined, chain:chain||undefined, limit:50 } }).then(r => r.data)
export const checkAddress     = (addr)          => api.get(`/api/darkweb/check/${addr}`).then(r => r.data)

// Phase 9 — Compare
export const compareWallets = (addrA, chainA, addrB, chainB) =>
  api.post('/api/compare', { address_a:addrA, chain_a:chainA, address_b:addrB, chain_b:chainB }).then(r => r.data)

// Phase 9 — Alerts
export const addWatch       = (address, chain, label, threshold) =>
  api.post('/api/alerts/watch', { address, chain, label, alert_threshold: threshold }).then(r => r.data)
export const listWatched    = () => api.get('/api/alerts/watched').then(r => r.data)
export const removeWatch    = (id) => api.delete(`/api/alerts/watch/${id}`).then(r => r.data)
export const getAlertFeed   = (limit=50) => api.get('/api/alerts/feed', { params:{ limit } }).then(r => r.data)
export const markAlertsRead = (ids) => api.post('/api/alerts/read', { alert_ids: ids }).then(r => r.data)
export const checkNow       = (id) => api.post(`/api/alerts/check-now/${id}`).then(r => r.data)

// Phase 9 — BTC Deep Dive
export const btcDeepDive    = (address) => api.get(`/api/btc/deep/${address}`).then(r => r.data)

export const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export default api
