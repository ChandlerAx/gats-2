const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const port = 80;
const server = http.createServer(app);
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const io = socketIo(server);
const limiter = rateLimit({ windowMs: 5000, max: 15, message: 'Too many requests.', });

app.use(limiter);
app.use(express.static(path.join(__dirname, 'client')));

const server_caching = {
    last_challenge_token: "",
}

const game_caching = {
    players: {},
    leaderboard: {}
}

setInterval(() => {
    fs.readFile(path.join(__dirname, 'leaderboard.txt'), 'utf8', (err, data) => {
        game_caching.leaderboard = JSON.parse(data);
    });
}, 3000);


io.on('connection', (socket) => {

    game_caching[socket.id] = {
        id: socket.id,
        challenge: { token_verified: false, token: '' }
    }

    socket.on('challenge_token', (data) => {
        if (game_caching[socket.id] && data == server_caching.last_challenge_token) {
            if (game_caching[socket.id]) game_caching[socket.id].challenge.token_verified = true;
            game_caching[socket.id].challenge.token = data;
            socket.emit('verified');

            const leaderboard = Object.values(game_caching.leaderboard);
            socket.emit('leaderboard_stats', leaderboard.slice(0, 200));

            UpdateChallengeToken();
        } else {
            socket.disconnect(0);
        }
    });


    socket.on('play', (payload) => {
        if (game_caching[socket.id] && payload.token === game_caching[socket.id].challenge.token) {
            if (payload.username === '') payload.username = 'Unnamed'
            game_caching.players[socket.id] = {
                id: socket.id,
                health: 100,
                position: { x: 5000, y: 5000 },
                username: SanitizeInput(payload.username.slice(0, 20)),
                color: payload.color,
                imposer: { chat: '', WriteTimeout: 0 },
                score: 0
            }
            io.emit('spawn', game_caching.players[socket.id])
        }
    })

    socket.on('imposer', (payload) => {
        const player = game_caching.players[socket.id]?.imposer;
        if (!player) return;

        if (payload.delta === 'writing' || payload.delta === 'writing_end') {
            if (payload.delta === 'writing') {
                if (player.chat !== '') return;
                player.chat = '...';
            } else if (payload.delta === 'writing_end') {
                player.chat = payload.data;
                clearTimeout(player.WriteTimeout);
                player.WriteTimeout = setTimeout(() => {
                    player.chat = '';
                    io.emit('imposer', { delta: 'chat', data: player.chat });
                }, 4000);
            }
            io.emit('imposer', { delta: 'chat', data: player.chat });
        }
    });


    socket.on('disconnect', () => {

        fs.readFile(path.join(__dirname, 'leaderboard.txt'), 'utf8', (err, data) => {
            if (!game_caching[socket.id] || !game_caching.players[socket.id] || !game_caching.players[socket.id].username) {
                return;
            }

            let leaderboard = [];

            if (data) {
                leaderboard = JSON.parse(data);
            }

            const username = game_caching.players[socket.id].username;
            const score = game_caching.players[socket.id].score;

            const ExistingUsr = leaderboard.findIndex(user => user.username === username);
            if (ExistingUsr !== -1) {
                if (score > leaderboard[ExistingUsr].score) {
                    leaderboard[ExistingUsr].score = score;
                } else {
                    return;
                }
            } else {
                leaderboard.push({ username, score });
            }
            fs.writeFile(path.join(__dirname, 'leaderboard.txt'), JSON.stringify(leaderboard, null, 4), (err) => {
                if (err) {
                    Next()
                    return;
                }
                Next()
            });
        });

        function Next() {
            if (game_caching[socket.id]) delete game_caching[socket.id];
            if (game_caching.players[socket.id]) delete game_caching.players[socket.id];
        }


    })

});

function SanitizeInput(input) {
    for (let tag of [
        '<script>',
        '</script>',
        '<img src=',
        'onerror=',
        '<',
        '@'
    ]) {
        while (input.indexOf(tag) !== -1) {
            input = input.replace(tag, '#');
        }
    }
    return input;
}

function UpdateChallengeToken() {
    const token = [...Array(20)].map(() => Math.random().toString(36)[2]).join('');
    fs.writeFileSync('./client/token/token.html', `${token}`);
    server_caching.last_challenge_token = `${token}`;
}


server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    UpdateChallengeToken();
});