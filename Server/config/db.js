const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Cleanup legacy unique index on phone that breaks signups with empty phone.
    try {
      const indexes = await conn.connection.db.collection('users').indexes();
      const hasPhoneIndex = indexes.some((idx) => idx.name === 'phone_1');
      if (hasPhoneIndex) {
        await conn.connection.db.collection('users').dropIndex('phone_1');
        console.log('Dropped legacy users.phone_1 index');
      }
    } catch (indexErr) {
      console.log(`Index cleanup skipped: ${indexErr.message}`);
    }

    try {
      const bookingIndexes = await conn.connection.db.collection('bookings').indexes();
      const legacyBookingIndexes = ['rider_1_match_1', 'match_1_rider_1'];
      for (const idxName of legacyBookingIndexes) {
        if (bookingIndexes.some((idx) => idx.name === idxName)) {
          await conn.connection.db.collection('bookings').dropIndex(idxName);
          console.log(`Dropped legacy bookings.${idxName} index`);
        }
      }
    } catch (indexErr) {
      console.log(`Booking index cleanup skipped: ${indexErr.message}`);
    }

    return conn;
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
