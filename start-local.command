#!/bin/zsh
# Double-click on macOS to serve this checkout locally. Leave the terminal open.
cd -- "$(dirname -- "$0")" || exit 1
echo "Trace Planner 本地预览：http://127.0.0.1:8765/Trace_planner.html"
echo "保持此终端窗口打开；按 Ctrl+C 停止服务。"
python3 -m http.server 8765 --bind 127.0.0.1
