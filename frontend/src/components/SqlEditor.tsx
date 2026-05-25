"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Edit3, Copy, Check, Eye } from "lucide-react";

/**
 * SqlEditor 컴포넌트의 Property 명세
 */
interface SqlEditorProps {
  /** 실행 또는 편집할 원본 SQL 쿼리 문자열 */
  sql: string;
  /** 사용자가 SQL 실행 버튼을 클릭했을 때 편집된 SQL을 넘겨받아 실행하는 콜백 함수 */
  onExecute: (sql: string) => void;
  /** 현재 실행 중이거나 로딩 상태일 때 버튼 및 입력을 비활성화할지 여부 */
  disabled?: boolean;
}

/**
 * SqlEditor 컴포넌트
 * AI가 생성한 SQL 쿼리를 화면에 표시하고, 사용자가 필요한 경우 직접 수정(편집)하여 
 * 데이터베이스에 다시 실행할 수 있는 고급 에디터 카드 컴포넌트입니다.
 */
export default function SqlEditor({ sql, onExecute, disabled }: SqlEditorProps) {
  const [editedSql, setEditedSql] = useState(sql);
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  /**
   * 쿼리를 클립보드에 복사하고 1.5초간 복사 완료 상태 배지를 노출합니다.
   */
  const handleCopy = async () => {
    await navigator.clipboard.writeText(editedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl overflow-hidden glass shadow-xl transition-all"
      style={{ border: "1px solid var(--border-accent)" }}
    >
      {/* 에디터 헤더 영역 */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: "rgba(167, 139, 250, 0.08)", borderBottom: "1px solid var(--border-color)" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider" style={{ color: "#a78bfa" }}>
            SQL 쿼리 에디터
          </span>
          <span className="text-[10px] opacity-60 text-gray-400">
            {isEditing ? "편집 모드 활성화" : "쿼리 검토 중"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* 편집 모드 토글 버튼 */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
            style={{
              color: isEditing ? "#a78bfa" : "var(--text-secondary)",
              background: isEditing ? "rgba(167, 139, 250, 0.12)" : "rgba(255, 255, 255, 0.02)",
              border: `1px solid ${isEditing ? "rgba(167, 139, 250, 0.25)" : "rgba(255, 255, 255, 0.05)"}`,
            }}
          >
            {isEditing ? <Eye size={12} /> : <Edit3 size={12} />}
            {isEditing ? "미리보기" : "편집"}
          </motion.button>
          
          {/* 복사 버튼 */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all"
            style={{
              color: "var(--text-secondary)",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)"
            }}
          >
            {copied ? <Check size={12} style={{ color: "#a78bfa" }} /> : <Copy size={12} />}
            {copied ? "복사완료" : "복사"}
          </motion.button>
        </div>
      </div>

      {/* SQL 코드 본문 영역 */}
      <div style={{ background: "rgba(10, 10, 15, 0.45)" }}>
        {isEditing ? (
          <textarea
            value={editedSql}
            onChange={(e) => setEditedSql(e.target.value)}
            className="w-full bg-transparent outline-none p-4 font-mono text-[12px] leading-relaxed resize-none custom-scrollbar"
            style={{ color: "#a78bfa", minHeight: 120, maxHeight: 300 }}
            spellCheck={false}
          />
        ) : (
          <pre
            className="p-4 overflow-x-auto text-[12px] font-mono leading-relaxed custom-scrollbar"
            style={{ color: "#e2e8f0", maxHeight: 300 }}
          >
            <code>{editedSql}</code>
          </pre>
        )}
      </div>

      {/* 실행 및 액션 영역 */}
      <div
        className="flex justify-between items-center px-4 py-3"
        style={{ background: "rgba(10, 10, 15, 0.2)", borderTop: "1px solid var(--border-color)" }}
      >
        <span className="text-[10px] text-gray-500 font-medium">
          수정된 쿼리는 데이터분석 결과에 실시간으로 반영됩니다.
        </span>
        <motion.button
          whileHover={!disabled ? { scale: 1.03 } : {}}
          whileTap={!disabled ? { scale: 0.97 } : {}}
          onClick={() => onExecute(editedSql)}
          disabled={disabled}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl shadow-lg transition-all"
          style={{
            background: disabled 
              ? "rgba(255, 255, 255, 0.05)" 
              : "linear-gradient(135deg, #34d399, #059669)",
            color: disabled ? "var(--text-secondary)" : "#ffffff",
            border: `1px solid ${disabled ? "rgba(255, 255, 255, 0.05)" : "transparent"}`,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <Play size={12} fill={disabled ? "none" : "currentColor"} />
          SQL 실행
        </motion.button>
      </div>
    </motion.div>
  );
}

