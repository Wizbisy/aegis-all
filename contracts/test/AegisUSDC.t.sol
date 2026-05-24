// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AegisUSDC} from "../src/AegisUSDC.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {AegisErrors} from "../src/libraries/AegisErrors.sol";
import {AegisConstants} from "../src/libraries/AegisConstants.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract AegisUSDCTest is Test {
    AegisUSDC public vault;
    MockUSDC public usdc;
    address public admin = address(this);
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public attacker = makeAddr("attacker");
    address public feeReceiver = makeAddr("feeReceiver");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new AegisUSDC(IERC20(address(usdc)));

        vault.setAllowlist(alice, true);
        vault.setAllowlist(bob, true);
        vault.setAllowlist(charlie, true);
        vault.setAllowlist(admin, true);

        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
        usdc.mint(charlie, 1_000_000e6);
        usdc.mint(admin, 10_000_000e6);
    }

    function testDepositBasic() public {
        uint256 amount = 10_000e6;

        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(amount, alice);
        vm.stopPrank();

        assertGt(shares, 0);
        assertEq(vault.balanceOf(alice), shares);
        assertEq(vault.totalAssets(), amount);
        assertEq(usdc.balanceOf(address(vault)), amount);
    }

    function testWithdrawBasic() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);

        uint256 sharesBefore = vault.balanceOf(alice);
        uint256 sharesSpent = vault.withdraw(5_000e6, alice, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), sharesBefore - sharesSpent);
        assertEq(usdc.balanceOf(alice), 995_000e6);
    }

    function testMintExact() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        uint256 assetsNeeded = vault.mint(5_000e6, alice);
        vm.stopPrank();

        assertEq(vault.balanceOf(alice), 5_000e6);
        assertEq(assetsNeeded, 5_000e6);
    }

    function testRedeemFull() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        uint256 shares = vault.deposit(10_000e6, alice);

        uint256 assets = vault.redeem(shares, alice, alice);
        vm.stopPrank();

        assertEq(assets, 10_000e6);
        assertEq(vault.balanceOf(alice), 0);
    }

    function testYieldIncreasesShareValue() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);
        vm.stopPrank();
        usdc.approve(address(vault), 500e6);
        vault.distributeYield(500e6);
        uint256 redeemable = vault.previewRedeem(vault.balanceOf(alice));
        assertApproxEqAbs(redeemable, 10_500e6, 1);
        assertGt(vault.pricePerShare(), 1e6);
    }

    function testYieldProportionalDistribution() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), 40_000e6);
        vault.deposit(40_000e6, bob);
        vm.stopPrank();

        usdc.approve(address(vault), 1_000e6);
        vault.distributeYield(1_000e6);

        uint256 aliceValue = vault.previewRedeem(vault.balanceOf(alice));
        uint256 bobValue = vault.previewRedeem(vault.balanceOf(bob));

        assertApproxEqAbs(aliceValue, 10_200e6, 1);
        assertApproxEqAbs(bobValue, 40_800e6, 1);
    }

    function testYieldMultipleDistributions() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 100_000e6);
        vault.deposit(100_000e6, alice);
        vm.stopPrank();

        for (uint256 i = 0; i < 5; i++) {
            usdc.approve(address(vault), 1_000e6);
            vault.distributeYield(1_000e6);
        }

        assertEq(vault.totalYieldDistributed(), 5_000e6);
        assertApproxEqAbs(
            vault.previewRedeem(vault.balanceOf(alice)),
            105_000e6,
            1
        );
    }

    function testYieldRevertWhenExceedsSafetyThreshold() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);
        vm.stopPrank();

        uint256 tooMuch = 1_001e6;
        usdc.approve(address(vault), tooMuch);
        vm.expectRevert();
        vault.distributeYield(tooMuch);
    }

    function testYieldRevertWhenNoShares() public {
        usdc.approve(address(vault), 100e6);
        vm.expectRevert(AegisErrors.NoSharesOutstanding.selector);
        vault.distributeYield(100e6);
    }

    function testAllowlistBlocksNonAllowlistedDeposit() public {
        usdc.mint(attacker, 10_000e6);

        vm.startPrank(attacker);
        usdc.approve(address(vault), 10_000e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                AegisErrors.CallerNotAllowlisted.selector,
                attacker
            )
        );
        vault.deposit(10_000e6, attacker);
        vm.stopPrank();
    }

    function testAllowlistBlocksNonAllowlistedReceiver() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vm.expectRevert(
            abi.encodeWithSelector(
                AegisErrors.ReceiverNotAllowlisted.selector,
                attacker
            )
        );
        vault.deposit(10_000e6, attacker);
        vm.stopPrank();
    }

    function testAllowlistBlocksNonAllowlistedWithdrawReceiver() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);

        vm.expectRevert(
            abi.encodeWithSelector(
                AegisErrors.NotAllowlisted.selector,
                attacker
            )
        );
        vault.withdraw(5_000e6, attacker, alice);
        vm.stopPrank();
    }

    function testAllowlistBatchUpdate() public {
        address[] memory accounts = new address[](3);
        accounts[0] = makeAddr("u1");
        accounts[1] = makeAddr("u2");
        accounts[2] = makeAddr("u3");

        vault.setAllowlistBatch(accounts, true);

        for (uint256 i = 0; i < accounts.length; i++) {
            assertTrue(vault.isAllowlisted(accounts[i]));
        }

        vault.setAllowlistBatch(accounts, false);
        for (uint256 i = 0; i < accounts.length; i++) {
            assertFalse(vault.isAllowlisted(accounts[i]));
        }
    }

    function testAllowlistRevertZeroAddress() public {
        vm.expectRevert(AegisErrors.ZeroAddress.selector);
        vault.setAllowlist(address(0), true);
    }

    function testDepositLimitBelowMinimum() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 1e5);
        vm.expectRevert(
            abi.encodeWithSelector(
                AegisErrors.BelowMinDeposit.selector,
                1e5,
                1e6
            )
        );
        vault.deposit(1e5, alice);
        vm.stopPrank();
    }

    function testDepositLimitAboveMaximum() public {
        uint256 tooMuch = 10_000_001e6;
        usdc.mint(alice, tooMuch);

        vm.startPrank(alice);
        usdc.approve(address(vault), tooMuch);
        vm.expectRevert(
            abi.encodeWithSelector(
                AegisErrors.AboveMaxDeposit.selector,
                tooMuch,
                10_000_000e6
            )
        );
        vault.deposit(tooMuch, alice);
        vm.stopPrank();
    }

    function testDepositLimitExceedsGlobalCap() public {
        vault.setDepositLimits(1e6, 10_000_000e6, 50_000e6);

        vm.startPrank(alice);
        usdc.approve(address(vault), 50_001e6);
        vm.expectRevert();
        vault.deposit(50_001e6, alice);
        vm.stopPrank();
    }

    function testDepositLimitCooldown() public {
        vault.setCooldowns(60, 0);

        vm.warp(1000);

        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(1_000e6, alice);

        vm.warp(1030);
        vm.expectRevert();
        vault.deposit(1_000e6, alice);

        vm.warp(1061);
        vault.deposit(1_000e6, alice);
        vm.stopPrank();
    }

    function testWithdrawLimitLockPeriod() public {
        vault.setCooldowns(0, 3600);

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);

        vm.expectRevert();
        vault.withdraw(5_000e6, alice, alice);

        vm.warp(block.timestamp + 3601);
        vault.withdraw(5_000e6, alice, alice);
        vm.stopPrank();
    }

    function testFeesManagementFee() public {
        vault.setManagementFee(100);
        vault.setFeeCollector(feeReceiver);

        vm.startPrank(alice);
        usdc.approve(address(vault), 100_000e6);
        vault.deposit(100_000e6, alice);
        vm.stopPrank();

        vm.warp(block.timestamp + 365 days);

        vault.collectFees();

        assertGt(vault.balanceOf(feeReceiver), 0);
    }

    function testFeesPerformanceFee() public {
        vault.setPerformanceFee(1_000);
        vault.setFeeCollector(feeReceiver);

        vm.startPrank(alice);
        usdc.approve(address(vault), 100_000e6);
        vault.deposit(100_000e6, alice);
        vm.stopPrank();

        vault.collectFees();

        usdc.approve(address(vault), 10_000e6);
        vault.distributeYield(10_000e6);

        vault.collectFees();
        assertGt(vault.balanceOf(feeReceiver), 0);
    }

    function testFeesRevertWhenTooHigh() public {
        vm.expectRevert(
            abi.encodeWithSelector(AegisErrors.FeeTooHigh.selector, 501, 500)
        );
        vault.setManagementFee(501);

        vm.expectRevert(
            abi.encodeWithSelector(
                AegisErrors.FeeTooHigh.selector,
                2_001,
                2_000
            )
        );
        vault.setPerformanceFee(2_001);
    }

    function testEmergencyPausesEverything() public {
        vault.grantRole(AegisConstants.EMERGENCY_ROLE, admin);
        vault.activateEmergency();

        assertTrue(vault.isEmergencyActive());
        assertTrue(vault.paused());

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vm.expectRevert();
        vault.deposit(10_000e6, alice);
        vm.stopPrank();
    }

    function testEmergencyTimelockEnforced() public {
        vault.grantRole(AegisConstants.EMERGENCY_ROLE, admin);

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);
        vm.stopPrank();

        vault.activateEmergency();

        vm.expectRevert();
        vault.emergencyWithdraw(address(usdc), admin, 10_000e6);

        vm.warp(block.timestamp + 6 hours + 1);
        vault.emergencyWithdraw(address(usdc), admin, 10_000e6);
    }

    function testEmergencyDeactivateRestoresNormal() public {
        vault.grantRole(AegisConstants.EMERGENCY_ROLE, admin);
        vault.activateEmergency();
        vault.deactivateEmergency();

        assertFalse(vault.isEmergencyActive());
        assertFalse(vault.paused());

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, alice);
        vm.stopPrank();
    }

    function testEmergencyRevertWhenDoubleActivation() public {
        vault.grantRole(AegisConstants.EMERGENCY_ROLE, admin);
        vault.activateEmergency();

        vm.expectRevert(AegisErrors.EmergencyAlreadyActive.selector);
        vault.activateEmergency();
    }

    function testPauseBlocksOperations() public {
        vault.pause();

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vm.expectRevert();
        vault.deposit(10_000e6, alice);
        vm.stopPrank();
    }

    function testPauseUnpauseRestores() public {
        vault.pause();
        vault.unpause();

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        uint256 shares = vault.deposit(10_000e6, alice);
        vm.stopPrank();

        assertGt(shares, 0);
    }

    function testACLUnauthorizedYieldDistribution() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 1_000e6);
        vm.expectRevert();
        vault.distributeYield(1_000e6);
        vm.stopPrank();
    }

    function testACLUnauthorizedPause() public {
        vm.prank(attacker);
        vm.expectRevert();
        vault.pause();
    }

    function testACLUnauthorizedAllowlist() public {
        vm.prank(attacker);
        vm.expectRevert();
        vault.setAllowlist(attacker, true);
    }

    function testACLUnauthorizedFeeChange() public {
        vm.prank(attacker);
        vm.expectRevert();
        vault.setManagementFee(100);
    }

    function testMetadata() public view {
        assertEq(vault.name(), "Aegis USDC");
        assertEq(vault.symbol(), "aUSDC");
        assertEq(vault.decimals(), 6);
        assertEq(vault.asset(), address(usdc));
    }

    function testPricePerShareInitialPeg() public view {
        assertEq(vault.pricePerShare(), 1e6);
    }

    function testVaultVersion() public view {
        assertEq(vault.vaultVersion(), "1.0.0");
    }

    function testEstimatedAPYZeroWhenNoYield() public view {
        assertEq(vault.estimatedAPY(), 0);
    }

    function testZeroDepositReverts() public {
        vm.startPrank(alice);
        vm.expectRevert(AegisErrors.ZeroAmount.selector);
        vault.deposit(0, alice);
        vm.stopPrank();
    }

    function testZeroRedeemReverts() public {
        vm.startPrank(alice);
        vm.expectRevert(AegisErrors.ZeroShares.selector);
        vault.redeem(0, alice, alice);
        vm.stopPrank();
    }

    function testDepositAndRedeemRoundtrip() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 50_000e6);
        uint256 shares = vault.deposit(50_000e6, alice);
        uint256 assets = vault.redeem(shares, alice, alice);
        vm.stopPrank();

        assertEq(assets, 50_000e6);
    }

    function testMultiUserIsolation() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 30_000e6);
        vault.deposit(30_000e6, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), 70_000e6);
        vault.deposit(70_000e6, bob);
        vm.stopPrank();

        vm.startPrank(alice);
        uint256 assets = vault.redeem(vault.balanceOf(alice), alice, alice);
        vm.stopPrank();

        assertEq(assets, 30_000e6);
        assertEq(vault.totalAssets(), 70_000e6);
    }
}
