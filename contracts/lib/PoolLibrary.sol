// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { PerpMath } from "./PerpMath.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { MarketStructs } from "./MarketStructs.sol";
import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";

library PoolLibrary {
    using PerpMath for int256;
    using PerpMath for uint256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    struct SwapParams {
        bool isBaseToQuote;
        bool isExactInput;
        uint24 feeRatio;
        uint256 amount;
    }

    struct AddLiquidityParams {
        uint256 base;
        uint256 quote;
    }

    struct RemoveLiquidityParams {
        uint256 liquidity;
    }

    uint256 public constant MINIMUM_LIQUIDITY = 1e3;

    function initializePool(MarketStructs.PoolInfo storage poolInfo) internal {
        poolInfo.baseBalancePerShareX96 = FixedPoint96.Q96;
    }

    // underestimate deleveraged tokens
    function applyFunding(MarketStructs.PoolInfo storage poolInfo, int256 fundingRateX96) internal {
        if (fundingRateX96 == 0) return;

        uint256 frAbs = fundingRateX96.abs();

        if (fundingRateX96 > 0) {
            uint256 poolQuote = poolInfo.quote;
            uint256 deleveratedQuote = Math.mulDiv(poolQuote, frAbs, FixedPoint96.Q96);
            poolInfo.quote = poolQuote.sub(deleveratedQuote);
            poolInfo.cumQuotePerLiquidityX96 = poolInfo.cumQuotePerLiquidityX96.add(
                Math.mulDiv(deleveratedQuote, FixedPoint96.Q96, poolInfo.totalLiquidity)
            );
        } else {
            uint256 poolBase = poolInfo.base;
            uint256 deleveratedBase = Math.mulDiv(poolBase, frAbs, FixedPoint96.Q96.add(frAbs));
            poolInfo.base = poolBase.sub(deleveratedBase);
            poolInfo.cumBasePerLiquidityX96 = poolInfo.cumBasePerLiquidityX96.add(
                Math.mulDiv(deleveratedBase, FixedPoint96.Q96, poolInfo.totalLiquidity)
            );
        }

        poolInfo.baseBalancePerShareX96 = Math.mulDiv(
            poolInfo.baseBalancePerShareX96,
            FixedPoint96.Q96.toInt256().sub(fundingRateX96).toUint256(),
            FixedPoint96.Q96
        );
    }

    function swap(MarketStructs.PoolInfo storage poolInfo, SwapParams memory params)
        internal
        returns (uint256 oppositeAmount)
    {
        oppositeAmount = previewSwap(poolInfo.base, poolInfo.quote, params);
        (poolInfo.base, poolInfo.quote) = calcPoolAfter(
            params.isBaseToQuote,
            params.isExactInput,
            poolInfo.base,
            poolInfo.quote,
            params.amount,
            oppositeAmount
        );
    }

    function calcPoolAfter(
        bool isBaseToQuote,
        bool isExactInput,
        uint256 base,
        uint256 quote,
        uint256 amount,
        uint256 oppositeAmount
    ) internal pure returns (uint256 baseAfter, uint256 quoteAfter) {
        if (isExactInput) {
            if (isBaseToQuote) {
                baseAfter = base.add(amount);
                quoteAfter = quote.sub(oppositeAmount);
            } else {
                baseAfter = base.sub(oppositeAmount);
                quoteAfter = quote.add(amount);
            }
        } else {
            if (isBaseToQuote) {
                baseAfter = base.add(oppositeAmount);
                quoteAfter = quote.sub(amount);
            } else {
                baseAfter = base.sub(amount);
                quoteAfter = quote.add(oppositeAmount);
            }
        }
    }

    function addLiquidity(MarketStructs.PoolInfo storage poolInfo, AddLiquidityParams memory params)
        internal
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        uint256 poolTotalLiquidity = poolInfo.totalLiquidity;
        uint256 liquidity;

        if (poolTotalLiquidity == 0) {
            uint256 totalLiquidity = Math.sqrt(params.base.mul(params.quote));
            liquidity = totalLiquidity.sub(MINIMUM_LIQUIDITY);
            require(params.base > 0 && params.quote > 0 && liquidity > 0, "PL_AL: initial liquidity zero");

            poolInfo.base = params.base;
            poolInfo.quote = params.quote;
            poolInfo.totalLiquidity = totalLiquidity;
            return (params.base, params.quote, liquidity);
        }

        uint256 poolBase = poolInfo.base;
        uint256 poolQuote = poolInfo.quote;

        uint256 base = Math.min(params.base, Math.mulDiv(params.quote, poolBase, poolQuote));
        uint256 quote = Math.min(params.quote, Math.mulDiv(params.base, poolQuote, poolBase));
        liquidity = Math.min(
            Math.mulDiv(base, poolTotalLiquidity, poolBase),
            Math.mulDiv(quote, poolTotalLiquidity, poolQuote)
        );
        require(base > 0 && quote > 0 && liquidity > 0, "PL_AL: liquidity zero");

        poolInfo.base = poolBase.add(base);
        poolInfo.quote = poolQuote.add(quote);
        poolInfo.totalLiquidity = poolTotalLiquidity.add(liquidity);

        return (base, quote, liquidity);
    }

    function removeLiquidity(MarketStructs.PoolInfo storage poolInfo, RemoveLiquidityParams memory params)
        internal
        returns (uint256, uint256)
    {
        uint256 poolBase = poolInfo.base;
        uint256 poolQuote = poolInfo.quote;
        uint256 poolTotalLiquidity = poolInfo.totalLiquidity;
        uint256 base = Math.mulDiv(params.liquidity, poolBase, poolTotalLiquidity);
        uint256 quote = Math.mulDiv(params.liquidity, poolQuote, poolTotalLiquidity);
        require(base > 0 && quote > 0, "PL_RL: output is zero");
        poolInfo.base = poolBase.sub(base);
        poolInfo.quote = poolQuote.sub(quote);
        uint256 totalLiquidity = poolTotalLiquidity.sub(params.liquidity);
        require(totalLiquidity >= MINIMUM_LIQUIDITY, "PL_RL: min liquidity");
        poolInfo.totalLiquidity = totalLiquidity;
        return (base, quote);
    }

    function getLiquidityValue(MarketStructs.PoolInfo storage poolInfo, uint256 liquidity)
        internal
        view
        returns (uint256, uint256)
    {
        return (
            Math.mulDiv(liquidity, poolInfo.base, poolInfo.totalLiquidity),
            Math.mulDiv(liquidity, poolInfo.quote, poolInfo.totalLiquidity)
        );
    }

    // subtract fee from input before swap
    function previewSwap(
        uint256 base,
        uint256 quote,
        SwapParams memory params
    ) internal pure returns (uint256 output) {
        uint24 oneSubFeeRatio = PerpMath.subRatio(1e6, params.feeRatio);

        if (params.isExactInput) {
            uint256 amountSubFee = params.amount.mulRatio(oneSubFeeRatio);
            if (params.isBaseToQuote) {
                // output = quote.sub(FullMath.mulDivRoundingUp(base, quote, base.add(amountSubFee)));
                output = Math.mulDiv(quote, amountSubFee, base.add(amountSubFee));
            } else {
                // output = base.sub(FullMath.mulDivRoundingUp(base, quote, quote.add(amountSubFee)));
                output = Math.mulDiv(base, amountSubFee, quote.add(amountSubFee));
            }
        } else {
            if (params.isBaseToQuote) {
                // output = FullMath.mulDivRoundingUp(base, quote, quote.sub(params.amount)).sub(base);
                output = Math.mulDiv(base, params.amount, quote.sub(params.amount), Math.Rounding.Up);
            } else {
                // output = FullMath.mulDivRoundingUp(base, quote, base.sub(params.amount)).sub(quote);
                output = Math.mulDiv(quote, params.amount, base.sub(params.amount), Math.Rounding.Up);
            }
            output = output.divRatioRoundingUp(oneSubFeeRatio);
        }
    }

    function _solveQuadratic(uint256 b, uint256 cNeg) private pure returns (uint256) {
        return Math.sqrt(b.mul(b).add(cNeg.mul(4))).sub(b).div(2);
    }

    function getAskPriceX96(uint256 priceX96, uint24 feeRatio) internal pure returns (uint256) {
        uint24 oneSubFeeRatio = PerpMath.subRatio(1e6, feeRatio);
        return priceX96.divRatio(oneSubFeeRatio);
    }

    function getBidPriceX96(uint256 priceX96, uint24 feeRatio) internal pure returns (uint256) {
        uint24 oneSubFeeRatio = PerpMath.subRatio(1e6, feeRatio);
        return priceX96.mulRatioRoundingUp(oneSubFeeRatio);
    }

    // must not revert
    // Trade until the trade price including fee (dy/dx) reaches priceBoundX96
    // not pool price (y/x)
    // long: trade_price = pool_price / (1 - fee)
    // short: trade_price = pool_price * (1 - fee)
    function maxSwap(
        uint256 base,
        uint256 quote,
        bool isBaseToQuote,
        bool isExactInput,
        uint24 feeRatio,
        uint256 priceBoundX96
    ) internal pure returns (uint256 output) {
        uint24 oneSubFeeRatio = PerpMath.subRatio(1e6, feeRatio);
        uint256 k = base.mul(quote);

        if (isBaseToQuote) {
            uint256 kDivP = Math.mulDiv(k, FixedPoint96.Q96, priceBoundX96).mulRatio(oneSubFeeRatio);
            uint256 baseSqr = base.mul(base);
            if (kDivP <= baseSqr) return 0;
            uint256 cNeg = kDivP.sub(baseSqr);
            uint256 b = base.add(base.mulRatio(oneSubFeeRatio));
            output = _solveQuadratic(b.divRatio(oneSubFeeRatio), cNeg.divRatio(oneSubFeeRatio));
        } else {
            // https://www.wolframalpha.com/input?i=%28x+%2B+a%29+*+%28x+%2B+a+*+%281+-+f%29%29+%3D+kp+solve+a
            uint256 kp = Math.mulDiv(k, priceBoundX96, FixedPoint96.Q96).mulRatio(oneSubFeeRatio);
            uint256 quoteSqr = quote.mul(quote);
            if (kp <= quoteSqr) return 0;
            uint256 cNeg = kp.sub(quoteSqr);
            uint256 b = quote.add(quote.mulRatio(oneSubFeeRatio));
            output = _solveQuadratic(b.divRatio(oneSubFeeRatio), cNeg.divRatio(oneSubFeeRatio));
        }
        if (!isExactInput) {
            output = previewSwap(
                base,
                quote,
                SwapParams({ isBaseToQuote: isBaseToQuote, isExactInput: true, feeRatio: feeRatio, amount: output })
            );
        }
    }

    function getMarkPriceX96(
        uint256 base,
        uint256 quote,
        uint256 baseBalancePerShareX96
    ) internal pure returns (uint256) {
        return Math.mulDiv(getShareMarkPriceX96(base, quote), FixedPoint96.Q96, baseBalancePerShareX96);
    }

    function getShareMarkPriceX96(uint256 base, uint256 quote) internal pure returns (uint256) {
        return Math.mulDiv(quote, FixedPoint96.Q96, base);
    }

    function getLiquidityDeleveraged(
        uint256 poolCumBasePerLiquidityX96,
        uint256 poolCumQuotePerLiquidityX96,
        uint256 liquidity,
        uint256 cumBasePerLiquidityX96,
        uint256 cumQuotePerLiquidityX96
    ) internal pure returns (int256, int256) {
        int256 basePerLiquidityX96 = poolCumBasePerLiquidityX96.toInt256().sub(cumBasePerLiquidityX96.toInt256());
        int256 quotePerLiquidityX96 = poolCumQuotePerLiquidityX96.toInt256().sub(cumQuotePerLiquidityX96.toInt256());

        return (
            liquidity.toInt256().mulDiv(basePerLiquidityX96, FixedPoint96.Q96),
            liquidity.toInt256().mulDiv(quotePerLiquidityX96, FixedPoint96.Q96)
        );
    }
}
