require("dotenv").config();
const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();
app.use(cors());

app.set("port", process.env.PORT || 3000);

//Request 로그 남기는 미들웨어 
const requestMiddleware = (req, res, next) => {
   console.log( "Request URL:", req.originalUrl, " - ", 
   new Date(+new Date() + 3240 * 10000) 
   .toISOString() 
   .replace("T", " ") 
   .replace(/\..*/, "") 
   ); 
   next(); 
  };

// request log
app.use(requestMiddleware); 

module.exports = app;