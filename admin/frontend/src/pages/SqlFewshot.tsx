import { useEffect, useState } from 'react'
import {
  Button, Form, Input, Modal, Popconfirm, Space, Table, Tag,
  Typography, Upload, message,
} from 'antd'
import {
  DeleteOutlined, EditOutlined, PlusOutlined,
  ReloadOutlined, UploadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { api, type FewshotRecord } from '../lib/api'

const { Title, Text } = Typography
const { TextArea } = Input

export default function SqlFewshot() {
  const [rows, setRows]         = useState<FewshotRecord[]>([])
  const [loading, setLoading]   = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [editRec, setEditRec]   = useState<FewshotRecord | null>(null)
  const [form] = Form.useForm()

  const load = async () => {
    setLoading(true)
    try { setRows(await api.listFewshots()) } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const openAdd = () => { form.resetFields(); setAddModal(true) }
  const openEdit = (rec: FewshotRecord) => {
    setEditRec(rec)
    form.setFieldsValue({ ...rec, tags: (rec.tags ?? []).join(', ') })
  }

  const handleSave = async () => {
    const values = await form.validateFields()
    const tags: string[] = (values.tags ?? '').split(',').map((t: string) => t.trim()).filter(Boolean)
    if (editRec) {
      await api.updateFewshot(editRec.id, values.question, values.sql, tags)
      message.success('수정되었습니다.')
      setEditRec(null)
    } else {
      await api.createFewshot(values.question, values.sql, tags)
      message.success('저장되었습니다.')
      setAddModal(false)
    }
    form.resetFields()
    load()
  }

  const handleDelete = async (id: string) => {
    await api.deleteFewshot(id)
    message.success('삭제되었습니다.')
    load()
  }

  const handleImport = (file: File) => {
    const reader = new FileReader()
    reader.onload = async e => {
      try {
        const items: { question: string; sql: string; tags?: string[] }[] = JSON.parse(e.target?.result as string)
        let ok = 0
        for (const item of items) {
          if (item.question && item.sql) {
            await api.createFewshot(item.question, item.sql, item.tags ?? [])
            ok++
          }
        }
        message.success(`Import 완료: ${ok}건`)
        load()
      } catch { message.error('JSON 파싱 실패') }
    }
    reader.readAsText(file)
    return false
  }

  const columns: ColumnsType<FewshotRecord> = [
    { title: '자연어 질문', dataIndex: 'question', ellipsis: true },
    {
      title: 'SQL',
      dataIndex: 'sql',
      ellipsis: true,
      render: s => <Text code style={{ fontSize: 12 }}>{s}</Text>,
    },
    {
      title: '태그',
      dataIndex: 'tags',
      width: 180,
      render: (tags: string[]) => (tags ?? []).map(t => <Tag key={t}>{t}</Tag>),
    },
    { title: '등록일', dataIndex: 'created_at', width: 160 },
    {
      title: '작업',
      width: 100,
      render: (_, rec) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(rec)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(rec.id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const formModal = (
    <Modal
      title={editRec ? '예시 수정' : '예시 추가'}
      open={addModal || editRec !== null}
      onCancel={() => { setAddModal(false); setEditRec(null); form.resetFields() }}
      onOk={handleSave}
      okText="저장"
      cancelText="취소"
      width={640}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="question" label="자연어 질문" rules={[{ required: true }]}>
          <Input placeholder="예: 지난달 매출 상위 10개 제품은?" />
        </Form.Item>
        <Form.Item name="sql" label="SQL 쿼리" rules={[{ required: true }]}>
          <TextArea rows={6} style={{ fontFamily: 'monospace', fontSize: 13 }} placeholder="SELECT ..." />
        </Form.Item>
        <Form.Item name="tags" label="태그 (쉼표 구분)">
          <Input placeholder="예: 가맹점, 가입완료, 수" />
        </Form.Item>
      </Form>
    </Modal>
  )

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Few-Shot 예시</Title>
        <Space>
          <Upload beforeUpload={handleImport} showUploadList={false} accept=".json">
            <Button icon={<UploadOutlined />}>JSON Import</Button>
          </Upload>
          <Button icon={<ReloadOutlined />} onClick={load}>새로고침</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>예시 추가</Button>
        </Space>
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        총 {rows.length}개 — resources/sql_fewshots.yml 파일에 저장됩니다.
      </Text>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
        expandable={{
          expandedRowRender: rec => (
            <pre style={{ margin: 0, fontSize: 12, background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
              {rec.sql}
            </pre>
          ),
        }}
      />
      {formModal}
    </div>
  )
}
