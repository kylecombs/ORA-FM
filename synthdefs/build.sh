#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────
#  synthdefs/build.sh
#
#  Compile all .scd files in synthdefs/src/ into .scsyndef
#  binaries and deploy them to public/supersonic/synthdefs/.
#
#  Requires a local SuperCollider install (sclang on PATH).
#
#  Usage:
#    ./synthdefs/build.sh            # build all
#    ./synthdefs/build.sh foo.scd    # build one file
# ──────────────────────────────────────────────────────────
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$REPO_ROOT/synthdefs/src"
OUT_DIR="$REPO_ROOT/public/supersonic/synthdefs"

# ── Preflight ────────────────────────────────────────────
if ! command -v sclang &>/dev/null; then
  echo "ERROR: sclang not found on PATH."
  echo "Install SuperCollider: https://supercollider.github.io/downloads"
  exit 1
fi

mkdir -p "$OUT_DIR"

# ── Collect source files ─────────────────────────────────
if [[ $# -gt 0 ]]; then
  files=()
  for arg in "$@"; do
    f="$SRC_DIR/$arg"
    [[ -f "$f" ]] || { echo "ERROR: $f not found"; exit 1; }
    files+=("$f")
  done
else
  shopt -s nullglob
  files=("$SRC_DIR"/*.scd)
  shopt -u nullglob
fi

if [[ ${#files[@]} -eq 0 ]]; then
  echo "No .scd files found in $SRC_DIR"
  exit 0
fi

echo "Building ${#files[@]} SynthDef source(s)…"
echo "  src: $SRC_DIR"
echo "  out: $OUT_DIR"
echo ""

# ── Compile each .scd file ───────────────────────────────
ok=0
fail=0

for scd in "${files[@]}"; do
  name="$(basename "$scd")"
  echo -n "  $name … "

  # Wrap the .scd in a bootstrap that:
  #   1. Sets ~outDir (environment variable visible to executeFile)
  #   2. Executes the original file
  #   3. Exits sclang when done
  wrapper=$(cat <<SCLANG
~outDir = "$OUT_DIR";
thisProcess.interpreter.executeFile("$scd");
AppClock.sched(0.5, {
    "DONE".postln;
    0.exit;
});
SCLANG
)

  # Write wrapper to temp file (sclang doesn't support -e on all versions)
  wrapper_file="/tmp/sclang_wrapper_$$.scd"
  echo "$wrapper" > "$wrapper_file"

  # Run sclang headless (timeout guards hangs)
  if timeout 30 sclang "$wrapper_file" &>/tmp/sclang_build_$$.log; then
    # Verify at least one .scsyndef was produced (check mtime)
    new_files=$(find "$OUT_DIR" -name '*.scsyndef' -newer "$scd" 2>/dev/null | head -5)
    if [[ -n "$new_files" ]]; then
      echo "ok"
      ((ok++))
    else
      echo "WARNING: sclang exited 0 but no new .scsyndef files found"
      echo "    Check log: /tmp/sclang_build_$$.log"
      ((fail++))
    fi
  else
    echo "FAILED (exit $?)"
    echo "    Log:"
    sed 's/^/      /' /tmp/sclang_build_$$.log | tail -20
    ((fail++))
  fi
done

rm -f /tmp/sclang_build_$$.log /tmp/sclang_wrapper_$$.scd

echo ""
echo "Done: $ok succeeded, $fail failed."
[[ $fail -eq 0 ]] || exit 1
