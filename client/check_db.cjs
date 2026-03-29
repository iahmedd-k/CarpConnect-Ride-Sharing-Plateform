const mongoose = require('mongoose');
const RideOffer = require('./carpoolbe/src/models/RideOffer');
const Match = require('./carpoolbe/src/models/Match');
const RideRequest = require('./carpoolbe/src/models/RideRequest');
require('dotenv').config({ path: './carpoolbe/.env' });

async function checkDB() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const offers = await RideOffer.find({ status: 'active' });
    console.log(`\nActive Offers found: ${offers.length}`);
    offers.forEach(o => {
        console.log(`- Offer ID: ${o._id}, Driver: ${o.driver}, Seats: ${o.seatsAvailable}/${o.seatsTotal}, Price: ${o.pricePerSeat}, Time: ${o.departureTime}`);
    });

    const requests = await RideRequest.find().sort('-createdAt').limit(3);
    console.log(`\nRecent Requests:`);
    requests.forEach(r => {
        console.log(`- Req ID: ${r._id}, Rider: ${r.rider}, Origin: ${r.origin.address}`);
    });

    if (requests.length > 0) {
        const matches = await Match.find({ request: requests[0]._id }).populate('offer');
        console.log(`\nMatches for latest request (${requests[0]._id}): ${matches.length}`);
        matches.forEach(m => {
            console.log(`- Match ID: ${m._id}, Score: ${m.score}, Offer IDs: ${m.offer?._id}`);
            if (m.offer) {
                console.log(`  Offer Data: Seats=${m.offer.seatsAvailable}, Price=${m.offer.pricePerSeat}, Time=${m.offer.departureTime}`);
            } else {
                console.log(`  OFFER NOT FOUND OR NOT POPULATED`);
            }
        });
    }

    await mongoose.disconnect();
}

checkDB().catch(console.error);
