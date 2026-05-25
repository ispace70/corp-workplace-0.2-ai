import { useEffect, useState } from 'react'
import {
  Button, Card, Input, Space, Tabs, Typography, message, Collapse, Table,
} from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { api } from '../lib/api'

const { Title, Text } = Typography
const { TextArea } = Input

const PROMPT_KEYS = [
  { key: 'sql_gen',    label: 'SQL 생성' },
  { key: 'sql_answer', label: '답변 생성' },
  { key: 'sql_fix',    label: 'SQL 수정' },
]

export default function SqlPrompts() {
  const [prompts, setPrompts]     = useState<Record<string, string>>({})
  const [schema, setSchema]       = useState<Record<string, { comment: string; columns: { column: string; type: string; comment: string }[] }>>({})
  const [activeTab, setActiveTab] = useState('sql_gen')

  useEffect(() => {
    api.getPrompts().then(setPrompts).catch(() => {})
    api.getSchema().then(setSchema).catch(() => {})
  }, [])

  const save = async (key: string) => {
    await api.updatePrompt(key, prompts[key] ?? '')
    message.success('저장되었습니다.')
  }

  const schemaItems = Object.entries(schema).map(([tbl, info]) => ({
    key: tbl,
    label: (
      <span>
        <Text strong>{tbl}</Text>
        {info.comment && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>({info.comment})</Text>}
      </span>
    ),
    children: (
      <Table
        size="small"
        dataSource={info.columns}
        rowKey="column"
        pagination={false}
        columns={[
          { title: '컬럼', dataIndex: 'column', width: 160 },
          { title: '타입', dataIndex: 'type', width: 120 },
          { title: '한국어 설명', dataIndex: 'comment' },
        ]}
      />
    ),
  }))

  return (
    <div>
      <Title level={4} style={{ marginBottom: 4 }}>시스템 프롬프트</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        resources/prompts/ 폴더의 .md 파일에 저장됩니다.
      </Text>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={PROMPT_KEYS.map(({ key, label }) => ({
          key,
          label,
          children: (
            <Card bodyStyle={{ padding: 16 }}>
              <TextArea
                rows={16}
                value={prompts[key] ?? ''}
                onChange={e => setPrompts(prev => ({ ...prev, [key]: e.target.value }))}
                style={{ fontFamily: 'monospace', fontSize: 13 }}
              />
              <Space style={{ marginTop: 12 }}>
                <Button type="primary" icon={<SaveOutlined />} onClick={() => save(key)}>저장</Button>
              </Space>
            </Card>
          ),
        }))}
      />

      {Object.keys(schema).length > 0 && (
        <Card title="현재 DuckDB 스키마" style={{ marginTop: 24 }}>
          <Collapse items={schemaItems} size="small" />
        </Card>
      )}
    </div>
  )
}
