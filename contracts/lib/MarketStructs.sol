// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

library MarketStructs {
    struct FundingInfo {
        uint256 balancePerShare;
        uint256 prevIndexPrice;
        uint256 prevIndexPriceTimestamp;
    }

    struct PoolInfo {
        uint256 base;
        uint256 quote;
        uint256 totalLiquidity;
    }
}
