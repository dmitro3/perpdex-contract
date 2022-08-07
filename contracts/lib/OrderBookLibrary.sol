// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { Math } from "../amm/uniswap_v2/libraries/Math.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { PerpMath } from "./PerpMath.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { MarketStructs } from "./MarketStructs.sol";
import { PRBMath } from "prb-math/contracts/PRBMath.sol";
import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { FullMath } from "./FullMath.sol";
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
        MarketStructs.OrderBookSideInfo storage info,
        uint256 base,
        uint256 priceX96,
        function(uint40, uint40) view returns (bool) lessThanArg,
        function(uint40) returns (bool) aggregateArg
    ) internal returns (uint40) {
        uint40 key = info.seqKey + 1;
        info.seqKey = key;
        info.orderInfos[key].base = base; // before insert for aggregation
        info.tree.insert(key, makeUserData(priceX96), lessThanArg, aggregateArg);
        return key;
    }

    function cancelOrder(
        MarketStructs.OrderBookSideInfo storage info,
        uint40 key,
        function(uint40) returns (bool) aggregateArg
    ) internal {
        require(!isExecuted(info, key), "already executed");
        info.tree.remove(key, aggregateArg);
        delete info.orderInfos[key];
    }

    function getOrderInfo(MarketStructs.OrderBookSideInfo storage info, uint40 key)
        internal
        view
        returns (
            bool fullyExecuted,
            int256 executedBase,
            int256 executedQuote
        )
    {
        fullyExecuted = isExecuted(info, key);

        // TODO: implement
    }

    function isExecuted(MarketStructs.OrderBookSideInfo storage info, uint40 key) internal view returns (bool) {
        require(info.tree.exists(key), "OBL_IE: not exist");
        while (key != 0) {
            if (key == info.tree.root) {
                return false;
            }
            uint40 parent = info.tree.nodes[key].parent;
            if (info.tree.nodes[parent].left != key && info.tree.nodes[parent].right != key) {
                return true;
            }
            key = parent;
        }
        return true;
    }

    function makeUserData(uint256 priceX96) internal pure returns (uint128) {
        return priceX96.toUint128();
    }

    function userDataToPriceX96(uint128 userData) internal pure returns (uint128) {
        return userData;
    }

    function lessThan(
        MarketStructs.OrderBookSideInfo storage info,
        bool isBid,
        uint40 key0,
        uint40 key1
    ) internal view returns (bool) {
        uint128 price0 = userDataToPriceX96(info.tree.nodes[key0].userData);
        uint128 price1 = userDataToPriceX96(info.tree.nodes[key1].userData);
        if (price0 == price1) {
            return key0 < key1; // time priority
        }
        // price priority
        return isBid ? price0 > price1 : price0 < price1;
    }

    function aggregate(MarketStructs.OrderBookSideInfo storage info, uint40 key) internal returns (bool stop) {
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

    function _getQuote(MarketStructs.OrderBookSideInfo storage info, uint40 key) private view returns (uint256) {
        uint128 priceX96 = userDataToPriceX96(info.tree.nodes[key].userData);
        return PRBMath.mulDiv(info.orderInfos[key].base, priceX96, FixedPoint96.Q96);
    }

    function swap(
        MarketStructs.OrderBookSideInfo storage info,
        PreviewSwapParams memory params,
        function(bool, bool, uint256) view returns (uint256) maxSwapArg,
        function(bool, bool, uint256) returns (uint256) swap,
        function(uint40, uint40) view returns (bool) lessThanArg,
        function(uint40) returns (bool) aggregateArg
    ) internal returns (uint256 oppositeAmount) {
        PreviewSwapResponse memory response = previewSwap(info, params, maxSwapArg);

        if (response.amountPool > 0) {
            oppositeAmount += swap(params.isBaseToQuote, params.isExactInput, response.amountPool);
        }

        bool isBase = params.isBaseToQuote == params.isExactInput;
        if (response.fullLastKey != 0) {
            info.tree.removeLeft(response.fullLastKey, lessThanArg, aggregateArg);
            oppositeAmount += isBase ? response.quoteFull : response.baseFull;
        } else {
            require(response.baseFull == 0, "never occur");
            require(response.quoteFull == 0, "never occur");
        }

        if (response.partialKey != 0) {
            info.orderInfos[response.partialKey].baseExecuted += response.basePartial;
            info.orderInfos[response.partialKey].quoteExecuted += response.quotePartial;
            oppositeAmount += isBase ? response.quotePartial : response.basePartial;
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
        bool noRevert;
        uint256 baseBalancePerShareX96;
    }

    // to avoid stack too deep
    struct PreviewSwapLocalVars {
        uint128 priceX96;
        uint256 sharePriceX96;
        uint256 amountPool;
        uint40 left;
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
            vars.sharePriceX96 = PRBMath.mulDiv(vars.priceX96, params.baseBalancePerShareX96, FixedPoint96.Q96);
            vars.amountPool = maxSwapArg(params.isBaseToQuote, params.isExactInput, vars.sharePriceX96);

            // TODO: key - right is more gas efficient than left + key
            vars.left = info.tree.nodes[key].left;
            vars.leftBaseSum = baseSum + info.orderInfos[vars.left].baseSum;
            vars.leftQuoteSum = quoteSum + info.orderInfos[vars.left].quoteSum;
            vars.rightBaseSum = vars.leftBaseSum + info.orderInfos[key].base;
            vars.rightQuoteSum = vars.leftQuoteSum + _getQuote(info, key);

            if (
                params.amount <=
                (
                    isBase
                        ? vars.leftBaseSum
                        : PRBMath.mulDiv(vars.leftQuoteSum, params.baseBalancePerShareX96, FixedPoint96.Q96)
                ) +
                    vars.amountPool
            ) {
                if (vars.left == 0) {
                    response.fullLastKey = info.tree.prev(key);
                }
                key = vars.left;
            } else if (
                params.amount <
                (
                    isBase
                        ? vars.rightBaseSum
                        : PRBMath.mulDiv(vars.rightQuoteSum, params.baseBalancePerShareX96, FixedPoint96.Q96)
                ) +
                    vars.amountPool
            ) {
                response.amountPool = vars.amountPool;
                response.baseFull = vars.leftBaseSum;
                response.quoteFull = PRBMath.mulDiv(vars.leftQuoteSum, params.baseBalancePerShareX96, FixedPoint96.Q96);
                if (isBase) {
                    response.basePartial = params.amount - (response.baseFull + vars.amountPool);
                    response.quotePartial = PRBMath.mulDiv(response.basePartial, vars.sharePriceX96, FixedPoint96.Q96);
                } else {
                    response.quotePartial = params.amount - (response.quoteFull + vars.amountPool);
                    response.basePartial = PRBMath.mulDiv(response.quotePartial, FixedPoint96.Q96, vars.sharePriceX96);
                }
                response.fullLastKey = info.tree.prev(key);
                response.partialKey = key;
                return response;
            } else {
                baseSum = vars.rightBaseSum;
                quoteSum = vars.rightQuoteSum;
                uint40 right = info.tree.nodes[key].right;
                if (right == 0) {
                    response.fullLastKey = key;
                }
                key = right;
            }
        }

        response.baseFull = baseSum;
        response.quoteFull = PRBMath.mulDiv(quoteSum, params.baseBalancePerShareX96, FixedPoint96.Q96);
        response.amountPool = params.amount - (isBase ? response.baseFull : response.quoteFull);
    }

    function maxSwap(
        MarketStructs.OrderBookSideInfo storage info,
        bool isBaseToQuote,
        bool isExactInput,
        uint256 sharePriceBoundX96,
        uint256 baseBalancePerShareX96
    ) internal view returns (uint256 amount) {
        uint256 priceBoundX96 = PRBMath.mulDiv(sharePriceBoundX96, FixedPoint96.Q96, baseBalancePerShareX96);
        bool isBid = isBaseToQuote;
        bool isBase = isBaseToQuote == isExactInput;
        uint40 key = info.tree.root;

        while (key != 0) {
            uint128 price = userDataToPriceX96(info.tree.nodes[key].userData);
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
            amount = PRBMath.mulDiv(amount, baseBalancePerShareX96, FixedPoint96.Q96);
        }
    }
}
