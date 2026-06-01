// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title SimpleCounter
 * @dev Simple counter contract for Soroban <-> EVM state sync proof-of-concept.
 */
contract SimpleCounter {
    uint256 public count;
    address public relayer;

    event Incremented(uint256 newCount);
    event Synced(uint256 newCount);

    constructor() {
        relayer = msg.sender;
    }

    /**
     * @dev Restricts access to the authorized relayer.
     */
    modifier onlyRelayer() {
        require(msg.sender == relayer, "Only relayer can call this");
        _;
    }

    /**
     * @dev Increments the counter and emits an event.
     */
    function increment() public {
        count += 1;
        emit Incremented(count);
    }

    /**
     * @dev Syncs the counter with a value from another chain.
     * @param newCount The new counter value.
     */
    function syncCount(uint256 newCount) public onlyRelayer {
        count = newCount;
        emit Synced(newCount);
    }

    /**
     * @dev Returns the current counter value.
     */
    function getCount() public view returns (uint256) {
        return count;
    }
}
