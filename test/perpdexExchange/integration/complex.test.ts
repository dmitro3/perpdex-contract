import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../../typechain"
import { createPerpdexExchangeFixture } from "../fixtures"
import { BigNumber, Wallet } from "ethers"
import { getTimestamp, setNextTimestamp } from "../../helper/time"
import { MockContract } from "ethereum-waffle"
import _ from "lodash"
import { LimitOrderType } from "../../helper/types"

describe("PerpdexExchange complex situation", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let markets: TestPerpdexMarket[]
    let traders: Wallet[]
    let owner: Wallet
    let alice: Wallet
    let bob: Wallet
    let carol: Wallet
    let priceFeed: MockContract

    const PoolAmount = BigNumber.from(10).pow(18)
    const Q96 = BigNumber.from(2).pow(96)
    const X10_18 = BigNumber.from(10).pow(18)
    const deadline = Q96
    const epsilon = 10

    const long = async (trader, amount, idx = 0) => {
        return exchange.connect(trader).trade({
            trader: trader.address,
            market: markets[idx].address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: amount,
            oppositeAmountBound: BigNumber.from(amount).mul(10),
            deadline: deadline,
        })
    }

    const longLiq = async (trader, liquidator, amount, idx = 0) => {
        return exchange.connect(liquidator).trade({
            trader: trader.address,
            market: markets[idx].address,
            isBaseToQuote: false,
            isExactInput: false,
            amount: amount,
            oppositeAmountBound: BigNumber.from(amount).mul(10),
            deadline: deadline,
        })
    }

    const shortLiq = async (trader, liquidator, amount, idx = 0) => {
        return exchange.connect(liquidator).trade({
            trader: trader.address,
            market: markets[idx].address,
            isBaseToQuote: true,
            isExactInput: true,
            amount: amount,
            oppositeAmountBound: 0,
            deadline: deadline,
        })
    }

    const short = async (trader, amount, idx = 0) => {
        return exchange.connect(trader).trade({
            trader: trader.address,
            market: markets[idx].address,
            isBaseToQuote: true,
            isExactInput: true,
            amount: amount,
            oppositeAmountBound: 0,
            deadline: deadline,
        })
    }

    const maxLong = async (trader, idx = 0) => {
        return exchange.maxTrade({
            trader: trader.address,
            market: markets[idx].address,
            caller: trader.address,
            isBaseToQuote: false,
            isExactInput: false,
        })
    }

    const maxShort = async (trader, idx = 0) => {
        return exchange.maxTrade({
            trader: trader.address,
            market: markets[idx].address,
            caller: trader.address,
            isBaseToQuote: true,
            isExactInput: true,
        })
    }

    const maxLongLiq = async (trader, liquidator, idx = 0) => {
        return exchange.maxTrade({
            trader: trader.address,
            market: markets[idx].address,
            caller: liquidator.address,
            isBaseToQuote: false,
            isExactInput: false,
        })
    }

    const maxShortLiq = async (trader, liquidator, idx = 0) => {
        return exchange.maxTrade({
            trader: trader.address,
            market: markets[idx].address,
            caller: liquidator.address,
            isBaseToQuote: true,
            isExactInput: true,
        })
    }

    const addLiquidity = async (trader, base, quote, idx = 0) => {
        return exchange.connect(trader).addLiquidity({
            market: markets[idx].address,
            base: base,
            quote: quote,
            minBase: 0,
            minQuote: 0,
            deadline: deadline,
        })
    }

    const removeLiquidity = async (trader, liquidity, idx = 0) => {
        return exchange.connect(trader).removeLiquidity({
            trader: trader.address,
            market: markets[idx].address,
            liquidity: liquidity,
            minBase: 0,
            minQuote: 0,
            deadline: deadline,
        })
    }

    const createAsk = async (trader, amount, priceX96, idx = 0) => {
        return exchange.connect(trader).createLimitOrder({
            market: markets[idx].address,
            isBid: false,
            base: amount,
            priceX96: priceX96,
            deadline: deadline,
            limitOrderType: LimitOrderType.PostOnly,
        })
    }

    const createBid = async (trader, amount, priceX96, idx = 0) => {
        return exchange.connect(trader).createLimitOrder({
            market: markets[idx].address,
            isBid: true,
            base: amount,
            priceX96: priceX96,
            deadline: deadline,
            limitOrderType: LimitOrderType.PostOnly,
        })
    }

    const markPriceX96 = async (idx = 0) => {
        return await markets[idx].getMarkPriceX96()
    }

    const askPriceX96 = async (idx = 0) => {
        return await markets[idx].getAskPriceX96()
    }

    const bidPriceX96 = async (idx = 0) => {
        return await markets[idx].getBidPriceX96()
    }

    const deposit = async (trader, amount) => {
        await exchange.connect(trader).deposit(0, { value: amount })
    }

    const getProtocolBalance = async () => {
        const fundInfo = await exchange.insuranceFundInfo()
        const protocolFee = await exchange.protocolInfo()
        return fundInfo.balance.add(fundInfo.liquidationRewardBalance).add(protocolFee)
    }

    const assertZerosum = async () => {
        let result = await getProtocolBalance()
        for (let i = 0; i < traders.length; i++) {
            result = result.add(await exchange.getTotalAccountValue(traders[i].address))
        }
        for (let i = 0; i < markets.length; i++) {
            const [base, accountValue] = await markets[i].getLockedLiquidityInfo()
            result = result.add(accountValue)
        }
        const ethBalance = await hre.ethers.provider.getBalance(exchange.address)
        expect(result).to.be.closeTo(ethBalance, epsilon)
    }

    const assertBaseZerosumByMarket = async market => {
        let result = BigNumber.from(0)
        for (let i = 0; i < traders.length; i++) {
            result = result.add(await exchange.getPositionShare(traders[i].address, market.address))
        }
        const [base, accountValue] = await market.getLockedLiquidityInfo()
        result = result.add(base)
        expect(result).to.be.closeTo(BigNumber.from(0), epsilon)
    }

    const assertBaseZerosum = async () => {
        for (let i = 0; i < markets.length; i++) {
            await assertBaseZerosumByMarket(markets[i])
        }
    }

    const assertLimitOrderCount = async () => {
        for (let i = 0; i < traders.length; i++) {
            const trader = traders[i]
            const limitOrderCount = (await exchange.accountInfos(trader.address)).limitOrderCount
            let count = 0
            for (let j = 0; j < markets.length; j++) {
                const asks = await exchange.getLimitOrderIds(trader.address, markets[j].address, false)
                const bids = await exchange.getLimitOrderIds(trader.address, markets[j].address, true)
                count += asks.length + bids.length
            }
            expect(limitOrderCount).to.eq(count)
        }
    }

    const assertTotalBase = async () => {
        for (let i = 0; i < traders.length; i++) {
            const trader = traders[i]

            for (let j = 0; j < markets.length; j++) {
                const info = await exchange.getLimitOrderInfo(trader.address, market.address)
                const totalBase = info.slice(2, 4)

                let baseAsk = BigNumber.from(0)
                let baseBid = BigNumber.from(0)
                const asks = await exchange.getLimitOrderIds(trader.address, markets[j].address, false)
                const bids = await exchange.getLimitOrderIds(trader.address, markets[j].address, true)
                for (let k = 0; k < asks.length; k++) {
                    baseAsk = (await market.getLimitOrderInfo(false, asks[k]))[0].add(baseAsk)
                }
                for (let k = 0; k < bids.length; k++) {
                    baseBid = (await market.getLimitOrderInfo(true, bids[k]))[0].add(baseBid)
                }

                expect(totalBase).to.deep.eq([baseAsk, baseBid])
            }
        }
    }

    const assertMarkets = async () => {
        for (let i = 0; i < traders.length; i++) {
            const trader = traders[i]
            const traderMarkets = await exchange.getAccountMarkets(trader.address)

            const actualMarkets = []
            for (let j = 0; j < markets.length; j++) {
                const takerInfo = await exchange.getTakerInfo(trader.address, market.address)
                const makerInfo = await exchange.getMakerInfo(trader.address, market.address)
                const [askRoot, bidRoot] = await exchange.getLimitOrderInfo(trader.address, market.address)

                if (!takerInfo.baseBalanceShare.eq(0) || !makerInfo.liquidity.eq(0) || askRoot != 0 || bidRoot != 0) {
                    actualMarkets.push(markets[j].address)
                }
            }

            expect(_.sortBy(traderMarkets)).to.deep.eq(_.sortBy(actualMarkets))
        }
    }

    const setIndexPrice = async price => {
        await priceFeed.mock.getPrice.returns(price)
    }

    const setElapsed = async (sec, mine = false) => {
        const next = (await getTimestamp()) + 1000
        for (let i = 0; i < markets.length; i++) {
            const priceLimitInfo = await markets[i].priceLimitInfo()
            await markets[i].setPriceLimitInfo({
                ...priceLimitInfo,
                referenceTimestamp: BigNumber.from(next - sec),
            })

            const fundingInfo = await markets[i].fundingInfo()
            await markets[i].setFundingInfo({
                ...fundingInfo,
                prevIndexPriceTimestamp: BigNumber.from(next - sec),
            })
        }
        await setNextTimestamp(next, mine)
    }

    beforeEach(async () => {
        fixture = await loadFixture(
            createPerpdexExchangeFixture({
                isMarketAllowed: true,
                initPool: false,
            }),
        )
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
        bob = fixture.bob
        carol = fixture.carol
        markets = fixture.perpdexMarkets
        traders = [alice, bob, carol]
        priceFeed = fixture.priceFeed
    })

    describe("price limit", () => {
        beforeEach(async () => {
            await markets[0].connect(owner).setPriceLimitConfig({
                normalOrderRatio: 20e4,
                liquidationRatio: 40e4,
                emaNormalOrderRatio: 20e4,
                emaLiquidationRatio: 40e4,
                emaSec: 300,
            })

            await deposit(alice, PoolAmount)
            await deposit(bob, PoolAmount)
            await deposit(carol, 10)
            await setIndexPrice(X10_18.mul(4))
            await addLiquidity(bob, PoolAmount, PoolAmount.mul(4))
        })

        describe("same timestamp", () => {
            describe("long", () => {
                beforeEach(async () => {
                    await short(carol, 20) // will be liquidated
                    await setElapsed(1, true)

                    const amount = await maxLong(alice)
                    expect(amount).to.gt(epsilon)
                    await long(alice, amount)
                    await setElapsed(0, true)
                })

                it("long limited", async () => {
                    expect(await maxLong(alice)).to.lt(epsilon)
                    expect(await maxLong(bob)).to.lt(epsilon)
                })

                it("short not limited", async () => {
                    expect(await maxShort(alice)).to.gt(epsilon)
                    expect(await maxShort(bob)).to.gt(epsilon)
                })

                it("long liquidation not limited", async () => {
                    expect(await maxLongLiq(carol, alice)).to.gt(epsilon)
                })
            })

            describe("short", () => {
                beforeEach(async () => {
                    await long(carol, 20) // will be liquidated
                    await setElapsed(1, true)

                    const amount = await maxShort(alice)
                    expect(amount).to.gt(epsilon)
                    await short(alice, amount)
                    await setElapsed(0, true)
                })

                it("long not limited", async () => {
                    expect(await maxLong(alice)).to.gt(epsilon)
                    expect(await maxLong(bob)).to.gt(epsilon)
                })

                it("short limited", async () => {
                    expect(await maxShort(alice)).to.lt(epsilon)
                    expect(await maxShort(bob)).to.lt(epsilon)
                })

                it("short liquidation not limited", async () => {
                    expect(await maxShortLiq(carol, alice)).to.gt(epsilon)
                })
            })
        })

        describe("different timestamp", () => {
            describe("long", () => {
                beforeEach(async () => {
                    await short(carol, 20) // will be liquidated
                    await setElapsed(1, true)

                    const amount = await maxLong(alice)
                    expect(amount).to.gt(epsilon)
                    await long(alice, amount)
                    await setElapsed(1, true)
                })

                it("long not limited", async () => {
                    expect(await maxLong(alice)).to.gt(epsilon)
                    expect(await maxLong(bob)).to.gt(epsilon)
                })

                // TODO:
                it("long limited by ema", async () => {
                    // expect(await maxLong(alice)).to.lt(epsilon)
                    // expect(await maxLong(bob)).to.lt(epsilon)
                })

                it("short not limited", async () => {
                    expect(await maxShort(alice)).to.gt(epsilon)
                    expect(await maxShort(bob)).to.gt(epsilon)
                })

                it("long liquidation not limited", async () => {
                    expect(await maxLongLiq(carol, alice)).to.gt(epsilon)
                })
            })

            describe("short", () => {
                beforeEach(async () => {
                    await long(carol, 20) // will be liquidated
                    await setElapsed(1, true)

                    const amount = await maxShort(alice)
                    expect(amount).to.gt(epsilon)
                    await short(alice, amount)
                    await setElapsed(1, true)
                })

                it("long not limited", async () => {
                    expect(await maxLong(alice)).to.gt(epsilon)
                    expect(await maxLong(bob)).to.gt(epsilon)
                })

                it("short not limited", async () => {
                    expect(await maxShort(alice)).to.gt(epsilon)
                    expect(await maxShort(bob)).to.gt(epsilon)
                })

                it("short liquidation not limited", async () => {
                    expect(await maxShortLiq(carol, alice)).to.gt(epsilon)
                })
            })
        })
    })

    describe("consistency", () => {
        beforeEach(async () => {
            await exchange.connect(owner).setProtocolFeeRatio(1e4)
            await markets[0].connect(owner).setPoolFeeConfig({
                fixedFeeRatio: 1e3,
                atrFeeRatio: 4e6,
                atrEmaBlocks: 16,
            })
            await markets[0].connect(owner).setPriceLimitConfig({
                normalOrderRatio: 20e4,
                liquidationRatio: 40e4,
                emaNormalOrderRatio: 20e4,
                emaLiquidationRatio: 40e4,
                emaSec: 300,
            })
            await markets[0].connect(owner).setFundingMaxPremiumRatio(5e4)
            await markets[0].connect(owner).setFundingRolloverSec(3600)
            await markets[0].connect(owner).setFundingMaxElapsedSec(3600)

            await deposit(alice, PoolAmount)
            await deposit(bob, PoolAmount)
            await setIndexPrice(X10_18.mul(4))
            await addLiquidity(bob, PoolAmount, PoolAmount.mul(4))
        })

        describe("complex scenario", () => {
            beforeEach(async () => {
                const carolSize = await maxLong(carol)
                let amount = carolSize
                expect(amount).to.gt(epsilon)
                await deposit(carol, amount.div(2))
                await setIndexPrice(X10_18.mul(X10_18))
                await long(carol, amount) // will be liquidated
                await setIndexPrice(1)
                await setElapsed(3600, true)

                for (let i = 0; i < 5; i++) {
                    amount = await maxShort(alice)
                    expect(amount).to.gt(epsilon)
                    await short(alice, amount)
                    await setIndexPrice(X10_18.mul(X10_18))
                    await setElapsed(3600, true)
                }

                await shortLiq(carol, bob, carolSize)
                await setElapsed(3600, true)

                await removeLiquidity(bob, PoolAmount)
            })

            it("account value zero sum", async () => {
                await assertZerosum()
            })

            it("base zero sum", async () => {
                await assertBaseZerosum()
            })

            it("markets consistency", async () => {
                await assertMarkets()
            })

            it("totalBase consistency", async () => {
                await assertTotalBase()
            })

            it("limitOrderCount consistency", async () => {
                await assertLimitOrderCount()
            })

            it("insurance fund profit", async () => {
                const fundInfo = await exchange.insuranceFundInfo()
                expect(fundInfo.balance).to.gt(epsilon)
                expect(fundInfo.liquidationRewardBalance).to.gt(epsilon)
            })

            it("protocol fee profit", async () => {
                const protocolFee = await exchange.protocolInfo()
                expect(protocolFee).to.gt(epsilon)
            })
        })

        describe("complex scenario 2 (limit order)", () => {
            beforeEach(async () => {
                const carolSize = await maxLong(carol)
                let amount = carolSize
                expect(amount).to.gt(epsilon)
                await deposit(carol, amount.div(2))
                await setIndexPrice(X10_18.mul(X10_18))
                await long(carol, amount) // will be liquidated
                await setIndexPrice(1)
                await setElapsed(3600, true)

                for (let i = 0; i < 5; i++) {
                    amount = await maxShort(alice)
                    expect(amount).to.gt(epsilon)
                    await short(alice, amount)
                    await setIndexPrice(X10_18.mul(X10_18))
                    await setElapsed(3600, true)

                    const askPrice = await askPriceX96()
                    await createAsk(bob, amount.div(2), askPrice)
                    const bidPrice = await bidPriceX96()
                    await createAsk(bob, amount.div(2), bidPrice)
                }

                await shortLiq(carol, bob, carolSize)
                await setElapsed(3600, true)

                await removeLiquidity(bob, PoolAmount)
            })

            it("account value zero sum", async () => {
                await assertZerosum()
            })

            it("base zero sum", async () => {
                await assertBaseZerosum()
            })

            it("markets consistency", async () => {
                await assertMarkets()
            })

            it("totalBase consistency", async () => {
                await assertTotalBase()
            })

            it("limitOrderCount consistency", async () => {
                await assertLimitOrderCount()
            })

            it("insurance fund profit", async () => {
                const fundInfo = await exchange.insuranceFundInfo()
                expect(fundInfo.balance).to.gt(epsilon)
                expect(fundInfo.liquidationRewardBalance).to.gt(epsilon)
            })

            it("protocol fee profit", async () => {
                const protocolFee = await exchange.protocolInfo()
                expect(protocolFee).to.gt(epsilon)
            })
        })
    })
})
