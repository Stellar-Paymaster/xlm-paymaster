"""Custom exceptions for the Paymaster Python SDK."""

from __future__ import annotations

from typing import Optional


class PaymasterError(Exception):
    """Base exception for all Paymaster SDK errors."""


class PaymasterRequestError(PaymasterError):
    """Raised when an HTTP request to the Paymaster server fails.

    Args:
        message: Human-readable error description.
        status_code: HTTP status code returned by the server, if any.
        server_url: The server URL that produced the error.
    """

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        server_url: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.server_url = server_url

    def __repr__(self) -> str:
        return (
            f"{type(self).__name__}("
            f"message={str(self)!r}, "
            f"status_code={self.status_code!r}, "
            f"server_url={self.server_url!r})"
        )


class PaymasterConfigError(PaymasterError):
    """Raised when the :class:`~paymaster_py.models.PaymasterClientConfig` is invalid."""


class PaymasterSerializationError(PaymasterError):
    """Raised when a transaction cannot be serialised to XDR."""


class PaymasterNoAvailableServerError(PaymasterRequestError):
    """Raised when all configured servers are unavailable or exhausted."""
