// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;

import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { PerpMath } from "./PerpMath.sol";
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
    ) public {
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

    function getTotalAccountValue(PerpdexStructs.AccountInfo storage accountInfo)
        public
        view
        returns (int256 accountValue, int256 collateralBalance)
    {
        address[] storage markets = accountInfo.markets;
        collateralBalance = accountInfo.vaultInfo.collateralBalance;
        uint256 length = markets.length;
        for (uint256 i = 0; i < length; ++i) {
            address market = markets[i];

            PerpdexStructs.MakerInfo storage makerInfo = accountInfo.makerInfos[market];

            (PerpdexStructs.TakerInfo memory takerInfo, int256 realizedPnl) =
                AccountPreviewLibrary.previewSettleLimitOrders(accountInfo, market);
            int256 baseShare = takerInfo.baseBalanceShare;
            int256 quoteBalance = takerInfo.quoteBalance;
            collateralBalance = collateralBalance.add(realizedPnl);

            if (makerInfo.liquidity != 0) {
                (uint256 poolBaseShare, uint256 poolQuoteBalance) =
                    IPerpdexMarketMinimum(market).getLiquidityValue(makerInfo.liquidity);
                (int256 deleveragedBaseShare, int256 deleveragedQuoteBalance) =
                    IPerpdexMarketMinimum(market).getLiquidityDeleveraged(
                        makerInfo.liquidity,
                        makerInfo.cumBaseSharePerLiquidityX96,
                        makerInfo.cumQuotePerLiquidityX96
                    );
                baseShare = baseShare.add(poolBaseShare.toInt256()).add(deleveragedBaseShare);
                quoteBalance = quoteBalance.add(poolQuoteBalance.toInt256()).add(deleveragedQuoteBalance);
            }

            if (baseShare != 0) {
                uint256 sharePriceX96 = IPerpdexMarketMinimum(market).getShareMarkPriceX96();
                accountValue = accountValue.add(baseShare.mulDiv(sharePriceX96.toInt256(), FixedPoint96.Q96));
            }
            accountValue = accountValue.add(quoteBalance);
        }
        accountValue = accountValue.add(collateralBalance);
    }

    function getPositionShare(PerpdexStructs.AccountInfo storage accountInfo, address market)
        public
        view
        returns (int256 baseShare)
    {
        PerpdexStructs.MakerInfo storage makerInfo = accountInfo.makerInfos[market];
        (PerpdexStructs.TakerInfo memory takerInfo, ) =
            AccountPreviewLibrary.previewSettleLimitOrders(accountInfo, market);
        baseShare = takerInfo.baseBalanceShare;

        if (makerInfo.liquidity != 0) {
            (uint256 poolBaseShare, ) = IPerpdexMarketMinimum(market).getLiquidityValue(makerInfo.liquidity);
            (int256 deleveragedBaseShare, ) =
                IPerpdexMarketMinimum(market).getLiquidityDeleveraged(
                    makerInfo.liquidity,
                    makerInfo.cumBaseSharePerLiquidityX96,
                    makerInfo.cumQuotePerLiquidityX96
                );
            baseShare = baseShare.add(poolBaseShare.toInt256()).add(deleveragedBaseShare);
        }
    }

    function getPositionNotional(PerpdexStructs.AccountInfo storage accountInfo, address market)
        public
        view
        returns (int256)
    {
        int256 positionShare = getPositionShare(accountInfo, market);
        if (positionShare == 0) return 0;
        uint256 sharePriceX96 = IPerpdexMarketMinimum(market).getShareMarkPriceX96();
        return positionShare.mulDiv(sharePriceX96.toInt256(), FixedPoint96.Q96);
    }

    function getTotalPositionNotional(PerpdexStructs.AccountInfo storage accountInfo) public view returns (uint256) {
        address[] storage markets = accountInfo.markets;
        uint256 totalPositionNotional;
        uint256 length = markets.length;
        for (uint256 i = 0; i < length; ++i) {
            uint256 positionNotional = getPositionNotional(accountInfo, markets[i]).abs();
            totalPositionNotional = totalPositionNotional.add(positionNotional);
        }
        return totalPositionNotional;
    }

    function getOpenPositionShare(PerpdexStructs.AccountInfo storage accountInfo, address market)
        public
        view
        returns (uint256 result)
    {
        PerpdexStructs.MakerInfo storage makerInfo = accountInfo.makerInfos[market];
        result = getPositionShare(accountInfo, market).abs();
        if (makerInfo.liquidity != 0) {
            (uint256 poolBaseShare, ) = IPerpdexMarketMinimum(market).getLiquidityValue(makerInfo.liquidity);
            result = result.add(poolBaseShare);
        }
    }

    function getOpenPositionNotional(PerpdexStructs.AccountInfo storage accountInfo, address market)
        public
        view
        returns (uint256)
    {
        uint256 positionShare = getOpenPositionShare(accountInfo, market);
        if (positionShare == 0) return 0;
        uint256 sharePriceX96 = IPerpdexMarketMinimum(market).getShareMarkPriceX96();
        return PRBMath.mulDiv(positionShare, sharePriceX96, FixedPoint96.Q96);
    }

    function getTotalOpenPositionNotional(PerpdexStructs.AccountInfo storage accountInfo)
        public
        view
        returns (uint256)
    {
        address[] storage markets = accountInfo.markets;
        uint256 totalOpenPositionNotional;
        uint256 length = markets.length;
        for (uint256 i = 0; i < length; ++i) {
            uint256 positionNotional = getOpenPositionNotional(accountInfo, markets[i]);
            totalOpenPositionNotional = totalOpenPositionNotional.add(positionNotional);
        }
        return totalOpenPositionNotional;
    }

    // always true when hasEnoughMaintenanceMargin is true
    function hasEnoughMaintenanceMargin(PerpdexStructs.AccountInfo storage accountInfo, uint24 mmRatio)
        public
        view
        returns (bool)
    {
        (int256 accountValue, ) = getTotalAccountValue(accountInfo);
        uint256 totalPositionNotional = getTotalPositionNotional(accountInfo);
        return accountValue >= totalPositionNotional.mulRatio(mmRatio).toInt256();
    }

    function hasEnoughInitialMargin(PerpdexStructs.AccountInfo storage accountInfo, uint24 imRatio)
        public
        view
        returns (bool)
    {
        (int256 accountValue, int256 collateralBalance) = getTotalAccountValue(accountInfo);
        uint256 totalOpenPositionNotional = getTotalOpenPositionNotional(accountInfo);
        return
            accountValue.min(collateralBalance) >= totalOpenPositionNotional.mulRatio(imRatio).toInt256() ||
            isLiquidationFree(accountInfo);
    }

    function isLiquidationFree(PerpdexStructs.AccountInfo storage accountInfo) public view returns (bool) {
        address[] storage markets = accountInfo.markets;
        int256 quoteBalance = accountInfo.vaultInfo.collateralBalance;
        uint256 length = markets.length;
        for (uint256 i = 0; i < length; ++i) {
            address market = markets[i];

            PerpdexStructs.MakerInfo storage makerInfo = accountInfo.makerInfos[market];
            (PerpdexStructs.TakerInfo memory takerInfo, int256 realizedPnl) =
                AccountPreviewLibrary.previewSettleLimitOrders(accountInfo, market);

            int256 baseShare = takerInfo.baseBalanceShare;
            quoteBalance = quoteBalance.add(takerInfo.quoteBalance).add(realizedPnl);

            if (makerInfo.liquidity != 0) {
                (int256 deleveragedBaseShare, int256 deleveragedQuoteBalance) =
                    IPerpdexMarketMinimum(market).getLiquidityDeleveraged(
                        makerInfo.liquidity,
                        makerInfo.cumBaseSharePerLiquidityX96,
                        makerInfo.cumQuotePerLiquidityX96
                    );
                baseShare = baseShare.add(deleveragedBaseShare);
                quoteBalance = quoteBalance.add(deleveragedQuoteBalance);
            }

            if (baseShare < 0) return false;
        }
        return quoteBalance >= 0;
    }
}
