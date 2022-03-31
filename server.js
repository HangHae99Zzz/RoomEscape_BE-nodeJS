const app = require("./app");
const https = require("https")
const fs = require("fs");

var privateKey = fs.readFileSync("/etc/letsencrypt/live/roomescape57.shop/privkey.pem")
var certificate = fs.readFileSync("/etc/letsencrypt/live/roomescape57.shop/cert.pem")
var ca = fs.readFileSync("/etc/letsencrypt/live/roomescape57.shop/chain.pem")
const credentials = { key: privateKey, cert: certificate, ca: ca }

const config = require('./config/config.json');
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host : config.development.host,
  user : config.development.username,
  password : config.development.password,
  database : config.development.database
});

const server = https.createServer(credentials, app).listen(3000)

const io = require("socket.io")(server, {
  cors: {
    origin: ["http://localhost:3000", "https://zzz-escape.netlify.app"],
    credentials: true,
  },
});

let users = {};
let socketToRoom = {};
const maximum = process.env.MAXIMUM || 4;

io.on('connection', socket => {
  socket.on('join_room', data => {
      if (users[data.room]) {
          const length = users[data.room].length;
          if (length === maximum) {
              socket.to(socket.id).emit('room_full');
              return;
          }
          users[data.room].push({id: socket.id, email: data.email});
      } else {
          users[data.room] = [{id: socket.id, email: data.email}];
      }
      socketToRoom[socket.id] = data.room;

      socket.join(data.room);
      console.log(`[${socketToRoom[socket.id]}]: ${socket.id} enter`);

      const usersInThisRoom = users[data.room].filter(user => user.id !== socket.id);

      console.log(usersInThisRoom);

      io.sockets.to(socket.id).emit('all_users', usersInThisRoom);
  });

    socket.on('offer', data => {
        socket.to(data.offerReceiveID).emit('getOffer', {sdp: data.sdp, offerSendID: data.offerSendID, offerSendEmail: data.offerSendEmail});
    });

    socket.on('answer', data => {
        socket.to(data.answerReceiveID).emit('getAnswer', {sdp: data.sdp, answerSendID: data.answerSendID});
    });

    socket.on('candidate', data => {
        socket.to(data.candidateReceiveID).emit('getCandidate', {candidate: data.candidate, candidateSendID: data.candidateSendID});
    })

    socket.on('loading', () => {
        console.log('loading 시작');
        const roomID = socketToRoom[socket.id];
        io.to(roomID).emit('loadingComplete', 'loading complete');
    })

    socket.on('count', data => {
        const roomID = socketToRoom[socket.id];
        console.log(roomID, '에서 문제를 맞췄습니다!!')
        io.to(roomID).emit('countPlus', data);
    })

    socket.on('chance', () => {
        const roomID = socketToRoom[socket.id];
        console.log(roomID, '에서 chance를 사용했습니다!!')
        io.to(roomID).emit('chanceMinus', 'countMinus!!!!');
    })

    socket.on('disconnect', () => {
        console.log(`[${socketToRoom[socket.id]}]: ${socket.id} exit`);
        const roomID = socketToRoom[socket.id];
        let room = users[roomID];
        if (room) {
            room = room.filter(user => user.id !== socket.id);
            users[roomID] = room;
            // 방에 혼자 있을 때
            if (room.length === 0) {
                console.log('마지막 유저가 나갑니다.')
                delete users[roomID];
                connection.connect(function(err) {
                    if (err) {
                        throw err;
                    } else {
                        connection.query(`DELETE FROM user WHERE room_id = ${roomID}`, function(err, rows, fields) {
                            console.log(`delete user in ${roomID} success`);
                        })
                        connection.query(`DELETE FROM clue WHERE room_id = ${roomID}`, function(err, rows, fields) {
                            console.log(`delete clue in ${roomID} success`);
                        })
                        connection.query(`UPDATE room SET state = 1 WHERE room_id = ${roomID}`, function(err, rows, fields) {
                            console.log(`update ${roomID} success`);
                        })
                    }
                });
            // 방에 여러명 있을 때
            } else {
                console.log('유저 중 한명이 나갑니다.')
                connection.connect(function(err) {
                    if (err) {
                        throw err;
                    } else {
                        connection.query(`SELECT created_user FROM room WHERE room_id = ${roomID}`,
                        function(err, rows, fields) {
                            connection.query(`DELETE FROM user WHERE user_id = '${socket.id}'`, function(err, rows, fields) {
                                console.log(`delete ${socket.id} success`);
                            });
                            const createdUser = rows
                            console.log(createdUser)
                            // undefined면 return
                            if (!createdUser[0]?.created_user) return;
                            if (socket.id === createdUser[0].created_user) {
                                console.log('방장 나갔을 때')
                                connection.query(`Select user_id From user WHERE room_id = ${roomID}`,
                                function(err, rows, fields) {
                                    console.log('userList: ', rows)
                                    // undefined면 return
                                    if (!rows[0]?.user_id) return;
                                    let newCreatedUser = rows[0].user_id;
                                    console.log('새로운 방장 : ', newCreatedUser);
                                    io.to(roomID).emit('changedUser', {createdUser: newCreatedUser});
                                    connection.query(`UPDATE room SET created_user = '${newCreatedUser}' WHERE room_id = ${roomID}`,
                                    function(err, rows, fields) {
                                    console.log(`createdUser in ${roomID} change success`);
                                    });
                                });
                                
                            }
                        })
                    }
                })
            }
        }
        socket.to(roomID).emit('user_exit', {id: socket.id});
        console.log('현재 연결된 모든 user: ', users);    
    });
  
});