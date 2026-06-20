"""Unit tests for fluid_py.client.FluidClient.

Run with::

    cd fluid-py
    pip install -e ".[dev]"
    pytest -v
"""

from __future__ import annotations

import json
from typing import Any, Dict
from unittest.mock import MagicMock, patch

import pytest
import requests

from fluid_py import (
    FeeBumpResponse,
    FluidClient,
    FluidClientConfig,
    FluidConfigError,
    FluidNoAvailableServerError,
    FluidRequestError,
    FluidSerializationError,
)

# ---------------------------------------------------------------------------
# Fixtures & helpers
# ---------------------------------------------------------------------------

DUMMY_XDR = "AAAAAQ=="  # minimal valid-looking XDR placeholder
TEST_SERVER = "https://fluid.test"
TEST_PASSPHRASE = "Test SDF Network ; September 2015"


def _make_client(
    server_url: str = TEST_SERVER,
    server_urls: list[str] | None = None,
    horizon_url: str | None = None,
) -> FluidClient:
    """Return a FluidClient configured for testing."""
    return FluidClient(
        FluidClientConfig(
            server_url=server_url if server_urls is None else None,
            server_urls=server_urls,
            network_passphrase=TEST_PASSPHRASE,
            horizon_url=horizon_url,
        )
    )


def _fee_bump_payload(status: str = "ready", **extra: Any) -> Dict[str, Any]:
    """Return a minimal fee-bump server response payload."""
    return {
        "xdr": DUMMY_XDR,
        "status": status,
        "hash": "abc123",
        **extra,
    }


# ---------------------------------------------------------------------------
# FluidClientConfig
# ---------------------------------------------------------------------------


class TestFluidClientConfig:
    def test_requires_server_url(self) -> None:
        with pytest.raises(ValueError, match="at least one server URL"):
            FluidClientConfig(network_passphrase=TEST_PASSPHRASE)

    def test_accepts_single_url(self) -> None:
        cfg = FluidClientConfig(
            server_url=TEST_SERVER,
            network_passphrase=TEST_PASSPHRASE,
        )
        assert cfg.server_url == TEST_SERVER

    def test_accepts_multiple_urls(self) -> None:
        cfg = FluidClientConfig(
            server_urls=[TEST_SERVER, "https://fluid2.test"],
            network_passphrase=TEST_PASSPHRASE,
        )
        assert cfg.server_urls is not None
        assert len(cfg.server_urls) == 2

    def test_default_timeout(self) -> None:
        cfg = FluidClientConfig(
            server_url=TEST_SERVER,
            network_passphrase=TEST_PASSPHRASE,
        )
        assert cfg.timeout == 30.0


# ---------------------------------------------------------------------------
# FluidClient construction
# ---------------------------------------------------------------------------


class TestFluidClientInit:
    def test_normalises_trailing_slash(self) -> None:
        client = _make_client(server_url="https://fluid.test/")
        assert client._server_urls == ["https://fluid.test"]

    def test_deduplicates_urls(self) -> None:
        client = _make_client(
            server_urls=[TEST_SERVER, TEST_SERVER, "https://fluid2.test"]
        )
        assert len(client._server_urls) == 2

    def test_repr(self) -> None:
        client = _make_client()
        assert "FluidClient" in repr(client)
        assert TEST_SERVER in repr(client)


# ---------------------------------------------------------------------------
# _serialise
# ---------------------------------------------------------------------------


class TestSerialise:
    def test_passthrough_string(self) -> None:
        assert FluidClient._serialise(DUMMY_XDR) == DUMMY_XDR

    def test_calls_to_xdr(self) -> None:
        mock_tx = MagicMock()
        mock_tx.to_xdr.return_value = DUMMY_XDR
        result = FluidClient._serialise(mock_tx)
        assert result == DUMMY_XDR
        mock_tx.to_xdr.assert_called_once()

    def test_to_xdr_exception_raises_serialisation_error(self) -> None:
        mock_tx = MagicMock()
        mock_tx.to_xdr.side_effect = RuntimeError("broken")
        with pytest.raises(FluidSerializationError, match="Failed to serialise"):
            FluidClient._serialise(mock_tx)

    def test_unsupported_type_raises_error(self) -> None:
        with pytest.raises(FluidSerializationError, match="Unsupported transaction type"):
            FluidClient._serialise(12345)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# request_fee_bump
# ---------------------------------------------------------------------------


class TestRequestFeeBump:
    def test_successful_fee_bump(self, requests_mock: Any) -> None:
        requests_mock.post(
            f"{TEST_SERVER}/fee-bump",
            json=_fee_bump_payload(),
        )
        client = _make_client()
        response = client.request_fee_bump(DUMMY_XDR)

        assert isinstance(response, FeeBumpResponse)
        assert response.xdr == DUMMY_XDR
        assert response.status == "ready"
        assert response.hash == "abc123"

    def test_passes_submit_flag(self, requests_mock: Any) -> None:
        adapter = requests_mock.post(
            f"{TEST_SERVER}/fee-bump",
            json=_fee_bump_payload(status="submitted"),
        )
        client = _make_client()
        response = client.request_fee_bump(DUMMY_XDR, submit=True)

        assert response.status == "submitted"
        sent_body = json.loads(adapter.last_request.body)
        assert sent_body["submit"] is True

    def test_uses_xdr_serializable_input(self, requests_mock: Any) -> None:
        requests_mock.post(f"{TEST_SERVER}/fee-bump", json=_fee_bump_payload())
        mock_tx = MagicMock()
        mock_tx.to_xdr.return_value = DUMMY_XDR

        client = _make_client()
        client.request_fee_bump(mock_tx)
        mock_tx.to_xdr.assert_called_once()

    def test_400_raises_without_fallback(self, requests_mock: Any) -> None:
        requests_mock.post(
            f"{TEST_SERVER}/fee-bump",
            status_code=400,
            json={"error": "bad xdr"},
        )
        client = _make_client()
        with pytest.raises(FluidRequestError) as exc_info:
            client.request_fee_bump(DUMMY_XDR)
        assert exc_info.value.status_code == 400

    def test_500_marks_failure_and_raises(self, requests_mock: Any) -> None:
        requests_mock.post(
            f"{TEST_SERVER}/fee-bump",
            status_code=503,
            text="service unavailable",
        )
        client = _make_client()
        with pytest.raises(FluidNoAvailableServerError):
            client.request_fee_bump(DUMMY_XDR)
        assert TEST_SERVER in client._node_failure_state

    def test_network_error_raises_no_available_server_error(
        self, requests_mock: Any
    ) -> None:
        requests_mock.post(
            f"{TEST_SERVER}/fee-bump",
            exc=requests.ConnectionError("connection refused"),
        )
        client = _make_client()
        with pytest.raises(FluidNoAvailableServerError):
            client.request_fee_bump(DUMMY_XDR)


# ---------------------------------------------------------------------------
# Multi-server failover
# ---------------------------------------------------------------------------


class TestMultiServerFailover:
    def test_falls_back_to_second_server(self, requests_mock: Any) -> None:
        server1 = "https://fluid1.test"
        server2 = "https://fluid2.test"

        requests_mock.post(f"{server1}/fee-bump", status_code=503, text="down")
        requests_mock.post(f"{server2}/fee-bump", json=_fee_bump_payload())

        client = _make_client(server_urls=[server1, server2])

        with patch("time.sleep"):  # skip back-off delays in tests
            response = client.request_fee_bump(DUMMY_XDR)

        assert response.xdr == DUMMY_XDR
        # server1 should be marked as failed
        assert server1 in client._node_failure_state

    def test_raises_when_all_servers_fail(self, requests_mock: Any) -> None:
        server1 = "https://fluid1.test"
        server2 = "https://fluid2.test"

        requests_mock.post(f"{server1}/fee-bump", status_code=503, text="down")
        requests_mock.post(f"{server2}/fee-bump", status_code=503, text="down")

        client = _make_client(server_urls=[server1, server2])

        with patch("time.sleep"):
            with pytest.raises(FluidNoAvailableServerError):
                client.request_fee_bump(DUMMY_XDR)


# ---------------------------------------------------------------------------
# request_fee_bump_batch
# ---------------------------------------------------------------------------


class TestRequestFeeBumpBatch:
    def test_batch_returns_list(self, requests_mock: Any) -> None:
        requests_mock.post(
            f"{TEST_SERVER}/fee-bump/batch",
            json=[_fee_bump_payload(), _fee_bump_payload(hash="def456")],
        )
        client = _make_client()
        responses = client.request_fee_bump_batch([DUMMY_XDR, DUMMY_XDR])

        assert len(responses) == 2
        assert isinstance(responses[0], FeeBumpResponse)
        assert responses[1].hash == "def456"

    def test_batch_sends_correct_body(self, requests_mock: Any) -> None:
        adapter = requests_mock.post(
            f"{TEST_SERVER}/fee-bump/batch",
            json=[_fee_bump_payload()],
        )
        client = _make_client()
        client.request_fee_bump_batch([DUMMY_XDR])

        body = json.loads(adapter.last_request.body)
        assert body["xdrs"] == [DUMMY_XDR]
        assert body["submit"] is False


# ---------------------------------------------------------------------------
# submit_fee_bump_transaction
# ---------------------------------------------------------------------------


class TestSubmitFeeBumpTransaction:
    def test_raises_without_horizon_url(self) -> None:
        client = _make_client()
        with pytest.raises(FluidConfigError, match="horizon_url"):
            client.submit_fee_bump_transaction(DUMMY_XDR)

    def test_posts_to_horizon(self, requests_mock: Any) -> None:
        horizon = "https://horizon-testnet.stellar.org"
        requests_mock.post(
            f"{horizon}/transactions",
            json={"hash": "abc", "ledger": 1},
        )
        client = _make_client(horizon_url=horizon)
        result = client.submit_fee_bump_transaction(DUMMY_XDR)
        assert result["hash"] == "abc"

    def test_horizon_error_raises_fluid_request_error(
        self, requests_mock: Any
    ) -> None:
        horizon = "https://horizon-testnet.stellar.org"
        requests_mock.post(
            f"{horizon}/transactions",
            status_code=400,
            json={"title": "Transaction Failed"},
        )
        client = _make_client(horizon_url=horizon)
        with pytest.raises(FluidRequestError) as exc_info:
            client.submit_fee_bump_transaction(DUMMY_XDR)
        assert exc_info.value.status_code == 400


# ---------------------------------------------------------------------------
# Failure-state helpers
# ---------------------------------------------------------------------------


class TestNodeFailureState:
    def test_mark_failure_increments_count(self) -> None:
        client = _make_client()
        client._mark_server_failure(TEST_SERVER)
        assert client._node_failure_state[TEST_SERVER]["failures"] == 1

        client._mark_server_failure(TEST_SERVER)
        assert client._node_failure_state[TEST_SERVER]["failures"] == 2

    def test_mark_success_clears_state(self) -> None:
        client = _make_client()
        client._mark_server_failure(TEST_SERVER)
        client._mark_server_success(TEST_SERVER)
        assert TEST_SERVER not in client._node_failure_state

    def test_retry_delay_caps_at_max(self) -> None:
        from fluid_py.client import _MAX_RETRY_DELAY_S

        large_delay = FluidClient._retry_delay(100)
        assert large_delay == _MAX_RETRY_DELAY_S


# ---------------------------------------------------------------------------
# FeeBumpResponse
# ---------------------------------------------------------------------------


class TestFeeBumpResponse:
    def test_from_dict_minimal(self) -> None:
        r = FeeBumpResponse.from_dict({"xdr": DUMMY_XDR, "status": "ready"})
        assert r.xdr == DUMMY_XDR
        assert r.status == "ready"
        assert r.hash is None

    def test_from_dict_full(self) -> None:
        r = FeeBumpResponse.from_dict(
            {
                "xdr": DUMMY_XDR,
                "status": "submitted",
                "hash": "xyz",
                "fee_payer": "GABC",
                "submitted_via": "horizon",
                "submission_attempts": 1,
                "unknown_future_field": "ignored",
            }
        )
        assert r.hash == "xyz"
        assert r.fee_payer == "GABC"
        assert r.submission_attempts == 1
