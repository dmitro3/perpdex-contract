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

    struct OrderInfo {
        uint256 base;
        uint256 baseSum;
        uint256 quoteSum;
    }

    struct OrderBookSideInfo {
        RBTreeLibrary.Tree tree;
        uint40 seqKey;
        mapping(uint40 => OrderInfo) orderInfos;
    }

    struct PreviewSwapResponse {
        uint256 basePool;
        uint256 quotePool;
        uint256 baseFull;
        uint256 quoteFull;
        uint256 basePartial;
        uint256 quotePartial;
        uint40 fullLastKey;
    }

    function createOrder(
        OrderBookSideInfo storage info,
        uint256 base,
        uint256 priceX96,
        function(uint40, uint40) view returns (bool) lessThanArg,
        function(uint40) returns (bool) aggregateArg
    ) internal returns (uint40) {
        uint40 key = info.seqKey + 1;
        info.seqKey = key;
        info.tree.insert(key, lessThanArg, aggregateArg);
        info.tree.nodes[key].userData = makeUserData(priceX96);
        info.orderInfos[key].base = base;
        return key;
    }

    function cancelOrder(
        OrderBookSideInfo storage info,
        uint40 key,
        function(uint40) returns (bool) aggregateArg
    ) internal {
        require(!isExecuted(info, key), "already executed");
        info.tree.remove(key, aggregateArg);
        delete info.orderInfos[key];
    }

    function getOrderInfo(OrderBookSideInfo storage info, uint40 key)
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

    function isExecuted(OrderBookSideInfo storage info, uint40 key) internal view returns (bool) {
        require(info.tree.exists(key), "not exist");
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
        OrderBookSideInfo storage info,
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

    function aggregate(OrderBookSideInfo storage info, uint40 key) internal returns (bool stop) {
        uint256 prevBaseSum = info.orderInfos[key].baseSum;
        uint256 prevQuoteSum = info.orderInfos[key].quoteSum;

        uint128 priceX96 = userDataToPriceX96(info.tree.nodes[key].userData);
        uint256 baseSum =
            info.orderInfos[info.tree.nodes[key].left].baseSum +
                info.orderInfos[info.tree.nodes[key].right].baseSum +
                info.orderInfos[key].base;
        uint256 quoteSum =
            info.orderInfos[info.tree.nodes[key].left].quoteSum +
                info.orderInfos[info.tree.nodes[key].right].quoteSum +
                _getQuote(info, key);

        info.orderInfos[key].baseSum = baseSum;
        info.orderInfos[key].quoteSum = quoteSum;
        stop = baseSum == prevBaseSum && quoteSum == prevQuoteSum;
    }

    function _getQuote(OrderBookSideInfo storage info, uint40 key) private view returns (uint256) {
        uint128 priceX96 = userDataToPriceX96(info.tree.nodes[key].userData);
        return PRBMath.mulDiv(info.orderInfos[key].base, priceX96, FixedPoint96.Q96);
    }

    struct SwapParams {
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        bool noRevert;
    }

    function swap(
        OrderBookSideInfo storage info,
        SwapParams memory params,
        function(bool, bool, uint256) view returns (uint256, uint256) maxSwapBaseQuote,
        function(bool, bool, uint256) returns (uint256) swap,
        function(uint40, uint40) view returns (bool) lessThanArg,
        function(uint40) returns (bool) aggregateArg
    ) internal returns (uint256 oppositeAmount) {
        PreviewSwapResponse memory response =
            previewSwap(
                info,
                params.isBaseToQuote,
                params.isExactInput,
                params.amount,
                params.noRevert,
                maxSwapBaseQuote
            );
        bool isBase = params.isBaseToQuote == params.isExactInput;
        uint256 poolAmount = isBase ? response.basePool : response.quotePool;
        if (poolAmount > 0) {
            uint256 poolOppositeAmount = swap(params.isBaseToQuote, params.isExactInput, poolAmount);
            require((isBase ? response.quotePool : response.basePool) == poolOppositeAmount, "OBL_S: never occur");
        }
        if (response.fullLastKey != 0) {
            info.tree.removeLeft(response.fullLastKey, lessThanArg, aggregateArg);
        }
        // TODO: update order at key

        bool isOppositeBase = !isBase;
        if (isOppositeBase) {
            oppositeAmount = response.basePool + response.baseFull + response.basePartial;
        } else {
            oppositeAmount = response.quotePool + response.quoteFull + response.quotePartial;
        }
    }

    // to avoid stack too deep
    struct PreviewSwapLocalVars {
        uint128 priceX96;
        uint256 basePool;
        uint256 quotePool;
        uint40 left;
        uint256 leftBaseSum;
        uint256 leftQuoteSum;
        uint256 rightBaseSum;
        uint256 rightQuoteSum;
    }

    function previewSwap(
        OrderBookSideInfo storage info,
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount,
        bool noRevert,
        function(bool, bool, uint256) view returns (uint256, uint256) maxSwapBaseQuote
    ) internal view returns (PreviewSwapResponse memory response) {
        bool isBase = isBaseToQuote == isExactInput;
        uint40 key = info.tree.root;
        uint256 baseSum;
        uint256 quoteSum;

        while (true) {
            PreviewSwapLocalVars memory vars;
            vars.priceX96 = userDataToPriceX96(info.tree.nodes[key].userData);
            (vars.basePool, vars.quotePool) = maxSwapBaseQuote(isBaseToQuote, isExactInput, vars.priceX96);

            vars.left = info.tree.nodes[key].left;
            vars.leftBaseSum = baseSum + info.orderInfos[vars.left].baseSum;
            vars.leftQuoteSum = quoteSum + info.orderInfos[vars.left].quoteSum;
            vars.rightBaseSum = vars.leftBaseSum + info.orderInfos[key].base;
            vars.rightQuoteSum = vars.leftQuoteSum + _getQuote(info, key);

            if (amount < (isBase ? vars.leftBaseSum + vars.basePool : vars.leftQuoteSum + vars.quotePool)) {
                key = info.tree.nodes[key].left;
                if (key == 0) {
                    response.basePool = vars.basePool;
                    response.quotePool = vars.quotePool;
                    response.baseFull = vars.leftBaseSum;
                    response.quoteFull = vars.leftQuoteSum;
                    response.basePartial = 0;
                    response.quotePartial = 0;
                    response.fullLastKey = info.tree.prev(key);
                    return response;
                }
            } else if (amount <= (isBase ? vars.rightBaseSum + vars.basePool : vars.rightQuoteSum + vars.quotePool)) {
                response.basePool = vars.basePool;
                response.quotePool = vars.quotePool;
                response.baseFull = vars.leftBaseSum;
                response.quoteFull = vars.leftQuoteSum;
                if (isBase) {
                    response.basePartial = amount - (vars.rightBaseSum + vars.basePool);
                    response.quotePartial = PRBMath.mulDiv(response.basePartial, vars.priceX96, FixedPoint96.Q96);
                } else {
                    response.quotePartial = amount - (vars.rightQuoteSum + vars.quotePool);
                    response.basePartial = PRBMath.mulDiv(response.quotePartial, FixedPoint96.Q96, vars.priceX96);
                }
                response.fullLastKey = info.tree.prev(key);
                return response;
            } else {
                baseSum = vars.rightBaseSum;
                quoteSum = vars.rightQuoteSum;
                key = info.tree.nodes[key].right;
                if (key == 0) {
                    response.basePool = vars.basePool;
                    response.quotePool = vars.quotePool;
                    response.baseFull = vars.rightBaseSum;
                    response.quoteFull = vars.leftQuoteSum;
                    response.basePartial = 0;
                    response.quotePartial = 0;
                    response.fullLastKey = key;
                    return response;
                }
            }
        }
    }

    function maxSwap(
        OrderBookSideInfo storage info,
        bool isBaseToQuote,
        bool isExactInput,
        uint256 priceBoundX96
    ) internal view returns (uint256 amount) {
        bool isBid = isBaseToQuote;
        bool isBase = isBaseToQuote == isExactInput;
        uint40 key = info.tree.root;

        while (key != 0) {
            uint128 price = userDataToPriceX96(info.tree.nodes[key].userData);
            uint40 left = info.tree.nodes[key].left;
            if (isBid ? price >= priceBoundX96 : price <= priceBoundX96) {
                amount += isBase
                    ? info.orderInfos[left].baseSum + info.orderInfos[key].base
                    : info.orderInfos[left].quoteSum + _getQuote(info, key);
                key = info.tree.nodes[key].right;
            } else {
                key = left;
            }
        }
    }
}
