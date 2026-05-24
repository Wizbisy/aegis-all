// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20, IERC20, IERC20Metadata} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "openzeppelin-contracts/contracts/access/AccessControl.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Math} from "openzeppelin-contracts/contracts/utils/math/Math.sol";

// Aegis modules
import {AegisErrors} from "./libraries/AegisErrors.sol";
import {AegisConstants} from "./libraries/AegisConstants.sol";
import {YieldMath} from "./libraries/YieldMath.sol";
import {IAegisUSDC} from "./interfaces/IAegisUSDC.sol";
import {IAegisVaultEvents} from "./interfaces/IAegisVaultEvents.sol";
import {Allowlist} from "./security/Allowlist.sol";
import {DepositGuard} from "./security/DepositGuard.sol";
import {EmergencyModule} from "./security/EmergencyModule.sol";

/**
 * @title AegisUSDC (aUSDC)
 * @author Aegis Yield
 * @notice Yield bearing ERC-4626 vault for USDC.
 *
 * @dev AegisUSDC is an ERC-4626 compliant vault that allows users to deposit USDC and receive aUSDC shares that appreciate in value as yield is distributed.
 *      The vault implements a permissioned access model with robust security features to protect user funds and ensure fair yield distribution.
 *
 */
contract AegisUSDC is
    ERC4626,
    Allowlist,
    DepositGuard,
    EmergencyModule,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;
    using Math for uint256;
    uint256 public totalYieldDistributed;
    uint256 public lastYieldTimestamp;
    uint256 public vaultInceptionTimestamp;
    uint256 public yieldSafetyThresholdBps;
    uint256 public managementFeeBps;
    uint256 public performanceFeeBps;
    address public feeCollector;
    uint256 public lastFeeCollectionTimestamp;
    uint256 public accruedManagementFees;
    uint256 public accruedPerformanceFees;
    uint256 public pendingYieldForFee;

    constructor(IERC20 _usdc) ERC4626(_usdc) ERC20("Aegis USDC", "aUSDC") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(AegisConstants.VAULT_MANAGER_ROLE, msg.sender);
        _grantRole(AegisConstants.YIELD_DISTRIBUTOR_ROLE, msg.sender);
        _grantRole(AegisConstants.EMERGENCY_ROLE, msg.sender);
        _grantRole(AegisConstants.FEE_MANAGER_ROLE, msg.sender);
        _initDepositGuard();

        yieldSafetyThresholdBps = AegisConstants.MAX_YIELD_PERCENT_BPS;
        vaultInceptionTimestamp = block.timestamp;
        feeCollector = msg.sender;
        lastFeeCollectionTimestamp = block.timestamp;
    }

    /**
     * @dev aUSDC uses 6 decimals to match USDC precision.
     */
    function decimals() public view virtual override returns (uint8) {
        return AegisConstants.USDC_DECIMALS;
    }

    /**
     * @notice Deposit USDC and receive aUSDC shares.
     * @dev Enforces: allowlist, pause, reentrancy, deposit limits, cooldowns.
     */
    function deposit(
        uint256 assets,
        address receiver
    )
        public
        override
        nonReentrant
        whenNotPaused
        whenCallerAndReceiverAllowlisted(receiver)
        returns (uint256)
    {
        _validateDeposit(receiver, assets, totalAssets());
        return super.deposit(assets, receiver);
    }

    /**
     * @notice Mint exact aUSDC shares by depositing equivalent USDC.
     */
    function mint(
        uint256 shares,
        address receiver
    )
        public
        override
        nonReentrant
        whenNotPaused
        whenCallerAndReceiverAllowlisted(receiver)
        returns (uint256)
    {
        if (shares == 0) revert AegisErrors.ZeroShares();
        uint256 assets = previewMint(shares);
        _validateDeposit(receiver, assets, totalAssets());
        return super.mint(shares, receiver);
    }

    /**
     * @notice Withdraw exact USDC amount by burning equivalent aUSDC shares.
     */
    function withdraw(
        uint256 assets,
        address receiver,
        address owner
    )
        public
        override
        nonReentrant
        whenNotPaused
        whenAllowlisted(receiver)
        returns (uint256)
    {
        _validateWithdraw(owner, assets);
        return super.withdraw(assets, receiver, owner);
    }

    /**
     * @notice Redeem exact aUSDC shares for equivalent USDC.
     */
    function redeem(
        uint256 shares,
        address receiver,
        address owner
    )
        public
        override
        nonReentrant
        whenNotPaused
        whenAllowlisted(receiver)
        returns (uint256)
    {
        if (shares == 0) revert AegisErrors.ZeroShares();
        uint256 assets = previewRedeem(shares);
        _validateWithdraw(owner, assets);
        return super.redeem(shares, receiver, owner);
    }

    /**
     * @notice Distribute yield by transferring USDC into the vault.
     * @dev Increases totalAssets() without minting shares = appreciation.
     *      Subject to safety threshold to prevent manipulation.
     *
     * @param amount The USDC amount to add as yield.
     */
    function distributeYield(
        uint256 amount
    ) external nonReentrant onlyRole(AegisConstants.YIELD_DISTRIBUTOR_ROLE) {
        if (amount == 0) revert AegisErrors.ZeroAmount();
        if (totalSupply() == 0) revert AegisErrors.NoSharesOutstanding();
        if (
            !YieldMath.isYieldWithinSafetyBounds(
                amount,
                totalAssets(),
                yieldSafetyThresholdBps
            )
        ) {
            revert AegisErrors.YieldExceedsSafetyThreshold(
                amount,
                totalAssets().mulDiv(
                    yieldSafetyThresholdBps,
                    AegisConstants.BPS_DENOMINATOR
                )
            );
        }

        IERC20(asset()).safeTransferFrom(msg.sender, address(this), amount);

        totalYieldDistributed += amount;
        lastYieldTimestamp = block.timestamp;
        pendingYieldForFee += amount;

        emit YieldDistributed(
            amount,
            totalAssets(),
            YieldMath.pricePerShare(totalAssets(), totalSupply()),
            block.timestamp
        );
    }

    /**
     * @notice Update yield safety threshold.
     * @param newThresholdBps New max yield per distribution in basis points of total assets.
     */
    function setYieldSafetyThreshold(
        uint256 newThresholdBps
    ) external onlyRole(AegisConstants.VAULT_MANAGER_ROLE) {
        uint256 old = yieldSafetyThresholdBps;
        yieldSafetyThresholdBps = newThresholdBps;
        emit YieldSafetyThresholdUpdated(old, newThresholdBps);
    }

    /**
     * @notice Set the annual management fee in basis points.
     * @param feeBps Fee rate (max 500 = 5%).
     */
    function setManagementFee(
        uint256 feeBps
    ) external onlyRole(AegisConstants.FEE_MANAGER_ROLE) {
        if (feeBps > AegisConstants.MAX_MANAGEMENT_FEE_BPS) {
            revert AegisErrors.FeeTooHigh(
                feeBps,
                AegisConstants.MAX_MANAGEMENT_FEE_BPS
            );
        }
        uint256 old = managementFeeBps;
        managementFeeBps = feeBps;
        emit ManagementFeeUpdated(old, feeBps);
    }

    /**
     * @notice Set the performance fee in basis points (applied to yield only).
     * @param feeBps Fee rate (max 2000 = 20%).
     */
    function setPerformanceFee(
        uint256 feeBps
    ) external onlyRole(AegisConstants.FEE_MANAGER_ROLE) {
        if (feeBps > AegisConstants.MAX_PERFORMANCE_FEE_BPS) {
            revert AegisErrors.FeeTooHigh(
                feeBps,
                AegisConstants.MAX_PERFORMANCE_FEE_BPS
            );
        }
        uint256 old = performanceFeeBps;
        performanceFeeBps = feeBps;
        emit PerformanceFeeUpdated(old, feeBps);
    }

    /**
     * @notice Set the address that receives collected fees.
     */
    function setFeeCollector(
        address collector
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (collector == address(0)) revert AegisErrors.ZeroAddress();
        address old = feeCollector;
        feeCollector = collector;
        emit FeeCollectorUpdated(old, collector);
    }

    /**
     * @notice Collect accrued management and performance fees.
     * @dev Mints new aUSDC shares to the fee collector, diluting existing holders
     *      proportionally to the fee amount.
     */
    function collectFees() external onlyRole(AegisConstants.FEE_MANAGER_ROLE) {
        uint256 currentAssets = totalAssets();
        uint256 elapsed = block.timestamp - lastFeeCollectionTimestamp;
        uint256 mgmtFee = 0;
        if (managementFeeBps > 0 && elapsed > 0 && currentAssets > 0) {
            mgmtFee = currentAssets
                .mulDiv(managementFeeBps, AegisConstants.BPS_DENOMINATOR)
                .mulDiv(elapsed, 365 days);
        }

        uint256 perfFee = 0;
        if (performanceFeeBps > 0 && pendingYieldForFee > 0) {
            perfFee = YieldMath.calculateFee(pendingYieldForFee, performanceFeeBps);
        }
        pendingYieldForFee = 0;

        uint256 totalFee = mgmtFee + perfFee;
        if (totalFee > 0) {
            uint256 feeShares = totalFee.mulDiv(
                totalSupply(),
                currentAssets - totalFee,
                Math.Rounding.Floor
            );
            if (feeShares > 0) {
                _mint(feeCollector, feeShares);
            }

            accruedManagementFees += mgmtFee;
            accruedPerformanceFees += perfFee;
        }

        lastFeeCollectionTimestamp = block.timestamp;

        emit FeesCollected(feeCollector, mgmtFee, perfFee);
    }

    /**
     * @notice Current exchange rate: USDC value of one aUSDC share.
     * @return Scaled to 1e6 (6 decimals). 1_000_000 = 1:1 peg.
     */
    function pricePerShare() external view returns (uint256) {
        return YieldMath.pricePerShare(totalAssets(), totalSupply());
    }

    /**
     * @notice Estimated annualized yield in basis points.
     */
    function estimatedAPY() external view returns (uint256) {
        uint256 elapsed = block.timestamp - vaultInceptionTimestamp;
        return
            YieldMath.estimateAPY(
                totalYieldDistributed,
                totalAssets(),
                elapsed
            );
    }

    /**
     * @notice Protocol version identifier.
     */
    function vaultVersion() external pure returns (string memory) {
        return "1.0.0";
    }

    /**
     * @dev Resolve AccessControl.supportsInterface across the inheritance diamond.
     */
    function supportsInterface(
        bytes4 interfaceId
    ) public view override(AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
