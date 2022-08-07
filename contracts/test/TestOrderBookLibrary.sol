// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { PoolLibrary } from "../lib/PoolLibrary.sol";
import { OrderBookLibrary } from "../lib/OrderBookLibrary.sol";
import { MarketStructs } from "../lib/MarketStructs.sol";

contract TestOrderBookLibrary {
    constructor() {}

    MarketStructs.OrderBookSideInfo ask;
    MarketStructs.OrderBookSideInfo bid;

    function maxSwap(
        bool isBaseToQuote,
        bool isExactInput,
        uint256 priceBoundX96
    ) external view returns (uint256 amount) {
        return OrderBookLibrary.maxSwap(isBaseToQuote ? bid : ask, isBaseToQuote, isExactInput, priceBoundX96);
    }

    struct CreateOrderParams {
        bool isBid;
        uint256 base;
        uint256 priceX96;
    }

    function createOrders(CreateOrderParams[] calldata params) external {
        for (uint256 i = 0; i < params.length; ++i) {
            createOrder(params[i]);
        }
    }

    function createOrder(CreateOrderParams calldata params) private {
        if (params.isBid) {
            OrderBookLibrary.createOrder(
                bid,
                params.base,
                params.priceX96,
                orderBookLessThanBid,
                orderBookAggregateBid
            );
        } else {
            OrderBookLibrary.createOrder(
                ask,
                params.base,
                params.priceX96,
                orderBookLessThanAsk,
                orderBookAggregateAsk
            );
        }
    }

    function orderBookLessThanAsk(uint40 key0, uint40 key1) private view returns (bool) {
        return OrderBookLibrary.lessThan(ask, false, key0, key1);
    }

    function orderBookLessThanBid(uint40 key0, uint40 key1) private view returns (bool) {
        return OrderBookLibrary.lessThan(bid, true, key0, key1);
    }

    function orderBookAggregateAsk(uint40 key) private returns (bool stop) {
        return OrderBookLibrary.aggregate(ask, key);
    }

    function orderBookAggregateBid(uint40 key) private returns (bool stop) {
        return OrderBookLibrary.aggregate(bid, key);
    }
}
