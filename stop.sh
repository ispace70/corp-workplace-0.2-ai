#!/bin/bash
# Corp Workplace AI — 전체 스택 종료

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID_FILE="$ROOT_DIR/.tmp/backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.tmp/frontend.pid"
ADMIN_PID_FILE="$ROOT_DIR/.tmp/admin.pid"

echo "======================================"
echo "  Corp Workplace AI — Stopping"
echo "======================================"

# PID 파일 기반 종료 (프로세스 그룹 전체 종료)
kill_pid() {
    local label="$1"
    local pid_file="$2"

    if [ ! -f "$pid_file" ]; then
        echo "  [$label] PID 파일 없음 — 건너뜀"
        return
    fi

    local pid
    pid=$(cat "$pid_file")

    if kill -0 "$pid" 2>/dev/null; then
        # 프로세스 그룹 전체 종료 (자식 프로세스 포함)
        kill -- -"$(ps -o pgid= -p "$pid" | tr -d ' ')" 2>/dev/null || kill "$pid" 2>/dev/null
        echo "  [$label] PID $pid 종료됨"
    else
        echo "  [$label] PID $pid 이미 종료됨"
    fi

    rm -f "$pid_file"
}

kill_pid "Backend  " "$BACKEND_PID_FILE"
kill_pid "Frontend " "$FRONTEND_PID_FILE"
kill_pid "Admin    " "$ADMIN_PID_FILE"

# Next.js / Vite 잔여 프로세스 강제 정리
pkill -f "next-server" 2>/dev/null
pkill -f "next dev" 2>/dev/null
pkill -f "vite --port 8002" 2>/dev/null

# 포트 잔여 프로세스 강제 종료
for port in 8009 3000 8002; do
    pid=$(lsof -ti tcp:"$port" 2>/dev/null)
    if [ -n "$pid" ]; then
        kill -9 $pid 2>/dev/null
        echo "  [port $port] 잔여 프로세스 $pid 강제 종료됨"
    fi
done

sleep 1

echo ""
echo "  모든 서비스가 종료되었습니다."
echo "======================================"
