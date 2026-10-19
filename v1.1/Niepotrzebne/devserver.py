import http.server, sys, os, functools
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def log_message(self, *a):
        pass
H.extensions_map.update({".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary", ".hdr": "application/octet-stream", ".wasm": "application/wasm"})
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8613
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(H, directory=ROOT)).serve_forever()
