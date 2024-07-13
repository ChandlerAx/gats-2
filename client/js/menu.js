$(document).ready(function () {

    const Leaderboard = document.querySelector('.leaderboard-list');

    peer.on('leaderboard_stats', (payload) => {
        Leaderboard.innerHTML = '';
        payload.forEach((user, index) => {
            const itm = document.createElement('div');
            itm.classList.add('mb-2');
            itm.innerHTML = `<span class="font-medium">${index + 1}. ${user.username}</span> - ${user.score}`;
            Leaderboard.appendChild(itm);
        });
    })

    document.getElementsByClassName('play')[0].onclick = () => {
        peer.emit('play', {
            color: String(document.getElementById('color').value),
            username: String(document.getElementById('username').value),
            token: String(token),
        })
    }

});