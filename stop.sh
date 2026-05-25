#!/bin/bash
# Corp Workplace AI — 전체 스택 종료

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID_FILE="$ROOT_DIR/.tmp/backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.tmp/frontend.pid"
ADMIN_PID_FILE="$ROOT_DIR/.tmp/admin.pid"

echo "======================================"
echo "  Corp Workplace AI — Stopping"
echo "======================================"

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
        kill "$pid"
        echo "  [$label] PID $pid 종료됨"
    else
        echo "  [$label] PID $pid 이미 종료됨"
    fi

    rm -f "$pid_file"
}

kill_pid "Backend  " "$BACKEND_PID_FILE"
kill_pid "Frontend " "$FRONTEND_PID_FILE"
kill_pid "Admin    " "$ADMIN_PID_FILE"

# 포트가 아직 사용 중이면 강제 종료
for port in 8009 3000 8002; do
    pid=$(lsof -ti tcp:"$port" 2>/dev/null)
    if [ -n "$pid" ]; then
        kill "$pid" 2>/dev/null
        echo "  [port $port] 잔여 프로세스 $pid 종료됨"
    fi
done

echo ""
echo "  모든 서비스가 종료되었습니다."
echo "======================================"
