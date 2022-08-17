// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { PerpMath } from "./PerpMath.sol";
import { MarketStructs } from "./MarketStructs.sol";

library PoolFeeLibrary {
    using PerpMath for uint256;
    using SafeCast for uint256;
    using SafeMath for uint256;

    function update(
        MarketStructs.PoolFeeInfo storage poolFeeInfo,
        uint32 atrEmaBlocks,
        uint256 prevPriceX96,
        uint256 currentPriceX96
    ) internal {
        uint256 currentTimestamp = block.timestamp;

        if (currentTimestamp <= poolFeeInfo.referenceTimestamp) {
            poolFeeInfo.currentHighX96 = Math.max(poolFeeInfo.currentHighX96, currentPriceX96);
            poolFeeInfo.currentLowX96 = Math.min(poolFeeInfo.currentLowX96, currentPriceX96);
        } else {
            poolFeeInfo.referenceTimestamp = currentTimestamp;
            poolFeeInfo.atrX96 = _calculateAtrX96(poolFeeInfo, atrEmaBlocks);
            poolFeeInfo.currentHighX96 = Math.max(prevPriceX96, currentPriceX96);
            poolFeeInfo.currentLowX96 = Math.min(prevPriceX96, currentPriceX96);
        }
    }

    function feeRatio(MarketStructs.PoolFeeInfo storage poolFeeInfo, MarketStructs.PoolFeeConfig memory config)
        internal
        view
        returns (uint256)
    {
        uint256 atrX96 = _calculateAtrX96(poolFeeInfo, config.atrEmaBlocks);
        return Math.mulDiv(config.atrFeeRatio, atrX96, FixedPoint96.Q96).add(config.fixedFeeRatio);
    }

    function _calculateAtrX96(MarketStructs.PoolFeeInfo storage poolFeeInfo, uint32 atrEmaBlocks)
        private
        view
        returns (uint256)
    {
        if (poolFeeInfo.currentLowX96 == 0) return 0;
        uint256 trX96 =
            Math.mulDiv(poolFeeInfo.currentHighX96, FixedPoint96.Q96, poolFeeInfo.currentLowX96).sub(FixedPoint96.Q96);
        uint256 denominator = atrEmaBlocks + 1;
        return Math.mulDiv(poolFeeInfo.atrX96, atrEmaBlocks, denominator).add(trX96.div(denominator));
    }
}
