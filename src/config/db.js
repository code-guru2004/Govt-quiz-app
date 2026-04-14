const mongoose = require("mongoose");
const dns = require("dns");


if (process.env.NODE_ENV !== "production") {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
}
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);

    //console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error("DB Error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;