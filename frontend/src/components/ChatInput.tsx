"use client";

import { useState, useRef, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, Zap, BookOpen, Database } from "lucide-react";
import { RouteMode } from "@/types";

/**
 * ChatInput 컴포넌트의 Property 명세
 */
interface ChatInputProps {
  /** 메시지 전송 시 호출되는 콜백 함수 */
  onSend: (message: string) => void;
  /** 입력창 및 전송 버튼 비활성화 여부 */
  disabled?: boolean;
  /** 현재 선택된 라우팅 모드 (auto, knowledge, sql) */
  mode: RouteMode;
  /** 모드 변경 시 호출되는 콜백 함수 */
  onModeChange: (mode: RouteMode) => void;
}

/**
 * 모드 옵션 정의 리스트
 * 각 모드별 아이콘, 레이블, 액센트 색상을 가지고 있습니다.
 */
const MODE_OPTS: { id: RouteMode; label: string; icon: React.ElementType; color: string; bgDim: string }[] = [
  { id: "auto", label: "Auto", icon: Zap, color: "#a78bfa", bgDim: "rgba(167, 139, 250, 0.15)" },
  { id: "knowledge", label: "지식검색", icon: BookOpen, color: "#60a5fa", bgDim: "rgba(96, 165, 250, 0.15)" },
  { id: "sql", label: "데이터분석", icon: Database, color: "#34d399", bgDim: "rgba(52, 211, 153, 0.15)" },
];

/**
 * ChatInput 컴포넌트
 * 사용자로부터 대화 텍스트 입력을 받고, 라우팅 모드(Auto, 지식검색, 데이터분석)를 변경할 수 있는 UI를 제공합니다.
 * 글래스모피즘 테마와 입력창 포커스 시의 부드러운 Glow 보더 효과를 포함합니다.
 */
export default function ChatInput({ onSend, disabled, mode, onModeChange }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /**
   * 메시지를 전송하는 핸들러 함수
   * 빈 값이나 비활성화 상태에서는 동작하지 않습니다.
   */
  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  /**
   * Enter 키 입력을 감지해 메시지를 전송하는 핸들러
   * Shift + Enter는 줄바꿈으로 동작하게 합니다.
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * 텍스트 입력 시 높이를 입력 글자 수에 맞추어 유동적으로 조절해주는 핸들러
   */
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  return (
    <div
      className="glass rounded-2xl p-3 transition-all duration-300"
      style={{
        border: isFocused 
          ? `1px solid ${MODE_OPTS.find(o => o.id === mode)?.color || "var(--accent)"}` 
          : "1px solid var(--border-accent)",
        boxShadow: isFocused 
          ? `0 0 15px ${MODE_OPTS.find(o => o.id === mode)?.bgDim || "rgba(167, 139, 250, 0.1)"}` 
          : "0 8px 32px rgba(0, 0, 0, 0.2)",
      }}
    >
      {/* 모드 선택 칩 영역 */}
      <div className="flex gap-2 mb-2.5">
        {MODE_OPTS.map((opt) => {
          const Icon = opt.icon;
          const active = mode === opt.id;
          return (
            <motion.button
              key={opt.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onModeChange(opt.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: active ? opt.bgDim : "rgba(255, 255, 255, 0.02)",
                border: `1px solid ${active ? opt.color : "rgba(255, 255, 255, 0.05)"}`,
                color: active ? opt.color : "var(--text-secondary)",
              }}
            >
              <Icon size={12} style={{ color: active ? opt.color : "inherit" }} />
              {opt.label}
            </motion.button>
          );
        })}
      </div>

      {/* 입력 필드 및 전송 버튼 영역 */}
      <div className="flex items-end gap-2.5 pl-1.5">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={
            mode === "knowledge"
              ? "사내 지식 문서에서 찾으실 검색어를 입력하세요..."
              : mode === "sql"
              ? "분석하고자 하는 데이터 질의 내용을 입력하세요..."
              : "무엇이든 물어보세요 (Enter로 전송, Shift+Enter로 줄바꿈)"
          }
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-[13.5px] leading-relaxed transition-all placeholder:text-gray-500"
          style={{
            color: "var(--text-primary)",
            maxHeight: 160,
            minHeight: 36,
          }}
        />

        <motion.button
          whileHover={input.trim() && !disabled ? { scale: 1.05 } : {}}
          whileTap={input.trim() && !disabled ? { scale: 0.95 } : {}}
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="flex-shrink-0 w-9.5 h-9.5 rounded-xl flex items-center justify-center transition-all shadow-lg"
          style={{
            background: input.trim() && !disabled 
              ? `linear-gradient(135deg, ${MODE_OPTS.find(o => o.id === mode)?.color || "var(--accent)"}, rgba(124, 58, 237, 0.8))` 
              : "rgba(255, 255, 255, 0.05)",
            color: input.trim() && !disabled ? "#ffffff" : "var(--text-secondary)",
            border: `1px solid ${input.trim() && !disabled ? "transparent" : "rgba(255, 255, 255, 0.05)"}`,
            cursor: disabled || !input.trim() ? "not-allowed" : "pointer",
          }}
        >
          <AnimatePresence mode="wait">
            {disabled ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Loader2 size={16} className="animate-spin" />
              </motion.div>
            ) : (
              <motion.div key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Send size={15} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}

