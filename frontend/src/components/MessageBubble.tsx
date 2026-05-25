"use client";

import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, BookOpen } from "lucide-react";
import { Message, RouteLabel, Source } from "@/types";

/**
 * RouteBadge 컴포넌트
 * AI의 답변이 어떤 라우트 엔진(지식검색, 데이터분석, 일반응답)을 거쳐 생성되었는지 나타내는 배지입니다.
 */
function RouteBadge({ route }: { route: RouteLabel }) {
  const map: Record<RouteLabel, { label: string; cls: string }> = {
    knowledge: { label: "지식검색", cls: "route-knowledge" },
    sql: { label: "데이터분석", cls: "route-sql" },
    general: { label: "일반응답", cls: "route-general" },
  };
  const { label, cls } = map[route] ?? map.general;
  return <span className={`route-badge ${cls}`}>{label}</span>;
}

/**
 * TypingIndicator 컴포넌트
 * AI가 실시간으로 응답을 파싱 중이거나 응답 생성 대기 시 노출되는 로딩 도트 애니메이션입니다.
 */
function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2 px-1">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}

interface Props {
  /** 렌더링할 개별 메시지 객체 */
  message: Message;
  /** 문서 출처 칩을 클릭했을 때 호출될 콜백 함수 */
  onSourceClick?: (source: Source) => void;
}

/**
 * MessageBubble 컴포넌트
 * 채팅창 내부의 개별 메시지 말풍선을 렌더링합니다.
 * 사용자(User)와 AI(Assistant)의 역할을 구분하여 좌우 대칭 배치하며, 
 * 마크다운 파싱 및 문서 출처 링크(Source) 리스트 노출을 지원합니다.
 */
export default function MessageBubble({ message, onSourceClick }: Props) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex gap-3.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* 아바타 영역 */}
      <div
        className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-1.5 transition-transform hover:scale-105"
        style={{
          background: isUser 
            ? "linear-gradient(135deg, rgba(167, 139, 250, 0.2), rgba(167, 139, 250, 0.05))" 
            : "linear-gradient(135deg, rgba(167, 139, 250, 0.15), rgba(124, 58, 237, 0.05))",
          border: `1px solid ${isUser ? "rgba(167,139,250,0.25)" : "var(--border-color)"}`,
          boxShadow: isUser ? "none" : "0 0 10px rgba(167, 139, 250, 0.1)"
        }}
      >
        {isUser ? (
          <User size={15} style={{ color: "var(--accent)" }} />
        ) : (
          <Bot size={15} style={{ color: "var(--accent)" }} />
        )}
      </div>

      {/* 말풍선 본문 및 출처 칩 영역 */}
      <div className={`flex flex-col max-w-[82%] ${isUser ? "items-end" : "items-start"}`}>
        {/* AI 응답 라우트 라벨 표시 */}
        {!isUser && message.route && (
          <div className="mb-2">
            <RouteBadge route={message.route} />
          </div>
        )}

        {/* 메시지 말풍선 */}
        <div
          className="rounded-2xl px-4 py-3.5 shadow-md"
          style={{
            background: isUser ? "var(--user-bubble)" : "var(--ai-bubble)",
            border: `1px solid ${isUser ? "rgba(167,139,250,0.25)" : "var(--border-color)"}`,
            maxWidth: "100%",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.08)",
          }}
        >
          {message.isStreaming && !message.content ? (
            <TypingIndicator />
          ) : (
            <div className="markdown-body text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
              {message.isStreaming && (
                <span
                  className="inline-block w-1.5 h-4 ml-1 rounded-sm animate-pulse"
                  style={{ background: "var(--accent)", verticalAlign: "middle" }}
                />
              )}
            </div>
          )}
        </div>

        {/* 지식 검색 출처 문서 목록 */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {message.sources.slice(0, 5).map((src, i) => (
              <button
                key={i}
                onClick={() => onSourceClick?.(src)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all border glass glass-hover"
                style={{
                  color: "var(--text-secondary)",
                  borderColor: "var(--border-color)",
                }}
                title={src.content}
              >
                <BookOpen size={11} style={{ color: "var(--accent)" }} />
                <span className="max-w-[130px] truncate font-medium">{src.source}</span>
                {src.page && (
                  <span className="text-[10px] opacity-75 font-semibold" style={{ color: "var(--accent)" }}>
                    p.{src.page}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
