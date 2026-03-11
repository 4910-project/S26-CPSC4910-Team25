const express = require("express");
const cors = require("cors");
require("dotenv").config();

const catalogueRoutes = require("./routes/catalogue");

const app = express();
const PORT = process.env.PORT || 8002;


app.use(cors(
    {
        origin: process.env.FRONTEND_ORIGIN || "http://localhost:3000"
    })
);

app.use(express.json());

app.get("/health",(req, res) => {
            res.json({
                status: "ok",
                service: "catalogue"
        });
    }
);


app.use("/api/catalogue",catalogueRoutes);

app.listen(PORT,() => {console.log(`Catalogue backend running on port ${PORT}`);});