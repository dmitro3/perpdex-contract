// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { PRBMath } from "prb-math/contracts/PRBMath.sol";
import { PoolLibrary } from "../lib/PoolLibrary.sol";
import { OrderBookLibrary } from "../lib/OrderBookLibrary.sol";
import { MarketStructs } from "../lib/MarketStructs.sol";

contract TestOrderBookLibrary {
    constructor() {}

    MarketStructs.OrderBookInfo info;

    function previewSwap(
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount,
        uint256 baseBalancePerShareX96
    ) external view returns (OrderBookLibrary.PreviewSwapResponse memory response) {
        response = OrderBookLibrary.previewSwap(
            isBaseToQuote ? info.bid : info.ask,
            OrderBookLibrary.PreviewSwapParams({
                isBaseToQuote: isBaseToQuote,
                isExactInput: isExactInput,
                amount: amount,
                baseBalancePerShareX96: baseBalancePerShareX96
            }),
            poolMaxSwap
        );
    }

    function poolMaxSwap(
        bool isBaseToQuote,
        bool isExactInput,
        uint256 priceX96
    ) private pure returns (uint256 amount) {
        uint256 base;
        if (isBaseToQuote) {
            if (priceX96 < FixedPoint96.Q96) {
                base = PRBMath.mulDiv(100, FixedPoint96.Q96 - priceX96, FixedPoint96.Q96);
            }
        } else {
            if (priceX96 > FixedPoint96.Q96) {
                base = PRBMath.mulDiv(100, priceX96 - FixedPoint96.Q96, FixedPoint96.Q96);
            }
        }
        bool isBase = isBaseToQuote == isExactInput;
        if (isBase) {
            amount = base;
        } else {
            amount = base * 2;
        }
    }

    function maxSwap(
        bool isBaseToQuote,
        bool isExactInput,
        uint256 sharePriceBoundX96,
        uint256 baseBalancePerShareX96
    ) external view returns (uint256 amount) {
        return
            OrderBookLibrary.maxSwap(
                isBaseToQuote ? info.bid : info.ask,
                isBaseToQuote,
                isExactInput,
                sharePriceBoundX96,
                baseBalancePerShareX96
            );
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
        OrderBookLibrary.createOrder(info, params.isBid, params.base, params.priceX96);
    }
}
