import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-etherscan"
import "@nomiclabs/hardhat-waffle"
import "@nomicfoundation/hardhat-chai-matchers"
import "@openzeppelin/hardhat-upgrades"
import "@typechain/hardhat"
import { config as dotenvConfig } from "dotenv"
import "hardhat-contract-sizer"
import "hardhat-dependency-compiler"
import "hardhat-deploy"
import "@matterlabs/hardhat-zksync-solc"
import { HardhatUserConfig } from "hardhat/config"
import { resolve } from "path"
import "solidity-coverage"

// import after mocha-test
import "hardhat-gas-reporter"

dotenvConfig({ path: resolve(__dirname, "./.env") })

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.12",
        settings: {
            optimizer: { enabled: true, runs: 100 },
            evmVersion: "berlin",
            // for smock to mock contracts
            outputSelection: {
                "*": {
                    "*": ["storageLayout"],
                },
            },
        },
    },
    zksolc: {
        version: "1.1.2",
        compilerSource: "docker",
        settings: {
            optimizer: {
                enabled: true,
            },
            experimental: {
                dockerImage: "matterlabs/zksolc",
                tag: "v1.1.2",
            },
        },
    },
    namedAccounts: {
        deployer: 0,
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
            initialBaseFeePerGas: 0, // https://github.com/sc-forks/solidity-coverage/issues/652#issuecomment-896330136
        },
    },
    etherscan: {
        apiKey: {
            mainnet: process.env.ETHERSCAN_API_KEY,
            ropsten: process.env.ETHERSCAN_API_KEY,
            rinkeby: process.env.ETHERSCAN_API_KEY,
            polygonMumbai: process.env.POLYGONSCAN_API_KEY,
            polygon: process.env.POLYGONSCAN_API_KEY,
        },
    },
    dependencyCompiler: {
        // We have to compile from source since UniswapV3 doesn't provide artifacts in their npm package
        paths: [],
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        disambiguatePaths: false,
    },
    gasReporter: {
        // excludeContracts: ["test"],
    },
    mocha: {
        require: ["ts-node/register/files"],
        jobs: 4,
        timeout: 120000,
        color: true,
    },
}

if (process.env.TESTNET_PRIVATE_KEY) {
    if (process.env.INFURA_PROJECT_ID) {
        config.networks.rinkeby = {
            url: "https://rinkeby.infura.io/v3/" + process.env.INFURA_PROJECT_ID,
            accounts: [process.env.TESTNET_PRIVATE_KEY],
            gasMultiplier: 2,
        }
    }

    config.networks.mumbai = {
        url: "https://rpc-mumbai.maticvigil.com",
        accounts: [process.env.TESTNET_PRIVATE_KEY],
        gasMultiplier: 4,
    }

    config.networks.fuji = {
        url: "https://api.avax-test.network/ext/bc/C/rpc",
        accounts: [process.env.TESTNET_PRIVATE_KEY],
        gasMultiplier: 2,
    }

    config.networks.shibuya = {
        url: "https://evm.shibuya.astar.network",
        chainId: 81,
        accounts: [process.env.TESTNET_PRIVATE_KEY],
        gasMultiplier: 2,
        verify: {
            etherscan: {
                apiUrl: "https://blockscout.com/shibuya",
            },
        },
    }

    config.networks.zksync2_testnet = {
        url: "https://zksync2-testnet.zksync.dev",
        chainId: 280,
        accounts: [process.env.TESTNET_PRIVATE_KEY],
        gasMultiplier: 2,
        verify: {
            etherscan: {
                apiUrl: "https://zksync2-testnet.zkscan.io/",
            },
        },
        zksync: true,
    }

    config.networks.optimism_kovan = {
        url: "https://kovan.optimism.io",
        accounts: [process.env.TESTNET_PRIVATE_KEY],
    }

    config.networks.arbitrum_rinkeby = {
        url: "https://rinkeby.arbitrum.io/rpc",
        accounts: [process.env.TESTNET_PRIVATE_KEY],
    }
}

export default config
