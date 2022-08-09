// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { PerpdexExchange } from "../PerpdexExchange.sol";

contract DebugPerpdexExchange is PerpdexExchange {
    uint256 private constant _RINKEBY_CHAIN_ID = 4;
    uint256 private constant _MUMBAI_CHAIN_ID = 80001;
    uint256 private constant _SHIBUYA_CHAIN_ID = 81;
    // https://v2-docs.zksync.io/dev/zksync-v2/temp-limits.html#temporarily-simulated-by-constant-values
    uint256 private constant _ZKSYNC2_TESTNET_CHAIN_ID = 0;
    uint256 private constant _ARBITRUM_RINKEBY_CHAIN_ID = 421611;
    uint256 private constant _OPTIMISM_KOVAN_CHAIN_ID = 69;
    uint256 private constant _HARDHAT_CHAIN_ID = 31337;

    constructor(address settlementTokenArg) PerpdexExchange(settlementTokenArg) {
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        require(
            chainId == _RINKEBY_CHAIN_ID ||
                chainId == _MUMBAI_CHAIN_ID ||
                chainId == _SHIBUYA_CHAIN_ID ||
                chainId == _ZKSYNC2_TESTNET_CHAIN_ID ||
                chainId == _ARBITRUM_RINKEBY_CHAIN_ID ||
                chainId == _OPTIMISM_KOVAN_CHAIN_ID ||
                chainId == _HARDHAT_CHAIN_ID,
            "DPE_C: testnet only"
        );
    }

    function setCollateralBalance(address trader, int256 balance) external {
        accountInfos[trader].vaultInfo.collateralBalance = balance;
    }
}
