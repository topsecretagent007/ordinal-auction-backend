
const mongoose = require('mongoose');

// Define the Mongoose schema
const auctionSchema = new mongoose.Schema({
    name: { type: Number },
    txId: { type: String },
    initialPrice: { type: Number },
    currentPrice: { type: Number },
    endTime: { type: Number, required: true },
    auctionStatus: { type: Boolean, required: true },
    metaData: {
        background: { type: String },
        body: { type: String },
        accessory: { type: String },
        head: { type: String },
        glasses: { type: String }
    },
    users: [{
        userAddress: { type: String },
        paymentAddress: { type: String },
        price: { type: Number },
        time: { type: Number },
        txid: { type: String }
    }]
});

// Create the model from the schema
const Auction = mongoose.model('Auction', auctionSchema);

export default Auction;