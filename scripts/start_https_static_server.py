#!/usr/bin/env python3
"""Serve a built static site over local HTTPS for realistic Service Worker tests."""
from __future__ import annotations

import argparse
import ssl
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class QuietThreadingHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", required=True, type=Path)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", default=4175, type=int)
    parser.add_argument("--cert", required=True, type=Path)
    parser.add_argument("--key", required=True, type=Path)
    args = parser.parse_args()

    root = args.directory.resolve(strict=True)
    cert = args.cert.resolve(strict=True)
    key = args.key.resolve(strict=True)
    if not root.is_dir():
        parser.error("--directory must resolve to a directory")
    if not cert.is_file() or not key.is_file():
        parser.error("--cert and --key must resolve to regular files")

    handler = lambda *handler_args, **handler_kwargs: SimpleHTTPRequestHandler(
        *handler_args, directory=str(root), **handler_kwargs
    )
    server = QuietThreadingHTTPServer((args.bind, args.port), handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(certfile=str(cert), keyfile=str(key))
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f"Serving {root} at https://{args.bind}:{args.port}/", flush=True)
    try:
        server.serve_forever(poll_interval=0.25)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
