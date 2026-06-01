"""Core FluidClient implementation for the Fluid Python SDK.

This module provides :class:`FluidClient`, the primary entry point for
sponsoring Stellar transaction fees via the Fluid fee-bump server.

Typical usage::

    from stellar_sdk import Network, TransactionBuilder, Keypair

    from fluid_py import FluidClient, FluidClientConfig

    config = FluidClientConfig(
        server_url="https://fluid.example.com",
        network_passphrase=Network.TESTNET_NETWORK_PASSPHRASE,
    )
    client = FluidClient(config)

    # Pass an XDR string or a stellar_sdk TransactionEnvelope
    response = client.request_fee_bump(xdr)
    print(response.xdr)
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Protocol, Sequence, Union, runtime_checkable

import requests

from fluid_py.exceptions import (
    FluidNoAvailableServerError,
    FluidRequestError,
    FluidSerializationError,
)
from fluid_py.models import (
    FeeBumpBatchRequest,
    FeeBumpRequest,
    FeeBumpResponse,
    FluidClientConfig,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Type alias for transaction inputs
# ---------------------------------------------------------------------------

@runtime_checkable
class XdrSerializable(Protocol):
    """Protocol for objects that can be serialised to an XDR string.

    Both :class:`stellar_sdk.Transaction` and
    :class:`stellar_sdk.TransactionEnvelope` satisfy this protocol via their
    ``to_xdr()`` method.
    """

    def to_xdr(self) -> str:
        """Return the Base64-encoded XDR representation of the transaction."""
        ...


#: Accepted transaction input types.
TransactionInput = Union[str, XdrSerializable]

# ---------------------------------------------------------------------------
# Internal constants
# ---------------------------------------------------------------------------

_FAILED_NODE_COOLDOWN_S: float = 30.0
_BASE_RETRY_DELAY_S: float = 0.25
_MAX_RETRY_DELAY_S: float = 2.0

_FEE_BUMP_PATH = "/fee-bump"
_FEE_BUMP_BATCH_PATH = "/fee-bump/batch"


# ---------------------------------------------------------------------------
# FluidClient
# ---------------------------------------------------------------------------


class FluidClient:
    """Client for interacting with the Fluid fee-bump server.

    The client supports multiple server URLs with automatic failover and
    exponential back-off so that transient outages on one node do not
    surface as errors to the caller.

    Args:
        config: A :class:`~fluid_py.models.FluidClientConfig` instance that
            specifies the server URL(s), network passphrase, and optional
            Horizon endpoint.

    Raises:
        :class:`~fluid_py.exceptions.FluidConfigError`: If the config is
            missing required fields (raised by
            :class:`~fluid_py.models.FluidClientConfig`'s ``__post_init__``).

    Example::

        from fluid_py import FluidClient, FluidClientConfig

        client = FluidClient(
            FluidClientConfig(
                server_url="https://fluid.example.com",
                network_passphrase="Test SDF Network ; September 2015",
            )
        )
        response = client.request_fee_bump("<inner-tx-xdr>")
        print(response.xdr)
    """

    def __init__(self, config: FluidClientConfig) -> None:
        self._server_urls: List[str] = self._normalise_server_urls(config)
        self._network_passphrase: str = config.network_passphrase
        self._horizon_url: Optional[str] = config.horizon_url
        self._timeout: float = config.timeout

        # Track per-node failure state: url -> (failure_count, failed_until)
        self._node_failure_state: Dict[str, Dict[str, Any]] = {}

        # Lazily-created requests.Session (shared across all requests)
        self._session: Optional[requests.Session] = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def request_fee_bump(
        self,
        transaction: TransactionInput,
        submit: bool = False,
    ) -> FeeBumpResponse:
        """Request a fee-bump envelope for a single inner transaction.

        The Fluid server wraps *transaction* in a fee-bump envelope signed
        with its sponsorship key.  If *submit* is ``True`` the server also
        broadcasts the envelope to the Stellar network.

        Args:
            transaction: The inner transaction as either a Base64-encoded XDR
                string or any object that exposes a ``to_xdr() -> str`` method
                (e.g. :class:`stellar_sdk.TransactionEnvelope`).
            submit: When ``True`` the server will attempt to submit the
                fee-bumped transaction immediately after wrapping it.

        Returns:
            A :class:`~fluid_py.models.FeeBumpResponse` with the wrapped XDR
            and optional submission metadata.

        Raises:
            :class:`~fluid_py.exceptions.FluidSerializationError`: If the
                transaction cannot be serialised to XDR.
            :class:`~fluid_py.exceptions.FluidRequestError`: If the server
                returns a 4xx error.
            :class:`~fluid_py.exceptions.FluidNoAvailableServerError`: If all
                configured servers are unreachable or return errors.

        Example::

            response = client.request_fee_bump(envelope, submit=True)
            print(response.status)   # "submitted"
            print(response.hash)
        """
        payload = FeeBumpRequest(
            xdr=self._serialise(transaction),
            submit=submit,
        )
        raw = self._request_with_fallback(
            _FEE_BUMP_PATH,
            {"xdr": payload.xdr, "submit": payload.submit},
        )
        return FeeBumpResponse.from_dict(raw)

    def request_fee_bump_batch(
        self,
        transactions: Sequence[TransactionInput],
        submit: bool = False,
    ) -> List[FeeBumpResponse]:
        """Request fee-bump envelopes for a batch of inner transactions.

        This is more efficient than calling :meth:`request_fee_bump`
        repeatedly when you need to sponsor multiple transactions at once.

        Args:
            transactions: A sequence of inner transactions, each as either a
                Base64-encoded XDR string or an ``XdrSerializable`` object.
            submit: When ``True`` the server will attempt to submit each
                fee-bumped transaction immediately after wrapping it.

        Returns:
            A list of :class:`~fluid_py.models.FeeBumpResponse` objects, one
            per input transaction, in the same order.

        Raises:
            :class:`~fluid_py.exceptions.FluidSerializationError`: If any
                transaction in the batch cannot be serialised.
            :class:`~fluid_py.exceptions.FluidRequestError`: If the server
                returns a 4xx error.
            :class:`~fluid_py.exceptions.FluidNoAvailableServerError`: If all
                configured servers are unreachable or return errors.

        Example::

            responses = client.request_fee_bump_batch([env1, env2], submit=False)
            for r in responses:
                print(r.xdr)
        """
        payload = FeeBumpBatchRequest(
            xdrs=[self._serialise(tx) for tx in transactions],
            submit=submit,
        )
        raw_list: List[Dict[str, Any]] = self._request_with_fallback(
            _FEE_BUMP_BATCH_PATH,
            {"xdrs": payload.xdrs, "submit": payload.submit},
        )
        return [FeeBumpResponse.from_dict(item) for item in raw_list]

    def submit_fee_bump_transaction(self, fee_bump_xdr: str) -> Dict[str, Any]:
        """Submit an already fee-bumped XDR to the Stellar network via Horizon.

        This method requires that *horizon_url* was set in
        :class:`~fluid_py.models.FluidClientConfig`.

        Args:
            fee_bump_xdr: Base64-encoded XDR of a fee-bump transaction
                envelope as returned by :meth:`request_fee_bump`.

        Returns:
            The raw JSON response from Horizon as a dictionary.

        Raises:
            :class:`~fluid_py.exceptions.FluidConfigError`: If *horizon_url*
                was not configured.
            :class:`~fluid_py.exceptions.FluidRequestError`: If the Horizon
                submission fails.

        Example::

            response = client.request_fee_bump(inner_xdr)
            horizon_result = client.submit_fee_bump_transaction(response.xdr)
            print(horizon_result["hash"])
        """
        from fluid_py.exceptions import FluidConfigError  # local import to avoid cycle

        if not self._horizon_url:
            raise FluidConfigError(
                "submit_fee_bump_transaction requires 'horizon_url' to be set "
                "in FluidClientConfig."
            )

        horizon_url = self._horizon_url.rstrip("/")
        session = self._get_session()

        try:
            resp = session.post(
                f"{horizon_url}/transactions",
                data={"tx": fee_bump_xdr},
                timeout=self._timeout,
            )
        except requests.RequestException as exc:
            raise FluidRequestError(
                f"Horizon submission request failed: {exc}",
                server_url=horizon_url,
            ) from exc

        if not resp.ok:
            raise FluidRequestError(
                f"Horizon submission error: {resp.status_code} {resp.reason} — {resp.text}",
                status_code=resp.status_code,
                server_url=horizon_url,
            )

        return resp.json()  # type: ignore[no-any-return]

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _get_session(self) -> requests.Session:
        """Return (or lazily create) the shared :class:`requests.Session`."""
        if self._session is None:
            self._session = requests.Session()
            self._session.headers.update({"Content-Type": "application/json"})
        return self._session

    @staticmethod
    def _serialise(transaction: TransactionInput) -> str:
        """Serialise *transaction* to a Base64-encoded XDR string.

        Args:
            transaction: Either a plain XDR string or an object with a
                ``to_xdr()`` method (``stellar_sdk`` envelopes satisfy this).

        Returns:
            The Base64-encoded XDR string.

        Raises:
            :class:`~fluid_py.exceptions.FluidSerializationError`: If
                serialisation fails.
        """
        if isinstance(transaction, str):
            return transaction
        to_xdr = getattr(transaction, "to_xdr", None)
        if callable(to_xdr):
            try:
                return str(to_xdr())
            except Exception as exc:
                raise FluidSerializationError(
                    f"Failed to serialise transaction to XDR: {exc}"
                ) from exc
        raise FluidSerializationError(
            f"Unsupported transaction type: {type(transaction).__name__}. "
            "Expected a str or an object with a to_xdr() method."
        )

    @staticmethod
    def _normalise_server_urls(config: FluidClientConfig) -> List[str]:
        """Return a deduplicated, normalised list of server URLs.

        Args:
            config: The client configuration.

        Returns:
            A non-empty list of server URL strings.

        Raises:
            ValueError: Propagated from
                :class:`~fluid_py.models.FluidClientConfig` if no URL was
                provided.
        """
        raw: List[str] = []
        if config.server_urls:
            raw.extend(config.server_urls)
        elif config.server_url:
            raw.append(config.server_url)

        normalised = [u.strip().rstrip("/") for u in raw if u.strip()]

        # Preserve order while deduplicating
        seen: set[str] = set()
        unique: List[str] = []
        for url in normalised:
            if url not in seen:
                seen.add(url)
                unique.append(url)

        return unique

    def _get_ordered_server_urls(self) -> List[str]:
        """Return server URLs sorted by health: healthy nodes first.

        Nodes that have recently failed are sorted to the back with a score
        proportional to how long they still need to cool down, so the best
        server is always tried first.

        Returns:
            A new list of server URL strings.
        """
        now = time.monotonic()

        def _score(url: str) -> float:
            state = self._node_failure_state.get(url)
            if state and state["failed_until"] > now:
                return float(1_000.0 + (state["failed_until"] - now))
            return 0.0

        return sorted(self._server_urls, key=_score)

    def _mark_server_failure(self, server_url: str) -> None:
        """Record a failure for *server_url* and set a cooldown period.

        Subsequent failures increase the cooldown exponentially (up to 4×
        the base cooldown), matching the TypeScript SDK behaviour.

        Args:
            server_url: The URL of the server that failed.
        """
        previous = self._node_failure_state.get(server_url, {})
        failures: int = previous.get("failures", 0) + 1
        multiplier = min(2 ** (failures - 1), 4)
        self._node_failure_state[server_url] = {
            "failures": failures,
            "failed_until": time.monotonic() + _FAILED_NODE_COOLDOWN_S * multiplier,
        }

    def _mark_server_success(self, server_url: str) -> None:
        """Clear the failure state for *server_url* after a successful request.

        Args:
            server_url: The URL of the server that succeeded.
        """
        self._node_failure_state.pop(server_url, None)

    @staticmethod
    def _retry_delay(attempt_index: int) -> float:
        """Return the back-off delay in seconds for the given attempt index.

        Args:
            attempt_index: Zero-based attempt counter.

        Returns:
            Delay in seconds, capped at :data:`_MAX_RETRY_DELAY_S`.
        """
        return float(min(
            _BASE_RETRY_DELAY_S * (2 ** attempt_index),
            _MAX_RETRY_DELAY_S,
        ))

    def _perform_json_request(
        self,
        server_url: str,
        path: str,
        body: Dict[str, Any],
    ) -> Any:
        """Perform a single JSON POST to *server_url* + *path*.

        Args:
            server_url: The base URL of the Fluid server.
            path: The API path (e.g. ``"/fee-bump"``).
            body: The request body to send as JSON.

        Returns:
            The decoded JSON response (dict or list).

        Raises:
            :class:`~fluid_py.exceptions.FluidRequestError`: On network
                errors or non-2xx responses.
        """
        session = self._get_session()
        url = f"{server_url}{path}"

        try:
            resp = session.post(url, json=body, timeout=self._timeout)
        except requests.RequestException as exc:
            raise FluidRequestError(
                f"Fluid server request failed: {exc}",
                server_url=server_url,
            ) from exc

        if not resp.ok:
            try:
                error_detail = resp.json()
                message = f"Fluid server error: {error_detail}"
            except ValueError:
                message = (
                    f"Fluid server error: {resp.status_code} {resp.reason}"
                    + (f" — {resp.text}" if resp.text else "")
                )

            raise FluidRequestError(
                message,
                status_code=resp.status_code,
                server_url=server_url,
            )

        return resp.json()

    def _request_with_fallback(
        self,
        path: str,
        body: Dict[str, Any],
    ) -> Any:
        """Try each server URL in order, falling back on failure.

        A 400 Bad Request error is considered a client error and is re-raised
        immediately without trying the next server (the request itself is
        malformed, not the server).

        Args:
            path: The API path to request.
            body: The JSON request body.

        Returns:
            The decoded JSON response.

        Raises:
            :class:`~fluid_py.exceptions.FluidRequestError`: On 400 errors or
                when a single server is configured and fails.
            :class:`~fluid_py.exceptions.FluidNoAvailableServerError`: When
                all configured servers fail.
        """
        ordered_urls = self._get_ordered_server_urls()
        last_error: Optional[FluidRequestError] = None

        for attempt_index, server_url in enumerate(ordered_urls):
            try:
                result = self._perform_json_request(server_url, path, body)
                self._mark_server_success(server_url)
                return result
            except FluidRequestError as exc:
                # 400 Bad Request: the request is malformed; no point retrying
                if exc.status_code == 400:
                    raise

                last_error = exc
                self._mark_server_failure(server_url)

                if attempt_index < len(ordered_urls) - 1:
                    delay = self._retry_delay(attempt_index)
                    next_url = ordered_urls[attempt_index + 1]
                    logger.warning(
                        "[FluidClient] Request to %s failed (%s). "
                        "Retrying %s on %s in %.2fs.",
                        server_url,
                        exc,
                        path,
                        next_url,
                        delay,
                    )
                    time.sleep(delay)

        raise FluidNoAvailableServerError(
            f"All Fluid servers exhausted for {path}. "
            f"Last error: {last_error}",
            server_url=ordered_urls[-1] if ordered_urls else None,
        ) from last_error

    def __repr__(self) -> str:
        urls = ", ".join(self._server_urls)
        return f"FluidClient(server_urls=[{urls}])"
