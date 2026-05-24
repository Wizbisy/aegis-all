// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {AegisErrors} from "../libraries/AegisErrors.sol";
import {AegisConstants} from "../libraries/AegisConstants.sol";
import {IAegisVaultEvents} from "../interfaces/IAegisVaultEvents.sol";

/**
 * @title Allowlist
 * @notice Modular allowlist registry for permissioned vault access.
 * @dev Extracted from the vault contract to isolate access control logic
 *      and enable independent auditing of the permissioning layer.
 *
 */
abstract contract Allowlist is AccessControl, IAegisVaultEvents {
    mapping(address => bool) private _allowlisted;

    modifier whenAllowlisted(address account) {
        if (!_allowlisted[account]) revert AegisErrors.NotAllowlisted(account);
        _;
    }

    modifier whenCallerAndReceiverAllowlisted(address receiver) {
        if (!_allowlisted[msg.sender])
            revert AegisErrors.CallerNotAllowlisted(msg.sender);
        if (!_allowlisted[receiver])
            revert AegisErrors.ReceiverNotAllowlisted(receiver);
        _;
    }

    /**
     * @notice Set allowlist status for a single address.
     * @param account The address to update.
     * @param status True to allowlist, false to revoke.
     */
    function setAllowlist(
        address account,
        bool status
    ) external onlyRole(AegisConstants.VAULT_MANAGER_ROLE) {
        if (account == address(0)) revert AegisErrors.ZeroAddress();
        _allowlisted[account] = status;
        emit AllowlistUpdated(account, status);
    }

    /**
     * @notice Batch update allowlist status for multiple addresses.
     * @param accounts Array of addresses.
     * @param status True to allowlist all, false to revoke all.
     */
    function setAllowlistBatch(
        address[] calldata accounts,
        bool status
    ) external onlyRole(AegisConstants.VAULT_MANAGER_ROLE) {
        uint256 len = accounts.length;
        for (uint256 i = 0; i < len; ) {
            if (accounts[i] == address(0)) revert AegisErrors.ZeroAddress();
            _allowlisted[accounts[i]] = status;
            unchecked {
                ++i;
            }
        }
        emit AllowlistBatchUpdated(accounts, status);
    }

    /**
     * @notice Check if an address is allowlisted.
     */
    function isAllowlisted(address account) external view returns (bool) {
        return _allowlisted[account];
    }

    /**
     * @dev Internal check for use by other modules.
     */
    function _isAllowlisted(address account) internal view returns (bool) {
        return _allowlisted[account];
    }
}
