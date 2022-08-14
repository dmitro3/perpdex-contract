import { expect } from "chai"
import { waffle } from "hardhat"
import { PerpdexMarket } from "../../typechain"
import { createPerpdexMarketFixture } from "./fixtures"
import { BigNumber, BigNumberish, Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"

describe("PerpdexMarket maxSwapByPrice", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let market: PerpdexMarket
    let owner: Wallet
    let alice: Wallet
    let exchange: Wallet
    let priceFeed: MockContract

    const Q96 = BigNumber.from(2).pow(96)

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexMarketFixture())
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        exchange = fixture.exchange
        priceFeed = fixture.priceFeed

        await market.connect(owner).setPriceLimitConfig({
            normalOrderRatio: 1e5,
            liquidationRatio: 2e5,
            emaNormalOrderRatio: 5e5,
            emaLiquidationRatio: 5e5,
            emaSec: 0,
        })
    })

    describe("empty pool", () => {
        it("return 0", async () => {
            expect(await market.connect(exchange).maxSwapByPrice(false, true, 1)).to.eq(0)
        })
    })

    describe("with fee, without funding", () => {
        beforeEach(async () => {
            await market.connect(owner).setPoolFeeConfig({
                fixedFeeRatio: 5e4,
                atrFeeRatio: 0,
                atrEmaBlocks: 1,
            })
            await market.connect(exchange).addLiquidity(10000, 10000)
        })
        ;[
            {
                title: "long exact input",
                isBaseToQuote: false,
                isExactInput: true,
                sharePriceBoundX96: Q96.mul(2),
                amount: 3881,
            },
            {
                title: "short exact input",
                isBaseToQuote: true,
                isExactInput: true,
                sharePriceBoundX96: Q96.div(2),
                amount: 3881,
            },
            {
                title: "long exact output",
                isBaseToQuote: false,
                isExactInput: false,
                sharePriceBoundX96: Q96.mul(2),
                amount: 2693,
            },
            {
                title: "short exact output",
                isBaseToQuote: true,
                isExactInput: false,
                sharePriceBoundX96: Q96.div(2),
                amount: 2693,
            },
            {
                title: "long exact input. smaller than fee",
                isBaseToQuote: false,
                isExactInput: true,
                sharePriceBoundX96: Q96.mul(101).div(100),
                amount: 0,
            },
            {
                title: "short exact input. smaller than fee",
                isBaseToQuote: true,
                isExactInput: true,
                sharePriceBoundX96: Q96.mul(99).div(100),
                amount: 0,
            },
            {
                title: "long exact output. smaller than fee",
                isBaseToQuote: false,
                isExactInput: false,
                sharePriceBoundX96: Q96.mul(101).div(100),
                amount: 0,
            },
            {
                title: "short exact output. smaller than fee",
                isBaseToQuote: true,
                isExactInput: false,
                sharePriceBoundX96: Q96.mul(99).div(100),
                amount: 0,
            },
        ].forEach(test => {
            it(test.title, async () => {
                const res = await market.maxSwapByPrice(test.isBaseToQuote, test.isExactInput, test.sharePriceBoundX96)
                expect(res).to.eq(test.amount)
            })
        })
    })

    describe("without fee, with funding. funding not affect swap", () => {
        beforeEach(async () => {
            await priceFeed.mock.getPrice.returns(BigNumber.from(10).pow(18))
            await market.connect(exchange).addLiquidity(10000, 10000)
            await market.connect(owner).setFundingMaxPremiumRatio(5e4)
            await priceFeed.mock.getPrice.returns(2)
        })
        ;[
            {
                title: "long exact input",
                isBaseToQuote: false,
                isExactInput: true,
                sharePriceBoundX96: Q96.mul(2),
                amount: 4142,
            },
            {
                title: "short exact input",
                isBaseToQuote: true,
                isExactInput: true,
                sharePriceBoundX96: Q96.div(2),
                amount: 4142,
            },
            {
                title: "long exact output",
                isBaseToQuote: false,
                isExactInput: false,
                sharePriceBoundX96: Q96.mul(2),
                amount: 2928,
            },
            {
                title: "short exact output",
                isBaseToQuote: true,
                isExactInput: false,
                sharePriceBoundX96: Q96.div(2),
                amount: 2928,
            },
            {
                title: "long exact input. out of range",
                isBaseToQuote: false,
                isExactInput: true,
                sharePriceBoundX96: Q96.div(2),
                amount: 0,
            },
            {
                title: "short exact input. out of range",
                isBaseToQuote: true,
                isExactInput: true,
                sharePriceBoundX96: Q96.mul(2),
                amount: 0,
            },
            {
                title: "long exact output. out of range",
                isBaseToQuote: false,
                isExactInput: false,
                sharePriceBoundX96: Q96.div(2),
                amount: 0,
            },
            {
                title: "short exact output. out of range",
                isBaseToQuote: true,
                isExactInput: false,
                sharePriceBoundX96: Q96.mul(2),
                amount: 0,
            },
        ].forEach(test => {
            it(test.title, async () => {
                const res = await market.maxSwapByPrice(test.isBaseToQuote, test.isExactInput, test.sharePriceBoundX96)
                expect(res).to.eq(test.amount)
            })
        })
    })
})
