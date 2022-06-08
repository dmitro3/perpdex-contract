// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { PriceLimitLibrary } from "../lib/PriceLimitLibrary.sol";
import { MarketStructs } from "../lib/MarketStructs.sol";

contract TestPriceLimitLibrary {
    constructor() {}

    MarketStructs.PriceLimitInfo public priceLimitInfo;
    MarketStructs.PriceLimitConfig public priceLimitConfig;

    function setPriceLimitInfo(address market, MarketStructs.PriceLimitInfo memory value) external {
        priceLimitInfo = value;
    }

    function setPriceLimitConfig(address market, MarketStructs.PriceLimitConfig memory value) external {
        priceLimitConfig = value;
    }

    function check(
        uint256 priceBefore,
        uint256 priceAfter,
        bool isLiquidation
    )
        external
        view
        returns (
            uint256 referencePrice,
            uint256 referenceTimestamp,
            uint256 emaPrice
        )
    {
        return PriceLimitLibrary.check(priceLimitInfo, priceLimitConfig, priceBefore, priceAfter, isLiquidation);
    }

    function isWithinPriceLimit(
        uint256 referencePrice,
        uint256 price,
        uint24 priceLimitRatio
    ) external pure returns (bool) {
        return PriceLimitLibrary.isWithinPriceLimit(referencePrice, price, priceLimitRatio);
    }
}
