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
import { TakerLibrary } from "./TakerLibrary.sol";

library MakerOrderBookLibrary {
    using PerpMath for int256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;

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
        uint256 orderId;
        bool isBid;
        uint24 mmRatio;
        bool isSelf;
        uint8 maxMarketsPerAccount;
    }

    function createLimitOrder(PerpdexStructs.AccountInfo storage accountInfo, CreateLimitOrderParams memory params)
        internal
        returns (uint256 orderId)
    {
        orderId = IPerpdexMarketMinimum(params.market).createLimitOrder(params.isBid, params.base, params.priceX96);

        PerpdexStructs.LimitOrderInfo[] storage limitOrderInfos = accountInfo.limitOrderInfos[params.market];
        limitOrderInfos.push(
            PerpdexStructs.LimitOrderInfo({
                orderId: orderId,
                isBid: params.isBid,
                settledBaseShare: 0,
                settledQuote: 0
            })
        );

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

        PerpdexStructs.LimitOrderInfo[] storage limitOrderInfos = accountInfo.limitOrderInfos[params.market];
        uint256 length = limitOrderInfos.length;
        for (uint256 i = 0; i < length; ++i) {
            if (limitOrderInfos[i].orderId == params.orderId) {
                limitOrderInfos[i] = limitOrderInfos[length - 1];
                limitOrderInfos.pop();
                return isLiquidation;
            }
        }
        require(false, "MOBL_CLO: order not exist");

        AccountLibrary.updateMarkets(accountInfo, params.market, params.maxMarketsPerAccount);
    }

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
        bool currentIsLong = accountInfo.takerInfos[market].baseBalanceShare >= 0;

        PerpdexStructs.LimitOrderInfo[] storage limitOrderInfos = accountInfo.limitOrderInfos[market];
        int256 firstSettlingBase;
        int256 firstSettlingQuote;
        int256 secondSettlingBase;
        int256 secondSettlingQuote;
        uint256 i = limitOrderInfos.length;
        while (i > 0) {
            --i;
            (bool fullyExecuted, int256 executedBase, int256 executedQuote) =
                IPerpdexMarketMinimum(market).getLimitOrderInfo(limitOrderInfos[i].isBid, limitOrderInfos[i].orderId);

            int256 settlingBase = executedBase - limitOrderInfos[i].settledBaseShare;
            int256 settlingQuote = executedQuote - limitOrderInfos[i].settledQuote;

            if ((settlingBase >= 0) == currentIsLong) {
                firstSettlingBase += settlingBase;
                firstSettlingQuote += settlingQuote;
            } else {
                secondSettlingBase += settlingBase;
                secondSettlingQuote += settlingQuote;
            }

            if (fullyExecuted) {
                limitOrderInfos[i] = limitOrderInfos[limitOrderInfos.length - 1];
                limitOrderInfos.pop();
            } else {
                limitOrderInfos[i].settledBaseShare = executedBase;
                limitOrderInfos[i].settledBaseShare = executedQuote;
            }
        }

        if (firstSettlingBase != 0) {
            TakerLibrary.addToTakerBalance(
                accountInfo,
                market,
                firstSettlingBase,
                firstSettlingQuote,
                0,
                maxMarketsPerAccount
            );
        }
        if (secondSettlingBase != 0) {
            TakerLibrary.addToTakerBalance(
                accountInfo,
                market,
                secondSettlingBase,
                secondSettlingQuote,
                0,
                maxMarketsPerAccount
            );
        }
    }
}
