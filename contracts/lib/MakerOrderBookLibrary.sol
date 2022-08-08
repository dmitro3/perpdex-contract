// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { PRBMath } from "prb-math/contracts/PRBMath.sol";
import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { PerpMath } from "./PerpMath.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IPerpdexMarketMinimum } from "../interfaces/IPerpdexMarketMinimum.sol";
import { PerpdexStructs } from "./PerpdexStructs.sol";
import { AccountLibrary } from "./AccountLibrary.sol";
import { AccountPreviewLibrary } from "./AccountPreviewLibrary.sol";
import { TakerLibrary } from "./TakerLibrary.sol";
import {
    BokkyPooBahsRedBlackTreeLibrary as RBTreeLibrary
} from "../../deps/BokkyPooBahsRedBlackTreeLibrary/contracts/BokkyPooBahsRedBlackTreeLibrary.sol";

library MakerOrderBookLibrary {
    using PerpMath for int256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;
    using RBTreeLibrary for RBTreeLibrary.Tree;

    struct CreateLimitOrderParams {
        address market;
        uint256 base;
        uint256 priceX96;
        bool isBid;
        uint24 imRatio;
        uint8 maxMarketsPerAccount;
    }

    struct CancelLimitOrderParams {
        address market;
        uint40 orderId;
        bool isBid;
        uint24 mmRatio;
        bool isSelf;
        uint8 maxMarketsPerAccount;
    }

    function createLimitOrder(PerpdexStructs.AccountInfo storage accountInfo, CreateLimitOrderParams memory params)
        internal
        returns (uint40 orderId)
    {
        orderId = IPerpdexMarketMinimum(params.market).createLimitOrder(params.isBid, params.base, params.priceX96);

        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[params.market];
        if (params.isBid) {
            limitOrderInfo.bid.insert(orderId, makeUserData(params.priceX96), lessThanBid, aggregate);
        } else {
            limitOrderInfo.ask.insert(orderId, makeUserData(params.priceX96), lessThanAsk, aggregate);
        }

        AccountLibrary.updateMarkets(accountInfo, params.market, params.maxMarketsPerAccount);

        require(AccountLibrary.hasEnoughInitialMargin(accountInfo, params.imRatio), "MOBL_CLO: not enough im");
    }

    function cancelLimitOrder(PerpdexStructs.AccountInfo storage accountInfo, CancelLimitOrderParams memory params)
        internal
        returns (bool isLiquidation)
    {
        isLiquidation = !AccountLibrary.hasEnoughMaintenanceMargin(accountInfo, params.mmRatio);

        if (!params.isSelf) {
            require(isLiquidation, "MOBL_CLO: enough mm");
        }

        IPerpdexMarketMinimum(params.market).cancelLimitOrder(params.isBid, params.orderId);

        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[params.market];
        if (params.isBid) {
            limitOrderInfo.bid.remove(params.orderId, aggregate);
        } else {
            limitOrderInfo.ask.remove(params.orderId, aggregate);
        }

        AccountLibrary.updateMarkets(accountInfo, params.market, params.maxMarketsPerAccount);
    }

    function makeUserData(uint256 priceX96) internal pure returns (uint128) {
        return priceX96.toUint128();
    }

    function userDataToPriceX96(uint128 userData) internal pure returns (uint128) {
        return userData;
    }

    function lessThanAsk(
        RBTreeLibrary.Tree storage tree,
        uint40 key0,
        uint40 key1
    ) private view returns (bool) {
        uint128 price0 = userDataToPriceX96(tree.nodes[key0].userData);
        uint128 price1 = userDataToPriceX96(tree.nodes[key1].userData);
        if (price0 == price1) {
            return key0 < key1; // time priority
        }
        // price priority
        return price0 < price1;
    }

    function lessThanBid(
        RBTreeLibrary.Tree storage tree,
        uint40 key0,
        uint40 key1
    ) private view returns (bool) {
        uint128 price0 = userDataToPriceX96(tree.nodes[key0].userData);
        uint128 price1 = userDataToPriceX96(tree.nodes[key1].userData);
        if (price0 == price1) {
            return key0 < key1; // time priority
        }
        // price priority
        return price0 > price1;
    }

    function aggregate(uint40 key) private pure returns (bool) {
        return true;
    }

    function subtreeRemoved(uint40 key) private pure {}

    function settleLimitOrdersAll(PerpdexStructs.AccountInfo storage accountInfo, uint8 maxMarketsPerAccount) internal {
        address[] storage markets = accountInfo.markets;
        uint256 i = markets.length;
        while (i > 0) {
            --i;
            settleLimitOrders(accountInfo, markets[i], maxMarketsPerAccount);
        }
    }

    function settleLimitOrders(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        uint8 maxMarketsPerAccount
    ) internal {
        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[market];
        (
            AccountPreviewLibrary.Execution[] memory executions,
            uint40 executedLastAskOrderId,
            uint40 executedLastBidOrderId
        ) = AccountPreviewLibrary.getLimitOrderExecutions(accountInfo, market);

        if (executedLastAskOrderId != 0) {
            limitOrderInfo.ask.removeLeft(executedLastAskOrderId, lessThanAsk, aggregate, subtreeRemoved);
        }
        if (executedLastBidOrderId != 0) {
            limitOrderInfo.bid.removeLeft(executedLastBidOrderId, lessThanBid, aggregate, subtreeRemoved);
        }

        uint256 length = executions.length;
        for (uint256 i = 0; i < length; ++i) {
            TakerLibrary.addToTakerBalance(
                accountInfo,
                market,
                executions[i].executedBase,
                executions[i].executedQuote,
                0,
                maxMarketsPerAccount
            );
        }
    }
}
