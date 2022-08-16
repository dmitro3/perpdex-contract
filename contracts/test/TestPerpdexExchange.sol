// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { PerpdexExchange } from "../PerpdexExchange.sol";
import { PerpdexStructs } from "../lib/PerpdexStructs.sol";
import { MakerOrderBookLibrary } from "../lib/MakerOrderBookLibrary.sol";
import { TestPerpdexMarket } from "./TestPerpdexMarket.sol";

contract TestPerpdexExchange is PerpdexExchange {
    constructor(address settlementTokenArg) PerpdexExchange(settlementTokenArg) {}

    function setAccountInfo(
        address trader,
        PerpdexStructs.VaultInfo memory vaultInfo,
        address[] memory markets
    ) external {
        accountInfos[trader].vaultInfo = vaultInfo;
        accountInfos[trader].markets = markets;
    }

    function setTakerInfo(
        address trader,
        address market,
        PerpdexStructs.TakerInfo memory takerInfo
    ) external {
        accountInfos[trader].takerInfos[market] = takerInfo;
    }

    function setMakerInfo(
        address trader,
        address market,
        PerpdexStructs.MakerInfo memory makerInfo
    ) external {
        accountInfos[trader].makerInfos[market] = makerInfo;
    }

    function setInsuranceFundInfo(PerpdexStructs.InsuranceFundInfo memory insuranceFundInfoArg) external {
        insuranceFundInfo = insuranceFundInfoArg;
    }

    function setProtocolInfo(PerpdexStructs.ProtocolInfo memory protocolInfoArg) external {
        protocolInfo = protocolInfoArg;
    }

    function setIsMarketAllowedForce(address market, bool value) external {
        isMarketAllowed[market] = value;
    }

    function settleLimitOrders(address trader) external {
        _settleLimitOrders(trader);
    }

    struct CreateLimitOrdersForTestParams {
        bool isBid;
        uint256 base;
        uint256 priceX96;
        uint48 executionId;
    }

    function createLimitOrdersForTest(CreateLimitOrdersForTestParams[] calldata paramsList, address market) external {
        address trader = msg.sender;
        int256 collateralBalance = accountInfos[trader].vaultInfo.collateralBalance;
        accountInfos[trader].vaultInfo.collateralBalance = 1 << 128;

        uint40[256] memory orderIds;
        for (uint256 i = 0; i < paramsList.length; ++i) {
            CreateLimitOrdersForTestParams memory params = paramsList[i];

            orderIds[i] = MakerOrderBookLibrary.createLimitOrder(
                accountInfos[trader],
                MakerOrderBookLibrary.CreateLimitOrderParams({
                    market: market,
                    isBid: params.isBid,
                    base: params.base,
                    priceX96: params.priceX96,
                    imRatio: imRatio,
                    maxMarketsPerAccount: maxMarketsPerAccount,
                    maxOrdersPerAccount: maxOrdersPerAccount
                })
            );
            orderIdToTrader[market][params.isBid][orderIds[i]] = trader;
        }

        for (uint256 i = 0; i < paramsList.length; ++i) {
            CreateLimitOrdersForTestParams memory params = paramsList[i];
            TestPerpdexMarket(market).markFullyExecuted(params.isBid, orderIds[i], params.executionId);
        }

        accountInfos[trader].vaultInfo.collateralBalance = collateralBalance;
    }
}
