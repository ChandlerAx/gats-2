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
const limiter = rateLimit({ windowMs: 5000, max: 15, message: 'Too many requests.' });
const dotenv = require('dotenv').config({ path: './config.env' });

app.use(limiter);
app.use(express.static(path.join(__dirname, 'client')));

const server_caching = {
    last_challenge_token: "",
};

const game_caching = {
    players: {},
    leaderboard: {},
    connections: {}
};

const colors = ['red', 'lightblue', 'lightgreen'];

setInterval(() => {
    fs.readFile(path.join(__dirname, 'leaderboard.txt'), 'utf8', (err, data) => {
        game_caching.leaderboard = JSON.parse(data);
    });
}, 3000);

io.on('connection', (socket) => {
    if (Object.keys(game_caching.connections).length > process.env.max_players - 1) socket.disconnect(0);

    game_caching.connections[socket.id] = {
        id: socket.id,
        challenge: { token_verified: false, token: '' }
    };

    socket.on('challenge_token', (data) => {
        if (game_caching.connections[socket.id] && data == server_caching.last_challenge_token) {
            if (game_caching.connections[socket.id]) game_caching.connections[socket.id].challenge.token_verified = true;
            game_caching.connections[socket.id].challenge.token = data;
            socket.emit('verified');

            const leaderboard = Object.values(game_caching.leaderboard);
            socket.emit('leaderboard_stats', leaderboard.slice(0, process.env.leaderboard_entries));

            UpdateChallengeToken();
        } else {
            socket.disconnect(0);
        }
    });

    // show all players to the new player
    socket.emit('ExistingPlayers', Object.values(game_caching.players).map(player => ({
        id: player.id,
        position: player.position,
        username: player.username,
        color: player.color
    })));

    socket.on('play', (payload) => {
        if (game_caching.connections[socket.id] && payload.token === game_caching.connections[socket.id].challenge.token) {
            if (payload.username === '') payload.username = 'Unnamed';

            if (payload.color === 'random' || !colors.includes(payload.color)) {
                payload.color = colors[Math.floor(Math.random() * colors.length)];
            }

            game_caching.players[socket.id] = {
                id: socket.id,
                health: 100,
                position: { x: 5000, y: 5000 },
                username: SanitizeInput(payload.username.slice(0, 20)),
                color: payload.color,
                imposer: { chat: '', WriteTimeout: 0 },
                score: 0,
                directions: { up: false, down: false, left: false, right: false }
            };
    
            io.emit('spawn', game_caching.players[socket.id]);
        }
    });

    socket.on('move', (directions) => {
        if (game_caching.players[socket.id]) {
            game_caching.players[socket.id].directions = directions;
        }
    });

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
            if (!game_caching.players[socket.id] || !game_caching.players[socket.id].username) {
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
                    Next();
                    return;
                }
                Next();
            });
        });

        function Next() {
            // force delete player objects
            if (game_caching.connections[socket.id]) delete game_caching.connections[socket.id];
            if (game_caching.players[socket.id]) delete game_caching.players[socket.id];
        }
    });
});

// patch for xss
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

const speed = Number(process.env.player_speed_default);
const tick_rate = Number(process.env.tick_rate);

setInterval(() => {
    const CacheObject = {};

    Object.values(game_caching.players).forEach(player => {
        if (player.directions.up) player.position.y -= speed;
        if (player.directions.down) player.position.y += speed;
        if (player.directions.left) player.position.x -= speed;
        if (player.directions.right) player.position.x += speed;

        CacheObject[player.id] = {
            position: player.position
        };
    });

    io.emit('updatePlayersPositions', CacheObject);
}, 1000 / tick_rate);


server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
    UpdateChallengeToken();
});
