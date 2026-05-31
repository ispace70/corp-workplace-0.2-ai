"use client";

"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "@/components/Sidebar";
import ChatPanel from "@/components/ChatPanel";
import ContentPanel from "@/components/ContentPanel";
import { Message, RouteMode, Source, SqlResult } from "@/types";
import { executeSQL } from "@/lib/api";

export default function Home() {
  const [mode, setMode] = useState<RouteMode>("auto");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [sqlResult, setSqlResult] = useState<SqlResult | null>(null);
  const [currentSql, setCurrentSql] = useState("");
  const [contentVisible, setContentVisible] = useState(false);

  const handleSourceClick = useCallback((src: Source) => {
    setSelectedSource(src);
    setSqlResult(null);
    setContentVisible(true);
  }, []);

  const handleSqlResult = useCallback((result: SqlResult, sql: string) => {
    setSqlResult(result);
    setCurrentSql(sql);
    setSelectedSource(null);
    setContentVisible(true);
  }, []);

  const handleReExecuteSql = useCallback(async (sql: string) => {
    setIsLoading(true);
    await executeSQL(sql, "", {
      onSqlResult: (result) => {
        setSqlResult(result);
        setCurrentSql(sql);
      },
      onDone: () => setIsLoading(false),
      onError: () => setIsLoading(false),
    });
  }, []);

  const handleCloseContent = useCallback(() => {
    setContentVisible(false);
    setTimeout(() => {
      setSelectedSource(null);
      setSqlResult(null);
    }, 300);
  }, []);

  const handleModeChange = (newMode: RouteMode) => {
    setMode(newMode);
  };

  return (
    <div
      className="flex h-screen overflow-hidden"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Sidebar */}
      <Sidebar activeMode={mode} onModeChange={handleModeChange} />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat panel */}
        <div
          className="flex flex-col overflow-hidden transition-all duration-300"
          style={{ flex: contentVisible ? "0 0 55%" : "1 1 auto" }}
        >
          <ChatPanel
            messages={messages}
            setMessages={setMessages}
            mode={mode}
            setMode={setMode}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            onSourceClick={handleSourceClick}
            onSqlResult={handleSqlResult}
          />
        </div>

        {/* Content panel (split view) */}
        <AnimatePresence>
          {contentVisible && (
            <motion.div
              key="content"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "45%", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden flex-shrink-0"
            >
              <ContentPanel
                selectedSource={selectedSource}
                sqlResult={sqlResult}
                currentSql={currentSql}
                onReExecute={handleReExecuteSql}
                isReExecuting={isLoading}
                onClose={handleCloseContent}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
