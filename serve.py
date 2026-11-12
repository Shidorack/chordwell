"""Serves Chordwell at http://localhost:8010 and tells the browser not to cache files,
so a normal reload always picks up the newest version of the app.

Run from this folder:  python serve.py
"""
import http.server
import os
import socketserver
import sys
import webbrowser

PORT = 8010


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, *args):
        pass


os.chdir(os.path.dirname(os.path.abspath(__file__)))
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('127.0.0.1', PORT), NoCacheHandler) as httpd:
    url = f'http://localhost:{PORT}'
    print(f'Chordwell is running at {url}  (press Ctrl+C to stop)')
    if '--no-browser' not in sys.argv:
        webbrowser.open(url)
    httpd.serve_forever()
