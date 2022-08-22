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

    // to avoid stack too deep
    struct PreviewSwapParams {
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 baseBalancePerShareX96;
    }

    // to avoid stack too deep
    struct PreviewSwapLocalVars {
        uint128 priceX96;
        uint256 sharePriceX96;
        uint256 amountPool;
        uint40 left;
        uint40 right;
        uint256 leftBaseSum;
        uint256 leftQuoteSum;
        uint256 rightBaseSum;
        uint256 rightQuoteSum;
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
        uint256 priceX96,
        uint256 markPriceX96
    ) public returns (uint40) {
        require(base > 0, "OBL_CO: base is zero");
        require(priceX96 >= markPriceX96 / 100, "OBL_CO: price too small");
        require(priceX96 <= markPriceX96 * 100, "OBL_CO: price too large");
        MarketStructs.OrderBookSideInfo storage info = isBid ? orderBookInfo.bid : orderBookInfo.ask;
        uint40 key = info.seqKey + 1;
        info.seqKey = key;
        info.orderInfos[key].base = base; // before insert for aggregation
        uint128 userData = _makeUserData(priceX96);
        uint256 slot = _getSlot(orderBookInfo);
        if (isBid) {
            info.tree.insert(key, userData, _lessThanBid, _aggregateBid, slot);
        } else {
            info.tree.insert(key, userData, _lessThanAsk, _aggregateAsk, slot);
        }
        return key;
    }

    function cancelOrder(
        MarketStructs.OrderBookInfo storage orderBookInfo,
        bool isBid,
        uint40 key
    ) public {
        MarketStructs.OrderBookSideInfo storage info = isBid ? orderBookInfo.bid : orderBookInfo.ask;
        require(_isFullyExecuted(info, key) == 0, "OBL_CO: already fully executed");
        uint256 slot = _getSlot(orderBookInfo);
        if (isBid) {
            info.tree.remove(key, _aggregateBid, slot);
        } else {
            info.tree.remove(key, _aggregateAsk, slot);
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
        priceX96 = _userDataToPriceX96(info.tree.nodes[key].userData);
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
        executionId = _isFullyExecuted(info, key);
        if (executionId == 0) return (0, 0, 0);

        executedBase = info.orderInfos[key].base;
        // rounding error occurs, but it is negligible.

        executedQuote = _quoteToBalance(
            _getQuote(info, key),
            orderBookInfo.executionInfos[executionId].baseBalancePerShareX96
        );
    }

    function getBestPriceX96(MarketStructs.OrderBookSideInfo storage info) external view returns (uint256) {
        if (info.tree.root == 0) return 0;
        uint40 key = info.tree.first();
        return _userDataToPriceX96(info.tree.nodes[key].userData);
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
        uint256 slot = _getSlot(orderBookInfo);

        if (response.fullLastKey != 0) {
            orderBookInfo.seqExecutionId += 1;
            orderBookInfo.executionInfos[orderBookInfo.seqExecutionId] = MarketStructs.ExecutionInfo({
                baseBalancePerShareX96: params.baseBalancePerShareX96
            });
            if (params.isBaseToQuote) {
                info.tree.removeLeft(response.fullLastKey, _lessThanBid, _aggregateBid, _subtreeRemovedBid, slot);
            } else {
                info.tree.removeLeft(response.fullLastKey, _lessThanAsk, _aggregateAsk, _subtreeRemovedAsk, slot);
            }

            swapResponse.oppositeAmount += isBase ? response.quoteFull : response.baseFull;
            swapResponse.fullLastKey = response.fullLastKey;
        } else {
            require(response.baseFull == 0, "never occur");
            require(response.quoteFull == 0, "never occur");
        }

        if (response.partialKey != 0) {
            info.orderInfos[response.partialKey].base -= response.basePartial;
            require(info.orderInfos[response.partialKey].base > 0, "never occur");

            info.tree.aggregateRecursively(
                response.partialKey,
                params.isBaseToQuote ? _aggregateBid : _aggregateAsk,
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
            vars.priceX96 = _userDataToPriceX96(info.tree.nodes[key].userData);
            vars.sharePriceX96 = Math.mulDiv(vars.priceX96, params.baseBalancePerShareX96, FixedPoint96.Q96);
            vars.amountPool = maxSwapArg(params.isBaseToQuote, params.isExactInput, vars.sharePriceX96);

            // key - right is more gas efficient than left + key
            vars.left = info.tree.nodes[key].left;
            vars.right = info.tree.nodes[key].right;
            vars.leftBaseSum = baseSum + info.orderInfos[vars.left].baseSum;
            vars.leftQuoteSum = quoteSum + info.orderInfos[vars.left].quoteSum;

            uint256 rangeLeft =
                (isBase ? vars.leftBaseSum : _quoteToBalance(vars.leftQuoteSum, params.baseBalancePerShareX96)) +
                    vars.amountPool;
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
                (isBase ? vars.rightBaseSum : _quoteToBalance(vars.rightQuoteSum, params.baseBalancePerShareX96)) +
                    vars.amountPool;
            if (params.amount < rangeRight) {
                response.amountPool = vars.amountPool;
                response.baseFull = vars.leftBaseSum;
                response.quoteFull = _quoteToBalance(vars.leftQuoteSum, params.baseBalancePerShareX96);
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
        response.quoteFull = _quoteToBalance(quoteSum, params.baseBalancePerShareX96);
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
            uint128 price = _userDataToPriceX96(info.tree.nodes[key].userData);
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
            amount = _quoteToBalance(amount, baseBalancePerShareX96);
        }
    }

    function _isFullyExecuted(MarketStructs.OrderBookSideInfo storage info, uint40 key) private view returns (uint48) {
        uint40 root = info.tree.root;
        while (key != 0 && key != root) {
            if (info.orderInfos[key].executionId != 0) {
                return info.orderInfos[key].executionId;
            }
            key = info.tree.nodes[key].parent;
        }
        return 0;
    }

    function _makeUserData(uint256 priceX96) private pure returns (uint128) {
        return priceX96.toUint128();
    }

    function _userDataToPriceX96(uint128 userData) private pure returns (uint128) {
        return userData;
    }

    function _lessThan(
        RBTreeLibrary.Tree storage tree,
        bool isBid,
        uint40 key0,
        uint40 key1
    ) private view returns (bool) {
        uint128 price0 = _userDataToPriceX96(tree.nodes[key0].userData);
        uint128 price1 = _userDataToPriceX96(tree.nodes[key1].userData);
        if (price0 == price1) {
            return key0 < key1; // time priority
        }
        // price priority
        return isBid ? price0 > price1 : price0 < price1;
    }

    function _lessThanAsk(
        uint40 key0,
        uint40 key1,
        uint256 slot
    ) private view returns (bool) {
        MarketStructs.OrderBookInfo storage info = _getOrderBookInfoFromSlot(slot);
        return _lessThan(info.ask.tree, false, key0, key1);
    }

    function _lessThanBid(
        uint40 key0,
        uint40 key1,
        uint256 slot
    ) private view returns (bool) {
        MarketStructs.OrderBookInfo storage info = _getOrderBookInfoFromSlot(slot);
        return _lessThan(info.bid.tree, true, key0, key1);
    }

    function _aggregate(MarketStructs.OrderBookSideInfo storage info, uint40 key) private returns (bool stop) {
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

    function _aggregateAsk(uint40 key, uint256 slot) private returns (bool stop) {
        MarketStructs.OrderBookInfo storage info = _getOrderBookInfoFromSlot(slot);
        return _aggregate(info.ask, key);
    }

    function _aggregateBid(uint40 key, uint256 slot) private returns (bool stop) {
        MarketStructs.OrderBookInfo storage info = _getOrderBookInfoFromSlot(slot);
        return _aggregate(info.bid, key);
    }

    function _subtreeRemoved(
        MarketStructs.OrderBookSideInfo storage info,
        MarketStructs.OrderBookInfo storage orderBookInfo,
        uint40 key
    ) private {
        info.orderInfos[key].executionId = orderBookInfo.seqExecutionId;
    }

    function _subtreeRemovedAsk(uint40 key, uint256 slot) private {
        MarketStructs.OrderBookInfo storage info = _getOrderBookInfoFromSlot(slot);
        return _subtreeRemoved(info.ask, info, key);
    }

    function _subtreeRemovedBid(uint40 key, uint256 slot) private {
        MarketStructs.OrderBookInfo storage info = _getOrderBookInfoFromSlot(slot);
        return _subtreeRemoved(info.bid, info, key);
    }

    // returns quoteBalance / baseBalancePerShare
    function _getQuote(MarketStructs.OrderBookSideInfo storage info, uint40 key) private view returns (uint256) {
        uint128 priceX96 = _userDataToPriceX96(info.tree.nodes[key].userData);
        return Math.mulDiv(info.orderInfos[key].base, priceX96, FixedPoint96.Q96);
    }

    function _quoteToBalance(uint256 quote, uint256 baseBalancePerShareX96) private pure returns (uint256) {
        return Math.mulDiv(quote, baseBalancePerShareX96, FixedPoint96.Q96);
    }

    function _getSlot(MarketStructs.OrderBookInfo storage d) private pure returns (uint256 slot) {
        assembly {
            slot := d.slot
        }
    }

    function _getOrderBookInfoFromSlot(uint256 slot) private pure returns (MarketStructs.OrderBookInfo storage d) {
        assembly {
            d.slot := slot
        }
    }
}
