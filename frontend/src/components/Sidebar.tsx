"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Search,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Bot,
  Zap,
} from "lucide-react";
import { RouteMode } from "@/types";

/**
 * 네비게이션 메뉴 아이템 정의 인터페이스
 */
interface MenuItem {
  id: RouteMode;
  label: string;
  icon: React.ElementType;
  desc: string;
}

/**
 * 사이드바 메뉴 항목 데이터
 * 각 모드(자동 라우팅, 지식검색, 데이터분석)를 식별하고 정보를 나타냅니다.
 */
const MENU_ITEMS: MenuItem[] = [
  {
    id: "auto" as RouteMode,
    label: "대시보드",
    icon: LayoutDashboard,
    desc: "개발중...",
  },
  {
    id: "knowledge" as RouteMode,
    label: "지식검색",
    icon: Search,
    desc: "사내지식 Agent",
  },
  {
    id: "sql" as RouteMode,
    label: "데이터분석",
    icon: BarChart2,
    desc: "SQL Agent",
  },
];

interface SidebarProps {
  /** 현재 활성화된 모드 (auto | knowledge | sql) */
  activeMode: RouteMode;
  /** 모드 변경 시 호출되는 이벤트 핸들러 */
  onModeChange: (mode: RouteMode) => void;
}

/**
 * Sidebar 컴포넌트
 * 어플리케이션의 좌측 네비게이션을 담당하며, 축소/확장(Collapse) 애니메이션 및 
 * 현재 연결 상태(GCP LLM)를 시각적으로 보여주는 역할을 합니다.
 */
export default function Sidebar({ activeMode, onModeChange }: SidebarProps) {
  // 사이드바의 접힘/펼침 상태 관리
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="relative flex flex-col h-full glass border-r"
      style={{
        borderColor: "var(--border-color)",
        minWidth: collapsed ? 68 : 240,
        boxShadow: "4px 0 24px rgba(0,0,0,0.15)"
      }}
    >
      {/* 로고 영역 */}
      <div className="flex items-center gap-3 px-4 py-5 border-b" style={{ borderColor: "var(--border-color)" }}>
        <div
          className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-transform hover:scale-105 duration-200"
          style={{
            background: "linear-gradient(135deg, var(--accent), #7c3aed)",
            boxShadow: "0 0 16px var(--accent-glow)"
          }}
        >
          <Bot size={18} color="#080810" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <p className="font-extrabold text-sm tracking-tight" style={{ color: "var(--accent)" }}>
                Corp Workplace
              </p>
              <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: "var(--text-secondary)" }}>
                AI Agent Platform
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 네비게이션 메뉴 */}
      <nav className="flex-1 py-6 px-3 space-y-2">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onModeChange(item.id)}
              className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl transition-all duration-200 text-left group relative overflow-hidden"
              style={{
                background: active ? "var(--accent-dim)" : "transparent",
                border: `1px solid ${active ? "var(--border-accent)" : "transparent"}`,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
              }}
            >
              {/* 호버 시 은은한 배경 흐름 효과 */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{ background: "rgba(255, 255, 255, 0.02)" }}
              />
              <Icon
                size={18}
                className="transition-transform group-hover:scale-105 duration-200"
                style={{
                  flexShrink: 0,
                  color: active ? "var(--accent)" : "var(--text-secondary)"
                }}
              />
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    className="overflow-hidden"
                  >
                    <p className="text-sm font-semibold leading-none mb-1">{item.label}</p>
                    <p className="text-[11px] leading-none" style={{ color: "var(--text-secondary)" }}>
                      {item.desc}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      {/* 하단 시스템 상태 및 토글 영역 */}
      <div className="p-3 border-t space-y-2" style={{ borderColor: "var(--border-color)" }}>
        {/* GCP LLM 연결 상태 인디케이터 */}
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
              style={{
                background: "rgba(167, 139, 250, 0.04)",
                borderColor: "rgba(167, 139, 250, 0.15)"
              }}
            >
              <Zap size={13} style={{ color: "var(--accent)" }} className="animate-pulse" />
              <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>
                GCP LLM 연결됨
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 사이드바 접기/펼치기 토글 버튼 */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-2 rounded-xl transition-colors hover:bg-[rgba(255,255,255,0.03)]"
          style={{ color: "var(--text-secondary)" }}
          title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </motion.aside>
  );
}
