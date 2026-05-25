import { useEffect, useState } from 'react'
import {
  Alert, Button, Card, Col, InputNumber, Row, Statistic,
  Typography, Input, message, Space, Divider,
} from 'antd'
import { ReloadOutlined, ImportOutlined } from '@ant-design/icons'
import { api, type Stats } from '../lib/api'

const { Title, Text } = Typography

export default function KnowledgeSettings() {
  const [stats, setStats]         = useState<Stats | null>(null)
  const [chunkSize, setChunkSize] = useState(500)
  const [chunkOverlap, setChunkOverlap] = useState(50)
  const [legacyPath, setLegacyPath] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [migrating, setMigrating]   = useState(false)

  useEffect(() => {
    api.getStats().then(setStats).catch(() => {})
    api.getSettings().then(s => {
      if (s.chunk_size)    setChunkSize(Number(s.chunk_size))
      if (s.chunk_overlap) setChunkOverlap(Number(s.chunk_overlap))
    }).catch(() => {})
  }, [])

  const saveSettings = async () => {
    await api.updateSettings({ chunk_size: String(chunkSize), chunk_overlap: String(chunkOverlap) })
    message.success('설정이 저장되었습니다. 이후 업로드/재인덱싱 시 적용됩니다.')
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await api.vectorRefresh() as { total?: number }
      message.info(`전체 재인덱싱 시작됨 (${res.total ?? 0}개 문서)`)
    } catch { message.error('재생성 요청 실패') }
    finally { setRefreshing(false) }
  }

  const handleMigrate = async () => {
    if (!legacyPath.trim()) { message.warning('레거시 경로를 입력하세요.'); return }
    setMigrating(true)
    try {
      const res = await api.vectorMigrate(legacyPath.trim()) as { migrated?: number }
      message.success(`마이그레이션 완료: ${res.migrated ?? 0}개 청크`)
      api.getStats().then(setStats).catch(() => {})
    } catch (e: unknown) {
      message.error(`마이그레이션 실패: ${(e as Error).message}`)
    }
    finally { setMigrating(false) }
  }

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>설정 / 벡터 갱신</Title>

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={8}>
          <Card><Statistic title="총 청크 수"     value={stats?.knowledge_chunks ?? '—'} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="총 문서 수"     value={stats?.doc_count ?? '—'} /></Card>
        </Col>
        <Col span={8}>
          <Card><Statistic title="인덱싱 완료"    value={stats?.indexed_count ?? '—'} /></Card>
        </Col>
      </Row>

      <Card title="청킹 파라미터" style={{ marginBottom: 24 }}>
        <Row gutter={24} align="middle">
          <Col>
            <Text>Chunk Size (문자)</Text>
            <br />
            <InputNumber min={100} max={5000} step={100} value={chunkSize} onChange={v => setChunkSize(v ?? 500)} style={{ width: 160, marginTop: 4 }} />
          </Col>
          <Col>
            <Text>Chunk Overlap (문자)</Text>
            <br />
            <InputNumber min={0} max={500} step={10} value={chunkOverlap} onChange={v => setChunkOverlap(v ?? 50)} style={{ width: 160, marginTop: 4 }} />
          </Col>
          <Col style={{ paddingTop: 22 }}>
            <Button type="primary" onClick={saveSettings}>저장</Button>
          </Col>
        </Row>
      </Card>

      <Card title="전체 벡터 재구축" style={{ marginBottom: 24 }}>
        <Alert
          type="warning"
          showIcon
          message="재생성 시 ChromaDB를 초기화하고 추적 중인 모든 문서를 재인덱싱합니다. 진행 중 검색 품질이 일시적으로 저하될 수 있습니다."
          style={{ marginBottom: 16 }}
        />
        <Button danger icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>
          전체 재인덱싱
        </Button>
      </Card>

      <Card title="레거시 벡터 마이그레이션">
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          기존 <code>resources/</code> ChromaDB 데이터를 <code>resources/chroma/knowledge/</code>로 복사합니다.
        </Text>
        <Space>
          <Input
            style={{ width: 480 }}
            placeholder="/Users/sdh/Desktop/agent-test/corp-workplace/resources"
            value={legacyPath}
            onChange={e => setLegacyPath(e.target.value)}
          />
          <Button icon={<ImportOutlined />} loading={migrating} onClick={handleMigrate}>
            마이그레이션
          </Button>
        </Space>
      </Card>
    </div>
  )
}
