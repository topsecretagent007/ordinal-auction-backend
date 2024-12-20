import { Request, Response, Router } from "express";
import { check, validationResult } from "express-validator";
import * as Bitcoin from "bitcoinjs-lib";
import ecc from "@bitcoinerlab/secp256k1";
import Auction from "../models/Auction";
import { auctionStart } from "../controller/auctionStart";
import { networkType, TREASURY_WALLET_ADDRESS } from "../config/config";
import { getPrice } from "../utils/mempool";

Bitcoin.initEccLib(ecc);

//create a new instance of the express router
const AuctionRoute = Router();

// @route    get api/auctions
// @desc     auction request
// @access   Private

AuctionRoute.post(
    "/",
    check("time", "Time is required.").notEmpty(),
    async (req: Request, res: Response) => {
        try {
            // Validate Form Inputs
            const errors = validationResult(req);

            if (!errors.isEmpty()) {
                return res.status(500).json({ error: errors.array() });
            }

            const auctions = await Auction.find();

            // Find nearest item from Auction database
            let diffArray: any[] = [];
            let nearestIndex = -1;

            auctions.map((item: any, index: number) => {
                diffArray.push({
                    diffTime: item.endTime - req.body.time,
                    index: index
                })
            })
            if (diffArray.length) {
                let filteredArray = diffArray.filter((item: any, index: number) => item.diffTime > 0)

                if (filteredArray.length) {
                    let minimumItem = filteredArray.reduce((minItem, currentItem) => {
                        return currentItem.diffTime < minItem.diffTime ? currentItem : minItem;
                    });
                    nearestIndex = minimumItem.index;
                } else {
                    let minimumItem = diffArray.reduce((minItem, currentItem) => {
                        return currentItem.diffTime > minItem.diffTime ? currentItem : minItem;
                    });
                    nearestIndex = minimumItem.index;
                }
            } else {
                return res.status(500).send({
                    error: "There is no auction data."
                })
            }

            return res.status(200).send({
                data: auctions[nearestIndex]
            })

        } catch (error: any) {
            return res.status(500).send({ error });
        }
    }
);

// @route    get api/auctions/start
// @desc     auction start request
// @access   Private
AuctionRoute.get(
    "/start",
    async (req: Request, res: Response) => {
        auctionStart()
        return res.status(200).send({
            data: "Auction Started!"
        })
    }
)


// @route    get api/auctions/bitcoin-price
// @desc     bitcoin price request
// @access   public
AuctionRoute.get(
    "/bitcoin-price",
    async (req: Request, res: Response) => {
        let price = await getPrice(networkType) as string;

        return res.status(200).send({
            price: price
        })
    }
)
export default AuctionRoute;