"use client";

import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, Bot, HelpCircle, BookOpen, Database } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import SqlEditor from "./SqlEditor";
import { Message, RouteMode, RouteLabel, Source, SqlResult } from "@/types";
import { sendChat, executeSQL } from "@/lib/api";

interface ChatPanelProps {
  /** 대화 메시지 목록 */
  messages: Message[];
  /** 대화 메시지 상태 변경 함수 */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** 현재 활성화된 라우트 모드 (auto | knowledge | sql) */
  mode: RouteMode;
  /** 라우트 모드 변경 함수 */
  setMode: (mode: RouteMode) => void;
  /** 로딩 상태 여부 */
  isLoading: boolean;
  /** 로딩 상태 변경 함수 */
  setIsLoading: (v: boolean) => void;
  /** 소스 문서 클릭 시 호출되는 콜백 (스플릿 패널 오픈용) */
  onSourceClick: (src: Source) => void;
  /** SQL 실행 결과 수신 시 호출되는 콜백 (스플릿 패널 오픈용, sql은 실행된 쿼리) */
  onSqlResult: (result: SqlResult, sql: string) => void;
}

// 고유한 메시지 ID 생성을 위한 카운터 변수
let _msgIdCounter = 0;

/**
 * 고유한 메시지 식별용 ID를 생성하는 함수
 */
function newId() {
  return `msg-${Date.now()}-${_msgIdCounter++}`;
}

/**
 * ChatPanel 컴포넌트
 * 사용자와 AI Agent 간의 대화가 진행되는 메인 채팅 창입니다.
 * SSE 스트리밍 방식으로 백엔드의 응답(텍스트, 소스 문서, SQL 쿼리, SQL 실행 결과)을 받아 실시간으로 화면을 업데이트합니다.
 */
export default function ChatPanel({
  messages,
  setMessages,
  mode,
  setMode,
  isLoading,
  setIsLoading,
  onSourceClick,
  onSqlResult,
}: ChatPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const pendingSqlQueryRef = useRef<string>("");

  // 새로운 메시지가 추가될 때마다 대화 영역을 가장 아래로 부드럽게 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * 사용자가 전송한 메시지를 화면에 추가하는 함수
   */
  const addUserMessage = (content: string) => {
    const msg: Message = { id: newId(), role: "user", content };
    setMessages((prev) => [...prev, msg]);
    return msg;
  };

  /**
   * AI의 비어있는 스트리밍 전용 메시지를 생성하여 화면에 추가하는 함수
   */
  const addAiMessage = (): string => {
    const id = newId();
    const msg: Message = { id, role: "assistant", content: "", isStreaming: true };
    setMessages((prev) => [...prev, msg]);
    return id;
  };

  /**
   * 특정 AI 메시지의 속성을 실시간으로 업데이트하는 유틸리티 함수 (스트리밍 데이터 반영용)
   */
  const updateAiMessage = (id: string, updater: (prev: Message) => Partial<Message>) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...updater(m) } : m))
    );
  };

  /**
   * 대화 입력 및 전송 처리를 담당하는 비동기 함수
   * SSE 연결을 개시하고, chunk 형태로 전달받는 데이터(텍스트, 소스, SQL 등)를 실시간 바인딩합니다.
   */
  const handleSend = useCallback(
    async (text: string) => {
      if (isLoading) return;
      addUserMessage(text);
      pendingSqlQueryRef.current = text; // SQL 재실행 시 원본 질문을 참조하기 위해 백업

      setIsLoading(true);
      const aiId = addAiMessage(); // 스트리밍 응답을 수신할 AI 메시지 버블 추가

      // SSE API 호출을 통해 실시간 스트리밍 처리
      await sendChat(text, mode, {
        onRoute: (route) => {
          // 라우팅 결과(knowledge | sql | general) 반영
          updateAiMessage(aiId, () => ({ route: route as RouteLabel }));
        },
        onText: (chunk) => {
          // 마크다운 텍스트 추가 반영
          updateAiMessage(aiId, (prev) => ({ content: prev.content + chunk }));
        },
        onSources: (sources) => {
          // 지식 검색 소스 리스트 반영
          updateAiMessage(aiId, () => ({ sources }));
        },
        onSqlReview: (sql) => {
          // 생성된 SQL 쿼리 검토 컴포넌트 노출
          updateAiMessage(aiId, () => ({ sqlReview: sql }));
        },
        onSqlResult: (result) => {
          // SQL 실행 결과 바인딩 및 상세 패널 오픈
          updateAiMessage(aiId, () => ({ sqlResult: result }));
          onSqlResult(result, "");
        },
        onDone: () => {
          // 스트리밍 종료 처리
          updateAiMessage(aiId, () => ({ isStreaming: false }));
          setIsLoading(false);
        },
        onError: (err) => {
          // 에러 발생 시 사용자 안내 메시지 추가
          updateAiMessage(aiId, (prev) => ({
            content: prev.content + `\n\n❌ 오류: ${err}`,
            isStreaming: false,
          }));
          setIsLoading(false);
        },
      });
    },
    [isLoading, mode, onSqlResult]
  );

  /**
   * 사용자가 검토용 SQL 에디터에서 'SQL 실행' 버튼을 눌렀을 때 호출되는 함수
   */
  const handleExecuteSql = useCallback(
    async (aiMsgId: string, sql: string) => {
      setIsLoading(true);
      // 결과를 보여줄 새로운 AI 메시지를 리스트에 생성
      const execId = addAiMessage();
      updateAiMessage(execId, () => ({ route: "sql" as RouteLabel }));

      // SQL 실행 API 호출 및 결과 스트리밍 바인딩
      await executeSQL(sql, pendingSqlQueryRef.current, {
        onText: (chunk) => {
          updateAiMessage(execId, (prev) => ({ content: prev.content + chunk }));
        },
        onSqlResult: (result) => {
          updateAiMessage(execId, () => ({ sqlResult: result }));
          onSqlResult(result, sql);
        },
        onSqlReview: (newSql) => {
          updateAiMessage(execId, () => ({ sqlReview: newSql }));
        },
        onDone: () => {
          updateAiMessage(execId, () => ({ isStreaming: false }));
          // 원래 쿼리 수정 제안을 보여주던 SqlEditor 컴포넌트 제거 (실행 완료되었으므로)
          updateAiMessage(aiMsgId, () => ({ sqlReview: undefined }));
          setIsLoading(false);
        },
        onError: (err) => {
          updateAiMessage(execId, (prev) => ({
            content: prev.content + `\n\n❌ 오류: ${err}`,
            isStreaming: false,
          }));
          setIsLoading(false);
        },
      });
    },
    [setIsLoading, onSqlResult]
  );

  /**
   * 전체 대화 기록을 클리어하는 함수
   */
  const clearChat = () => {
    setMessages([]);
    setIsLoading(false);
  };

  /**
   * 추천 프롬프트 카드를 클릭했을 때 해당 질문을 바로 전송해주는 래퍼 핸들러
   */
  const handlePromptClick = (text: string) => {
    if (!isLoading) {
      handleSend(text);
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-secondary)" }}>
      {/* 채팅창 헤더 */}
      <div
        className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0"
        style={{ borderColor: "var(--border-color)", background: "rgba(8, 8, 16, 0.2)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#10b981] animate-pulse" />
          <span className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Workplace AI Agent
          </span>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all hover:bg-[rgba(255,255,255,0.03)]"
            style={{ color: "var(--text-secondary)", borderColor: "var(--border-color)" }}
            title="대화 초기화"
          >
            <Trash2 size={12} />
            전체 초기화
          </button>
        )}
      </div>

      {/* 대화 뷰포트 영역 */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <AnimatePresence initial={false}>
          {messages.length === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex flex-col items-center justify-center min-h-[80%] text-center py-8"
            >
              {/* 빛 번짐이 포함된 세련된 원형 엠블럼 */}
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 transition-transform hover:scale-105 duration-300"
                style={{
                  background: "linear-gradient(135deg, rgba(167, 139, 250, 0.15), rgba(124, 58, 237, 0.05))",
                  border: "1px solid var(--border-accent)",
                  boxShadow: "0 0 35px var(--accent-glow)",
                }}
              >
                <Bot size={34} style={{ color: "var(--accent)" }} />
              </div>
              
              <h2 className="text-2xl font-extrabold mb-2 tracking-tight" style={{ color: "var(--text-primary)" }}>
                어떤 업무를 도와드릴까요?
              </h2>
              <p className="text-xs max-w-sm mb-8 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                사내 데이터 분석 및 각종 PDF/DOCX 지식 기지를 기반으로 신속하게 질의에 답변을 제공합니다.
              </p>

              {/* 퀵 대화 시작 가이드 카드 (추천 프롬프트 카드 그리드) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-md w-full">
                <button
                  onClick={() => handlePromptClick("가입 완료된 가맹점 수와 총 거래액 계산해줘")}
                  className="flex items-start gap-3 p-3.5 rounded-xl border text-left glass glass-hover transition-all"
                >
                  <Database size={16} className="mt-0.5" style={{ color: "#34d399", flexShrink: 0 }} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>데이터 분석 (SQL)</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>"가입 완료된 가맹점 수와 거래액..."</p>
                  </div>
                </button>

                <button
                  onClick={() => handlePromptClick("가장 최근에 올라온 가맹점 수수료 운영 지침 설명해줘")}
                  className="flex items-start gap-3 p-3.5 rounded-xl border text-left glass glass-hover transition-all"
                >
                  <BookOpen size={16} className="mt-0.5" style={{ color: "#a78bfa", flexShrink: 0 }} />
                  <div>
                    <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>지식 RAG 검색</p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>"가맹점 수수료 지침 요약 및 파일 찾기..."</p>
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {messages.map((msg) => (
            <div key={msg.id}>
              {/* 메시지 버블 렌더링 */}
              <MessageBubble
                message={msg}
                onSourceClick={onSourceClick}
              />
              
              {/* 사용자의 검토가 필요한 SQL 생성 결과가 있을 때 편집 에디터 렌더링 */}
              {msg.sqlReview && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 ml-11 max-w-[85%]"
                >
                  <SqlEditor
                    sql={msg.sqlReview}
                    onExecute={(sql) => handleExecuteSql(msg.id, sql)}
                    disabled={isLoading}
                  />
                </motion.div>
              )}
            </div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>

      {/* 하단 입력바 영역 */}
      <div className="px-6 pb-6 pt-2 flex-shrink-0" style={{ background: "transparent" }}>
        <ChatInput
          onSend={handleSend}
          disabled={isLoading}
          mode={mode}
          onModeChange={setMode}
        />
        <p className="text-center mt-2 text-[10px] font-medium" style={{ color: "var(--text-muted)" }}>
          Shift + Enter로 줄바꿈 · GCP VM 프록시 엔진 구동 중
        </p>
      </div>
    </div>
  );
}
