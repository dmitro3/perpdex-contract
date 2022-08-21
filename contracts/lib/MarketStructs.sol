// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;

import {
    BokkyPooBahsRedBlackTreeLibrary as RBTreeLibrary
} from "../../deps/BokkyPooBahsRedBlackTreeLibrary/contracts/BokkyPooBahsRedBlackTreeLibrary.sol";

library MarketStructs {
    struct FundingInfo {
        uint256 prevIndexPriceBase;
        uint256 prevIndexPriceQuote;
        uint256 prevIndexPriceTimestamp;
    }

    struct PoolInfo {
        uint256 base;
        uint256 quote;
        uint256 totalLiquidity;
        uint256 cumBasePerLiquidityX96;
        uint256 cumQuotePerLiquidityX96;
        uint256 baseBalancePerShareX96;
    }

    struct PriceLimitInfo {
        uint256 referencePrice;
        uint256 referenceTimestamp;
        uint256 emaPrice;
    }

    struct PriceLimitConfig {
        uint24 normalOrderRatio;
        uint24 liquidationRatio;
        uint24 emaNormalOrderRatio;
        uint24 emaLiquidationRatio;
        uint32 emaSec;
    }

    struct OrderInfo {
        uint256 base;
        uint256 baseSum;
        uint256 quoteSum;
        uint48 executionId;
    }

    struct OrderBookSideInfo {
        RBTreeLibrary.Tree tree;
        mapping(uint40 => OrderInfo) orderInfos;
        uint40 seqKey;
    }

    struct ExecutionInfo {
        uint256 baseBalancePerShareX96;
    }

    struct OrderBookInfo {
        OrderBookSideInfo ask;
        OrderBookSideInfo bid;
        uint48 seqExecutionId;
        mapping(uint48 => ExecutionInfo) executionInfos;
    }

    struct PoolFeeInfo {
        uint256 atrX96;
        uint256 referenceTimestamp;
        uint256 currentHighX96;
        uint256 currentLowX96;
    }

    struct PoolFeeConfig {
        uint24 fixedFeeRatio;
        uint24 atrFeeRatio;
        uint32 atrEmaBlocks;
    }

    struct Candle {
        uint128 closeX96;
        uint128 quote;
        uint128 highX96;
        uint128 lowX96;
    }

    struct CandleList {
        mapping(uint32 => mapping(uint32 => Candle)) candles;
        uint32 prevTimestamp;
    }
}
