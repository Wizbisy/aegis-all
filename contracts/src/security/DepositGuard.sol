// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {AegisErrors} from "../libraries/AegisErrors.sol";
import {AegisConstants} from "../libraries/AegisConstants.sol";
import {IAegisVaultEvents} from "../interfaces/IAegisVaultEvents.sol";

/**
 * @title DepositGuard
 * @notice Validates deposit and withdrawal operations against configurable limits.
 * @dev Enforces per transaction limits, global caps, cooldowns, and withdraw locks.
 *      Separated from vault logic for independent auditing and modular upgrades.
 */
abstract contract DepositGuard is AccessControl, IAegisVaultEvents {
    uint256 public minDepositAmount;
    uint256 public maxDepositAmount;
    uint256 public globalDepositCap;
    uint256 public minWithdrawAmount;
    uint256 public depositCooldown;
    uint256 public withdrawLockPeriod;
    mapping(address => uint256) public lastDepositTime;

    /**
     * @dev Initialize with sensible defaults from AegisConstants.
     */
    function _initDepositGuard() internal {
        minDepositAmount = AegisConstants.DEFAULT_MIN_DEPOSIT;
        maxDepositAmount = AegisConstants.DEFAULT_MAX_DEPOSIT;
        globalDepositCap = AegisConstants.DEFAULT_GLOBAL_CAP;
        minWithdrawAmount = AegisConstants.DEFAULT_MIN_WITHDRAW;
        depositCooldown = AegisConstants.DEFAULT_DEPOSIT_COOLDOWN;
        withdrawLockPeriod = AegisConstants.DEFAULT_WITHDRAW_LOCK;
    }

    /**
     * @notice Update deposit limits.
     */
    function setDepositLimits(
        uint256 _min,
        uint256 _max,
        uint256 _globalCap
    ) external onlyRole(AegisConstants.VAULT_MANAGER_ROLE) {
        minDepositAmount = _min;
        maxDepositAmount = _max;
        globalDepositCap = _globalCap;
        emit DepositLimitsUpdated(_min, _max, _globalCap);
    }

    /**
     * @notice Update withdrawal minimum.
     */
    function setWithdrawLimits(
        uint256 _min
    ) external onlyRole(AegisConstants.VAULT_MANAGER_ROLE) {
        minWithdrawAmount = _min;
        emit WithdrawLimitsUpdated(_min);
    }

    /**
     * @notice Update cooldown periods.
     * @param _depositCooldown Minimum seconds between deposits per address.
     * @param _withdrawLock Seconds after deposit before withdraw is allowed.
     */
    function setCooldowns(
        uint256 _depositCooldown,
        uint256 _withdrawLock
    ) external onlyRole(AegisConstants.VAULT_MANAGER_ROLE) {
        depositCooldown = _depositCooldown;
        withdrawLockPeriod = _withdrawLock;
        emit CooldownUpdated(_depositCooldown, _withdrawLock);
    }

    /**
     * @dev Validate a deposit against all configured limits.
     */
    function _validateDeposit(
        address depositor,
        uint256 assets,
        uint256 currentTotalAssets
    ) internal {
        if (assets == 0) revert AegisErrors.ZeroAmount();
        if (assets < minDepositAmount)
            revert AegisErrors.BelowMinDeposit(assets, minDepositAmount);
        if (assets > maxDepositAmount)
            revert AegisErrors.AboveMaxDeposit(assets, maxDepositAmount);

        uint256 newTotal = currentTotalAssets + assets;
        if (newTotal > globalDepositCap)
            revert AegisErrors.ExceedsGlobalCap(newTotal, globalDepositCap);

        if (depositCooldown > 0) {
            uint256 nextAllowed = lastDepositTime[depositor] + depositCooldown;
            if (block.timestamp < nextAllowed) {
                revert AegisErrors.DepositCooldownActive(
                    depositor,
                    nextAllowed
                );
            }
        }

        lastDepositTime[depositor] = block.timestamp;
    }

    /**
     * @dev Validate a withdrawal against limits and lock period.
     */
    function _validateWithdraw(address owner, uint256 assets) internal view {
        if (assets == 0) revert AegisErrors.ZeroAmount();
        if (assets < minWithdrawAmount)
            revert AegisErrors.BelowMinWithdraw(assets, minWithdrawAmount);

        if (withdrawLockPeriod > 0) {
            uint256 unlockTime = lastDepositTime[owner] + withdrawLockPeriod;
            if (block.timestamp < unlockTime) {
                revert AegisErrors.WithdrawLockActive(owner, unlockTime);
            }
        }
    }
}
