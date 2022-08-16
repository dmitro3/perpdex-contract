// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { PoolFeeLibrary } from "../lib/PoolFeeLibrary.sol";
import { MarketStructs } from "../lib/MarketStructs.sol";

contract TestPoolFeeLibrary {
    MarketStructs.PoolFeeInfo public poolFeeInfo;

    function update(
        MarketStructs.PoolFeeInfo memory poolFeeInfoArg,
        uint32 atrEmaBlocks,
        uint256 prevPriceX96,
        uint256 currentPriceX96
    ) external {
        poolFeeInfo = poolFeeInfoArg;
        PoolFeeLibrary.update(poolFeeInfo, atrEmaBlocks, prevPriceX96, currentPriceX96);
    }
}
