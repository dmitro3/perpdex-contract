// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.0;

import { PerpMath } from "./PerpMath.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IPerpdexMarketMinimum } from "../interfaces/IPerpdexMarketMinimum.sol";
import { PerpdexStructs } from "./PerpdexStructs.sol";
import { AccountLibrary } from "./AccountLibrary.sol";
import { AccountPreviewLibrary } from "./AccountPreviewLibrary.sol";
import {
    BokkyPooBahsRedBlackTreeLibrary as RBTreeLibrary
} from "../../deps/BokkyPooBahsRedBlackTreeLibrary/contracts/BokkyPooBahsRedBlackTreeLibrary.sol";

library MakerOrderBookLibrary {
    using PerpMath for uint256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using RBTreeLibrary for RBTreeLibrary.Tree;

    struct CreateLimitOrderParams {
        address market;
        uint256 base;
        uint256 priceX96;
        bool isBid;
        uint24 imRatio;
        uint8 maxMarketsPerAccount;
        uint8 maxOrdersPerAccount;
        bool ignorePostOnlyCheck;
    }

    struct CancelLimitOrderParams {
        address market;
        uint40 orderId;
        bool isBid;
        uint24 mmRatio;
        bool isSelf;
        uint8 maxMarketsPerAccount;
    }

    struct SettleLimitOrdersLocalVars {
        uint40 executedLastAskOrderId;
        uint40 executedLastBidOrderId;
        uint256 executionLength;
        uint256 totalExecutedBaseAsk;
        uint256 totalExecutedBaseBid;
        PerpdexStructs.TakerInfo prevTakerInfo;
    }

    struct SettleLimitOrdersResponse {
        int256 base;
        int256 quote;
        int256 realizedPnl;
    }

    function createLimitOrder(PerpdexStructs.AccountInfo storage accountInfo, CreateLimitOrderParams memory params)
        external
        returns (uint40 orderId)
    {
        require(accountInfo.limitOrderCount < params.maxOrdersPerAccount, "MOBL_CLO: max order count");
        orderId = IPerpdexMarketMinimum(params.market).createLimitOrder(
            params.isBid,
            params.base,
            params.priceX96,
            params.ignorePostOnlyCheck
        );

        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[params.market];
        uint256 slot = _getSlot(limitOrderInfo);
        if (params.isBid) {
            limitOrderInfo.bid.insert(orderId, _makeUserData(params.priceX96), _lessThanBid, _aggregate, slot);
            limitOrderInfo.totalBaseBid += params.base;
        } else {
            limitOrderInfo.ask.insert(orderId, _makeUserData(params.priceX96), _lessThanAsk, _aggregate, slot);
            limitOrderInfo.totalBaseAsk += params.base;
        }
        accountInfo.limitOrderCount += 1;

        AccountLibrary.updateMarkets(accountInfo, params.market, params.maxMarketsPerAccount);

        require(AccountLibrary.hasEnoughInitialMargin(accountInfo, params.imRatio), "MOBL_CLO: not enough im");
    }

    function cancelLimitOrder(PerpdexStructs.AccountInfo storage accountInfo, CancelLimitOrderParams memory params)
        external
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

    function settleLimitOrders(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        uint8 maxMarketsPerAccount
    ) external returns (SettleLimitOrdersResponse memory response) {
        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[market];
        SettleLimitOrdersLocalVars memory vars;
        AccountPreviewLibrary.Execution[] memory executions;
        (executions, vars.executedLastAskOrderId, vars.executedLastBidOrderId) = AccountPreviewLibrary
            .getLimitOrderExecutions(accountInfo, market);
        vars.executionLength = executions.length;
        if (vars.executionLength == 0) return response;

        {
            uint256 slot = _getSlot(limitOrderInfo);
            if (vars.executedLastAskOrderId != 0) {
                limitOrderInfo.ask.removeLeft(
                    vars.executedLastAskOrderId,
                    _lessThanAsk,
                    _aggregate,
                    _subtreeRemoved,
                    slot
                );
            }
            if (vars.executedLastBidOrderId != 0) {
                limitOrderInfo.bid.removeLeft(
                    vars.executedLastBidOrderId,
                    _lessThanBid,
                    _aggregate,
                    _subtreeRemoved,
                    slot
                );
            }
        }

        vars.prevTakerInfo = accountInfo.takerInfos[market];
        (
            accountInfo.takerInfos[market],
            response.realizedPnl,
            vars.totalExecutedBaseAsk,
            vars.totalExecutedBaseBid
        ) = AccountPreviewLibrary.previewSettleLimitOrders(accountInfo, market, executions);

        response.base = accountInfo.takerInfos[market].baseBalanceShare - vars.prevTakerInfo.baseBalanceShare;
        response.quote = accountInfo.takerInfos[market].quoteBalance - vars.prevTakerInfo.quoteBalance;

        limitOrderInfo.totalBaseAsk -= vars.totalExecutedBaseAsk;
        limitOrderInfo.totalBaseBid -= vars.totalExecutedBaseBid;
        accountInfo.limitOrderCount -= vars.executionLength.toUint8();
        accountInfo.vaultInfo.collateralBalance += response.realizedPnl;
        AccountLibrary.updateMarkets(accountInfo, market, maxMarketsPerAccount);
    }

    function processPartialExecution(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        bool isBaseToQuote,
        uint8 maxMarketsPerAccount,
        IPerpdexMarketMinimum.SwapResponse memory rawResponse
    ) external returns (int256 realizedPnl) {
        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[market];
        if (isBaseToQuote) {
            limitOrderInfo.totalBaseBid -= rawResponse.basePartial;
        } else {
            limitOrderInfo.totalBaseAsk -= rawResponse.basePartial;
        }
        realizedPnl = AccountLibrary.addToTakerBalance(
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
        {
            uint256 i;
            while (i < length) {
                (uint48 executionId, , ) = IPerpdexMarketMinimum(market).getLimitOrderExecution(isBid, orderIds[i]);
                if (executionId == 0) break;
                ++i;
            }
            while (i < length) {
                summaries[summaryCount].orderId = orderIds[i];
                (summaries[summaryCount].base, summaries[summaryCount].priceX96) = IPerpdexMarketMinimum(market)
                    .getLimitOrderInfo(isBid, orderIds[i]);
                ++summaryCount;
                ++i;
            }
        }
        result = new PerpdexStructs.LimitOrderSummary[](summaryCount);
        for (uint256 i = 0; i < summaryCount; ++i) {
            result[i] = summaries[i];
        }
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
