"""Data models for the Fluid Python SDK.

All models use :mod:`dataclasses` with :mod:`typing` annotations so that
they work seamlessly with ``mypy --strict`` and static analysis tools.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass(frozen=True)
class FluidClientConfig:
    """Configuration for :class:`~fluid_py.client.FluidClient`.

    At least one of *server_url* or *server_urls* must be provided.

    Args:
        network_passphrase: Stellar network passphrase, e.g.
            ``"Test SDF Network ; September 2015"`` or
            ``"Public Global Stellar Network ; September 2015"``.
        server_url: Base URL of a single Fluid fee-bump server.
        server_urls: Base URLs of multiple Fluid fee-bump servers.
            When more than one URL is supplied the client will try each in
            order, applying exponential back-off on failure.
        horizon_url: Optional Horizon API URL used by
            :meth:`~fluid_py.client.FluidClient.submit_fee_bump_transaction`.
        timeout: HTTP request timeout in seconds (default ``30``).

    Raises:
        ValueError: If neither *server_url* nor *server_urls* is provided.

    Example::

        config = FluidClientConfig(
            server_url="https://fluid.example.com",
            network_passphrase="Test SDF Network ; September 2015",
        )
    """

    network_passphrase: str
    server_url: Optional[str] = None
    server_urls: Optional[List[str]] = None
    horizon_url: Optional[str] = None
    timeout: float = 30.0

    def __post_init__(self) -> None:
        if not self.server_url and not self.server_urls:
            raise ValueError(
                "FluidClientConfig requires at least one server URL via "
                "'server_url' or 'server_urls'."
            )


@dataclass(frozen=True)
class FeeBumpResponse:
    """Response returned by the Fluid fee-bump endpoint.

    Args:
        xdr: Base64-encoded XDR of the fee-bumped transaction envelope.
        status: Either ``"ready"`` (wrapped but not submitted) or
            ``"submitted"`` (already broadcast to the Stellar network).
        hash: Transaction hash of the fee-bump envelope (may be absent when
            the server returns a minimal response).
        fee_payer: Public key of the account that sponsored the fee.
        submitted_via: Which submission path was used (e.g. ``"horizon"``).
        submission_attempts: Number of submission attempts made by the server.
    """

    xdr: str
    status: str
    hash: Optional[str] = None
    fee_payer: Optional[str] = None
    submitted_via: Optional[str] = None
    submission_attempts: Optional[int] = None

    @classmethod
    def from_dict(cls, data: dict) -> "FeeBumpResponse":  # type: ignore[type-arg]
        """Construct a :class:`FeeBumpResponse` from a raw JSON dictionary.

        Unknown keys are silently ignored so that future server versions
        remain backwards-compatible.

        Args:
            data: Dictionary decoded from the server JSON response.

        Returns:
            A new :class:`FeeBumpResponse` instance.
        """
        return cls(
            xdr=data["xdr"],
            status=data["status"],
            hash=data.get("hash"),
            fee_payer=data.get("fee_payer"),
            submitted_via=data.get("submitted_via"),
            submission_attempts=data.get("submission_attempts"),
        )


@dataclass(frozen=True)
class FeeBumpRequest:
    """Serialised body for a single fee-bump request.

    Args:
        xdr: Base64-encoded XDR of the inner transaction to be fee-bumped.
        submit: When ``True`` the server will attempt to submit the
            fee-bumped transaction to the Stellar network immediately.
    """

    xdr: str
    submit: bool = False


@dataclass(frozen=True)
class FeeBumpBatchRequest:
    """Serialised body for a batched fee-bump request.

    Args:
        xdrs: List of Base64-encoded XDR transaction envelopes.
        submit: When ``True`` the server will attempt to submit each
            fee-bumped transaction to the Stellar network immediately.
    """

    xdrs: List[str] = field(default_factory=list)
    submit: bool = False
