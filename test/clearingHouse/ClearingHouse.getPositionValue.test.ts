import { parseEther } from "@ethersproject/units"
import { expect } from "chai"
import { waffle } from "hardhat"
import { ClearingHouse, TestERC20, UniswapV3Pool, Vault } from "../../typechain"
import { BaseToken } from "../../typechain/BaseToken"
import { deposit } from "../helper/token"
import { encodePriceSqrt } from "../shared/utilities"
import { BaseQuoteOrdering, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse.getPositionValue", () => {
    const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000"
    const [admin, alice, bob, carol] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let clearingHouse: ClearingHouse
    let vault: Vault
    let collateral: TestERC20
    let baseToken: BaseToken
    let quoteToken: BaseToken
    let pool: UniswapV3Pool

    beforeEach(async () => {
        const _clearingHouseFixture = await loadFixture(createClearingHouseFixture(BaseQuoteOrdering.BASE_0_QUOTE_1))
        clearingHouse = _clearingHouseFixture.clearingHouse
        vault = _clearingHouseFixture.vault
        collateral = _clearingHouseFixture.USDC
        baseToken = _clearingHouseFixture.baseToken
        quoteToken = _clearingHouseFixture.quoteToken
        pool = _clearingHouseFixture.pool

        await clearingHouse.addPool(baseToken.address, "10000")

        // alice
        await collateral.mint(alice.address, parseEther("10000"))
        await deposit(alice, vault, 10000, collateral)

        await clearingHouse.connect(alice).mint(quoteToken.address, parseEther("1000"))
        await clearingHouse.connect(alice).mint(baseToken.address, parseEther("10"))

        // bob
        await collateral.mint(bob.address, parseEther("1000"))
        await deposit(bob, vault, 1000, collateral)
        await clearingHouse.connect(bob).mint(quoteToken.address, parseEther("1000"))
        await clearingHouse.connect(bob).mint(baseToken.address, parseEther("10"))

        // carol
        await collateral.mint(carol.address, parseEther("1000"))
        await deposit(carol, vault, 1000, collateral)
        await clearingHouse.connect(carol).mint(baseToken.address, parseEther("10"))
    })

    async function forward(seconds: number) {
        const lastTimestamp = (await waffle.provider.getBlock("latest")).timestamp
        await waffle.provider.send("evm_setNextBlockTimestamp", [lastTimestamp + seconds])
        await waffle.provider.send("evm_mine", [])
    }

    // see more desc in getPositionSize test
    it("value = 0, if position size = 0", async () => {
        // initial price at 50200 == 151.3733069
        await pool.initialize(encodePriceSqrt("151.3733069", "1"))

        expect(await clearingHouse.getPositionSize(alice.address, baseToken.address)).eq(0)
        expect(await clearingHouse.getPositionValue(alice.address, baseToken.address, 0)).eq(0)

        await clearingHouse.connect(alice).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("0"),
            quote: parseEther("122.414646"),
            lowerTick: 50000,
            upperTick: 50200,
        })

        expect(await clearingHouse.getPositionSize(alice.address, baseToken.address)).eq(0)
        expect(await clearingHouse.getPositionValue(alice.address, baseToken.address, 0)).eq(0)
    })

    it("bob(taker) swaps 1 time", async () => {
        // initial price at 50200 == 151.3733069
        await pool.initialize(encodePriceSqrt("151.3733069", "1"))

        // provide 1000 liquidity = 1000 * 0.122414646 = 122.414646
        await clearingHouse.connect(alice).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("0"),
            quote: parseEther("122.414646"),
            lowerTick: 50000,
            upperTick: 50200,
        })

        // bob short 0.4084104205
        await clearingHouse.connect(bob).swap({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: true,
            amount: parseEther("0.4084104205"),
            sqrtPriceLimitX96: 0,
        })

        // B2QFee: Bob is down 0.4084104205 base tokens and Alice received it full because she's the sole LP
        // Note CH actually shorts 0.4084104205 / 0.99 = 0.4125357783 base tokens
        // but the extra tokens have been collected as base token fees and does not count toward Alice's position size.

        // which makes the mark price become 149.863446 (tick = 50099.75001)

        // if we get sqrtMarkTwapX96 with timeInterval == 0, the value should be same as the initial price = 151.3733069
        // await clearingHouse.getSqrtMarkTwapX96(baseToken.address, 0)).toString() == 11993028956124528295336454433927
        // (11993028956124528295336454433927 / 2^96) = 151.3733068587
        // -> no need to pow(151.3733068587, 2) here as the initial value is already powered in their system, for unknown reason

        // default timeInterval is 15 minutes = 900 seconds
        await forward(900)

        // (969864706335398656864177991756 / 2^96) ^ 2 = 149.8522069973
        // 149.8522069973 != 149.863446, the reason is:
        // tickCumulative inside their system uses "integer" tick
        // thus,
        // 1. instead of the exact mark price 149.863446, whose tick index is 50099.75001 -> floor() -> 50099
        // 2. when considering the accumulator, we also need floor(): (50099 * 900 / 900) = 50099 -> floor() -> 50099
        // -> 1.0001 ^ 50099 = 149.8522069974
        expect(await clearingHouse.getSqrtMarkTwapX96(baseToken.address, 900)).eq("969864706335398656864177991756")

        expect(await clearingHouse.getPositionSize(alice.address, baseToken.address)).eq(
            // TODO are we concerned that there is a 1 wei difference between Alice vs Bob's position sizes?
            parseEther("0.408410420499999999"),
        )
        // 149.8522069974 * 0.408410420499999999 = 61.2012028727
        expect(await clearingHouse.getPositionValue(alice.address, baseToken.address, 900)).eq(
            parseEther("61.201202872670638396"),
        )

        expect(await clearingHouse.getPositionSize(bob.address, baseToken.address)).eq(parseEther("-0.4084104205"))
        // 149.8522069974 * -0.4084104205 = -61.2012028727
        expect(await clearingHouse.getPositionValue(bob.address, baseToken.address, 900)).eq(
            parseEther("-61.201202872670638545"),
        )
    })

    it("bob swaps 2 time", async () => {
        // initial price at 50200 == 151.3733069
        await pool.initialize(encodePriceSqrt("151.3733069", "1"))
        // the initial number of oracle can be recorded is 1; thus, have to expand it
        await pool.increaseObservationCardinalityNext((2 ^ 16) - 1)

        // provide 1000 liquidity = 1000 * 0.122414646 = 122.414646
        await clearingHouse.connect(alice).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("0"),
            quote: parseEther("122.414646"),
            lowerTick: 50000,
            upperTick: 50200,
        })

        // bob shorts 0.2042052103
        await clearingHouse.connect(bob).swap({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: true,
            amount: parseEther("0.2042052103"),
            sqrtPriceLimitX96: 0,
        })
        // mark price should be 150.6155385 (tick = 50149.8122)

        await forward(300)

        // bob shorts 0.2042052103
        await clearingHouse.connect(bob).swap({
            baseToken: baseToken.address,
            isBaseToQuote: true,
            isExactInput: true,
            amount: parseEther("0.2042052103"),
            sqrtPriceLimitX96: 0,
        })

        // B2QFee: Bob is down 0.4084104205 base tokens and Alice received it full because she's the sole LP
        // Note CH actually shorts 0.2042052103 * 2 / 0.99 = 0.4125357784 base tokens
        // but the extra tokens have been collected as base token fees and does not count toward Alice's position size.

        // which makes the mark price become 149.863446 (tick = 50099.75001)

        await forward(600)

        // (970640869716903962852171321230 / 2^96) ^ 2 = 150.0921504352
        // ((50149 * 300 + 50099 * 600) / 900) = 50115.6666666667 -> floor() -> 50115
        // -> 1.0001 ^ 50115 = 150.0921504352
        expect(await clearingHouse.getSqrtMarkTwapX96(baseToken.address, 900)).eq("970640869716903962852171321230")

        expect(await clearingHouse.getPositionSize(alice.address, baseToken.address)).eq(
            // TODO are we concerned that there is a 1 wei difference between Alice vs Bob's position sizes?
            parseEther("0.408410420599999999"),
        )
        // 150.0921504352 * 0.408410420499999999 = 61.299198273
        expect(await clearingHouse.getPositionValue(alice.address, baseToken.address, 900)).eq(
            parseEther("61.299198288003388566"),
        )

        // short
        expect(await clearingHouse.getPositionSize(bob.address, baseToken.address)).eq(parseEther("-0.4084104206"))
        // 150.0921504352 * -0.4084104206 = -61.299198288
        expect(await clearingHouse.getPositionValue(bob.address, baseToken.address, 900)).eq(
            parseEther("-61.299198288003388716"),
        )
    })

    it("bob swaps 2 time, while the second time is out of carol's range", async () => {
        // initial price at 50200 == 151.3733069
        await pool.initialize(encodePriceSqrt("148.3760629", "1"))
        // the initial number of oracle can be recorded is 1; thus, have to expand it
        await pool.increaseObservationCardinalityNext((2 ^ 16) - 1)

        const lowerTick = "50000"
        const middleTick = "50200"
        const upperTick = "50400"
        const baseIn50000And50200 = 0.816820841
        const baseIn50200And50400 = 0.8086937422

        // add base
        // 0.816820841 + 0.8086937422 = 1.625514583
        const addLiquidityParamsAlice = {
            baseToken: baseToken.address,
            lowerTick: lowerTick, // 148.3760629
            upperTick: upperTick, // 154.4310961
            base: parseEther((baseIn50000And50200 + baseIn50200And50400).toString()),
            quote: "0",
        }
        await clearingHouse.connect(alice).addLiquidity(addLiquidityParamsAlice)

        // add base
        const addLiquidityParamsCarol = {
            baseToken: baseToken.address,
            lowerTick: lowerTick, // 148.3760629
            upperTick: middleTick, // 151.3733069
            base: parseEther(baseIn50000And50200.toString()),
            quote: "0",
        }
        await clearingHouse.connect(carol).addLiquidity(addLiquidityParamsCarol)

        // bob wants to swap
        // quote: (244.829292 + 98.91589745) / 0.99 = 247.3023151515 + 99.9150479293 = 347.2173633
        // to base: 1.633641682 + 0.6482449586 = 2.281886641

        // first swap: 247.3023151515 quote to 1.633641682 base
        const swapParams1 = {
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("247.3023151515"),
            sqrtPriceLimitX96: "0",
        }
        await clearingHouse.connect(bob).swap(swapParams1)
        // mark price should be 151.3733069 (tick = 50200)

        await forward(400)

        // second swap: 99.9150479293 quote to 0.6482449586 base
        const swapParams2 = {
            baseToken: baseToken.address,
            isBaseToQuote: false,
            isExactInput: true,
            amount: parseEther("99.9150479293"),
            sqrtPriceLimitX96: "0",
        }
        await clearingHouse.connect(bob).swap(swapParams2)
        // mark price should be 153.8170921 (tick = 50360.15967)

        await forward(500)

        // (979072907636267862275708019389 / 2^96) ^ 2 = 152.7112031757
        // ((50200 * 400 + 50360 * 500) / 900) = 50288.8888888889 -> floor() -> 50288
        // -> 1.0001 ^ 50288 = 152.7112031757
        expect(await clearingHouse.getSqrtMarkTwapX96(baseToken.address, 900)).eq("979072907636267862275708019389")

        // -(1.633641682 / 2 + 0.6482449586) = -1.4650657996
        expect(await clearingHouse.getPositionSize(alice.address, baseToken.address)).eq(
            parseEther("-1.465065799750044640"),
        )
        // 152.7112031757 * -1.465065799750044640 = -223.7319610114
        expect(await clearingHouse.getPositionValue(alice.address, baseToken.address, 900)).eq(
            parseEther("-223.731961011436156199"),
        )

        // 1.633641682 + 0.6482449586 = 2.2818866406
        expect(await clearingHouse.getPositionSize(bob.address, baseToken.address)).eq(
            parseEther("2.281886640750044638"),
        )
        // 152.7112031757 * 2.281886640750044638 = 348.4696544195
        expect(await clearingHouse.getPositionValue(bob.address, baseToken.address, 900)).eq(
            parseEther("348.469654419554307847"),
        )

        // -1.633641682 / 2 = -0.816820841
        expect(await clearingHouse.getPositionSize(carol.address, baseToken.address)).eq(parseEther("-0.816820841"))
        // 152.7112031757 * -0.816820841 = -124.7376934081
        expect(await clearingHouse.getPositionValue(carol.address, baseToken.address, 900)).eq(
            parseEther("-124.737693408118151953"),
        )
    })
})

// // === useful console.log for verifying stats ===
// console.log("getSqrtMarkTwapX96")
// console.log((await clearingHouse.getSqrtMarkTwapX96(baseToken.address, 900)).toString())

// console.log("alice")
// console.log("getPositionSize")
// console.log((await clearingHouse.getPositionSize(alice.address, baseToken.address)).toString())
// console.log("getPositionValue")
// console.log((await clearingHouse.getPositionValue(alice.address, baseToken.address, 900)).toString())

// console.log("bob")
// console.log("getPositionSize")
// console.log((await clearingHouse.getPositionSize(bob.address, baseToken.address)).toString())
// console.log("getPositionValue")
// console.log((await clearingHouse.getPositionValue(bob.address, baseToken.address, 900)).toString())
// // === useful console.log for verifying stats ===