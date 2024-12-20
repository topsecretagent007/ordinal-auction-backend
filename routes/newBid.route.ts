import { Request, Response, Router } from "express";
import { check, validationResult } from "express-validator";
import * as Bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import Auction from "../models/Auction";
import { INITIAL_PRICE } from "../config";
import { FASTESTFEE, HOURFEE, MAINNET, networkType, PRIVATE_KEY, TESTNET } from "../config/config";
import { getRecommendedFeeRate, getTxHex, getUtxos, pushBTCpmt } from "../utils/mempool";
import { WIFWallet } from "../utils/initializeWallet";
import { isValidBitcoinAddress } from "../utils/validationAddress";

Bitcoin.initEccLib(ecc);

//create a new instance of the express router
const NewBidRoute = Router();

// @route    POST api/bid/new
// @desc     new-bid request
// @access   Private

NewBidRoute.post(
    "/new",
    check("taprootAddress", "Taproot Address is required").notEmpty(),
    check("paymentAddress", "Payment Address is required").notEmpty(),
    check("paymentPublicKey", "Payment Public Key is required").notEmpty(),
    check("price", "Price is required").notEmpty(),

    async (req: Request, res: Response) => {
        try {
            // Validate Form Inputs
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(500).json({ error: errors.array() });
            }

            const auctions = await Auction.find();

            // Getting parameter from request
            const { paymentAddress, paymentPublicKey, taprootAddress, price } = req.body;

            let priceList = auctions[auctions.length - 1]?.users?.map((item: any, index: number) => item.price)

            if (price < +INITIAL_PRICE) {
                return res.status(500).json({ error: "Price is not enough to become new winner!" })
            }
            if (priceList && price <= Math.max(...priceList)) {
                return res.status(500).json({ error: "Price is not enough to become new winner!" })
            }

            // Get Fee Rate
            let recommendedFeeRate = await getRecommendedFeeRate(networkType);

            let feeRate = 0;

            if (recommendedFeeRate) {
                feeRate = recommendedFeeRate[HOURFEE]
            }

            // Initialize wallet
            let wallet: WIFWallet;

            if (process.env.NEXT_PUBLIC_NETWORK_TYPE == MAINNET) {
                wallet = new WIFWallet({
                    networkType: MAINNET,
                    privateKey: PRIVATE_KEY
                })
            } else {
                wallet = new WIFWallet({
                    networkType: TESTNET,
                    privateKey: PRIVATE_KEY
                })
            }
            if (isValidBitcoinAddress(taprootAddress) && isValidBitcoinAddress(paymentAddress)) {

                // Get BTC UTXO Array using unisat api
                let BTCUtxoArray = await getUtxos(paymentAddress, networkType)

                BTCUtxoArray = BTCUtxoArray.filter((item: any, index: number) => item.value > 10000)

                let necessaryUtxoArray = [];
                let signingIndexes = [];

                let fee = 600;
                let sumUtxos = 0;

                let psbtCreatingFlag = false;

                for (let i = 0; i < BTCUtxoArray.length; i++) {
                    necessaryUtxoArray.push(BTCUtxoArray[i]);
                    signingIndexes.push(i);

                    sumUtxos += BTCUtxoArray[i].value;
                    if (sumUtxos > +price * 10 ** 8 + fee) {

                        const psbt = new Bitcoin.Psbt({
                            network:
                                networkType == TESTNET
                                    ? Bitcoin.networks.testnet
                                    : Bitcoin.networks.bitcoin,
                        });
                        necessaryUtxoArray.map(async (item: any, index: number) => {

                            psbt.addInput({
                                hash: item.txid,
                                index: item.vout,
                                witnessUtxo: {
                                    value: item.value,
                                    script: wallet.output,
                                },
                                tapInternalKey: Buffer.from(wallet.publicKey, "hex").subarray(1, 33),
                            });
                        })
                        psbt.addOutput({
                            address: wallet.address,
                            value: 600,
                        });
                        psbt.addOutput({
                            address: wallet.address,
                            value: 600
                        })

                        psbt.setMaximumFeeRate(100000);

                        let dummyPsbt = wallet.signPsbt(psbt, wallet.ecPair);

                        fee = dummyPsbt.extractTransaction(true).virtualSize() * feeRate;

                        if (sumUtxos > +price * 10 ** 8 + fee) {
                            psbtCreatingFlag = true;
                            break;
                        }
                    }
                }
                if (psbtCreatingFlag) {

                    const realPsbt = new Bitcoin.Psbt({
                        network:
                            networkType == TESTNET
                                ? Bitcoin.networks.testnet
                                : Bitcoin.networks.bitcoin,
                    });
                    const network = networkType == TESTNET
                        ? Bitcoin.networks.testnet
                        : Bitcoin.networks.bitcoin;

                    for (let i = 0; i < necessaryUtxoArray.length; i++) {

                        if (taprootAddress == paymentAddress) {
                            realPsbt.addInput({
                                hash: necessaryUtxoArray[i].txid,
                                index: necessaryUtxoArray[i].vout,
                                witnessUtxo: {
                                    value: necessaryUtxoArray[i].value,
                                    script: Bitcoin.address.toOutputScript(paymentAddress as string, network)
                                },
                                tapInternalKey: Buffer.from(paymentPublicKey, "hex").subarray(1, 33),
                            });
                        } else {
                            // Create a Pay-to-Public-Key-Hash (P2PKH) script
                            const p2pkhScript = Bitcoin.script.compile([
                                Bitcoin.opcodes.OP_0, // OP_0 indicates a P2PKH script
                                Bitcoin.crypto.hash160(
                                    Buffer.from(paymentPublicKey, "hex")
                                ), // Hash160 of the public key
                            ]);

                            const txHex = await getTxHex(necessaryUtxoArray[i].txid, networkType);

                            realPsbt.addInput({
                                hash: necessaryUtxoArray[i].txid,
                                index: necessaryUtxoArray[i].vout,
                                nonWitnessUtxo: Buffer.from(txHex, "hex"),
                                redeemScript: p2pkhScript,
                            });
                        }
                    }
                    realPsbt.addOutput({
                        address: wallet.address,
                        value: Math.floor(+price * 10 ** 8),
                    });
                    realPsbt.addOutput({
                        address: paymentAddress,
                        value: Math.floor(sumUtxos - fee - (+price * 10 ** 8))
                    })

                    return res.status(200).json({
                        psbt: realPsbt.toHex(),
                        signingIndexes: signingIndexes
                    })
                } else {
                    res.status(500).json({
                        error: "Insufficient balance in user's wallet."
                    })
                }
            } else {
                return res.status(500).json({ error: "Address is not valid." })
            }

        } catch (error: any) {
            console.log(error.message);
            return res.status(500).send({ error });
        }
    }
);


// @route    POST api/bid/confirm
// @desc     new-bid confirm request
// @access   Private

NewBidRoute.post(
    "/confirm",
    check("taprootAddress", "Taproot Address is required").notEmpty(),
    check("paymentAddress", "Payment Address is required").notEmpty(),
    check("price", "Price is required").notEmpty(),
    check("txHex", "Transaction hex is required").notEmpty(),

    async (req: Request, res: Response) => {
        try {
            // Validate Form Inputs
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(500).json({ error: errors.array() });
            }

            let auctions = await Auction.find();

            // Getting parameter from request
            const { paymentAddress, taprootAddress, price, txHex } = req.body;


            let txid = await pushBTCpmt(txHex, networkType);
            // let txid = "test";

            if (txid) {
                let updatedAuction = new Auction(auctions[auctions.length - 1]);

                if (updatedAuction.users.length) {

                    let lastUser = updatedAuction.users[0];

                    // Initialize wallet
                    let wallet: WIFWallet;

                    if (process.env.NEXT_PUBLIC_NETWORK_TYPE == MAINNET) {
                        wallet = new WIFWallet({
                            networkType: MAINNET,
                            privateKey: PRIVATE_KEY
                        })
                    } else {
                        wallet = new WIFWallet({
                            networkType: TESTNET,
                            privateKey: PRIVATE_KEY
                        })
                    }
                    let utxos = await getUtxos(wallet.address, networkType)

                    if (utxos.length) {
                        utxos = utxos.filter((item: any, index: number) => item.txid == lastUser.txid)
                    }
                    if (utxos.length) {
                        const psbt = new Bitcoin.Psbt({
                            network:
                                networkType == TESTNET
                                    ? Bitcoin.networks.testnet
                                    : Bitcoin.networks.bitcoin,
                        });
                        psbt.addInput({
                            hash: utxos[0].txid,
                            index: utxos[0].vout,
                            witnessUtxo: {
                                value: utxos[0].value,
                                script: wallet.output,
                            },
                            tapInternalKey: Buffer.from(wallet.publicKey, "hex").subarray(1, 33),
                        });
                        psbt.addOutput({
                            address: lastUser.paymentAddress,
                            value: 600,
                        });

                        psbt.setMaximumFeeRate(100000);

                        let dummyPsbt = wallet.signPsbt(psbt, wallet.ecPair);

                        // Get Fee Rate
                        let recommendedFeeRate = await getRecommendedFeeRate(networkType);

                        let feeRate = 0;

                        if (recommendedFeeRate) {
                            feeRate = recommendedFeeRate[HOURFEE]
                        }

                        let fee = dummyPsbt.extractTransaction(true).virtualSize() * feeRate;

                        const realPsbt = new Bitcoin.Psbt({
                            network:
                                networkType == TESTNET
                                    ? Bitcoin.networks.testnet
                                    : Bitcoin.networks.bitcoin,
                        });
                        realPsbt.addInput({
                            hash: utxos[0].txid,
                            index: utxos[0].vout,
                            witnessUtxo: {
                                value: utxos[0].value,
                                script: wallet.output,
                            },
                            tapInternalKey: Buffer.from(wallet.publicKey, "hex").subarray(1, 33),
                        });
                        realPsbt.addOutput({
                            address: lastUser.paymentAddress,
                            value: utxos[0].value - fee,
                        });

                        realPsbt.setMaximumFeeRate(100000);

                        let signedPsbt = wallet.signPsbt(realPsbt, wallet.ecPair);

                        await pushBTCpmt(signedPsbt.extractTransaction(true).toHex(), networkType);
                    }
                }
                updatedAuction.users.unshift({
                    userAddress: taprootAddress,
                    paymentAddress: paymentAddress,
                    price: price,
                    time: Date.now(),
                    txid: txid
                })
                updatedAuction.currentPrice = price;

                await Auction.findOneAndUpdate({ _id: auctions[auctions.length - 1]._id }, { $set: updatedAuction })

                auctions = await Auction.find();

                return res.status(200).send({ updatedAuction: auctions[auctions.length - 1] })
            }

        } catch (error: any) {
            console.log(error.message);
            return res.status(500).send({ error });
        }
    }
);

export default NewBidRoute;