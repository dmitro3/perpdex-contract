// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.7.6;
pragma abicoder v2;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { PerpMath } from "./PerpMath.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { AccountLibrary } from "./AccountLibrary.sol";
import { PerpdexStructs } from "./PerpdexStructs.sol";

library VaultLibrary {
    using PerpMath for int256;
    using SafeCast for int256;
    using SafeCast for uint256;
    using SafeMath for uint256;
    using SignedSafeMath for int256;

    struct DepositParams {
        address settlementToken;
        uint256 amount;
        uint256 callValue;
        address from;
    }

    struct WithdrawParams {
        address settlementToken;
        uint256 amount;
        address payable to;
        uint24 imRatio;
    }

    function compensate(
        PerpdexStructs.AccountInfo storage accountInfo,
        PerpdexStructs.InsuranceFundInfo storage insuranceFundInfo
    ) external returns (uint256 compensation) {
        if (accountInfo.markets.length != 0) return 0;
        if (accountInfo.vaultInfo.collateralBalance >= 0) return 0;
        compensation = Math.min((-accountInfo.vaultInfo.collateralBalance).toUint256(), insuranceFundInfo.balance);
        accountInfo.vaultInfo.collateralBalance += compensation.toInt256();
        insuranceFundInfo.balance -= compensation;
    }

    function deposit(PerpdexStructs.AccountInfo storage accountInfo, DepositParams memory params)
        external
        returns (uint256 amount)
    {
        uint256 collateralAmount;
        if (params.settlementToken == address(0)) {
            require(params.amount == 0, "VL_D: amount not zero");
            require(params.callValue > 0, "VL_D: call value zero");
            amount = params.callValue;
            collateralAmount = amount;
        } else {
            require(params.callValue == 0, "VL_D: call value not zero");
            require(params.amount > 0, "VL_D: zero amount");
            amount = params.amount;
            _transferTokenIn(params.settlementToken, params.from, amount);
            collateralAmount = _toCollateralAmount(amount, IERC20Metadata(params.settlementToken).decimals());
        }

        accountInfo.vaultInfo.collateralBalance += collateralAmount.toInt256();
    }

    function withdraw(PerpdexStructs.AccountInfo storage accountInfo, WithdrawParams memory params) external {
        require(params.amount > 0, "VL_W: zero amount");

        uint256 collateralAmount =
            params.settlementToken == address(0)
                ? params.amount
                : _toCollateralAmount(params.amount, IERC20Metadata(params.settlementToken).decimals());
        accountInfo.vaultInfo.collateralBalance -= collateralAmount.toInt256();

        require(AccountLibrary.hasEnoughInitialMargin(accountInfo, params.imRatio), "VL_W: not enough initial margin");

        if (params.settlementToken == address(0)) {
            params.to.transfer(params.amount);
        } else {
            SafeERC20.safeTransfer(IERC20(params.settlementToken), params.to, params.amount);
        }
    }

    function transferProtocolFee(
        PerpdexStructs.AccountInfo storage accountInfo,
        PerpdexStructs.ProtocolInfo storage protocolInfo,
        uint256 amount
    ) external {
        accountInfo.vaultInfo.collateralBalance += amount.toInt256();
        protocolInfo.protocolFee -= amount;
    }

    function _transferTokenIn(
        address token,
        address from,
        uint256 amount
    ) private {
        // check for deflationary tokens by assuring balances before and after transferring to be the same
        uint256 balanceBefore = IERC20Metadata(token).balanceOf(address(this));
        SafeERC20.safeTransferFrom(IERC20(token), from, address(this), amount);
        require(
            (IERC20Metadata(token).balanceOf(address(this)).sub(balanceBefore)) == amount,
            "VL_TTI: inconsistent balance"
        );
    }

    function _toCollateralAmount(uint256 amount, uint8 tokenDecimals) private pure returns (uint256) {
        int256 decimalsDiff = int256(18).sub(uint256(tokenDecimals).toInt256());
        uint256 decimalsDiffAbs = decimalsDiff.abs();
        require(decimalsDiffAbs <= 77, "VL_TCA: too large decimals diff");
        return decimalsDiff >= 0 ? amount.mul(10**decimalsDiffAbs) : amount.div(10**decimalsDiffAbs);
    }
}
