// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.8.0;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { IPerpdexMarketMinimum } from "../interfaces/IPerpdexMarketMinimum.sol";
import { PerpMath } from "./PerpMath.sol";
import { PerpdexStructs } from "./PerpdexStructs.sol";
import {
    BokkyPooBahsRedBlackTreeLibrary as RBTreeLibrary
} from "../../deps/BokkyPooBahsRedBlackTreeLibrary/contracts/BokkyPooBahsRedBlackTreeLibrary.sol";

// This is a technical library to avoid circular references between libraries
library AccountPreviewLibrary {
    using PerpMath for int256;
    using PerpMath for uint256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SignedSafeMath for int256;
    using RBTreeLibrary for RBTreeLibrary.Tree;

    struct Execution {
        int256 executedBase;
        int256 executedQuote;
    }

    function getLimitOrderExecutions(PerpdexStructs.AccountInfo storage accountInfo, address market)
        internal
        view
        returns (
            Execution[] memory executions,
            uint40 executedLastAskOrderId,
            uint40 executedLastBidOrderId
        )
    {
        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[market];

        uint40 ask = limitOrderInfo.ask.first();
        uint40 bid = limitOrderInfo.bid.first();
        uint256 executionIdAsk;
        uint256 executedBaseAsk;
        uint256 executedQuoteAsk;
        uint256 executionIdBid;
        uint256 executedBaseBid;
        uint256 executedQuoteBid;
        if (ask != 0) {
            (executionIdAsk, executedBaseAsk, executedQuoteAsk) = IPerpdexMarketMinimum(market).getLimitOrderExecution(
                false,
                ask
            );
            if (executionIdAsk == 0) {
                ask = 0;
            }
        }
        if (bid != 0) {
            (executionIdBid, executedBaseBid, executedQuoteBid) = IPerpdexMarketMinimum(market).getLimitOrderExecution(
                true,
                bid
            );
            if (executionIdBid == 0) {
                bid = 0;
            }
        }

        // Combine the ask and bid and process from the one with the smallest executionId.
        // Ask and bid are already sorted and can be processed like merge sort.
        Execution[256] memory executions2;
        uint256 executionCount;
        while (ask != 0 || bid != 0) {
            if (ask != 0 && (bid == 0 || executionIdAsk < executionIdBid)) {
                executions2[executionCount] = Execution({
                    executedBase: executedBaseAsk.neg256(),
                    executedQuote: executedQuoteAsk.toInt256()
                });
                ++executionCount;

                uint40 nextAsk = limitOrderInfo.ask.next(ask);
                if (nextAsk != 0) {
                    (executionIdAsk, executedBaseAsk, executedQuoteAsk) = IPerpdexMarketMinimum(market)
                        .getLimitOrderExecution(false, nextAsk);
                }
                if (executionIdAsk == 0 || nextAsk == 0) {
                    executedLastAskOrderId = ask;
                    ask = 0;
                } else {
                    ask = nextAsk;
                }
            } else {
                executions2[executionCount] = Execution({
                    executedBase: executedBaseBid.toInt256(),
                    executedQuote: executedQuoteBid.neg256()
                });
                ++executionCount;

                uint40 nextBid = limitOrderInfo.bid.next(bid);
                if (nextBid != 0) {
                    (executionIdBid, executedBaseBid, executedQuoteBid) = IPerpdexMarketMinimum(market)
                        .getLimitOrderExecution(true, nextBid);
                }
                if (executionIdBid == 0 || nextBid == 0) {
                    executedLastBidOrderId = bid;
                    bid = 0;
                } else {
                    bid = nextBid;
                }
            }
        }

        executions = new Execution[](executionCount);
        for (uint256 i = 0; i < executionCount; i++) {
            executions[i] = executions2[i];
        }
    }

    function previewSettleLimitOrders(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        Execution[] memory executions
    )
        internal
        view
        returns (
            PerpdexStructs.TakerInfo memory takerInfo,
            int256 realizedPnl,
            uint256 totalExecutedBaseAsk,
            uint256 totalExecutedBaseBid
        )
    {
        takerInfo = accountInfo.takerInfos[market];

        uint256 length = executions.length;
        for (uint256 i = 0; i < length; ++i) {
            int256 realizedPnl2;
            (takerInfo, realizedPnl2) = previewAddToTakerBalance(
                takerInfo,
                executions[i].executedBase,
                executions[i].executedQuote,
                0
            );
            realizedPnl += realizedPnl2;
            if (executions[i].executedBase >= 0) {
                totalExecutedBaseBid += executions[i].executedBase.abs();
            } else {
                totalExecutedBaseAsk += executions[i].executedBase.abs();
            }
        }
    }

    function previewAddToTakerBalance(
        PerpdexStructs.TakerInfo memory takerInfo,
        int256 baseShare,
        int256 quoteBalance,
        int256 quoteFee
    ) internal pure returns (PerpdexStructs.TakerInfo memory resultTakerInfo, int256 realizedPnl) {
        if (baseShare != 0 || quoteBalance != 0) {
            if (baseShare.sign() * quoteBalance.sign() != -1) {
                // ignore invalid input
                return (takerInfo, 0);
            }
            if (takerInfo.baseBalanceShare.sign() * baseShare.sign() == -1) {
                uint256 baseAbs = baseShare.abs();
                uint256 takerBaseAbs = takerInfo.baseBalanceShare.abs();

                if (baseAbs <= takerBaseAbs) {
                    int256 reducedOpenNotional = takerInfo.quoteBalance.mulDiv(baseAbs.toInt256(), takerBaseAbs);
                    realizedPnl = quoteBalance.add(reducedOpenNotional);
                } else {
                    int256 closedPositionNotional = quoteBalance.mulDiv(takerBaseAbs.toInt256(), baseAbs);
                    realizedPnl = takerInfo.quoteBalance.add(closedPositionNotional);
                }
            }
        }
        realizedPnl = realizedPnl.add(quoteFee);

        int256 newBaseBalanceShare = takerInfo.baseBalanceShare.add(baseShare);
        int256 newQuoteBalance = takerInfo.quoteBalance.add(quoteBalance).add(quoteFee).sub(realizedPnl);
        if (
            !((newBaseBalanceShare == 0 && newQuoteBalance == 0) ||
                newBaseBalanceShare.sign() * newQuoteBalance.sign() == -1)
        ) {
            // never occur. ignore
            return (takerInfo, 0);
        }

        resultTakerInfo.baseBalanceShare = newBaseBalanceShare;
        resultTakerInfo.quoteBalance = newQuoteBalance;
    }
}
