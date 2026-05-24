// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC4626} from "openzeppelin-contracts/contracts/interfaces/IERC4626.sol";

interface IAegisUSDC is IERC4626 {
    function setAllowlist(address account, bool status) external;

    function setAllowlistBatch(
        address[] calldata accounts,
        bool status
    ) external;

    function isAllowlisted(address account) external view returns (bool);

    function distributeYield(uint256 amount) external;

    function pricePerShare() external view returns (uint256);

    function estimatedAPY() external view returns (uint256);

    function totalYieldDistributed() external view returns (uint256);

    function lastYieldTimestamp() external view returns (uint256);

    function vaultInceptionTimestamp() external view returns (uint256);

    function setDepositLimits(
        uint256 min,
        uint256 max,
        uint256 globalCap
    ) external;

    function setWithdrawLimits(uint256 min) external;

    function setCooldowns(
        uint256 depositCooldown,
        uint256 withdrawLock
    ) external;

    function minDepositAmount() external view returns (uint256);

    function maxDepositAmount() external view returns (uint256);

    function globalDepositCap() external view returns (uint256);

    function minWithdrawAmount() external view returns (uint256);

    function setManagementFee(uint256 feeBps) external;

    function setPerformanceFee(uint256 feeBps) external;

    function setFeeCollector(address collector) external;

    function collectFees() external;

    function managementFeeBps() external view returns (uint256);

    function performanceFeeBps() external view returns (uint256);

    function feeCollector() external view returns (address);

    function pause() external;

    function unpause() external;

    function activateEmergency() external;

    function deactivateEmergency() external;

    function emergencyWithdraw(address to, uint256 amount) external;

    function isEmergencyActive() external view returns (bool);

    function vaultVersion() external pure returns (string memory);
}
