// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

interface IPerpdexMarketMinimum {
    struct SwapResponse {
        uint256 oppositeAmount;
        uint256 basePartial;
        uint256 quotePartial;
        uint40 partialOrderId;
    }

    function swap(
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount,
        bool isLiquidation
    ) external returns (SwapResponse memory response);

    function addLiquidity(uint256 baseShare, uint256 quoteBalance)
        external
        returns (
            uint256,
            uint256,
            uint256
        );

    function removeLiquidity(uint256 liquidity) external returns (uint256 baseShare, uint256 quoteBalance);

    function createLimitOrder(
        bool isBid,
        uint256 baseShare,
        uint256 priceX96
    ) external returns (uint40 orderId);

    function cancelLimitOrder(bool isBid, uint40 orderId) external;

    // getters

    function previewSwap(
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount,
        bool isLiquidation
    ) external view returns (uint256);

    function maxSwap(
        bool isBaseToQuote,
        bool isExactInput,
        bool isLiquidation
    ) external view returns (uint256 amount);

    function exchange() external view returns (address);

    function getShareMarkPriceX96() external view returns (uint256);

    function getLiquidityValue(uint256 liquidity) external view returns (uint256 baseShare, uint256 quoteBalance);

    function getLiquidityDeleveraged(
        uint256 liquidity,
        uint256 cumBasePerLiquidityX96,
        uint256 cumQuotePerLiquidityX96
    ) external view returns (int256, int256);

    function getCumDeleveragedPerLiquidityX96() external view returns (uint256, uint256);

    function baseBalancePerShareX96() external view returns (uint256);

    function getLimitOrderInfo(bool isBid, uint40 orderId) external view returns (uint256 base, uint256 priceX96);

    function getLimitOrderExecution(bool isBid, uint40 orderId)
        external
        view
        returns (
            uint256 executionId,
            uint256 executedBase,
            uint256 executedQuote
        );
}
