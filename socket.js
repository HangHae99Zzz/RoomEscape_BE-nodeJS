const app = require("./app");
const https = require("https")
const fs = require("fs")

var privateKey = fs.readFileSync("/etc/letsencrypt/live/banwonjae.shop/privkey.pem")
var certificate = fs.readFileSync("/etc/letsencrypt/live/banwonjae.shop/cert.pem")
var ca = fs.readFileSync("/etc/letsencrypt/live/banwonjae.shop/chain.pem")
const credentials = { key: privateKey, cert: certificate, ca: ca }

// const server = require("http").createServer(app);

// https 실제 배포 시 연결
const server = https.createServer(credentials, app).listen(3000)
https.createServer(credentials, app).listen(3000)
// https 설정 시
// const io = require("socket.io")(https, {
const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.info(`Client connected [id=${socket.id}]`);
  // when socket disconnects, remove it from the list:
  socket.on("disconnect", () => {
      console.info(`Client gone [id=${socket.id}]`);
  });
  socket.on("join_room", (roomName) => {
    socket.join(roomName);
    socket.to(roomName).emit("welcome");
  });
  //signallig
  socket.on("offer", (offer, roomName) => {
    socket.to(roomName).emit("offer", offer);
  });
  socket.on("answer", (answer, roomName) => {
    socket.to(roomName).emit("answer", answer);
  });
  socket.on("ice", (ice, roomName) => {
    socket.to(roomName).emit("ice", ice);
  });
});

// https 연결 시
module.exports = { server, https };
// module.exports = { server };