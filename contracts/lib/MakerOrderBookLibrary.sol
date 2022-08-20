// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

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
    using PerpMath for uint256;
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
        uint8 maxOrdersPerAccount;
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
        public
        returns (uint40 orderId)
    {
        require(accountInfo.limitOrderCount < params.maxOrdersPerAccount, "MOBL_CLO: max order count");
        orderId = IPerpdexMarketMinimum(params.market).createLimitOrder(params.isBid, params.base, params.priceX96);

        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[params.market];
        uint256 slot = _getSlot(limitOrderInfo);
        if (params.isBid) {
            limitOrderInfo.bid.insert(orderId, makeUserData(params.priceX96), _lessThanBid, _aggregate, slot);
            limitOrderInfo.totalBaseBid += params.base;
        } else {
            limitOrderInfo.ask.insert(orderId, makeUserData(params.priceX96), _lessThanAsk, _aggregate, slot);
            limitOrderInfo.totalBaseAsk += params.base;
        }
        accountInfo.limitOrderCount += 1;

        AccountLibrary.updateMarkets(accountInfo, params.market, params.maxMarketsPerAccount);

        require(AccountLibrary.hasEnoughInitialMargin(accountInfo, params.imRatio), "MOBL_CLO: not enough im");
    }

    function cancelLimitOrder(PerpdexStructs.AccountInfo storage accountInfo, CancelLimitOrderParams memory params)
        public
        returns (bool isLiquidation)
    {
        isLiquidation = !AccountLibrary.hasEnoughMaintenanceMargin(accountInfo, params.mmRatio);

        if (!params.isSelf) {
            require(isLiquidation, "MOBL_CLO: enough mm");
        }

        (uint256 base, ) = IPerpdexMarketMinimum(params.market).getLimitOrderInfo(params.isBid, params.orderId);
        IPerpdexMarketMinimum(params.market).cancelLimitOrder(params.isBid, params.orderId);

        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[params.market];
        if (params.isBid) {
            limitOrderInfo.totalBaseBid -= base;
            limitOrderInfo.bid.remove(params.orderId, _aggregate, 0);
        } else {
            limitOrderInfo.totalBaseAsk -= base;
            limitOrderInfo.ask.remove(params.orderId, _aggregate, 0);
        }
        accountInfo.limitOrderCount -= 1;

        AccountLibrary.updateMarkets(accountInfo, params.market, params.maxMarketsPerAccount);
    }

    function makeUserData(uint256 priceX96) internal pure returns (uint128) {
        return priceX96.toUint128();
    }

    function userDataToPriceX96(uint128 userData) internal pure returns (uint128) {
        return userData;
    }

    function _lessThan(
        RBTreeLibrary.Tree storage tree,
        bool isBid,
        uint40 key0,
        uint40 key1
    ) private view returns (bool) {
        uint128 price0 = userDataToPriceX96(tree.nodes[key0].userData);
        uint128 price1 = userDataToPriceX96(tree.nodes[key1].userData);
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
        PerpdexStructs.LimitOrderInfo storage info = _getLimitOrderInfoFromSlot(slot);
        return _lessThan(info.ask, false, key0, key1);
    }

    function _lessThanBid(
        uint40 key0,
        uint40 key1,
        uint256 slot
    ) private view returns (bool) {
        PerpdexStructs.LimitOrderInfo storage info = _getLimitOrderInfoFromSlot(slot);
        return _lessThan(info.bid, true, key0, key1);
    }

    function _aggregate(uint40, uint256) private pure returns (bool) {
        return true;
    }

    function _subtreeRemoved(uint40, uint256) private pure {}

    function settleLimitOrdersAll(PerpdexStructs.AccountInfo storage accountInfo, uint8 maxMarketsPerAccount) public {
        address[] storage markets = accountInfo.markets;
        uint256 i = markets.length;
        while (i > 0) {
            --i;
            _settleLimitOrders(accountInfo, markets[i], maxMarketsPerAccount);
        }
    }

    function _settleLimitOrders(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        uint8 maxMarketsPerAccount
    ) private {
        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[market];
        (
            AccountPreviewLibrary.Execution[] memory executions,
            uint40 executedLastAskOrderId,
            uint40 executedLastBidOrderId
        ) = AccountPreviewLibrary.getLimitOrderExecutions(accountInfo, market);
        uint256 executionLength = executions.length;
        if (executionLength == 0) return;

        {
            uint256 slot = _getSlot(limitOrderInfo);
            if (executedLastAskOrderId != 0) {
                limitOrderInfo.ask.removeLeft(executedLastAskOrderId, _lessThanAsk, _aggregate, _subtreeRemoved, slot);
            }
            if (executedLastBidOrderId != 0) {
                limitOrderInfo.bid.removeLeft(executedLastBidOrderId, _lessThanBid, _aggregate, _subtreeRemoved, slot);
            }
        }

        int256 realizedPnl;
        uint256 totalExecutedBaseAsk;
        uint256 totalExecutedBaseBid;
        (
            accountInfo.takerInfos[market],
            realizedPnl,
            totalExecutedBaseAsk,
            totalExecutedBaseBid
        ) = AccountPreviewLibrary.previewSettleLimitOrders(accountInfo, market, executions);

        limitOrderInfo.totalBaseAsk -= totalExecutedBaseAsk;
        limitOrderInfo.totalBaseBid -= totalExecutedBaseBid;
        accountInfo.limitOrderCount -= executionLength.toUint8();
        accountInfo.vaultInfo.collateralBalance = accountInfo.vaultInfo.collateralBalance.add(realizedPnl);
        AccountLibrary.updateMarkets(accountInfo, market, maxMarketsPerAccount);
    }

    function processPartialExecution(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        bool isBaseToQuote,
        uint8 maxMarketsPerAccount,
        IPerpdexMarketMinimum.SwapResponse memory rawResponse
    ) external returns (int256 realizedPnl) {
        _settleLimitOrders(accountInfo, market, maxMarketsPerAccount);
        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[market];
        if (isBaseToQuote) {
            limitOrderInfo.totalBaseBid -= rawResponse.basePartial;
        } else {
            limitOrderInfo.totalBaseAsk -= rawResponse.basePartial;
        }
        realizedPnl = TakerLibrary.addToTakerBalance(
            accountInfo,
            market,
            isBaseToQuote ? rawResponse.basePartial.toInt256() : rawResponse.basePartial.neg256(),
            isBaseToQuote ? rawResponse.quotePartial.neg256() : rawResponse.quotePartial.toInt256(),
            0,
            maxMarketsPerAccount
        );
    }

    function getLimitOrderIds(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        bool isBid
    ) public view returns (uint40[] memory result) {
        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[market];
        RBTreeLibrary.Tree storage tree = isBid ? limitOrderInfo.bid : limitOrderInfo.ask;
        uint40[256] memory orderIds;
        uint256 orderCount;
        uint40 key = tree.first();
        while (key != 0) {
            orderIds[orderCount] = key;
            ++orderCount;
            key = tree.next(key);
        }
        result = new uint40[](orderCount);
        for (uint256 i = 0; i < orderCount; ++i) {
            result[i] = orderIds[i];
        }
    }

    function getLimitOrderSummaries(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        bool isBid
    ) external view returns (PerpdexStructs.LimitOrderSummary[] memory result) {
        uint40[] memory orderIds = getLimitOrderIds(accountInfo, market, isBid);
        uint256 length = orderIds.length;
        PerpdexStructs.LimitOrderSummary[256] memory summaries;
        uint256 summaryCount;
        for (uint256 i = 0; i < length; ++i) {
            (uint48 executionId, , ) = IPerpdexMarketMinimum(market).getLimitOrderExecution(isBid, orderIds[i]);
            if (executionId == 0) continue;

            summaries[summaryCount].orderId = orderIds[i];
            (summaries[summaryCount].base, summaries[summaryCount].priceX96) = IPerpdexMarketMinimum(market)
                .getLimitOrderInfo(isBid, orderIds[i]);
            ++summaryCount;
        }
        result = new PerpdexStructs.LimitOrderSummary[](summaryCount);
        for (uint256 i = 0; i < summaryCount; ++i) {
            result[i] = summaries[i];
        }
    }

    function _getSlot(PerpdexStructs.LimitOrderInfo storage d) private pure returns (uint256 slot) {
        assembly {
            slot := d.slot
        }
    }

    function _getLimitOrderInfoFromSlot(uint256 slot) private pure returns (PerpdexStructs.LimitOrderInfo storage d) {
        assembly {
            d.slot := slot
        }
    }
}
