"""Fluid Python SDK — ``fluid-py``.

A Pythonic client for the `Fluid <https://github.com/Stellar-Fluid/fluid>`_
fee-sponsorship server.  Sponsor Stellar transaction fees from any Python
app, AI agent, or backend automation script.

Quick start::

    from fluid_py import FluidClient, FluidClientConfig

    client = FluidClient(
        FluidClientConfig(
            server_url="https://fluid.example.com",
            network_passphrase="Test SDF Network ; September 2015",
        )
    )
    response = client.request_fee_bump("<inner-transaction-xdr>")
    print(response.xdr)
"""

from fluid_py.client import FluidClient, TransactionInput, XdrSerializable
from fluid_py.exceptions import (
    FluidConfigError,
    FluidError,
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

__version__ = "0.1.0"
__all__ = [
    # Client
    "FluidClient",
    # Config + models
    "FluidClientConfig",
    "FeeBumpResponse",
    "FeeBumpRequest",
    "FeeBumpBatchRequest",
    # Protocols
    "XdrSerializable",
    "TransactionInput",
    # Exceptions
    "FluidError",
    "FluidRequestError",
    "FluidConfigError",
    "FluidSerializationError",
    "FluidNoAvailableServerError",
]
