#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../../../../../" && pwd)"
SERVER_DIR="$ROOT_DIR/packages/AirRingServer"

cd "$SERVER_DIR"

if [[ "${1:-all}" == "real" ]]; then
  pnpm exec vitest run algorithms/upperRotation/tests/upperRotation.test.ts -t="真实数据集测试"
elif [[ "${1:-all}" == "sim" ]]; then
  pnpm exec vitest run algorithms/upperRotation/tests/simulator/*.test.ts
elif [[ "${1:-all}" == "ab" ]]; then
  pnpm exec vitest run algorithms/upperRotation/tests/simulatorAB/*.test.ts
else
  pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts
fi

