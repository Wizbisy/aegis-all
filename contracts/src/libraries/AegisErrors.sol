// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AegisErrors
 * @notice Centralized custom error definitions for the Aegis protocol.
 * @dev Using custom errors instead of require strings saves ~50 gas per revert
 *      and enforces consistent error handling across all modules.
 */
library AegisErrors {
    error NotAllowlisted(address account);
    error CallerNotAllowlisted(address caller);
    error ReceiverNotAllowlisted(address receiver);
    error ZeroAmount();
    error ZeroAddress();
    error ZeroShares();
    error BelowMinDeposit(uint256 amount, uint256 minimum);
    error AboveMaxDeposit(uint256 amount, uint256 maximum);
    error ExceedsGlobalCap(uint256 newTotal, uint256 cap);
    error DepositCooldownActive(address account, uint256 availableAt);
    error BelowMinWithdraw(uint256 amount, uint256 minimum);
    error WithdrawLockActive(address account, uint256 availableAt);
    error NoSharesOutstanding();
    error YieldExceedsSafetyThreshold(uint256 amount, uint256 threshold);
    error EmergencyAlreadyActive();
    error EmergencyNotActive();
    error EmergencyTimelockPending(uint256 availableAt);
    error TimelockNotExpired(bytes32 operationId, uint256 availableAt);
    error TimelockNotQueued(bytes32 operationId);
    error TimelockAlreadyQueued(bytes32 operationId);
    error FeeTooHigh(uint256 fee, uint256 maxFee);
}
