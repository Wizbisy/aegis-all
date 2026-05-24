// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {AegisUSDC} from "../src/AegisUSDC.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract AegisWithdrawLockBypassTest is Test {
    AegisUSDC public vault;
    MockUSDC public usdc;

    address public admin = address(this);
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    function setUp() public {
        usdc = new MockUSDC();
        vault = new AegisUSDC(IERC20(address(usdc)));

        vault.setAllowlist(alice, true);
        vault.setAllowlist(bob, true);
        vault.setAllowlist(admin, true);

        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
    }

    function testWithdrawLockBypass() public {
        vm.warp(5000);
        vault.setCooldowns(0, 3600);

        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, bob);
        vm.stopPrank();

        vm.startPrank(bob);
        vm.expectRevert();
        vault.withdraw(10_000e6, bob, bob);
        vm.stopPrank();
    }
}
