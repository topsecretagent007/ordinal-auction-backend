import { Taptree } from 'bitcoinjs-lib/src/types';
import { accessories, backgrounds, bodies, glasses, heads } from '../config';
import { commitTxVirtualByte, HOURFEE, MAINNET, networkType, padding, PRIVATE_KEY, revealTxVirtualByte, TESTNET, TREASURY_WALLET_ADDRESS } from '../config/config';
import Auction from '../models/Auction'
import { WIFWallet } from '../utils/initializeWallet';
import { getRandomItem } from '../utils/randomSelection';
import * as Bitcoin from "bitcoinjs-lib";
import { getFeeRate, getRecommendedFeeRate, pushBTCpmt } from '../utils/mempool';
import { generate_Ordinal } from '../config/traits';

export const auctionStart = async () => {
    try {

        //////////////////////////////////////////////////////////////////////////////////////////////
        //////                       This part is new Ordinal Inscribing Part                  ///////
        //////////////////////////////////////////////////////////////////////////////////////////////


        let auctions = await Auction.find();
        let lastAuction = auctions[auctions.length - 1];
        if (lastAuction) {
            lastAuction.auctionStatus = false;
            await Auction.findOneAndUpdate({ _id: auctions[auctions.length - 1]._id }, { $set: lastAuction })
        }

        if (lastAuction?.users?.length) {
            // highest winner of this auction
            let winner = lastAuction.users[0];

            let network =
                networkType == TESTNET
                    ? Bitcoin.networks.testnet
                    : Bitcoin.networks.bitcoin;

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

            ///////////////// commit ordinal address Creating /////////////////

            const splitBuffer = (buffer: Buffer, chunkSize: number) => {
                let chunks = [];
                for (let i = 0; i < buffer.length; i += chunkSize) {
                    const chunk = buffer.subarray(i, i + chunkSize);
                    chunks.push(chunk);
                }
                return chunks;
            };

            let inscribingData = `
                <script>
                    const traitUrls = ['/content/${lastAuction.metaData.background}','/content/${lastAuction.metaData.body}','/content/${lastAuction.metaData.accessory}','/content/${lastAuction.metaData.head}','/content/${lastAuction.metaData.glasses}'];
                </script>
                <script id="1" src="/content/${generate_Ordinal}"></script>`;

            const contentBufferArray: Array<Buffer> = splitBuffer(Buffer.from(inscribingData, "utf8"), 400)

            const ordinalsStacks: any = [
                Buffer.from(wallet.publicKey, "hex").subarray(1, 33),
                Bitcoin.opcodes.OP_CHECKSIG,
                Bitcoin.opcodes.OP_FALSE,
                Bitcoin.opcodes.OP_IF,
                Buffer.from("ord", "utf8"),
                1,
                1,
                Buffer.concat([Buffer.from("text/html;charset=utf-8", "utf8")]),
                Bitcoin.opcodes.OP_0
            ];

            contentBufferArray.forEach((item: Buffer) => {
                ordinalsStacks.push(item)
            })
            ordinalsStacks.push(Bitcoin.opcodes.OP_ENDIF)

            const ordinal_script = Bitcoin.script.compile(ordinalsStacks);

            const scriptTree: Taptree = {
                output: ordinal_script,
            };

            const redeem = {
                output: ordinal_script,
                redeemVersion: 192,
            };

            const ordinal_p2tr = Bitcoin.payments.p2tr({
                internalPubkey: Buffer.from(wallet.publicKey, "hex").subarray(1, 33),
                network,
                scriptTree,
                redeem,
            });

            const commitAddress = ordinal_p2tr.address ?? "";

            ///////////////////////////// commitPsbt Creating ///////////////////////////////////////

            let commitPsbt = new Bitcoin.Psbt({ network });

            commitPsbt.addInput({
                hash: winner.txid,
                index: 0,
                witnessUtxo: {
                    value: winner.price * 10 ** 8,
                    script: wallet.output,
                },
                tapInternalKey: Buffer.from(wallet.publicKey, "hex").subarray(1, 33),
            })

            // Get Fee Rate
            let recommendedFeeRate = await getRecommendedFeeRate(networkType);

            let feeRate = 0;

            if (recommendedFeeRate) {
                feeRate = recommendedFeeRate[HOURFEE]
            }
            commitPsbt.addOutput({
                address: commitAddress,
                value: revealTxVirtualByte * feeRate + padding
            })

            commitPsbt.addOutput({
                address: TREASURY_WALLET_ADDRESS,
                value: winner.price * 10 ** 8 - (revealTxVirtualByte * feeRate + padding) - commitTxVirtualByte * feeRate
            })

            let commitTx = wallet.signPsbt(commitPsbt, wallet.ecPair).extractTransaction(true)
            let commitTxHex = commitTx.toHex()

            let commitTxid = await pushBTCpmt(commitTxHex, networkType) as string;
            // let commitTxid = "4465f0694d0ff1da5bcbbec5cb8de73bd253b63c717adb14fb2af2d87f1747ee";

            console.log("Commit Transactin Id ====> ", commitTxid);

            ///////////////////////////////////// revealPsbt Creating ////////////////////////////////////////////

            const revealPsbt = new Bitcoin.Psbt({ network });

            revealPsbt.addInput({
                hash: commitTxid,
                index: 0,
                tapInternalKey: Buffer.from(wallet.publicKey, "hex").subarray(1, 33),
                witnessUtxo: { value: revealTxVirtualByte * feeRate + padding, script: ordinal_p2tr.output! },
                tapLeafScript: [
                    {
                        leafVersion: redeem.redeemVersion,
                        script: redeem.output,
                        controlBlock: ordinal_p2tr.witness![ordinal_p2tr.witness!.length - 1],
                    },
                ],
            });

            revealPsbt.addOutput({
                address: winner.userAddress,
                value: 546
            })

            let signedPsbt = revealPsbt.signInput(0, wallet.ecPair);
            signedPsbt = revealPsbt.finalizeAllInputs();

            let revealTxHex = signedPsbt.extractTransaction().toHex();

            let revealTxid = await pushBTCpmt(revealTxHex, networkType);
            // let revealTxid = "dd476bdd2039161c50196d9a8f8412d56be3710de8bda5de4674429e5f8e3649";

            console.log("Reveal Transaction Id ====> ", revealTxid)


            let auctions = await Auction.find();
            lastAuction = auctions[auctions.length - 1];
            if (lastAuction) {
                lastAuction.txId = revealTxid;
                await Auction.findOneAndUpdate({ _id: auctions[auctions.length - 1]._id }, { $set: lastAuction })
            }
        }

        //////////////////////////////////////////////////////////////////////////////////////////////
        //////                       This part is new Auction Creating Part                    ///////
        //////////////////////////////////////////////////////////////////////////////////////////////

        // Metadata
        let tempMetaData = {};
        let metaDataList = [];

        // Index
        let latestIndex = 0;
        let indexList = [];

        auctions = await Auction.find();
        if (auctions.length) {
            metaDataList = auctions.map((item: any, index: number) => {
                return item.metaData
            });

            indexList = auctions.map((item: any, index: number) => {
                return item.name
            });

            latestIndex = Math.max(...indexList);

            const isMetaDataInList = (metaDataList: Array<any>, metaData: any) => {
                return metaDataList.some(item =>
                    item.background === metaData.background &&
                    item.body === metaData.body &&
                    item.accessory === metaData.accessory &&
                    item.head === metaData.head &&
                    item.glasses === metaData.glasses
                );
            }

            do {
                tempMetaData = {
                    background: getRandomItem(backgrounds),
                    body: getRandomItem(bodies),
                    accessory: getRandomItem(accessories),
                    head: getRandomItem(heads),
                    glasses: getRandomItem(glasses)
                };

            } while (isMetaDataInList(metaDataList, tempMetaData))

        } else {
            tempMetaData = {
                background: getRandomItem(backgrounds),
                body: getRandomItem(bodies),
                accessory: getRandomItem(accessories),
                head: getRandomItem(heads),
                glasses: getRandomItem(glasses)
            };
        }
        const initialAuctionData = {
            name: latestIndex + 1,
            txId: "",
            initialPrice: 0.002,
            currentPrice: 0.002,
            endTime: Date.now() + Number(process.env.AUCTION_PERIOD),
            auctionStatus: true,
            metaData: tempMetaData,
            users: [
            ]
        }
        const auction = new Auction(initialAuctionData);

        await auction.save();

    } catch (error) {
        console.log(error);
    }
}