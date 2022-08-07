// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { PRBMath } from "prb-math/contracts/PRBMath.sol";
import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { IPerpdexMarketMinimum } from "../interfaces/IPerpdexMarketMinimum.sol";
import { PerpMath } from "./PerpMath.sol";
import { PerpdexStructs } from "./PerpdexStructs.sol";

// This is a technical library to avoid circular references between libraries
library AccountPreviewLibrary {
    using PerpMath for int256;
    using PerpMath for uint256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    function previewAddToTakerBalance(
        PerpdexStructs.TakerInfo memory takerInfo,
        int256 baseShare,
        int256 quoteBalance,
        int256 quoteFee
    ) internal view returns (PerpdexStructs.TakerInfo memory resultTakerInfo, int256 realizedPnl) {
        if (baseShare != 0 || quoteBalance != 0) {
            require(baseShare.sign() * quoteBalance.sign() == -1, "TL_ATTB: invalid input");

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
        require(
            (newBaseBalanceShare == 0 && newQuoteBalance == 0) ||
                newBaseBalanceShare.sign() * newQuoteBalance.sign() == -1,
            "TL_ATTB: never occur"
        );

        resultTakerInfo.baseBalanceShare = newBaseBalanceShare;
        resultTakerInfo.quoteBalance = newQuoteBalance;
    }

    // we use batch execution rules
    // see https://medium.com/perpdex/order-dependency-of-trade-execution-ce6d2907eb4f
    function previewSettleLimitOrders(PerpdexStructs.AccountInfo storage accountInfo, address market)
        internal
        view
        returns (PerpdexStructs.TakerInfo memory takerInfo, int256 realizedPnl)
    {
        takerInfo = accountInfo.takerInfos[market];

        PerpdexStructs.LimitOrderInfo[] storage limitOrderInfos = accountInfo.limitOrderInfos[market];
        int256 firstSettlingBase;
        int256 firstSettlingQuote;
        int256 secondSettlingBase;
        int256 secondSettlingQuote;
        uint256 i = limitOrderInfos.length;
        while (i > 0) {
            --i;
            (, int256 executedBase, int256 executedQuote) =
                IPerpdexMarketMinimum(market).getLimitOrderInfo(limitOrderInfos[i].isBid, limitOrderInfos[i].orderId);

            int256 settlingBase = executedBase - limitOrderInfos[i].settledBaseShare;
            int256 settlingQuote = executedQuote - limitOrderInfos[i].settledQuote;

            if ((settlingBase >= 0) == (takerInfo.baseBalanceShare >= 0)) {
                firstSettlingBase += settlingBase;
                firstSettlingQuote += settlingQuote;
            } else {
                secondSettlingBase += settlingBase;
                secondSettlingQuote += settlingQuote;
            }
        }

        if (firstSettlingBase != 0) {
            (takerInfo, realizedPnl) = previewAddToTakerBalance(takerInfo, firstSettlingBase, firstSettlingQuote, 0);
        }
        int256 secondRealizedPnl;
        if (secondSettlingBase != 0) {
            (takerInfo, secondRealizedPnl) = previewAddToTakerBalance(
                takerInfo,
                secondSettlingBase,
                secondSettlingQuote,
                0
            );
            realizedPnl += secondRealizedPnl;
        }
    }
}
