"""개발용 정적 서버. 코드를 고치면 브라우저가 옛 스크립트를 캐시에서 꺼내 쓰지 않도록 캐시를 끈다."""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
