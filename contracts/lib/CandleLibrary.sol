// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { MarketStructs } from "./MarketStructs.sol";

library CandleLibrary {
    using SafeCast for uint256;

    uint32 public constant INTERVAL0 = 1 minutes;
    uint32 public constant INTERVAL1 = 5 minutes;
    uint32 public constant INTERVAL2 = 1 hours;
    uint32 public constant INTERVAL3 = 4 hours;
    uint32 public constant INTERVAL4 = 24 hours;

    function update(
        MarketStructs.CandleList storage list,
        uint32 timestamp,
        uint256 priceX96,
        uint256 quote
    ) external {
        uint32 prevTimestamp = list.prevTimestamp;
        list.prevTimestamp = timestamp;

        MarketStructs.Candle storage currentCandle0 = list.candles[INTERVAL0][timestamp / INTERVAL0];
        _updateLowestCandle(currentCandle0, priceX96, quote);

        (MarketStructs.Candle storage candleLow, bool finalized) =
            _getCandle(list, INTERVAL0, prevTimestamp, timestamp);
        if (!finalized) return;

        MarketStructs.Candle storage candle;
        uint32[4] memory intervals = [INTERVAL1, INTERVAL2, INTERVAL3, INTERVAL4];
        for (uint256 i = 0; i < intervals.length; ++i) {
            (candle, finalized) = _getCandle(list, intervals[i], prevTimestamp, timestamp);
            _updateCandle(candle, candleLow);
            if (!finalized) return;
            candleLow = candle;
        }
    }

    function getCandles(
        MarketStructs.CandleList storage list,
        uint32 interval,
        uint32 startTime,
        uint256 count
    ) external view returns (MarketStructs.Candle[] memory result) {
        result = new MarketStructs.Candle[](count);
        uint256 startIdx = startTime / interval;
        uint32 prevTimestamp = list.prevTimestamp;
        uint32 partialIdx = list.prevTimestamp / interval;
        for (uint256 i = 0; i < count; ++i) {
            uint32 idx = (startIdx + i).toUint32();
            if (idx == partialIdx) {
                result[i] = list.candles[INTERVAL0][prevTimestamp / INTERVAL0];
                uint32 interval2 = _getHighInterval(INTERVAL0);
                while (interval2 <= interval) {
                    MarketStructs.Candle storage candle = list.candles[interval2][prevTimestamp / interval2];
                    if (result[i].closeX96 == 0) {
                        result[i].closeX96 = candle.closeX96;
                    }
                    result[i].quote += candle.quote;
                    result[i].highX96 = Math.max(result[i].highX96, candle.highX96).toUint128();
                    result[i].lowX96 = _smartMin(result[i].lowX96, candle.lowX96).toUint128();
                    interval2 = _getHighInterval(interval2);
                }
            } else {
                result[i] = list.candles[interval][idx];
            }
        }
    }

    function _updateLowestCandle(
        MarketStructs.Candle storage candle,
        uint256 priceX96,
        uint256 quote
    ) private {
        candle.closeX96 = priceX96.toUint128();
        candle.quote += quote.toUint128();
        candle.highX96 = Math.max(candle.highX96, priceX96).toUint128();
        candle.lowX96 = _smartMin(candle.lowX96, priceX96).toUint128();
    }

    function _updateCandle(MarketStructs.Candle storage candle, MarketStructs.Candle storage candleLow) private {
        candle.closeX96 = candleLow.closeX96;
        candle.quote += candleLow.quote;
        candle.highX96 = Math.max(candle.highX96, candleLow.highX96).toUint128();
        candle.lowX96 = _smartMin(candle.lowX96, candleLow.lowX96).toUint128();
    }

    function _getCandle(
        MarketStructs.CandleList storage list,
        uint32 interval,
        uint32 prevTimestamp,
        uint256 timestamp
    ) private view returns (MarketStructs.Candle storage candle, bool finalized) {
        uint32 idx = prevTimestamp / interval;
        finalized = idx != timestamp / interval;
        candle = list.candles[interval][idx];
    }

    function _getHighInterval(uint32 interval) private pure returns (uint32) {
        if (interval == INTERVAL0) {
            return INTERVAL1;
        } else if (interval == INTERVAL1) {
            return INTERVAL2;
        } else if (interval == INTERVAL2) {
            return INTERVAL3;
        } else if (interval == INTERVAL3) {
            return INTERVAL4;
        }
        return type(uint32).max;
    }

    function _smartMin(uint256 a, uint256 b) private pure returns (uint256) {
        if (a == 0) {
            return b;
        } else if (b == 0) {
            return a;
        } else {
            return Math.min(a, b);
        }
    }
}
