#!/bin/bash
# 프론트엔드 개발 서버 실행 스크립트 (port 3000)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(dirname "$SCRIPT_DIR")/frontend"

echo "=== Corp Workplace Frontend 시작 ==="
echo "Frontend: $FRONTEND_DIR"

cd "$FRONTEND_DIR"

# 의존성 설치
if [ ! -d "node_modules" ]; then
    echo "패키지 설치 중..."
    npm install
fi

# 개발 서버 실행
npm run dev
