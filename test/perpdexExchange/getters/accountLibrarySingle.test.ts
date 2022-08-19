import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../fixtures"
import { BigNumber, Wallet } from "ethers"
import { MarketStatus } from "../../helper/types"

describe("PerpdexExchange getters", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet

    const Q96 = BigNumber.from(2).pow(96)

    beforeEach(async () => {
        fixture = await loadFixture(
            createPerpdexExchangeFixture({
                isMarketAllowed: true,
            }),
        )
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
    })

    describe("AccountLibrary getters single market", () => {
        ;[
            {
                title: "empty pool, zero",
                collateralBalance: 0,
                poolInfo: {
                    base: 0,
                    quote: 0,
                    totalLiquidity: 0,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 0,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 0,
                openPositionNotional: 0,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "empty pool, no position",
                collateralBalance: 100,
                poolInfo: {
                    base: 0,
                    quote: 0,
                    totalLiquidity: 0,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 100,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 0,
                openPositionNotional: 0,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "empty pool, negative collateral",
                collateralBalance: -50,
                poolInfo: {
                    base: 0,
                    quote: 0,
                    totalLiquidity: 0,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: -50,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 0,
                openPositionNotional: 0,
                hasEnoughMaintenanceMargin: false,
                hasEnoughInitialMargin: false,
                isLiquidationFree: false,
            },
            {
                title: "zero",
                collateralBalance: 0,
                poolInfo: {
                    base: 10000,
                    quote: 10000,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 0,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 0,
                openPositionNotional: 0,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "no position",
                collateralBalance: 100,
                poolInfo: {
                    base: 10000,
                    quote: 10000,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 100,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 0,
                openPositionNotional: 0,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "negative collateral",
                collateralBalance: -50,
                poolInfo: {
                    base: 10000,
                    quote: 10000,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: -50,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 0,
                openPositionNotional: 0,
                hasEnoughMaintenanceMargin: false,
                hasEnoughInitialMargin: false,
                isLiquidationFree: false,
            },
            {
                title: "long",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -100,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 100,
                positionShare: 25,
                positionNotional: 100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "short",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: -25,
                    quoteBalance: 100,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 100,
                positionShare: -25,
                positionNotional: -100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "long profit",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -50,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 150,
                positionShare: 25,
                positionNotional: 100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "long profit",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -50,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96.mul(2),
                },
                totalAccountValue: 150,
                positionShare: 25,
                positionNotional: 100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "long loss",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -200,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 0,
                positionShare: 25,
                positionNotional: 100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: false,
                hasEnoughInitialMargin: false,
                isLiquidationFree: false,
            },
            {
                title: "short profit",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: -25,
                    quoteBalance: 150,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 150,
                positionShare: -25,
                positionNotional: -100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "short loss",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: -25,
                    quoteBalance: 0,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 0,
                positionShare: -25,
                positionNotional: -100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: false,
                hasEnoughInitialMargin: false,
                isLiquidationFree: false,
            },
            {
                title: "long negative",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -250,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: -50,
                positionShare: 25,
                positionNotional: 100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: false,
                hasEnoughInitialMargin: false,
                isLiquidationFree: false,
            },
            {
                title: "maker",
                collateralBalance: 100,
                makerInfo: {
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 25
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 100
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 100,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "maker long",
                collateralBalance: 100,
                makerInfo: {
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 25
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 100
                },
                poolInfo: {
                    base: 20000,
                    quote: 20000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 75,
                positionShare: 25,
                positionNotional: 25,
                openPositionShare: 75,
                openPositionNotional: 75,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "maker long + closeMarket",
                collateralBalance: 100,
                makerInfo: {
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 25
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 100
                },
                poolInfo: {
                    base: 20000,
                    quote: 20000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                closeMarket: true,
                getCollateralBalance: 75,
                totalAccountValue: 75,
                positionShare: 25,
                positionNotional: 25,
                totalPositionNotional: 0,
                openPositionShare: 75,
                openPositionNotional: 75,
                totalOpenPositionNotional: 0,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "maker long rebase",
                collateralBalance: 100,
                makerInfo: {
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 25
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 100
                },
                poolInfo: {
                    base: 20000,
                    quote: 20000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96.div(2),
                },
                totalAccountValue: 75,
                positionShare: 25,
                positionNotional: 25,
                openPositionShare: 75,
                openPositionNotional: 75,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "maker short",
                collateralBalance: 100,
                makerInfo: {
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: Q96, // debt 50
                    cumQuotePerLiquidityX96: Q96, // debt 50
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 50,
                positionShare: -25,
                positionNotional: -100,
                openPositionShare: 50,
                openPositionNotional: 200,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "maker + taker",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -100,
                },
                makerInfo: {
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: Q96, // debt 50
                    cumQuotePerLiquidityX96: Q96, // debt 50
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 50,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "maker not enough im",
                collateralBalance: 9,
                makerInfo: {
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 25
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 100
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 9,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: false,
                isLiquidationFree: false,
            },
            {
                title: "maker deleverage",
                collateralBalance: 100,
                makerInfo: {
                    liquidity: 50,
                    cumBaseSharePerLiquidityX96: Q96.mul(10).add(
                        Q96.div(2), // debt 25
                    ),
                    cumQuotePerLiquidityX96: Q96.mul(20).add(
                        Q96.mul(2), // debt 100
                    ),
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: Q96.mul(11),
                    cumQuotePerLiquidityX96: Q96.mul(22),
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 100 + 50 * 4 + 100,
                positionShare: 50,
                positionNotional: 200,
                openPositionShare: 75,
                openPositionNotional: 300,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "profit and no collateral but liquidation free",
                collateralBalance: 0,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: 0,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 100,
                positionShare: 25,
                positionNotional: 100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "profit and no collateral and not liquidation free",
                collateralBalance: -1,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: 0,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 99,
                positionShare: 25,
                positionNotional: 100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: false,
                isLiquidationFree: false,
            },
            {
                title: "rounding",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 100,
                    quoteBalance: 0,
                },
                poolInfo: {
                    base: 3,
                    quote: 1,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 133,
                positionShare: 100,
                positionNotional: 33,
                openPositionShare: 100,
                openPositionNotional: 33,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "rounding 2",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: -100,
                    quoteBalance: 0,
                },
                poolInfo: {
                    base: 3,
                    quote: 1,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 67,
                positionShare: -100,
                positionNotional: -33,
                openPositionShare: 100,
                openPositionNotional: 33,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "liquidation free",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 1,
                    quoteBalance: -100,
                },
                poolInfo: {
                    base: Q96,
                    quote: 1,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 0,
                positionShare: 1,
                positionNotional: 0,
                openPositionShare: 1,
                openPositionNotional: 0,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "liquidation free 2",
                collateralBalance: Q96,
                takerInfo: {
                    baseBalanceShare: Q96,
                    quoteBalance: Q96.mul(-1),
                },
                poolInfo: {
                    base: Q96,
                    quote: 1,
                    totalLiquidity: 10000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 1,
                positionShare: Q96,
                positionNotional: 1,
                openPositionShare: Q96,
                openPositionNotional: 1,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "liquidation free maker",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 50,
                    quoteBalance: -50,
                },
                makerInfo: {
                    liquidity: 1,
                    cumBaseSharePerLiquidityX96: Q96.mul(50), // debt 50
                    cumQuotePerLiquidityX96: Q96.mul(50), // debt 50
                },
                poolInfo: {
                    base: Q96,
                    quote: 1,
                    totalLiquidity: Q96,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                totalAccountValue: 0,
                positionShare: 1,
                positionNotional: 0,
                openPositionShare: 2,
                openPositionNotional: 0,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "bid",
                collateralBalance: 100,
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96,
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                totalAccountValue: 100,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 100,
                openPositionNotional: 400,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "bid executed",
                collateralBalance: 100,
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                getTakerInfoLazy: {
                    baseBalanceShare: 100,
                    quoteBalance: -100,
                },
                totalAccountValue: 400,
                positionShare: 100,
                positionNotional: 400,
                openPositionShare: 100,
                openPositionNotional: 400,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "ask",
                collateralBalance: 100,
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(5),
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                totalAccountValue: 100,
                positionShare: 0,
                positionNotional: 0,
                openPositionShare: 100,
                openPositionNotional: 400,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "ask executed",
                collateralBalance: 100,
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(5),
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                getTakerInfoLazy: {
                    baseBalanceShare: -100,
                    quoteBalance: 500,
                },
                totalAccountValue: 200,
                positionShare: -100,
                positionNotional: -400,
                openPositionShare: 100,
                openPositionNotional: 400,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "multiple orders",
                collateralBalance: 100,
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96.div(2),
                    },
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(5),
                        executionId: 2,
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96,
                        executionId: 3,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 50,
                        priceX96: Q96.mul(5),
                        executionId: 4,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: true,
                        base: 50,
                        priceX96: Q96,
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                getTakerInfoLazy: {
                    baseBalanceShare: 50,
                    quoteBalance: -50,
                },
                getCollateralBalance: 1250,
                totalAccountValue: 1400,
                positionShare: 50,
                positionNotional: 200,
                openPositionShare: 100,
                openPositionNotional: 400,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                // TODO: separate closeMarket test
                title: "multiple orders + closeMarket",
                collateralBalance: 100,
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96.div(2),
                    },
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(5),
                        executionId: 2,
                        baseBalancePerShareX96: Q96.mul(2),
                    },
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96,
                        executionId: 3,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: false,
                        base: 50,
                        priceX96: Q96.mul(5),
                        executionId: 4,
                        baseBalancePerShareX96: Q96,
                    },
                    {
                        isBid: true,
                        base: 50,
                        priceX96: Q96,
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                closeMarket: true,
                getTakerInfoLazy: {
                    baseBalanceShare: 50,
                    quoteBalance: -50,
                },
                getCollateralBalance: 1400,
                totalAccountValue: 1400,
                positionShare: 50,
                positionNotional: 200,
                totalPositionNotional: 0,
                openPositionShare: 100,
                openPositionNotional: 400,
                totalOpenPositionNotional: 0,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "long + ask executed",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -100,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: false,
                        base: 100,
                        priceX96: Q96.mul(5),
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                getTakerInfoLazy: {
                    baseBalanceShare: -75,
                    quoteBalance: 375,
                },
                getCollateralBalance: 125,
                totalAccountValue: 200,
                positionShare: -75,
                positionNotional: -300,
                openPositionShare: 75,
                openPositionNotional: 300,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "short + bid executed",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: -25,
                    quoteBalance: 100,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: true,
                        base: 100,
                        priceX96: Q96,
                        executionId: 1,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                getTakerInfoLazy: {
                    baseBalanceShare: 75,
                    quoteBalance: -75,
                },
                getCollateralBalance: 175,
                totalAccountValue: 400,
                positionShare: 75,
                positionNotional: 300,
                openPositionShare: 75,
                openPositionNotional: 300,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "long + ask liquidation free",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -100,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: false,
                        base: 25,
                        priceX96: Q96.mul(5),
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                getCollateralBalance: 100,
                totalAccountValue: 100,
                positionShare: 25,
                positionNotional: 100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: true,
            },
            {
                title: "short + bid not liquidation free",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: -25,
                    quoteBalance: 100,
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: true,
                        base: 25,
                        priceX96: Q96,
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                getCollateralBalance: 100,
                totalAccountValue: 100,
                positionShare: -25,
                positionNotional: -100,
                openPositionShare: 25,
                openPositionNotional: 100,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "long + maker + bid",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: 25,
                    quoteBalance: -100,
                },
                makerInfo: {
                    liquidity: 200,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 100
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 400
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: true,
                        base: 50,
                        priceX96: Q96,
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                getCollateralBalance: 100,
                totalAccountValue: 100,
                positionShare: 25,
                positionNotional: 100,
                openPositionShare: 175,
                openPositionNotional: 700,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
            {
                title: "short + maker + ask",
                collateralBalance: 100,
                takerInfo: {
                    baseBalanceShare: -25,
                    quoteBalance: 100,
                },
                makerInfo: {
                    liquidity: 200,
                    cumBaseSharePerLiquidityX96: Q96.div(2), // debt 100
                    cumQuotePerLiquidityX96: Q96.mul(2), // debt 400
                },
                poolInfo: {
                    base: 10000,
                    quote: 40000,
                    totalLiquidity: 20000,
                    cumBasePerLiquidityX96: 0,
                    cumQuotePerLiquidityX96: 0,
                    baseBalancePerShareX96: Q96,
                },
                orders: [
                    {
                        isBid: false,
                        base: 50,
                        priceX96: Q96.mul(5),
                        executionId: 0,
                        baseBalancePerShareX96: Q96,
                    },
                ],
                getCollateralBalance: 100,
                totalAccountValue: 100,
                positionShare: -25,
                positionNotional: -100,
                openPositionShare: 175,
                openPositionNotional: 700,
                hasEnoughMaintenanceMargin: true,
                hasEnoughInitialMargin: true,
                isLiquidationFree: false,
            },
        ].forEach(test => {
            describe(test.title, () => {
                beforeEach(async () => {
                    await exchange.connect(owner).setImRatio(10e4)
                    await exchange.connect(owner).setMmRatio(5e4)

                    await exchange.setAccountInfo(
                        alice.address,
                        {
                            collateralBalance: test.collateralBalance,
                        },
                        [market.address],
                    )

                    if (test.takerInfo) {
                        await exchange.setTakerInfo(alice.address, market.address, test.takerInfo)
                    }
                    if (test.makerInfo) {
                        await exchange.setMakerInfo(alice.address, market.address, test.makerInfo)
                    }

                    await market.setPoolInfo(test.poolInfo)

                    if ((test.orders || []).length > 0) {
                        await exchange.connect(alice).createLimitOrdersForTest(test.orders, market.address)
                    }

                    if (test.closeMarket) {
                        await exchange.connect(owner).setMarketStatus(market.address, MarketStatus.Closed)
                        await exchange.connect(alice).closeMarket(market.address)
                    }
                })

                const assert = async () => {
                    const takerInfo = await exchange.getTakerInfoLazy(alice.address, market.address)
                    const expectedTakerInfo = test.getTakerInfoLazy || test.takerInfo
                    expect(takerInfo.baseBalanceShare).to.eq(expectedTakerInfo?.baseBalanceShare || 0)
                    expect(takerInfo.quoteBalance).to.eq(expectedTakerInfo?.quoteBalance || 0)
                    expect(await exchange.getCollateralBalance(alice.address)).to.eq(
                        test.getCollateralBalance || test.collateralBalance,
                    )
                    expect(await exchange.getTotalAccountValue(alice.address)).to.eq(test.totalAccountValue)
                    expect(await exchange.getPositionShare(alice.address, market.address)).to.eq(test.positionShare)
                    expect(await exchange.getPositionNotional(alice.address, market.address)).to.eq(
                        test.positionNotional,
                    )
                    expect(await exchange.getTotalPositionNotional(alice.address)).to.eq(
                        test.totalPositionNotional !== void 0
                            ? test.totalPositionNotional
                            : Math.abs(test.positionNotional),
                    )
                    expect(await exchange.getOpenPositionShare(alice.address, market.address)).to.eq(
                        test.openPositionShare,
                    )
                    expect(await exchange.getOpenPositionNotional(alice.address, market.address)).to.eq(
                        test.openPositionNotional,
                    )
                    expect(await exchange.getTotalOpenPositionNotional(alice.address)).to.eq(
                        test.totalOpenPositionNotional !== void 0
                            ? test.totalOpenPositionNotional
                            : test.openPositionNotional,
                    )
                    expect(await exchange.hasEnoughMaintenanceMargin(alice.address)).to.eq(
                        test.hasEnoughMaintenanceMargin,
                    )
                    expect(await exchange.hasEnoughInitialMargin(alice.address)).to.eq(test.hasEnoughInitialMargin)
                    expect(await exchange.isLiquidationFree(alice.address)).to.eq(test.isLiquidationFree)
                }

                it("before settlement", async () => {
                    await assert()
                })

                it("after settlement", async () => {
                    await exchange.settleLimitOrders(alice.address)
                    await assert()
                })
            })
        })
    })
})
