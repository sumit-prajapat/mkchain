import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 60000,
})

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

// OSINT endpoints
export const getOsintStats    = ()           => api.get('/api/darkweb/stats').then(r => r.data)
export const getOsintEntities = ()           => api.get('/api/darkweb/entities').then(r => r.data)
export const getOsintEntity   = (id)         => api.get(`/api/darkweb/entity/${id}`).then(r => r.data)
export const searchOsint      = (q,cat,chain)=>
  api.get('/api/darkweb/search', { params:{ q, category:cat||undefined, chain:chain||undefined, limit:50 } }).then(r => r.data)
export const checkAddress     = (addr)       => api.get(`/api/darkweb/check/${addr}`).then(r => r.data)

export default api
