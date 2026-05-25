"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Database, Table, AlertCircle } from "lucide-react";
import { Source, SqlResult } from "@/types";

/**
 * ContentPanel 컴포넌트의 Property 명세
 */
interface ContentPanelProps {
  /** 현재 선택되어 세부 내용을 보여줄 문서 출처 정보 */
  selectedSource?: Source | null;
  /** 현재 렌더링할 SQL 실행 결과 데이터 */
  sqlResult?: SqlResult | null;
  /** 패널 닫기 버튼 클릭 시 호출될 콜백 함수 */
  onClose?: () => void;
}

/**
 * SourceView 컴포넌트
 * 사용자가 특정 문서 출처 칩을 선택했을 때 해당 문서의 제목, 페이지, 본문 콘텐츠를 세련된 어두운 카드 형태로 렌더링합니다.
 */
function SourceView({ source, onClose }: { source: Source; onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 문서 상세 헤더 바 */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b backdrop-blur-md bg-opacity-30"
        style={{ borderColor: "rgba(255, 255, 255, 0.06)", background: "rgba(10, 10, 15, 0.4)" }}
      >
        <div className="flex items-center gap-2.5">
          <FileText size={16} className="text-violet-400" />
          <span className="text-sm font-semibold tracking-wide text-gray-200">
            문서 원본 뷰어
          </span>
        </div>
        {onClose && (
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "var(--text-secondary)" }}
            aria-label="닫기"
          >
            <X size={18} />
          </motion.button>
        )}
      </div>

      {/* 스크롤 가능한 본문 영역 */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        {/* 출처/페이지 요약 메타 정보 카드 */}
        <div
          className="rounded-xl px-4 py-3 text-xs flex flex-wrap gap-x-4 gap-y-1.5"
          style={{
            background: "rgba(139, 92, 246, 0.08)",
            border: "1px solid rgba(139, 92, 246, 0.2)",
          }}
        >
          <div>
            <span className="text-violet-300 font-semibold mr-1.5">출처:</span>
            <span className="text-gray-300">{source.source}</span>
          </div>
          {source.page && (
            <div>
              <span className="text-violet-300 font-semibold mr-1.5">페이지:</span>
              <span className="text-gray-300">{source.page}</span>
            </div>
          )}
        </div>

        {/* 본문 텍스트 영역 */}
        <div
          className="rounded-xl p-4.5 text-[13.5px] leading-relaxed shadow-inner"
          style={{
            background: "rgba(255, 255, 255, 0.02)",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            color: "var(--text-primary)",
            whiteSpace: "pre-wrap",
          }}
        >
          {source.content}
        </div>
      </div>
    </div>
  );
}

/**
 * SqlResultView 컴포넌트
 * 자연어 질의를 변환하여 실행한 SQL 결과 데이터를 표(Table) 형식으로 보여줍니다.
 */
function SqlResultView({ result, onClose }: { result: SqlResult; onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* SQL 결과 헤더 바 */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b backdrop-blur-md bg-opacity-30"
        style={{ borderColor: "rgba(255, 255, 255, 0.06)", background: "rgba(10, 10, 15, 0.4)" }}
      >
        <div className="flex items-center gap-2.5">
          <Table size={16} className="text-emerald-400" />
          <span className="text-sm font-semibold tracking-wide text-gray-200">
            데이터 쿼리 분석 결과
          </span>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(52, 211, 153, 0.1)",
              color: "#34d399",
              border: "1px solid rgba(52, 211, 153, 0.2)",
            }}
          >
            {result.row_count} ROWS
          </span>
        </div>
        {onClose && (
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "var(--text-secondary)" }}
            aria-label="닫기"
          >
            <X size={18} />
          </motion.button>
        )}
      </div>

      {/* 표 형식의 결과 영역 */}
      <div className="flex-1 overflow-auto p-5 custom-scrollbar">
        {result.columns.length > 0 ? (
          <div className="rounded-xl overflow-hidden border border-white/5 shadow-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/10 text-gray-300 font-semibold">
                  {result.columns.map((col) => (
                    <th key={col} className="px-4 py-3 font-medium uppercase tracking-wider">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-gray-400">
                {result.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    {row.map((cell, j) => (
                      <td key={j} className="px-4 py-3 whitespace-nowrap">
                        {cell === null ? (
                          <span className="italic opacity-40 font-mono text-[10px]">NULL</span>
                        ) : (
                          String(cell)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 gap-2 opacity-50">
            <AlertCircle size={28} className="text-gray-400" />
            <p className="text-sm font-medium text-gray-300">조회된 데이터 행이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * EmptyState 컴포넌트
 * 선택된 소스나 쿼리 데이터 결과가 없을 때 보여주는 기본 안내 화면입니다.
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6 bg-gradient-to-b from-transparent to-white/[0.01]">
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
        className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl"
        style={{
          background: "linear-gradient(135deg, rgba(167, 139, 250, 0.1), rgba(167, 139, 250, 0.02))",
          border: "1px solid rgba(167, 139, 250, 0.15)",
        }}
      >
        <Database size={24} className="text-violet-400" />
      </motion.div>
      <div>
        <p className="text-sm font-semibold tracking-wide text-gray-200">
          콘텐츠 상세 뷰어
        </p>
        <p className="text-xs leading-relaxed mt-2 text-gray-400 max-w-[240px] mx-auto">
          AI 응답의 <span className="text-violet-300 font-semibold">출처 문서 칩</span>을 클릭하시거나 
          SQL 분석을 성공하면 결과 테이블이 여기에 표출됩니다.
        </p>
      </div>
    </div>
  );
}

/**
 * ContentPanel 컴포넌트
 * 화면 우측 분할 영역에 실시간 상세 정보(문서 원본 내용 또는 SQL 쿼리 실행 표 데이터)를 노출하며,
 * 정보가 없을 때 안내 문구를 출력합니다.
 */
export default function ContentPanel({ selectedSource, sqlResult, onClose }: ContentPanelProps) {
  return (
    <div
      className="flex flex-col h-full glass transition-all"
      style={{ borderLeft: "1px solid var(--border-color)" }}
    >
      <AnimatePresence mode="wait">
        {selectedSource ? (
          <motion.div
            key="source"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <SourceView source={selectedSource} onClose={onClose} />
          </motion.div>
        ) : sqlResult ? (
          <motion.div
            key="sql"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            <SqlResultView result={sqlResult} onClose={onClose} />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-full"
          >
            <EmptyState />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

