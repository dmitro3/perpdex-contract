// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { PerpdexStructs } from "../lib/PerpdexStructs.sol";

interface IPerpdexExchange {
    struct AddLiquidityParams {
        address market;
        uint256 base;
        uint256 quote;
        uint256 minBase;
        uint256 minQuote;
        uint256 deadline;
    }

    struct RemoveLiquidityParams {
        address trader;
        address market;
        uint256 liquidity;
        uint256 minBase;
        uint256 minQuote;
        uint256 deadline;
    }

    struct TradeParams {
        address trader;
        address market;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint256 deadline;
    }

    struct PreviewTradeParams {
        address trader;
        address market;
        address caller;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
    }

    struct MaxTradeParams {
        address trader;
        address market;
        address caller;
        bool isBaseToQuote;
        bool isExactInput;
    }

    struct CreateLimitOrderParams {
        address market;
        bool isBid;
        uint256 base;
        uint256 priceX96;
        uint256 deadline;
        PerpdexStructs.LimitOrderType limitOrderType;
    }

    struct CancelLimitOrderParams {
        address market;
        bool isBid;
        uint40 orderId;
        uint256 deadline;
    }

    event CollateralCompensated(address indexed trader, uint256 amount);
    event Deposited(address indexed trader, uint256 amount);
    event Withdrawn(address indexed trader, uint256 amount);
    event ProtocolFeeTransferred(address indexed trader, uint256 amount);

    event LiquidityAdded(
        address indexed trader,
        address indexed market,
        uint256 base,
        uint256 quote,
        uint256 liquidity,
        uint256 cumBasePerLiquidityX96,
        uint256 cumQuotePerLiquidityX96
    );

    event LiquidityRemoved(
        address indexed trader,
        address indexed market,
        address liquidator,
        uint256 base,
        uint256 quote,
        uint256 liquidity,
        int256 takerBase,
        int256 takerQuote,
        int256 realizedPnl
    );

    event PositionLiquidated(
        address indexed trader,
        address indexed market,
        address indexed liquidator,
        int256 base,
        int256 quote,
        int256 realizedPnl,
        uint256 protocolFee,
        uint256 baseBalancePerShareX96,
        uint256 sharePriceAfterX96,
        uint256 liquidationPenalty,
        uint256 liquidationReward,
        uint256 insuranceFundReward
    );

    event PositionChanged(
        address indexed trader,
        address indexed market,
        int256 base,
        int256 quote,
        int256 realizedPnl,
        uint256 protocolFee,
        uint256 baseBalancePerShareX96,
        uint256 sharePriceAfterX96
    );

    event LimitOrderCreated(
        address indexed trader,
        address indexed market,
        bool isBid,
        uint256 base,
        uint256 priceX96,
        PerpdexStructs.LimitOrderType limitOrderType,
        uint256 orderId,
        uint256 baseTaker
    );

    event LimitOrderCanceled(
        address indexed trader,
        address indexed market,
        address indexed liquidator,
        bool isBid,
        uint256 orderId
    );

    event PartiallyExecuted(
        address indexed maker,
        address indexed market,
        bool isBid,
        uint256 basePartial,
        uint256 quotePartial,
        int256 partialRealizedPnl
    );

    event LimitOrderSettled(
        address indexed trader,
        address indexed market,
        int256 base,
        int256 quote,
        int256 realizedPnl
    );

    event MarketClosed(address indexed trader, address indexed market, int256 realizedPnl);

    event MaxMarketsPerAccountChanged(uint8 value);
    event MaxOrdersPerAccountChanged(uint8 value);
    event ImRatioChanged(uint24 value);
    event MmRatioChanged(uint24 value);
    event LiquidationRewardConfigChanged(uint24 rewardRatio, uint16 smoothEmaTime);
    event ProtocolFeeRatioChanged(uint24 value);
    event MarketStatusChanged(address indexed market, PerpdexStructs.MarketStatus status);

    function deposit(uint256 amount) external payable;

    function withdraw(uint256 amount) external;

    function transferProtocolFee(uint256 amount) external;

    function addLiquidity(AddLiquidityParams calldata params)
        external
        returns (
            uint256 base,
            uint256 quote,
            uint256 liquidity
        );

    function removeLiquidity(RemoveLiquidityParams calldata params) external returns (uint256 base, uint256 quote);

    function createLimitOrder(CreateLimitOrderParams calldata params)
        external
        returns (
            uint40 orderId,
            uint256 baseTaker,
            uint256 quoteTaker
        );

    function cancelLimitOrder(CancelLimitOrderParams calldata params) external;

    function trade(TradeParams calldata params) external returns (uint256 oppositeAmount);

    // setters

    function setMaxMarketsPerAccount(uint8 value) external;

    function setImRatio(uint24 value) external;

    function setMmRatio(uint24 value) external;

    function setLiquidationRewardConfig(PerpdexStructs.LiquidationRewardConfig calldata value) external;

    function setProtocolFeeRatio(uint24 value) external;

    function setMarketStatus(address market, PerpdexStructs.MarketStatus status) external;

    // dry run getters

    function previewTrade(PreviewTradeParams calldata params) external view returns (uint256 oppositeAmount);

    function maxTrade(MaxTradeParams calldata params) external view returns (uint256 amount);

    // default getters

    function accountInfos(address trader)
        external
        view
        returns (PerpdexStructs.VaultInfo memory, uint8 limitOrderCount);

    function insuranceFundInfo() external view returns (uint256 balance, uint256 liquidationRewardBalance);

    function protocolInfo() external view returns (uint256 protocolFee);

    function settlementToken() external view returns (address);

    function quoteDecimals() external view returns (uint8);

    function maxMarketsPerAccount() external view returns (uint8);

    function imRatio() external view returns (uint24);

    function mmRatio() external view returns (uint24);

    function liquidationRewardConfig() external view returns (uint24 rewardRatio, uint16 smoothEmaTime);

    function protocolFeeRatio() external view returns (uint24);

    function marketStatuses(address market) external view returns (PerpdexStructs.MarketStatus status);

    // getters not covered by default getters

    function getTakerInfo(address trader, address market) external view returns (PerpdexStructs.TakerInfo memory);

    function getMakerInfo(address trader, address market) external view returns (PerpdexStructs.MakerInfo memory);

    function getAccountMarkets(address trader) external view returns (address[] memory);

    function getLimitOrderInfo(address trader, address market)
        external
        view
        returns (
            uint40 askRoot,
            uint40 bidRoot,
            uint256 totalBaseAsk,
            uint256 totalBaseBid
        );

    function getLimitOrderIds(
        address trader,
        address market,
        bool isBid
    ) external view returns (uint40[] memory);

    // convenient getters

    function getTotalAccountValue(address trader) external view returns (int256);

    function getPositionShare(address trader, address market) external view returns (int256);

    function getPositionNotional(address trader, address market) external view returns (int256);

    function getTotalPositionNotional(address trader) external view returns (uint256);

    function getOpenPositionShare(address trader, address market) external view returns (uint256);

    function getOpenPositionNotional(address trader, address market) external view returns (uint256);

    function getTotalOpenPositionNotional(address trader) external view returns (uint256);

    function hasEnoughMaintenanceMargin(address trader) external view returns (bool);

    function hasEnoughInitialMargin(address trader) external view returns (bool);

    function isLiquidationFree(address trader) external view returns (bool);

    function getLimitOrderSummaries(
        address trader,
        address market,
        bool isBid
    ) external view returns (PerpdexStructs.LimitOrderSummary[] memory);
}
