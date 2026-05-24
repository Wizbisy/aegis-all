// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AegisConstants
 * @notice constants for the Aegis vault system.
 * @dev Separated from contract logic to allow clean imports and auditor review.
 */
library AegisConstants {
    /// @dev USDC uses 6 decimals
    uint8 internal constant USDC_DECIMALS = 6;

    /// @dev 1 USDC in smallest unit
    uint256 internal constant ONE_USDC = 1e6;

    /// @dev Basis point denominator (100% = 10_000 bps)
    uint256 internal constant BPS_DENOMINATOR = 10_000;

    /// @dev Precision multiplier for exchange rate calculations
    uint256 internal constant RATE_PRECISION = 1e18;

    /// @dev 1 USDC minimum deposit
    uint256 internal constant DEFAULT_MIN_DEPOSIT = 1e6;

    /// @dev 10M USDC max per single deposit
    uint256 internal constant DEFAULT_MAX_DEPOSIT = 10_000_000e6;

    /// @dev 100M USDC global vault cap
    uint256 internal constant DEFAULT_GLOBAL_CAP = 100_000_000e6;

    /// @dev 1 USDC minimum withdrawal
    uint256 internal constant DEFAULT_MIN_WITHDRAW = 1e6;

    /// @dev Maximum management fee: 5% (500 bps)
    uint256 internal constant MAX_MANAGEMENT_FEE_BPS = 500;

    /// @dev Maximum performance fee: 20% (2000 bps)
    uint256 internal constant MAX_PERFORMANCE_FEE_BPS = 2_000;

    /// @dev Maximum yield distribution per call: 10% of total assets
    uint256 internal constant MAX_YIELD_PERCENT_BPS = 1_000;

    /// @dev Minimum delay for timelocked operations (24 hours)
    uint256 internal constant MIN_TIMELOCK_DELAY = 24 hours;

    /// @dev Emergency timelock delay (6 hours)
    uint256 internal constant EMERGENCY_TIMELOCK_DELAY = 6 hours;

    /// @dev Deposit cooldown period per address (disabled by default, configurable)
    uint256 internal constant DEFAULT_DEPOSIT_COOLDOWN = 0;

    /// @dev Withdraw lock period after deposit (disabled by default, configurable)
    uint256 internal constant DEFAULT_WITHDRAW_LOCK = 0;

    bytes32 internal constant VAULT_MANAGER_ROLE =
        keccak256("VAULT_MANAGER_ROLE");
    bytes32 internal constant YIELD_DISTRIBUTOR_ROLE =
        keccak256("YIELD_DISTRIBUTOR_ROLE");
    bytes32 internal constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    bytes32 internal constant FEE_MANAGER_ROLE = keccak256("FEE_MANAGER_ROLE");
}
