// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { Multicall } from "@openzeppelin/contracts/utils/Multicall.sol";
import { IPerpdexExchange } from "./interfaces/IPerpdexExchange.sol";
import { IPerpdexMarketMinimum } from "./interfaces/IPerpdexMarketMinimum.sol";
import { PerpdexStructs } from "./lib/PerpdexStructs.sol";
import { AccountLibrary } from "./lib/AccountLibrary.sol";
import { MakerLibrary } from "./lib/MakerLibrary.sol";
import { MakerOrderBookLibrary } from "./lib/MakerOrderBookLibrary.sol";
import { TakerLibrary } from "./lib/TakerLibrary.sol";
import { VaultLibrary } from "./lib/VaultLibrary.sol";
import { PerpMath } from "./lib/PerpMath.sol";

contract PerpdexExchange is IPerpdexExchange, ReentrancyGuard, Ownable, Multicall {
    using Address for address;
    using PerpMath for int256;
    using PerpMath for uint256;
    using SafeCast for uint256;

    // states
    // trader
    mapping(address => PerpdexStructs.AccountInfo) public accountInfos;
    PerpdexStructs.InsuranceFundInfo public insuranceFundInfo;
    PerpdexStructs.ProtocolInfo public protocolInfo;
    // market, isBid, orderId, trader
    mapping(address => mapping(bool => mapping(uint40 => address))) public orderIdToTrader;

    // config
    address public immutable settlementToken;
    uint8 public constant quoteDecimals = 18;
    uint8 public maxMarketsPerAccount = 16;
    uint8 public maxOrdersPerAccount = 40;
    uint24 public imRatio = 10e4;
    uint24 public mmRatio = 5e4;
    uint24 public protocolFeeRatio = 0;
    PerpdexStructs.LiquidationRewardConfig public liquidationRewardConfig =
        PerpdexStructs.LiquidationRewardConfig({ rewardRatio: 20e4, smoothEmaTime: 100 });
    mapping(address => PerpdexStructs.MarketStatus) public marketStatuses;

    modifier checkDeadline(uint256 deadline) {
        _checkDeadline(deadline);
        _;
    }

    modifier checkMarketOpen(address market) {
        _checkMarketOpen(market);
        _;
    }

    modifier checkMarketClosed(address market) {
        _checkMarketClosed(market);
        _;
    }

    constructor(
        address ownerArg,
        address settlementTokenArg,
        address[] memory initialMarkets
    ) {
        _transferOwnership(ownerArg);
        require(settlementTokenArg == address(0) || settlementTokenArg.isContract(), "PE_C: token address invalid");

        settlementToken = settlementTokenArg;

        for (uint256 i = 0; i < initialMarkets.length; ++i) {
            _setMarketStatus(initialMarkets[i], PerpdexStructs.MarketStatus.Open);
        }
    }

    function deposit(uint256 amount) external payable nonReentrant {
        address trader = _msgSender();
        _settleLimitOrders(trader);

        uint256 compensation = VaultLibrary.compensate(accountInfos[trader], insuranceFundInfo);
        if (compensation != 0) {
            emit CollateralCompensated(trader, compensation);
        }

        uint256 depositedAmount =
            VaultLibrary.deposit(
                accountInfos[trader],
                VaultLibrary.DepositParams({
                    settlementToken: settlementToken,
                    amount: amount,
                    callValue: msg.value,
                    from: trader
                })
            );

        emit Deposited(trader, depositedAmount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        address payable trader = payable(_msgSender());
        _settleLimitOrders(trader);

        VaultLibrary.withdraw(
            accountInfos[trader],
            VaultLibrary.WithdrawParams({
                settlementToken: settlementToken,
                amount: amount,
                to: trader,
                imRatio: imRatio
            })
        );
        emit Withdrawn(trader, amount);
    }

    function transferProtocolFee(uint256 amount) external onlyOwner nonReentrant {
        address trader = _msgSender();
        _settleLimitOrders(trader);
        VaultLibrary.transferProtocolFee(accountInfos[trader], protocolInfo, amount);
        emit ProtocolFeeTransferred(trader, amount);
    }

    function trade(TradeParams calldata params)
        external
        nonReentrant
        checkDeadline(params.deadline)
        checkMarketOpen(params.market)
        returns (uint256 oppositeAmount)
    {
        return _trade(params);
    }

    function addLiquidity(AddLiquidityParams calldata params)
        external
        nonReentrant
        checkDeadline(params.deadline)
        checkMarketOpen(params.market)
        returns (
            uint256 base,
            uint256 quote,
            uint256 liquidity
        )
    {
        address trader = _msgSender();
        _settleLimitOrders(trader);

        MakerLibrary.AddLiquidityResponse memory response =
            MakerLibrary.addLiquidity(
                accountInfos[trader],
                MakerLibrary.AddLiquidityParams({
                    market: params.market,
                    base: params.base,
                    quote: params.quote,
                    minBase: params.minBase,
                    minQuote: params.minQuote,
                    imRatio: imRatio,
                    maxMarketsPerAccount: maxMarketsPerAccount
                })
            );

        PerpdexStructs.MakerInfo storage makerInfo = accountInfos[trader].makerInfos[params.market];
        emit LiquidityAdded(
            trader,
            params.market,
            response.base,
            response.quote,
            response.liquidity,
            makerInfo.cumBaseSharePerLiquidityX96,
            makerInfo.cumQuotePerLiquidityX96
        );

        return (response.base, response.quote, response.liquidity);
    }

    function removeLiquidity(RemoveLiquidityParams calldata params)
        external
        nonReentrant
        checkDeadline(params.deadline)
        checkMarketOpen(params.market)
        returns (uint256 base, uint256 quote)
    {
        _settleLimitOrders(params.trader);

        MakerLibrary.RemoveLiquidityResponse memory response =
            MakerLibrary.removeLiquidity(
                accountInfos[params.trader],
                MakerLibrary.RemoveLiquidityParams({
                    market: params.market,
                    liquidity: params.liquidity,
                    minBase: params.minBase,
                    minQuote: params.minQuote,
                    isSelf: params.trader == _msgSender(),
                    mmRatio: mmRatio,
                    maxMarketsPerAccount: maxMarketsPerAccount
                })
            );

        emit LiquidityRemoved(
            params.trader,
            params.market,
            response.isLiquidation ? _msgSender() : address(0),
            response.base,
            response.quote,
            params.liquidity,
            response.takerBase,
            response.takerQuote,
            response.realizedPnl
        );

        return (response.base, response.quote);
    }

    function createLimitOrder(CreateLimitOrderParams calldata params)
        external
        nonReentrant
        checkDeadline(params.deadline)
        checkMarketOpen(params.market)
        returns (
            uint40 orderId,
            uint256 baseTaker,
            uint256 quoteTaker
        )
    {
        address trader = _msgSender();

        if (params.limitOrderType != PerpdexStructs.LimitOrderType.PostOnly) {
            bool isBaseToQuote = !params.isBid;
            uint256 maxAmount =
                IPerpdexMarketMinimum(params.market).maxSwapByPrice(isBaseToQuote, isBaseToQuote, params.priceX96);
            baseTaker = Math.min(maxAmount, params.base);

            if (baseTaker != 0) {
                quoteTaker = _trade(
                    TradeParams({
                        trader: trader,
                        market: params.market,
                        isBaseToQuote: isBaseToQuote,
                        isExactInput: isBaseToQuote,
                        amount: baseTaker,
                        oppositeAmountBound: isBaseToQuote ? 0 : type(uint256).max,
                        deadline: 0 // ignored
                    })
                );
            }
        }

        if (params.base == baseTaker || params.limitOrderType == PerpdexStructs.LimitOrderType.Ioc)
            return (0, baseTaker, quoteTaker);

        _settleLimitOrders(trader);

        orderId = MakerOrderBookLibrary.createLimitOrder(
            accountInfos[trader],
            MakerOrderBookLibrary.CreateLimitOrderParams({
                market: params.market,
                isBid: params.isBid,
                base: params.base - baseTaker,
                priceX96: params.priceX96,
                imRatio: imRatio,
                maxMarketsPerAccount: maxMarketsPerAccount,
                maxOrdersPerAccount: maxOrdersPerAccount,
                ignorePostOnlyCheck: params.limitOrderType == PerpdexStructs.LimitOrderType.Normal
            })
        );

        orderIdToTrader[params.market][params.isBid][orderId] = trader;
        emit LimitOrderCreated(
            trader,
            params.market,
            params.isBid,
            params.base,
            params.priceX96,
            params.limitOrderType,
            orderId,
            baseTaker
        );
    }

    function cancelLimitOrder(CancelLimitOrderParams calldata params)
        external
        nonReentrant
        checkDeadline(params.deadline)
        checkMarketOpen(params.market)
    {
        address trader = orderIdToTrader[params.market][params.isBid][params.orderId];
        require(trader != address(0), "PE_CLO: order not exist");
        _settleLimitOrders(trader);

        bool isLiquidation =
            MakerOrderBookLibrary.cancelLimitOrder(
                accountInfos[trader],
                MakerOrderBookLibrary.CancelLimitOrderParams({
                    market: params.market,
                    isBid: params.isBid,
                    orderId: params.orderId,
                    isSelf: trader == _msgSender(),
                    mmRatio: mmRatio,
                    maxMarketsPerAccount: maxMarketsPerAccount
                })
            );

        emit LimitOrderCanceled(
            trader,
            params.market,
            isLiquidation ? _msgSender() : address(0),
            params.isBid,
            params.orderId
        );
    }

    function closeMarket(address market) external nonReentrant checkMarketClosed(market) {
        address trader = _msgSender();
        _settleLimitOrders(trader);
        (int256 positionValue, int256 realizedPnl) = AccountLibrary.closeMarket(accountInfos[trader], market);
        emit MarketClosed(trader, market, positionValue, realizedPnl);
    }

    function _settleLimitOrders(address trader) internal {
        address[] storage markets = accountInfos[trader].markets;
        uint256 i = markets.length;
        while (i > 0) {
            --i;
            _settleLimitOrders(trader, markets[i]);
        }
    }

    function _settleLimitOrders(address trader, address market) internal {
        MakerOrderBookLibrary.SettleLimitOrdersResponse memory response =
            MakerOrderBookLibrary.settleLimitOrders(accountInfos[trader], market, maxMarketsPerAccount);
        if (response.base != 0 || response.quote != 0 || response.realizedPnl != 0) {
            emit LimitOrderSettled(trader, market, response.base, response.quote, response.realizedPnl);
        }
    }

    function setMaxMarketsPerAccount(uint8 value) external onlyOwner nonReentrant {
        maxMarketsPerAccount = value;
        emit MaxMarketsPerAccountChanged(value);
    }

    function setMaxOrdersPerAccount(uint8 value) external onlyOwner nonReentrant {
        maxOrdersPerAccount = value;
        emit MaxOrdersPerAccountChanged(value);
    }

    function setImRatio(uint24 value) external onlyOwner nonReentrant {
        require(value < 1e6, "PE_SIR: too large");
        require(value >= mmRatio, "PE_SIR: smaller than mmRatio");
        imRatio = value;
        emit ImRatioChanged(value);
    }

    function setMmRatio(uint24 value) external onlyOwner nonReentrant {
        require(value <= imRatio, "PE_SMR: bigger than imRatio");
        require(value > 0, "PE_SMR: zero");
        mmRatio = value;
        emit MmRatioChanged(value);
    }

    function setLiquidationRewardConfig(PerpdexStructs.LiquidationRewardConfig calldata value)
        external
        onlyOwner
        nonReentrant
    {
        require(value.rewardRatio < 1e6, "PE_SLRC: too large reward ratio");
        require(value.smoothEmaTime > 0, "PE_SLRC: ema time is zero");
        liquidationRewardConfig = value;
        emit LiquidationRewardConfigChanged(value.rewardRatio, value.smoothEmaTime);
    }

    function setProtocolFeeRatio(uint24 value) external onlyOwner nonReentrant {
        require(value <= 1e4, "PE_SPFR: too large");
        protocolFeeRatio = value;
        emit ProtocolFeeRatioChanged(value);
    }

    function setMarketStatus(address market, PerpdexStructs.MarketStatus status) external onlyOwner nonReentrant {
        _setMarketStatus(market, status);
    }

    // all raw information can be retrieved through getters (including default getters)

    function getTakerInfo(address trader, address market) external view returns (PerpdexStructs.TakerInfo memory) {
        return accountInfos[trader].takerInfos[market];
    }

    function getMakerInfo(address trader, address market) external view returns (PerpdexStructs.MakerInfo memory) {
        return accountInfos[trader].makerInfos[market];
    }

    function getAccountMarkets(address trader) external view returns (address[] memory) {
        return accountInfos[trader].markets;
    }

    function getLimitOrderInfo(address trader, address market)
        external
        view
        returns (
            uint40 askRoot,
            uint40 bidRoot,
            uint256 totalBaseAsk,
            uint256 totalBaseBid
        )
    {
        PerpdexStructs.LimitOrderInfo storage info = accountInfos[trader].limitOrderInfos[market];
        return (info.ask.root, info.bid.root, info.totalBaseAsk, info.totalBaseBid);
    }

    function getLimitOrderIds(
        address trader,
        address market,
        bool isBid
    ) external view returns (uint40[] memory) {
        return MakerOrderBookLibrary.getLimitOrderIds(accountInfos[trader], market, isBid);
    }

    // dry run

    function previewTrade(PreviewTradeParams calldata params)
        external
        view
        checkMarketOpen(params.market)
        returns (uint256 oppositeAmount)
    {
        address trader = params.trader;
        address caller = params.caller;

        return
            TakerLibrary.previewTrade(
                accountInfos[trader],
                TakerLibrary.PreviewTradeParams({
                    market: params.market,
                    isBaseToQuote: params.isBaseToQuote,
                    isExactInput: params.isExactInput,
                    amount: params.amount,
                    oppositeAmountBound: params.oppositeAmountBound,
                    mmRatio: mmRatio,
                    protocolFeeRatio: protocolFeeRatio,
                    isSelf: trader == caller
                })
            );
    }

    function maxTrade(MaxTradeParams memory params) external view returns (uint256 amount) {
        if (marketStatuses[params.market] != PerpdexStructs.MarketStatus.Open) return 0;

        address trader = params.trader;
        address caller = params.caller;

        return
            TakerLibrary.maxTrade({
                accountInfo: accountInfos[trader],
                market: params.market,
                isBaseToQuote: params.isBaseToQuote,
                isExactInput: params.isExactInput,
                mmRatio: mmRatio,
                protocolFeeRatio: protocolFeeRatio,
                isSelf: trader == caller
            });
    }

    // convenient getters

    function getTakerInfoLazy(address trader, address market) external view returns (PerpdexStructs.TakerInfo memory) {
        return AccountLibrary.getTakerInfo(accountInfos[trader], market);
    }

    function getCollateralBalance(address trader) external view returns (int256) {
        return AccountLibrary.getCollateralBalance(accountInfos[trader]);
    }

    function getTotalAccountValue(address trader) external view returns (int256) {
        return AccountLibrary.getTotalAccountValue(accountInfos[trader]);
    }

    function getPositionShare(address trader, address market) external view returns (int256) {
        return AccountLibrary.getPositionShare(accountInfos[trader], market);
    }

    function getPositionNotional(address trader, address market) external view returns (int256) {
        return AccountLibrary.getPositionNotional(accountInfos[trader], market);
    }

    function getTotalPositionNotional(address trader) external view returns (uint256) {
        return AccountLibrary.getTotalPositionNotional(accountInfos[trader]);
    }

    function getOpenPositionShare(address trader, address market) external view returns (uint256) {
        return AccountLibrary.getOpenPositionShare(accountInfos[trader], market);
    }

    function getOpenPositionNotional(address trader, address market) external view returns (uint256) {
        return AccountLibrary.getOpenPositionNotional(accountInfos[trader], market);
    }

    function getTotalOpenPositionNotional(address trader) external view returns (uint256) {
        return AccountLibrary.getTotalOpenPositionNotional(accountInfos[trader]);
    }

    function hasEnoughMaintenanceMargin(address trader) external view returns (bool) {
        return AccountLibrary.hasEnoughMaintenanceMargin(accountInfos[trader], mmRatio);
    }

    function hasEnoughInitialMargin(address trader) external view returns (bool) {
        return AccountLibrary.hasEnoughInitialMargin(accountInfos[trader], imRatio);
    }

    function isLiquidationFree(address trader) external view returns (bool) {
        return AccountLibrary.isLiquidationFree(accountInfos[trader]);
    }

    function getLimitOrderSummaries(
        address trader,
        address market,
        bool isBid
    ) external view returns (PerpdexStructs.LimitOrderSummary[] memory) {
        return MakerOrderBookLibrary.getLimitOrderSummaries(accountInfos[trader], market, isBid);
    }

    // for avoiding stack too deep error
    function _trade(TradeParams memory params) private returns (uint256 oppositeAmount) {
        _settleLimitOrders(params.trader);
        TakerLibrary.TradeResponse memory response =
            TakerLibrary.trade(
                accountInfos[params.trader],
                accountInfos[_msgSender()].vaultInfo,
                insuranceFundInfo,
                protocolInfo,
                TakerLibrary.TradeParams({
                    market: params.market,
                    isBaseToQuote: params.isBaseToQuote,
                    isExactInput: params.isExactInput,
                    amount: params.amount,
                    oppositeAmountBound: params.oppositeAmountBound,
                    mmRatio: mmRatio,
                    imRatio: imRatio,
                    maxMarketsPerAccount: maxMarketsPerAccount,
                    protocolFeeRatio: protocolFeeRatio,
                    liquidationRewardConfig: liquidationRewardConfig,
                    isSelf: params.trader == _msgSender()
                })
            );

        if (response.rawResponse.partialOrderId != 0) {
            address partialTrader =
                orderIdToTrader[params.market][params.isBaseToQuote][response.rawResponse.partialOrderId];
            _settleLimitOrders(partialTrader, params.market);
            int256 partialRealizedPnl =
                MakerOrderBookLibrary.processPartialExecution(
                    accountInfos[partialTrader],
                    params.market,
                    params.isBaseToQuote,
                    maxMarketsPerAccount,
                    response.rawResponse
                );

            emit PartiallyExecuted(
                partialTrader,
                params.market,
                params.isBaseToQuote,
                response.rawResponse.basePartial,
                response.rawResponse.quotePartial,
                partialRealizedPnl
            );
        }

        uint256 baseBalancePerShareX96 = IPerpdexMarketMinimum(params.market).baseBalancePerShareX96();
        uint256 shareMarkPriceAfterX96 = IPerpdexMarketMinimum(params.market).getShareMarkPriceX96();

        if (response.isLiquidation) {
            emit PositionLiquidated(
                params.trader,
                params.market,
                _msgSender(),
                response.base,
                response.quote,
                response.realizedPnl,
                response.protocolFee,
                baseBalancePerShareX96,
                shareMarkPriceAfterX96,
                response.liquidationPenalty,
                response.liquidationReward,
                response.insuranceFundReward
            );
        } else {
            emit PositionChanged(
                params.trader,
                params.market,
                response.base,
                response.quote,
                response.realizedPnl,
                response.protocolFee,
                baseBalancePerShareX96,
                shareMarkPriceAfterX96
            );
        }

        oppositeAmount = params.isExactInput == params.isBaseToQuote ? response.quote.abs() : response.base.abs();
    }

    function _setMarketStatus(address market, PerpdexStructs.MarketStatus status) private {
        if (marketStatuses[market] == status) return;

        if (status == PerpdexStructs.MarketStatus.Open) {
            require(market.isContract(), "PE_SIMA: market address invalid");
            require(IPerpdexMarketMinimum(market).exchange() == address(this), "PE_SIMA: different exchange");
            require(marketStatuses[market] == PerpdexStructs.MarketStatus.NotAllowed, "PE_SIMA: market closed");
        } else if (status == PerpdexStructs.MarketStatus.Closed) {
            _checkMarketOpen(market);
        } else {
            require(false, "PE_SIMA: invalid status");
        }

        marketStatuses[market] = status;
        emit MarketStatusChanged(market, status);
    }

    // to reduce contract size
    function _checkDeadline(uint256 deadline) private view {
        require(block.timestamp <= deadline, "PE_CD: too late");
    }

    // to reduce contract size
    function _checkMarketOpen(address market) private view {
        require(marketStatuses[market] == PerpdexStructs.MarketStatus.Open, "PE_CMO: market not open");
    }

    // to reduce contract size
    function _checkMarketClosed(address market) private view {
        require(marketStatuses[market] == PerpdexStructs.MarketStatus.Closed, "PE_CMC: market not closed");
    }
}
