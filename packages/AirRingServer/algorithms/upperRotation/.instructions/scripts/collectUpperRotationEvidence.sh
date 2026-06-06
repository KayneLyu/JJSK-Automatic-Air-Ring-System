#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../../../../../" && pwd)"
SERVER_DIR="$ROOT_DIR/packages/AirRingServer"
OUT_DIR="$ROOT_DIR/packages/AirRingServer/algorithms/upperRotation/.instructions/artifacts"

mkdir -p "$OUT_DIR"

TS="$(date +"%Y%m%d-%H%M%S")"
LOG_FILE="$OUT_DIR/upperRotation-$TS.log"
SUMMARY_FILE="$OUT_DIR/upperRotation-$TS-summary.log"

cd "$SERVER_DIR"

set +e
pnpm exec vitest run algorithms/upperRotation/tests/*.test.ts > "$LOG_FILE" 2>&1
EXIT_CODE=$?
set -e

grep -E "Dataset |模拟器用例|Failed Tests|Test Files|Tests|failed|passed" "$LOG_FILE" > "$SUMMARY_FILE" || true

echo "full log: $LOG_FILE"
echo "summary:  $SUMMARY_FILE"
echo "exit:     $EXIT_CODE"

exit "$EXIT_CODE"

