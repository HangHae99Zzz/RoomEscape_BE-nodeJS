require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());
app.set("port", process.env.PORT || 3000);

module.exports = app;