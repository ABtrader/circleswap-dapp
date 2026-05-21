import { baseSepolia } from "viem/chains";

export const privyAppId = "cmpbsj9gt00d30cjvh5alicvj";

export const privyConfig = {
  loginMethods: ["email", "wallet", "twitter"],
  appearance: {
    theme: "dark",
    accentColor: "#2775ca",
    logo: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png",
    showWalletLoginFirst: false,
  },
  embeddedWallets: {
    createOnLogin: "users-without-wallets",
    showWalletUIs: true,
  },
  supportedChains: [baseSepolia],
  defaultChain: baseSepolia,
};