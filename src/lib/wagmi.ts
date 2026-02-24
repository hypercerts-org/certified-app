import { http, createConfig } from "wagmi"
import { mainnet, base, optimism, arbitrum } from "wagmi/chains"
import { coinbaseWallet, walletConnect, injected } from "wagmi/connectors"

export const config = createConfig({
  chains: [mainnet, base, optimism, arbitrum],
  connectors: [
    injected(),
    coinbaseWallet({ appName: "Certified", preference: "smartWalletOnly" }),
    // walletConnect only if project ID is set
    ...(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
      ? [walletConnect({ projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID })]
      : []),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
  },
  ssr: true,
})

export const SUPPORTED_CHAINS: Record<number, { name: string; icon: string }> = {
  1: { name: "Ethereum", icon: "⟠" },
  8453: { name: "Base", icon: "🔵" },
  10: { name: "Optimism", icon: "🔴" },
  42161: { name: "Arbitrum", icon: "🔷" },
}
