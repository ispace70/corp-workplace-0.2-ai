"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, FileText, Database, Table, AlertCircle,
  Download, Play, ChevronLeft, ChevronRight, Code2,
} from "lucide-react";
import { Source, SqlResult } from "@/types";

interface ContentPanelProps {
  selectedSource?: Source | null;
  sqlResult?: SqlResult | null;
  currentSql?: string;
  onReExecute?: (sql: string) => void;
  isReExecuting?: boolean;
  onClose?: () => void;
}

function SourceView({ source, onClose }: { source: Source; onClose?: () => void }) {
  return (
    <div className="flex flex-col h-full bg-transparent">
      <div
        className="flex items-center justify-between px-5 py-4 border-b backdrop-blur-md bg-opacity-30"
        style={{ borderColor: "rgba(255, 255, 255, 0.06)", background: "rgba(10, 10, 15, 0.4)" }}
      >
        <div className="flex items-center gap-2.5">
          <FileText size={16} className="text-violet-400" />
          <span className="text-sm font-semibold tracking-wide text-gray-200">문서 원본 뷰어</span>
        </div>
        {onClose && (
          <motion.button
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.95 }}
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={18} />
          </motion.button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
        <div
          className="rounded-xl px-4 py-3 text-xs flex flex-wrap gap-x-4 gap-y-1.5"
          style={{ background: "rgba(139, 92, 246, 0.08)", border: "1px solid rgba(139, 92, 246, 0.2)" }}
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

const ROWS_PER_PAGE = 20;

function SqlResultView({
  result,
  currentSql,
  onReExecute,
  isReExecuting,
  onClose,
}: {
  result: SqlResult;
  currentSql?: string;
  onReExecute?: (sql: string) => void;
  isReExecuting?: boolean;
  onClose?: () => void;
}) {
  const [page, setPage] = useState(1);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [editedSql, setEditedSql] = useState(currentSql ?? "");

  // 새 결과가 오면 페이지 1로 리셋
  useEffect(() => {
    setPage(1);
  }, [result]);

  // 외부에서 SQL이 바뀌면 동기화
  useEffect(() => {
    setEditedSql(currentSql ?? "");
  }, [currentSql]);

  const totalPages = Math.max(1, Math.ceil(result.rows.length / ROWS_PER_PAGE));
  const visibleRows = result.rows.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const downloadCsv = () => {
    const header = result.columns.join(",");
    const rows = result.rows
      .map((row) =>
        row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
      )
      .join("\n");
    // BOM(﻿) 추가 → 엑셀 한글 깨짐 방지
    const blob = new Blob(["﻿" + header + "\n" + rows], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "result.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* 헤더 */}
      <div
        className="flex items-center justify-between px-5 py-4 border-b backdrop-blur-md"
        style={{ borderColor: "rgba(255, 255, 255, 0.06)", background: "rgba(10, 10, 15, 0.4)" }}
      >
        <div className="flex items-center gap-2.5">
          <Table size={16} className="text-emerald-400" />
          <span className="text-sm font-semibold tracking-wide text-gray-200">데이터 쿼리 분석 결과</span>
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
        <div className="flex items-center gap-2">
          {/* SQL 수정 토글 */}
          {currentSql && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSqlOpen((v) => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: sqlOpen ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${sqlOpen ? "rgba(167,139,250,0.3)" : "rgba(255,255,255,0.08)"}`,
                color: sqlOpen ? "#a78bfa" : "var(--text-secondary)",
              }}
            >
              <Code2 size={12} />
              SQL 수정
            </motion.button>
          )}
          {/* CSV 저장 */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={downloadCsv}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: "rgba(52,211,153,0.08)",
              border: "1px solid rgba(52,211,153,0.2)",
              color: "#34d399",
            }}
          >
            <Download size={12} />
            CSV 저장
          </motion.button>
          {onClose && (
            <motion.button
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={18} />
            </motion.button>
          )}
        </div>
      </div>

      {/* SQL 수정/재실행 패널 */}
      <AnimatePresence>
        {sqlOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b"
            style={{ borderColor: "rgba(167,139,250,0.15)" }}
          >
            <div className="p-4 space-y-2" style={{ background: "rgba(10,10,20,0.5)" }}>
              <textarea
                value={editedSql}
                onChange={(e) => setEditedSql(e.target.value)}
                className="w-full rounded-lg p-3 text-[12px] font-mono leading-relaxed outline-none resize-none"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(167,139,250,0.2)",
                  color: "#a78bfa",
                  minHeight: 100,
                  maxHeight: 220,
                }}
                spellCheck={false}
              />
              <div className="flex justify-end">
                <motion.button
                  whileHover={!isReExecuting ? { scale: 1.03 } : {}}
                  whileTap={!isReExecuting ? { scale: 0.97 } : {}}
                  onClick={() => onReExecute?.(editedSql)}
                  disabled={isReExecuting || !editedSql.trim()}
                  className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl transition-all"
                  style={{
                    background: isReExecuting
                      ? "rgba(255,255,255,0.05)"
                      : "linear-gradient(135deg, #34d399, #059669)",
                    color: isReExecuting ? "var(--text-secondary)" : "#fff",
                    cursor: isReExecuting ? "not-allowed" : "pointer",
                  }}
                >
                  <Play size={12} fill={isReExecuting ? "none" : "currentColor"} />
                  {isReExecuting ? "실행 중..." : "재실행"}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 결과 테이블 */}
      <div className="flex-1 overflow-auto p-5 custom-scrollbar">
        {result.columns.length > 0 ? (
          <div className="rounded-xl overflow-hidden border border-white/5 shadow-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/10 text-gray-300 font-semibold">
                  {result.columns.map((col) => (
                    <th key={col} className="px-4 py-3 font-medium uppercase tracking-wider whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04] text-gray-400">
                {visibleRows.map((row, i) => (
                  <tr key={i} className="hover:bg-white/[0.02] transition-colors">
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

      {/* 페이지 네비게이션 */}
      {totalPages > 1 && (
        <div
          className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(10,10,15,0.3)" }}
        >
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {(page - 1) * ROWS_PER_PAGE + 1}–{Math.min(page * ROWS_PER_PAGE, result.row_count)} / {result.row_count}행
          </span>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={page > 1 ? { scale: 1.05 } : {}}
              whileTap={page > 1 ? { scale: 0.95 } : {}}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: page <= 1 ? "var(--text-muted)" : "var(--text-secondary)",
                cursor: page <= 1 ? "not-allowed" : "pointer",
              }}
            >
              <ChevronLeft size={12} /> 이전
            </motion.button>
            <span className="text-[11px] font-bold px-2" style={{ color: "var(--accent)" }}>
              {page} / {totalPages}
            </span>
            <motion.button
              whileHover={page < totalPages ? { scale: 1.05 } : {}}
              whileTap={page < totalPages ? { scale: 0.95 } : {}}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: page >= totalPages ? "var(--text-muted)" : "var(--text-secondary)",
                cursor: page >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              다음 <ChevronRight size={12} />
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}

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
        <p className="text-sm font-semibold tracking-wide text-gray-200">콘텐츠 상세 뷰어</p>
        <p className="text-xs leading-relaxed mt-2 text-gray-400 max-w-[240px] mx-auto">
          AI 응답의 <span className="text-violet-300 font-semibold">출처 문서 칩</span>을 클릭하시거나
          SQL 분석을 성공하면 결과 테이블이 여기에 표출됩니다.
        </p>
      </div>
    </div>
  );
}

export default function ContentPanel({
  selectedSource,
  sqlResult,
  currentSql,
  onReExecute,
  isReExecuting,
  onClose,
}: ContentPanelProps) {
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
            <SqlResultView
              result={sqlResult}
              currentSql={currentSql}
              onReExecute={onReExecute}
              isReExecuting={isReExecuting}
              onClose={onClose}
            />
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
