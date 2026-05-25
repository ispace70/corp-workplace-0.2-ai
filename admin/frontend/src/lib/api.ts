import axios from 'axios'

const http = axios.create({ baseURL: '/admin' })

export type DocRecord = {
  id: string
  filename: string
  file_type: string
  file_path: string
  status: 'pending' | 'indexed' | 'error'
  chunk_count: number
  created_at: string
}

export type FewshotRecord = {
  id: string
  question: string
  sql: string
  tags: string[]
  created_at: string
  updated_at: string
}

export type CodemapItem = {
  table_name: string
  column_name: string
  column_korea_name: string
  column_value: string
  korea_term: string
  description: string
  synonyms: string
}
export type Stats = { knowledge_chunks: number; doc_count: number; indexed_count: number }
export type Settings = Record<string, string>

export const api = {
  // stats
  getStats: ()               => http.get<Stats>('/stats').then(r => r.data),

  // docs
  listDocs: ()               => http.get<DocRecord[]>('/docs').then(r => r.data),
  uploadDoc: (file: File)    => {
    const fd = new FormData()
    fd.append('file', file)
    return http.post<DocRecord>('/docs/upload', fd).then(r => r.data)
  },
  addSite: (url: string)     => http.post<DocRecord>('/docs/site', { url }).then(r => r.data),
  deleteDoc: (id: string)    => http.delete(`/docs/${id}`).then(r => r.data),
  reindexDoc: (id: string)   => http.post(`/docs/${id}/reindex`).then(r => r.data),

  // settings
  getSettings: ()                     => http.get<Settings>('/settings').then(r => r.data),
  updateSettings: (data: Settings)    => http.put('/settings', { data }).then(r => r.data),
  getDefaults: ()                     => http.get<Settings>('/settings/defaults').then(r => r.data),

  // vector
  vectorRefresh: ()                   => http.post('/vector/refresh').then(r => r.data),
  vectorMigrate: (legacyPath: string) => http.post('/vector/migrate', { legacy_path: legacyPath }).then(r => r.data),

  // fewshots
  listFewshots: ()                                                           => http.get<FewshotRecord[]>('/fewshots').then(r => r.data),
  createFewshot: (q: string, sql: string, tags: string[] = [])              => http.post<FewshotRecord>('/fewshots', { question: q, sql, tags }).then(r => r.data),
  updateFewshot: (id: string, q: string, sql: string, tags: string[] = []) => http.put(`/fewshots/${id}`, { question: q, sql, tags }).then(r => r.data),
  deleteFewshot: (id: string)                                                => http.delete(`/fewshots/${id}`).then(r => r.data),

  // prompts (file-based)
  getPrompts: ()                               => http.get<Record<string, string>>('/prompts').then(r => r.data),
  updatePrompt: (key: string, content: string) => http.put(`/prompts/${key}`, { content }).then(r => r.data),

  // codemap (read-only, from ispace.db __comm_code_map)
  listCodemap: ()        => http.get<CodemapItem[]>('/codemap').then(r => r.data),
  getCodemapPrompt: ()   => http.get<{ text: string }>('/codemap/prompt').then(r => r.data),

  // schema
  getSchema: ()              => http.get<Record<string, { comment: string; columns: { column: string; type: string; comment: string }[] }>>('/schema').then(r => r.data),
}
