// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;

import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { PerpMath } from "./PerpMath.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { PRBMath } from "prb-math/contracts/PRBMath.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IPerpdexMarketMinimum } from "../interfaces/IPerpdexMarketMinimum.sol";
import { PerpdexStructs } from "./PerpdexStructs.sol";
import { AccountPreviewLibrary } from "./AccountPreviewLibrary.sol";

// https://help.ftx.com/hc/en-us/articles/360024780511-Complete-Futures-Specs
library AccountLibrary {
    using PerpMath for int256;
    using PerpMath for uint256;
    using SafeCast for uint256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    function updateMarkets(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        uint8 maxMarketsPerAccount
    ) external {
        bool enabled =
            accountInfo.takerInfos[market].baseBalanceShare != 0 ||
                accountInfo.makerInfos[market].liquidity != 0 ||
                accountInfo.limitOrderInfos[market].ask.root != 0 ||
                accountInfo.limitOrderInfos[market].bid.root != 0;
        address[] storage markets = accountInfo.markets;
        uint256 length = markets.length;

        for (uint256 i = 0; i < length; ++i) {
            if (markets[i] == market) {
                if (!enabled) {
                    markets[i] = markets[length - 1];
                    markets.pop();
                }
                return;
            }
        }

        if (!enabled) return;

        require(length + 1 <= maxMarketsPerAccount, "AL_UP: too many markets");
        markets.push(market);
    }

    struct CalcMarketResponse {
        int256 baseShare;
        int256 quoteBalance;
        int256 baseSharePool;
        int256 quoteBalancePool;
        int256 positionNotional;
        uint256 openPositionShare;
        uint256 openPositionNotional;
        int256 accountValue;
        int256 realizedPnl;
    }

    function _calcMarket(PerpdexStructs.AccountInfo storage accountInfo, address market)
        private
        view
        returns (CalcMarketResponse memory response)
    {
        PerpdexStructs.MakerInfo storage makerInfo = accountInfo.makerInfos[market];
        PerpdexStructs.TakerInfo memory takerInfo;
        (AccountPreviewLibrary.Execution[] memory executions, , ) =
            AccountPreviewLibrary.getLimitOrderExecutions(accountInfo, market);

        uint256 totalExecutedBaseAsk;
        uint256 totalExecutedBaseBid;
        (takerInfo, response.realizedPnl, totalExecutedBaseAsk, totalExecutedBaseBid) = AccountPreviewLibrary
            .previewSettleLimitOrders(accountInfo, market, executions);

        response.baseShare = takerInfo.baseBalanceShare;
        response.quoteBalance = takerInfo.quoteBalance;

        uint256 totalOrderBaseAsk;
        uint256 totalOrderBaseBid;
        if (makerInfo.liquidity != 0) {
            (uint256 poolBaseShare, uint256 poolQuoteBalance) =
                IPerpdexMarketMinimum(market).getLiquidityValue(makerInfo.liquidity);
            (int256 deleveragedBaseShare, int256 deleveragedQuoteBalance) =
                IPerpdexMarketMinimum(market).getLiquidityDeleveraged(
                    makerInfo.liquidity,
                    makerInfo.cumBaseSharePerLiquidityX96,
                    makerInfo.cumQuotePerLiquidityX96
                );
            response.baseSharePool = poolBaseShare.toInt256();
            response.baseShare = response.baseShare.add(deleveragedBaseShare).add(response.baseSharePool);
            response.quoteBalancePool = poolQuoteBalance.toInt256();
            response.quoteBalance = response.quoteBalance.add(deleveragedQuoteBalance).add(response.quoteBalancePool);
            totalOrderBaseAsk = poolBaseShare;
            totalOrderBaseBid = poolBaseShare;
        }

        PerpdexStructs.LimitOrderInfo storage limitOrderInfo = accountInfo.limitOrderInfos[market];
        totalOrderBaseAsk += limitOrderInfo.totalBaseAsk - totalExecutedBaseAsk;
        totalOrderBaseBid += limitOrderInfo.totalBaseBid - totalExecutedBaseBid;
        response.openPositionShare = Math.max(
            (response.baseShare - totalOrderBaseAsk.toInt256()).abs(),
            (response.baseShare + totalOrderBaseBid.toInt256()).abs()
        );

        if (response.openPositionShare != 0) {
            uint256 sharePriceX96 = IPerpdexMarketMinimum(market).getShareMarkPriceX96();
            response.openPositionNotional = PRBMath.mulDiv(response.openPositionShare, sharePriceX96, FixedPoint96.Q96);

            if (response.baseShare != 0) {
                response.positionNotional = response.baseShare.mulDiv(sharePriceX96.toInt256(), FixedPoint96.Q96);
                response.accountValue = response.accountValue.add(response.positionNotional);
            }
        }

        response.accountValue = response.accountValue.add(response.quoteBalance).add(response.realizedPnl);
    }

    struct CalcTotalResponse {
        int256 accountValue;
        int256 collateralBalance;
        uint256 totalPositionNotional;
        uint256 totalOpenPositionNotional;
        bool isLiquidationFree;
    }

    function _calcTotal(PerpdexStructs.AccountInfo storage accountInfo)
        private
        view
        returns (CalcTotalResponse memory response)
    {
        response.collateralBalance = accountInfo.vaultInfo.collateralBalance;
        response.isLiquidationFree = true;
        int256 quoteBalanceWithoutPool;

        address[] storage markets = accountInfo.markets;
        uint256 length = markets.length;
        for (uint256 i = 0; i < length; ++i) {
            address market = markets[i];

            CalcMarketResponse memory marketResponse = _calcMarket(accountInfo, market);

            response.accountValue = response.accountValue.add(marketResponse.accountValue);
            response.collateralBalance = response.collateralBalance.add(marketResponse.realizedPnl);
            response.totalPositionNotional = response.totalPositionNotional.add(marketResponse.positionNotional.abs());
            response.totalOpenPositionNotional = response.totalOpenPositionNotional.add(
                marketResponse.openPositionNotional
            );
            // TODO: consider limit order
            response.isLiquidationFree =
                response.isLiquidationFree &&
                marketResponse.baseShare >= marketResponse.baseSharePool;
            quoteBalanceWithoutPool = quoteBalanceWithoutPool.add(
                marketResponse.quoteBalance - marketResponse.quoteBalancePool
            );
        }
        response.accountValue = response.accountValue.add(response.collateralBalance);
        response.isLiquidationFree =
            response.isLiquidationFree &&
            quoteBalanceWithoutPool.add(response.collateralBalance) >= 0;
    }

    function getTotalAccountValue(PerpdexStructs.AccountInfo storage accountInfo) external view returns (int256) {
        return _calcTotal(accountInfo).accountValue;
    }

    function getPositionShare(PerpdexStructs.AccountInfo storage accountInfo, address market)
        external
        view
        returns (int256)
    {
        return _calcMarket(accountInfo, market).baseShare;
    }

    function getPositionNotional(PerpdexStructs.AccountInfo storage accountInfo, address market)
        external
        view
        returns (int256)
    {
        return _calcMarket(accountInfo, market).positionNotional;
    }

    function getTotalPositionNotional(PerpdexStructs.AccountInfo storage accountInfo) external view returns (uint256) {
        return _calcTotal(accountInfo).totalPositionNotional;
    }

    function getOpenPositionShare(PerpdexStructs.AccountInfo storage accountInfo, address market)
        external
        view
        returns (uint256)
    {
        return _calcMarket(accountInfo, market).openPositionShare;
    }

    function getOpenPositionNotional(PerpdexStructs.AccountInfo storage accountInfo, address market)
        external
        view
        returns (uint256)
    {
        return _calcMarket(accountInfo, market).openPositionNotional;
    }

    function getTotalOpenPositionNotional(PerpdexStructs.AccountInfo storage accountInfo)
        external
        view
        returns (uint256)
    {
        return _calcTotal(accountInfo).totalOpenPositionNotional;
    }

    function hasEnoughMaintenanceMargin(PerpdexStructs.AccountInfo storage accountInfo, uint24 mmRatio)
        external
        view
        returns (bool)
    {
        CalcTotalResponse memory response = _calcTotal(accountInfo);
        return response.accountValue >= response.totalPositionNotional.mulRatio(mmRatio).toInt256();
    }

    // always true when hasEnoughMaintenanceMargin is true
    function hasEnoughInitialMargin(PerpdexStructs.AccountInfo storage accountInfo, uint24 imRatio)
        external
        view
        returns (bool)
    {
        CalcTotalResponse memory response = _calcTotal(accountInfo);
        return
            response.accountValue.min(response.collateralBalance) >=
            response.totalOpenPositionNotional.mulRatio(imRatio).toInt256() ||
            response.isLiquidationFree;
    }

    function isLiquidationFree(PerpdexStructs.AccountInfo storage accountInfo) external view returns (bool) {
        return _calcTotal(accountInfo).isLiquidationFree;
    }
}
