import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  timeout: 60000,
})

export const analyzeWallet = (address, chain = 'eth', hops = 2) =>
  api.post('/api/analyze', { address, chain, hops }).then(r => r.data)

export const listAnalyses = (limit = 20) =>
  api.get('/api/analyses', { params: { limit } }).then(r => r.data)

export const getAnalysis = (id) =>
  api.get(`/api/analyses/${id}`).then(r => r.data)

export const deleteAnalysis = (id) =>
  api.delete(`/api/analyses/${id}`).then(r => r.data)

export const downloadReport = (id) =>
  api.get(`/api/reports/${id}/pdf`, { responseType: 'blob' }).then(r => r.data)

export default api
