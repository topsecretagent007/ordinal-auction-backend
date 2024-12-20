import dotenv from "dotenv";
dotenv.config();

try {
  dotenv.config();
} catch (error) {
  console.error("Error loading environment variables:", error);
  process.exit(1);
}

export const MONGO_URL = `mongodb://inscribedev:j9hk9%5EHy!L9y@34.218.183.145:27017/inscribe-dev?authMechanism=DEFAULT&retryWrites=true&w=majority`;
export const PORT = process.env.PORT || 9000;

export const TESTNET = "testnet";
export const MAINNET = "mainnet";
export const networkType = process.env.NETWORKTYPE ?? "";

export const FASTESTFEE = "fastestFee";
export const HALFHOURFEE = "halfHourFee";
export const HOURFEE = "hourFee";
export const MINIMUMFEE = "minimumFee";

export const SEND_UTXO_FEE_LIMIT = 10000;
export const PRIVATE_KEY: string = process.env.PRIVATE_KEY as string;
export const INITIAL_PRICE: string = process.env.INITIAL_PRICE as string;

export const TREASURY_WALLET_ADDRESS: string = process.env.TREASURY_WALLET_ADDRESS as string;

export const padding = 546;


export const commitTxVirtualByte = 154;
export const revealTxVirtualByte = 226;