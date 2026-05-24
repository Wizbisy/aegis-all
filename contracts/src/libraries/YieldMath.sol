// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Math} from "openzeppelin-contracts/contracts/utils/math/Math.sol";
import {AegisConstants} from "./AegisConstants.sol";

/**
 * @title YieldMath
 * @notice Pure math functions for yield calculations in the Aegis vault.
 * @dev All functions are internal/pure to inline at compile time, zero gas overhead.
 */
library YieldMath {
    using Math for uint256;

    /**
     * @notice Calculate the exchange rate (price per share) given total assets and supply.
     * @param totalAssets The total USDC held by the vault.
     * @param totalSupply The total aUSDC shares outstanding.
     * @return rate Scaled to USDC decimals (1e6 = 1:1 peg).
     */
    function pricePerShare(
        uint256 totalAssets,
        uint256 totalSupply
    ) internal pure returns (uint256) {
        if (totalSupply == 0) return AegisConstants.ONE_USDC;
        return
            totalAssets.mulDiv(
                AegisConstants.ONE_USDC,
                totalSupply,
                Math.Rounding.Floor
            );
    }

    /**
     * @notice Calculate APY estimate in basis points from yield history.
     * @param totalYield Cumulative yield distributed.
     * @param totalAssets Current total vault assets.
     * @param elapsedSeconds Seconds since vault inception or last reset.
     * @return apyBps Annualized yield in basis points.
     */
    function estimateAPY(
        uint256 totalYield,
        uint256 totalAssets,
        uint256 elapsedSeconds
    ) internal pure returns (uint256) {
        if (totalYield == 0 || totalAssets == 0 || elapsedSeconds == 0)
            return 0;
        return
            totalYield
                .mulDiv(365 days, elapsedSeconds, Math.Rounding.Floor)
                .mulDiv(
                    AegisConstants.BPS_DENOMINATOR,
                    totalAssets,
                    Math.Rounding.Floor
                );
    }

    /**
     * @notice Calculate the management fee amount from a given asset total.
     * @param assets The asset base to apply the fee to.
     * @param feeBps The fee rate in basis points.
     * @return feeAmount The fee in asset units.
     */
    function calculateFee(
        uint256 assets,
        uint256 feeBps
    ) internal pure returns (uint256) {
        return
            assets.mulDiv(
                feeBps,
                AegisConstants.BPS_DENOMINATOR,
                Math.Rounding.Floor
            );
    }

    /**
     * @notice Validate that a yield distribution does not exceed the safety threshold.
     * @param yieldAmount The proposed yield to distribute.
     * @param totalAssets Current total vault assets.
     * @param maxPercentBps Maximum allowed yield as % of total assets in bps.
     * @return isValid True if within safety bounds.
     */
    function isYieldWithinSafetyBounds(
        uint256 yieldAmount,
        uint256 totalAssets,
        uint256 maxPercentBps
    ) internal pure returns (bool) {
        if (totalAssets == 0) return false;
        uint256 maxAllowed = totalAssets.mulDiv(
            maxPercentBps,
            AegisConstants.BPS_DENOMINATOR,
            Math.Rounding.Floor
        );
        return yieldAmount <= maxAllowed;
    }

    /**
     * @notice Convert a USDC amount to aUSDC shares at a given exchange rate.
     * @param assets The USDC amount.
     * @param totalAssets Current total vault assets.
     * @param totalSupply Current total shares outstanding.
     * @return shares The equivalent aUSDC shares.
     */
    function assetsToShares(
        uint256 assets,
        uint256 totalAssets,
        uint256 totalSupply
    ) internal pure returns (uint256) {
        if (totalSupply == 0) return assets;
        return assets.mulDiv(totalSupply, totalAssets, Math.Rounding.Floor);
    }

    /**
     * @notice Convert aUSDC shares to USDC amount at a given exchange rate.
     * @param shares The aUSDC shares.
     * @param totalAssets Current total vault assets.
     * @param totalSupply Current total shares outstanding.
     * @return assets The equivalent USDC amount.
     */
    function sharesToAssets(
        uint256 shares,
        uint256 totalAssets,
        uint256 totalSupply
    ) internal pure returns (uint256) {
        if (totalSupply == 0) return shares;
        return shares.mulDiv(totalAssets, totalSupply, Math.Rounding.Floor);
    }
}
