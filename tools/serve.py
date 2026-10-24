#!/usr/bin/env python3
"""本機預覽伺服器（只用 Python 內建模組，不需安裝任何套件）。

- 提供 app/ 資料夾給瀏覽器開啟：http://localhost:5173/
- 編輯模式（?edit=1）按「儲存」時，把新的校園資料寫回 app/src/data/campus.json，
  並在 tools/backups/ 留一份舊版備份。
- 只聽本機（127.0.0.1），別台電腦連不進來。
"""
import json
import sys
from datetime import datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_DIR = ROOT / "app"
DATA_FILE = APP_DIR / "src" / "data" / "campus.json"
BACKUP_DIR = ROOT / "tools" / "backups"
SAVE_PATH = "/api/save-campus"
MAX_BODY = 5 * 1024 * 1024


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # 開發中不要快取，改了檔案重新整理就看得到
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/api/ping":
            return self._reply(200, {"ok": True, "canSave": True})
        return super().do_GET()

    def do_POST(self):
        if self.path != SAVE_PATH:
            return self._reply(404, {"ok": False, "error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self._reply(400, {"ok": False, "error": "資料大小不正確"})
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except ValueError as e:
            return self._reply(400, {"ok": False, "error": f"JSON 格式錯誤：{e}"})
        if not isinstance(data, dict) or "meta" not in data or "rooms" not in data:
            return self._reply(400, {"ok": False, "error": "缺少 meta 或 rooms，未儲存"})

        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = BACKUP_DIR / f"campus-{stamp}.json"
        if DATA_FILE.exists():
            backup.write_bytes(DATA_FILE.read_bytes())
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return self._reply(200, {"ok": True, "backup": backup.name})

    def _reply(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    handler = partial(Handler, directory=str(APP_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"太平國小 3D 地圖預覽：http://localhost:{port}/")
    print(f"編輯模式：http://localhost:{port}/?edit=1")
    print("按 Ctrl+C 停止")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
