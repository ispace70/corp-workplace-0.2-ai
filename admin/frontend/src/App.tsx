import { useState } from 'react'
import { ConfigProvider, Layout, Menu, Typography, theme } from 'antd'
import koKR from 'antd/locale/ko_KR'
import {
  FileOutlined, SettingOutlined, DatabaseOutlined,
  AimOutlined, AppstoreOutlined, ToolOutlined,
} from '@ant-design/icons'

import KnowledgeDocs     from './pages/KnowledgeDocs'
import KnowledgeSettings from './pages/KnowledgeSettings'
import SqlPrompts        from './pages/SqlPrompts'
import SqlFewshot        from './pages/SqlFewshot'
import SqlCodemap        from './pages/SqlCodemap'

const { Header, Sider, Content } = Layout
const { Text } = Typography

const PAGES: Record<string, JSX.Element> = {
  knowledge_docs:     <KnowledgeDocs />,
  knowledge_settings: <KnowledgeSettings />,
  sql_prompts:        <SqlPrompts />,
  sql_fewshot:        <SqlFewshot />,
  sql_codemap:        <SqlCodemap />,
}

const MENU_ITEMS = [
  {
    key: 'knowledge',
    label: '지식검색 관리',
    type: 'group' as const,
    children: [
      { key: 'knowledge_docs',     icon: <FileOutlined />,     label: '문서 관리' },
      { key: 'knowledge_settings', icon: <SettingOutlined />,  label: '설정 / 벡터 갱신' },
    ],
  },
  { type: 'divider' as const },
  {
    key: 'sql',
    label: '데이터분석 관리',
    type: 'group' as const,
    children: [
      { key: 'sql_prompts', icon: <DatabaseOutlined />, label: '시스템 프롬프트' },
      { key: 'sql_fewshot', icon: <AimOutlined />,      label: 'Few-Shot 예시' },
      { key: 'sql_codemap', icon: <AppstoreOutlined />, label: '코드맵' },
    ],
  },
]

export default function App() {
  const [current, setCurrent] = useState('knowledge_docs')

  return (
    <ConfigProvider locale={koKR} theme={{ token: { colorPrimary: '#1677ff' } }}>
      <Layout style={{ minHeight: '100vh' }}>

        {/* Header */}
        <Header style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#fff', borderBottom: '1px solid #f0f0f0', padding: '0 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ToolOutlined style={{ fontSize: 20, color: '#1677ff' }} />
            <Text strong style={{ fontSize: 16 }}>Corp AI Workplace</Text>
            <span style={{
              fontSize: 12, padding: '1px 8px', borderRadius: 4,
              background: '#fff1f0', border: '1px solid #ffccc7', color: '#cf1322',
            }}>ADMIN</span>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <a href="http://localhost:3000" target="_blank" rel="noreferrer"
               style={{ color: '#8c8c8c', fontSize: 13 }}>← 사용자 앱</a>
            <a href="http://localhost:8009/docs" target="_blank" rel="noreferrer"
               style={{ color: '#8c8c8c', fontSize: 13 }}>API Docs</a>
          </div>
        </Header>

        <Layout>
          {/* Sidebar */}
          <Sider width={200} style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}>
            <Menu
              mode="inline"
              selectedKeys={[current]}
              onClick={({ key }) => setCurrent(key)}
              items={MENU_ITEMS}
              style={{ height: '100%', borderRight: 0, paddingTop: 8 }}
            />
          </Sider>

          {/* Content */}
          <Content style={{ padding: 24, background: '#f7f8fc' }}>
            <div style={{ background: '#fff', padding: 24, borderRadius: 8, minHeight: '100%' }}>
              {PAGES[current]}
            </div>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}
