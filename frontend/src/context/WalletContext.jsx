import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { ethers } from "ethers";
import { XLAYER_TESTNET, XLAYER_MAINNET, HARDHAT_LOCAL, getChainById } from "../constants/chains.js";
import { CONTRACTS } from "../constants/contracts.js";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [provider, setProvider]   = useState(null);
  const [signer,   setSigner]     = useState(null);
  const [account,  setAccount]    = useState(null);
  const [chainId,  setChainId]    = useState(null);
  const [error,    setError]      = useState(null);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("未检测到钱包，请安装 MetaMask 或兼容钱包。");
      return;
    }
    try {
      const bp   = new ethers.BrowserProvider(window.ethereum);
      const sg   = await bp.getSigner();
      const addr = await sg.getAddress();
      const net  = await bp.getNetwork();

      setProvider(bp);
      setSigner(sg);
      setAccount(addr);
      setChainId(Number(net.chainId));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount(null);
    setChainId(null);
  }, []);

  // 切换到指定网络（支持本地 Hardhat + X Layer）
  const switchToNetwork = useCallback(async (target) => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: target.chainIdHex }],
      });
    } catch (switchErr) {
      if (switchErr.code === 4902) {
        // 钱包内没有此网络，自动添加
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId:           target.chainIdHex,
            chainName:         target.name,
            rpcUrls:           [target.rpcUrl],
            nativeCurrency:    target.nativeCurrency,
            blockExplorerUrls: target.explorerUrl ? [target.explorerUrl] : [],
          }],
        });
      } else {
        setError(switchErr.message);
      }
    }
  }, []);

  const switchToXLayer    = useCallback((testnet = true) =>
    switchToNetwork(testnet ? XLAYER_TESTNET : XLAYER_MAINNET), [switchToNetwork]);

  const switchToLocalNode = useCallback(() =>
    switchToNetwork(HARDHAT_LOCAL), [switchToNetwork]);

  // 监听账户变更和链变更事件
  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccounts = (accounts) => {
      if (accounts.length === 0) disconnect();
      else setAccount(accounts[0]);
    };
    const handleChain = (chainIdHex) => {
      const id = parseInt(chainIdHex, 16);
      setChainId(id);
      // 链切换后重新获取 provider/signer
      const bp = new ethers.BrowserProvider(window.ethereum);
      setProvider(bp);
      bp.getSigner().then(setSigner).catch(() => {});
    };

    window.ethereum.on("accountsChanged", handleAccounts);
    window.ethereum.on("chainChanged",    handleChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccounts);
      window.ethereum.removeListener("chainChanged",    handleChain);
    };
  }, [disconnect]);

  const currentChain = chainId ? getChainById(chainId) : null;

  // 判断当前网络是否有已部署合约
  const hasContract = chainId && CONTRACTS[chainId]
    && CONTRACTS[chainId].hookAddress !== ethers.ZeroAddress;

  return (
    <WalletContext.Provider
      value={{
        provider, signer, account, chainId, currentChain,
        error, hasContract,
        connect, disconnect,
        switchToXLayer, switchToLocalNode, switchToNetwork,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet 必须在 WalletProvider 内部使用");
  return ctx;
}
