const app = require("./app");
const https = require("https")
const fs = require("fs");

// https 적용을 위해 ec2의 인증서 경로 입력
var privateKey = fs.readFileSync("/etc/letsencrypt/live/roomescape57.shop/privkey.pem")
var certificate = fs.readFileSync("/etc/letsencrypt/live/roomescape57.shop/cert.pem")
var ca = fs.readFileSync("/etc/letsencrypt/live/roomescape57.shop/chain.pem")
const credentials = { key: privateKey, cert: certificate, ca: ca }

// mysql 연결
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

// socket 연결
io.on('connection', socket => {

  // 방 참여하기  
  socket.on('join_room', data => {
      // 방이 있다면
      if (users[data.room]) {
          const length = users[data.room].length;
          // 방에 인원이 다 차면 room_full 이벤트를 emit
          if (length === maximum) {
              socket.to(socket.id).emit('room_full');
              return;
          }
          // 방에 자리가 있으면 그 방 users에 해당 socket.id를 넣어줌
          users[data.room].push({id: socket.id});
      // 방이 없으면 새로 만들어서 그 방 users 해당 socket.id를 넣어줌    
      } else {
          users[data.room] = [{id: socket.id}];
      }
      // 해당 socket.id의 socketToRoom은 client에서 전달받은 roomId로 저장
      socketToRoom[socket.id] = data.room;

      // 해당 socket은 roomId에 참여시킴
      socket.join(data.room);
      console.log(`[${socketToRoom[socket.id]}]: ${socket.id} enter`);

      // 해당 방에 있는 users를 연결된 브라우저를 제외하고 usersInThisRoom에 저장
      const usersInThisRoom = users[data.room].filter(user => user.id !== socket.id);
      console.log(usersInThisRoom);

      io.sockets.to(socket.id).emit('all_users', usersInThisRoom);
  });

    // WebRTC를 위한 signalling server 역할
    socket.on('offer', data => {
        socket.to(data.offerReceiveID).emit('getOffer', {sdp: data.sdp, offerSendID: data.offerSendID});
    });
    // WebRTC를 위한 signalling server 역할
    socket.on('answer', data => {
        socket.to(data.answerReceiveID).emit('getAnswer', {sdp: data.sdp, answerSendID: data.answerSendID});
    });
    // WebRTC를 위한 signalling server 역할
    socket.on('candidate', data => {
        socket.to(data.candidateReceiveID).emit('getCandidate', {candidate: data.candidate, candidateSendID: data.candidateSendID});
    })

    // 게임 시작하기
    socket.on('loading', () => {
        const roomID = socketToRoom[socket.id];
        console.log(roomID, '에서 game loading을 시작했습니다!!');
        // 해당 방에 알려줌
        io.to(roomID).emit('loadingComplete', 'loading complete');
    })

    // 맞춘 문제 수 올리기
    socket.on('count', data => {
        const roomID = socketToRoom[socket.id];
        console.log(roomID, '에서 문제를 맞췄습니다!!')
        // 해당 방에 알려줌
        io.to(roomID).emit('countPlus', data);
    })

    // 찬스 사용하기
    socket.on('chance', () => {
        const roomID = socketToRoom[socket.id];
        console.log(roomID, '에서 chance를 사용했습니다!!')
        // 해당 방에 알려줌
        io.to(roomID).emit('chanceMinus', 'countMinus!!!!');
    })

    // 유저가 브라우저를 종료했을 때
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
                        // 해당 방 user 삭제
                        connection.query(`DELETE FROM user WHERE room_id = ${roomID}`, function(err, rows, fields) {
                            console.log(`delete user in ${roomID} success`);
                        })
                        // 해당 방 clue 삭제
                        connection.query(`DELETE FROM clue WHERE room_id = ${roomID}`, function(err, rows, fields) {
                            console.log(`delete clue in ${roomID} success`);
                        })
                        // 해당 방 state를 CLOSE(1)로 변경
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
                            // 방장이 나갔을 때
                            if (socket.id === createdUser[0].created_user) {
                                console.log('방장 나갔을 때')
                                // 해당 방의 user들을 다 찾아옴
                                connection.query(`Select user_id From user WHERE room_id = ${roomID}`,
                                function(err, rows, fields) {
                                    console.log('userList: ', rows)
                                    // undefined면 return
                                    if (!rows[0]?.user_id) return;
                                    // 해당 방 userList의 0번째를 새로운 방장으로 지정
                                    let newCreatedUser = rows[0].user_id;
                                    console.log('새로운 방장 : ', newCreatedUser);
                                    // 해당 방에 변경된 방장을 알려줌
                                    io.to(roomID).emit('changedUser', {createdUser: newCreatedUser});
                                    // 해당 방 created_user에 새로운 방장 정보 업데이트
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
        // 해당 방에 나간 유저 정보를 알려줌
        socket.to(roomID).emit('user_exit', {id: socket.id});
        console.log('현재 연결된 모든 user: ', users);    
    });
  
});