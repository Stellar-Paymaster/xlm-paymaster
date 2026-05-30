"""Minimal local mock of the Fluid fee-bump server.

Used for local development and demo purposes when the full Rust/Node
Fluid server is not available.

Usage::

    python examples/mock_fluid_server.py          # listens on :3000
    python examples/mock_fluid_server.py --port 4000
"""

from __future__ import annotations

import argparse
import json
import logging
from http.server import BaseHTTPRequestHandler, HTTPServer

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s")
log = logging.getLogger("mock-fluid")

# Simulated fee-payer public key (Stellar testnet well-known key)
_FEE_PAYER = "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBV3MKZTJW3GV"
_MOCK_HASH = "a3f2c1d4e5b6a7890123456789abcdef0123456789abcdef0123456789abcdef01"
_MOCK_FEE_BUMP_XDR = (
    "AAAABQAAAABexRErfVD8RgHqf8wZXbJiV1FPpqQdTmNYUA+HFVQ5UwAAAAAAAAGQ"
    "AAAAAgAAAABexRErfVD8RgHqf8wZXbJiV1FPpqQdTmNYUA+HFVQ5UwAAAGQAAAAB"
    "AAAAAAAAAAAAAAABAAAAAAAAAAAAAAA="
)


class FluidMockHandler(BaseHTTPRequestHandler):
    """Handle POST /fee-bump and POST /fee-bump/batch."""

    def log_message(self, fmt: str, *args: object) -> None:  # silence default log
        log.info(fmt, *args)

    def _read_body(self) -> dict:  # type: ignore[type-arg]
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw) if raw else {}

    def _send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        body = self._read_body()

        if self.path == "/fee-bump":
            inner_xdr: str = body.get("xdr", "")
            submit: bool = bool(body.get("submit", False))
            log.info("fee-bump  xdr=%s…  submit=%s", inner_xdr[:20], submit)
            self._send_json(200, {
                "xdr": _MOCK_FEE_BUMP_XDR,
                "status": "submitted" if submit else "ready",
                "hash": _MOCK_HASH,
                "fee_payer": _FEE_PAYER,
                "submitted_via": "horizon" if submit else None,
                "submission_attempts": 1 if submit else None,
            })

        elif self.path == "/fee-bump/batch":
            xdrs: list[str] = body.get("xdrs", [])
            submit = bool(body.get("submit", False))
            log.info("fee-bump/batch  count=%d  submit=%s", len(xdrs), submit)
            responses = [
                {
                    "xdr": _MOCK_FEE_BUMP_XDR,
                    "status": "submitted" if submit else "ready",
                    "hash": f"{_MOCK_HASH[:-2]}{i:02d}",
                    "fee_payer": _FEE_PAYER,
                }
                for i, _ in enumerate(xdrs)
            ]
            self._send_json(200, responses)

        else:
            self._send_json(404, {"error": f"unknown path: {self.path}"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Mock Fluid fee-bump server")
    parser.add_argument("--port", type=int, default=3000)
    args = parser.parse_args()

    server = HTTPServer(("127.0.0.1", args.port), FluidMockHandler)
    log.info("Mock Fluid server listening on http://127.0.0.1:%d", args.port)
    log.info("Endpoints: POST /fee-bump  |  POST /fee-bump/batch")
    server.serve_forever()


if __name__ == "__main__":
    main()
