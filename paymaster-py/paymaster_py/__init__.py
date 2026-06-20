"""Paymaster Python SDK — ``paymaster-py``.

A Pythonic client for the `Paymaster <https://github.com/Stellar-Paymaster/paymaster>`_
fee-sponsorship server.  Sponsor Stellar transaction fees from any Python
app, AI agent, or backend automation script.

Quick start::

    from paymaster_py import PaymasterClient, PaymasterClientConfig

    client = PaymasterClient(
        PaymasterClientConfig(
            server_url="https://paymaster.example.com",
            network_passphrase="Test SDF Network ; September 2015",
        )
    )
    response = client.request_fee_bump("<inner-transaction-xdr>")
    print(response.xdr)
"""

from paymaster_py.client import PaymasterClient, TransactionInput, XdrSerializable
from paymaster_py.exceptions import (
    PaymasterConfigError,
    PaymasterError,
    PaymasterNoAvailableServerError,
    PaymasterRequestError,
    PaymasterSerializationError,
)
from paymaster_py.models import (
    FeeBumpBatchRequest,
    FeeBumpRequest,
    FeeBumpResponse,
    PaymasterClientConfig,
)

__version__ = "0.1.0"
__all__ = [
    # Client
    "PaymasterClient",
    # Config + models
    "PaymasterClientConfig",
    "FeeBumpResponse",
    "FeeBumpRequest",
    "FeeBumpBatchRequest",
    # Protocols
    "XdrSerializable",
    "TransactionInput",
    # Exceptions
    "PaymasterError",
    "PaymasterRequestError",
    "PaymasterConfigError",
    "PaymasterSerializationError",
    "PaymasterNoAvailableServerError",
]
