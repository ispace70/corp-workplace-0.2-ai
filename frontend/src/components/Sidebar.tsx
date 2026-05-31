"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Search,
  BarChart2,
  ChevronLeft,
  ChevronRight,
  Bot,
  Zap,
  WifiOff,
  Loader2,
  CalendarDays,
  ClipboardList,
} from "lucide-react";
import { RouteMode } from "@/types";
import { fetchLLMStatus } from "@/lib/api";

interface MenuItem {
  id: RouteMode | "schedule" | "mywork";
  label: string;
  icon: React.ElementType;
  desc: string;
  disabled?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  {
    id: "schedule",
    label: "일정관리",
    icon: CalendarDays,
    desc: "개발중",
    disabled: true,
  },
  {
    id: "auto" as RouteMode,
    label: "대시보드",
    icon: LayoutDashboard,
    desc: "개발중",
    disabled: true,
  },
  {
    id: "mywork",
    label: "My업무관리",
    icon: ClipboardList,
    desc: "개발중",
    disabled: true,
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
type LLMStatus = "checking" | "connected" | "disconnected";

export default function Sidebar({ activeMode, onModeChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [llmStatus, setLLMStatus] = useState<LLMStatus>("checking");

  useEffect(() => {
    const check = async () => {
      const { connected } = await fetchLLMStatus();
      setLLMStatus(connected ? "connected" : "disconnected");
    };
    check();
    const interval = setInterval(check, 30_000);
    return () => clearInterval(interval);
  }, []);

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
                기업용 워크플레이스
              </p>
              <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Enterprise AI Agent Platform
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
          const disabled = item.disabled;
          return (
            <button
              key={item.id}
              onClick={() => !disabled && onModeChange(item.id as RouteMode)}
              disabled={disabled}
              className="w-full flex items-center gap-3.5 px-3 py-3 rounded-xl transition-all duration-200 text-left group relative overflow-hidden"
              style={{
                background: active ? "var(--accent-dim)" : "transparent",
                border: `1px solid ${active ? "var(--border-accent)" : "transparent"}`,
                color: active ? "var(--text-primary)" : disabled ? "var(--text-muted)" : "var(--text-secondary)",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
              }}
            >
              {/* 호버 시 은은한 배경 흐름 효과 */}
              {!disabled && (
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ background: "rgba(255, 255, 255, 0.02)" }}
                />
              )}
              <Icon
                size={18}
                className="transition-transform group-hover:scale-105 duration-200"
                style={{
                  flexShrink: 0,
                  color: active ? "var(--accent)" : disabled ? "var(--text-muted)" : "var(--text-secondary)"
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
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-sm font-semibold leading-none">{item.label}</p>
                      {disabled && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                          style={{
                            background: "rgba(107,114,128,0.15)",
                            border: "1px solid rgba(107,114,128,0.25)",
                            color: "#6b7280",
                          }}
                        >
                          개발중
                        </span>
                      )}
                    </div>
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
                background: llmStatus === "connected"
                  ? "rgba(167, 139, 250, 0.04)"
                  : llmStatus === "disconnected"
                  ? "rgba(239, 68, 68, 0.06)"
                  : "rgba(107, 114, 128, 0.06)",
                borderColor: llmStatus === "connected"
                  ? "rgba(167, 139, 250, 0.15)"
                  : llmStatus === "disconnected"
                  ? "rgba(239, 68, 68, 0.2)"
                  : "rgba(107, 114, 128, 0.15)",
              }}
            >
              {llmStatus === "checking" && (
                <Loader2 size={13} className="animate-spin" style={{ color: "#6b7280" }} />
              )}
              {llmStatus === "connected" && (
                <Zap size={13} style={{ color: "var(--accent)" }} className="animate-pulse" />
              )}
              {llmStatus === "disconnected" && (
                <WifiOff size={13} style={{ color: "#ef4444" }} />
              )}
              <span
                className="text-[11px] font-semibold"
                style={{
                  color: llmStatus === "connected"
                    ? "var(--accent)"
                    : llmStatus === "disconnected"
                    ? "#ef4444"
                    : "#6b7280",
                }}
              >
                {llmStatus === "checking" && "연결 확인 중..."}
                {llmStatus === "connected" && "GCP LLM 연결됨"}
                {llmStatus === "disconnected" && "LLM 연결 끊김"}
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
