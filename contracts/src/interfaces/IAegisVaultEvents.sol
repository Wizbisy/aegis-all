// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAegisVaultEvents {
    event AllowlistUpdated(address indexed account, bool status);
    event AllowlistBatchUpdated(address[] accounts, bool status);
    event YieldDistributed(
        uint256 amount,
        uint256 newTotalAssets,
        uint256 newPricePerShare,
        uint256 timestamp
    );
    event YieldSafetyThresholdUpdated(
        uint256 oldThreshold,
        uint256 newThreshold
    );
    event DepositLimitsUpdated(
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 globalCap
    );
    event WithdrawLimitsUpdated(uint256 minWithdraw);
    event CooldownUpdated(uint256 depositCooldown, uint256 withdrawLock);
    event ManagementFeeUpdated(uint256 oldFee, uint256 newFee);
    event PerformanceFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeCollectorUpdated(
        address indexed oldCollector,
        address indexed newCollector
    );
    event FeesCollected(
        address indexed collector,
        uint256 managementFee,
        uint256 performanceFee
    );
    event EmergencyActivated(address indexed activatedBy, uint256 timestamp);
    event EmergencyDeactivated(
        address indexed deactivatedBy,
        uint256 timestamp
    );
    event EmergencyWithdraw(address indexed to, uint256 amount);
    event OperationQueued(bytes32 indexed operationId, uint256 executeAfter);
    event OperationExecuted(bytes32 indexed operationId);
    event OperationCancelled(bytes32 indexed operationId);
}
