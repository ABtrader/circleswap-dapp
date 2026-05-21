export const NETWORKS = {
  ARC_TESTNET: {
    name: "Arc Testnet",
    chainId: 5042002,
    rpc: "https://rpc.testnet.arc.network",
    explorer: "https://testnet.arcscan.app",
    nativeCurrency: "USDC",
  },

  BASE_SEPOLIA: {
    name: "Base Sepolia",
    chainId: 84532,
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    nativeCurrency: "ETH",
  },

  ETH_SEPOLIA: {
    name: "Ethereum Sepolia",
    chainId: 11155111,
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    explorer: "https://sepolia.etherscan.io",
    nativeCurrency: "ETH",
  },
};

export const ARC_TOKENS = ["USDC", "EURC", "ETH"];

export const BASE_SEPOLIA_TOKENS = ["ETH", "USDC"];

export const ETH_SEPOLIA_TOKENS = ["ETH", "USDC"];

export const BASE_SEPOLIA_RPC = NETWORKS.BASE_SEPOLIA.rpc;

export const BASE_SEPOLIA_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const ARC_EURC =
  "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a";