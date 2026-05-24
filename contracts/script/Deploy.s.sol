// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {AegisUSDC} from "../src/AegisUSDC.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract DeployAegisUSDC is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Aegis Deployment");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        address usdcAddress = vm.envOr("USDC_ADDRESS", address(0));
        IERC20 usdc;

        if (usdcAddress == address(0)) {
            MockUSDC mock = new MockUSDC();
            console.log("[1/4] MockUSDC deployed:", address(mock));
            mock.mint(deployer, 1_000_000e6);
            console.log("      Minted 1,000,000 MockUSDC to deployer");
            usdc = IERC20(address(mock));
        } else {
            console.log("[1/4] Using existing USDC at:", usdcAddress);
            usdc = IERC20(usdcAddress);
        }

        AegisUSDC vault = new AegisUSDC(usdc);
        console.log("[2/4] AegisUSDC (aUSDC) deployed:", address(vault));

        vault.setAllowlist(deployer, true);
        console.log("[3/4] Deployer allowlisted");

        vm.stopBroadcast();
        console.log("");
        console.log("Deployment Summary");
        console.log("USDC address: ", address(usdc));
        console.log("aUSDC Vault address:  ", address(vault));
        console.log("Vault version:        ", vault.vaultVersion());
    }
}
