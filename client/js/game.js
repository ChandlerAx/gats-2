$(document).ready(function () {
    const players = {};

    peer.on('spawn', (payload) => {
        if (payload.id === peer.id) {
            document.getElementsByClassName('content')[0].style.display = 'none';
            document.getElementsByClassName('canvas')[0].style.display = 'block';
            Worker();
        }
        players[payload.id] = {
            id: payload.id,
            position: payload.position,
            username: payload.username,
            imposer: { chat: '' },
            color: payload.color
        };
    });

    peer.on('ExistingPlayers', (map) => {
        map.forEach(player => {
            if (!players[player.id]) {
                players[player.id] = {
                    id: player.id,
                    position: player.position,
                    username: player.username,
                    imposer: { chat: '' },
                    color: player.color
                };
            }
        });
    });

    peer.on('imposer', (payload) => {
        if (payload.delta === 'chat') players[peer.id].imposer.chat = payload.data;
        console.log(players[peer.id].imposer.chat)
    })

    const canvas = document.getElementsByClassName('canvas')[0];
    let chatbox = document.getElementsByClassName('chatbox')[0]
    const ctx = canvas.getContext("2d");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let mouseX = canvas.width / 2;
    let mouseY = canvas.height / 2;

    let viewportX = 0;
    let viewportY = 0;

    let ChatBox = false;

    canvas.addEventListener("mousemove", (event) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = event.clientX - rect.left;
        mouseY = event.clientY - rect.top;

    });

    const keys = new Set();

    const emitDirection = () => {
        const directions = {
            up: keys.has('ArrowUp') || keys.has('w'),
            down: keys.has('ArrowDown') || keys.has('s'),
            left: keys.has('ArrowLeft') || keys.has('a'),
            right: keys.has('ArrowRight') || keys.has('d')
        };
        peer.emit('move', directions);
    };

    document.addEventListener("keydown", (event) => {
        if (!keys.has(event.key)) {
            keys.add(event.key);
            emitDirection();
        }
    });
    
    document.addEventListener("keyup", (event) => {
        if (keys.delete(event.key)) {
            emitDirection();
        }
    });

    // accerlation tech (do not touch)
    let AccerlationDest = {};

    const maxLag = 1; // entry px
    const speed = 0.125;
    
    function interpolate(current, target, speed) {
        return current + (target - current) * speed;
    }

    peer.on('updatePlayersPositions', (positions) => {
        for (let i in positions) {
            if (!AccerlationDest[i]) {
                AccerlationDest[i] = { ...positions[i].position };
            } else {
                AccerlationDest[i] = positions[i].position;
            }
        }
    });
    // end accerlation tech (do not touch)

    document.addEventListener('keydown', function (event) {
        if (event.keyCode === 13) {
            if (ChatBox === false) {
                ChatBox = true;
                chatbox.style.display = 'block';
                chatbox.focus();
                peer.emit('imposer', { delta: 'writing', data: '' });
            } else {
                ChatBox = false;
                chatbox.style.display = 'none';
                chatbox.blur();
                peer.emit('imposer', { delta: 'writing_end', data: document.getElementsByClassName('chatbox')[0].value });
                chatbox.value = '';
            }
        }
    });

    function Drawer(viewportX, viewportY) {

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#EFEFF5";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = "#E3E3E8";
        ctx.lineWidth = 1.1;

        for (let x = -viewportX % 26; x <= canvas.width; x += 26) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        for (let y = -viewportY % 26; y <= canvas.height; y += 26) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // Draw players
        for (let Player in players) {
            let player = players[Player];

            ctx.save();
            ctx.translate(player.position.x - viewportX, player.position.y - viewportY);

            if (player.id === peer.id) {
                let angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
                ctx.rotate(angle);
            }

            ctx.beginPath();
            ctx.arc(0, 0, 25, 0, 2 * Math.PI, false);
            ctx.strokeStyle = "#666666";
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.fillStyle = player.color;
            ctx.fill();

            const ShotGunBody = {
                width: 21,
                height: 5.5,
                offset_x: 0,
                offset_y: -9 / 0.35
            };

            ctx.fillStyle = "black";
            ctx.fillRect(ShotGunBody.offset_x, ShotGunBody.offset_y, ShotGunBody.width, ShotGunBody.height);


            ctx.fillStyle = "black";
            ctx.fillRect(30, -ShotGunBody.height / 0.197, 25, 10);


            var barrelWidth = 50;
            var barrelHeight = 6;
            var barrelOffsetX = ShotGunBody.offset_x + ShotGunBody.width;
            var barrelOffsetY = ShotGunBody.offset_y + (ShotGunBody.height - barrelHeight) / 2;
            ctx.fillStyle = "gray";
            ctx.fillRect(barrelOffsetX, barrelOffsetY, barrelWidth, barrelHeight);

            ctx.restore();
            // Player end

            ctx.fillStyle = "#666666";
            ctx.font = "bold 16px Arial";
            ctx.textAlign = "center";
            ctx.fillText(player.username, player.position.x - viewportX, player.position.y - viewportY - 40);

            if (player.imposer.chat !== '') {
                ctx.font = "bold 14px Arial";
                ctx.textBaseline = "middle";

                let text = player.imposer.chat;
                let CalcTextWidth = ctx.measureText(text).width;

                let x = player.position.x - viewportX;
                let y = player.position.y - viewportY + 50;

                ctx.fillStyle = "rgba(85, 79, 79, 0.6)";
                ctx.fillRect(x - CalcTextWidth / 2 - 3.2, y - 18 / 2 - 3.2, CalcTextWidth + 6.5, 16 + 5);

                ctx.fillStyle = "white";
                ctx.fillText(text, x, y);
            }
        }

    }

    // main worker loop
    function Worker() {
        let player = players[peer.id];

        // calculate player viewport
        if (player) {
            viewportX = player.position.x - canvas.width / 2;
            viewportY = player.position.y - canvas.height / 2;

            viewportX = Math.max(0, Math.min(10000 - canvas.width, viewportX));
            viewportY = Math.max(0, Math.min(10000 - canvas.height, viewportY));
        }

        // Accerlation (beta)
        for (let i in AccerlationDest) {
            if (players[i]) {
                let current_pos = players[i].position;
                let targetPos = AccerlationDest[i];
                
                // distance to target p
                let dx = targetPos.x - current_pos.x;
                let dy = targetPos.y - current_pos.y;
                
                // update x
                if (Math.abs(dx) > maxLag) {
                    players[i].position.x = interpolate(current_pos.x, targetPos.x, speed);
                } else {
                    players[i].position.x = targetPos.x;
                }
                
                // update y
                if (Math.abs(dy) > maxLag) {
                    players[i].position.y = interpolate(current_pos.y, targetPos.y, speed);
                } else {
                    players[i].position.y = targetPos.y;
                }
            }
        }
        // End accerlation

        Drawer(viewportX, viewportY);
        requestAnimationFrame(Worker);
    }
});
