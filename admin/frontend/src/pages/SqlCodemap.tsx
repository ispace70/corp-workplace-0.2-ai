import { useEffect, useState } from 'react'
import {
  Button, Card, Input, Space, Table, Tabs, Tag, Typography, message,
} from 'antd'
import { ReloadOutlined, CopyOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { api, type CodemapItem } from '../lib/api'

const { Title, Text } = Typography

export default function SqlCodemap() {
  const [rows, setRows]           = useState<CodemapItem[]>([])
  const [promptText, setPromptText] = useState('')
  const [loading, setLoading]     = useState(false)
  const [activeTab, setActiveTab] = useState('table')
  const [filter, setFilter]       = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [data, prompt] = await Promise.all([
        api.listCodemap(),
        api.getCodemapPrompt(),
      ])
      setRows(Array.isArray(data) ? data : [])
      setPromptText(prompt.text ?? '')
    } catch {
      message.error('코드맵 로딩 실패')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = filter
    ? rows.filter(r =>
        [r.table_name, r.column_name, r.column_korea_name, r.column_value, r.korea_term, r.synonyms]
          .some(v => v.toLowerCase().includes(filter.toLowerCase()))
      )
    : rows

  const columns: ColumnsType<CodemapItem> = [
    { title: '테이블', dataIndex: 'table_name', width: 150, ellipsis: true,
      filters: [...new Set(rows.map(r => r.table_name))].map(v => ({ text: v, value: v })),
      onFilter: (v, r) => r.table_name === v,
    },
    { title: '컬럼', dataIndex: 'column_name', width: 160, ellipsis: true },
    { title: '컬럼명(한)', dataIndex: 'column_korea_name', width: 130, ellipsis: true },
    { title: '코드값', dataIndex: 'column_value', width: 90,
      render: v => <Text code>{v}</Text>,
    },
    { title: '한국어 명칭', dataIndex: 'korea_term', width: 120 },
    { title: '동의어', dataIndex: 'synonyms', ellipsis: true,
      render: v => v ? <Tag color="blue">{v}</Tag> : null,
    },
    { title: '설명', dataIndex: 'description', ellipsis: true,
      render: v => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
  ]

  const copyPrompt = () => {
    navigator.clipboard.writeText(promptText)
      .then(() => message.success('클립보드에 복사되었습니다.'))
      .catch(() => message.error('복사 실패'))
  }

  const tableKeys = [...new Set(rows.map(r => r.table_name))]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>코드맵 관리</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ispace.db.__comm_code_map — SQL 에이전트가 실제 사용하는 코드값 매핑 (총 {rows.length}행)
          </Text>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>새로고침</Button>
      </div>

      <div style={{ marginBottom: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {tableKeys.map(t => (
          <Tag key={t} color="geekblue">{t}</Tag>
        ))}
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'table',
            label: '코드맵 테이블',
            children: (
              <Card bodyStyle={{ padding: 12 }}>
                <Input.Search
                  placeholder="테이블 / 컬럼 / 코드값 / 한국어명 검색"
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  allowClear
                  style={{ marginBottom: 12, maxWidth: 400 }}
                />
                <Table
                  rowKey={(_, i) => String(i)}
                  columns={columns}
                  dataSource={filtered}
                  loading={loading}
                  size="small"
                  pagination={{ pageSize: 30, showSizeChanger: true }}
                  scroll={{ x: 900 }}
                />
              </Card>
            ),
          },
          {
            key: 'prompt',
            label: '프롬프트 주입 미리보기',
            children: (
              <Card
                bodyStyle={{ padding: 12 }}
                extra={
                  <Button icon={<CopyOutlined />} size="small" onClick={copyPrompt}>
                    복사
                  </Button>
                }
              >
                <Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                  SQL 생성 프롬프트의 {'{codemap_section}'} 자리에 주입되는 실제 텍스트입니다.
                </Text>
                <pre style={{
                  background: '#f5f5f5', padding: 12, borderRadius: 4,
                  fontSize: 12, maxHeight: 500, overflow: 'auto',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {promptText || '(비어있음 — DUCKDB_PATH 미설정 또는 테이블 없음)'}
                </pre>
              </Card>
            ),
          },
        ]}
      />
    </div>
  )
}
