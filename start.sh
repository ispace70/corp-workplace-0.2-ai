#!/bin/bash
# Corp Workplace AI — 전체 스택 시작

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/.tmp/logs"
mkdir -p "$LOG_DIR"

BACKEND_PID_FILE="$ROOT_DIR/.tmp/backend.pid"
FRONTEND_PID_FILE="$ROOT_DIR/.tmp/frontend.pid"
ADMIN_PID_FILE="$ROOT_DIR/.tmp/admin.pid"

echo "======================================"
echo "  Corp Workplace AI — Starting"
echo "======================================"

# 포트가 비어있는지 확인 후 대기
wait_port_free() {
    local port="$1"
    for i in $(seq 1 10); do
        if ! lsof -ti tcp:"$port" > /dev/null 2>&1; then
            return 0
        fi
        sleep 0.5
    done
    echo "  [경고] 포트 $port 가 아직 사용 중입니다."
}

# ── 백엔드 ──────────────────────────────────
echo ""
echo "[1/3] 백엔드 시작 (FastAPI port 8009)..."

wait_port_free 8009

# 가상환경 활성화
if [ -f "$ROOT_DIR/.venv/bin/activate" ]; then
    source "$ROOT_DIR/.venv/bin/activate"
    echo "      가상환경: .venv"
fi

cd "$ROOT_DIR/backend"
nohup python3.13 main.py > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$BACKEND_PID_FILE"
echo "      PID: $BACKEND_PID  |  로그: .tmp/logs/backend.log"

# 백엔드 헬스체크 (최대 15초 대기)
echo -n "      헬스체크..."
for i in $(seq 1 15); do
    sleep 1
    if curl -s http://localhost:8009/health > /dev/null 2>&1; then
        echo " OK"
        break
    fi
    echo -n "."
    if [ "$i" -eq 15 ]; then
        echo " TIMEOUT (백엔드가 아직 시작 중일 수 있습니다)"
    fi
done

# ── 프론트엔드 ──────────────────────────────
echo ""
echo "[2/3] 프론트엔드 시작 (Next.js port 3000)..."

wait_port_free 3000

cd "$ROOT_DIR/frontend"

if [ ! -d "node_modules" ]; then
    echo "      패키지 설치 중 (최초 1회)..."
    npm install --silent
fi

nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$FRONTEND_PID_FILE"
echo "      PID: $FRONTEND_PID  |  로그: .tmp/logs/frontend.log"

# 프론트엔드 준비 대기 (최대 15초)
echo -n "      대기..."
for i in $(seq 1 15); do
    sleep 1
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo " OK"
        break
    fi
    echo -n "."
    if [ "$i" -eq 15 ]; then
        echo " TIMEOUT (프론트엔드가 아직 시작 중일 수 있습니다)"
    fi
done

# ── 어드민 ───────────────────────────────────
echo ""
echo "[3/3] 어드민 시작 (React+Vite port 8002)..."

wait_port_free 8002

cd "$ROOT_DIR/admin/frontend"

if [ ! -d "node_modules" ]; then
    echo "      패키지 설치 중 (최초 1회)..."
    npm install --silent
fi

nohup npm run dev > "$LOG_DIR/admin.log" 2>&1 &
ADMIN_PID=$!
echo $ADMIN_PID > "$ADMIN_PID_FILE"
echo "      PID: $ADMIN_PID  |  로그: .tmp/logs/admin.log"

echo ""
echo "======================================"
echo "  서비스 주소"
echo "  Frontend : http://localhost:3000"
echo "  Backend  : http://localhost:8009"
echo "  Admin    : http://localhost:8002"
echo "  API Docs : http://localhost:8009/docs"
echo "======================================"
echo "  종료: ./stop.sh"
echo "======================================"
