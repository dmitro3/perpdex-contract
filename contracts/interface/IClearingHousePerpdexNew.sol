// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { PerpdexStructs } from "../lib/PerpdexStructs.sol";

interface IClearingHousePerpdexNew {
    struct AddLiquidityParams {
        address market;
        uint256 base;
        uint256 quote;
        uint256 minBase;
        uint256 minQuote;
        uint256 deadline;
    }

    struct RemoveLiquidityParams {
        address market;
        uint256 liquidity;
        uint256 minBase;
        uint256 minQuote;
        uint256 deadline;
    }

    struct AddLiquidityResponse {
        uint256 base;
        uint256 quote;
        uint256 liquidity;
    }

    struct RemoveLiquidityResponse {
        uint256 base;
        uint256 quote;
    }

    struct OpenPositionParams {
        address market;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint256 deadline;
    }

    struct LiquidateParams {
        address trader;
        address market;
        uint256 amount;
        uint256 oppositeAmountBound;
        uint256 deadline;
    }

    event PositionLiquidated(
        address indexed trader,
        address indexed market,
        uint256 positionNotional,
        uint256 positionSize,
        uint256 liquidationFee,
        address liquidator
    );

    event LiquidityChanged(address indexed maker, address indexed market, int256 base, int256 quote, int256 liquidity);

    event PositionChanged(
        address indexed trader,
        address indexed market,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional,
        int256 openNotional,
        int256 realizedPnl,
        uint256 priceAfterX96
    );

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function addLiquidity(AddLiquidityParams calldata params) external returns (AddLiquidityResponse memory);

    function removeLiquidity(RemoveLiquidityParams calldata params)
        external
        returns (RemoveLiquidityResponse memory response);

    function removeLiquidity(RemoveLiquidityParams calldata params, address maker)
        external
        returns (RemoveLiquidityResponse memory response);

    function openPosition(OpenPositionParams calldata params) external returns (int256 base, int256 quote);

    function liquidate(LiquidateParams calldata params) external returns (int256 base, int256 quote);

    function setPriceLimitConfig(PerpdexStructs.PriceLimitConfig calldata value) external;

    function setMaxMarketsPerAccount(uint8 value) external;

    function setImRatio(uint24 value) external;

    function setMmRatio(uint24 value) external;

    function setLiquidationRewardRatio(uint24 value) external;

    function setMaxFundingRateRatio(uint24 value) external;

    function setIsMarketAllowed(address market, bool value) external;

    // TODO: raw default getters

    // convenient getters

    function getTotalAccountValue(address trader) external view returns (int256);

    function getPositionSize(address trader, address market) external view returns (int256);

    function getPositionNotional(address trader, address market) external view returns (int256);

    function getTotalPositionNotional(address trader) external view returns (uint256);

    function getOpenPositionSize(address trader, address market) external view returns (uint256);

    function getOpenPositionNotional(address trader, address market) external view returns (uint256);

    function getTotalOpenPositionNotional(address trader) external view returns (uint256);

    function hasEnoughMaintenanceMargin(address trader) external view returns (bool);

    function hasEnoughInitialMargin(address trader) external view returns (bool);
}
