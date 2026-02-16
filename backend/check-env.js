require("dotenv").config();
console.log("JWT_SECRET?", !!process.env.JWT_SECRET);
console.log("SESSION_LIMIT=", process.env.SESSION_LIMIT);
console.log("JWT_EXPIRES_IN=", process.env.JWT_EXPIRES_IN);
