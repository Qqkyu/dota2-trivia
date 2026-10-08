#!/bin/bash
set -eu
cd /tmp/queue-arcade-launch-checks/assistive
source env.sh
export DISPLAY=127.0.0.1:96
Xvfb :96 -screen 0 1280x900x24 -nolisten unix -listen tcp -ac > session/xvfb.log 2>&1 &
ASSISTIVE_X_PID=$!
dbus-daemon --config-file=session/accessibility.conf --print-address=1 --print-pid=1 --fork > session/a11y-bus.txt
export AT_SPI_BUS_ADDRESS="$(head -1 session/a11y-bus.txt)"
ASSISTIVE_A11Y_PID="$(tail -1 session/a11y-bus.txt)"
python3 bus-address.py > session/bus-address.log 2>&1 &
ASSISTIVE_ADDR_PID=$!
trap 'kill "$ASSISTIVE_X_PID" "$ASSISTIVE_A11Y_PID" "$ASSISTIVE_ADDR_PID" ${ASSISTIVE_SPEECH_PID:-} ${ASSISTIVE_ORCA_PID:-} 2>/dev/null || true' EXIT
speech-dispatcher -s -C session/config/speech-dispatcher -S session/runtime/speechd.sock -P session/runtime/speechd.pid -t 0 > session/speech-dispatcher.log 2>&1 &
ASSISTIVE_SPEECH_PID=$!
sleep 1
orca -u "$ASSISTIVE_BASE/session/data/orca" --disable=braille --debug --debug-file="$ASSISTIVE_BASE/session/orca-debug.log" > session/orca-console.log 2>&1 &
ASSISTIVE_ORCA_PID=$!
sleep 2
python3 -c "import speechd,time; s=speechd.SSIPClient('assistive-smoke'); print(s.list_output_modules()); s.speak('Speech Dispatcher capture works.'); time.sleep(1); s.close()"
node zoom-check.mjs
