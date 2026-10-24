#!/bin/bash
# 雙擊這個檔案就會啟動本機預覽，並自動打開瀏覽器。關閉這個終端機視窗即停止。
cd "$(dirname "$0")"
(sleep 1 && open "http://localhost:5173/?edit=1") &
python3 tools/serve.py 5173
