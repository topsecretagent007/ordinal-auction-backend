const bitcoin = require("bitcoinjs-lib");
import { networkType, TESTNET } from "../config/config";

const network =
  networkType == TESTNET
    ? bitcoin.networks.testnet
    : bitcoin.networks.bitcoin;

export function isValidBitcoinAddress(address: string): Boolean {
  try {
    bitcoin.address.toOutputScript(address, network);
    return true;
  } catch (e) {
    return false;
  }
}
