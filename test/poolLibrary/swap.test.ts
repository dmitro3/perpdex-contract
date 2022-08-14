import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPoolLibrary } from "../../typechain"
import { createPoolLibraryFixture } from "./fixtures"
import { BigNumber } from "ethers"
import { PANIC_CODES } from "@nomicfoundation/hardhat-chai-matchers/panic"

describe("PoolLibrary swap", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let library: TestPoolLibrary

    const Q96 = BigNumber.from(2).pow(96)

    beforeEach(async () => {
        fixture = await loadFixture(createPoolLibraryFixture())
        library = fixture.poolLibrary
    })

    describe("empty pool", () => {
        it("zero", async () => {
            await expect(
                library.swap({
                    isBaseToQuote: false,
                    isExactInput: true,
                    amount: 1,
                    feeRatio: 0,
                }),
            )
                .to.emit(library, "SwapResult")
                .withArgs(0)
        })
    })

    describe("without fee, without funding", () => {
        beforeEach(async () => {
            await library.setPoolInfo({
                base: 10000,
                quote: 10000,
                totalLiquidity: 10000,
                cumBasePerLiquidityX96: 0,
                cumQuotePerLiquidityX96: 0,
                baseBalancePerShareX96: Q96,
            })
        })
        ;[
            {
                title: "long exact input",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 10000,
                oppositeAmount: 5000,
                base: 5000,
                quote: 20000,
            },
            {
                title: "short exact input",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 10000,
                oppositeAmount: 5000,
                base: 20000,
                quote: 5000,
            },
            {
                title: "long exact output",
                isBaseToQuote: false,
                isExactInput: false,
                amount: 5000,
                oppositeAmount: 10000,
                base: 5000,
                quote: 20000,
            },
            {
                title: "short exact input",
                isBaseToQuote: true,
                isExactInput: false,
                amount: 5000,
                oppositeAmount: 10000,
                base: 20000,
                quote: 5000,
            },
            {
                title: "long exact input zero",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 0,
                oppositeAmount: 0,
                base: 10000,
                quote: 10000,
            },
            {
                title: "short exact input zero",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 0,
                oppositeAmount: 0,
                base: 10000,
                quote: 10000,
            },
            {
                title: "long exact output zero",
                isBaseToQuote: false,
                isExactInput: false,
                amount: 0,
                oppositeAmount: 0,
                base: 10000,
                quote: 10000,
            },
            {
                title: "short exact input zero",
                isBaseToQuote: true,
                isExactInput: false,
                amount: 0,
                oppositeAmount: 0,
                base: 10000,
                quote: 10000,
            },
            {
                title: "long exact input rounded to benefit pool",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 10001,
                oppositeAmount: 5000,
                base: 5000,
                quote: 20001,
            },
            {
                title: "short exact input rounded to benefit pool",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 10001,
                oppositeAmount: 5000,
                base: 20001,
                quote: 5000,
            },
            {
                title: "long exact output rounded to benefit pool",
                isBaseToQuote: false,
                isExactInput: false,
                amount: 5001,
                oppositeAmount: 10005,
                base: 4999,
                quote: 20005,
            },
            {
                title: "short exact output rounded to benefit pool",
                isBaseToQuote: true,
                isExactInput: false,
                amount: 5001,
                oppositeAmount: 10005,
                base: 20005,
                quote: 4999,
            },
            {
                title: "long. output is too small",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 1,
                oppositeAmount: 0,
                base: 10000,
                quote: 10001,
            },
            {
                title: "short. output is too small",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 1,
                oppositeAmount: 0,
                base: 10001,
                quote: 10000,
            },
            {
                title: "long revert when insufficient base liquidity",
                isBaseToQuote: false,
                isExactInput: false,
                amount: 10000,
                revertedWith: "",
            },
            {
                title: "short revert when insufficient quote liquidity",
                isBaseToQuote: true,
                isExactInput: false,
                amount: 10000,
                revertedWith: "",
            },
            {
                title: "long revert when insufficient base liquidity over",
                isBaseToQuote: false,
                isExactInput: false,
                amount: 10001,
                revertedWith: PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
            },
            {
                title: "short revert when insufficient quote liquidity over",
                isBaseToQuote: true,
                isExactInput: false,
                amount: 10001,
                revertedWith: PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
            },
            {
                title: "long revert when too large amount",
                isBaseToQuote: false,
                isExactInput: true,
                amount: BigNumber.from(2).pow(256).sub(1),
                revertedWith: PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
            },
            {
                title: "short revert when too large amount",
                isBaseToQuote: true,
                isExactInput: true,
                amount: BigNumber.from(2).pow(256).sub(1),
                revertedWith: PANIC_CODES.ARITHMETIC_UNDER_OR_OVERFLOW,
            },
            {
                title: "liquidity remain when too large long not overflow",
                isBaseToQuote: false,
                isExactInput: true,
                amount: BigNumber.from(2).pow(128),
                oppositeAmount: 9999,
                base: 1,
                quote: BigNumber.from(2).pow(128).add(10000),
            },
            {
                title: "liquidity remain when too large short not overflow",
                isBaseToQuote: true,
                isExactInput: true,
                amount: BigNumber.from(2).pow(128),
                oppositeAmount: 9999,
                base: BigNumber.from(2).pow(128).add(10000),
                quote: 1,
            },
        ].forEach(test => {
            it(test.title, async () => {
                const res = expect(
                    library.swap({
                        isBaseToQuote: test.isBaseToQuote,
                        isExactInput: test.isExactInput,
                        amount: test.amount,
                        feeRatio: 0,
                    }),
                )
                if (test.revertedWith !== void 0) {
                    if (typeof test.revertedWith === "number") {
                        await res.to.revertedWithPanic(test.revertedWith)
                    } else {
                        await res.to.revertedWith(test.revertedWith)
                    }
                } else {
                    await res.to.emit(library, "SwapResult").withArgs(test.oppositeAmount)
                    const poolInfo = await library.poolInfo()
                    expect(poolInfo.base).to.eq(test.base)
                    expect(poolInfo.quote).to.eq(test.quote)
                    expect(poolInfo.totalLiquidity).to.eq(10000)
                    expect(poolInfo.cumBasePerLiquidityX96).to.eq(0)
                    expect(poolInfo.cumQuotePerLiquidityX96).to.eq(0)
                    expect(poolInfo.baseBalancePerShareX96).to.eq(Q96)
                }
            })

            it(test.title + " dry", async () => {
                if (test.revertedWith !== void 0) {
                    const res = expect(
                        library.previewSwap(10000, 10000, {
                            isBaseToQuote: test.isBaseToQuote,
                            isExactInput: test.isExactInput,
                            amount: test.amount,
                            feeRatio: 0,
                        }),
                    )
                    if (typeof test.revertedWith === "number") {
                        await res.to.revertedWithPanic(test.revertedWith)
                    } else {
                        await res.to.revertedWith(test.revertedWith)
                    }
                } else {
                    const res = await library.previewSwap(10000, 10000, {
                        isBaseToQuote: test.isBaseToQuote,
                        isExactInput: test.isExactInput,
                        amount: test.amount,
                        feeRatio: 0,
                    })
                    expect(res).to.eq(test.oppositeAmount)
                }
            })
        })
    })

    describe("with fee, without funding", () => {
        const feeRatio = 1e4

        beforeEach(async () => {
            await library.setPoolInfo({
                base: 10000,
                quote: 10000,
                totalLiquidity: 10000,
                cumBasePerLiquidityX96: 0,
                cumQuotePerLiquidityX96: 0,
                baseBalancePerShareX96: Q96,
            })
        })
        ;[
            {
                title: "long exact input",
                isBaseToQuote: false,
                isExactInput: true,
                amount: 10102,
                oppositeAmount: 5000,
                base: 5000,
                quote: 20102,
            },
            {
                title: "short exact input",
                isBaseToQuote: true,
                isExactInput: true,
                amount: 10102,
                oppositeAmount: 5000,
                base: 20102,
                quote: 5000,
            },
            {
                title: "long exact output",
                isBaseToQuote: false,
                isExactInput: false,
                amount: 5000,
                oppositeAmount: 10102,
                base: 5000,
                quote: 20102,
            },
            {
                title: "short exact input",
                isBaseToQuote: true,
                isExactInput: false,
                amount: 5000,
                oppositeAmount: 10102,
                base: 20102,
                quote: 5000,
            },
        ].forEach(test => {
            it(test.title, async () => {
                await expect(
                    library.swap({
                        isBaseToQuote: test.isBaseToQuote,
                        isExactInput: test.isExactInput,
                        amount: test.amount,
                        feeRatio: feeRatio,
                    }),
                )
                    .to.emit(library, "SwapResult")
                    .withArgs(test.oppositeAmount)
                const poolInfo = await library.poolInfo()
                expect(poolInfo.base).to.eq(test.base)
                expect(poolInfo.quote).to.eq(test.quote)
                expect(poolInfo.totalLiquidity).to.eq(10000)
                expect(poolInfo.cumBasePerLiquidityX96).to.eq(0)
                expect(poolInfo.cumQuotePerLiquidityX96).to.eq(0)
                expect(poolInfo.baseBalancePerShareX96).to.eq(Q96)
            })

            it(test.title + " dry", async () => {
                const res = await library.previewSwap(10000, 10000, {
                    isBaseToQuote: test.isBaseToQuote,
                    isExactInput: test.isExactInput,
                    amount: test.amount,
                    feeRatio: feeRatio,
                })
                expect(res).to.eq(test.oppositeAmount)
            })
        })
    })
})
