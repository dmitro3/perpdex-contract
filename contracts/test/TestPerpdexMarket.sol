// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { PerpdexMarket } from "../PerpdexMarket.sol";
import { MarketStructs } from "../lib/MarketStructs.sol";
import { PoolLibrary } from "../lib/PoolLibrary.sol";
import { PerpMath } from "../lib/PerpMath.sol";

contract TestPerpdexMarket is PerpdexMarket {
    using PerpMath for int256;
    using PerpMath for uint256;
    using SafeCast for uint256;
    using SignedSafeMath for int256;

    constructor(
        string memory symbolArg,
        address exchangeArg,
        address priceFeedBaseArg,
        address priceFeedQuoteArg
    ) PerpdexMarket(msg.sender, symbolArg, exchangeArg, priceFeedBaseArg, priceFeedQuoteArg) {}

    function processFunding() external {
        _processFunding();
    }

    function setFundingInfo(MarketStructs.FundingInfo memory value) external {
        fundingInfo = value;
    }

    function setPoolInfo(MarketStructs.PoolInfo memory value) external {
        poolInfo = value;
    }

    function setPriceLimitInfo(MarketStructs.PriceLimitInfo memory value) external {
        priceLimitInfo = value;
    }

    function setPoolFeeInfo(MarketStructs.PoolFeeInfo memory value) external {
        poolFeeInfo = value;
    }

    function getLockedLiquidityInfo() external view returns (int256 base, int256 accountValue) {
        uint256 liquidity = PoolLibrary.MINIMUM_LIQUIDITY;

        if (poolInfo.totalLiquidity == 0) return (0, 0);

        (uint256 poolBase, uint256 poolQuote) = PoolLibrary.getLiquidityValue(poolInfo, liquidity);
        (int256 delBase, int256 delQuote) =
            PoolLibrary.getLiquidityDeleveraged(
                poolInfo.cumBasePerLiquidityX96,
                poolInfo.cumQuotePerLiquidityX96,
                liquidity,
                0,
                0
            );

        base = poolBase.toInt256().add(delBase);
        int256 quote = poolQuote.toInt256().add(delQuote);
        accountValue = quote.add(base.mulDiv(getShareMarkPriceX96().toInt256(), FixedPoint96.Q96));
    }

    // Calling this method breaks the integrity of the tree.
    // So after calling this, only some getters can be used.
    function markFullyExecuted(
        bool isBid,
        uint40 key,
        uint48 executionId,
        uint256 baseBalancePerShareX96
    ) external {
        if (executionId == 0) return;

        if (isBid) {
            _orderBookInfo.bid.orderInfos[key].executionId = executionId;
            _orderBookInfo.bid.tree.root = 0;
            _orderBookInfo.bid.tree.nodes[_orderBookInfo.bid.tree.nodes[key].left].parent = 0;
            _orderBookInfo.bid.tree.nodes[_orderBookInfo.bid.tree.nodes[key].right].parent = 0;
        } else {
            _orderBookInfo.ask.orderInfos[key].executionId = executionId;
            _orderBookInfo.ask.tree.root = 0;
            _orderBookInfo.ask.tree.nodes[_orderBookInfo.ask.tree.nodes[key].left].parent = 0;
            _orderBookInfo.ask.tree.nodes[_orderBookInfo.ask.tree.nodes[key].right].parent = 0;
        }
        _orderBookInfo.executionInfos[executionId].baseBalancePerShareX96 = baseBalancePerShareX96;
    }
}
