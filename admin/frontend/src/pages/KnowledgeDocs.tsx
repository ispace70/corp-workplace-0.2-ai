import { useEffect, useRef, useState } from 'react'
import {
  Button, Input, Popconfirm, Space, Table, Tag, Tooltip,
  Typography, Upload, message, Modal,
} from 'antd'
import {
  DeleteOutlined, FileOutlined, GlobalOutlined,
  InboxOutlined, PlusOutlined, ReloadOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { api, type DocRecord } from '../lib/api'

const { Title, Text } = Typography
const { Dragger } = Upload

const STATUS_TAG: Record<string, JSX.Element> = {
  indexed: <Tag color="success">인덱싱됨</Tag>,
  pending: <Tag color="processing">처리중</Tag>,
  error:   <Tag color="error">오류</Tag>,
}

export default function KnowledgeDocs() {
  const [docs, setDocs]         = useState<DocRecord[]>([])
  const [loading, setLoading]   = useState(false)
  const [urlModal, setUrlModal] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = async () => {
    setLoading(true)
    try { setDocs(await api.listDocs()) } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    intervalRef.current = setInterval(() => {
      api.listDocs().then(setDocs).catch(() => {})
    }, 5000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const handleUpload = async (file: File) => {
    try {
      await api.uploadDoc(file)
      message.success(`${file.name} 업로드 완료 (인덱싱 중...)`)
      load()
    } catch { message.error('업로드 실패') }
    return false
  }

  const handleAddSite = async () => {
    if (!urlInput.trim()) return
    setUrlLoading(true)
    try {
      await api.addSite(urlInput.trim())
      message.success('크롤링을 시작했습니다. 잠시 후 결과를 확인하세요.')
      setUrlModal(false)
      setUrlInput('')
      load()
    } catch { message.error('크롤링 요청 실패') }
    finally { setUrlLoading(false) }
  }

  const handleReindex = async (id: string) => {
    await api.reindexDoc(id)
    message.info('재인덱싱을 시작했습니다.')
    load()
  }

  const handleDelete = async (id: string) => {
    await api.deleteDoc(id)
    message.success('문서가 삭제되었습니다.')
    load()
  }

  const columns: ColumnsType<DocRecord> = [
    {
      title: '파일명',
      dataIndex: 'filename',
      ellipsis: true,
      render: (name, rec) =>
        rec.file_type === 'url'
          ? <><GlobalOutlined style={{ marginRight: 6, color: '#1677ff' }} /><Tooltip title={rec.file_path}>{name}</Tooltip></>
          : <><FileOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />{name}</>,
    },
    {
      title: '종류',
      dataIndex: 'file_type',
      width: 80,
      render: t => <Tag>{t.toUpperCase()}</Tag>,
    },
    { title: '청크수', dataIndex: 'chunk_count', width: 80, align: 'right' },
    { title: '상태', dataIndex: 'status', width: 100, render: s => STATUS_TAG[s] ?? <Tag>{s}</Tag> },
    { title: '등록일', dataIndex: 'created_at', width: 160 },
    {
      title: '작업',
      width: 100,
      render: (_, rec) => (
        <Space size="small">
          <Tooltip title="재인덱싱">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => handleReindex(rec.id)} />
          </Tooltip>
          <Popconfirm title="문서를 삭제하시겠습니까?" onConfirm={() => handleDelete(rec.id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>문서 관리</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>새로고침</Button>
          <Button icon={<GlobalOutlined />} onClick={() => setUrlModal(true)}>URL 학습</Button>
        </Space>
      </div>

      <Dragger
        multiple
        showUploadList={false}
        beforeUpload={handleUpload}
        accept=".pdf,.docx,.doc,.txt,.md,.html,.htm,.hwpx,.hwp,.xlsx,.xls,.pptx,.ppt"
        style={{ marginBottom: 24 }}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text">파일을 드래그하거나 클릭하여 업로드</p>
        <p className="ant-upload-hint" style={{ color: '#999' }}>
          pdf doc docx txt md html hwp hwpx xls xlsx ppt pptx
        </p>
      </Dragger>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={docs}
        loading={loading}
        size="small"
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title={<><GlobalOutlined style={{ marginRight: 8 }} />URL 학습</>}
        open={urlModal}
        onCancel={() => setUrlModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setUrlModal(false)}>취소</Button>,
          <Button key="start" type="primary" icon={<PlusOutlined />} loading={urlLoading} onClick={handleAddSite}>
            학습 시작
          </Button>,
        ]}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          URL을 입력하면 페이지를 크롤링하여 ChromaDB에 인덱싱합니다.
        </Text>
        <Input
          prefix={<GlobalOutlined />}
          placeholder="https://example.com/page"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onPressEnter={handleAddSite}
          autoFocus
        />
      </Modal>
    </div>
  )
}
