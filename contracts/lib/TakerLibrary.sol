// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { IPerpdexMarketMinimum } from "../interfaces/IPerpdexMarketMinimum.sol";
import { PerpMath } from "./PerpMath.sol";
import { PerpdexStructs } from "./PerpdexStructs.sol";
import { AccountLibrary } from "./AccountLibrary.sol";
import { AccountPreviewLibrary } from "./AccountPreviewLibrary.sol";

library TakerLibrary {
    using PerpMath for int256;
    using PerpMath for uint256;
    using SafeCast for uint256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    struct TradeParams {
        address market;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint24 mmRatio;
        uint24 imRatio;
        uint8 maxMarketsPerAccount;
        uint24 protocolFeeRatio;
        bool isSelf;
        PerpdexStructs.LiquidationRewardConfig liquidationRewardConfig;
    }

    struct PreviewTradeParams {
        address market;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint24 mmRatio;
        uint24 protocolFeeRatio;
        bool isSelf;
    }

    struct TradeResponse {
        int256 base;
        int256 quote;
        int256 realizedPnl;
        uint256 protocolFee;
        uint256 liquidationPenalty;
        uint256 liquidationReward;
        uint256 insuranceFundReward;
        bool isLiquidation;
        IPerpdexMarketMinimum.SwapResponse rawResponse;
    }

    function trade(
        PerpdexStructs.AccountInfo storage accountInfo,
        PerpdexStructs.VaultInfo storage liquidatorVaultInfo,
        PerpdexStructs.InsuranceFundInfo storage insuranceFundInfo,
        PerpdexStructs.ProtocolInfo storage protocolInfo,
        TradeParams memory params
    ) internal returns (TradeResponse memory response) {
        response.isLiquidation = _validateTrade(accountInfo, params.market, params.isSelf, params.mmRatio, false);

        int256 takerBaseBefore = accountInfo.takerInfos[params.market].baseBalanceShare;

        (response.base, response.quote, response.realizedPnl, response.protocolFee, response.rawResponse) = _doSwap(
            accountInfo,
            protocolInfo,
            DoSwapParams({
                market: params.market,
                isBaseToQuote: params.isBaseToQuote,
                isExactInput: params.isExactInput,
                amount: params.amount,
                oppositeAmountBound: params.oppositeAmountBound,
                maxMarketsPerAccount: params.maxMarketsPerAccount,
                protocolFeeRatio: params.protocolFeeRatio,
                isLiquidation: response.isLiquidation
            })
        );

        bool isOpen = (takerBaseBefore.add(response.base)).sign() * response.base.sign() > 0;

        if (response.isLiquidation) {
            require(!isOpen, "TL_OP: no open when liquidation");

            (
                response.liquidationPenalty,
                response.liquidationReward,
                response.insuranceFundReward
            ) = processLiquidationReward(
                accountInfo.vaultInfo,
                liquidatorVaultInfo,
                insuranceFundInfo,
                params.mmRatio,
                params.liquidationRewardConfig,
                response.quote.abs()
            );
        }

        if (isOpen) {
            require(AccountLibrary.hasEnoughInitialMargin(accountInfo, params.imRatio), "TL_OP: not enough im");
        }
    }

    function addToTakerBalance(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        int256 baseShare,
        int256 quoteBalance,
        int256 quoteFee,
        uint8 maxMarketsPerAccount
    ) internal returns (int256 realizedPnl) {
        (accountInfo.takerInfos[market], realizedPnl) = AccountPreviewLibrary.previewAddToTakerBalance(
            accountInfo.takerInfos[market],
            baseShare,
            quoteBalance,
            quoteFee
        );

        accountInfo.vaultInfo.collateralBalance = accountInfo.vaultInfo.collateralBalance.add(realizedPnl);

        AccountLibrary.updateMarkets(accountInfo, market, maxMarketsPerAccount);
    }

    // Even if trade reverts, it may not revert.
    // Attempting to match reverts makes the implementation too complicated
    // ignored checks when liquidation:
    // - initial margin
    // - close only
    // - maker and limit order existence
    function previewTrade(PerpdexStructs.AccountInfo storage accountInfo, PreviewTradeParams memory params)
        internal
        view
        returns (uint256 oppositeAmount)
    {
        bool isLiquidation = _validateTrade(accountInfo, params.market, params.isSelf, params.mmRatio, true);

        oppositeAmount;
        if (params.protocolFeeRatio == 0) {
            oppositeAmount = IPerpdexMarketMinimum(params.market).previewSwap(
                params.isBaseToQuote,
                params.isExactInput,
                params.amount,
                isLiquidation
            );
        } else {
            (oppositeAmount, ) = previewSwapWithProtocolFee(
                params.market,
                params.isBaseToQuote,
                params.isExactInput,
                params.amount,
                params.protocolFeeRatio,
                isLiquidation
            );
        }
        validateSlippage(params.isExactInput, oppositeAmount, params.oppositeAmountBound);
    }

    // ignored checks when liquidation:
    // - initial margin
    // - close only
    // - maker and limit order existence
    function maxTrade(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        bool isBaseToQuote,
        bool isExactInput,
        uint24 mmRatio,
        uint24 protocolFeeRatio,
        bool isSelf
    ) internal view returns (uint256 amount) {
        bool isLiquidation = !AccountLibrary.hasEnoughMaintenanceMargin(accountInfo, mmRatio);

        if (!isSelf && !isLiquidation) {
            return 0;
        }

        if (protocolFeeRatio == 0) {
            amount = IPerpdexMarketMinimum(market).maxSwap(isBaseToQuote, isExactInput, isLiquidation);
        } else {
            amount = maxSwapWithProtocolFee(market, isBaseToQuote, isExactInput, protocolFeeRatio, isLiquidation);
        }
    }

    // to avoid stack too deep
    struct DoSwapParams {
        address market;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint8 maxMarketsPerAccount;
        uint24 protocolFeeRatio;
        bool isLiquidation;
    }

    function _doSwap(
        PerpdexStructs.AccountInfo storage accountInfo,
        PerpdexStructs.ProtocolInfo storage protocolInfo,
        DoSwapParams memory params
    )
        private
        returns (
            int256 base,
            int256 quote,
            int256 realizedPnl,
            uint256 protocolFee,
            IPerpdexMarketMinimum.SwapResponse memory rawResponse
        )
    {
        uint256 oppositeAmount;

        if (params.protocolFeeRatio > 0) {
            (oppositeAmount, protocolFee, rawResponse) = swapWithProtocolFee(
                protocolInfo,
                params.market,
                params.isBaseToQuote,
                params.isExactInput,
                params.amount,
                params.protocolFeeRatio,
                params.isLiquidation
            );
        } else {
            rawResponse = IPerpdexMarketMinimum(params.market).swap(
                params.isBaseToQuote,
                params.isExactInput,
                params.amount,
                params.isLiquidation
            );
            oppositeAmount = rawResponse.oppositeAmount;
        }
        validateSlippage(params.isExactInput, oppositeAmount, params.oppositeAmountBound);

        (base, quote) = swapResponseToBaseQuote(
            params.isBaseToQuote,
            params.isExactInput,
            params.amount,
            oppositeAmount
        );
        realizedPnl = addToTakerBalance(accountInfo, params.market, base, quote, 0, params.maxMarketsPerAccount);
    }

    function swapWithProtocolFee(
        PerpdexStructs.ProtocolInfo storage protocolInfo,
        address market,
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount,
        uint24 protocolFeeRatio,
        bool isLiquidation
    )
        internal
        returns (
            uint256 oppositeAmount,
            uint256 protocolFee,
            IPerpdexMarketMinimum.SwapResponse memory rawResponse
        )
    {
        if (isExactInput) {
            if (isBaseToQuote) {
                rawResponse = IPerpdexMarketMinimum(market).swap(isBaseToQuote, isExactInput, amount, isLiquidation);
                oppositeAmount = rawResponse.oppositeAmount;
                protocolFee = oppositeAmount.mulRatio(protocolFeeRatio);
                oppositeAmount = oppositeAmount.sub(protocolFee);
            } else {
                protocolFee = amount.mulRatio(protocolFeeRatio);
                rawResponse = IPerpdexMarketMinimum(market).swap(
                    isBaseToQuote,
                    isExactInput,
                    amount.sub(protocolFee),
                    isLiquidation
                );
                oppositeAmount = rawResponse.oppositeAmount;
            }
        } else {
            if (isBaseToQuote) {
                protocolFee = amount.divRatio(PerpMath.subRatio(1e6, protocolFeeRatio)).sub(amount);
                rawResponse = IPerpdexMarketMinimum(market).swap(
                    isBaseToQuote,
                    isExactInput,
                    amount.add(protocolFee),
                    isLiquidation
                );
                oppositeAmount = rawResponse.oppositeAmount;
            } else {
                rawResponse = IPerpdexMarketMinimum(market).swap(isBaseToQuote, isExactInput, amount, isLiquidation);
                uint256 oppositeAmountWithoutFee = rawResponse.oppositeAmount;
                oppositeAmount = oppositeAmountWithoutFee.divRatio(PerpMath.subRatio(1e6, protocolFeeRatio));
                protocolFee = oppositeAmount.sub(oppositeAmountWithoutFee);
            }
        }

        protocolInfo.protocolFee = protocolInfo.protocolFee.add(protocolFee);
    }

    function processLiquidationReward(
        PerpdexStructs.VaultInfo storage vaultInfo,
        PerpdexStructs.VaultInfo storage liquidatorVaultInfo,
        PerpdexStructs.InsuranceFundInfo storage insuranceFundInfo,
        uint24 mmRatio,
        PerpdexStructs.LiquidationRewardConfig memory liquidationRewardConfig,
        uint256 exchangedQuote
    )
        internal
        returns (
            uint256 penalty,
            uint256 liquidationReward,
            uint256 insuranceFundReward
        )
    {
        penalty = exchangedQuote.mulRatio(mmRatio);
        liquidationReward = penalty.mulRatio(liquidationRewardConfig.rewardRatio);
        insuranceFundReward = penalty.sub(liquidationReward);

        (insuranceFundInfo.liquidationRewardBalance, liquidationReward) = _smoothLiquidationReward(
            insuranceFundInfo.liquidationRewardBalance,
            liquidationReward,
            liquidationRewardConfig.smoothEmaTime
        );

        vaultInfo.collateralBalance = vaultInfo.collateralBalance.sub(penalty.toInt256());
        liquidatorVaultInfo.collateralBalance = liquidatorVaultInfo.collateralBalance.add(liquidationReward.toInt256());
        insuranceFundInfo.balance = insuranceFundInfo.balance.add(insuranceFundReward);
    }

    function _smoothLiquidationReward(
        uint256 rewardBalance,
        uint256 reward,
        uint24 emaTime
    ) private pure returns (uint256 outputRewardBalance, uint256 outputReward) {
        rewardBalance = rewardBalance.add(reward);
        outputReward = rewardBalance.div(emaTime);
        outputRewardBalance = rewardBalance.sub(outputReward);
    }

    function previewSwapWithProtocolFee(
        address market,
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount,
        uint24 protocolFeeRatio,
        bool isLiquidation
    ) internal view returns (uint256 oppositeAmount, uint256 protocolFee) {
        if (isExactInput) {
            if (isBaseToQuote) {
                oppositeAmount = IPerpdexMarketMinimum(market).previewSwap(
                    isBaseToQuote,
                    isExactInput,
                    amount,
                    isLiquidation
                );
                protocolFee = oppositeAmount.mulRatio(protocolFeeRatio);
                oppositeAmount = oppositeAmount.sub(protocolFee);
            } else {
                protocolFee = amount.mulRatio(protocolFeeRatio);
                oppositeAmount = IPerpdexMarketMinimum(market).previewSwap(
                    isBaseToQuote,
                    isExactInput,
                    amount.sub(protocolFee),
                    isLiquidation
                );
            }
        } else {
            if (isBaseToQuote) {
                protocolFee = amount.divRatio(PerpMath.subRatio(1e6, protocolFeeRatio)).sub(amount);
                oppositeAmount = IPerpdexMarketMinimum(market).previewSwap(
                    isBaseToQuote,
                    isExactInput,
                    amount.add(protocolFee),
                    isLiquidation
                );
            } else {
                uint256 oppositeAmountWithoutFee =
                    IPerpdexMarketMinimum(market).previewSwap(isBaseToQuote, isExactInput, amount, isLiquidation);
                oppositeAmount = oppositeAmountWithoutFee.divRatio(PerpMath.subRatio(1e6, protocolFeeRatio));
                protocolFee = oppositeAmount.sub(oppositeAmountWithoutFee);
            }
        }
    }

    function maxSwapWithProtocolFee(
        address market,
        bool isBaseToQuote,
        bool isExactInput,
        uint24 protocolFeeRatio,
        bool isLiquidation
    ) internal view returns (uint256 amount) {
        amount = IPerpdexMarketMinimum(market).maxSwap(isBaseToQuote, isExactInput, isLiquidation);

        if (isExactInput) {
            if (isBaseToQuote) {} else {
                amount = amount.divRatio(PerpMath.subRatio(1e6, protocolFeeRatio));
            }
        } else {
            if (isBaseToQuote) {
                amount = amount.mulRatio(PerpMath.subRatio(1e6, protocolFeeRatio));
            } else {}
        }
    }

    function validateSlippage(
        bool isExactInput,
        uint256 oppositeAmount,
        uint256 oppositeAmountBound
    ) internal pure {
        if (isExactInput) {
            require(oppositeAmount >= oppositeAmountBound, "TL_VS: too small opposite amount");
        } else {
            require(oppositeAmount <= oppositeAmountBound, "TL_VS: too large opposite amount");
        }
    }

    function swapResponseToBaseQuote(
        bool isBaseToQuote,
        bool isExactInput,
        uint256 amount,
        uint256 oppositeAmount
    ) internal pure returns (int256, int256) {
        if (isExactInput) {
            if (isBaseToQuote) {
                return (amount.neg256(), oppositeAmount.toInt256());
            } else {
                return (oppositeAmount.toInt256(), amount.neg256());
            }
        } else {
            if (isBaseToQuote) {
                return (oppositeAmount.neg256(), amount.toInt256());
            } else {
                return (amount.toInt256(), oppositeAmount.neg256());
            }
        }
    }

    function _validateTrade(
        PerpdexStructs.AccountInfo storage accountInfo,
        address market,
        bool isSelf,
        uint24 mmRatio,
        bool ignoreMakerOrderBookExistence
    ) private view returns (bool isLiquidation) {
        isLiquidation = !AccountLibrary.hasEnoughMaintenanceMargin(accountInfo, mmRatio);

        if (!isSelf) {
            require(isLiquidation, "TL_VT: enough mm");
        }

        if (!ignoreMakerOrderBookExistence && isLiquidation) {
            require(accountInfo.makerInfos[market].liquidity == 0, "TL_VT: no maker when liquidation");
            require(accountInfo.limitOrderInfos[market].ask.root == 0, "TL_VT: no ask when liquidation");
            require(accountInfo.limitOrderInfos[market].bid.root == 0, "TL_VT: no bid when liquidation");
        }
    }
}
