import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import path from "path";
import http from "http";

const cron = require('node-cron');

// Configuration Settings from config file, .env file
import { PORT, connectMongoDB } from "./config";
import { auctionStart } from "./controller/auctionStart";
import NewBidRoute from "./routes/newBid.route";
import AuctionRoute from "./routes/auction.route";

// Load environment variables from .env file
dotenv.config();


// Connect to the MongoDB database
connectMongoDB();

// Create an instance of the Express application
const app = express();

// Set up Cross-Origin Resource Sharing (CORS) options
app.use(cors());

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, "./public")));

// Parse incoming JSON requests using body-parser
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

const server = http.createServer(app);

// Function to be executed at 00:00 UTC
const runDailyAuction = () => {
  console.log("Daily task executed at **:00 UTC");
  // Auction End
  // Auction Start
  auctionStart()
};

// Schedule the task to run every day at 00:00 UTC
cron.schedule('0 * * * *', () => {
  runDailyAuction();
}, {
  timezone: "UTC" // Ensure the timezone is set to UTC
});


// Define routes for different API endpoints
app.use("/api/bid", NewBidRoute);
app.use("/api/auctions", AuctionRoute);


// Define a route to check if the backend server is running
app.get("/", async (req: any, res: any) => {
  runDailyAuction()
  res.send("Backend Server is Running now!");
});


// Start the Express server to listen on the specified port
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  runDailyAuction();
});

export default app;
