// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { IPerpdexMarketMinimum } from "./IPerpdexMarketMinimum.sol";

interface IPerpdexMarket is IPerpdexMarketMinimum {
    event FundingPaid(
        int256 fundingRateX96,
        uint32 elapsedSec,
        int256 premiumX96,
        uint256 markPriceX96,
        uint256 cumBasePerLiquidityX96,
        uint256 cumQuotePerLiquidityX96
    );
    event LiquidityAdded(uint256 base, uint256 quote, uint256 liquidity);
    event LiquidityRemoved(uint256 base, uint256 quote, uint256 liquidity);
    event Swapped(
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount,
        uint256 oppositeAmount,
        uint40 fullLastOrderId,
        uint40 partialOrderId,
        uint256 basePartial,
        uint256 quotePartial
    );
    event LimitOrderCreated(bool isBid, uint256 base, uint256 priceX96, uint256 orderId);
    event LimitOrderCanceled(bool isBid, uint256 orderId);

    // getters

    function symbol() external view returns (string memory);

    function getMarkPriceX96() external view returns (uint256);
}
