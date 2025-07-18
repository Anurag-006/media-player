import dotenv from 'dotenv';
import connectDB from "./db/index.js";
// import express from "express"
import {app} from "./app.js"

dotenv.config({
    path: "./.env"
})


connectDB()
.then(() => {
    app.listen(process.env.PORT || 8000, () => {
        console.log(`⚙️  SERVER is running at PORT: ${process.env.PORT}`);
    })
})
.catch((err) => console.log("MONOGODB connection failed: ",err))