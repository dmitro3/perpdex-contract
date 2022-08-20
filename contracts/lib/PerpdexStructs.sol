// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;

import {
    BokkyPooBahsRedBlackTreeLibrary as RBTreeLibrary
} from "../../deps/BokkyPooBahsRedBlackTreeLibrary/contracts/BokkyPooBahsRedBlackTreeLibrary.sol";

library PerpdexStructs {
    enum MarketStatus { NotAllowed, Open, Closed }

    struct TakerInfo {
        int256 baseBalanceShare;
        int256 quoteBalance;
    }

    struct MakerInfo {
        uint256 liquidity;
        uint256 cumBaseSharePerLiquidityX96;
        uint256 cumQuotePerLiquidityX96;
    }

    struct LimitOrderInfo {
        RBTreeLibrary.Tree ask;
        RBTreeLibrary.Tree bid;
        uint256 totalBaseAsk;
        uint256 totalBaseBid;
    }

    struct VaultInfo {
        int256 collateralBalance;
    }

    struct AccountInfo {
        // market
        mapping(address => TakerInfo) takerInfos;
        // market
        mapping(address => MakerInfo) makerInfos;
        // market
        mapping(address => LimitOrderInfo) limitOrderInfos;
        VaultInfo vaultInfo;
        address[] markets;
        uint8 limitOrderCount;
    }

    struct InsuranceFundInfo {
        uint256 balance; // for easy calculation
        uint256 liquidationRewardBalance;
    }

    struct ProtocolInfo {
        uint256 protocolFee;
    }

    struct LiquidationRewardConfig {
        uint24 rewardRatio;
        uint16 smoothEmaTime;
    }

    struct LimitOrderSummary {
        uint40 orderId;
        uint256 base;
        uint256 priceX96;
    }
}
