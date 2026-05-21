import { useEffect, useState } from "react";
import {
  usePrivy,
  useWallets,
  useLogin,
  useLogout,
  useLinkAccount,
} from "@privy-io/react-auth";
import { ethers } from "ethers";
import {
  NETWORKS,
  ARC_TOKENS,
  BASE_SEPOLIA_TOKENS,
  ETH_SEPOLIA_TOKENS,
  BASE_SEPOLIA_RPC,
  BASE_SEPOLIA_USDC,
} from "./constants";
import { registerUser, resolveUser, getAllUsers } from "./api";
import "./App.css";

const tabs = ["swap", "bridge", "liquidity", "perps", "wallet"];
const CIRCLE_FAUCET_URL = "https://faucet.circle.com/";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

function openCircleFaucet() {
  window.open(CIRCLE_FAUCET_URL, "_blank", "noreferrer");
}

function getTokensByNetwork(networkName) {
  if (networkName === NETWORKS.ARC_TESTNET.name) return ARC_TOKENS;
  if (networkName === NETWORKS.BASE_SEPOLIA.name) return BASE_SEPOLIA_TOKENS;
  if (networkName === NETWORKS.ETH_SEPOLIA.name) return ETH_SEPOLIA_TOKENS;
  return ARC_TOKENS;
}

function getNetworkByName(networkName) {
  return Object.values(NETWORKS).find((network) => network.name === networkName);
}

function toHexChainId(chainId) {
  return `0x${Number(chainId).toString(16)}`;
}

function cleanAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function isWalletAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim());
}

function getNativeToken(networkName) {
  if (networkName === NETWORKS.ARC_TESTNET.name) return "USDC";
  return "ETH";
}

function getGasLabel(networkName) {
  if (networkName === NETWORKS.ARC_TESTNET.name) {
    return "USDC";
  }

  return "ETH";
}

function getSendSupportLabel(networkName) {
  if (networkName === NETWORKS.ARC_TESTNET.name) {
    return "Arc Testnet: Native USDC send enabled";
  }

  return "USDC transfer supported on this testnet, but network gas is ETH";
}

function getMockTokenUsdPrice(token) {
  const prices = {
    USDC: 1,
    USDT: 1,
    EURC: 1.08,
    ETH: 3200,
  };

  return prices[token] || 1;
}

function calculateSwapEstimate(fromToken, toToken, amount, slippage) {
  const numericAmount = Number(amount);

  if (!amount || numericAmount <= 0) {
    return {
      estimatedReceive: "",
      minimumReceive: "",
      priceImpact: "0.00",
      routeFee: "0.00",
    };
  }

  const fromPrice = getMockTokenUsdPrice(fromToken);
  const toPrice = getMockTokenUsdPrice(toToken);
  const baseReceive = (numericAmount * fromPrice) / toPrice;

  const routeFeePercent = 0.15;
  const priceImpactPercent = fromToken === toToken ? 0 : 0.12;
  const feeAdjustedReceive = baseReceive * (1 - routeFeePercent / 100);
  const minimumReceive = feeAdjustedReceive * (1 - Number(slippage) / 100);

  return {
    estimatedReceive: feeAdjustedReceive.toFixed(toToken === "ETH" ? 6 : 4),
    minimumReceive: minimumReceive.toFixed(toToken === "ETH" ? 6 : 4),
    priceImpact: priceImpactPercent.toFixed(2),
    routeFee: routeFeePercent.toFixed(2),
  };
}

function calculateBridgeEstimate(fromChain, toChain, token, amount) {
  const numericAmount = Number(amount);

  if (!amount || numericAmount <= 0) {
    return {
      estimatedReceive: "",
      bridgeFee: "0.00",
      estimatedTime: "0 min",
      routeType: "Select amount",
    };
  }

  const isSameChain = fromChain === toChain;
  const feePercent = isSameChain ? 0 : 0.08;
  const feeAmount = numericAmount * (feePercent / 100);
  const estimatedReceive = numericAmount - feeAmount;

  let estimatedTime = "2-4 min";

  if (
    fromChain === NETWORKS.ARC_TESTNET.name ||
    toChain === NETWORKS.ARC_TESTNET.name
  ) {
    estimatedTime = "3-6 min";
  }

  if (isSameChain) {
    estimatedTime = "Instant";
  }

  return {
    estimatedReceive: estimatedReceive.toFixed(token === "ETH" ? 6 : 4),
    bridgeFee: feeAmount.toFixed(token === "ETH" ? 6 : 4),
    estimatedTime,
    routeType: isSameChain ? "Same-chain route" : "Cross-testnet route",
  };
}


function getLiquidityPoolInfo(pool) {
  const pools = {
    "USDC / EURC": {
      apy: "8.40",
      tvl: 1250000,
      volume24h: 184000,
      risk: "Low",
    },
    "USDC / USDT": {
      apy: "6.20",
      tvl: 2200000,
      volume24h: 310000,
      risk: "Low",
    },
    "USDC / ETH": {
      apy: "11.75",
      tvl: 870000,
      volume24h: 142000,
      risk: "Medium",
    },
  };

  return (
    pools[pool] || {
      apy: "5.00",
      tvl: 500000,
      volume24h: 50000,
      risk: "Medium",
    }
  );
}

function calculateLiquidityEstimate(pool, usdcAmount, pairAmount) {
  const numericUsdc = Number(usdcAmount);
  const numericPair = Number(pairAmount);
  const poolInfo = getLiquidityPoolInfo(pool);

  if (
    !usdcAmount ||
    !pairAmount ||
    numericUsdc <= 0 ||
    numericPair <= 0
  ) {
    return {
      totalDepositUsd: "0.00",
      lpTokens: "0.0000",
      poolShare: "0.0000",
      estimatedApy: poolInfo.apy,
      poolTvl: poolInfo.tvl,
      volume24h: poolInfo.volume24h,
      risk: poolInfo.risk,
    };
  }

  const [, pairToken] = pool.split(" / ");
  const pairUsdValue = numericPair * getMockTokenUsdPrice(pairToken);
  const totalDepositUsd = numericUsdc + pairUsdValue;
  const lpTokens = totalDepositUsd / 10;
  const poolShare = (totalDepositUsd / (poolInfo.tvl + totalDepositUsd)) * 100;

  return {
    totalDepositUsd: totalDepositUsd.toFixed(2),
    lpTokens: lpTokens.toFixed(4),
    poolShare: poolShare.toFixed(4),
    estimatedApy: poolInfo.apy,
    poolTvl: poolInfo.tvl,
    volume24h: poolInfo.volume24h,
    risk: poolInfo.risk,
  };
}


const DEFAULT_PERP_MARKETS = {
  "BTC/USDC": {
    price: 68000,
    funding: "0.012",
    volatility: "Medium",
    priceId: "bitcoin",
  },
  "ETH/USDC": {
    price: 3200,
    funding: "0.009",
    volatility: "Medium",
    priceId: "ethereum",
  },
  "SOL/USDC": {
    price: 160,
    funding: "0.018",
    volatility: "High",
    priceId: "solana",
  },
};

function formatUsd(value) {
  const numericValue = Number(value || 0);

  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits: numericValue >= 1000 ? 2 : 4,
    maximumFractionDigits: numericValue >= 1000 ? 2 : 4,
  });
}

function getPerpMarketInfo(pair, livePrices = {}) {
  const fallbackMarket = DEFAULT_PERP_MARKETS[pair] || {
    price: 1000,
    funding: "0.010",
    volatility: "Medium",
    priceId: "unknown",
  };

  const livePrice = livePrices[pair];

  return {
    ...fallbackMarket,
    price: livePrice || fallbackMarket.price,
    isLive: Boolean(livePrice),
  };
}

async function fetchLivePerpPrices() {
  const response = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd"
  );

  if (!response.ok) {
    throw new Error("Live price request failed.");
  }

  const data = await response.json();

  return {
    "BTC/USDC": data?.bitcoin?.usd,
    "ETH/USDC": data?.ethereum?.usd,
    "SOL/USDC": data?.solana?.usd,
  };
}

function calculatePerpsEstimate(pair, side, collateral, leverage, entryMovePercent, livePrices = {}) {
  const numericCollateral = Number(collateral);
  const numericLeverage = Number(leverage);
  const numericMove = Number(entryMovePercent);
  const marketInfo = getPerpMarketInfo(pair, livePrices);

  if (!collateral || numericCollateral <= 0) {
    return {
      marketPrice: marketInfo.price,
      positionSize: "0.00",
      marginRequired: "0.00",
      liquidationPrice: "0.00",
      estimatedPnl: "0.00",
      estimatedRoi: "0.00",
      fundingRate: marketInfo.funding,
      volatility: marketInfo.volatility,
    };
  }

  const positionSize = numericCollateral * numericLeverage;
  const moveDirection = side === "Long" ? 1 : -1;
  const estimatedPnl = positionSize * ((numericMove * moveDirection) / 100);
  const estimatedRoi = (estimatedPnl / numericCollateral) * 100;

  const liquidationMovePercent = 100 / numericLeverage;
  const liquidationPrice =
    side === "Long"
      ? marketInfo.price * (1 - liquidationMovePercent / 100)
      : marketInfo.price * (1 + liquidationMovePercent / 100);

  return {
    marketPrice: marketInfo.price,
    positionSize: positionSize.toFixed(2),
    marginRequired: numericCollateral.toFixed(2),
    liquidationPrice: liquidationPrice.toFixed(2),
    estimatedPnl: estimatedPnl.toFixed(2),
    estimatedRoi: estimatedRoi.toFixed(2),
    fundingRate: marketInfo.funding,
    volatility: marketInfo.volatility,
  };
}


function canSendErc20Token(networkName, token) {
  return networkName === NETWORKS.BASE_SEPOLIA.name && token === "USDC";
}

async function switchWalletNetwork(networkName) {
  const network = getNetworkByName(networkName);

  if (!network) {
    alert("Unknown network selected.");
    return;
  }

  if (!window.ethereum) {
    alert("No wallet extension found. Please install MetaMask, Rabby, or another EVM wallet.");
    return;
  }

  const chainIdHex = toHexChainId(network.chainId);

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex,
              chainName: network.name,
              nativeCurrency: {
                name: network.nativeCurrency,
                symbol: network.nativeCurrency,
                decimals: 18,
              },
              rpcUrls: [network.rpc],
              blockExplorerUrls: [network.explorer],
            },
          ],
        });
      } catch (addError) {
        console.error("Add network failed:", addError);
        alert("Could not add the selected network to your wallet.");
      }
    } else {
      console.error("Switch network failed:", switchError);
      alert("Could not switch network. Please approve the request in your wallet.");
    }
  }
}

export default function App() {
  const [entered, setEntered] = useState(false);
  const [activeTab, setActiveTab] = useState("swap");
  const [selectedNetwork, setSelectedNetwork] = useState(NETWORKS.ARC_TESTNET.name);
  const [gasOpen, setGasOpen] = useState(false);
  const [gasToken, setGasToken] = useState("USDC");
  const [accountOpen, setAccountOpen] = useState(false);
  const [ethBalance, setEthBalance] = useState("0.0000");
  const [usdcBalance, setUsdcBalance] = useState("0.00");
  const [balanceStatus, setBalanceStatus] = useState("");
  const [registryStatus, setRegistryStatus] = useState("");
  const [registeredUsers, setRegisteredUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [txHistory, setTxHistory] = useState([]);
  const [swapHistory, setSwapHistory] = useState([]);
  const [bridgeHistory, setBridgeHistory] = useState([]);
  const [liquidityHistory, setLiquidityHistory] = useState([]);
  const [perpsHistory, setPerpsHistory] = useState([]);
  const [openPerpsPositions, setOpenPerpsPositions] = useState([]);

  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { linkTwitter } = useLinkAccount();

  const activeWallet = wallets?.[0];
  const walletAddress = activeWallet?.address || user?.wallet?.address || "";

  const shortWallet = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : "Account";

  const email = user?.email?.address || "No email connected";
  const hasTwitter = Boolean(user?.twitter?.username);
  const xUsername = hasTwitter ? `@${user.twitter.username}` : "Not linked";

  const refreshBalances = async () => {
    if (!walletAddress) return;

    try {
      setBalanceStatus("Refreshing balances...");

      const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
      const wallet = cleanAddress(walletAddress);
      const usdcAddress = cleanAddress(BASE_SEPOLIA_USDC);

      const ethRaw = await provider.getBalance(wallet);
      setEthBalance(Number(ethers.formatEther(ethRaw)).toFixed(4));

      const usdcContract = new ethers.Contract(usdcAddress, ERC20_ABI, provider);
      const decimals = await usdcContract.decimals();
      const usdcRaw = await usdcContract.balanceOf(wallet);

      setUsdcBalance(Number(ethers.formatUnits(usdcRaw, decimals)).toFixed(2));
      setBalanceStatus("Balances updated.");
    } catch (error) {
      console.error("Balance fetch failed:", error);
      setEthBalance("0.0000");
      setUsdcBalance("0.00");
      setBalanceStatus("Could not refresh balances.");
    }
  };

  const loadRegisteredUsers = async () => {
    try {
      setUsersLoading(true);
      const result = await getAllUsers();

      if (result.success) {
        setRegisteredUsers(result.users || []);
      }
    } catch (error) {
      console.error("Load registered users failed:", error);
    } finally {
      setUsersLoading(false);
    }
  };

  const saveUsernameToRegistry = async () => {
    if (!hasTwitter || !walletAddress) {
      setRegistryStatus("Link X and connect a wallet first.");
      return;
    }

    setRegistryStatus("Saving username to backend registry...");

    const result = await registerUser(xUsername, walletAddress);

    if (result.success) {
      setRegistryStatus(result.message || `${xUsername} saved to username registry.`);
      loadRegisteredUsers();
    } else {
      setRegistryStatus(result.error || "Could not save username.");
    }
  };

  useEffect(() => {
    refreshBalances();
  }, [walletAddress]);

  useEffect(() => {
    loadRegisteredUsers();
  }, []);

  useEffect(() => {
    const savedHistory = localStorage.getItem("circleswap_tx_history");

    if (savedHistory) {
      try {
        setTxHistory(JSON.parse(savedHistory));
      } catch (error) {
        console.error("Load transaction history failed:", error);
        setTxHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    const savedSwapHistory = localStorage.getItem("circleswap_swap_history");

    if (savedSwapHistory) {
      try {
        setSwapHistory(JSON.parse(savedSwapHistory));
      } catch (error) {
        console.error("Load swap history failed:", error);
        setSwapHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    const savedBridgeHistory = localStorage.getItem("circleswap_bridge_history");

    if (savedBridgeHistory) {
      try {
        setBridgeHistory(JSON.parse(savedBridgeHistory));
      } catch (error) {
        console.error("Load bridge history failed:", error);
        setBridgeHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    const savedLiquidityHistory = localStorage.getItem("circleswap_liquidity_history");

    if (savedLiquidityHistory) {
      try {
        setLiquidityHistory(JSON.parse(savedLiquidityHistory));
      } catch (error) {
        console.error("Load liquidity history failed:", error);
        setLiquidityHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    const savedPerpsHistory = localStorage.getItem("circleswap_perps_history");

    if (savedPerpsHistory) {
      try {
        setPerpsHistory(JSON.parse(savedPerpsHistory));
      } catch (error) {
        console.error("Load perps history failed:", error);
        setPerpsHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    const savedOpenPerpsPositions = localStorage.getItem("circleswap_open_perps_positions");

    if (savedOpenPerpsPositions) {
      try {
        setOpenPerpsPositions(JSON.parse(savedOpenPerpsPositions));
      } catch (error) {
        console.error("Load open perps positions failed:", error);
        setOpenPerpsPositions([]);
      }
    }
  }, []);

  useEffect(() => {
    if (authenticated && hasTwitter && walletAddress) {
      saveUsernameToRegistry();
    }
  }, [authenticated, hasTwitter, walletAddress]);

  const handleLogout = async () => {
    await logout();
    setAccountOpen(false);
    setActiveTab("swap");
    setEthBalance("0.0000");
    setUsdcBalance("0.00");
    setBalanceStatus("");
    setRegistryStatus("");
  };

  const handleNetworkChange = async (networkName) => {
    setSelectedNetwork(networkName);
    setGasToken(getGasLabel(networkName));

    if (authenticated) {
      await switchWalletNetwork(networkName);
    }
  };

  if (!entered) {
    return (
      <div className="site">
        <nav className="nav">
          <Brand />
          <div className="nav-links">
            <span>Swap</span>
            <span>Bridge</span>
            <span>Liquidity</span>
            <span>Perps</span>
          </div>
          <button onClick={() => setEntered(true)}>Enter App</button>
        </nav>

        <section className="hero">
          <div className="hero-text">
            <span className="pill">Arc Testnet • USDC-native DeFi dashboard</span>
            <h1>Swap, bridge and manage USDC from one Circle-powered app.</h1>
            <p>
              CircleSwap is built around Arc Testnet, where USDC is the native
              gas token. Users can swap testnet assets, bridge between Arc,
              Base Sepolia and Ethereum Sepolia, and send through verified usernames.
            </p>

            <div className="actions">
              <button onClick={() => setEntered(true)}>Launch Dashboard</button>
              <button className="ghost" onClick={openCircleFaucet}>
                Claim Testnet Faucet
              </button>
            </div>

            <div className="trust">
              <span>Arc Testnet home chain</span>
              <span>USDC gas on Arc</span>
              <span>X username identity</span>
            </div>
          </div>

          <div className="hero-widget">
            <div className="widget-head">
              <span>Username Registry</span>
              <strong>Backend Ready</strong>
            </div>

            <div className="token-box">
              <small>Identity</small>
              <div>
                <strong>@username</strong>
                <span>X</span>
              </div>
            </div>

            <div className="down">↓</div>

            <div className="token-box">
              <small>Maps to</small>
              <div>
                <strong>Wallet Address</strong>
                <span>Registry</span>
              </div>
            </div>

            <div className="widget-note">
              X usernames now save to the local backend registry.
            </div>
          </div>
        </section>

        <section className="feature-grid">
          <Feature title="Backend registry" text="Linked X usernames now map to wallet addresses." />
          <Feature title="Cross-testnet bridge" text="Bridge between Arc Testnet, Base Sepolia and Ethereum Sepolia." />
          <Feature title="Username payments" text="Send by @username or resolve wallet address to verified username." />
          <Feature title="Faucet route" text="A clear faucet path helps users claim testnet tokens before testing." />
        </section>

        <section className="about">
          <h2>Designed for Circle’s stablecoin ecosystem</h2>
          <p>
            CircleSwap focuses on USDC-native testnet flows, verified identities,
            and safer username-based transfers before adding full swap and bridge integrations.
          </p>
          <button onClick={() => setEntered(true)}>Start Using CircleSwap</button>
        </section>
      </div>
    );
  }

  return (
    <div className="app">
      <nav className="nav app-nav">
        <Brand />

        <div className="tabs">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="right-actions">
          <div className="gas">
            <button onClick={() => setGasOpen(!gasOpen)}>⛽ {gasToken}</button>
            {gasOpen && (
              <div className="gas-menu">
                <p>Network gas</p>
                <button onClick={() => setGasToken(getGasLabel(selectedNetwork))}>
                  {getGasLabel(selectedNetwork)}
                </button>
              </div>
            )}
          </div>

          {!authenticated ? (
            <button onClick={login} disabled={!ready}>
              Connect
            </button>
          ) : (
            <div className="account-menu">
              <button onClick={() => setAccountOpen(!accountOpen)}>
                {hasTwitter ? xUsername : shortWallet} ▾
              </button>

              {accountOpen && (
                <div className="account-dropdown">
                  <button
                    onClick={() => {
                      setActiveTab("swap");
                      setAccountOpen(false);
                    }}
                  >
                    Home
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab("wallet");
                      setAccountOpen(false);
                    }}
                  >
                    Profile
                  </button>
                  <button onClick={handleLogout}>Logout</button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <section className="app-head">
        <div>
          <span className="pill">Selected network: {selectedNetwork}</span>
          <h1>{pageTitle(activeTab)}</h1>
          <p>{pageText(activeTab)}</p>
        </div>

        <div className="summary">
          <Mini label="Network" value={selectedNetwork} />
          <Mini label="Network Gas" value={getGasLabel(selectedNetwork)} />
          <Mini label="Base USDC" value={`${usdcBalance} USDC`} />
        </div>
      </section>

      <ActivitySummary
        txHistory={txHistory}
        swapHistory={swapHistory}
        bridgeHistory={bridgeHistory}
        liquidityHistory={liquidityHistory}
        perpsHistory={perpsHistory}
        openPerpsPositions={openPerpsPositions}
        registeredUsers={registeredUsers}
        selectedNetwork={selectedNetwork}
        setActiveTab={setActiveTab}
      />

      <main className="workspace">
        <section className="trade-panel">
          {activeTab === "swap" && (
            <Swap
              selectedNetwork={selectedNetwork}
              handleNetworkChange={handleNetworkChange}
              ethBalance={ethBalance}
              usdcBalance={usdcBalance}
              swapHistory={swapHistory}
              setSwapHistory={setSwapHistory}
              activeWallet={activeWallet}
              walletAddress={walletAddress}
            />
          )}
          {activeTab === "bridge" && (
            <Bridge
              selectedNetwork={selectedNetwork}
              handleNetworkChange={handleNetworkChange}
              bridgeHistory={bridgeHistory}
              setBridgeHistory={setBridgeHistory}
              activeWallet={activeWallet}
              walletAddress={walletAddress}
            />
          )}
          {activeTab === "liquidity" && (
            <Liquidity
              selectedNetwork={selectedNetwork}
              handleNetworkChange={handleNetworkChange}
              liquidityHistory={liquidityHistory}
              setLiquidityHistory={setLiquidityHistory}
              activeWallet={activeWallet}
              walletAddress={walletAddress}
            />
          )}
          {activeTab === "perps" && (
            <Perps
              selectedNetwork={selectedNetwork}
              perpsHistory={perpsHistory}
              setPerpsHistory={setPerpsHistory}
              openPerpsPositions={openPerpsPositions}
              setOpenPerpsPositions={setOpenPerpsPositions}
              activeWallet={activeWallet}
              walletAddress={walletAddress}
            />
          )}
          {activeTab === "wallet" && (
            <Wallet
              selectedNetwork={selectedNetwork}
              handleNetworkChange={handleNetworkChange}
              activeWallet={activeWallet}
              gasToken={gasToken}
              ready={ready}
              authenticated={authenticated}
              login={login}
              linkTwitter={linkTwitter}
              email={email}
              walletAddress={walletAddress}
              hasTwitter={hasTwitter}
              xUsername={xUsername}
              ethBalance={ethBalance}
              usdcBalance={usdcBalance}
              refreshBalances={refreshBalances}
              balanceStatus={balanceStatus}
              registryStatus={registryStatus}
              saveUsernameToRegistry={saveUsernameToRegistry}
              txHistory={txHistory}
              setTxHistory={setTxHistory}
            />
          )}
        </section>

        <aside className="side-panel">
          <h3>Username Registry</h3>
          <p>
            Your backend stores linked X usernames and wallet addresses locally.
          </p>

          <div className="side-card">
            <span>Your Username</span>
            <strong>{hasTwitter ? xUsername : "Not linked"}</strong>
          </div>

          <div className="side-card">
            <span>Registry Status</span>
            <strong>{registryStatus || "Waiting"}</strong>
          </div>

          <button className="secondary" onClick={loadRegisteredUsers}>
            {usersLoading ? "Refreshing..." : "Refresh Registered Users"}
          </button>

          {registeredUsers.length > 0 && (
            <div className="side-card">
              <span>Registered Users</span>
              <strong>{registeredUsers.length}</strong>
            </div>
          )}

          {registeredUsers.map((registeredUser, index) => (
            <div className="side-card" key={index}>
              <span>{registeredUser.username}</span>
              <strong className="break-text">{registeredUser.wallet}</strong>
            </div>
          ))}

          <button className="secondary" onClick={openCircleFaucet}>
            Claim Faucet from Circle
          </button>

          <button className="secondary" onClick={refreshBalances}>
            Refresh Balances
          </button>
        </aside>
      </main>
    </div>
  );
}


function ActivitySummary({
  txHistory,
  swapHistory,
  bridgeHistory,
  liquidityHistory,
  perpsHistory,
  openPerpsPositions,
  registeredUsers,
  selectedNetwork,
  setActiveTab,
}) {
  const totalTransactions = txHistory.length;
  const totalSwaps = swapHistory.length;
  const totalBridges = bridgeHistory.length;
  const totalLiquidity = liquidityHistory.length;
  const totalPerps = perpsHistory.length + openPerpsPositions.length;
  const totalActivities =
    totalTransactions + totalSwaps + totalBridges + totalLiquidity + totalPerps;

  const protocolTvl =
    1250000 + 2200000 + 870000 + totalLiquidity * 2500 + totalPerps * 1000;

  const protocolVolume =
    184000 +
    310000 +
    142000 +
    totalSwaps * 3500 +
    totalBridges * 2800 +
    totalTransactions * 750;

  const recentActivities = [
    ...txHistory.map((item) => ({
      type: "Send",
      title: `${item.amount} ${item.token} to ${item.receiverUsername}`,
      detail: item.network,
      time: item.timestamp,
    })),
    ...swapHistory.map((item) => ({
      type: "Swap",
      title: `${item.fromAmount} ${item.fromToken} → ${item.estimatedReceive} ${item.toToken}`,
      detail: item.network,
      time: item.timestamp,
    })),
    ...bridgeHistory.map((item) => ({
      type: "Bridge",
      title: `${item.amount} ${item.token}: ${item.fromChain} → ${item.toChain}`,
      detail: item.estimatedTime,
      time: item.timestamp,
    })),
    ...liquidityHistory.map((item) => ({
      type: "Liquidity",
      title: `${item.pool} position`,
      detail: `$${item.totalDepositUsd}`,
      time: item.timestamp,
    })),
    ...openPerpsPositions.map((item) => ({
      type: "Open Perps",
      title: `${item.side} ${item.pair} ${item.leverage}x`,
      detail: `Live position • $${item.positionSize}`,
      time: item.openedAt,
    })),
    ...perpsHistory.map((item) => ({
      type: "Perps History",
      title: `${item.side} ${item.pair} ${item.leverage}x`,
      detail: `$${item.positionSize}`,
      time: item.closedAt || item.timestamp,
    })),
  ].slice(0, 6);

  return (
    <section className="workspace">
      <section className="trade-panel">
        <Card title="CircleSwap Analytics">
          <p className="soft swap-note">
            Dashboard overview of your local CircleSwap demo activity and protocol stats.
          </p>

          <div className="summary">
            <Mini label="Total Activities" value={totalActivities} />
            <Mini label="Sends" value={totalTransactions} />
            <Mini label="Swaps" value={totalSwaps} />
            <Mini label="Bridges" value={totalBridges} />
            <Mini label="Liquidity" value={totalLiquidity} />
            <Mini label="Perps" value={totalPerps} />
          </div>

          <div className="quote-box">
            <span>Protocol TVL Simulation</span>
            <strong>${protocolTvl.toLocaleString()}</strong>
          </div>

          <div className="quote-box">
            <span>24h Volume Simulation</span>
            <strong>${protocolVolume.toLocaleString()}</strong>
          </div>

          <div className="quote-box">
            <span>Current Network</span>
            <strong>{selectedNetwork}</strong>
          </div>

          <div className="quote-box">
            <span>System Status</span>
            <strong>Registry online • Faucet linked • Live perps pricing enabled</strong>
          </div>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
            <button className="secondary" onClick={() => setActiveTab("swap")}>
              Go to Swap
            </button>
            <button className="secondary" onClick={() => setActiveTab("bridge")}>
              Go to Bridge
            </button>
            <button className="secondary" onClick={() => setActiveTab("liquidity")}>
              Go to Liquidity
            </button>
            <button className="secondary" onClick={() => setActiveTab("perps")}>
              Go to Perps
            </button>
          </div>
        </Card>
      </section>

      <aside className="side-panel">
        <h3>Recent Activity</h3>
        <p>Latest local demo actions from this browser.</p>

        <div className="side-card">
          <span>Registered Users</span>
          <strong>{registeredUsers.length}</strong>
        </div>

        {recentActivities.length === 0 ? (
          <div className="side-card">
            <span>Status</span>
            <strong>No activity yet</strong>
          </div>
        ) : (
          recentActivities.map((item, index) => (
            <div className="side-card" key={index}>
              <span>{item.type}</span>
              <strong>{item.title}</strong>
              <small>{item.detail} • {item.time}</small>
            </div>
          ))
        )}
      </aside>
    </section>
  );
}

function Wallet({
  selectedNetwork,
  handleNetworkChange,
  activeWallet,
  gasToken,
  ready,
  authenticated,
  login,
  linkTwitter,
  email,
  walletAddress,
  hasTwitter,
  xUsername,
  ethBalance,
  usdcBalance,
  refreshBalances,
  balanceStatus,
  registryStatus,
  saveUsernameToRegistry,
  txHistory,
  setTxHistory,
}) {
  const [recipientInput, setRecipientInput] = useState("");
  const [receiverProfile, setReceiverProfile] = useState(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState(getNativeToken(selectedNetwork));
  const [txHash, setTxHash] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [linkMessage, setLinkMessage] = useState("");

  useEffect(() => {
    setToken(getNativeToken(selectedNetwork));
  }, [selectedNetwork]);

  const selectedNetworkInfo = getNetworkByName(selectedNetwork);
  const nativeToken = getNativeToken(selectedNetwork);
  const explorerTxUrl =
    selectedNetworkInfo && txHash ? `${selectedNetworkInfo.explorer}/tx/${txHash}` : "";

  const clearTransactionHistory = () => {
    setTxHistory([]);
    localStorage.removeItem("circleswap_tx_history");
  };

  const handleLinkTwitter = async () => {
    setLinkMessage("");

    try {
      setLinkMessage("Opening X linking...");
      await linkTwitter();
      setLinkMessage("X account linked. Save your username to the registry after it appears.");
    } catch (error) {
      console.error("X link failed:", error);
      setLinkMessage(error?.message || "Could not link X account.");
    }
  };

  const previewReceiver = async () => {
    setReceiverProfile(null);
    setLookupMessage("");
    setTxHash("");
    setTxStatus("");

    if (!hasTwitter) {
      setLookupMessage("Link your X account to generate your username first.");
      return;
    }

    if (!recipientInput.trim()) {
      setLookupMessage("Enter a receiver username or wallet address.");
      return;
    }

    setLookupMessage("Searching backend registry...");

    const result = await resolveUser(recipientInput);

    if (!result.success) {
      if (isWalletAddress(recipientInput)) {
        setLookupMessage("Account not found. This wallet has not linked an X username.");
      } else {
        setLookupMessage("Username not found in backend registry.");
      }
      return;
    }

    const foundUser = {
      username: result.user.username,
      name: result.user.username,
      wallet: result.user.wallet,
    };

    setReceiverProfile(foundUser);
    setRecipientInput(foundUser.username);
    setLookupMessage("Receiver verified from backend registry.");
  };

  const sendNativeTestnetToken = async (signer) => {
    const receiver = cleanAddress(receiverProfile.wallet);

    const tx = await signer.sendTransaction({
      to: receiver,
      value: ethers.parseEther(amount),
    });

    return tx;
  };

  const sendBaseSepoliaUsdc = async (signer) => {
    const usdcAddress = cleanAddress(BASE_SEPOLIA_USDC);
    const receiver = cleanAddress(receiverProfile.wallet);

    const transferInterface = new ethers.Interface([
      "function transfer(address to, uint256 amount) returns (bool)",
    ]);

    const parsedAmount = ethers.parseUnits(amount.toString(), 6);

    const tx = await signer.sendTransaction({
      to: usdcAddress,
      data: transferInterface.encodeFunctionData("transfer", [
        receiver,
        parsedAmount,
      ]),
      value: 0,
    });

    return tx;
  };

  const sendTestnetToken = async () => {
    setTxStatus("");
    setTxHash("");

    if (!hasTwitter) {
      setTxStatus("Link your X account to generate your username first.");
      return;
    }

    if (!receiverProfile) {
      setTxStatus("Preview and verify the receiver first.");
      return;
    }

    if (!amount || Number(amount) <= 0) {
      setTxStatus("Enter a valid amount.");
      return;
    }

    if (!activeWallet) {
      setTxStatus("No active wallet found. Reconnect your account.");
      return;
    }

    const isNativeSend = token === nativeToken;
    const isBaseUsdcSend = canSendErc20Token(selectedNetwork, token);

    if (!isNativeSend && !isBaseUsdcSend) {
      setTxStatus(
        `${token} transfer is not enabled yet on ${selectedNetwork}.`
      );
      return;
    }

    try {
      setTxStatus("Switching network...");
      await switchWalletNetwork(selectedNetwork);

      setTxStatus("Preparing wallet transaction...");

      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      let tx;

      if (isBaseUsdcSend) {
        tx = await sendBaseSepoliaUsdc(signer);
      } else {
        tx = await sendNativeTestnetToken(signer);
      }

      setTxHash(tx.hash);
      setTxStatus("Transaction submitted. Waiting for confirmation...");

      await tx.wait();

      const historyItem = {
        receiverUsername: receiverProfile.username,
        receiverWallet: receiverProfile.wallet,
        token,
        amount,
        network: selectedNetwork,
        txHash: tx.hash,
        timestamp: new Date().toLocaleString(),
      };

      const updatedHistory = [historyItem, ...txHistory];

      setTxHistory(updatedHistory);

      localStorage.setItem(
        "circleswap_tx_history",
        JSON.stringify(updatedHistory)
      );

      setTxStatus("Testnet transaction confirmed successfully.");
      await refreshBalances();
    } catch (error) {
      console.error("Testnet send failed:", error);
      setTxStatus(error?.shortMessage || error?.message || "Testnet send failed.");
    }
  };

  const canConfirmSend = hasTwitter && receiverProfile && amount;

  if (!authenticated) {
    return (
      <div className="wallet-flow">
        <div className="wallet-card main-login">
          <h2>Connect Account</h2>
          <p className="soft">
            Choose wallet, email or X login. Sending requires X username identity.
          </p>

          <button className="primary" onClick={login} disabled={!ready}>
            Connect Wallet / Email / X
          </button>

          <div className="status-box">
            <span>Status</span>
            <strong>Not connected</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-flow">
      <div className="wallet-card">
        <h2>Profile</h2>

        <label>Selected Network</label>
        <select value={selectedNetwork} onChange={(e) => handleNetworkChange(e.target.value)}>
          <option>{NETWORKS.ARC_TESTNET.name}</option>
          <option>{NETWORKS.BASE_SEPOLIA.name}</option>
          <option>{NETWORKS.ETH_SEPOLIA.name}</option>
        </select>

        <button className="secondary" onClick={() => switchWalletNetwork(selectedNetwork)}>
          Switch Wallet to {selectedNetwork}
        </button>

        <div className="status-box">
          <span>Email</span>
          <strong>{email}</strong>
        </div>

        <div className="status-box">
          <span>Wallet Address</span>
          <strong className="break-text">{walletAddress || "No wallet connected"}</strong>
        </div>

        <div className="status-box">
          <span>CircleSwap Username</span>
          <strong>{hasTwitter ? xUsername : "Not generated"}</strong>
        </div>

        {!hasTwitter ? (
          <button className="x-btn" onClick={handleLinkTwitter} disabled={!ready}>
            Link X to Generate Username
          </button>
        ) : (
          <button className="secondary" onClick={saveUsernameToRegistry}>
            Save Username to Registry
          </button>
        )}

        {registryStatus && (
          <div className="quote-box">
            <span>Registry Status</span>
            <strong>{registryStatus}</strong>
          </div>
        )}

        {linkMessage && (
          <div className="quote-box">
            <span>X Link Status</span>
            <strong>{linkMessage}</strong>
          </div>
        )}
      </div>

      <div className="wallet-card">
        <h2>Balances & Faucet</h2>

        <p className="soft">
          Use the faucet route below to claim testnet funds before trying to send.
        </p>

        <div className="receive-box">
          <span>Faucet Route</span>
          <strong>Circle Faucet</strong>
        </div>

        <button className="secondary" onClick={openCircleFaucet}>
          Claim Faucet from Circle
        </button>

        <div className="receive-box">
          <span>Base Sepolia ETH</span>
          <strong>{ethBalance} ETH</strong>
        </div>

        <div className="receive-box">
          <span>Base Sepolia USDC</span>
          <strong>{usdcBalance} USDC</strong>
        </div>

        <div className="receive-box">
          <span>Current Network Gas</span>
          <strong>{getGasLabel(selectedNetwork)}</strong>
        </div>

        <button className="secondary" onClick={refreshBalances}>
          Refresh Balances
        </button>

        {balanceStatus && (
          <div className="quote-box">
            <span>Status</span>
            <strong>{balanceStatus}</strong>
          </div>
        )}
      </div>

      <div className="wallet-card send-card">
        <h2>Send Testnet Token</h2>
        <p className="soft">
          This checks your backend registry. Receivers must save their X username first.
        </p>

        <label>Receiver Username or Wallet</label>
        <input
          placeholder="@username or 0x wallet address"
          value={recipientInput}
          onChange={(e) => {
            setRecipientInput(e.target.value);
            setReceiverProfile(null);
            setLookupMessage("");
            setTxHash("");
            setTxStatus("");
          }}
        />

        <label>Token</label>
        <select value={token} onChange={(e) => setToken(e.target.value)}>
          <option>USDC</option>
          <option>USDT</option>
          <option>EURC</option>
          <option>ETH</option>
        </select>

        <label>Amount</label>
        <input
          placeholder="0.00"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setTxHash("");
            setTxStatus("");
          }}
        />

        <button className="secondary" onClick={previewReceiver}>
          Preview Receiver
        </button>

        {lookupMessage && (
          <div className="quote-box">
            <span>Status</span>
            <strong>{lookupMessage}</strong>
          </div>
        )}

        {receiverProfile && (
          <div className="profile-preview">
            <div className="avatar">
              {receiverProfile.username.replace("@", "").slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h3>{receiverProfile.username}</h3>
              <p>Verified Registry User</p>
              <small>{receiverProfile.wallet}</small>
            </div>
          </div>
        )}

        <div className="quote-box">
          <span>Enabled Send</span>
          <strong>{getSendSupportLabel(selectedNetwork)}</strong>
        </div>

        <button className="primary" disabled={!canConfirmSend} onClick={sendTestnetToken}>
          Confirm Testnet Send
        </button>

        {txStatus && (
          <div className="quote-box">
            <span>Transaction Status</span>
            <strong>{txStatus}</strong>
          </div>
        )}

        {txHash && (
          <div className="quote-box">
            <span>Tx Hash</span>
            <strong className="break-text">{txHash}</strong>
          </div>
        )}

        {explorerTxUrl && (
          <a className="secondary" href={explorerTxUrl} target="_blank" rel="noreferrer">
            View on Explorer
          </a>
        )}
      </div>

      <div className="wallet-card">
        <h2>Transaction History</h2>
        <p className="soft">
          Successful testnet sends are saved locally in this browser.
        </p>

        {txHistory.length === 0 ? (
          <div className="quote-box">
            <span>Status</span>
            <strong>No transactions yet</strong>
          </div>
        ) : (
          <>
            <button className="secondary" onClick={clearTransactionHistory}>
              Clear History
            </button>

            {txHistory.map((item, index) => (
              <div className="history-card" key={index}>
                <div className="quote-box">
                  <span>Receiver</span>
                  <strong>{item.receiverUsername}</strong>
                </div>

                <div className="quote-box">
                  <span>Wallet</span>
                  <strong className="break-text">{item.receiverWallet}</strong>
                </div>

                <div className="quote-box">
                  <span>Amount</span>
                  <strong>
                    {item.amount} {item.token}
                  </strong>
                </div>

                <div className="quote-box">
                  <span>Network</span>
                  <strong>{item.network}</strong>
                </div>

                <div className="quote-box">
                  <span>Time</span>
                  <strong>{item.timestamp}</strong>
                </div>

                <div className="quote-box">
                  <span>Tx Hash</span>
                  <strong className="break-text">{item.txHash}</strong>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-logo">C</div>
      <div>
        <h2>CircleSwap</h2>
        <span>Arc-native USDC DeFi Layer</span>
      </div>
    </div>
  );
}

function Feature({ title, text }) {
  return (
    <div className="feature">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="mini">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function NetworkSelector({ value, onChange }) {
  return (
    <>
      <label>Network</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option>{NETWORKS.ARC_TESTNET.name}</option>
        <option>{NETWORKS.BASE_SEPOLIA.name}</option>
        <option>{NETWORKS.ETH_SEPOLIA.name}</option>
      </select>
    </>
  );
}

function Swap({
  selectedNetwork,
  handleNetworkChange,
  ethBalance,
  usdcBalance,
  swapHistory,
  setSwapHistory,
  activeWallet,
  walletAddress,
}) {
  const [fromToken, setFromToken] = useState("USDC");
  const [toToken, setToToken] = useState("EURC");
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [swapStatus, setSwapStatus] = useState("");
  const [swapPreviewOpen, setSwapPreviewOpen] = useState(false);
  const [swapConfirmOpen, setSwapConfirmOpen] = useState(false);

  const tokenOptions = getTokensByNetwork(selectedNetwork);
  const estimate = calculateSwapEstimate(fromToken, toToken, fromAmount, slippage);

  const hasValidSwapAmount = fromAmount && Number(fromAmount) > 0;
  const isSameToken = fromToken === toToken;

  const switchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setSwapStatus("");
    setSwapPreviewOpen(false);
  };

  const handleSwapNetworkChange = (network) => {
    const nextTokens = getTokensByNetwork(network);
    handleNetworkChange(network);
    setFromToken(nextTokens[0]);
    setToToken(nextTokens[1] || nextTokens[0]);
    setFromAmount("");
    setSwapStatus("");
    setSwapPreviewOpen(false);
  };

  const previewSwap = () => {
    if (!hasValidSwapAmount) {
      setSwapStatus("Enter a valid amount first.");
      return;
    }

    if (isSameToken) {
      setSwapStatus("Choose two different tokens to preview a swap.");
      return;
    }

    setSwapStatus("Swap route simulated successfully.");
    setSwapPreviewOpen(true);
  };

  const openSwapConfirmation = () => {
    if (!swapPreviewOpen) {
      setSwapStatus("Preview the swap route first.");
      return;
    }

    setSwapConfirmOpen(true);
    setSwapStatus("Review the swap details before confirming.");
  };

  const confirmDemoSwap = async () => {
    if (!swapPreviewOpen) {
      setSwapStatus("Preview the swap route first.");
      return;
    }

    if (!activeWallet || !walletAddress) {
      setSwapStatus("Connect your wallet first before confirming an on-chain demo swap.");
      return;
    }

    try {
      setSwapStatus("Switching network for on-chain demo swap...");
      await switchWalletNetwork(selectedNetwork);

      setSwapStatus("Opening wallet for demo swap transaction...");

      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const tx = await signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther("0"),
      });

      setSwapStatus("Demo swap transaction submitted. Waiting for confirmation...");

      await tx.wait();

      const swapItem = {
        fromToken,
        toToken,
        fromAmount,
        estimatedReceive: estimate.estimatedReceive,
        minimumReceive: estimate.minimumReceive,
        slippage,
        network: selectedNetwork,
        gasToken: getGasLabel(selectedNetwork),
        routeFee: estimate.routeFee,
        priceImpact: estimate.priceImpact,
        txHash: tx.hash,
        timestamp: new Date().toLocaleString(),
        status: "On-chain demo swap confirmed",
      };

      const updatedSwapHistory = [swapItem, ...swapHistory];

      setSwapHistory(updatedSwapHistory);

      localStorage.setItem(
        "circleswap_swap_history",
        JSON.stringify(updatedSwapHistory)
      );

      setSwapStatus(
        `On-chain demo swap confirmed: ${fromAmount} ${fromToken} → ${estimate.estimatedReceive} ${toToken}.`
      );

      setSwapConfirmOpen(false);
    } catch (error) {
      console.error("On-chain demo swap failed:", error);
      setSwapStatus(error?.shortMessage || error?.message || "On-chain demo swap failed.");
    }
  };

  const clearSwapHistory = () => {
    setSwapHistory([]);
    localStorage.removeItem("circleswap_swap_history");
  };

  return (
    <Card title="Swap">
      <p className="soft swap-note">
        Choose the network first, then preview a simulated testnet swap route.
      </p>

      <NetworkSelector value={selectedNetwork} onChange={handleSwapNetworkChange} />

      <div className="quote-box">
        <span>Network Gas</span>
        <strong>{getGasLabel(selectedNetwork)}</strong>
      </div>

      <div className="quote-box">
        <span>Swap Mode</span>
        <strong>Live simulation first • Real router next</strong>
      </div>

      <div className="quote-box">
        <span>Base Sepolia USDC Balance</span>
        <strong>{usdcBalance} USDC</strong>
      </div>

      <div className="quote-box">
        <span>Base Sepolia ETH Balance</span>
        <strong>{ethBalance} ETH</strong>
      </div>

      <label>You pay</label>
      <div className="field">
        <input
          placeholder="0.00"
          value={fromAmount}
          onChange={(e) => {
            setFromAmount(e.target.value);
            setSwapStatus("");
            setSwapPreviewOpen(false);
          }}
        />
        <select value={fromToken} onChange={(e) => {
          setFromToken(e.target.value);
          setSwapStatus("");
          setSwapPreviewOpen(false);
        }}>
          {tokenOptions.map((token) => (
            <option key={token}>{token}</option>
          ))}
        </select>
      </div>

      <button className="swap-switch" onClick={switchTokens}>
        ⇅
      </button>

      <label>You receive</label>
      <div className="field">
        <input
          placeholder="Estimated amount"
          value={estimate.estimatedReceive}
          readOnly
        />
        <select value={toToken} onChange={(e) => {
          setToToken(e.target.value);
          setSwapStatus("");
          setSwapPreviewOpen(false);
        }}>
          {tokenOptions.map((token) => (
            <option key={token}>{token}</option>
          ))}
        </select>
      </div>

      <label>Slippage Tolerance</label>
      <select value={slippage} onChange={(e) => setSlippage(e.target.value)}>
        <option value="0.1">0.1%</option>
        <option value="0.5">0.5%</option>
        <option value="1">1%</option>
        <option value="2">2%</option>
      </select>

      <div className="quote-box">
        <span>Route</span>
        <strong>
          {selectedNetwork}: {fromToken} → {toToken}
        </strong>
      </div>

      <div className="quote-box">
        <span>Estimated Receive</span>
        <strong>
          {estimate.estimatedReceive || "0.00"} {toToken}
        </strong>
      </div>

      <div className="quote-box">
        <span>Minimum Receive</span>
        <strong>
          {estimate.minimumReceive || "0.00"} {toToken}
        </strong>
      </div>

      <div className="quote-box">
        <span>Route Fee</span>
        <strong>{estimate.routeFee}%</strong>
      </div>

      <div className="quote-box">
        <span>Price Impact</span>
        <strong>{estimate.priceImpact}%</strong>
      </div>

      {swapPreviewOpen && (
        <div className="profile-preview">
          <div className="avatar">S</div>
          <div>
            <h3>Swap Preview Ready</h3>
            <p>
              {fromAmount} {fromToken} → {estimate.estimatedReceive} {toToken}
            </p>
            <small>
              Minimum receive after {slippage}% slippage: {estimate.minimumReceive} {toToken}
            </small>
          </div>
        </div>
      )}

      {swapStatus && (
        <div className="quote-box">
          <span>Swap Status</span>
          <strong>{swapStatus}</strong>
        </div>
      )}

      <button className="primary" onClick={previewSwap}>
        Preview Swap
      </button>

      <button className="secondary" onClick={openSwapConfirmation}>
        Open Swap Confirmation
      </button>

      {swapConfirmOpen && (
        <div className="profile-preview">
          <div className="avatar">✓</div>
          <div>
            <h3>Confirm On-chain Demo Swap</h3>
            <p>
              {fromAmount} {fromToken} → {estimate.estimatedReceive} {toToken}
            </p>
            <small>
              Network: {selectedNetwork} • Gas: {getGasLabel(selectedNetwork)} • Slippage: {slippage}%
            </small>

            <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary" onClick={confirmDemoSwap}>
                Confirm On-chain Demo Swap
              </button>

              <button className="secondary" onClick={() => setSwapConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="quote-box">
        <span>Swap History</span>
        <strong>{swapHistory.length} demo swap{swapHistory.length === 1 ? "" : "s"}</strong>
      </div>

      {swapHistory.length > 0 && (
        <button className="secondary" onClick={clearSwapHistory}>
          Clear Swap History
        </button>
      )}

      {swapHistory.map((item, index) => (
        <div className="history-card" key={index}>
          <div className="quote-box">
            <span>Route</span>
            <strong>
              {item.fromAmount} {item.fromToken} → {item.estimatedReceive} {item.toToken}
            </strong>
          </div>

          <div className="quote-box">
            <span>Network</span>
            <strong>{item.network}</strong>
          </div>

          <div className="quote-box">
            <span>Minimum Receive</span>
            <strong>
              {item.minimumReceive} {item.toToken}
            </strong>
          </div>

          <div className="quote-box">
            <span>Slippage</span>
            <strong>{item.slippage}%</strong>
          </div>

          <div className="quote-box">
            <span>Status</span>
            <strong>{item.status}</strong>
          </div>

          {item.txHash && (
            <div className="quote-box">
              <span>Tx Hash</span>
              <strong className="break-text">{item.txHash}</strong>
            </div>
          )}

          <div className="quote-box">
            <span>Time</span>
            <strong>{item.timestamp}</strong>
          </div>
        </div>
      ))}
    </Card>
  );
}

function Bridge({
  selectedNetwork,
  handleNetworkChange,
  bridgeHistory,
  setBridgeHistory,
  activeWallet,
  walletAddress,
}) {
  const [fromChain, setFromChain] = useState(selectedNetwork);
  const [toChain, setToChain] = useState(NETWORKS.BASE_SEPOLIA.name);
  const [bridgeToken, setBridgeToken] = useState("USDC");
  const [bridgeAmount, setBridgeAmount] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState("");
  const [bridgePreviewOpen, setBridgePreviewOpen] = useState(false);
  const [bridgeConfirmOpen, setBridgeConfirmOpen] = useState(false);
  const [bridgeTxHash, setBridgeTxHash] = useState("");

  const estimate = calculateBridgeEstimate(
    fromChain,
    toChain,
    bridgeToken,
    bridgeAmount
  );

  const isSameChain = fromChain === toChain;
  const hasValidBridgeAmount = bridgeAmount && Number(bridgeAmount) > 0;
  const fromNetworkInfo = getNetworkByName(fromChain);
  const bridgeExplorerTxUrl =
    fromNetworkInfo && bridgeTxHash ? `${fromNetworkInfo.explorer}/tx/${bridgeTxHash}` : "";

  const resetBridgePreview = () => {
    setBridgeStatus("");
    setBridgePreviewOpen(false);
    setBridgeConfirmOpen(false);
    setBridgeTxHash("");
  };

  const handleFromChange = (network) => {
    setFromChain(network);
    handleNetworkChange(network);
    resetBridgePreview();
  };

  const previewBridge = () => {
    if (!hasValidBridgeAmount) {
      setBridgeStatus("Enter a valid bridge amount first.");
      return;
    }

    if (isSameChain) {
      setBridgeStatus("Choose two different chains to bridge.");
      return;
    }

    setBridgeStatus("Bridge route simulated successfully.");
    setBridgePreviewOpen(true);
  };

  const openBridgeConfirmation = () => {
    if (!bridgePreviewOpen) {
      setBridgeStatus("Preview the bridge route first.");
      return;
    }

    setBridgeConfirmOpen(true);
    setBridgeStatus("Review the bridge details before confirming.");
  };

  const confirmDemoBridge = async () => {
    if (!bridgePreviewOpen) {
      setBridgeStatus("Preview the bridge route first.");
      return;
    }

    if (!activeWallet || !walletAddress) {
      setBridgeStatus("Connect your wallet first before confirming an on-chain demo bridge.");
      return;
    }

    try {
      setBridgeStatus("Switching wallet to bridge source chain...");
      await switchWalletNetwork(fromChain);

      setBridgeStatus("Opening wallet for demo bridge transaction...");

      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const tx = await signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther("0"),
      });

      setBridgeTxHash(tx.hash);
      setBridgeStatus("Demo bridge transaction submitted. Waiting for confirmation...");

      await tx.wait();

      const bridgeItem = {
        fromChain,
        toChain,
        token: bridgeToken,
        amount: bridgeAmount,
        estimatedReceive: estimate.estimatedReceive,
        bridgeFee: estimate.bridgeFee,
        estimatedTime: estimate.estimatedTime,
        routeType: estimate.routeType,
        gasToken: getGasLabel(fromChain),
        txHash: tx.hash,
        timestamp: new Date().toLocaleString(),
        status: "On-chain demo bridge confirmed",
      };

      const updatedBridgeHistory = [bridgeItem, ...bridgeHistory];

      setBridgeHistory(updatedBridgeHistory);

      localStorage.setItem(
        "circleswap_bridge_history",
        JSON.stringify(updatedBridgeHistory)
      );

      setBridgeStatus(
        `On-chain demo bridge confirmed: ${bridgeAmount} ${bridgeToken} from ${fromChain} to ${toChain}.`
      );

      setBridgeConfirmOpen(false);
    } catch (error) {
      console.error("On-chain demo bridge failed:", error);
      setBridgeStatus(error?.shortMessage || error?.message || "On-chain demo bridge failed.");
    }
  };

  const clearBridgeHistory = () => {
    setBridgeHistory([]);
    localStorage.removeItem("circleswap_bridge_history");
  };

  return (
    <Card title="Bridge">
      <p className="soft swap-note">
        Bridge testnet assets between Arc Testnet, Base Sepolia and Ethereum Sepolia.
      </p>

      <label>From Chain</label>
      <select value={fromChain} onChange={(e) => handleFromChange(e.target.value)}>
        <option>{NETWORKS.ARC_TESTNET.name}</option>
        <option>{NETWORKS.BASE_SEPOLIA.name}</option>
        <option>{NETWORKS.ETH_SEPOLIA.name}</option>
      </select>

      <label>To Chain</label>
      <select
        value={toChain}
        onChange={(e) => {
          setToChain(e.target.value);
          resetBridgePreview();
        }}
      >
        <option>{NETWORKS.ARC_TESTNET.name}</option>
        <option>{NETWORKS.BASE_SEPOLIA.name}</option>
        <option>{NETWORKS.ETH_SEPOLIA.name}</option>
      </select>

      <label>Token</label>
      <select
        value={bridgeToken}
        onChange={(e) => {
          setBridgeToken(e.target.value);
          resetBridgePreview();
        }}
      >
        <option>USDC</option>
        <option>EURC</option>
        <option>USDT</option>
        <option>ETH</option>
      </select>

      <label>Amount</label>
      <input
        placeholder="0.00"
        value={bridgeAmount}
        onChange={(e) => {
          setBridgeAmount(e.target.value);
          resetBridgePreview();
        }}
      />

      <div className="quote-box">
        <span>Route</span>
        <strong>{fromChain} → {toChain}</strong>
      </div>

      <div className="quote-box">
        <span>Route Type</span>
        <strong>{estimate.routeType}</strong>
      </div>

      <div className="quote-box">
        <span>Bridge Mode</span>
        <strong>On-chain demo tx first • Real bridge router next</strong>
      </div>

      <div className="quote-box">
        <span>Estimated Receive</span>
        <strong>
          {estimate.estimatedReceive || "0.00"} {bridgeToken}
        </strong>
      </div>

      <div className="quote-box">
        <span>Bridge Fee</span>
        <strong>
          {estimate.bridgeFee} {bridgeToken}
        </strong>
      </div>

      <div className="quote-box">
        <span>Estimated Time</span>
        <strong>{estimate.estimatedTime}</strong>
      </div>

      <div className="quote-box">
        <span>Gas Note</span>
        <strong>
          Arc uses native USDC. Base Sepolia and Ethereum Sepolia currently use ETH gas.
        </strong>
      </div>

      {bridgePreviewOpen && (
        <div className="profile-preview">
          <div className="avatar">B</div>
          <div>
            <h3>Bridge Preview Ready</h3>
            <p>
              {bridgeAmount} {bridgeToken} from {fromChain} to {toChain}
            </p>
            <small>
              Estimated receive: {estimate.estimatedReceive} {bridgeToken} • Time:{" "}
              {estimate.estimatedTime}
            </small>
          </div>
        </div>
      )}

      {bridgeStatus && (
        <div className="quote-box">
          <span>Bridge Status</span>
          <strong>{bridgeStatus}</strong>
        </div>
      )}

      {bridgeTxHash && (
        <div className="quote-box">
          <span>Bridge Tx Hash</span>
          <strong className="break-text">{bridgeTxHash}</strong>
        </div>
      )}

      {bridgeExplorerTxUrl && (
        <a className="secondary" href={bridgeExplorerTxUrl} target="_blank" rel="noreferrer">
          View Bridge Tx on Explorer
        </a>
      )}

      <button className="primary" onClick={previewBridge}>
        Preview Bridge
      </button>

      <button className="secondary" onClick={openBridgeConfirmation}>
        Open Bridge Confirmation
      </button>

      {bridgeConfirmOpen && (
        <div className="profile-preview">
          <div className="avatar">✓</div>
          <div>
            <h3>Confirm On-chain Demo Bridge</h3>
            <p>
              {bridgeAmount} {bridgeToken}: {fromChain} → {toChain}
            </p>
            <small>
              Wallet will open and submit a 0-value testnet transaction on {fromChain}.
            </small>

            <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary" onClick={confirmDemoBridge}>
                Confirm On-chain Demo Bridge
              </button>

              <button className="secondary" onClick={() => setBridgeConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="quote-box">
        <span>Bridge History</span>
        <strong>
          {bridgeHistory.length} bridge tx{bridgeHistory.length === 1 ? "" : "s"}
        </strong>
      </div>

      {bridgeHistory.length > 0 && (
        <button className="secondary" onClick={clearBridgeHistory}>
          Clear Bridge History
        </button>
      )}

      {bridgeHistory.map((item, index) => (
        <div className="history-card" key={index}>
          <div className="quote-box">
            <span>Route</span>
            <strong>
              {item.amount} {item.token}: {item.fromChain} → {item.toChain}
            </strong>
          </div>

          <div className="quote-box">
            <span>Estimated Receive</span>
            <strong>
              {item.estimatedReceive} {item.token}
            </strong>
          </div>

          <div className="quote-box">
            <span>Bridge Fee</span>
            <strong>
              {item.bridgeFee} {item.token}
            </strong>
          </div>

          <div className="quote-box">
            <span>Estimated Time</span>
            <strong>{item.estimatedTime}</strong>
          </div>

          <div className="quote-box">
            <span>Status</span>
            <strong>{item.status}</strong>
          </div>

          {item.txHash && (
            <div className="quote-box">
              <span>Tx Hash</span>
              <strong className="break-text">{item.txHash}</strong>
            </div>
          )}

          <div className="quote-box">
            <span>Time</span>
            <strong>{item.timestamp}</strong>
          </div>
        </div>
      ))}
    </Card>
  );
}

function Liquidity({
  selectedNetwork,
  handleNetworkChange,
  liquidityHistory,
  setLiquidityHistory,
  activeWallet,
  walletAddress,
}) {
  const [selectedPool, setSelectedPool] = useState("USDC / EURC");
  const [usdcAmount, setUsdcAmount] = useState("");
  const [pairAmount, setPairAmount] = useState("");
  const [liquidityStatus, setLiquidityStatus] = useState("");
  const [liquidityPreviewOpen, setLiquidityPreviewOpen] = useState(false);
  const [liquidityConfirmOpen, setLiquidityConfirmOpen] = useState(false);
  const [liquidityTxHash, setLiquidityTxHash] = useState("");

  const poolInfo = getLiquidityPoolInfo(selectedPool);
  const estimate = calculateLiquidityEstimate(selectedPool, usdcAmount, pairAmount);
  const pairToken = selectedPool.split(" / ")[1];
  const hasValidLiquidityAmount =
    usdcAmount &&
    pairAmount &&
    Number(usdcAmount) > 0 &&
    Number(pairAmount) > 0;
  const selectedNetworkInfo = getNetworkByName(selectedNetwork);
  const liquidityExplorerTxUrl =
    selectedNetworkInfo && liquidityTxHash
      ? `${selectedNetworkInfo.explorer}/tx/${liquidityTxHash}`
      : "";

  const resetLiquidityPreview = () => {
    setLiquidityStatus("");
    setLiquidityPreviewOpen(false);
    setLiquidityConfirmOpen(false);
    setLiquidityTxHash("");
  };

  const previewLiquidity = () => {
    if (!hasValidLiquidityAmount) {
      setLiquidityStatus("Enter valid USDC and pair token amounts first.");
      return;
    }

    setLiquidityStatus("Liquidity deposit simulated successfully.");
    setLiquidityPreviewOpen(true);
  };

  const openLiquidityConfirmation = () => {
    if (!liquidityPreviewOpen) {
      setLiquidityStatus("Preview the liquidity deposit first.");
      return;
    }

    setLiquidityConfirmOpen(true);
    setLiquidityStatus("Review the liquidity details before confirming.");
  };

  const confirmDemoLiquidity = async () => {
    if (!liquidityPreviewOpen) {
      setLiquidityStatus("Preview the liquidity deposit first.");
      return;
    }

    if (!activeWallet || !walletAddress) {
      setLiquidityStatus("Connect your wallet first before confirming on-chain demo liquidity.");
      return;
    }

    try {
      setLiquidityStatus("Switching network for on-chain demo liquidity...");
      await switchWalletNetwork(selectedNetwork);

      setLiquidityStatus("Opening wallet for demo liquidity transaction...");

      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const tx = await signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther("0"),
      });

      setLiquidityTxHash(tx.hash);
      setLiquidityStatus("Demo liquidity transaction submitted. Waiting for confirmation...");

      await tx.wait();

      const liquidityItem = {
        pool: selectedPool,
        usdcAmount,
        pairToken,
        pairAmount,
        totalDepositUsd: estimate.totalDepositUsd,
        lpTokens: estimate.lpTokens,
        poolShare: estimate.poolShare,
        estimatedApy: estimate.estimatedApy,
        network: selectedNetwork,
        gasToken: getGasLabel(selectedNetwork),
        txHash: tx.hash,
        timestamp: new Date().toLocaleString(),
        status: "On-chain demo liquidity confirmed",
      };

      const updatedLiquidityHistory = [liquidityItem, ...liquidityHistory];

      setLiquidityHistory(updatedLiquidityHistory);

      localStorage.setItem(
        "circleswap_liquidity_history",
        JSON.stringify(updatedLiquidityHistory)
      );

      setLiquidityStatus(
        `On-chain demo liquidity confirmed: ${usdcAmount} USDC + ${pairAmount} ${pairToken} into ${selectedPool}.`
      );

      setLiquidityConfirmOpen(false);
    } catch (error) {
      console.error("On-chain demo liquidity failed:", error);
      setLiquidityStatus(error?.shortMessage || error?.message || "On-chain demo liquidity failed.");
    }
  };

  const clearLiquidityHistory = () => {
    setLiquidityHistory([]);
    localStorage.removeItem("circleswap_liquidity_history");
  };

  return (
    <Card title="Liquidity Pool">
      <p className="soft swap-note">
        Add demo liquidity to USDC-based testnet pools and preview your pool share.
      </p>

      <NetworkSelector
        value={selectedNetwork}
        onChange={(network) => {
          handleNetworkChange(network);
          resetLiquidityPreview();
        }}
      />

      <label>Select Pool</label>
      <select
        value={selectedPool}
        onChange={(e) => {
          setSelectedPool(e.target.value);
          setUsdcAmount("");
          setPairAmount("");
          resetLiquidityPreview();
        }}
      >
        <option>USDC / EURC</option>
        <option>USDC / USDT</option>
        <option>USDC / ETH</option>
      </select>

      <div className="quote-box">
        <span>Network Gas</span>
        <strong>{getGasLabel(selectedNetwork)}</strong>
      </div>

      <div className="quote-box">
        <span>Pool APY</span>
        <strong>{poolInfo.apy}%</strong>
      </div>

      <div className="quote-box">
        <span>Pool TVL</span>
        <strong>${poolInfo.tvl.toLocaleString()}</strong>
      </div>

      <div className="quote-box">
        <span>24h Volume</span>
        <strong>${poolInfo.volume24h.toLocaleString()}</strong>
      </div>

      <div className="quote-box">
        <span>Risk Level</span>
        <strong>{poolInfo.risk}</strong>
      </div>

      <label>USDC Amount</label>
      <input
        placeholder="0.00"
        value={usdcAmount}
        onChange={(e) => {
          setUsdcAmount(e.target.value);
          resetLiquidityPreview();
        }}
      />

      <label>{pairToken} Amount</label>
      <input
        placeholder="0.00"
        value={pairAmount}
        onChange={(e) => {
          setPairAmount(e.target.value);
          resetLiquidityPreview();
        }}
      />

      <div className="quote-box">
        <span>Total Deposit Value</span>
        <strong>${estimate.totalDepositUsd}</strong>
      </div>

      <div className="quote-box">
        <span>Estimated LP Tokens</span>
        <strong>{estimate.lpTokens}</strong>
      </div>

      <div className="quote-box">
        <span>Estimated Pool Share</span>
        <strong>{estimate.poolShare}%</strong>
      </div>

      <div className="quote-box">
        <span>Estimated APY</span>
        <strong>{estimate.estimatedApy}%</strong>
      </div>

      {liquidityPreviewOpen && (
        <div className="profile-preview">
          <div className="avatar">L</div>
          <div>
            <h3>Liquidity Preview Ready</h3>
            <p>
              {usdcAmount} USDC + {pairAmount} {pairToken} into {selectedPool}
            </p>
            <small>
              LP Tokens: {estimate.lpTokens} • Pool Share: {estimate.poolShare}% • APY:{" "}
              {estimate.estimatedApy}%
            </small>
          </div>
        </div>
      )}

      {liquidityStatus && (
        <div className="quote-box">
          <span>Liquidity Status</span>
          <strong>{liquidityStatus}</strong>
        </div>
      )}

      {liquidityTxHash && (
        <div className="quote-box">
          <span>Liquidity Tx Hash</span>
          <strong className="break-text">{liquidityTxHash}</strong>
        </div>
      )}

      {liquidityExplorerTxUrl && (
        <a className="secondary" href={liquidityExplorerTxUrl} target="_blank" rel="noreferrer">
          View Liquidity Tx on Explorer
        </a>
      )}

      <button className="primary" onClick={previewLiquidity}>
        Preview Add Liquidity
      </button>

      <button className="secondary" onClick={openLiquidityConfirmation}>
        Open Liquidity Confirmation
      </button>

      {liquidityConfirmOpen && (
        <div className="profile-preview">
          <div className="avatar">✓</div>
          <div>
            <h3>Confirm On-chain Demo Liquidity</h3>
            <p>
              {usdcAmount} USDC + {pairAmount} {pairToken}
            </p>
            <small>
              Pool: {selectedPool} • Network: {selectedNetwork} • Gas:{" "}
              {getGasLabel(selectedNetwork)}
            </small>

            <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary" onClick={confirmDemoLiquidity}>
                Confirm On-chain Demo Liquidity
              </button>

              <button className="secondary" onClick={() => setLiquidityConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="quote-box">
        <span>Liquidity History</span>
        <strong>
          {liquidityHistory.length} demo position{liquidityHistory.length === 1 ? "" : "s"}
        </strong>
      </div>

      {liquidityHistory.length > 0 && (
        <button className="secondary" onClick={clearLiquidityHistory}>
          Clear Liquidity History
        </button>
      )}

      {liquidityHistory.map((item, index) => (
        <div className="history-card" key={index}>
          <div className="quote-box">
            <span>Pool</span>
            <strong>{item.pool}</strong>
          </div>

          <div className="quote-box">
            <span>Deposit</span>
            <strong>
              {item.usdcAmount} USDC + {item.pairAmount} {item.pairToken}
            </strong>
          </div>

          <div className="quote-box">
            <span>Total Value</span>
            <strong>${item.totalDepositUsd}</strong>
          </div>

          <div className="quote-box">
            <span>LP Tokens</span>
            <strong>{item.lpTokens}</strong>
          </div>

          <div className="quote-box">
            <span>Pool Share</span>
            <strong>{item.poolShare}%</strong>
          </div>

          <div className="quote-box">
            <span>APY</span>
            <strong>{item.estimatedApy}%</strong>
          </div>

          <div className="quote-box">
            <span>Status</span>
            <strong>{item.status}</strong>
          </div>

          {item.txHash && (
            <div className="quote-box">
              <span>Tx Hash</span>
              <strong className="break-text">{item.txHash}</strong>
            </div>
          )}

          <div className="quote-box">
            <span>Time</span>
            <strong>{item.timestamp}</strong>
          </div>
        </div>
      ))}
    </Card>
  );
}

function Perps({
  selectedNetwork,
  perpsHistory,
  setPerpsHistory,
  openPerpsPositions,
  setOpenPerpsPositions,
  activeWallet,
  walletAddress,
}) {
  const [selectedPair, setSelectedPair] = useState("BTC/USDC");
  const [side, setSide] = useState("Long");
  const [collateral, setCollateral] = useState("");
  const [leverage, setLeverage] = useState("2");
  const [entryMovePercent, setEntryMovePercent] = useState("1");
  const [orderType, setOrderType] = useState("Market");
  const [perpsStatus, setPerpsStatus] = useState("");
  const [perpsPreviewOpen, setPerpsPreviewOpen] = useState(false);
  const [perpsConfirmOpen, setPerpsConfirmOpen] = useState(false);
  const [perpsTxHash, setPerpsTxHash] = useState("");
  const [livePerpPrices, setLivePerpPrices] = useState({});
  const [priceStatus, setPriceStatus] = useState("Loading live market prices...");
  const [lastPriceUpdate, setLastPriceUpdate] = useState("");
  const [closingPositionId, setClosingPositionId] = useState("");

  const estimate = calculatePerpsEstimate(
    selectedPair,
    side,
    collateral,
    leverage,
    entryMovePercent,
    livePerpPrices
  );

  const selectedMarket = getPerpMarketInfo(selectedPair, livePerpPrices);
  const hasValidCollateral = collateral && Number(collateral) > 0;
  const selectedNetworkInfo = getNetworkByName(selectedNetwork);
  const perpsExplorerTxUrl =
    selectedNetworkInfo && perpsTxHash
      ? `${selectedNetworkInfo.explorer}/tx/${perpsTxHash}`
      : "";

  const chartSeed = Number(selectedMarket.price || 1000);
  const chartCandles = Array.from({ length: 32 }, (_, index) => {
    const wave = Math.sin(index * 0.72) * 0.018;
    const drift = (index - 16) * 0.0015;
    const close = chartSeed * (1 + wave + drift);
    const open = chartSeed * (1 + Math.sin((index - 1) * 0.72) * 0.018 + (index - 17) * 0.0015);
    const high = Math.max(open, close) * (1 + 0.006 + (index % 3) * 0.002);
    const low = Math.min(open, close) * (1 - 0.006 - (index % 4) * 0.0015);
    const up = close >= open;

    return { open, close, high, low, up };
  });

  const orderBookRows = Array.from({ length: 7 }, (_, index) => {
    const spread = chartSeed * (0.0008 + index * 0.0009);
    const size = (1.2 + index * 0.74).toFixed(3);

    return {
      ask: chartSeed + spread,
      bid: chartSeed - spread,
      size,
    };
  });

  const recentTrades = Array.from({ length: 8 }, (_, index) => {
    const direction = index % 2 === 0 ? "Long" : "Short";
    const priceShift = chartSeed * ((index - 4) * 0.0007);

    return {
      side: direction,
      price: chartSeed + priceShift,
      size: (0.18 + index * 0.11).toFixed(3),
    };
  });

  const loadLivePrices = async () => {
    try {
      setPriceStatus("Refreshing live market prices...");

      const prices = await fetchLivePerpPrices();

      setLivePerpPrices(prices);
      setLastPriceUpdate(new Date().toLocaleTimeString());
      setPriceStatus("Live prices updated from CoinGecko.");
    } catch (error) {
      console.error("Live perps price fetch failed:", error);
      setPriceStatus("Could not load live prices. Showing fallback demo prices.");
    }
  };

  useEffect(() => {
    loadLivePrices();

    const interval = setInterval(loadLivePrices, 60000);

    return () => clearInterval(interval);
  }, []);

  const resetPerpsPreview = () => {
    setPerpsStatus("");
    setPerpsPreviewOpen(false);
    setPerpsConfirmOpen(false);
    setPerpsTxHash("");
  };

  const selectMarket = (pair, selectedSide) => {
    setSelectedPair(pair);
    setSide(selectedSide);
    resetPerpsPreview();
  };

  const previewPosition = () => {
    if (!hasValidCollateral) {
      setPerpsStatus("Enter a valid USDC collateral amount first.");
      return;
    }

    setPerpsStatus("Perps position preview ready.");
    setPerpsPreviewOpen(true);
  };

  const openPerpsConfirmation = () => {
    if (!perpsPreviewOpen) {
      setPerpsStatus("Preview the perps position first.");
      return;
    }

    setPerpsConfirmOpen(true);
    setPerpsStatus("Review the position details before confirming.");
  };

  const getPositionLiveStats = (position) => {
    const currentMarket = getPerpMarketInfo(position.pair, livePerpPrices);
    const currentPrice = Number(currentMarket.price);
    const entryPrice = Number(position.entryPrice);
    const positionSize = Number(position.positionSize);
    const collateralAmount = Number(position.collateral);

    if (!entryPrice || !currentPrice || !positionSize || !collateralAmount) {
      return {
        currentPrice: currentPrice || entryPrice || 0,
        priceChangePercent: "0.00",
        livePnl: "0.00",
        liveRoi: "0.00",
      };
    }

    const rawMove = ((currentPrice - entryPrice) / entryPrice) * 100;
    const direction = position.side === "Long" ? 1 : -1;
    const livePnl = positionSize * ((rawMove * direction) / 100);
    const liveRoi = (livePnl / collateralAmount) * 100;

    return {
      currentPrice,
      priceChangePercent: (rawMove * direction).toFixed(2),
      livePnl: livePnl.toFixed(2),
      liveRoi: liveRoi.toFixed(2),
    };
  };

  const confirmDemoPosition = async () => {
    if (!perpsPreviewOpen) {
      setPerpsStatus("Preview the perps position first.");
      return;
    }

    if (!activeWallet || !walletAddress) {
      setPerpsStatus("Connect your wallet first before opening an on-chain demo perps position.");
      return;
    }

    try {
      setPerpsStatus("Switching network for on-chain demo perps position...");
      await switchWalletNetwork(selectedNetwork);

      setPerpsStatus("Opening wallet to create demo perps position...");

      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const tx = await signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther("0"),
      });

      setPerpsTxHash(tx.hash);
      setPerpsStatus("Open-position transaction submitted. Waiting for confirmation...");

      await tx.wait();

      const openPosition = {
        id: `${Date.now()}-${tx.hash}`,
        pair: selectedPair,
        side,
        collateral,
        leverage,
        orderType,
        entryMovePercent,
        entryPrice: estimate.marketPrice,
        positionSize: estimate.positionSize,
        marginRequired: estimate.marginRequired,
        liquidationPrice: estimate.liquidationPrice,
        fundingRate: estimate.fundingRate,
        network: selectedNetwork,
        gasToken: getGasLabel(selectedNetwork),
        openTxHash: tx.hash,
        openedAt: new Date().toLocaleString(),
        status: "Open",
      };

      const updatedOpenPositions = [openPosition, ...openPerpsPositions];

      setOpenPerpsPositions(updatedOpenPositions);
      localStorage.setItem(
        "circleswap_open_perps_positions",
        JSON.stringify(updatedOpenPositions)
      );

      setPerpsStatus(
        `Open ${side.toLowerCase()} position created: ${selectedPair} at ${leverage}x leverage.`
      );

      setPerpsConfirmOpen(false);
    } catch (error) {
      console.error("Open perps position failed:", error);
      setPerpsStatus(error?.shortMessage || error?.message || "Open perps position failed.");
    }
  };

  const closeOpenPosition = async (position) => {
    if (!activeWallet || !walletAddress) {
      setPerpsStatus("Connect your wallet first before closing this position.");
      return;
    }

    try {
      setClosingPositionId(position.id);
      setPerpsStatus(`Opening wallet to close ${position.side} ${position.pair} position...`);
      await switchWalletNetwork(position.network || selectedNetwork);

      const ethereumProvider = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(ethereumProvider);
      const signer = await provider.getSigner();

      const tx = await signer.sendTransaction({
        to: walletAddress,
        value: ethers.parseEther("0"),
      });

      setPerpsTxHash(tx.hash);
      setPerpsStatus("Close-position transaction submitted. Waiting for confirmation...");

      await tx.wait();

      const liveStats = getPositionLiveStats(position);
      const closedPosition = {
        ...position,
        closeTxHash: tx.hash,
        exitPrice: liveStats.currentPrice,
        finalPnl: liveStats.livePnl,
        finalRoi: liveStats.liveRoi,
        closedAt: new Date().toLocaleString(),
        status: "Closed",
      };

      const updatedOpenPositions = openPerpsPositions.filter(
        (item) => item.id !== position.id
      );
      const updatedHistory = [closedPosition, ...perpsHistory];

      setOpenPerpsPositions(updatedOpenPositions);
      setPerpsHistory(updatedHistory);

      localStorage.setItem(
        "circleswap_open_perps_positions",
        JSON.stringify(updatedOpenPositions)
      );
      localStorage.setItem(
        "circleswap_perps_history",
        JSON.stringify(updatedHistory)
      );

      setPerpsStatus(
        `Position closed: ${position.side} ${position.pair}. Final PnL: $${liveStats.livePnl}.`
      );
    } catch (error) {
      console.error("Close perps position failed:", error);
      setPerpsStatus(error?.shortMessage || error?.message || "Close perps position failed.");
    } finally {
      setClosingPositionId("");
    }
  };

  const clearPerpsHistory = () => {
    setPerpsHistory([]);
    localStorage.removeItem("circleswap_perps_history");
  };

  const clearOpenPositions = () => {
    setOpenPerpsPositions([]);
    localStorage.removeItem("circleswap_open_perps_positions");
  };

  return (
    <div className="perps-terminal">
      <div className="perps-topbar">
        <div>
          <span className="pill">Perps Terminal • On-chain Demo</span>
          <h2>{selectedPair}</h2>
          <p>
            ${formatUsd(selectedMarket.price)} • {selectedMarket.isLive ? "Live market price" : "Fallback price"} • Funding {selectedMarket.funding}%
          </p>
        </div>

        <div className="perps-top-actions">
          <button className="secondary" onClick={loadLivePrices}>
            Refresh Prices
          </button>
        </div>
      </div>

      <div className="perps-market-strip">
        {["BTC/USDC", "ETH/USDC", "SOL/USDC"].map((pair) => {
          const marketInfo = getPerpMarketInfo(pair, livePerpPrices);
          const isActive = selectedPair === pair;

          return (
            <button
              className={isActive ? "perps-market-card active" : "perps-market-card"}
              key={pair}
              onClick={() => selectMarket(pair, side)}
            >
              <span>{pair}</span>
              <strong>${formatUsd(marketInfo.price)}</strong>
              <small>{marketInfo.isLive ? "Live" : "Fallback"} • Funding {marketInfo.funding}%</small>
            </button>
          );
        })}
      </div>

      <div className="perps-grid">
        <section className="perps-chart-panel">
          <div className="perps-panel-head">
            <div>
              <h3>{selectedPair} Chart</h3>
              <p>{priceStatus}</p>
            </div>
            <strong>{lastPriceUpdate ? `Updated ${lastPriceUpdate}` : "Loading..."}</strong>
          </div>

          <div className="perps-chart">
            {chartCandles.map((candle, index) => {
              const top = Math.max(8, 40 - ((candle.high - chartSeed) / chartSeed) * 700);
              const height = Math.max(22, Math.abs(candle.close - candle.open) / chartSeed * 1600);
              const wickHeight = Math.max(42, Math.abs(candle.high - candle.low) / chartSeed * 1200);

              return (
                <div className="candle-wrap" key={index}>
                  <span
                    className={candle.up ? "candle-wick up" : "candle-wick down"}
                    style={{ height: `${wickHeight}px`, marginTop: `${top}px` }}
                  />
                  <span
                    className={candle.up ? "candle-body up" : "candle-body down"}
                    style={{ height: `${height}px` }}
                  />
                </div>
              );
            })}
          </div>

          <div className="perps-chart-footer">
            <span>1m</span>
            <span>5m</span>
            <span>15m</span>
            <span>1h</span>
            <span>4h</span>
            <strong>Demo chart powered by live price anchor</strong>
          </div>
        </section>

        <aside className="perps-orderbook">
          <h3>Order Book</h3>

          <div className="book-table asks">
            {orderBookRows.slice().reverse().map((row, index) => (
              <div key={`ask-${index}`}>
                <span>${formatUsd(row.ask)}</span>
                <strong>{row.size}</strong>
              </div>
            ))}
          </div>

          <div className="book-mid">${formatUsd(selectedMarket.price)}</div>

          <div className="book-table bids">
            {orderBookRows.map((row, index) => (
              <div key={`bid-${index}`}>
                <span>${formatUsd(row.bid)}</span>
                <strong>{row.size}</strong>
              </div>
            ))}
          </div>

          <h3>Recent Trades</h3>
          <div className="recent-trades">
            {recentTrades.map((trade, index) => (
              <div key={index}>
                <span className={trade.side === "Long" ? "green-text" : "red-text"}>
                  {trade.side}
                </span>
                <strong>${formatUsd(trade.price)}</strong>
                <small>{trade.size}</small>
              </div>
            ))}
          </div>
        </aside>

        <aside className="perps-trade-ticket">
          <h3>Trade Ticket</h3>

          <div className="side-toggle">
            <button
              className={side === "Long" ? "active-long" : ""}
              onClick={() => {
                setSide("Long");
                resetPerpsPreview();
              }}
            >
              Long
            </button>
            <button
              className={side === "Short" ? "active-short" : ""}
              onClick={() => {
                setSide("Short");
                resetPerpsPreview();
              }}
            >
              Short
            </button>
          </div>

          <label>Market</label>
          <select
            value={selectedPair}
            onChange={(e) => {
              setSelectedPair(e.target.value);
              resetPerpsPreview();
            }}
          >
            <option>BTC/USDC</option>
            <option>ETH/USDC</option>
            <option>SOL/USDC</option>
          </select>

          <label>Order Type</label>
          <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
            <option>Market</option>
            <option>Limit Demo</option>
          </select>

          <label>Collateral Amount</label>
          <input
            placeholder="Amount in USDC"
            value={collateral}
            onChange={(e) => {
              setCollateral(e.target.value);
              resetPerpsPreview();
            }}
          />

          <label>Leverage</label>
          <select
            value={leverage}
            onChange={(e) => {
              setLeverage(e.target.value);
              resetPerpsPreview();
            }}
          >
            <option value="2">2x</option>
            <option value="5">5x</option>
            <option value="10">10x</option>
          </select>

          <label>Demo Price Move</label>
          <select
            value={entryMovePercent}
            onChange={(e) => {
              setEntryMovePercent(e.target.value);
              resetPerpsPreview();
            }}
          >
            <option value="1">+1%</option>
            <option value="3">+3%</option>
            <option value="-1">-1%</option>
            <option value="-3">-3%</option>
          </select>

          <div className="quote-box">
            <span>Position Size</span>
            <strong>${estimate.positionSize}</strong>
          </div>

          <div className="quote-box">
            <span>Entry Price</span>
            <strong>${formatUsd(estimate.marketPrice)}</strong>
          </div>

          <div className="quote-box">
            <span>Liquidation Price</span>
            <strong>${formatUsd(estimate.liquidationPrice)}</strong>
          </div>

          <div className="quote-box">
            <span>Estimated PnL</span>
            <strong className={Number(estimate.estimatedPnl) >= 0 ? "green-text" : "red-text"}>
              ${estimate.estimatedPnl}
            </strong>
          </div>

          <button className="primary" onClick={previewPosition}>
            Preview Position
          </button>

          <button className="secondary" onClick={openPerpsConfirmation}>
            Open Position
          </button>
        </aside>
      </div>

      {perpsPreviewOpen && (
        <div className="perps-wide-card">
          <div className="avatar">P</div>
          <div>
            <h3>Position Preview Ready</h3>
            <p>
              {side} {selectedPair} • ${collateral || "0"} collateral • {leverage}x leverage
            </p>
            <small>
              Position size: ${estimate.positionSize} • Liquidation: ${formatUsd(estimate.liquidationPrice)} • Funding: {estimate.fundingRate}%
            </small>
          </div>
        </div>
      )}

      {perpsStatus && (
        <div className="quote-box">
          <span>Perps Status</span>
          <strong>{perpsStatus}</strong>
        </div>
      )}

      {perpsConfirmOpen && (
        <div className="perps-wide-card">
          <div className="avatar">✓</div>
          <div>
            <h3>Confirm On-chain Demo Position</h3>
            <p>
              {side} {selectedPair} at {leverage}x leverage
            </p>
            <small>
              Wallet will open and submit a 0-value testnet transaction as proof of this demo position.
            </small>

            <div style={{ marginTop: "12px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="primary" onClick={confirmDemoPosition}>
                Confirm Open Position
              </button>

              <button className="secondary" onClick={() => setPerpsConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {perpsExplorerTxUrl && (
        <a className="secondary" href={perpsExplorerTxUrl} target="_blank" rel="noreferrer">
          View Latest Perps Tx on Explorer
        </a>
      )}

      <div className="perps-positions-grid">
        <section className="perps-position-panel">
          <div className="perps-panel-head">
            <div>
              <h3>Open Positions</h3>
              <p>Monitor live PnL and close positions anytime.</p>
            </div>
            <strong>{openPerpsPositions.length}</strong>
          </div>

          {openPerpsPositions.length > 0 && (
            <button className="secondary" onClick={clearOpenPositions}>
              Clear Open Positions Locally
            </button>
          )}

          {openPerpsPositions.length === 0 ? (
            <div className="quote-box">
              <span>Status</span>
              <strong>No open positions yet</strong>
            </div>
          ) : (
            openPerpsPositions.map((position) => {
              const liveStats = getPositionLiveStats(position);
              const isPositive = Number(liveStats.livePnl) >= 0;

              return (
                <div className="position-row" key={position.id}>
                  <div>
                    <strong>{position.side} {position.pair}</strong>
                    <span>{position.leverage}x • {position.orderType || "Market"} • {position.openedAt}</span>
                  </div>
                  <div>
                    <span>Entry</span>
                    <strong>${formatUsd(position.entryPrice)}</strong>
                  </div>
                  <div>
                    <span>Mark</span>
                    <strong>${formatUsd(liveStats.currentPrice)}</strong>
                  </div>
                  <div>
                    <span>PnL</span>
                    <strong className={isPositive ? "green-text" : "red-text"}>
                      ${liveStats.livePnl} ({liveStats.liveRoi}%)
                    </strong>
                  </div>
                  <button
                    className="secondary"
                    disabled={closingPositionId === position.id}
                    onClick={() => closeOpenPosition(position)}
                  >
                    {closingPositionId === position.id ? "Closing..." : "Close Position"}
                  </button>
                </div>
              );
            })
          )}
        </section>

        <section className="perps-position-panel">
          <div className="perps-panel-head">
            <div>
              <h3>Closed Trade History</h3>
              <p>Closed demo positions are saved locally.</p>
            </div>
            <strong>{perpsHistory.length}</strong>
          </div>

          {perpsHistory.length > 0 && (
            <button className="secondary" onClick={clearPerpsHistory}>
              Clear Closed History
            </button>
          )}

          {perpsHistory.length === 0 ? (
            <div className="quote-box">
              <span>Status</span>
              <strong>No closed trades yet</strong>
            </div>
          ) : (
            perpsHistory.map((item, index) => (
              <div className="history-card" key={index}>
                <div className="quote-box">
                  <span>Trade</span>
                  <strong>{item.side} {item.pair} {item.leverage}x</strong>
                </div>

                <div className="quote-box">
                  <span>Entry → Exit</span>
                  <strong>${formatUsd(item.entryPrice)} → ${formatUsd(item.exitPrice)}</strong>
                </div>

                <div className="quote-box">
                  <span>Final PnL</span>
                  <strong className={Number(item.finalPnl) >= 0 ? "green-text" : "red-text"}>
                    ${item.finalPnl} ({item.finalRoi}%)
                  </strong>
                </div>

                <div className="quote-box">
                  <span>Opened</span>
                  <strong>{item.openedAt}</strong>
                </div>

                <div className="quote-box">
                  <span>Closed</span>
                  <strong>{item.closedAt}</strong>
                </div>

                <div className="quote-box">
                  <span>Open Tx</span>
                  <strong className="break-text">{item.openTxHash}</strong>
                </div>

                <div className="quote-box">
                  <span>Close Tx</span>
                  <strong className="break-text">{item.closeTxHash}</strong>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}


function Card({ title, children }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function pageTitle(tab) {
  return {
    swap: "Swap tokens across Arc, Base Sepolia and Ethereum Sepolia",
    bridge: "Bridge between Arc Testnet and supported Sepolia networks",
    liquidity: "Provide liquidity to USDC-based testnet pools",
    perps: "Trade demo perpetual markets with USDC collateral",
    wallet: "Connect account and manage username-based sending",
  }[tab];
}

function pageText(tab) {
  return {
    swap: "Arc Testnet supports USDC, USDT, EURC and ETH testnet swap flows. You can also switch to Base Sepolia or Ethereum Sepolia.",
    bridge: "Move USDC and supported test tokens between Arc Testnet, Base Sepolia and Ethereum Sepolia.",
    liquidity: "Supply USDC-based liquidity pools on Arc Testnet and supported test networks.",
    perps: "Open demo long or short positions on USDC pairs before adding real perp integrations.",
    wallet: "Sending now checks your backend username registry instead of only a demo list.",
  }[tab];
}