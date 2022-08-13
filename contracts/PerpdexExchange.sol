// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
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
    uint24 public imRatio = 10e4;
    uint24 public mmRatio = 5e4;
    uint24 public protocolFeeRatio = 0;
    PerpdexStructs.LiquidationRewardConfig public liquidationRewardConfig =
        PerpdexStructs.LiquidationRewardConfig({ rewardRatio: 20e4, smoothEmaTime: 100 });
    mapping(address => bool) public isMarketAllowed;

    modifier checkDeadline(uint256 deadline) {
        _checkDeadline(deadline);
        _;
    }

    modifier checkMarketAllowed(address market) {
        _checkMarketAllowed(market);
        _;
    }

    constructor(address settlementTokenArg) {
        require(settlementTokenArg == address(0) || settlementTokenArg.isContract(), "PE_C: token address invalid");

        settlementToken = settlementTokenArg;
    }

    function deposit(uint256 amount) external payable nonReentrant {
        address trader = _msgSender();
        _settleLimitOrders(trader);

        if (settlementToken == address(0)) {
            require(amount == 0, "PE_D: amount not zero");
            VaultLibrary.depositEth(accountInfos[trader], msg.value);
            emit Deposited(trader, msg.value);
        } else {
            require(msg.value == 0, "PE_D: msg.value not zero");
            VaultLibrary.deposit(
                accountInfos[trader],
                VaultLibrary.DepositParams({ settlementToken: settlementToken, amount: amount, from: trader })
            );
            emit Deposited(trader, amount);
        }
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
        checkMarketAllowed(params.market)
        returns (uint256 oppositeAmount)
    {
        _settleLimitOrders(params.trader);
        TakerLibrary.TradeResponse memory response = _doTrade(params);

        if (response.rawResponse.partialKey != 0) {
            address partialTrader =
                orderIdToTrader[params.market][params.isBaseToQuote][response.rawResponse.partialKey];
            _settleLimitOrders(partialTrader);
            TakerLibrary.addToTakerBalance(
                accountInfos[partialTrader],
                params.market,
                params.isBaseToQuote
                    ? response.rawResponse.basePartial.toInt256()
                    : response.rawResponse.basePartial.neg256(),
                params.isBaseToQuote
                    ? response.rawResponse.quotePartial.neg256()
                    : response.rawResponse.quotePartial.toInt256(),
                0,
                maxMarketsPerAccount
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

    function addLiquidity(AddLiquidityParams calldata params)
        external
        nonReentrant
        checkDeadline(params.deadline)
        checkMarketAllowed(params.market)
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

        uint256 baseBalancePerShareX96 = IPerpdexMarketMinimum(params.market).baseBalancePerShareX96();
        uint256 shareMarkPriceAfterX96 = IPerpdexMarketMinimum(params.market).getShareMarkPriceX96();

        PerpdexStructs.MakerInfo storage makerInfo = accountInfos[trader].makerInfos[params.market];
        emit LiquidityAdded(
            trader,
            params.market,
            response.base,
            response.quote,
            response.liquidity,
            makerInfo.cumBaseSharePerLiquidityX96,
            makerInfo.cumQuotePerLiquidityX96,
            baseBalancePerShareX96,
            shareMarkPriceAfterX96
        );

        return (response.base, response.quote, response.liquidity);
    }

    function removeLiquidity(RemoveLiquidityParams calldata params)
        external
        nonReentrant
        checkDeadline(params.deadline)
        checkMarketAllowed(params.market)
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

        uint256 baseBalancePerShareX96 = IPerpdexMarketMinimum(params.market).baseBalancePerShareX96();
        uint256 shareMarkPriceAfterX96 = IPerpdexMarketMinimum(params.market).getShareMarkPriceX96();

        emit LiquidityRemoved(
            params.trader,
            params.market,
            response.isLiquidation ? _msgSender() : address(0),
            response.base,
            response.quote,
            params.liquidity,
            response.takerBase,
            response.takerQuote,
            response.realizedPnl,
            baseBalancePerShareX96,
            shareMarkPriceAfterX96
        );

        return (response.base, response.quote);
    }

    function createLimitOrder(CreateLimitOrderParams calldata params)
        external
        nonReentrant
        checkDeadline(params.deadline)
        checkMarketAllowed(params.market)
        returns (uint40 orderId)
    {
        address trader = _msgSender();
        _settleLimitOrders(trader);

        orderId = MakerOrderBookLibrary.createLimitOrder(
            accountInfos[trader],
            MakerOrderBookLibrary.CreateLimitOrderParams({
                market: params.market,
                isBid: params.isBid,
                base: params.base,
                priceX96: params.priceX96,
                imRatio: imRatio,
                maxMarketsPerAccount: maxMarketsPerAccount
            })
        );
        orderIdToTrader[params.market][params.isBid][orderId] = trader;

        emit LimitOrderCreated(trader, params.market, params.isBid, params.base, params.priceX96, orderId);
    }

    function cancelLimitOrder(CancelLimitOrderParams calldata params)
        external
        nonReentrant
        checkDeadline(params.deadline)
        checkMarketAllowed(params.market)
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

    function _settleLimitOrders(address trader) internal {
        MakerOrderBookLibrary.settleLimitOrdersAll(accountInfos[trader], maxMarketsPerAccount);
    }

    function setMaxMarketsPerAccount(uint8 value) external onlyOwner nonReentrant {
        maxMarketsPerAccount = value;
        emit MaxMarketsPerAccountChanged(value);
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

    function setIsMarketAllowed(address market, bool value) external onlyOwner nonReentrant {
        require(market.isContract(), "PE_SIMA: market address invalid");
        if (value) {
            require(IPerpdexMarketMinimum(market).exchange() == address(this), "PE_SIMA: different exchange");
        }
        isMarketAllowed[market] = value;
        emit IsMarketAllowedChanged(market, value);
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
        checkMarketAllowed(params.market)
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

    function maxTrade(MaxTradeParams calldata params) external view returns (uint256 amount) {
        if (!isMarketAllowed[params.market]) return 0;

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

    function getTotalAccountValue(address trader) external view returns (int256 accountValue) {
        (accountValue, ) = AccountLibrary.getTotalAccountValue(accountInfos[trader]);
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

    // for avoiding stack too deep error
    function _doTrade(TradeParams calldata params) private returns (TakerLibrary.TradeResponse memory) {
        return
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
    }

    // to reduce contract size
    function _checkDeadline(uint256 deadline) private view {
        require(block.timestamp <= deadline, "PE_CD: too late");
    }

    // to reduce contract size
    function _checkMarketAllowed(address market) private view {
        require(isMarketAllowed[market], "PE_CMA: market not allowed");
    }
}
