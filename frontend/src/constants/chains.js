export const XLAYER_TESTNET = {
  chainId: 195,
  chainIdHex: "0xC3",
  name: "X Layer Testnet",
  rpcUrl: "https://testrpc.xlayer.tech",
  explorerUrl: "https://www.oklink.com/xlayer-test",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
};

export const XLAYER_MAINNET = {
  chainId: 196,
  chainIdHex: "0xC4",
  name: "X Layer",
  rpcUrl: "https://rpc.xlayer.tech",
  explorerUrl: "https://www.oklink.com/xlayer",
  nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
};

export const HARDHAT_LOCAL = {
  chainId: 31337,
  chainIdHex: "0x7A69",
  name: "Hardhat Local",
  rpcUrl: "http://127.0.0.1:8545",
  explorerUrl: null,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
};

export const SUPPORTED_CHAINS = [XLAYER_TESTNET, XLAYER_MAINNET, HARDHAT_LOCAL];

export function getChainById(chainId) {
  return SUPPORTED_CHAINS.find((c) => c.chainId === Number(chainId));
}
