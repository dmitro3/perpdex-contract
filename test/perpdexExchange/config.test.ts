import { expect } from "chai"
import { waffle } from "hardhat"
import { TestPerpdexExchange, TestPerpdexMarket } from "../../typechain"
import { createPerpdexExchangeFixture } from "./fixtures"
import { Wallet } from "ethers"
import { MockContract } from "ethereum-waffle"
import IPerpdexMarketJson from "../../artifacts/contracts/interfaces/IPerpdexMarket.sol/IPerpdexMarket.json"
import { MarketStatus } from "../helper/types"

describe("PerpdexExchange config", () => {
    let loadFixture = waffle.createFixtureLoader(waffle.provider.getWallets())
    let fixture

    let exchange: TestPerpdexExchange
    let market: TestPerpdexMarket
    let owner: Wallet
    let alice: Wallet

    beforeEach(async () => {
        fixture = await loadFixture(createPerpdexExchangeFixture())
        exchange = fixture.perpdexExchange
        market = fixture.perpdexMarket
        owner = fixture.owner
        alice = fixture.alice
    })

    describe("initial values", () => {
        it("ok", async () => {
            expect(await exchange.maxMarketsPerAccount()).to.eq(16)
            expect(await exchange.maxOrdersPerAccount()).to.eq(40)
            expect(await exchange.imRatio()).to.eq(10e4)
            expect(await exchange.mmRatio()).to.eq(5e4)
            const liqConfig = await exchange.liquidationRewardConfig()
            expect(liqConfig.rewardRatio).to.eq(20e4)
            expect(liqConfig.smoothEmaTime).to.eq(100)
            expect(await exchange.protocolFeeRatio()).to.eq(0)
        })
    })

    describe("setMaxMarketsPerAccount", () => {
        it("ok", async () => {
            await expect(exchange.connect(owner).setMaxMarketsPerAccount(0))
                .to.emit(exchange, "MaxMarketsPerAccountChanged")
                .withArgs(0)
            expect(await exchange.maxMarketsPerAccount()).to.eq(0)
            await expect(exchange.connect(owner).setMaxMarketsPerAccount(255))
                .to.emit(exchange, "MaxMarketsPerAccountChanged")
                .withArgs(255)
            expect(await exchange.maxMarketsPerAccount()).to.eq(255)
        })

        it("revert when not owner", async () => {
            await expect(exchange.connect(alice).setMaxMarketsPerAccount(1)).to.be.revertedWith(
                "Ownable: caller is not the owner",
            )
        })
    })

    describe("setMaxOrdersPerAccount", () => {
        it("ok", async () => {
            await expect(exchange.connect(owner).setMaxOrdersPerAccount(0))
                .to.emit(exchange, "MaxOrdersPerAccountChanged")
                .withArgs(0)
            expect(await exchange.maxOrdersPerAccount()).to.eq(0)
            await expect(exchange.connect(owner).setMaxOrdersPerAccount(255))
                .to.emit(exchange, "MaxOrdersPerAccountChanged")
                .withArgs(255)
            expect(await exchange.maxOrdersPerAccount()).to.eq(255)
        })

        it("revert when not owner", async () => {
            await expect(exchange.connect(alice).setMaxOrdersPerAccount(1)).to.be.revertedWith(
                "Ownable: caller is not the owner",
            )
        })
    })

    describe("setImRatio", () => {
        it("ok", async () => {
            await expect(exchange.connect(owner).setImRatio(5e4)).to.emit(exchange, "ImRatioChanged").withArgs(5e4)
            expect(await exchange.imRatio()).to.eq(5e4)
            await expect(exchange.connect(owner).setImRatio(1e6 - 1))
                .to.emit(exchange, "ImRatioChanged")
                .withArgs(1e6 - 1)
            expect(await exchange.imRatio()).to.eq(1e6 - 1)
        })

        it("revert when not owner", async () => {
            await expect(exchange.connect(alice).setImRatio(5e4)).to.be.revertedWith("Ownable: caller is not the owner")
        })

        it("revert when too large", async () => {
            await expect(exchange.connect(owner).setImRatio(1e6)).to.be.revertedWith("PE_SIR: too large")
        })

        it("revert when smaller than mm", async () => {
            await expect(exchange.connect(owner).setImRatio(5e4 - 1)).to.be.revertedWith("PE_SIR: smaller than mmRatio")
        })
    })

    describe("setMmRatio", () => {
        it("ok", async () => {
            await expect(exchange.connect(owner).setMmRatio(1)).to.emit(exchange, "MmRatioChanged").withArgs(1)
            expect(await exchange.mmRatio()).to.eq(1)
            await expect(exchange.connect(owner).setMmRatio(10e4)).to.emit(exchange, "MmRatioChanged").withArgs(10e4)
            expect(await exchange.mmRatio()).to.eq(10e4)
        })

        it("revert when not owner", async () => {
            await expect(exchange.connect(alice).setMmRatio(1)).to.be.revertedWith("Ownable: caller is not the owner")
        })

        it("revert when too large", async () => {
            await expect(exchange.connect(owner).setMmRatio(10e4 + 1)).to.be.revertedWith("PE_SMR: bigger than imRatio")
        })

        it("revert when zero", async () => {
            await expect(exchange.connect(owner).setMmRatio(0)).to.be.revertedWith("PE_SMR: zero")
        })
    })

    describe("setLiquidationRewardConfig", () => {
        it("ok", async () => {
            await expect(
                exchange.connect(owner).setLiquidationRewardConfig({
                    rewardRatio: 0,
                    smoothEmaTime: 1,
                }),
            )
                .to.emit(exchange, "LiquidationRewardConfigChanged")
                .withArgs(0, 1)
            const config = await exchange.liquidationRewardConfig()
            expect(config.rewardRatio).to.eq(0)
            expect(config.smoothEmaTime).to.eq(1)
            await expect(
                exchange.connect(owner).setLiquidationRewardConfig({
                    rewardRatio: 1e6 - 1,
                    smoothEmaTime: 65535,
                }),
            )
                .to.emit(exchange, "LiquidationRewardConfigChanged")
                .withArgs(1e6 - 1, 65535)
            const config2 = await exchange.liquidationRewardConfig()
            expect(config2.rewardRatio).to.eq(1e6 - 1)
            expect(config2.smoothEmaTime).to.eq(65535)
        })

        it("revert when not owner", async () => {
            await expect(
                exchange.connect(alice).setLiquidationRewardConfig({
                    rewardRatio: 0,
                    smoothEmaTime: 1,
                }),
            ).to.be.revertedWith("Ownable: caller is not the owner")
        })

        it("revert when too large", async () => {
            await expect(
                exchange.connect(owner).setLiquidationRewardConfig({
                    rewardRatio: 1e6,
                    smoothEmaTime: 1,
                }),
            ).to.be.revertedWith("PE_SLRC: too large reward ratio")
        })

        it("revert when smoothEmaTime zero", async () => {
            await expect(
                exchange.connect(owner).setLiquidationRewardConfig({
                    rewardRatio: 0,
                    smoothEmaTime: 0,
                }),
            ).to.be.revertedWith("PE_SLRC: ema time is zero")
        })
    })

    describe("setProtocolFeeRatio", () => {
        it("ok", async () => {
            await expect(exchange.connect(owner).setProtocolFeeRatio(0))
                .to.emit(exchange, "ProtocolFeeRatioChanged")
                .withArgs(0)
            expect(await exchange.protocolFeeRatio()).to.eq(0)
            await expect(exchange.connect(owner).setProtocolFeeRatio(1e4))
                .to.emit(exchange, "ProtocolFeeRatioChanged")
                .withArgs(1e4)
            expect(await exchange.protocolFeeRatio()).to.eq(1e4)
        })

        it("revert when not owner", async () => {
            await expect(exchange.connect(alice).setProtocolFeeRatio(1)).to.be.revertedWith(
                "Ownable: caller is not the owner",
            )
        })

        it("revert when too large", async () => {
            await expect(exchange.connect(owner).setProtocolFeeRatio(1e4 + 1)).to.be.revertedWith("PE_SPFR: too large")
        })
    })

    describe("setMarketStatus", () => {
        it("open", async () => {
            await expect(exchange.connect(owner).setMarketStatus(market.address, MarketStatus.Open))
                .to.emit(exchange, "MarketStatusChanged")
                .withArgs(market.address, MarketStatus.Open)
            expect(await exchange.marketStatuses(market.address)).to.eq(MarketStatus.Open)
        })

        it("close", async () => {
            await exchange.connect(owner).setMarketStatus(market.address, MarketStatus.Open)

            await expect(exchange.connect(owner).setMarketStatus(market.address, MarketStatus.Closed))
                .to.emit(exchange, "MarketStatusChanged")
                .withArgs(market.address, MarketStatus.Closed)
            expect(await exchange.marketStatuses(market.address)).to.eq(MarketStatus.Closed)
        })

        it("revert when NotAllowed -> Closed", async () => {
            await expect(
                exchange.connect(owner).setMarketStatus(market.address, MarketStatus.Closed),
            ).to.be.revertedWith("PE_CMO: market not open")
        })

        it("revert when Open -> NotAllowed", async () => {
            await exchange.setMarketStatusForce(market.address, MarketStatus.Open)
            await expect(
                exchange.connect(owner).setMarketStatus(market.address, MarketStatus.NotAllowed),
            ).to.be.revertedWith("PE_SIMA: invalid status")
        })

        it("revert when Closed -> NotAllowed", async () => {
            await exchange.setMarketStatusForce(market.address, MarketStatus.Closed)
            await expect(
                exchange.connect(owner).setMarketStatus(market.address, MarketStatus.NotAllowed),
            ).to.be.revertedWith("PE_SIMA: invalid status")
        })

        it("revert when Closed -> Open", async () => {
            await exchange.setMarketStatusForce(market.address, MarketStatus.Closed)
            await expect(exchange.connect(owner).setMarketStatus(market.address, MarketStatus.Open)).to.be.revertedWith(
                "PE_SIMA: market closed",
            )
        })

        it("revert when not owner", async () => {
            await expect(exchange.connect(alice).setMarketStatus(market.address, MarketStatus.Open)).to.be.revertedWith(
                "Ownable: caller is not the owner",
            )
        })

        it("revert when invalid address", async () => {
            await expect(exchange.connect(owner).setMarketStatus(alice.address, MarketStatus.Open)).to.be.revertedWith(
                "PE_SIMA: market address invalid",
            )
        })

        describe("different exchange", () => {
            let marketDifferentExchange: MockContract

            beforeEach(async () => {
                marketDifferentExchange = await waffle.deployMockContract(owner, IPerpdexMarketJson.abi)
                await marketDifferentExchange.mock.exchange.returns(alice.address)
            })

            it("revert when open", async () => {
                await expect(
                    exchange.connect(owner).setMarketStatus(marketDifferentExchange.address, MarketStatus.Open),
                ).to.revertedWith("PE_SIMA: different exchange")
            })

            it("not revert when disable", async () => {
                await exchange.connect(owner).setMarketStatusForce(marketDifferentExchange.address, MarketStatus.Open)

                await expect(
                    exchange.connect(owner).setMarketStatus(marketDifferentExchange.address, MarketStatus.Closed),
                )
                    .to.emit(exchange, "MarketStatusChanged")
                    .withArgs(marketDifferentExchange.address, MarketStatus.Closed)
                expect(await exchange.marketStatuses(marketDifferentExchange.address)).to.eq(MarketStatus.Closed)
            })
        })
    })
})
