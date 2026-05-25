#!/bin/bash
# 백엔드 서버 실행 스크립트 (port 8009)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Corp Workplace Backend 시작 ==="
echo "Root: $ROOT_DIR"

# 가상환경 활성화 (있는 경우)
if [ -f "$ROOT_DIR/.venv/bin/activate" ]; then
    source "$ROOT_DIR/.venv/bin/activate"
    echo "가상환경 활성화됨"
fi

# 의존성 설치
pip install -r "$ROOT_DIR/requirements.txt" -q

# 서버 실행
cd "$ROOT_DIR/backend"
python3.13 main.py
