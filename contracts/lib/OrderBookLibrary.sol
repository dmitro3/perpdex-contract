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
import {
    BokkyPooBahsRedBlackTreeLibrary as RBTreeLibrary
} from "../../deps/BokkyPooBahsRedBlackTreeLibrary/contracts/BokkyPooBahsRedBlackTreeLibrary.sol";

library OrderBookLibrary {
    using PerpMath for int256;
    using PerpMath for uint256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using RBTreeLibrary for RBTreeLibrary.Tree;

    struct SwapResponse {
        uint256 oppositeAmount;
        uint256 basePartial;
        uint256 quotePartial;
        uint40 partialKey;
        uint40 fullLastKey;
    }

    struct PreviewSwapResponse {
        uint256 amountPool;
        uint256 baseFull;
        uint256 quoteFull;
        uint256 basePartial;
        uint256 quotePartial;
        uint40 fullLastKey;
        uint40 partialKey;
    }

    function createOrder(
        MarketStructs.OrderBookInfo storage orderBookInfo,
        bool isBid,
        uint256 base,
        uint256 priceX96
    ) public returns (uint40) {
        require(base > 0, "OBL_CO: base is zero");
        require(priceX96 > 0, "OBL_CO: price is zero");
        MarketStructs.OrderBookSideInfo storage info = isBid ? orderBookInfo.bid : orderBookInfo.ask;
        uint40 key = info.seqKey + 1;
        info.seqKey = key;
        info.orderInfos[key].base = base; // before insert for aggregation
        uint128 userData = makeUserData(priceX96);
        uint256 slot = getSlot(orderBookInfo);
        if (isBid) {
            info.tree.insert(key, userData, lessThanBid, aggregateBid, slot);
        } else {
            info.tree.insert(key, userData, lessThanAsk, aggregateAsk, slot);
        }
        return key;
    }

    function cancelOrder(
        MarketStructs.OrderBookInfo storage orderBookInfo,
        bool isBid,
        uint40 key
    ) public {
        MarketStructs.OrderBookSideInfo storage info = isBid ? orderBookInfo.bid : orderBookInfo.ask;
        require(isFullyExecuted(info, key) == 0, "already fully executed");
        uint256 slot = getSlot(orderBookInfo);
        if (isBid) {
            info.tree.remove(key, aggregateBid, slot);
        } else {
            info.tree.remove(key, aggregateAsk, slot);
        }
        delete info.orderInfos[key];
    }

    function getOrderInfo(
        MarketStructs.OrderBookInfo storage orderBookInfo,
        bool isBid,
        uint40 key
    ) public view returns (uint256 base, uint256 priceX96) {
        MarketStructs.OrderBookSideInfo storage info = isBid ? orderBookInfo.bid : orderBookInfo.ask;
        base = info.orderInfos[key].base;
        priceX96 = userDataToPriceX96(info.tree.nodes[key].userData);
    }

    function getOrderExecution(
        MarketStructs.OrderBookInfo storage orderBookInfo,
        bool isBid,
        uint40 key
    )
        public
        view
        returns (
            uint48 executionId,
            uint256 executedBase,
            uint256 executedQuote
        )
    {
        MarketStructs.OrderBookSideInfo storage info = isBid ? orderBookInfo.bid : orderBookInfo.ask;
        executionId = isFullyExecuted(info, key);
        if (executionId == 0) return (0, 0, 0);

        executedBase = info.orderInfos[key].base;
        // rounding error occurs, but it is negligible.

        executedQuote = Math.mulDiv(
            _getQuote(info, key),
            orderBookInfo.executionInfos[executionId].baseBalancePerShareX96,
            FixedPoint96.Q96
        );
    }

    function isFullyExecuted(MarketStructs.OrderBookSideInfo storage info, uint40 key) private view returns (uint48) {
        uint40 root = info.tree.root;
        while (key != 0 && key != root) {
            // TODO: gas optimize. info.tree.nodes[key].parent == 0 &&
            if (info.orderInfos[key].executionId != 0) {
                return info.orderInfos[key].executionId;
            }
            key = info.tree.nodes[key].parent;
        }
        return 0;
    }

    function makeUserData(uint256 priceX96) internal pure returns (uint128) {
        return (priceX96 >> 32).toUint128();
    }

    function userDataToPriceX96(uint128 userData) internal pure returns (uint256) {
        return userData << 32;
    }

    function lessThan(
        RBTreeLibrary.Tree storage tree,
        bool isBid,
        uint40 key0,
        uint40 key1
    ) private view returns (bool) {
        uint256 price0 = userDataToPriceX96(tree.nodes[key0].userData);
        uint256 price1 = userDataToPriceX96(tree.nodes[key1].userData);
        if (price0 == price1) {
            return key0 < key1; // time priority
        }
        // price priority
        return isBid ? price0 > price1 : price0 < price1;
    }

    function lessThanAsk(
        uint40 key0,
        uint40 key1,
        uint256 slot
    ) private view returns (bool) {
        MarketStructs.OrderBookInfo storage info = getOrderBookInfoFromSlot(slot);
        return lessThan(info.ask.tree, false, key0, key1);
    }

    function lessThanBid(
        uint40 key0,
        uint40 key1,
        uint256 slot
    ) private view returns (bool) {
        MarketStructs.OrderBookInfo storage info = getOrderBookInfoFromSlot(slot);
        return lessThan(info.bid.tree, true, key0, key1);
    }

    function aggregate(MarketStructs.OrderBookSideInfo storage info, uint40 key) private returns (bool stop) {
        uint256 prevBaseSum = info.orderInfos[key].baseSum;
        uint256 prevQuoteSum = info.orderInfos[key].quoteSum;
        uint40 left = info.tree.nodes[key].left;
        uint40 right = info.tree.nodes[key].right;

        uint256 baseSum = info.orderInfos[left].baseSum + info.orderInfos[right].baseSum + info.orderInfos[key].base;
        uint256 quoteSum = info.orderInfos[left].quoteSum + info.orderInfos[right].quoteSum + _getQuote(info, key);

        stop = baseSum == prevBaseSum && quoteSum == prevQuoteSum;
        if (!stop) {
            info.orderInfos[key].baseSum = baseSum;
            info.orderInfos[key].quoteSum = quoteSum;
        }
    }

    function aggregateAsk(uint40 key, uint256 slot) private returns (bool stop) {
        MarketStructs.OrderBookInfo storage info = getOrderBookInfoFromSlot(slot);
        return aggregate(info.ask, key);
    }

    function aggregateBid(uint40 key, uint256 slot) private returns (bool stop) {
        MarketStructs.OrderBookInfo storage info = getOrderBookInfoFromSlot(slot);
        return aggregate(info.bid, key);
    }

    function subtreeRemoved(
        MarketStructs.OrderBookSideInfo storage info,
        MarketStructs.OrderBookInfo storage orderBookInfo,
        uint40 key
    ) private {
        info.orderInfos[key].executionId = orderBookInfo.seqExecutionId;
    }

    function subtreeRemovedAsk(uint40 key, uint256 slot) private {
        MarketStructs.OrderBookInfo storage info = getOrderBookInfoFromSlot(slot);
        return subtreeRemoved(info.ask, info, key);
    }

    function subtreeRemovedBid(uint40 key, uint256 slot) private {
        MarketStructs.OrderBookInfo storage info = getOrderBookInfoFromSlot(slot);
        return subtreeRemoved(info.bid, info, key);
    }

    function _getQuote(MarketStructs.OrderBookSideInfo storage info, uint40 key) private view returns (uint256) {
        uint256 priceX96 = userDataToPriceX96(info.tree.nodes[key].userData);
        return Math.mulDiv(info.orderInfos[key].base, priceX96, FixedPoint96.Q96);
    }

    function swap(
        MarketStructs.OrderBookInfo storage orderBookInfo,
        PreviewSwapParams memory params,
        function(bool, bool, uint256) view returns (uint256) maxSwapArg,
        function(bool, bool, uint256) returns (uint256) swapArg
    ) internal returns (SwapResponse memory swapResponse) {
        MarketStructs.OrderBookSideInfo storage info = params.isBaseToQuote ? orderBookInfo.bid : orderBookInfo.ask;
        PreviewSwapResponse memory response = previewSwap(info, params, maxSwapArg);

        if (response.amountPool > 0) {
            swapResponse.oppositeAmount += swapArg(params.isBaseToQuote, params.isExactInput, response.amountPool);
        }

        bool isBase = params.isBaseToQuote == params.isExactInput;
        uint256 slot = getSlot(orderBookInfo);

        if (response.fullLastKey != 0) {
            orderBookInfo.seqExecutionId += 1;
            orderBookInfo.executionInfos[orderBookInfo.seqExecutionId] = MarketStructs.ExecutionInfo({
                baseBalancePerShareX96: params.baseBalancePerShareX96
            });
            if (params.isBaseToQuote) {
                info.tree.removeLeft(response.fullLastKey, lessThanBid, aggregateBid, subtreeRemovedBid, slot);
            } else {
                info.tree.removeLeft(response.fullLastKey, lessThanAsk, aggregateAsk, subtreeRemovedAsk, slot);
            }

            swapResponse.oppositeAmount += isBase ? response.quoteFull : response.baseFull;
            swapResponse.fullLastKey = response.fullLastKey;
        } else {
            require(response.baseFull == 0, "never occur");
            require(response.quoteFull == 0, "never occur");
        }

        if (response.partialKey != 0) {
            info.orderInfos[response.partialKey].base -= response.basePartial; // result > 0
            info.tree.aggregateRecursively(
                response.partialKey,
                params.isBaseToQuote ? aggregateBid : aggregateAsk,
                slot
            );

            swapResponse.oppositeAmount += isBase ? response.quotePartial : response.basePartial;
            swapResponse.basePartial = response.basePartial;
            swapResponse.quotePartial = response.quotePartial;
            swapResponse.partialKey = response.partialKey;
        } else {
            require(response.basePartial == 0, "never occur");
            require(response.quotePartial == 0, "never occur");
        }
    }

    // to avoid stack too deep
    struct PreviewSwapParams {
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 baseBalancePerShareX96;
    }

    // to avoid stack too deep
    struct PreviewSwapLocalVars {
        uint256 priceX96;
        uint256 sharePriceX96;
        uint256 amountPool;
        uint40 left;
        uint40 right;
        uint256 leftBaseSum;
        uint256 leftQuoteSum;
        uint256 rightBaseSum;
        uint256 rightQuoteSum;
    }

    function previewSwap(
        MarketStructs.OrderBookSideInfo storage info,
        PreviewSwapParams memory params,
        function(bool, bool, uint256) view returns (uint256) maxSwapArg
    ) internal view returns (PreviewSwapResponse memory response) {
        bool isBase = params.isBaseToQuote == params.isExactInput;
        uint40 key = info.tree.root;
        uint256 baseSum;
        uint256 quoteSum;

        while (key != 0) {
            PreviewSwapLocalVars memory vars;
            vars.priceX96 = userDataToPriceX96(info.tree.nodes[key].userData);
            vars.sharePriceX96 = Math.mulDiv(vars.priceX96, params.baseBalancePerShareX96, FixedPoint96.Q96);
            vars.amountPool = maxSwapArg(params.isBaseToQuote, params.isExactInput, vars.sharePriceX96);

            // key - right is more gas efficient than left + key
            vars.left = info.tree.nodes[key].left;
            vars.right = info.tree.nodes[key].right;
            vars.leftBaseSum = baseSum + info.orderInfos[vars.left].baseSum;
            vars.leftQuoteSum = quoteSum + info.orderInfos[vars.left].quoteSum;

            uint256 rangeLeft =
                (
                    isBase
                        ? vars.leftBaseSum
                        : Math.mulDiv(vars.leftQuoteSum, params.baseBalancePerShareX96, FixedPoint96.Q96)
                ) + vars.amountPool;
            if (params.amount <= rangeLeft) {
                if (vars.left == 0) {
                    response.fullLastKey = info.tree.prev(key);
                }
                key = vars.left;
                continue;
            }

            vars.rightBaseSum = baseSum + (info.orderInfos[key].baseSum - info.orderInfos[vars.right].baseSum);
            vars.rightQuoteSum = quoteSum + (info.orderInfos[key].quoteSum - info.orderInfos[vars.right].quoteSum);

            uint256 rangeRight =
                (
                    isBase
                        ? vars.rightBaseSum
                        : Math.mulDiv(vars.rightQuoteSum, params.baseBalancePerShareX96, FixedPoint96.Q96)
                ) + vars.amountPool;
            if (params.amount < rangeRight) {
                response.amountPool = vars.amountPool;
                response.baseFull = vars.leftBaseSum;
                response.quoteFull = Math.mulDiv(vars.leftQuoteSum, params.baseBalancePerShareX96, FixedPoint96.Q96);
                if (isBase) {
                    response.basePartial = params.amount - rangeLeft; // < info.orderInfos[key].base
                    response.quotePartial = Math.mulDiv(response.basePartial, vars.sharePriceX96, FixedPoint96.Q96);
                } else {
                    response.quotePartial = params.amount - rangeLeft;
                    response.basePartial = Math.mulDiv(response.quotePartial, FixedPoint96.Q96, vars.sharePriceX96);
                    // round to fit order size
                    response.basePartial = Math.min(response.basePartial, info.orderInfos[key].base - 1);
                }
                response.fullLastKey = info.tree.prev(key);
                response.partialKey = key;
                return response;
            }

            {
                baseSum = vars.rightBaseSum;
                quoteSum = vars.rightQuoteSum;
                if (vars.right == 0) {
                    response.fullLastKey = key;
                }
                key = vars.right;
            }
        }

        response.baseFull = baseSum;
        response.quoteFull = Math.mulDiv(quoteSum, params.baseBalancePerShareX96, FixedPoint96.Q96);
        response.amountPool = params.amount - (isBase ? response.baseFull : response.quoteFull);
    }

    function maxSwap(
        MarketStructs.OrderBookSideInfo storage info,
        bool isBaseToQuote,
        bool isExactInput,
        uint256 sharePriceBoundX96,
        uint256 baseBalancePerShareX96
    ) public view returns (uint256 amount) {
        uint256 priceBoundX96 = Math.mulDiv(sharePriceBoundX96, FixedPoint96.Q96, baseBalancePerShareX96);
        bool isBid = isBaseToQuote;
        bool isBase = isBaseToQuote == isExactInput;
        uint40 key = info.tree.root;

        while (key != 0) {
            uint256 price = userDataToPriceX96(info.tree.nodes[key].userData);
            uint40 left = info.tree.nodes[key].left;
            if (isBid ? price >= priceBoundX96 : price <= priceBoundX96) {
                // key - right is more gas efficient than left + key
                uint40 right = info.tree.nodes[key].right;
                amount += isBase
                    ? info.orderInfos[key].baseSum - info.orderInfos[right].baseSum
                    : info.orderInfos[key].quoteSum - info.orderInfos[right].quoteSum;
                key = right;
            } else {
                key = left;
            }
        }

        if (!isBase) {
            // share * price * baseBalancePerShareX96 = share * share_price
            amount = Math.mulDiv(amount, baseBalancePerShareX96, FixedPoint96.Q96);
        }
    }

    function getSlot(MarketStructs.OrderBookInfo storage d) private pure returns (uint256 slot) {
        assembly {
            slot := d.slot
        }
    }

    function getOrderBookInfoFromSlot(uint256 slot) private pure returns (MarketStructs.OrderBookInfo storage d) {
        assembly {
            d.slot := slot
        }
    }
}
