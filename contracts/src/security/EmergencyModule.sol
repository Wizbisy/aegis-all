// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {AegisErrors} from "../libraries/AegisErrors.sol";
import {AegisConstants} from "../libraries/AegisConstants.sol";
import {IAegisVaultEvents} from "../interfaces/IAegisVaultEvents.sol";

/**
 * @title EmergencyModule
 * @notice Circuit breaker and emergency recovery controls for the Aegis vault.
 * @dev Provides:
 *   - Emergency mode activation with timelock for critical operations
 *   - Pausable integration for instant deposit/withdraw halts
 *   - Emergency fund recovery for stuck tokens
 *
 *   Emergency mode is a higher severity state than pause. When emergency is active:
 *   - All vault operations are paused
 *   - Admin can execute emergency withdrawals after a timelock
 *   - Only DEFAULT_ADMIN_ROLE can deactivate
 */
abstract contract EmergencyModule is
    AccessControl,
    Pausable,
    IAegisVaultEvents
{
    using SafeERC20 for IERC20;

    bool private _emergencyActive;
    uint256 public emergencyActivatedAt;

    modifier whenEmergencyActive() {
        if (!_emergencyActive) revert AegisErrors.EmergencyNotActive();
        _;
    }

    modifier whenNoEmergency() {
        if (_emergencyActive) revert AegisErrors.EmergencyAlreadyActive();
        _;
    }

    /**
     * @notice Activate emergency mode. Pauses all operations immediately.
     */
    function activateEmergency()
        external
        onlyRole(AegisConstants.EMERGENCY_ROLE)
        whenNoEmergency
    {
        _emergencyActive = true;
        emergencyActivatedAt = block.timestamp;
        _pause();
        emit EmergencyActivated(msg.sender, block.timestamp);
    }

    /**
     * @notice Deactivate emergency mode and unpause the vault.
     */
    function deactivateEmergency()
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        whenEmergencyActive
    {
        _emergencyActive = false;
        emergencyActivatedAt = 0;
        _unpause();
        emit EmergencyDeactivated(msg.sender, block.timestamp);
    }

    /**
     * @notice Emergency only: recover tokens stuck in the vault.
     * @dev Subject to emergency timelock to prevent instant rug.
     */
    function emergencyWithdraw(
        address token,
        address to,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) whenEmergencyActive {
        if (to == address(0)) revert AegisErrors.ZeroAddress();
        uint256 availableAt = emergencyActivatedAt +
            AegisConstants.EMERGENCY_TIMELOCK_DELAY;
        if (block.timestamp < availableAt) {
            revert AegisErrors.EmergencyTimelockPending(availableAt);
        }
        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdraw(to, amount);
    }

    function isEmergencyActive() external view returns (bool) {
        return _emergencyActive;
    }

    /**
     * @notice Standard pause (non emergency).
     */
    function pause() external onlyRole(AegisConstants.VAULT_MANAGER_ROLE) {
        _pause();
    }

    /**
     * @notice Standard unpause (non emergency).
     */
    function unpause()
        external
        onlyRole(AegisConstants.VAULT_MANAGER_ROLE)
        whenNoEmergency
    {
        _unpause();
    }
}
