import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { waffle } from "hardhat"
import { ClearingHouse, TestERC20, UniswapV3Pool, Vault, VirtualToken } from "../../typechain"
import { toWei } from "../helper/number"
import { deposit } from "../helper/token"
import { encodePriceSqrt } from "../shared/utilities"
import { BaseQuoteOrdering, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse openPosition", () => {
    const [admin, maker, taker, carol] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let clearingHouse: ClearingHouse
    let vault: Vault
    let collateral: TestERC20
    let baseToken: VirtualToken
    let quoteToken: VirtualToken
    let pool: UniswapV3Pool
    let mockedBaseAggregator: MockContract
    let collateralDecimals: number
    const lowerTick: number = 0
    const upperTick: number = 100000

    beforeEach(async () => {
        const _clearingHouseFixture = await loadFixture(createClearingHouseFixture(BaseQuoteOrdering.BASE_0_QUOTE_1))
        clearingHouse = _clearingHouseFixture.clearingHouse
        vault = _clearingHouseFixture.vault
        collateral = _clearingHouseFixture.USDC
        baseToken = _clearingHouseFixture.baseToken
        quoteToken = _clearingHouseFixture.quoteToken
        mockedBaseAggregator = _clearingHouseFixture.mockedBaseAggregator
        pool = _clearingHouseFixture.pool
        collateralDecimals = await collateral.decimals()

        mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits("100", 6), 0, 0, 0]
        })

        // add pool
        await clearingHouse.addPool(baseToken.address, 10000)
        await pool.initialize(encodePriceSqrt("151.373306858723226652", "1")) // tick = 50200 (1.0001^50200 = 151.373306858723226652)

        // prepare collateral for maker
        const makerCollateralAmount = toWei(1000000, collateralDecimals)
        await collateral.mint(maker.address, makerCollateralAmount)
        await deposit(maker, vault, 1000000, collateral)

        // maker add liquidity
        await clearingHouse.connect(maker).mint(baseToken.address, toWei(10000))
        await clearingHouse.connect(maker).mint(quoteToken.address, toWei(10000))
        await clearingHouse.connect(maker).addLiquidity({
            baseToken: baseToken.address,
            base: toWei(100),
            quote: toWei(10000),
            lowerTick,
            upperTick,
        })

        // maker
        //   pool.base = 65.9437860798
        //   pool.quote = 10000
        //   liquidity = 884.6906588359
        //   virtual base liquidity = 884.6906588359 / sqrt(151.373306858723226652) = 71.9062751863
        //   virtual quote liquidity = 884.6906588359 * sqrt(151.373306858723226652) = 10884.6906588362

        // prepare collateral for taker
        const takerCollateral = toWei(1000, collateralDecimals)
        await collateral.mint(taker.address, takerCollateral)
        await collateral.connect(taker).approve(clearingHouse.address, takerCollateral)
    })

    describe("invalid input", () => {
        describe("taker has enough collateral", () => {
            beforeEach(async () => {
                await deposit(taker, vault, 1000, collateral)
            })

            it("force error due to invalid baseToken", async () => {
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: pool.address,
                        isBaseToQuote: true,
                        isExactInput: true,
                        amount: 1,
                        sqrtPriceLimitX96: 0,
                    }),
                ).to.be.revertedWith("CH_BTNE")
            })

            it("force error due to invalid amount (0)", async () => {
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: true,
                        isExactInput: true,
                        amount: 0,
                        sqrtPriceLimitX96: 0,
                    }),
                ).to.be.revertedWith("UB_ZI")
            })

            it("force error due to slippage protection", async () => {
                // taker want to get 1 vETH in exact current price which is not possible
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: false,
                        isExactInput: false,
                        amount: 1,
                        sqrtPriceLimitX96: encodePriceSqrt("151.373306858723226652", "1"),
                    }),
                ).to.be.revertedWith("SPL")
            })

            it("force error due to not enough liquidity", async () => {
                // empty the liquidity
                const order = await clearingHouse.getOpenOrder(maker.address, baseToken.address, lowerTick, upperTick)
                await clearingHouse.connect(maker).removeLiquidity({
                    baseToken: baseToken.address,
                    lowerTick,
                    upperTick,
                    liquidity: order.liquidity,
                })

                // trade
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: false,
                        isExactInput: false,
                        amount: 1,
                        sqrtPriceLimitX96: 0,
                    }),
                ).to.be.revertedWith("CH_F0S")
            })
        })

        describe("taker has 0 collateral", () => {
            it("force error due to not enough collateral for mint", async () => {
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: false,
                        isExactInput: true,
                        amount: toWei(10000000),
                        sqrtPriceLimitX96: 0,
                    }),
                ).to.be.revertedWith("CH_NEAV")
            })
        })
    })

    describe("taker open position from zero", async () => {
        beforeEach(async () => {
            await deposit(taker, vault, 1000, collateral)

            // expect all available and debt are zero
            const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
            const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
            expect(baseInfo.available.eq(0)).to.be.true
            expect(baseInfo.debt.eq(0)).to.be.true
            expect(quoteInfo.available.eq(0)).to.be.true
            expect(quoteInfo.debt.eq(0)).to.be.true
        })

        describe("long", () => {
            it("increase ? position when exact input", async () => {
                // taker swap 1 USD for ? ETH
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: false,
                        isExactInput: true,
                        amount: toWei(1),
                        sqrtPriceLimitX96: 0,
                    }),
                )
                    .to.emit(clearingHouse, "Swapped")
                    .withArgs(
                        taker.address, // trader
                        baseToken.address, // baseToken
                        "6539527905092835", // exchangedPositionSize
                        toWei(-0.99), // costBasis
                        toWei(1 * 0.01), // fee
                        toWei(0), // fundingPayment
                        toWei(0), // badDebt
                    )

                const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                expect(baseInfo.available.gt(toWei(0))).to.be.true
                expect(baseInfo.debt).be.deep.eq(toWei(0))
                expect(quoteInfo.available).be.deep.eq(toWei(0))
                expect(quoteInfo.debt).be.deep.eq(toWei(1))
            })

            describe("exact output", () => {
                it("mint more USD to buy exact 1 ETH", async () => {
                    // taker swap ? USD for 1 ETH -> quote to base -> fee is charged before swapping
                    //   exchanged notional = 71.9062751863 * 10884.6906588362 / (71.9062751863 - 1) - 10884.6906588362 = 153.508143394
                    //   taker fee = 153.508143394 / 0.99 * 0.01 = 1.550587307

                    await expect(
                        clearingHouse.connect(taker).openPosition({
                            baseToken: baseToken.address,
                            isBaseToQuote: false,
                            isExactInput: false,
                            amount: toWei(1),
                            sqrtPriceLimitX96: 0,
                        }),
                    )
                        .to.emit(clearingHouse, "Swapped")
                        .withArgs(
                            taker.address, // trader
                            baseToken.address, // baseToken
                            toWei(1), // exchangedPositionSize
                            "-153508143394151325059", // costBasis
                            "1550587307011629547", // fee
                            toWei(0), // fundingPayment
                            toWei(0), // badDebt
                        )

                    const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                    const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                    expect(baseInfo.available).be.deep.eq(toWei(1))
                    expect(baseInfo.debt).be.deep.eq(toWei(0))
                    expect(quoteInfo.available).be.deep.eq(toWei(0))
                    expect(quoteInfo.debt.gt(toWei(0))).to.be.true
                })

                it("mint more USD to buy exact 1 ETH, when it has not enough available before", async () => {
                    await clearingHouse.connect(taker).mint(quoteToken.address, toWei(50))

                    // taker swap ? USD for 1 ETH
                    await clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: false,
                        isExactInput: false,
                        amount: toWei(1),
                        sqrtPriceLimitX96: 0,
                    })
                    const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                    const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                    expect(baseInfo.available).be.deep.eq(toWei(1))
                    expect(baseInfo.debt).be.deep.eq(toWei(0))
                    expect(quoteInfo.available).be.deep.eq(toWei(0))
                    expect(quoteInfo.debt.gt(toWei(0))).to.be.true
                })

                it("mint more but burn all of them after swap because there's enough available", async () => {
                    await clearingHouse.connect(taker).mint(quoteToken.address, toWei(200))

                    // taker swap ? USD for 1 ETH
                    await clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: false,
                        isExactInput: false,
                        amount: toWei(1),
                        sqrtPriceLimitX96: 0,
                    })
                    const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                    const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                    expect(baseInfo.available.eq(toWei(1))).to.be.true
                    expect(baseInfo.debt.eq(toWei(0))).to.be.true
                    expect(quoteInfo.available.toString()).eq("44941269298837045394") // around 200 - 151 with slippage
                    expect(quoteInfo.debt.gt(toWei(0))).to.be.true
                })
            })

            it("mint missing amount of vUSD for swapping", async () => {
                await clearingHouse.connect(taker).mint(quoteToken.address, toWei(1))

                // taker swap 2 USD for ? ETH
                // it will mint 1 more USD
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: false,
                        isExactInput: true,
                        amount: toWei(2),
                        sqrtPriceLimitX96: 0,
                    }),
                )
                    .to.emit(clearingHouse, "Minted")
                    .withArgs(taker.address, quoteToken.address, toWei(1))

                const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                expect(baseInfo.available.gt(toWei(0))).to.be.true
                expect(baseInfo.debt.eq(toWei(0))).to.be.true
                expect(quoteInfo.available.eq(toWei(0))).to.be.true
                expect(quoteInfo.debt.eq(toWei(2))).to.be.true
            })

            it("does not mint anything if the vUSD is sufficient", async () => {
                await clearingHouse.connect(taker).mint(quoteToken.address, toWei(1))

                // taker swap 1 USD for ? ETH
                // wont mint anything
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: false,
                        isExactInput: true,
                        amount: toWei(1),
                        sqrtPriceLimitX96: 0,
                    }),
                ).to.not.emit(clearingHouse, "Minted")

                const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                expect(baseInfo.available.gt(toWei(0))).to.be.true
                expect(baseInfo.debt.eq(toWei(0))).to.be.true
                expect(quoteInfo.available.eq(toWei(0))).to.be.true
                expect(quoteInfo.debt.eq(toWei(1))).to.be.true
            })
        })

        describe("taker opens short from scratch", () => {
            it("settle funding payment")
            it("increase position from 0", async () => {
                // taker swap ? USD for 1 ETH -> base to quote -> fee is included in exchangedNotional
                //   taker exchangedNotional = 10884.6906588362 - 71.9062751863 * 10884.6906588362 / (71.9062751863 + 1) = 149.2970341856
                //   taker fee = 149.2970341856 * 0.01 = 1.492970341856

                // taker swap 1 ETH for ? USD
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: true,
                        isExactInput: true,
                        amount: toWei(1),
                        sqrtPriceLimitX96: 0,
                    }),
                )
                    .to.emit(clearingHouse, "Swapped")
                    .withArgs(
                        taker.address, // trader
                        baseToken.address, // baseToken
                        toWei(-1), // exchangedPositionSize
                        parseEther("149.297034185732877727"), // costBasis
                        parseEther("1.492970341857328778"), // fee: 149.297034185732877727 * 0.01 = 1.492970341857328777
                        toWei(0), // fundingPayment
                        toWei(0), // badDebt
                    )

                const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                expect(baseInfo.available.eq(toWei(0))).to.be.true
                expect(baseInfo.debt.eq(toWei(1))).to.be.true
                expect(quoteInfo.available.gt(toWei(0))).to.be.true
                expect(quoteInfo.debt.eq(toWei(0))).to.be.true
            })
            it("mint missing amount of vETH for swapping", async () => {
                await clearingHouse.connect(taker).mint(baseToken.address, toWei(1))

                // taker swap 2 ETH for ? USD
                // it will mint 1 more ETH
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: true,
                        isExactInput: true,
                        amount: toWei(2),
                        sqrtPriceLimitX96: 0,
                    }),
                )
                    .to.emit(clearingHouse, "Minted")
                    .withArgs(taker.address, baseToken.address, toWei(1))

                const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                expect(baseInfo.available.eq(toWei(0))).to.be.true
                expect(baseInfo.debt.eq(toWei(2))).to.be.true
                expect(quoteInfo.available.gt(toWei(0))).to.be.true
                expect(quoteInfo.debt.eq(toWei(0))).to.be.true
            })

            it("will not mint anything if vETH is sufficient", async () => {
                await clearingHouse.connect(taker).mint(baseToken.address, toWei(1))

                // taker swap 1 ETH for ? USD
                // wont mint anything
                await expect(
                    clearingHouse.connect(taker).openPosition({
                        baseToken: baseToken.address,
                        isBaseToQuote: true,
                        isExactInput: true,
                        amount: toWei(1),
                        sqrtPriceLimitX96: 0,
                    }),
                ).to.not.emit(clearingHouse, "Minted")

                const baseInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                const quoteInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                expect(baseInfo.available.eq(toWei(0))).to.be.true
                expect(baseInfo.debt.eq(toWei(1))).to.be.true
                expect(quoteInfo.available.gt(toWei(0))).to.be.true
                expect(quoteInfo.debt.eq(toWei(0))).to.be.true
            })
        })
    })

    describe("opening long first then", () => {
        beforeEach(async () => {
            await deposit(taker, vault, 1000, collateral)

            // 71.9062751863 - 884.6906588359 ^ 2  / (10884.6906588362 + 2 * 0.99) = 0.01307786649
            // taker swap 2 USD for 0.01320994188 ETH
            await clearingHouse.connect(taker).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: toWei(2),
                sqrtPriceLimitX96: 0,
            })
            // virtual base liquidity = 71.9062751863 - 0.01307786649 = 71.8931973198
            // virtual quote liquidity = 10884.6906588362 + 2 * 0.99 = 10886.6706588362
        })

        it("increase position", async () => {
            const baseInfoBefore = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
            const quoteInfoBefore = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)

            // taker swap 1 USD for ? ETH again
            await clearingHouse.connect(taker).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: toWei(1),
                sqrtPriceLimitX96: 0,
            })

            // increase ? USD debt, increase 1 ETH available, the rest remains the same
            const baseInfoAfter = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
            const quoteInfoAfter = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
            const increasedQuoteDebt = quoteInfoAfter.debt.sub(quoteInfoBefore.debt)
            const increasedBaseAvailable = baseInfoAfter.available.sub(baseInfoBefore.available)
            expect(increasedQuoteDebt).deep.eq(toWei(1))
            expect(increasedBaseAvailable.gt(toWei(0))).to.be.true
            expect(baseInfoAfter.debt.sub(baseInfoBefore.debt)).deep.eq(toWei(0))
            expect(quoteInfoAfter.available.sub(quoteInfoBefore.available)).deep.eq(toWei(0))

            // pos size: 0.01961501593
            expect(await clearingHouse.getPositionSize(taker.address, baseToken.address)).to.eq("19615015933642630")
            expect(await clearingHouse.getCostBasis(taker.address)).to.eq(toWei(-3))
        })

        it("reduce position", async () => {
            const baseInfoBefore = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
            const quoteInfoBefore = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)

            // reduced base = 0.006538933220746360
            const reducedBase = baseInfoBefore.available.div(2)
            // taker reduce 50% ETH position for ? USD
            await clearingHouse.connect(taker).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: reducedBase,
                sqrtPriceLimitX96: 0,
            })

            // increase ? USD available, reduce 1 ETH available, the rest remains the same
            const baseInfoAfter = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
            const quoteInfoAfter = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
            const increasedQuoteAvailable = quoteInfoAfter.available.sub(quoteInfoBefore.available)
            const reducedBaseAvailable = baseInfoBefore.available.sub(baseInfoAfter.available)
            expect(increasedQuoteAvailable).to.equal("0")
            expect(reducedBaseAvailable).deep.eq(reducedBase)
            expect(baseInfoAfter.debt.sub(baseInfoBefore.debt)).deep.eq(toWei(0))
            expect(quoteInfoBefore.debt.sub(quoteInfoAfter.debt)).to.be.above("0")

            // pos size: 0.006538933220746361
            expect(await clearingHouse.getPositionSize(taker.address, baseToken.address)).to.eq("6538933220746361")
            expect(await clearingHouse.getCostBasis(taker.address)).to.eq(
                quoteInfoAfter.available.sub(quoteInfoAfter.debt),
            )
        })

        it("close position, base's available/debt will be 0, collateral will be the origin number", async () => {
            // expect taker has 2 USD worth ETH
            const baseTokenInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
            const posSize = baseTokenInfo.available.sub(baseTokenInfo.debt)
            // posSize = 0.013077866441492721

            // taker sells 0.013077866441492721 ETH
            // B2QFee: CH actually sells 0.013077866441492721 / 0.99 = 0.0132099661
            // 10886.6706588362 - 884.6906588359 ^ 2 / (71.8931973198 + 0.013209966102517900) = 1.9999963239
            // B2QFee: scale down: 1.9999963239 * 0.99 = 1.9799963607 (1.979999999999999957 to be precise)
            // taker gets 1.9799963607 * 0.99 = 1.9601963971
            await clearingHouse.connect(taker).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: posSize,
                sqrtPriceLimitX96: 0,
            })

            // base debt and available will be 0
            {
                const baseTokenInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                expect(baseTokenInfo.available).deep.eq(toWei(0))
                expect(baseTokenInfo.debt).deep.eq(toWei(0))
                const quoteTokenInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                expect(quoteTokenInfo.available).eq(0)
                // 2 - 1.9601963971 = 0.0398036029
                // there are imprecisions due to complicated calculations
                expect(quoteTokenInfo.debt).deep.eq("39800000000000043") // loss
            }

            // collateral will be less than original number bcs of fees
            const freeCollateral = await clearingHouse.buyingPower(taker.address)
            expect(freeCollateral.lt(toWei(1000))).to.be.true

            expect(await clearingHouse.getPositionSize(taker.address, baseToken.address)).to.eq("0")

            // getCostBasis shouldn't be public, and the meaning is different when it's being closed but we don't actively settle
            // expect(await clearingHouse.getCostBasis(taker.address)).to.eq("0")
        })

        it("close position with profit", async () => {
            // expect taker has 2 USD worth ETH
            const baseTokenInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
            const posSize = baseTokenInfo.available.sub(baseTokenInfo.debt)
            // posSize = 0.013077866441492721

            // prepare collateral for carol
            const carolAmount = toWei(1000, collateralDecimals)
            await collateral.connect(admin).mint(carol.address, carolAmount)
            await deposit(carol, vault, 1000, collateral)

            // carol pays $1000 for ETH long
            // 71.8931973198 - 884.6906588359 ^ 2 / (10886.6706588362 + 990) = 5.9927792385
            await clearingHouse.connect(carol).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: false,
                isExactInput: true,
                amount: carolAmount,
                sqrtPriceLimitX96: 0,
            })
            // virtual base liquidity = 71.8931973198 - 5.9927792385 = 65.9004180813
            // virtual quote liquidity = 10886.6706588362 + 990 = 11876.6706588362

            // taker sells 0.013077866441492721 ETH
            // B2QFee: CH actually sells 0.013077866441492721 / 0.99 = 0.0132099661
            // 11876.6706588362 - 884.6906588359 ^ 2 / (65.9004180813 + 0.0132099661) = 2.380242465
            // B2QFee: scale down: 2.380242465 * 0.99 = 2.3564400404
            // taker gets 2.3564400404 * 0.99 = 2.33287564
            await clearingHouse.connect(taker).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: posSize,
                sqrtPriceLimitX96: 0,
            })

            // base debt and available will be 0
            {
                const baseTokenInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                expect(baseTokenInfo.available).deep.eq(toWei(0))
                expect(baseTokenInfo.debt).deep.eq(toWei(0))
                const quoteTokenInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                // pnl = 2.33287564 - 2 = 0.33287564
                // there are imprecisions due to complicated calculations
                expect(quoteTokenInfo.available).eq("332880320006927809") // profit
                expect(quoteTokenInfo.debt).deep.eq(toWei(0))
            }

            // collateral will be less than original number bcs of fees
            const freeCollateral = await clearingHouse.buyingPower(taker.address)
            expect(freeCollateral.gt(toWei(1000))).to.be.true
            expect(await clearingHouse.getPositionSize(taker.address, baseToken.address)).to.eq("0")

            // getCostBasis shouldn't be public, and the meaning is different when it's being closed but we don't actively settle
            // expect(await clearingHouse.getCostBasis(taker.address)).to.eq("0")
        })

        it("close position with loss", async () => {
            // expect taker has 2 USD worth ETH
            const baseTokenInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
            const posSize = baseTokenInfo.available.sub(baseTokenInfo.debt)

            // prepare collateral for carol
            const carolAmount = toWei(1000, collateralDecimals)
            await collateral.connect(admin).mint(carol.address, carolAmount)
            await deposit(carol, vault, 1000, collateral)

            // carol pays for $1000 ETH short
            // B2QFee: CH actually gets 1000 / 0.99 = 1010.101010101 quote
            // 884.6906588359 ^ 2 / (10886.6706588362 - 1010.101010101) - 71.8931973198 = 7.3526936796
            await clearingHouse.connect(carol).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: false,
                amount: carolAmount,
                sqrtPriceLimitX96: 0,
            })
            // virtual base liquidity = 71.8931973198 + 7.3526936796 = 79.2458909994
            // virtual quote liquidity = 10886.6706588362 - 1010.101010101 = 9876.5696487352

            // taker sells 0.013077866441492721 ETH
            // B2QFee: CH actually sells 0.013077866441492721 / 0.99 = 0.0132099661
            // 9876.5696487352 - 884.6906588359 ^ 2 / (79.2458909994 + 0.0132099661) = 1.6461093907
            // B2QFee: scale down: 1.6461093907 * 0.99 = 1.6296482968
            // taker gets 1.6296482968 * 0.99 = 1.6133518138
            await clearingHouse.connect(taker).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: true,
                amount: posSize,
                sqrtPriceLimitX96: 0,
            })

            // base debt and available will be 0
            {
                const baseTokenInfo = await clearingHouse.getTokenInfo(taker.address, baseToken.address)
                expect(baseTokenInfo.available).deep.eq(toWei(0))
                expect(baseTokenInfo.debt).deep.eq(toWei(0))
                const quoteTokenInfo = await clearingHouse.getTokenInfo(taker.address, quoteToken.address)
                expect(quoteTokenInfo.available).eq(0)
                // pnl = 2 - 1.6133518138 = 0.3866481862
                // there are imprecisions due to complicated calculations
                expect(quoteTokenInfo.debt).deep.eq("386645498819609266") // loss
            }

            // collateral will be less than original number bcs of fees
            const freeCollateral = await clearingHouse.buyingPower(taker.address)
            expect(freeCollateral.lt(toWei(1000))).to.be.true

            expect(await clearingHouse.getPositionSize(taker.address, baseToken.address)).to.eq("0")

            // getCostBasis shouldn't be public, and the meaning is different when it's being closed but we don't actively settle
            // expect(await clearingHouse.getCostBasis(taker.address)).to.eq("0")
        })

        // TODO: blocked by TWAP based _getDebtValue
        it.skip("force error, can't open another long if it's under collateral", async () => {
            // prepare collateral for carol
            const carolAmount = toWei(1000, collateralDecimals)
            await collateral.connect(admin).mint(carol.address, carolAmount)
            await deposit(carol, vault, 1000, collateral)

            // carol open short to make taker under collateral
            await clearingHouse.connect(carol).openPosition({
                baseToken: baseToken.address,
                isBaseToQuote: true,
                isExactInput: false,
                amount: carolAmount,
                sqrtPriceLimitX96: 0,
            })

            // taker want to increase position but he's under collateral
            // TODO expect taker's margin ratio < mmRatio
            await expect(
                clearingHouse.connect(taker).openPosition({
                    baseToken: baseToken.address,
                    isBaseToQuote: false,
                    isExactInput: true,
                    amount: 1,
                    sqrtPriceLimitX96: 0,
                }),
            ).to.be.revertedWith("CH_CNE")
        })

        it("open larger reverse position")
    })

    describe("opening short first then", () => {
        it("increase position")
        it("reduce position")
        it("close position")
        it("open larger reverse position")
    })

    // https://docs.google.com/spreadsheets/d/1xcWBBcQYwWuWRdlHtNv64tOjrBCnnvj_t1WEJaQv8EY/edit#gid=1258612497
    describe("maker has order out of price range", () => {
        it("will not affect her range order")
    })

    describe("maker has order within price range", () => {
        it("will not affect her range order")
        it("force error if she is going to liquidate herself")
    })
})
